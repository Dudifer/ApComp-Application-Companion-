import type { Job } from './job';

/**
 * Shared wire types for the Rec Lab (embedding-based recommendation testing
 * ground) — see apps/api/src/modules/rec-lab and apps/web RecLabPage.
 */

export type InteractionType =
  | 'VIEWED'          // shown in a batch, no action taken (yet)
  | 'CLICKED'         // opened the job detail panel
  | 'SAVED'
  | 'APPLIED'
  | 'MORE_LIKE_THIS'
  | 'IGNORED'         // shown repeatedly with no positive interaction
  | 'DISMISSED'
  | 'LESS_LIKE_THIS';

export type InteractionContext = 'RECOMMENDED' | 'SEARCH';

export interface JobInteractionRecord {
  id: string;
  jobId: string;
  source: string;
  externalId: string;
  jobTitle: string;
  jobCompany?: string;
  type: InteractionType;
  context: InteractionContext;
  weight: number;
  note?: string;
  createdAt: string;
}

export interface LogInteractionInput {
  jobId: string;
  source: string;
  externalId: string;
  jobTitle: string;
  jobCompany?: string;
  type: InteractionType;
  context?: InteractionContext;
  note?: string;
}

/** Used by the Rec Lab's "replay" feature — change a past interaction and re-rank. */
export interface UpdateInteractionInput {
  type: InteractionType;
  note?: string;
}

export interface SimilarityBreakdown {
  title: number;       // 0-100
  description: number; // 0-100 — includes skills text folded into description, see text.ts
  combined: number;    // 0-100, weighted blend of the two
}

export interface LikedJobMatch {
  jobId: string;
  title: string;
  company?: string;
  similarity: number; // 0-100
}

export interface JobExplanation {
  cvSimilarity: SimilarityBreakdown;
  similarityToLikedJobs: number;
  mostSimilarLikedJob?: LikedJobMatch;
  /** How similar this job is to something the user hit "less like this" on — 0 if never used. Docks finalScore, doesn't just fail to help it. */
  similarityToDislikedJobs: number;
  mostSimilarDislikedJob?: LikedJobMatch;
  interactionScoreRaw: number;
  interactionScore: number; // normalized 0-100
  interactionCount: number;
  finalScore: number; // 0-100, blended
  novelty: boolean;
}

export interface RankedJob {
  job: Job;
  explanation: JobExplanation;
}

export interface TimelinePoint {
  date: string; // YYYY-MM-DD
  count: number;
  jobs: { jobId: string; title: string; company?: string }[];
}

/**
 * Summary of the per-dimension CV weight vector (see scoring.ts's
 * computeCvWeightVector) — the 384 raw numbers aren't meaningful on their
 * own, this is what's actually worth showing a user.
 */
export interface WeightVectorSummary {
  mean: number;
  min: number;
  max: number;
  topEmphasized: { dim: number; weight: number }[];
  topSuppressed: { dim: number; weight: number }[];
}

/** Response for POST /rec-lab/test-dataset/rank — same RankedJob[] as /rank, plus the weight vector that produced it. */
export interface TestDatasetRankResult {
  ranked: RankedJob[];
  weightVector: WeightVectorSummary;
  /** How many interactions fed into the weight vector — 0 means every dimension is still at 1 (no signal yet). */
  eventsUsed: number;
}
