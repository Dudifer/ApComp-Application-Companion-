/**
 * embed-jobs-loop.ts
 *
 * Wrapper around embed-jobs.ts for Windows machines hitting a native
 * out-of-memory crash after a few hundred embeddings in one process (a
 * known category of issue with the ONNX Runtime / transformers.js Windows
 * bindings not fully releasing memory across many sequential calls).
 *
 * Instead of one long-lived process, this runs embed-jobs.ts in small
 * chunks, each as a fresh child process — clean memory every time sidesteps
 * the leak entirely. embed-jobs.ts is already idempotent (skips anything
 * already embedded), so a chunk crashing mid-way just costs a retry, not
 * lost progress.
 *
 * Usage:
 *   pnpm jobs:embed:loop                        # chunks of 300, status=active
 *   pnpm jobs:embed:loop -- --chunk=200          # smaller chunks if 300 still crashes
 *   pnpm jobs:embed:loop -- --status=all         # passed straight through to embed-jobs.ts
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import * as path from 'path';
import { PrismaClient } from '../../generated/prisma';

const args = process.argv.slice(2);
const chunkArg = args.find(a => a.startsWith('--chunk='))?.split('=')[1];
const CHUNK = Number(chunkArg ?? 300);
// Everything except --chunk gets passed straight through to embed-jobs.ts
// (--status, --force, etc.) — --limit is set by this loop, not the caller.
const passthroughArgs = args.filter(a => !a.startsWith('--chunk=') && !a.startsWith('--limit='));

const MAX_CONSECUTIVE_FAILURES = 10;
const API_ROOT = path.join(__dirname, '..', '..'); // apps/api

const prisma = new PrismaClient();

async function remainingCount(): Promise<number> {
  const statusArg = passthroughArgs.find(a => a.startsWith('--status='))?.split('=')[1] ?? 'active';
  const where = statusArg === 'all' ? {} : { status: statusArg };
  const total = await prisma.jobCatalog.count({ where });
  const embedded = await prisma.jobEmbedding.count();
  // Approximate — doesn't account for rows whose text changed and need
  // re-embedding, only rows with no JobEmbedding row at all. Good enough
  // for driving an initial bulk backfill loop.
  return Math.max(0, total - embedded);
}

async function main() {
  await prisma.$connect();

  console.log(`\nembed-jobs-loop — chunk size ${CHUNK}, restarting between chunks to avoid the memory crash\n`);

  let consecutiveFailures = 0;
  let round = 0;

  while (true) {
    const remaining = await remainingCount();
    if (remaining <= 0) {
      console.log('\n[loop] All caught up — nothing left to embed.\n');
      break;
    }

    round++;
    console.log(`[loop] Round ${round} — ~${remaining.toLocaleString()} rows remaining, running a chunk of up to ${CHUNK}...`);

    const result = spawnSync(
      'npx',
      ['ts-node', '-r', 'tsconfig-paths/register', 'src/scripts/embed-jobs.ts', `--limit=${CHUNK}`, ...passthroughArgs],
      { stdio: 'inherit', cwd: API_ROOT, shell: true },
    );

    if (result.status === 0) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.log(`[loop] Chunk exited with code ${result.status} — consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('\n[loop] Too many consecutive crashes — stopping. Try a smaller --chunk value (e.g. --chunk=100).\n');
        process.exit(1);
      }
    }
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n' + (err?.message ?? err));
  process.exit(1);
});
