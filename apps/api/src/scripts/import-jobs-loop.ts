/**
 * import-jobs-loop.ts
 *
 * Wrapper around import-jobs.ts's --local-dir mode for a folder of many
 * large (~300MB) parquet files (e.g. a month of daily deltas downloaded by
 * hand). Running them all in one long-lived process lets DuckDB's memory
 * accumulate across files until it OOMs partway through — this instead
 * spawns a fresh subprocess per file, exactly the same fix embed-jobs-loop.ts
 * uses for the (different) Windows embedding-model memory leak.
 *
 * Resumable: each successfully-imported file is marked done in a sidecar
 * ".import-progress" folder next to the data, so re-running the same
 * command after a crash only redoes the file it crashed on, not the whole
 * folder. (import-jobs.ts's upserts are idempotent too, so redoing an
 * already-done file by hand is harmless, just slow.)
 *
 * Usage:
 *   pnpm jobs:import:loop -- --local-dir="C:\path\to\jobdata"
 *   pnpm jobs:import:loop -- --local-dir="C:\path\to\jobdata" --no-embed
 */
import 'dotenv/config';
import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const args = process.argv.slice(2);
const localDirArg = args.find(a => a.startsWith('--local-dir='))?.split('=').slice(1).join('=');

if (!localDirArg) {
  console.error('Usage: pnpm jobs:import:loop -- --local-dir="C:\\path\\to\\jobdata"');
  process.exit(1);
}

const LOCAL_DIR = path.resolve(localDirArg);
// Everything except --local-dir/--file gets passed straight through to
// import-jobs.ts for each file (--embed, --no-embed, --companies, etc.).
const passthroughArgs = args.filter(a => !a.startsWith('--local-dir=') && !a.startsWith('--file='));

const PROGRESS_DIR = path.join(LOCAL_DIR, '.import-progress');
const MAX_CONSECUTIVE_FAILURES = 5;
const API_ROOT = path.join(__dirname, '..', '..'); // apps/api

function listFiles(): string[] {
  return fs.readdirSync(LOCAL_DIR)
    .filter(f => f.toLowerCase().endsWith('.parquet') && f.toLowerCase() !== 'companies.parquet')
    .sort((a, b) => {
      const dateA = a.match(/^(\d{4}-\d{2}-\d{2})\.parquet$/i);
      const dateB = b.match(/^(\d{4}-\d{2}-\d{2})\.parquet$/i);
      if (dateA && dateB) return dateA[1].localeCompare(dateB[1]);
      const numA = a.match(/part-(\d+)/i);
      const numB = b.match(/part-(\d+)/i);
      if (numA && numB) return parseInt(numA[1]) - parseInt(numB[1]);
      return a.localeCompare(b);
    });
}

const isDone = (file: string) => fs.existsSync(path.join(PROGRESS_DIR, `${file}.done`));

function markDone(file: string): void {
  fs.mkdirSync(PROGRESS_DIR, { recursive: true });
  fs.writeFileSync(path.join(PROGRESS_DIR, `${file}.done`), new Date().toISOString());
}

function main() {
  const files = listFiles();
  if (!files.length) {
    console.error(`No .parquet files found in ${LOCAL_DIR} (excluding companies.parquet)`);
    process.exit(1);
  }

  const pending = files.filter(f => !isDone(f));
  console.log(`\nimport-jobs-loop — ${files.length} file(s) found, ${pending.length} remaining\n`);

  if (!pending.length) {
    console.log('[loop] Nothing left to import — all files already marked done.\n');
    return;
  }

  let consecutiveFailures = 0;

  for (const file of pending) {
    console.log(`[loop] ${file}...`);

    const result = spawnSync(
      'npx',
      [
        'ts-node', '-r', 'tsconfig-paths/register', 'src/scripts/import-jobs.ts',
        `--local-dir=${LOCAL_DIR}`, `--file=${file}`, ...passthroughArgs,
      ],
      { stdio: 'inherit', cwd: API_ROOT, shell: true },
    );

    if (result.status === 0) {
      markDone(file);
      consecutiveFailures = 0;
    } else {
      consecutiveFailures++;
      console.log(`[loop] ${file} failed (exit ${result.status}) — consecutive failures: ${consecutiveFailures}/${MAX_CONSECUTIVE_FAILURES}`);
      if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        console.error('\n[loop] Too many consecutive failures — stopping. Re-run the same command to resume once fixed.\n');
        process.exit(1);
      }
    }
  }

  console.log('\n[loop] All files processed.\n');
}

main();
