/**
 * embed-jobs.ts
 *
 * Backfills JobEmbedding rows for job_catalog entries. Safe to Ctrl+C and
 * resume, or re-run periodically as a catch-all — including across totally
 * separate process invocations (see embed-jobs-loop.ts), because the
 * default (non---force) mode asks the database directly for rows that don't
 * have a JobEmbedding yet, rather than paginating through everything and
 * skipping client-side. That distinction matters: paginating-and-skipping
 * only advances within a single process's lifetime, so a wrapper that
 * restarts this as a fresh process every N rows would otherwise re-fetch
 * the same already-done rows forever and never make progress.
 *
 * This uses the local embedding model (Xenova/all-MiniLM-L6-v2, CPU) — for
 * a full catalog (hundreds of thousands of rows) expect this to take hours,
 * not minutes. Run it somewhere it can sit in the background.
 *
 * Usage:
 *   pnpm jobs:embed                  # active jobs only, skip already-embedded
 *   pnpm jobs:embed -- --force       # re-embed everything, even unchanged
 *   pnpm jobs:embed -- --status=all  # include inactive/expired listings too
 *   pnpm jobs:embed -- --limit=5000  # cap how many rows to process this run
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma';
import { EmbeddingService } from '../modules/rec-lab/embedding.service';
import { embedCatalogRows, CatalogRow } from '../modules/rec-lab/catalog-embedding';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const statusArg = args.find(a => a.startsWith('--status='))?.split('=')[1];
const STATUS = statusArg ?? 'active'; // 'active' | 'all'
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = limitArg ? Number(limitArg) : undefined;

const PAGE_SIZE = 200;

const prisma = new PrismaClient();
const embeddings = new EmbeddingService();

// ── Row fetching ─────────────────────────────────────────────────────────
//
// Non-force mode: ask Postgres directly for job_catalog rows that don't
// have a matching job_embeddings row yet (anti-join), so every call — even
// from a brand-new process with no memory of prior runs — naturally picks
// up wherever the backfill actually left off.
//
// Force mode: plain pagination over everything matching the status filter,
// since the whole point is to revisit rows that already have an embedding.

async function countUnembedded(status: string): Promise<number> {
  const rows = status === 'all'
    ? await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM job_catalog jc
        WHERE NOT EXISTS (SELECT 1 FROM job_embeddings je WHERE je."jobId" = 'openjobdata-' || jc.id)
      `
    : await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*)::bigint AS count FROM job_catalog jc
        WHERE jc.status = ${status}
          AND NOT EXISTS (SELECT 1 FROM job_embeddings je WHERE je."jobId" = 'openjobdata-' || jc.id)
      `;
  return Number(rows[0]?.count ?? 0);
}

async function fetchUnembeddedBatch(status: string, take: number): Promise<CatalogRow[]> {
  return status === 'all'
    ? prisma.$queryRaw<CatalogRow[]>`
        SELECT jc.id, jc.title, jc.company, jc."locationDisplay", jc.city, jc.state, jc.country,
               jc."isRemote", jc."employmentType", jc.department, jc."workplaceType",
               jc.description, jc."applyUrl", jc."postedAt"
        FROM job_catalog jc
        WHERE NOT EXISTS (SELECT 1 FROM job_embeddings je WHERE je."jobId" = 'openjobdata-' || jc.id)
        ORDER BY jc.id ASC
        LIMIT ${take}
      `
    : prisma.$queryRaw<CatalogRow[]>`
        SELECT jc.id, jc.title, jc.company, jc."locationDisplay", jc.city, jc.state, jc.country,
               jc."isRemote", jc."employmentType", jc.department, jc."workplaceType",
               jc.description, jc."applyUrl", jc."postedAt"
        FROM job_catalog jc
        WHERE jc.status = ${status}
          AND NOT EXISTS (SELECT 1 FROM job_embeddings je WHERE je."jobId" = 'openjobdata-' || jc.id)
        ORDER BY jc.id ASC
        LIMIT ${take}
      `;
}

async function main() {
  console.log(
    `\nApComp Job Embedding Backfill — status=${STATUS}` +
    `${FORCE ? ' (force re-embed)' : ''}${LIMIT ? ` (limit ${LIMIT})` : ''}`,
  );
  console.log('─'.repeat(60));

  await prisma.$connect();

  const where = STATUS === 'all' ? {} : { status: STATUS };
  const matchingTotal = FORCE
    ? await prisma.jobCatalog.count({ where })
    : await countUnembedded(STATUS);
  const targetCount = LIMIT ? Math.min(LIMIT, matchingTotal) : matchingTotal;

  console.log(
    FORCE
      ? `${matchingTotal.toLocaleString()} rows match (processing ${targetCount.toLocaleString()})\n`
      : `${matchingTotal.toLocaleString()} rows still need embedding (processing ${targetCount.toLocaleString()})\n`,
  );

  if (!targetCount) {
    console.log('Nothing to do.\n');
    await prisma.$disconnect();
    return;
  }

  // Warm the model once up front (downloads weights on first-ever run) so
  // the progress line below reflects real embedding throughput, not a
  // one-time model-load cost buried in the first batch.
  process.stdout.write('Loading embedding model (first run downloads ~90MB, cached after)... ');
  await embeddings.embed('warmup');
  console.log('ready\n');

  let processed = 0;
  let embedded = 0;
  let skipped = 0;
  let failed = 0;
  let cursor: string | undefined;
  const startedAt = Date.now();

  while (processed < targetCount) {
    const take = Math.min(PAGE_SIZE, targetCount - processed);

    const rows = FORCE
      ? await prisma.jobCatalog.findMany({
          where,
          take,
          ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
          orderBy: { id: 'asc' },
        })
      : await fetchUnembeddedBatch(STATUS, take);

    if (!rows.length) break;
    if (FORCE) cursor = rows[rows.length - 1].id;

    const result = await embedCatalogRows(prisma, embeddings, rows, { force: FORCE });
    embedded += result.embedded;
    skipped += result.skipped;
    failed += result.failed;
    processed += rows.length;

    const elapsedSec = (Date.now() - startedAt) / 1000;
    const rate = processed / Math.max(elapsedSec, 1);
    const etaSec = rate > 0 ? Math.round((targetCount - processed) / rate) : 0;
    process.stdout.write(
      `\r  ${processed.toLocaleString()}/${targetCount.toLocaleString()} — ` +
      `${embedded.toLocaleString()} embedded, ${skipped.toLocaleString()} skipped, ${failed.toLocaleString()} failed ` +
      `(${rate.toFixed(1)}/s, ~${Math.floor(etaSec / 60)}m remaining)   `,
    );

    // Non-force mode has no cursor to advance — if a batch comes back with
    // nothing newly embedded (e.g. every row in it failed), stop instead of
    // looping forever re-fetching the same still-unembedded rows.
    if (!FORCE && result.embedded === 0) break;
  }

  console.log('\n' + '─'.repeat(60));
  console.log(
    `Done. Embedded ${embedded.toLocaleString()}, skipped ${skipped.toLocaleString()} (already current), ` +
    `failed ${failed.toLocaleString()}.\n`,
  );

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n' + (err?.message ?? err));
  process.exit(1);
});
