import type { Job } from '@apcomp/types';
import type { PrismaClient } from '../../../generated/prisma';
import { EmbeddingService } from './embedding.service';
import { jobToTexts, hashFieldTexts } from './text';

/**
 * Shared between the one-off backfill script (embed-jobs.ts) and the
 * ongoing import pipeline (import-jobs.ts) — both need to turn raw
 * `job_catalog` rows into JobEmbedding rows, skipping anything already
 * embedded and unchanged.
 */

// Trimmed to just the JobCatalog columns actually needed to build embedding text.
export interface CatalogRow {
  id: string;
  title: string;
  company: string | null;
  locationDisplay: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  isRemote: boolean;
  employmentType: string | null;
  department: string | null;
  workplaceType: string | null;
  description: string | null;
  applyUrl: string | null;
  postedAt: Date | null;
}

/** Mirrors jobs-server.ts's row → Job mapping (kept in sync manually — see that file if this ever drifts). */
export function catalogRowToJob(row: CatalogRow): Job {
  return {
    id: `openjobdata-${row.id}`,
    externalId: row.id,
    source: 'openjobdata',
    title: row.title,
    company: row.company ?? 'Unknown Company',
    location: {
      displayName: row.locationDisplay ?? row.city ?? row.country ?? 'Unknown',
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      country: row.country ?? undefined,
    },
    remote: row.isRemote,
    description: row.description ?? '',
    tags: [row.department, row.workplaceType].filter((x): x is string => Boolean(x)),
    url: row.applyUrl ?? '',
    contractTime: 'unknown',
    contractType: 'unknown',
    employmentType: row.employmentType ?? undefined,
    publisher: 'openjobdata',
    postedAt: row.postedAt?.toISOString() ?? new Date().toISOString(),
    relevanceScore: 0,
    status: 'new',
  };
}

export interface EmbedResult {
  embedded: number;
  skipped: number;
  failed: number;
}

/**
 * Embeds a batch of job_catalog rows into JobEmbedding, skipping any whose
 * title+description+tags text hasn't changed since it was last embedded
 * (same sourceHash check RecLabService uses at request time). Safe to
 * re-run — interrupt it any time, the next run just picks up where it left off.
 */
export async function embedCatalogRows(
  prisma: PrismaClient,
  embeddings: EmbeddingService,
  rows: CatalogRow[],
  opts: { force?: boolean } = {},
): Promise<EmbedResult> {
  if (!rows.length) return { embedded: 0, skipped: 0, failed: 0 };

  const candidates = rows.map(row => {
    const job = catalogRowToJob(row);
    const texts = jobToTexts(job);
    const hash = hashFieldTexts(texts);
    return { job, texts, hash };
  });

  const existing = await prisma.jobEmbedding.findMany({
    where: { jobId: { in: candidates.map(c => c.job.id) } },
    select: { jobId: true, sourceHash: true },
  });
  const existingHashes = new Map(existing.map(e => [e.jobId, e.sourceHash]));

  let skipped = 0;
  const toEmbed = candidates.filter(c => {
    if (!opts.force && existingHashes.get(c.job.id) === c.hash) {
      skipped++;
      return false;
    }
    return true;
  });

  if (!toEmbed.length) return { embedded: 0, skipped, failed: 0 };

  let embedded = 0;
  let failed = 0;

  // Sub-batch so one bad chunk doesn't sink the whole call, and so a caller
  // iterating a huge catalog gets incremental progress rather than one giant
  // all-or-nothing embed call.
  const EMBED_CHUNK = 25;
  for (let i = 0; i < toEmbed.length; i += EMBED_CHUNK) {
    const chunk = toEmbed.slice(i, i + EMBED_CHUNK);
    try {
      const flatTexts = chunk.flatMap(c => [c.texts.title, c.texts.description, c.texts.skills]);
      const flatVectors = await embeddings.embedBatch(flatTexts);

      await prisma.$transaction(
        chunk.map((c, idx) => {
          const title = flatVectors[idx * 3];
          const description = flatVectors[idx * 3 + 1];
          const skills = flatVectors[idx * 3 + 2];
          return prisma.jobEmbedding.upsert({
            where: { jobId: c.job.id },
            update: {
              title: c.job.title,
              company: c.job.company,
              titleEmbedding: title,
              descriptionEmbedding: description,
              skillsEmbedding: skills,
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
              skillsEmbedding: skills,
              sourceHash: c.hash,
            },
          });
        }),
      );
      embedded += chunk.length;
    } catch (err) {
      console.error(`  embedding chunk failed (${chunk.length} jobs):`, (err as Error).message);
      failed += chunk.length;
    }
  }

  return { embedded, skipped, failed };
}
