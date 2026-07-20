import { Injectable, Logger } from '@nestjs/common';
import type { Job, CvProfile } from '@apcomp/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../../auth/user.service';
import { EmbeddingService } from './embedding.service';
import { TEST_DATASET } from './test-dataset';
import { catalogRowToJob } from './catalog-embedding';
import { cvProfileToTexts, hashFieldTexts } from './text';
import { compositeEmbedding, cosineSimilarity, toPercent, FieldEmbeddings } from './scoring';

/** A test-dataset job paired with its cosine-similarity match to the user's CV, 0-100 (or null if there's no CV, or no embedding yet for this particular job). */
export interface RecLab2RankedJob {
  job: Job;
  similarity: number | null;
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
   * The "once per upload" part is tracked via CvProfile.recLab2SortHash,
   * which stores the CV's embeddingSourceHash as of the last sort. A CV
   * re-upload changes that hash once it's re-embedded below, so the stored
   * value naturally goes stale and triggers exactly one more re-sort — no
   * separate "reset the flag" step needed anywhere else (e.g. the resume
   * upload flow doesn't need to know this feature exists).
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

    const needsSort = cvRow.recLab2SortHash !== currentHash;
    if (needsSort) {
      scored.sort((a, b) => (b.similarity ?? -1) - (a.similarity ?? -1));
      await this.prisma.cvProfile.update({
        where: { userId },
        data: { recLab2SortHash: currentHash },
      });
      this.logger.log(`Sorted Rec Lab 2 recommended jobs by CV similarity for user ${userId} (new/changed CV embedding).`);
    }

    return scored;
  }
}
