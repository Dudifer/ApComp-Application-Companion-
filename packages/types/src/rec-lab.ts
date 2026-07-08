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
  description: number; // 0-100
  skills: number;       // 0-100
  combined: number;     // 0-100, weighted blend of the three
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
