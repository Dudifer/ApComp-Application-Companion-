import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import type { Job, CvProfile, InteractionType } from '@apcomp/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../../auth/user.service';
import { EmbeddingService } from './embedding.service';
import { TEST_DATASET } from './test-dataset';
import { catalogRowToJob } from './catalog-embedding';
import { cvProfileToTexts, hashFieldTexts } from './text';
import {
  compositeEmbedding, cosineSimilarity, toPercent, weightFor, aggregateInteractionScore, FieldEmbeddings,
  computePropagatedContributions, PropagationSourceEvent, PropagatedContribution,
} from './scoring';
import { reduceAll } from './embedding-reduction';

// Embeddings plot only shows jobs the user has a strong signal on either
// way — everything in between (the vast unreacted-to middle) is noise for
// a "does the embedding space separate my likes from my dislikes" plot.
const HIGH_SCORE_THRESHOLD = 10;
const LOW_SCORE_THRESHOLD = -10;

/** A test-dataset job paired with its cosine-similarity match to the user's CV, 0-100 (or null if there's no CV, or no embedding yet for this particular job). */
export interface RecLab2RankedJob {
  job: Job;
  similarity: number | null;
  /** True for the NOVELTY_PICKS wildcard slots pulled from outside the top TOP_PICKS — see applyBatchCap. Omitted (falsy) for everything else. */
  isNovelty?: boolean;
}

export interface RecLab2InteractionRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  jobCompany?: string;
  type: InteractionType;
  weight: number;
  createdAt: string;
}

/** One job's interaction history for the "View interaction history" screen — its most recent interactions plus a total score (direct + propagated) computed the same way (weightFor + aggregateInteractionScore) as the original Rec Lab, now also feeding into ranking (see RecLab2Service.computeAllJobScores). */
export interface RecLab2JobHistory {
  jobId: string;
  jobTitle: string;
  jobCompany?: string;
  /** direct + propagated — what everything else (sorting, embeddings-plot buckets) actually uses. */
  score: number;
  /** This job's own logged interactions only — weightFor + aggregateInteractionScore, no propagation. */
  directScore: number;
  /** Sum of propagatedFrom's amounts — how much of `score` came from similar jobs' interactions rather than this job's own. */
  propagatedScore: number;
  /** Individual neighbor contributions making up propagatedScore, each referencing the job/interaction it came from. */
  propagatedFrom: PropagatedContribution[];
  interactionCount: number;
  recentInteractions: RecLab2InteractionRecord[];
}

/** One point on the "embeddings plot" — a job (or the user's CV) plus its 2-d position under all three reduction methods, so the frontend can swap between them without a re-fetch. */
export interface RecLab2EmbeddingPoint {
  jobId: string;
  title: string;
  company: string;
  category: 'software' | 'retail' | 'cv';
  pca: [number, number];
  umap: [number, number];
  tsne: [number, number];
}

/** One currently-"on" row-button toggle — see getActiveToggleInteractions. */
export interface RecLab2ActiveToggle {
  id: string;
  jobId: string;
  type: InteractionType;
}

/** One entry in a session's startSnapshot — see RecLab2Session in schema.prisma. */
interface SessionSnapshotEntry {
  jobId: string;
  position: number;
  score: number;
}

/** Returned by startSession() — just enough for the frontend to tag subsequent interactions and later call endSession(). */
export interface RecLab2SessionStart {
  id: string;
  sessionNumber: number;
  startedAt: string;
}

/** One row on the "Metrics" screen — a session's three headline numbers, for graphing against sessionNumber. Only ended sessions are returned (see listSessions); an in-progress session has nothing to plot yet. */
export interface RecLab2SessionSummary {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string;
  avgTopFiveScoreChange: number | null;
  firstPositivePosition: number | null;
  mostInteractedPosition: number | null;
}

// The 4 row buttons (👍/👎/♡/✕) are the only interaction types that behave
// like toggles (logged on first click, deleted on second) — VIEWED/CLICKED/
// APPLIED/IGNORED are plain one-way logs with nothing to "restore" a UI
// toggle-state from.
const TOGGLE_INTERACTION_TYPES: InteractionType[] = ['MORE_LIKE_THIS', 'LESS_LIKE_THIS', 'SAVED', 'DISMISSED'];

// SAVED and DISMISSED double as box placement (Saved Jobs / Dismissed Jobs /
// Recommended Jobs) — a job can't sensibly sit in both boxes at once, so
// activating one has to retract the other rather than the two existing
// side by side.
const OPPOSING_TOGGLE: Partial<Record<InteractionType, InteractionType>> = {
  SAVED: 'DISMISSED',
  DISMISSED: 'SAVED',
};

// The Recommended box shows a fixed-size batch rather than every
// TEST_DATASET job at once: the TOP_PICKS highest-ranked jobs, plus
// NOVELTY_PICKS wildcards pulled from further down the ranked list so the
// box isn't purely an echo chamber of whatever already scores well — see
// RecLab2Service.applyBatchCap.
const TOP_PICKS = 16;
const NOVELTY_PICKS = 4;

/**
 * Rec Lab 2 — clean rebuild, starting from scratch.
 */
@Injectable()
export class RecLab2Service {
  private readonly logger = new Logger(RecLab2Service.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly embeddings: EmbeddingService,
  ) {}

  /**
   * Process 1: pulls the jobs described in test-dataset.ts (50 software +
   * 50 retail, real job_catalog ids — see that file's header comment) and
   * maps each row into a Job via the same catalogRowToJob() mapping
   * RecLabService uses.
   *
   * Process 2 (this method's other job): scores each one against the
   * user's CV embedding via cosine similarity, and — only once per CV
   * upload — sorts the list by that score before returning it.
   *
   * The "once per upload" part is tracked via recLab2SortHash (which CV
   * embedding the stored order was computed against) *and*
   * recLab2JobOrder (the actual resulting order) together — not a bare
   * boolean. If only a yes/no flag were persisted, a request that gets
   * cancelled after the flag is written but before the client receives the
   * sorted response would leave every future load skipping the sort while
   * still rendering the unsorted fallback order, with no way to recover
   * short of re-uploading the CV. Persisting the real order means the very
   * next load already has the correct, previously-computed order to apply,
   * regardless of whether any earlier response made it to a client.
   */
  async getRecommendedJobs(clerkId: string): Promise<RecLab2RankedJob[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const jobs = TEST_DATASET.map(row => catalogRowToJob(row));

    const cvRow = await this.prisma.cvProfile.findUnique({ where: { userId } });
    if (!cvRow) {
      this.logger.log(`No CV profile for user ${userId} — Rec Lab 2 returning unscored, unsorted jobs.`);
      return this.applyBatchCap(userId, jobs.map(job => ({ job, similarity: null })));
    }

    const { composite: cvComposite, hash: currentHash } = await this.ensureCvEmbeddings(userId, cvRow);

    // Job embeddings are expected to already exist (via `pnpm rec-lab2:embed`)
    // — this only reads them, it doesn't compute anything for jobs that
    // aren't embedded yet, those just fall back to a null similarity.
    const jobEmbeddingRows = cvComposite.length
      ? await this.prisma.jobEmbedding.findMany({ where: { jobId: { in: jobs.map(j => j.id) } } })
      : [];
    const embeddingByJobId = new Map(jobEmbeddingRows.map(row => [row.jobId, row]));

    const scored: RecLab2RankedJob[] = jobs.map(job => {
      const row = embeddingByJobId.get(job.id);
      if (!row || !cvComposite.length) return { job, similarity: null };
      const jobComposite = compositeEmbedding({ title: row.titleEmbedding, description: row.descriptionEmbedding });
      if (!jobComposite.length) return { job, similarity: null };
      return { job, similarity: toPercent(cosineSimilarity(cvComposite, jobComposite)) };
    });

    const storedOrder = Array.isArray(cvRow.recLab2JobOrder) ? (cvRow.recLab2JobOrder as string[]) : [];
    const hasStoredOrder = cvRow.recLab2SortHash === currentHash && storedOrder.length > 0;

    let similarityOrdered: RecLab2RankedJob[];
    if (hasStoredOrder) {
      // Already sorted for this exact CV embedding — replay the persisted
      // order instead of recomputing. (Similarity scores above are always
      // recomputed fresh regardless, so display stays accurate even for
      // jobs embedded after the last sort.)
      similarityOrdered = reorderByStoredIds(scored, storedOrder);
    } else {
      scored.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
      await this.prisma.cvProfile.update({
        where: { userId },
        data: {
          recLab2SortHash: currentHash,
          recLab2JobOrder: scored.map(s => s.job.id),
        },
      });
      this.logger.log(`Sorted Rec Lab 2 recommended jobs by CV similarity for user ${userId} (new/changed CV embedding).`);
      similarityOrdered = scored;
    }

    // Primary sort key is the live interaction score (MORE_LIKE_THIS/SAVED
    // push a job up, LESS_LIKE_THIS/DISMISSED push it down) — recomputed on
    // every load since interactions change far more often than the CV does,
    // unlike the similarity order above which is deliberately cached.
    // Array.prototype.sort is stable in Node, so sorting the
    // already-similarity-ordered list by score and nothing else naturally
    // leaves equal-score jobs (most commonly the many with zero interactions
    // yet) in their existing CV-similarity order — exactly "score first, CV
    // similarity as tiebreak" without a manual secondary comparator.
    const scoreByJobId = await this.getJobScores(userId);
    const scoreSorted = [...similarityOrdered].sort(
      (a, b) => (scoreByJobId.get(b.job.id) ?? 0) - (scoreByJobId.get(a.job.id) ?? 0),
    );
    return this.applyBatchCap(userId, scoreSorted);
  }

  /**
   * Caps the Recommended box to a fixed-size batch instead of every
   * TEST_DATASET job at once: the TOP_PICKS highest-ranked jobs, plus
   * NOVELTY_PICKS wildcards pulled from further down the list so the box
   * isn't purely an echo chamber of whatever already scores well.
   *
   * SAVED/DISMISSED jobs are pulled out of the pool before capping — they
   * don't consume a batch slot, and once a job is saved or dismissed it's
   * "set aside" and won't compete for a spot in future batches — but they're
   * still appended to the returned array uncapped, since RecLab2.tsx derives
   * all three boxes (Recommended/Saved/Dismissed) from this one array;
   * capping them too would make older saved/dismissed jobs disappear from
   * their boxes once they aged out of the top ranks.
   *
   * Novelty picks are chosen with a seed derived from the *set* of eligible
   * remainder job ids (sorted, so only membership matters, not order) rather
   * than Math.random(). That makes two calls close together — e.g. the
   * page's own fetch and startSession()'s internal getRecommendedJobs() call
   * a moment later — return the identical batch as long as the underlying
   * pool hasn't actually changed (nothing freshly saved/dismissed/
   * interacted-with). Without that, a session's startSnapshot could
   * disagree with what the user is actually looking at on screen, silently
   * corrupting the position-based metrics.
   */
  private async applyBatchCap(userId: string, ordered: RecLab2RankedJob[]): Promise<RecLab2RankedJob[]> {
    const reservedRows = await this.prisma.recLab2Interaction.findMany({
      where: { userId, type: { in: ['SAVED', 'DISMISSED'] as any } },
      select: { jobId: true },
    });
    const reservedJobIds = new Set(reservedRows.map(r => r.jobId));

    const pool: RecLab2RankedJob[] = [];
    const reserved: RecLab2RankedJob[] = [];
    for (const item of ordered) {
      (reservedJobIds.has(item.job.id) ? reserved : pool).push(item);
    }

    const top = pool.slice(0, TOP_PICKS);
    const remainder = pool.slice(TOP_PICKS);
    const noveltySeed = remainder.map(r => r.job.id).sort().join(',');
    const novelty = pickRandomSubset(remainder, NOVELTY_PICKS, noveltySeed).map(r => ({ ...r, isNovelty: true }));

    return [...top, ...novelty, ...reserved];
  }

  /**
   * Ensures a CV row's embeddings are present and current, embedding it
   * fresh if it's missing one or it's gone stale (re-uploaded CV) — same
   * logic getRecommendedJobs always needed, now also shared by
   * getEmbeddingsPlot's CV point. Takes the already-fetched cvRow rather
   * than re-querying, since callers generally need other columns off it too
   * (recLab2SortHash/recLab2JobOrder, cvRow.name, etc).
   */
  private async ensureCvEmbeddings(userId: string, cvRow: any): Promise<{ composite: number[]; hash: string }> {
    const profile: CvProfile = {
      name: cvRow.name ?? undefined,
      email: cvRow.email ?? undefined,
      rawText: cvRow.rawText ?? undefined,
      roles: cvRow.roles as CvProfile['roles'],
      skills: cvRow.skills as CvProfile['skills'],
      practices: cvRow.practices as string[],
      projects: cvRow.projects as CvProfile['projects'],
      gapQuestions: cvRow.gapQuestions as CvProfile['gapQuestions'],
      isComplete: cvRow.isComplete,
    };
    const texts = cvProfileToTexts(profile);
    const currentHash = hashFieldTexts(texts);

    const hasCachedVectors =
      cvRow.embeddingSourceHash === currentHash &&
      cvRow.titleEmbedding.length > 0 &&
      cvRow.descriptionEmbedding.length > 0;

    let cvEmbeddings: FieldEmbeddings;
    if (hasCachedVectors) {
      cvEmbeddings = { title: cvRow.titleEmbedding, description: cvRow.descriptionEmbedding };
    } else {
      // CV is missing an embedding, or it's stale (re-uploaded since it was
      // last embedded) — embed it now, same as RecLabService.ensureCvEmbeddings.
      this.logger.log(`Embedding CV for user ${userId} (Rec Lab 2)`);
      const [title, description] = await this.embeddings.embedBatch([texts.title, texts.description]);
      cvEmbeddings = { title, description };
      await this.prisma.cvProfile.update({
        where: { userId },
        data: {
          titleEmbedding: title,
          descriptionEmbedding: description,
          skillsEmbedding: [],
          embeddingSourceHash: currentHash,
          embeddingUpdatedAt: new Date(),
        },
      });
    }

    return { composite: compositeEmbedding(cvEmbeddings), hash: currentHash };
  }

  /**
   * Compare tool: cosine similarity between two test-dataset jobs'
   * embeddings directly (not against the CV) — reuses the exact same
   * compositeEmbedding/cosineSimilarity/toPercent math as the CV-match
   * score above, just with a job composite on both sides instead of one.
   * Null if either job doesn't have an embedding yet (run `pnpm rec-lab2:embed`).
   */
  async compareJobs(jobIdA: string, jobIdB: string): Promise<{ similarity: number | null }> {
    if (jobIdA === jobIdB) return { similarity: 100 };

    const rows = await this.prisma.jobEmbedding.findMany({
      where: { jobId: { in: [jobIdA, jobIdB] } },
    });
    const rowA = rows.find(r => r.jobId === jobIdA);
    const rowB = rows.find(r => r.jobId === jobIdB);
    if (!rowA || !rowB) return { similarity: null };

    const compositeA = compositeEmbedding({ title: rowA.titleEmbedding, description: rowA.descriptionEmbedding });
    const compositeB = compositeEmbedding({ title: rowB.titleEmbedding, description: rowB.descriptionEmbedding });
    if (!compositeA.length || !compositeB.length) return { similarity: null };

    return { similarity: toPercent(cosineSimilarity(compositeA, compositeB)) };
  }

  /**
   * "Embeddings plot" — every embedded test-dataset job the user has
   * interacted with strongly (interaction score > HIGH_SCORE_THRESHOLD or
   * < LOW_SCORE_THRESHOLD), plus the user's CV as a reference point, each
   * reduced from 384 dims down to 2 via PCA, UMAP and t-SNE (see
   * embedding-reduction.ts for why all three). Split into two independent
   * buckets — "high" and "low" — because they're conceptually different
   * job sets (jobs you responded well to vs. jobs you didn't), each of
   * which needs its *own* reduction call: PCA/UMAP/t-SNE only produce
   * comparable, meaningfully-positioned coordinates when computed jointly
   * over one point set, so mixing both buckets into a single reduction
   * (or reducing the CV separately) would put points in an unrelated 2-d
   * space with no real relationship to each other.
   */
  async getEmbeddingsPlot(clerkId: string): Promise<{ high: RecLab2EmbeddingPoint[]; low: RecLab2EmbeddingPoint[] }> {
    const userId = await this.userService.ensureUser(clerkId);

    const jobRows = TEST_DATASET.map(row => ({
      job: catalogRowToJob(row),
      category: row.group as 'software' | 'retail',
    }));
    const embeddingRows = await this.prisma.jobEmbedding.findMany({
      where: { jobId: { in: jobRows.map(r => r.job.id) } },
    });
    const embeddingByJobId = new Map(embeddingRows.map(row => [row.jobId, row]));
    const scoreByJobId = await this.getJobScores(userId);

    type PlotVector = { jobId: string; title: string; company: string; category: 'software' | 'retail' | 'cv'; vector: number[] };
    const highJobs: PlotVector[] = [];
    const lowJobs: PlotVector[] = [];

    for (const { job, category } of jobRows) {
      const row = embeddingByJobId.get(job.id);
      if (!row) continue; // not embedded yet (run `pnpm rec-lab2:embed`) — nothing to plot for it
      const composite = compositeEmbedding({ title: row.titleEmbedding, description: row.descriptionEmbedding });
      if (!composite.length) continue;

      const score = scoreByJobId.get(job.id) ?? 0;
      const point: PlotVector = { jobId: job.id, title: job.title, company: job.company, category, vector: composite };
      if (score > HIGH_SCORE_THRESHOLD) highJobs.push(point);
      else if (score < LOW_SCORE_THRESHOLD) lowJobs.push(point);
    }

    let cvPoint: PlotVector | null = null;
    const cvRow = await this.prisma.cvProfile.findUnique({ where: { userId } });
    if (cvRow) {
      const { composite: cvComposite } = await this.ensureCvEmbeddings(userId, cvRow);
      if (cvComposite.length) {
        cvPoint = {
          jobId: '__cv__',
          title: cvRow.name ? `${cvRow.name}'s CV` : 'Your CV',
          company: '',
          category: 'cv',
          vector: cvComposite,
        };
      }
    }

    return {
      high: this.reduceBucket(highJobs, cvPoint),
      low: this.reduceBucket(lowJobs, cvPoint),
    };
  }

  /** Runs one score-bucket's job points (plus the shared CV reference point, if any) through PCA/UMAP/t-SNE together. */
  private reduceBucket(
    jobs: { jobId: string; title: string; company: string; category: 'software' | 'retail' | 'cv'; vector: number[] }[],
    cvPoint: { jobId: string; title: string; company: string; category: 'software' | 'retail' | 'cv'; vector: number[] } | null,
  ): RecLab2EmbeddingPoint[] {
    const points = cvPoint ? [...jobs, cvPoint] : jobs;
    if (points.length === 0) return [];
    if (points.length < 3) {
      // UMAP/t-SNE both need a handful of neighbors to mean anything —
      // rather than error out on a near-empty bucket, just place whatever
      // we have at the origin.
      return points.map(p => ({
        jobId: p.jobId, title: p.title, company: p.company, category: p.category,
        pca: [0, 0], umap: [0, 0], tsne: [0, 0],
      }));
    }

    const { pca, umap, tsne } = reduceAll(points.map(p => p.vector));
    return points.map((p, i) => ({
      jobId: p.jobId, title: p.title, company: p.company, category: p.category,
      pca: pca[i], umap: umap[i], tsne: tsne[i],
    }));
  }

  /**
   * Every TEST_DATASET job's score, direct + propagated, keyed by job id.
   * Thin wrapper over computeAllJobScores() for callers (sort order,
   * embeddings-plot buckets) that only need the final number, not the
   * breakdown/attribution getInteractionHistory shows.
   */
  private async getJobScores(userId: string): Promise<Map<string, number>> {
    const breakdown = await this.computeAllJobScores(userId);
    const scores = new Map<string, number>();
    for (const [jobId, b] of breakdown) scores.set(jobId, b.total);
    return scores;
  }

  /**
   * Every TEST_DATASET job's score, split into direct (its own logged
   * interactions) and propagated (a fraction of *other* jobs' interactions,
   * scaled by how similar those jobs are — see scoring.ts's
   * computePropagatedContributions). Computed live on every call rather than
   * cached, same principle as aggregateInteractionScore itself: editing or
   * deleting a past interaction should immediately change every score it
   * touches, direct or propagated, with nothing stale left to invalidate.
   *
   * Returns an empty map (not one entry per job at 0) when the user has no
   * interactions at all yet — callers already treat a missing key as score 0,
   * and skipping the embedding fetch entirely keeps the common "hasn't
   * interacted with anything yet" case cheap.
   */
  private async computeAllJobScores(userId: string): Promise<Map<string, {
    direct: number; propagated: number; total: number; propagatedContributions: PropagatedContribution[];
  }>> {
    const interactions = await this.prisma.recLab2Interaction.findMany({ where: { userId } });
    if (!interactions.length) return new Map();

    const byJob = new Map<string, typeof interactions>();
    for (const row of interactions) {
      const list = byJob.get(row.jobId) ?? [];
      list.push(row);
      byJob.set(row.jobId, list);
    }
    const directScores = new Map<string, number>();
    for (const [jobId, jobRows] of byJob) {
      directScores.set(jobId, aggregateInteractionScore(jobRows.map(r => ({ weight: r.weight, createdAt: r.createdAt })), { decay: true }));
    }

    // Composite embeddings for every TEST_DATASET job — needed both as
    // propagation targets (any job could be similar enough to an interacted
    // one to pick up some score) and as propagation sources (every
    // interaction's own job needs its composite to measure similarity from).
    const allTestJobs = TEST_DATASET.map(row => catalogRowToJob(row));
    const embeddingRows = await this.prisma.jobEmbedding.findMany({
      where: { jobId: { in: allTestJobs.map(j => j.id) } },
    });
    const compositeByJobId = new Map(
      embeddingRows.map(row => [row.jobId, compositeEmbedding({ title: row.titleEmbedding, description: row.descriptionEmbedding })]),
    );

    const sourceEvents: PropagationSourceEvent[] = interactions
      .map(row => ({
        jobId: row.jobId,
        jobTitle: row.jobTitle,
        jobCompany: row.jobCompany ?? undefined,
        type: row.type as InteractionType,
        weight: row.weight,
        createdAt: row.createdAt,
        composite: compositeByJobId.get(row.jobId) ?? [],
      }))
      .filter(e => e.composite.length > 0);

    const result = new Map<string, { direct: number; propagated: number; total: number; propagatedContributions: PropagatedContribution[] }>();
    for (const job of allTestJobs) {
      const targetComposite = compositeByJobId.get(job.id) ?? [];
      const direct = directScores.get(job.id) ?? 0;
      // Excludes this job's own interactions — those are direct score, not
      // "propagated from a neighbor" (a job is never its own neighbor here).
      const otherEvents = sourceEvents.filter(e => e.jobId !== job.id);
      const propagatedContributions = targetComposite.length
        ? computePropagatedContributions(targetComposite, otherEvents, { decay: true })
        : [];
      const propagated = propagatedContributions.reduce((sum, c) => sum + c.amount, 0);
      result.set(job.id, { direct, propagated, total: direct + propagated, propagatedContributions });
    }
    return result;
  }

  // ── Interactions (wired into ranking — see computeAllJobScores) ─────────
  //
  // Deliberately its own table (RecLab2Interaction, not JobInteraction) —
  // see the schema.prisma comment on that model for why sharing the
  // original table would leak into the live app's dismissed-jobs list and
  // the original Rec Lab's scoring. getRecommendedJobs() sorts by the score
  // computed from these rows (direct + propagated), and getInteractionHistory
  // reports that same score's full breakdown.

  async logInteraction(
    clerkId: string,
    input: { jobId: string; jobTitle: string; jobCompany?: string; type: InteractionType; sessionId?: string },
  ): Promise<RecLab2InteractionRecord> {
    const userId = await this.userService.ensureUser(clerkId);
    await this.clearOpposingToggle(userId, input.jobId, input.type);
    const row = await this.prisma.recLab2Interaction.create({
      data: {
        userId,
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        type: input.type as any,
        weight: recLab2WeightFor(input.type),
        sessionId: input.sessionId,
      },
    });
    return this.toInteractionRecord(row);
  }

  /**
   * SAVED and DISMISSED are mutually exclusive — saving a dismissed job
   * un-dismisses it and vice versa, so a job never sits in both the Saved
   * and Dismissed boxes at once. Deletes the opposing row (if any) for this
   * job before the new one is created/edited in; `excludeId` skips the row
   * being edited itself (updateInteraction reuses this before changing a
   * row's own type, so it shouldn't delete the row it's about to update).
   */
  private async clearOpposingToggle(
    userId: string,
    jobId: string,
    type: InteractionType,
    excludeId?: string,
  ): Promise<void> {
    const opposing = OPPOSING_TOGGLE[type];
    if (!opposing) return;
    await this.prisma.recLab2Interaction.deleteMany({
      where: {
        userId,
        jobId,
        type: opposing as any,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
    });
  }

  /**
   * Toggle-off support for the row buttons — the frontend logs an
   * interaction on first click (turning the button "on") and deletes that
   * same row here on second click (turning it back "off"), rather than
   * stacking up duplicate rows from repeated clicks. Also reused as the
   * "delete" side of editing an interaction from the history view.
   */
  async deleteInteraction(clerkId: string, interactionId: string): Promise<{ success: true }> {
    const userId = await this.userService.ensureUser(clerkId);
    const existing = await this.prisma.recLab2Interaction.findUnique({ where: { id: interactionId } });
    if (!existing) throw new NotFoundException('Interaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.recLab2Interaction.delete({ where: { id: interactionId } });
    return { success: true };
  }

  /**
   * The row buttons' toggle-state (which of 👍/👎/♡/✕ is "on" for which job)
   * only ever lived in React state, keyed off whatever the frontend had
   * created/deleted so far this session — so a page refresh reset it to
   * all-off even though the underlying interactions were still sitting in
   * the DB. This lets the frontend rebuild that state on load: one row per
   * currently-active toggle interaction, i.e. exactly what a toggle button
   * being "on" means (a not-yet-deleted MORE_LIKE_THIS/LESS_LIKE_THIS/
   * SAVED/DISMISSED row for that job).
   */
  async getActiveToggleInteractions(clerkId: string): Promise<RecLab2ActiveToggle[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const rows = await this.prisma.recLab2Interaction.findMany({
      where: { userId, type: { in: TOGGLE_INTERACTION_TYPES as any } },
      orderBy: { createdAt: 'desc' },
      select: { id: true, jobId: true, type: true },
    });

    // Under normal toggle-button use there's at most one row per (jobId,
    // type) at a time — clicking again deletes the existing row rather than
    // adding a second. But the history view's type-editor could in theory
    // land two rows on the same (jobId, type) pair (e.g. editing one
    // interaction's type to match another job's still-active toggle) — keep
    // only the most recent in that case, since that's what an actual toggle
    // sequence would leave behind.
    const seen = new Set<string>();
    const active: RecLab2ActiveToggle[] = [];
    for (const row of rows) {
      const key = `${row.jobId}:${row.type}`;
      if (seen.has(key)) continue;
      seen.add(key);
      active.push({ id: row.id, jobId: row.jobId, type: row.type });
    }
    return active;
  }

  /**
   * Lets the history view re-classify a logged interaction (e.g. someone
   * fat-fingered "Dismiss" and meant "Save"). Weight is recomputed from the
   * new type rather than kept as-is, since weight is supposed to always
   * reflect "what recLab2WeightFor says for this type" — see the weight
   * comment on JobInteraction in schema.prisma for the same principle.
   * Because getInteractionHistory's score is computed live from these rows
   * (nothing cached), this is the only place that needs to change for the
   * score to update everywhere it's shown; ranking-propagation (not wired
   * up yet) will pick this up automatically once it reads this table too.
   */
  async updateInteraction(
    clerkId: string,
    interactionId: string,
    newType: InteractionType,
  ): Promise<RecLab2InteractionRecord> {
    const userId = await this.userService.ensureUser(clerkId);
    const existing = await this.prisma.recLab2Interaction.findUnique({ where: { id: interactionId } });
    if (!existing) throw new NotFoundException('Interaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    // Same SAVED/DISMISSED mutual exclusion as logInteraction — editing a
    // row's type to SAVED should un-dismiss that job (and vice versa), not
    // leave it in both boxes.
    await this.clearOpposingToggle(userId, existing.jobId, newType, interactionId);
    const row = await this.prisma.recLab2Interaction.update({
      where: { id: interactionId },
      data: { type: newType as any, weight: recLab2WeightFor(newType) },
    });
    return this.toInteractionRecord(row);
  }

  /** Grouped by job: each job's most recent `perJobLimit` interactions plus its total score — direct (this job's own interactions) + propagated (a fraction from similar jobs' interactions, individually attributed via propagatedFrom). Jobs with more interactions, then higher score, sort first. */
  async getInteractionHistory(clerkId: string, perJobLimit = 10): Promise<RecLab2JobHistory[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const rows = await this.prisma.recLab2Interaction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const byJob = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byJob.get(row.jobId) ?? [];
      list.push(row);
      byJob.set(row.jobId, list);
    }

    const scoreBreakdown = await this.computeAllJobScores(userId);

    const history: RecLab2JobHistory[] = [...byJob.entries()].map(([jobId, jobRows]) => {
      // Falls back to a plain direct-only recompute if this job somehow
      // isn't in the breakdown (e.g. TEST_DATASET no longer includes an id
      // that still has old interaction rows) — defensive, shouldn't happen
      // in practice since every interaction is logged against a current
      // TEST_DATASET job.
      const fallbackDirect = () => aggregateInteractionScore(
        jobRows.map(r => ({ weight: r.weight, createdAt: r.createdAt })),
        { decay: true },
      );
      const breakdown = scoreBreakdown.get(jobId);
      return {
        jobId,
        jobTitle: jobRows[0].jobTitle,
        jobCompany: jobRows[0].jobCompany ?? undefined,
        score: breakdown?.total ?? fallbackDirect(),
        directScore: breakdown?.direct ?? fallbackDirect(),
        propagatedScore: breakdown?.propagated ?? 0,
        propagatedFrom: breakdown?.propagatedContributions ?? [],
        interactionCount: jobRows.length,
        recentInteractions: jobRows.slice(0, perJobLimit).map(r => this.toInteractionRecord(r)),
      };
    });

    history.sort((a, b) => b.interactionCount - a.interactionCount || b.score - a.score);
    return history;
  }

  /**
   * Wipes both the caller's Rec Lab 2 interactions AND their session
   * history — the "reset scores" button. Sessions are included because
   * their metrics (avgTopFiveScoreChange, first-positive/most-interacted
   * position) are entirely derived from the interactions being deleted;
   * leaving them behind would strand stale, now-meaningless rows on the
   * Metrics screen. This is also the easiest way to clear out any sessions
   * created by the onScroll double-fire bug (fixed in RecLab2.tsx's
   * ensureSession) — hit this button once to start the Metrics graphs clean.
   */
  async resetInteractions(clerkId: string): Promise<{ success: true }> {
    const userId = await this.userService.ensureUser(clerkId);
    await this.prisma.$transaction([
      this.prisma.recLab2Interaction.deleteMany({ where: { userId } }),
      this.prisma.recLab2Session.deleteMany({ where: { userId } }),
    ]);
    return { success: true };
  }

  // ── Interaction sessions (see RecLab2Session in schema.prisma) ──────────

  /**
   * Starts a new session: snapshots every TEST_DATASET job's current
   * position (from getRecommendedJobs' order) and score (direct +
   * propagated, from getJobScores) as the fixed baseline endSession() will
   * later diff against. Called the moment the frontend detects the user's
   * focus entering the Recommended Jobs box (first click or scroll) — see
   * RecLab2.tsx's ensureSession().
   */
  async startSession(clerkId: string): Promise<RecLab2SessionStart> {
    const userId = await this.userService.ensureUser(clerkId);

    const [ordered, scoreByJobId, sessionCount] = await Promise.all([
      this.getRecommendedJobs(clerkId),
      this.getJobScores(userId),
      this.prisma.recLab2Session.count({ where: { userId } }),
    ]);

    const startSnapshot: SessionSnapshotEntry[] = ordered.map((r, position) => ({
      jobId: r.job.id,
      position,
      score: scoreByJobId.get(r.job.id) ?? 0,
    }));

    const row = await this.prisma.recLab2Session.create({
      data: {
        userId,
        sessionNumber: sessionCount + 1,
        startSnapshot: startSnapshot as any,
      },
    });

    return {
      id: row.id,
      sessionNumber: row.sessionNumber,
      startedAt: row.startedAt.toISOString(),
    };
  }

  /**
   * Ends a session and computes its three headline metrics against the
   * interactions logged during it (RecLab2Interaction rows tagged with this
   * sessionId — see logInteraction). Idempotent: calling this again on an
   * already-ended session just returns what was already computed, rather
   * than recomputing (a page-unload beacon and a component-unmount handler
   * can both legitimately fire for the same session — see RecLab2.tsx).
   */
  async endSession(clerkId: string, sessionId: string): Promise<RecLab2SessionSummary> {
    const userId = await this.userService.ensureUser(clerkId);
    const session = await this.prisma.recLab2Session.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.userId !== userId) throw new ForbiddenException();

    if (session.endedAt) {
      return this.toSessionSummary(session);
    }

    const snapshot = Array.isArray(session.startSnapshot) ? (session.startSnapshot as unknown as SessionSnapshotEntry[]) : [];
    const snapshotByJobId = new Map(snapshot.map(s => [s.jobId, s]));

    const currentScores = await this.getJobScores(userId);

    const topFive = snapshot.filter(s => s.position < 5);
    const avgTopFiveScoreChange = topFive.length
      ? topFive.reduce((sum, s) => sum + ((currentScores.get(s.jobId) ?? 0) - s.score), 0) / topFive.length
      : null;

    const sessionInteractions = await this.prisma.recLab2Interaction.findMany({
      where: { userId, sessionId },
      orderBy: { createdAt: 'asc' },
    });

    let firstPositivePosition: number | null = null;
    const firstPositive = sessionInteractions.find(i => i.weight > 0);
    if (firstPositive) {
      firstPositivePosition = snapshotByJobId.get(firstPositive.jobId)?.position ?? null;
    }

    let mostInteractedPosition: number | null = null;
    if (sessionInteractions.length) {
      const countByJobId = new Map<string, number>();
      for (const i of sessionInteractions) {
        countByJobId.set(i.jobId, (countByJobId.get(i.jobId) ?? 0) + 1);
      }
      let bestJobId: string | null = null;
      let bestCount = 0;
      // sessionInteractions is already createdAt-ascending, so the first
      // jobId to reach the eventual max count wins ties (earliest engaged).
      for (const i of sessionInteractions) {
        const count = countByJobId.get(i.jobId)!;
        if (count > bestCount) {
          bestCount = count;
          bestJobId = i.jobId;
        }
      }
      mostInteractedPosition = bestJobId ? snapshotByJobId.get(bestJobId)?.position ?? null : null;
    }

    const updated = await this.prisma.recLab2Session.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        avgTopFiveScoreChange,
        firstPositivePosition,
        mostInteractedPosition,
      },
    });

    this.logger.log(`Ended Rec Lab 2 session ${sessionId} for user ${userId}: avgTopFiveScoreChange=${avgTopFiveScoreChange}, firstPositivePosition=${firstPositivePosition}, mostInteractedPosition=${mostInteractedPosition}`);

    return this.toSessionSummary(updated);
  }

  /** Every ended session, oldest first — the data the "Metrics" screen graphs against sessionNumber. */
  async listSessions(clerkId: string): Promise<RecLab2SessionSummary[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const rows = await this.prisma.recLab2Session.findMany({
      where: { userId, endedAt: { not: null } },
      orderBy: { sessionNumber: 'asc' },
    });
    return rows.map(r => this.toSessionSummary(r));
  }

  private toSessionSummary(row: any): RecLab2SessionSummary {
    return {
      id: row.id,
      sessionNumber: row.sessionNumber,
      startedAt: row.startedAt.toISOString(),
      endedAt: (row.endedAt ?? row.startedAt).toISOString(),
      avgTopFiveScoreChange: row.avgTopFiveScoreChange ?? null,
      firstPositivePosition: row.firstPositivePosition ?? null,
      mostInteractedPosition: row.mostInteractedPosition ?? null,
    };
  }

  private toInteractionRecord(row: any): RecLab2InteractionRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      jobCompany: row.jobCompany ?? undefined,
      type: row.type,
      weight: row.weight,
      createdAt: row.createdAt.toISOString(),
    };
  }
}

/**
 * Rec Lab 2's own weight table — just weightFor() from scoring.ts, except
 * VIEWED is worth 1 point here instead of 0. Deliberately not changed in
 * the shared INTERACTION_WEIGHTS constant: that table also backs
 * RecLabService.rank()'s live scoring for the original Rec Lab, and
 * bumping VIEWED there would quietly shift every real job's score in the
 * live app. Overriding it locally keeps that untouched.
 */
function recLab2WeightFor(type: InteractionType): number {
  if (type === 'VIEWED') return 1;
  return weightFor(type);
}

/**
 * Deterministic string -> 32-bit seed hash (FNV-1a) feeding mulberry32
 * below — together these give a seeded PRNG from a plain string, so the
 * same input set always produces the same "random" picks. See
 * applyBatchCap's novelty-selection comment for why that matters here.
 */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Small, fast seeded PRNG (mulberry32) — good enough for picking a handful of novelty jobs, not for anything security-sensitive. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks `count` random (seeded) elements out of `items` without replacement, order-independent — used for novelty picks. Returns all of `items` if there aren't more than `count`. */
function pickRandomSubset<T>(items: T[], count: number, seed: string): T[] {
  if (items.length <= count) return [...items];
  const rand = mulberry32(hashSeed(seed));
  const pool = [...items];
  const picks: T[] = [];
  for (let i = 0; i < count; i++) {
    const idx = Math.floor(rand() * pool.length);
    picks.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picks;
}

/** Reorders `scored` to match `order` (a list of job ids). Anything in `scored` that isn't in `order` — e.g. a job embedded after the last sort — is appended at the end, in whatever order it was already in. */
function reorderByStoredIds(scored: RecLab2RankedJob[], order: string[]): RecLab2RankedJob[] {
  const byId = new Map(scored.map(s => [s.job.id, s]));
  const ordered: RecLab2RankedJob[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (item) {
      ordered.push(item);
      byId.delete(id);
    }
  }
  ordered.push(...byId.values());
  return ordered;
}
