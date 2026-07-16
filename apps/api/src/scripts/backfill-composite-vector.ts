/**
 * backfill-composite-vector.ts
 *
 * One-time backfill: populates JobEmbedding.compositeVector (the pgvector
 * column, see migration 20260715120000_add_pgvector_composite_index) from
 * each row's existing titleEmbedding/descriptionEmbedding Float[] columns,
 * using the exact same averaging math as scoring.ts's compositeEmbedding().
 *
 * No model inference here — just averaging two already-computed arrays and
 * writing the result — so unlike embed-jobs.ts this doesn't need the
 * child-process-restart trick for the ONNX memory leak. One long-lived
 * process is fine and should run in minutes, not hours.
 *
 * Safe to Ctrl+C and resume: rows are selected WHERE "compositeVector" IS
 * NULL, so already-backfilled rows just drop out of the next batch.
 *
 * Usage:
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-composite-vector.ts
 *   npx ts-node -r tsconfig-paths/register src/scripts/backfill-composite-vector.ts --force   # recompute everything
 */
import 'dotenv/config';
import { PrismaClient } from '../../generated/prisma';
import { compositeEmbedding } from '../modules/rec-lab/scoring';

const prisma = new PrismaClient();
const BATCH_SIZE = 2000;
const CONCURRENCY = 25;
const FORCE = process.argv.includes('--force');
const WHERE = FORCE ? '' : `WHERE "compositeVector" IS NULL`;

function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(',')}]`;
}

async function chunkedRun<T>(items: T[], size: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += size) {
    await Promise.all(items.slice(i, i + size).map(fn));
  }
}

async function main() {
  await prisma.$connect();

  const totalRows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM job_embeddings ${WHERE}`,
  );
  const total = Number(totalRows[0]?.count ?? 0);
  console.log(`\nBackfilling compositeVector — ${total.toLocaleString()} rows to process${FORCE ? ' (force)' : ''}\n`);

  if (!total) {
    console.log('Nothing to do.\n');
    await prisma.$disconnect();
    return;
  }

  let processed = 0;
  let written = 0;
  let skippedEmpty = 0;
  const startedAt = Date.now();

  while (true) {
    const rows = await prisma.$queryRawUnsafe<
      { id: string; titleEmbedding: number[]; descriptionEmbedding: number[] }[]
    >(`SELECT id, "titleEmbedding", "descriptionEmbedding" FROM job_embeddings ${WHERE} LIMIT ${BATCH_SIZE}`);

    if (!rows.length) break;

    let batchWritten = 0;
    let batchSkipped = 0;

    await chunkedRun(rows, CONCURRENCY, async row => {
      const composite = compositeEmbedding({
        title: row.titleEmbedding ?? [],
        description: row.descriptionEmbedding ?? [],
      });
      if (!composite.length) {
        batchSkipped++;
        return;
      }
      await prisma.$executeRawUnsafe(
        `UPDATE job_embeddings SET "compositeVector" = $1::vector WHERE id = $2`,
        toVectorLiteral(composite),
        row.id,
      );
      batchWritten++;
    });

    written += batchWritten;
    skippedEmpty += batchSkipped;
    processed += rows.length;
    const elapsedSec = (Date.now() - startedAt) / 1000;
    const rate = processed / Math.max(elapsedSec, 1);
    const etaSec = rate > 0 ? Math.round((total - processed) / rate) : 0;
    process.stdout.write(
      `\r  ${processed.toLocaleString()}/${total.toLocaleString()} — ${written.toLocaleString()} written, ${skippedEmpty.toLocaleString()} skipped (empty) ` +
      `(${rate.toFixed(0)}/s, ~${Math.floor(etaSec / 60)}m remaining)   `,
    );

    // Non-force mode has no cursor to advance beyond the WHERE filter — if a
    // batch writes nothing at all (every row in it was skipped-empty), stop
    // instead of re-fetching the same still-empty rows forever.
    if (!FORCE && batchWritten === 0 && batchSkipped === rows.length) break;
  }

  console.log('\n\nDone.\n');
  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n' + (err?.message ?? err));
  process.exit(1);
});
