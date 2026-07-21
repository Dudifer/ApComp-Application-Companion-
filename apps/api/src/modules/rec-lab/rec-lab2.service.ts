import { Injectable, Logger } from '@nestjs/common';
import type { Job, CvProfile, InteractionType } from '@apcomp/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../../auth/user.service';
import { EmbeddingService } from './embedding.service';
import { TEST_DATASET } from './test-dataset';
import { catalogRowToJob } from './catalog-embedding';
import { cvProfileToTexts, hashFieldTexts } from './text';
import { compositeEmbedding, cosineSimilarity, toPercent, weightFor, aggregateInteractionScore, FieldEmbeddings } from './scoring';

/** A test-dataset job paired with its cosine-similarity match to the user's CV, 0-100 (or null if there's no CV, or no embedding yet for this particular job). */
export interface RecLab2RankedJob {
  job: Job;
  similarity: number | null;
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

/** One job's interaction history for the "View interaction history" screen — its most recent interactions plus a total score computed the same way (weightFor + aggregateInteractionScore) as the original Rec Lab, just not (yet) fed into any ranking. */
export interface RecLab2JobHistory {
  jobId: string;
  jobTitle: string;
  jobCompany?: string;
  score: number;
  interactionCount: number;
  recentInteractions: RecLab2InteractionRecord[];
}

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
      return jobs.map(job => ({ job, similarity: null }));
    }

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

    const cvComposite = compositeEmbedding(cvEmbeddings);

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

    if (hasStoredOrder) {
      // Already sorted for this exact CV embedding — replay the persisted
      // order instead of recomputing. (Similarity scores above are always
      // recomputed fresh regardless, so display stays accurate even for
      // jobs embedded after the last sort.)
      return reorderByStoredIds(scored, storedOrder);
    }

    scored.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
    await this.prisma.cvProfile.update({
      where: { userId },
      data: {
        recLab2SortHash: currentHash,
        recLab2JobOrder: scored.map(s => s.job.id),
      },
    });
    this.logger.log(`Sorted Rec Lab 2 recommended jobs by CV similarity for user ${userId} (new/changed CV embedding).`);

    return scored;
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

  // ── Interactions (tracked, not yet wired into ranking) ──────────────────
  //
  // Deliberately its own table (RecLab2Interaction, not JobInteraction) —
  // see the schema.prisma comment on that model for why sharing the
  // original table would leak into the live app's dismissed-jobs list and
  // the original Rec Lab's scoring. Nothing here reads these rows for
  // ranking; getRecommendedJobs() above is untouched by any of this.

  async logInteraction(
    clerkId: string,
    input: { jobId: string; jobTitle: string; jobCompany?: string; type: InteractionType },
  ): Promise<RecLab2InteractionRecord> {
    const userId = await this.userService.ensureUser(clerkId);
    const row = await this.prisma.recLab2Interaction.create({
      data: {
        userId,
        jobId: input.jobId,
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        type: input.type as any,
        weight: weightFor(input.type),
      },
    });
    return this.toInteractionRecord(row);
  }

  /** Grouped by job: each job's most recent `perJobLimit` interactions plus its total score (same weightFor/aggregateInteractionScore math as the original Rec Lab). Jobs with more interactions, then higher score, sort first. */
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

    const history: RecLab2JobHistory[] = [...byJob.entries()].map(([jobId, jobRows]) => ({
      jobId,
      jobTitle: jobRows[0].jobTitle,
      jobCompany: jobRows[0].jobCompany ?? undefined,
      score: aggregateInteractionScore(
        jobRows.map(r => ({ weight: r.weight, createdAt: r.createdAt })),
        { decay: true },
      ),
      interactionCount: jobRows.length,
      recentInteractions: jobRows.slice(0, perJobLimit).map(r => this.toInteractionRecord(r)),
    }));

    history.sort((a, b) => b.interactionCount - a.interactionCount || b.score - a.score);
    return history;
  }

  async resetInteractions(clerkId: string): Promise<{ success: true }> {
    const userId = await this.userService.ensureUser(clerkId);
    await this.prisma.recLab2Interaction.deleteMany({ where: { userId } });
    return { success: true };
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
