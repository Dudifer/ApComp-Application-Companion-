import type { InteractionType, LikedJobMatch, SimilarityBreakdown } from '@apcomp/types';

/**
 * Pure, dependency-free ranking math for the Rec Lab. No Prisma, no
 * embedding model — just numbers in, numbers out, so this is unit-testable
 * without a database or the (slow, first-run) local embedding model.
 *
 * See scoring.spec.ts for the sanity checks this logic was validated
 * against before being wired into RecLabService.
 */

// ── Interaction weights ─────────────────────────────────────────────────────
// Positive: the user chose to engage with the job (in the recommendation
// feed or in search results). Negative: the user was shown the job and
// didn't engage, or actively pushed back on it. Tune these here — nothing
// else needs to change since historical events store the weight that was
// applied at the time (see JobInteraction.weight in the Prisma schema).
export const INTERACTION_WEIGHTS: Record<InteractionType, number> = {
  VIEWED: 0,
  CLICKED: 2,
  SAVED: 5,
  APPLIED: 8,
  MORE_LIKE_THIS: 6,
  IGNORED: -1,
  DISMISSED: -6,
  LESS_LIKE_THIS: -8,
};

export function weightFor(type: InteractionType): number {
  return INTERACTION_WEIGHTS[type];
}

/** "Positive" interaction types count a job as one of the user's liked jobs for similarity purposes. */
export const POSITIVE_INTERACTION_TYPES: InteractionType[] = ['SAVED', 'APPLIED', 'MORE_LIKE_THIS'];

const DECAY_HALF_LIFE_DAYS = 30;

export interface WeightedInteraction {
  weight: number;
  createdAt: string | Date;
}

/**
 * Sums interaction weights for a single job. With `decay: true`, older
 * interactions count for less (half-life 30 days) so a job dismissed a year
 * ago doesn't permanently suppress a re-recommendation forever.
 */
export function aggregateInteractionScore(
  interactions: WeightedInteraction[],
  opts: { decay?: boolean; now?: Date } = {},
): number {
  const now = opts.now ?? new Date();
  return interactions.reduce((sum, i) => {
    if (!opts.decay) return sum + i.weight;
    const ageDays = Math.max(0, (now.getTime() - new Date(i.createdAt).getTime()) / 86_400_000);
    const decayFactor = Math.pow(0.5, ageDays / DECAY_HALF_LIFE_DAYS);
    return sum + i.weight * decayFactor;
  }, 0);
}

// ── Vector similarity ────────────────────────────────────────────────────────

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a?.length || !b?.length || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** Cosine is in [-1, 1]; rescale to a 0-100 "percent match" for display. */
export function toPercent(cosine: number): number {
  const clamped = Math.max(-1, Math.min(1, cosine));
  return Math.round(((clamped + 1) / 2) * 100);
}

export interface FieldEmbeddings {
  title: number[];
  description: number[];
  skills: number[];
}

/** How much each field contributes to the blended "CV similarity" score. */
export const CV_SIMILARITY_WEIGHTS = { title: 0.35, description: 0.4, skills: 0.25 };

export function computeCvSimilarity(cv: FieldEmbeddings, job: FieldEmbeddings): SimilarityBreakdown {
  const title = toPercent(cosineSimilarity(cv.title, job.title));
  const description = toPercent(cosineSimilarity(cv.description, job.description));
  const skills = toPercent(cosineSimilarity(cv.skills, job.skills));
  const combined = Math.round(
    title * CV_SIMILARITY_WEIGHTS.title +
    description * CV_SIMILARITY_WEIGHTS.description +
    skills * CV_SIMILARITY_WEIGHTS.skills,
  );
  return { title, description, skills, combined };
}

/** Average of the three field embeddings — a single vector representing "this job", used for job-to-job similarity. */
export function compositeEmbedding(fields: FieldEmbeddings): number[] {
  const len = fields.title?.length || fields.description?.length || fields.skills?.length || 0;
  if (!len) return [];
  const sum = new Array(len).fill(0);
  let n = 0;
  for (const v of [fields.title, fields.description, fields.skills]) {
    if (v?.length === len) {
      for (let i = 0; i < len; i++) sum[i] += v[i];
      n++;
    }
  }
  if (!n) return [];
  return sum.map(x => x / n);
}

export interface LikedJobVector {
  jobId: string;
  title: string;
  company?: string;
  composite: number[];
}

/** Best-match similarity to the user's previously-liked jobs, plus which one it matched. */
export function similarityToLikedJobs(
  jobComposite: number[],
  likedJobs: LikedJobVector[],
): { similarity: number; best?: LikedJobMatch } {
  let best: LikedJobMatch | undefined;
  let bestCos = -Infinity;
  for (const lj of likedJobs) {
    const cos = cosineSimilarity(jobComposite, lj.composite);
    if (cos > bestCos) {
      bestCos = cos;
      best = { jobId: lj.jobId, title: lj.title, company: lj.company, similarity: toPercent(cos) };
    }
  }
  if (!best) return { similarity: 0, best: undefined };
  return { similarity: best.similarity, best };
}

// ── Final ranking ────────────────────────────────────────────────────────────

/** How much each signal contributes to the final rank. */
export const RANK_WEIGHTS = { cvSimilarity: 0.45, likedSimilarity: 0.25, interaction: 0.3 };

/** Default share of results that are "novelty" picks rather than pure top-score. */
export const DEFAULT_NOVELTY_RATE = 0.2;

/** Raw interaction scores realistically land in roughly [-20, +20]; squash to 0-100 so it blends with the percent-based similarity scores. */
export function normalizeInteractionScore(raw: number): number {
  const clamped = Math.max(-20, Math.min(20, raw));
  return Math.round(((clamped + 20) / 40) * 100);
}

export interface Candidate<J> {
  job: J;
  cvSimilarity: SimilarityBreakdown;
  likedSimilarity: number;
  mostSimilarLikedJob?: LikedJobMatch;
  interactionScoreRaw: number;
  interactionCount: number;
}

export interface RankedCandidate<J> extends Candidate<J> {
  interactionScore: number;
  finalScore: number;
  novelty: boolean;
}

export interface RankOptions {
  limit?: number;
  noveltyRate?: number;
  /** Novelty picks are still sampled only from candidates scoring at or above this floor — "novelty" means a different-but-relevant pick, not noise. */
  minNoveltyScore?: number;
}

/**
 * Ranks candidates by a blend of CV similarity, similarity to previously
 * liked jobs, and the interaction-derived score, then carves off a novelty
 * slice: picks that aren't the top scorers but still cleared the relevance
 * floor, weighted-random sampled so novelty skews toward "still pretty
 * relevant" rather than uniform noise.
 */
export function rankCandidates<J>(
  candidates: Candidate<J>[],
  opts: RankOptions = {},
): RankedCandidate<J>[] {
  const noveltyRate = opts.noveltyRate ?? DEFAULT_NOVELTY_RATE;
  const minNoveltyScore = opts.minNoveltyScore ?? 25;

  const scored: RankedCandidate<J>[] = candidates.map(c => {
    const interactionScore = normalizeInteractionScore(c.interactionScoreRaw);
    const finalScore = Math.round(
      c.cvSimilarity.combined * RANK_WEIGHTS.cvSimilarity +
      c.likedSimilarity * RANK_WEIGHTS.likedSimilarity +
      interactionScore * RANK_WEIGHTS.interaction,
    );
    return { ...c, interactionScore, finalScore, novelty: false };
  });

  scored.sort((a, b) => b.finalScore - a.finalScore);

  const limit = opts.limit ?? scored.length;
  const topCount = Math.max(0, Math.round(limit * (1 - noveltyRate)));
  const noveltyCount = limit - topCount;

  const top = scored.slice(0, topCount);
  const pool = scored.slice(topCount).filter(c => c.finalScore >= minNoveltyScore);

  const novelty: RankedCandidate<J>[] = [];
  const poolCopy = [...pool];
  let iterations = 0;
  while (novelty.length < noveltyCount && poolCopy.length && iterations < 10_000) {
    iterations++;
    const weights = poolCopy.map(c => Math.max(1, c.finalScore));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < weights.length; idx++) {
      r -= weights[idx];
      if (r <= 0) break;
    }
    const [picked] = poolCopy.splice(Math.min(idx, poolCopy.length - 1), 1);
    novelty.push({ ...picked, novelty: true });
  }

  return [...top, ...novelty];
}
