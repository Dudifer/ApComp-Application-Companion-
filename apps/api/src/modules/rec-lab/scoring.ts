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

/**
 * Interaction types that propagate a *negative* signal to similar jobs, not
 * just to the exact job itself. DISMISSED and LESS_LIKE_THIS both count now —
 * dismissing a job is a real "I don't want this" signal for its neighbors
 * too, at the same normal decayed weight as any other interaction (see
 * INTERACTION_WEIGHTS.DISMISSED). It used to be scoped out of propagation
 * and given a hard score floor instead (see SUPPRESSION_TYPES below), back
 * when a dismiss's *only* lever was the score. Now that dismissing a job
 * also removes it from the candidate pool outright (see
 * RecLabService.rank()'s dismissedJobIds exclusion, backed by the
 * DismissedJob table), "never show me this exact job again" is handled by
 * literal removal, so the score itself is free to behave normally again.
 */
export const NEGATIVE_PROPAGATION_TYPES: InteractionType[] = ['DISMISSED', 'LESS_LIKE_THIS'];

/**
 * Interaction types where, if it's the *most recent* interaction on a job,
 * should suppress that job's own score regardless of any positive history
 * before it. LESS_LIKE_THIS keeps this hard floor — it's an explicit taste
 * signal, not just "not this one." DISMISSED no longer needs it: dismissing
 * a job removes it from the candidate pool directly (see rank()), so its
 * score doesn't need to be artificially floored to keep it from resurfacing.
 */
export const SUPPRESSION_TYPES: InteractionType[] = ['LESS_LIKE_THIS'];

/** Matches normalizeInteractionScore's clamp floor, so a suppressed job's interaction component normalizes to 0. */
export const SUPPRESSED_SCORE_FLOOR = -20;

const DECAY_HALF_LIFE_DAYS = 30;

export interface WeightedInteraction {
  weight: number;
  createdAt: string | Date;
}

export interface TypedInteraction extends WeightedInteraction {
  type: InteractionType;
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

/**
 * If the most recent interaction on a job is a suppression type (dismiss /
 * less-like-this), floor that job's own raw score regardless of how much
 * positive history came before it — a later dismiss should have real teeth,
 * not just contribute one more term to a running sum a few earlier clicks
 * can outweigh.
 */
export function applyMostRecentSuppression(
  interactions: TypedInteraction[],
  rawScore: number,
): number {
  if (!interactions.length) return rawScore;
  const mostRecent = [...interactions].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )[0];
  if (SUPPRESSION_TYPES.includes(mostRecent.type)) {
    return Math.min(rawScore, SUPPRESSED_SCORE_FLOOR);
  }
  return rawScore;
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
}

/**
 * How much each field contributes to the blended "CV similarity" score.
 * Previously title/description/skills at 0.35/0.4/0.25 — skills text is now
 * folded into the description field itself (see text.ts), so its old 0.25
 * share rolls into description's weight (0.4 + 0.25 = 0.65).
 */
export const CV_SIMILARITY_WEIGHTS = { title: 0.35, description: 0.65 };

export function computeCvSimilarity(cv: FieldEmbeddings, job: FieldEmbeddings): SimilarityBreakdown {
  const title = toPercent(cosineSimilarity(cv.title, job.title));
  const description = toPercent(cosineSimilarity(cv.description, job.description));
  const combined = Math.round(
    title * CV_SIMILARITY_WEIGHTS.title +
    description * CV_SIMILARITY_WEIGHTS.description,
  );
  return { title, description, combined };
}

/** Average of the field embeddings — a single vector representing "this job", used for job-to-job similarity. */
export function compositeEmbedding(fields: FieldEmbeddings): number[] {
  const len = fields.title?.length || fields.description?.length || 0;
  if (!len) return [];
  const sum = new Array(len).fill(0);
  let n = 0;
  for (const v of [fields.title, fields.description]) {
    if (v?.length === len) {
      for (let i = 0; i < len; i++) sum[i] += v[i];
      n++;
    }
  }
  if (!n) return [];
  return sum.map(x => x / n);
}

// ── CV weight vector ─────────────────────────────────────────────────────────
//
// A per-dimension weight over the composite embedding space (same 384
// dimensions as compositeEmbedding()'s output), learned from interaction
// history rather than stored directly — see RecLabService for how it's
// assembled from JobInteraction rows. Answers "which parts of the CV embed
// matter most to this user": dimensions where the CV and a liked job keep
// agreeing get weighted up, dimensions that only show up agreeing with
// disliked jobs get weighted down. Individual dimension indices aren't
// human-interpretable on their own (this is a generic sentence-transformer
// space, not a labeled feature set) — the useful output is which dimensions
// end up furthest from 1, not what dimension #217 "means".

export const CV_WEIGHT_LEARNING_RATE = 0.05;
export const CV_WEIGHT_MIN = 0.2;
export const CV_WEIGHT_MAX = 3;

export interface WeightUpdateEvent {
  type: InteractionType;
  jobComposite: number[];
}

/**
 * Starts every dimension at 1 (equally important) and nudges each one up or
 * down per interaction: for a given event, `cvComposite[i] * jobComposite[i]`
 * is positive where the CV and that job agree in direction on dimension i,
 * negative where they disagree. Scaling that agreement by the interaction's
 * existing weight (weightFor()) means a strong signal (APPLIED,
 * LESS_LIKE_THIS) moves the weight vector more than a weak one (CLICKED,
 * IGNORED), and a negative interaction pushes agreeing dimensions *down*
 * rather than up — automatically, since weightFor() is already negative for
 * those types. Clamped to [CV_WEIGHT_MIN, CV_WEIGHT_MAX] so no dimension can
 * run away to zero or dominate everything else.
 *
 * Pure and order-independent in effect (each event's contribution is
 * additive) — deliberately NOT time-decayed the way aggregateInteractionScore
 * is, since this runs over a comparatively small interaction history, not
 * the full production feed.
 */
export function computeCvWeightVector(
  events: WeightUpdateEvent[],
  cvComposite: number[],
): number[] {
  const dims = cvComposite.length;
  const weights = new Array(dims).fill(1);
  if (!dims) return weights;

  for (const event of events) {
    if (event.jobComposite.length !== dims) continue;
    const signal = weightFor(event.type);
    if (signal === 0) continue;
    for (let i = 0; i < dims; i++) {
      const agreement = cvComposite[i] * event.jobComposite[i];
      weights[i] = Math.max(
        CV_WEIGHT_MIN,
        Math.min(CV_WEIGHT_MAX, weights[i] + CV_WEIGHT_LEARNING_RATE * signal * agreement),
      );
    }
  }
  return weights;
}

/** Elementwise multiply — applies a per-dimension weight vector before comparing two vectors. */
export function applyWeights(vec: number[], weights: number[]): number[] {
  if (vec.length !== weights.length) return vec;
  return vec.map((v, i) => v * weights[i]);
}

export interface WeightVectorSummary {
  mean: number;
  min: number;
  max: number;
  /** Dimensions weighted furthest above 1 — most emphasized. */
  topEmphasized: { dim: number; weight: number }[];
  /** Dimensions weighted furthest below 1 — most suppressed. */
  topSuppressed: { dim: number; weight: number }[];
}

/** Summarizes a weight vector for display — the raw 384 numbers aren't meaningful on their own. */
export function summarizeWeightVector(weights: number[], topN = 5): WeightVectorSummary {
  if (!weights.length) return { mean: 1, min: 1, max: 1, topEmphasized: [], topSuppressed: [] };
  const indexed = weights.map((weight, dim) => ({ dim, weight }));
  const topEmphasized = [...indexed].sort((a, b) => b.weight - a.weight).slice(0, topN);
  const topSuppressed = [...indexed].sort((a, b) => a.weight - b.weight).slice(0, topN);
  return {
    mean: weights.reduce((a, b) => a + b, 0) / weights.length,
    min: Math.min(...weights),
    max: Math.max(...weights),
    topEmphasized,
    topSuppressed,
  };
}

// ── Preference embedding ─────────────────────────────────────────────────────
//
// A second, much simpler "who does this user like" signal, deliberately
// distinct from both the CV embedding (what the resume says) and the CV
// weight vector above (which CV dimensions matter most). This is just the
// literal mean of the composite embeddings of every job the user has SAVED,
// APPLIED to, or hit MORE_LIKE_THIS on — no learning, no decay, no
// per-dimension weighting of its own. "For now" a plain average; can grow
// more sophisticated later if that turns out to be too blunt an instrument.

/**
 * Mean of a set of composite embeddings. Used as the preference embedding
 * (mean of liked-job composites), but it's a generic "blend N vectors"
 * helper — nothing here is specific to preferences. Mismatched-length or
 * empty vectors are dropped rather than throwing, same tolerance as
 * compositeEmbedding().
 */
export function computePreferenceEmbedding(composites: number[][]): number[] {
  const nonEmpty = composites.filter(c => c.length > 0);
  if (!nonEmpty.length) return [];
  const dims = nonEmpty[0].length;
  const sum = new Array(dims).fill(0);
  let n = 0;
  for (const c of nonEmpty) {
    if (c.length !== dims) continue;
    for (let i = 0; i < dims; i++) sum[i] += c[i];
    n++;
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

/**
 * How much each signal contributes to the final rank. Rebalanced to make
 * room for preferenceSimilarity (see computePreferenceEmbedding): cvSimilarity
 * gave up 0.45->0.35 and likedSimilarity (best-match to a single liked job)
 * gave up 0.25->0.15, since the new mean-of-liked-jobs signal captures
 * similar ground more robustly (less sensitive to one outlier liked job).
 * interaction stays at 0.3 — still the most direct behavioral signal.
 */
export const RANK_WEIGHTS = { cvSimilarity: 0.35, likedSimilarity: 0.15, preferenceSimilarity: 0.2, interaction: 0.3 };

/**
 * How hard a job gets docked for resembling something the user explicitly
 * said "less like this" to. Applied as a straight subtraction after the
 * weighted blend above, not folded into RANK_WEIGHTS — that way it's exactly
 * 0 for anyone who's never used the button, rather than requiring the other
 * weights to be rebalanced to make room for a term that's usually inactive.
 */
export const DISLIKE_PENALTY_WEIGHT = 0.4;

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
  /** Cosine similarity to the mean of the user's liked-job composites (see computePreferenceEmbedding) — 0 if they have no liked jobs yet. */
  preferenceSimilarity: number;
  /** How similar this job is to something the user hit "less like this" on. 0 if they never have. */
  dislikedSimilarity: number;
  mostSimilarDislikedJob?: LikedJobMatch;
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
    const blended =
      c.cvSimilarity.combined * RANK_WEIGHTS.cvSimilarity +
      c.likedSimilarity * RANK_WEIGHTS.likedSimilarity +
      c.preferenceSimilarity * RANK_WEIGHTS.preferenceSimilarity +
      interactionScore * RANK_WEIGHTS.interaction;
    const finalScore = Math.round(blended - c.dislikedSimilarity * DISLIKE_PENALTY_WEIGHT);
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
