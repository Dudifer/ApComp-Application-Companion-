/**
 * embed-jobs.ts
 *
 * Backfills JobEmbedding rows for job_catalog entries. Skips anything
 * already embedded whose title/description/tags haven't changed, so it's
 * safe to Ctrl+C and resume, or just re-run periodically as a catch-all.
 *
 * This uses the local embedding model (Xenova/all-MiniLM-L6-v2, CPU) — for
 * a full catalog (hundreds of thousands of rows) expect this to take hours,
 * not minutes. Run it somewhere it can sit in the background; it's fully
 * resumable, so there's no harm stopping and restarting later.
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
import { embedCatalogRows } from '../modules/rec-lab/catalog-embedding';

const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const statusArg = args.find(a => a.startsWith('--status='))?.split('=')[1];
const STATUS = statusArg ?? 'active'; // 'active' | 'all'
const limitArg = args.find(a => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = limitArg ? Number(limitArg) : undefined;

const PAGE_SIZE = 200;

const prisma = new PrismaClient();
const embeddings = new EmbeddingService();

async function main() {
  console.log(
    `\nApComp Job Embedding Backfill — status=${STATUS}` +
    `${FORCE ? ' (force re-embed)' : ''}${LIMIT ? ` (limit ${LIMIT})` : ''}`,
  );
  console.log('─'.repeat(60));

  await prisma.$connect();

  const where = STATUS === 'all' ? {} : { status: STATUS };
  const total = await prisma.jobCatalog.count({ where });
  const targetCount = LIMIT ? Math.min(LIMIT, total) : total;
  console.log(`${total.toLocaleString()} rows match (processing ${targetCount.toLocaleString()})\n`);

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
    const rows = await prisma.jobCatalog.findMany({
      where,
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
    });
    if (!rows.length) break;
    cursor = rows[rows.length - 1].id;

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
