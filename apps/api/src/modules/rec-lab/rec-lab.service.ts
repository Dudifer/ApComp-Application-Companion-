import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import type {
  Job,
  CvProfile,
  RankedJob,
  JobInteractionRecord,
  LogInteractionInput,
  UpdateInteractionInput,
  TimelinePoint,
} from '@apcomp/types';
import { PrismaService } from '../prisma/prisma.service';
import { UserService } from '../../auth/user.service';
import { EmbeddingService } from './embedding.service';
import { cvProfileToTexts, jobToTexts, hashFieldTexts, FieldTexts } from './text';
import { catalogRowToJob } from './catalog-embedding';
import {
  weightFor,
  POSITIVE_INTERACTION_TYPES,
  NEGATIVE_PROPAGATION_TYPES,
  aggregateInteractionScore,
  applyMostRecentSuppression,
  computeCvSimilarity,
  compositeEmbedding,
  similarityToLikedJobs,
  rankCandidates,
  Candidate,
  FieldEmbeddings,
  LikedJobVector,
} from './scoring';

@Injectable()
export class RecLabService {
  private readonly logger = new Logger(RecLabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly userService: UserService,
    private readonly embeddings: EmbeddingService,
  ) {}

  // ── CV embeddings ────────────────────────────────────────────────────────

  private async ensureCvEmbeddings(userId: string): Promise<FieldEmbeddings | null> {
    const row = await this.prisma.cvProfile.findUnique({ where: { userId } });
    if (!row) return null;

    const profile: CvProfile = {
      name: row.name ?? undefined,
      email: row.email ?? undefined,
      rawText: row.rawText ?? undefined,
      roles: row.roles as CvProfile['roles'],
      skills: row.skills as CvProfile['skills'],
      practices: row.practices as string[],
      projects: row.projects as CvProfile['projects'],
      gapQuestions: row.gapQuestions as CvProfile['gapQuestions'],
      isComplete: row.isComplete,
    };

    const texts = cvProfileToTexts(profile);
    const hash = hashFieldTexts(texts);

    const hasCachedVectors =
      row.embeddingSourceHash === hash &&
      row.titleEmbedding.length > 0 &&
      row.descriptionEmbedding.length > 0;

    if (hasCachedVectors) {
      return { title: row.titleEmbedding, description: row.descriptionEmbedding };
    }

    this.logger.log(`Recomputing CV embeddings for user ${userId}`);
    const [title, description] = await this.embeddings.embedBatch([
      texts.title,
      texts.description,
    ]);

    await this.prisma.cvProfile.update({
      where: { userId },
      data: {
        titleEmbedding: title,
        descriptionEmbedding: description,
        // Skills text is folded into `description` now (see text.ts) —
        // clear out any stale vector from the old three-field scheme.
        skillsEmbedding: [],
        embeddingSourceHash: hash,
        embeddingUpdatedAt: new Date(),
      },
    });

    return { title, description };
  }

  // ── Job embeddings ───────────────────────────────────────────────────────

  private async ensureJobEmbeddings(jobs: Job[]): Promise<Map<string, FieldEmbeddings>> {
    const result = new Map<string, FieldEmbeddings>();
    if (!jobs.length) return result;

    const existing = await this.prisma.jobEmbedding.findMany({
      where: { jobId: { in: jobs.map(j => j.id) } },
    });
    const existingByJobId = new Map(existing.map(e => [e.jobId, e]));

    const toCompute: { job: Job; texts: FieldTexts; hash: string }[] = [];

    for (const job of jobs) {
      const texts = jobToTexts(job);
      const hash = hashFieldTexts(texts);
      const cached = existingByJobId.get(job.id);
      if (cached && cached.sourceHash === hash) {
        result.set(job.id, {
          title: cached.titleEmbedding,
          description: cached.descriptionEmbedding,
        });
      } else {
        toCompute.push({ job, texts, hash });
      }
    }

    if (toCompute.length) {
      this.logger.log(`Computing embeddings for ${toCompute.length} job(s)`);
      // One batch call for everything: [title0, desc0, title1, desc1, ...]
      const flatTexts = toCompute.flatMap(c => [c.texts.title, c.texts.description]);
      const flatVectors = await this.embeddings.embedBatch(flatTexts);

      await this.prisma.$transaction(
        toCompute.map((c, i) => {
          const title = flatVectors[i * 2];
          const description = flatVectors[i * 2 + 1];
          result.set(c.job.id, { title, description });
          return this.prisma.jobEmbedding.upsert({
            where: { jobId: c.job.id },
            update: {
              title: c.job.title,
              company: c.job.company,
              titleEmbedding: title,
              descriptionEmbedding: description,
              // Skills text is folded into `description` now — clear any
              // stale vector left from the old three-field scheme.
              skillsEmbedding: [],
              sourceHash: c.hash,
            },
            create: {
              jobId: c.job.id,
              source: c.job.source,
              externalId: c.job.externalId,
              title: c.job.title,
              company: c.job.company,
              titleEmbedding: title,
              descriptionEmbedding: description,
              sourceHash: c.hash,
            },
          });
        }),
      );
    }

    return result;
  }

  // ── Interactions ─────────────────────────────────────────────────────────

  async logInteraction(clerkId: string, input: LogInteractionInput): Promise<JobInteractionRecord> {
    const userId = await this.userService.ensureUser(clerkId);
    const row = await this.prisma.jobInteraction.create({
      data: {
        userId,
        jobId: input.jobId,
        source: input.source,
        externalId: input.externalId,
        jobTitle: input.jobTitle,
        jobCompany: input.jobCompany,
        type: input.type as any,
        context: (input.context ?? 'RECOMMENDED') as any,
        weight: weightFor(input.type),
        note: input.note,
      },
    });
    if (input.type === 'DISMISSED') {
      await this.setDismissed(userId, input.externalId, input.source, input.jobTitle, input.jobCompany, true);
    }
    return this.toInteractionRecord(row);
  }

  /**
   * Adds or removes a DismissedJob row — the same table the legacy
   * jobs.service.ts dismiss flow uses (POST /jobs/dismiss), so dismissing a
   * job from either surface shares one "set aside" list and one exclusion
   * filter. Matched on (userId, source, jobId=externalId), not the
   * composite Job.id, to line up with how the legacy flow already writes
   * this table.
   */
  private async setDismissed(
    userId: string,
    externalId: string,
    source: string,
    title: string,
    company: string | undefined,
    dismissed: boolean,
  ): Promise<void> {
    if (dismissed) {
      const existing = await this.prisma.dismissedJob.findFirst({
        where: { userId, jobId: externalId, source },
      });
      if (!existing) {
        await this.prisma.dismissedJob.create({
          data: { userId, jobId: externalId, source, title, company: company ?? 'Unknown Company' },
        });
      }
    } else {
      await this.prisma.dismissedJob.deleteMany({ where: { userId, jobId: externalId, source } });
    }
  }

  /** The Rec Lab's "replay" feature — change a past interaction's type and see how re-ranking changes. */
  async updateInteraction(
    clerkId: string,
    interactionId: string,
    input: UpdateInteractionInput,
  ): Promise<JobInteractionRecord> {
    const userId = await this.userService.ensureUser(clerkId);
    const existing = await this.prisma.jobInteraction.findUnique({ where: { id: interactionId } });
    if (!existing) throw new NotFoundException('Interaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();

    const row = await this.prisma.jobInteraction.update({
      where: { id: interactionId },
      data: {
        type: input.type as any,
        weight: weightFor(input.type),
        note: input.note ?? `replayed: was ${existing.type}, changed to ${input.type}`,
      },
    });

    // Keep the DismissedJob "set aside" list in sync with the replay —
    // un-dismissing by replaying away from DISMISSED should make the job
    // recommendable again, and replaying *to* DISMISSED should remove it.
    if (existing.type === 'DISMISSED' && input.type !== 'DISMISSED') {
      await this.setDismissed(userId, existing.externalId, existing.source, existing.jobTitle, existing.jobCompany ?? undefined, false);
    } else if (existing.type !== 'DISMISSED' && input.type === 'DISMISSED') {
      await this.setDismissed(userId, existing.externalId, existing.source, existing.jobTitle, existing.jobCompany ?? undefined, true);
    }

    return this.toInteractionRecord(row);
  }

  async deleteInteraction(clerkId: string, interactionId: string): Promise<{ success: true }> {
    const userId = await this.userService.ensureUser(clerkId);
    const existing = await this.prisma.jobInteraction.findUnique({ where: { id: interactionId } });
    if (!existing) throw new NotFoundException('Interaction not found');
    if (existing.userId !== userId) throw new ForbiddenException();
    await this.prisma.jobInteraction.delete({ where: { id: interactionId } });
    // Deleting a DISMISSED interaction should also un-dismiss the job —
    // otherwise it'd stay excluded from the pool with no interaction record
    // left to explain why.
    if (existing.type === 'DISMISSED') {
      await this.setDismissed(userId, existing.externalId, existing.source, existing.jobTitle, existing.jobCompany ?? undefined, false);
    }
    return { success: true };
  }

  async listInteractions(clerkId: string, jobId?: string): Promise<JobInteractionRecord[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const rows = await this.prisma.jobInteraction.findMany({
      where: { userId, ...(jobId ? { jobId } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(r => this.toInteractionRecord(r));
  }

  private toInteractionRecord(row: any): JobInteractionRecord {
    return {
      id: row.id,
      jobId: row.jobId,
      source: row.source,
      externalId: row.externalId,
      jobTitle: row.jobTitle,
      jobCompany: row.jobCompany ?? undefined,
      // Cast: Prisma generates a nominal enum for `type`/`context`; the
      // runtime string values line up 1:1 with @apcomp/types' InteractionType
      // / InteractionContext unions, but TS won't structurally match them.
      type: row.type as any,
      context: row.context as any,
      weight: row.weight,
      note: row.note ?? undefined,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ── Manual test sets ────────────────────────────────────────────────────

  /**
   * Turns a hand-picked list of job_catalog.id values (e.g. from a manual
   * SQL query — "SELECT id, title FROM job_catalog WHERE ...") into real
   * Job objects, so the Rec Lab can rank a curated set instead of always
   * falling back to the live recommended-jobs feed. Unknown IDs are silently
   * dropped rather than erroring — a typo'd ID just doesn't show up.
   */
  async resolveCatalogJobs(catalogIds: string[]): Promise<Job[]> {
    if (!catalogIds.length) return [];
    const rows = await this.prisma.jobCatalog.findMany({ where: { id: { in: catalogIds } } });
    return rows.map(row => catalogRowToJob(row));
  }

  // ── Ranking ──────────────────────────────────────────────────────────────

  async rank(
    clerkId: string,
    jobs: Job[],
    opts: { limit?: number; noveltyRate?: number; decay?: boolean } = {},
  ): Promise<RankedJob[]> {
    const userId = await this.userService.ensureUser(clerkId);
    if (!jobs.length) return [];

    // Dismissed jobs are removed from the candidate pool outright rather
    // than just score-penalized — see scoring.ts's NEGATIVE_PROPAGATION_TYPES
    // comment for why. Shares the DismissedJob table with the legacy
    // jobs.service.ts dismiss flow (POST /jobs/dismiss) via setDismissed(),
    // so a dismiss from either surface excludes the job here too, and it's
    // the same list GET /jobs/dismissed shows the user.
    const dismissedRows = await this.prisma.dismissedJob.findMany({ where: { userId } });
    const dismissedKeys = new Set(dismissedRows.map(d => `${d.source}::${d.jobId}`));
    jobs = jobs.filter(j => !dismissedKeys.has(`${j.source}::${j.externalId}`));
    if (!jobs.length) return [];

    const [cvEmbeddings, jobEmbeddings] = await Promise.all([
      this.ensureCvEmbeddings(userId),
      this.ensureJobEmbeddings(jobs),
    ]);

    // All of this user's interactions — used for per-job interaction score
    // *and* to find which jobs count as "liked" for the similarity signal.
    const allInteractions = await this.prisma.jobInteraction.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    const interactionsByJobId = new Map<string, typeof allInteractions>();
    for (const i of allInteractions) {
      const list = interactionsByJobId.get(i.jobId) ?? [];
      list.push(i);
      interactionsByJobId.set(i.jobId, list);
    }

    // Liked jobs propagate a *positive* signal to similar jobs — deliberately
    // NOT cleared by a later dismiss on the same job. Dismissing a job you
    // clicked/saved/applied to means "not this one" (maybe you already got
    // it, maybe it's a duplicate), not "I was wrong to like that kind of
    // job" — so it keeps counting as a taste signal for similar listings.
    const likedJobIds = [
      ...new Set(
        allInteractions
          .filter(i => POSITIVE_INTERACTION_TYPES.includes(i.type as any))
          .map(i => i.jobId),
      ),
    ];

    // Disliked jobs propagate a *negative* signal — scoped to LESS_LIKE_THIS
    // only. That button is an explicit, deliberate "show me less of this
    // kind of thing," unlike DISMISSED which only suppresses the exact job
    // (handled below via applyMostRecentSuppression).
    const dislikedJobIds = [
      ...new Set(
        allInteractions
          .filter(i => NEGATIVE_PROPAGATION_TYPES.includes(i.type as any))
          .map(i => i.jobId),
      ),
    ];

    const [likedJobEmbeddingRows, dislikedJobEmbeddingRows] = await Promise.all([
      likedJobIds.length
        ? this.prisma.jobEmbedding.findMany({ where: { jobId: { in: likedJobIds } } })
        : Promise.resolve([]),
      dislikedJobIds.length
        ? this.prisma.jobEmbedding.findMany({ where: { jobId: { in: dislikedJobIds } } })
        : Promise.resolve([]),
    ]);

    const toVectors = (rows: typeof likedJobEmbeddingRows): LikedJobVector[] => rows.map(row => ({
      jobId: row.jobId,
      title: row.title,
      company: row.company ?? undefined,
      composite: compositeEmbedding({
        title: row.titleEmbedding,
        description: row.descriptionEmbedding,
      }),
    }));
    const likedJobVectors = toVectors(likedJobEmbeddingRows);
    const dislikedJobVectors = toVectors(dislikedJobEmbeddingRows);

    const candidates: Candidate<Job>[] = jobs.map(job => {
      const fields = jobEmbeddings.get(job.id);
      const cvSimilarity = cvEmbeddings && fields
        ? computeCvSimilarity(cvEmbeddings, fields)
        : { title: 0, description: 0, combined: 0 };

      const jobComposite = fields ? compositeEmbedding(fields) : [];
      // Exclude the job itself so "similar to a liked/disliked job" never just points at itself.
      const otherLiked = likedJobVectors.filter(lj => lj.jobId !== job.id);
      const otherDisliked = dislikedJobVectors.filter(dj => dj.jobId !== job.id);
      const { similarity: likedSimilarity, best: mostSimilarLikedJob } = jobComposite.length
        ? similarityToLikedJobs(jobComposite, otherLiked)
        : { similarity: 0, best: undefined };
      const { similarity: dislikedSimilarity, best: mostSimilarDislikedJob } = jobComposite.length
        ? similarityToLikedJobs(jobComposite, otherDisliked)
        : { similarity: 0, best: undefined };

      const interactions = interactionsByJobId.get(job.id) ?? [];
      let interactionScoreRaw = aggregateInteractionScore(
        interactions.map(i => ({ weight: i.weight, createdAt: i.createdAt })),
        { decay: opts.decay ?? true },
      );
      // A later dismiss/less-like-this overrides prior positive history for
      // *this specific job* — see applyMostRecentSuppression's doc comment.
      interactionScoreRaw = applyMostRecentSuppression(
        interactions.map(i => ({ weight: i.weight, createdAt: i.createdAt, type: i.type as any })),
        interactionScoreRaw,
      );

      return {
        job,
        cvSimilarity,
        likedSimilarity,
        mostSimilarLikedJob,
        dislikedSimilarity,
        mostSimilarDislikedJob,
        interactionScoreRaw,
        interactionCount: interactions.length,
      };
    });

    const ranked = rankCandidates(candidates, {
      limit: opts.limit ?? jobs.length,
      noveltyRate: opts.noveltyRate,
    });

    return ranked.map(r => ({
      job: r.job,
      explanation: {
        cvSimilarity: r.cvSimilarity,
        similarityToLikedJobs: r.likedSimilarity,
        mostSimilarLikedJob: r.mostSimilarLikedJob,
        similarityToDislikedJobs: r.dislikedSimilarity,
        mostSimilarDislikedJob: r.mostSimilarDislikedJob,
        interactionScoreRaw: r.interactionScoreRaw,
        interactionScore: r.interactionScore,
        interactionCount: r.interactionCount,
        finalScore: r.finalScore,
        novelty: r.novelty,
      },
    }));
  }

  // ── Timeline (saved/liked jobs over time) ───────────────────────────────

  async timeline(clerkId: string): Promise<TimelinePoint[]> {
    const userId = await this.userService.ensureUser(clerkId);
    const rows = await this.prisma.jobInteraction.findMany({
      where: { userId, type: { in: ['SAVED', 'APPLIED', 'MORE_LIKE_THIS'] as any } },
      orderBy: { createdAt: 'asc' },
    });

    const byDate = new Map<string, TimelinePoint>();
    for (const row of rows) {
      const date = row.createdAt.toISOString().slice(0, 10);
      const point = byDate.get(date) ?? { date, count: 0, jobs: [] };
      point.count += 1;
      point.jobs.push({ jobId: row.jobId, title: row.jobTitle, company: row.jobCompany ?? undefined });
      byDate.set(date, point);
    }

    return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  }
}
