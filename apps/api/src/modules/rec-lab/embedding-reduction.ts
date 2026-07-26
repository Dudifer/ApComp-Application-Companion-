import { UMAP } from 'umap-js';
// @keckelt/tsne is a small, untyped-in-practice TS port of the original
// tsnejs — cast its surface to `any` below rather than fight whatever its
// actual .d.ts turns out to expose.
import { TSNE } from '@keckelt/tsne';

/**
 * Rec Lab 2's "embeddings plot" offers all three of the standard ways to
 * squash a 384-dim composite embedding down to something you can put on a
 * scatter chart. They all take the exact same input (an n x d array of
 * vectors, same order in/out) and are only ever computed together, so
 * they're bundled into one call rather than three separate ones.
 *
 *  - PCA:   linear, deterministic, zero extra dependencies (hand-rolled
 *           below). Good baseline, can undersell tight nonlinear clusters.
 *  - UMAP:  nonlinear, the standard tool for visualizing embeddings, much
 *           better cluster separation than PCA. Seeded RNG below so the
 *           layout is at least stable across repeated loads of the same data.
 *  - t-SNE: similar intent to UMAP, longer track record, but genuinely
 *           non-deterministic run to run (random initial layout) and more
 *           sensitive to the perplexity knob.
 */
export interface Reduced2D {
  pca: [number, number][];
  umap: [number, number][];
  tsne: [number, number][];
}

export function reduceAll(vectors: number[][]): Reduced2D {
  return {
    pca: pca2D(vectors),
    umap: umap2D(vectors),
    tsne: tsne2D(vectors),
  };
}

// ── PCA ──────────────────────────────────────────────────────────────────
//
// Hand-rolled via the "dual PCA" / Gram-matrix trick, which is the cheap
// direction when there are far fewer points than dimensions (~100 jobs vs
// 384-dim embeddings here): eigen-decomposing the n x n Gram matrix X X^T
// is much smaller than the usual d x d covariance matrix, and gives back
// the exact same PCA scores. If centered data X (n x d) has SVD
// X = U S V^T, then X X^T = U S^2 U^T — so the (eigenvector, eigenvalue)
// pairs of the Gram matrix are exactly (U, S^2), and the PCA scores X V
// work out to U * S = U * sqrt(eigenvalue). Deterministic because the
// power-iteration starting vector is seeded, not Math.random().

function pca2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  if (n === 0) return [];
  const d = vectors[0].length;

  const mean = new Array(d).fill(0);
  for (const v of vectors) for (let j = 0; j < d; j++) mean[j] += v[j] / n;
  const centered = vectors.map(v => v.map((x, j) => x - mean[j]));

  const gram: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < d; k++) s += centered[i][k] * centered[j][k];
      gram[i][j] = s;
      gram[j][i] = s;
    }
  }

  const { vectors: eigenvectors, values: eigenvalues } = topEigenpairs(gram, 2);
  const pc1 = eigenvectors[0];
  const pc2 = eigenvectors[1];
  const lambda1 = Math.sqrt(Math.max(eigenvalues[0] ?? 0, 0));
  const lambda2 = Math.sqrt(Math.max(eigenvalues[1] ?? 0, 0));

  return Array.from({ length: n }, (_, i) => [
    (pc1?.[i] ?? 0) * lambda1,
    (pc2?.[i] ?? 0) * lambda2,
  ] as [number, number]);
}

/** Simple deterministic LCG so the power-iteration starting vector — and therefore PCA's output — is identical on every call, unlike UMAP/t-SNE. */
function seededVector(n: number, seed: number): number[] {
  let s = seed;
  const next = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  return Array.from({ length: n }, () => next() - 0.5);
}

function topEigenpairs(matrix: number[][], count: number, iterations = 300): { vectors: number[][]; values: number[] } {
  const n = matrix.length;
  const deflated = matrix.map(row => [...row]);
  const vectors: number[][] = [];
  const values: number[] = [];

  for (let k = 0; k < count && k < n; k++) {
    let v = seededVector(n, 12345 + k * 7919);
    normalizeInPlace(v);

    for (let iter = 0; iter < iterations; iter++) {
      const next = matVec(deflated, v);
      const norm = Math.sqrt(next.reduce((s, x) => s + x * x, 0));
      if (norm < 1e-12) break;
      v = next.map(x => x / norm);
    }

    const Mv = matVec(deflated, v);
    const eigenvalue = dot(v, Mv);
    vectors.push(v);
    values.push(eigenvalue);

    // Deflate so the next power iteration converges on the next-largest
    // eigenpair instead of finding the same one again.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        deflated[i][j] -= eigenvalue * v[i] * v[j];
      }
    }
  }

  return { vectors, values };
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map(row => dot(row, v));
}

function dot(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function normalizeInPlace(v: number[]): void {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= norm;
}

// ── UMAP ─────────────────────────────────────────────────────────────────

/** Deterministic PRNG (mulberry32) so UMAP's stochastic layout is at least stable across repeated loads of the same embeddings, rather than reshuffling every page refresh. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function umap2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  if (n < 3) return vectors.map(() => [0, 0]);
  const nNeighbors = Math.max(2, Math.min(15, n - 1));
  const umap = new UMAP({ nComponents: 2, nNeighbors, random: mulberry32(42) });
  const embedding = umap.fit(vectors);
  return embedding.map(row => [row[0], row[1]] as [number, number]);
}

// ── t-SNE ────────────────────────────────────────────────────────────────

function tsne2D(vectors: number[][]): [number, number][] {
  const n = vectors.length;
  if (n < 3) return vectors.map(() => [0, 0]);
  // Perplexity has to stay well under n or the library errors out; keep it
  // in the commonly-recommended 5-30 range otherwise.
  const perplexity = Math.max(2, Math.min(30, Math.floor((n - 1) / 3)));
  const tsne: any = new (TSNE as any)({ dim: 2, perplexity, epsilon: 10 });
  tsne.initDataRaw(vectors);
  for (let i = 0; i < 500; i++) tsne.step();
  const solution: number[][] = tsne.getSolution();
  return solution.map(row => [row[0], row[1]] as [number, number]);
}
