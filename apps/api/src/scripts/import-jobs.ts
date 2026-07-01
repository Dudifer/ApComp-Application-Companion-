/**
 * import-jobs.ts
 *
 * Builds the local job_catalog from the OpenJobData full dataset parquet files.
 *
 * ── Modes ────────────────────────────────────────────────────────────────────
 *
 *   Full import (auto-download, tries HuggingFace URLs):
 *     pnpm jobs:import:all
 *
 *   Full import (local files — use this if the URLs don't work):
 *     1. Download the parquet files from:
 *          https://huggingface.co/buckets/Invicto69/Jobs-Dataset-bucket/tree/data/full/
 *        Save part-0.parquet … part-N.parquet + companies.parquet to a folder.
 *     2. pnpm jobs:import -- --local-dir="C:\path\to\your\folder"
 *
 *   Daily delta refresh (after initial import):
 *     pnpm jobs:import
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
import 'dotenv/config';
import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaClient } from '../../generated/prisma';

// ── Config ─────────────────────────────────────────────────────────────────

// HuggingFace bucket base — constructed from the tree URL the dataset exposes.
// The actual download URL replaces /tree/ with /resolve/ (standard HF pattern).
// If this 404s, use --local-dir instead.
const HF_BUCKET_BASE = 'https://huggingface.co/datasets/Invicto69/Jobs-Dataset-bucket/resolve/main';
const HF_FULL_BASE   = `${HF_BUCKET_BASE}/data/full`;

const TMP_DIR        = path.join(os.tmpdir(), 'apcomp-import');
const COMPANIES_CACHE = path.join(TMP_DIR, 'companies.parquet');
const COMPANIES_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE     = 200;

// Stop looking for more part files after this many consecutive 404s
const MAX_MISSING_PARTS = 3;

// In delta mode, stop going back after this many consecutive missing days
const MAX_MISSING_DAYS = 7;

// ── Args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

const localDirArg  = args.find(a => a.startsWith('--local-dir='))?.split('=').slice(1).join('=');
const LOCAL_DIR    = localDirArg ? path.resolve(localDirArg) : null;
const FULL_MODE    = args.includes('--all') || LOCAL_DIR !== null;
const daysArg      = args.find(a => a.startsWith('--days='))?.split('=')[1];
const DAYS_BACK    = Number(daysArg ?? 7);

// ── Prisma ─────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ── DuckDB ─────────────────────────────────────────────────────────────────

function dbAll(db: duckdb.Database, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows ?? []))),
  );
}

// ── File helpers ───────────────────────────────────────────────────────────

async function tryDownload(url: string, dest: string): Promise<'ok' | 'missing' | 'error'> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (res.status === 404) return 'missing';
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
    return 'ok';
  } catch (err: any) {
    if (err?.message?.includes('404')) return 'missing';
    throw err;
  }
}

async function ensureCompanies(localDir: string | null): Promise<string> {
  // If user has companies.parquet locally, use it
  if (localDir) {
    const local = path.join(localDir, 'companies.parquet');
    if (fs.existsSync(local)) {
      console.log('  companies.parquet: using local file');
      return local;
    }
  }
  // Try cache
  if (fs.existsSync(COMPANIES_CACHE)) {
    const age = Date.now() - fs.statSync(COMPANIES_CACHE).mtimeMs;
    if (age < COMPANIES_TTL_MS) {
      console.log('  companies.parquet: using cache');
      return COMPANIES_CACHE;
    }
  }
  // Download
  process.stdout.write('  companies.parquet: downloading... ');
  const result = await tryDownload(`${HF_BUCKET_BASE}/data/companies/companies.parquet`, COMPANIES_CACHE);
  if (result !== 'ok') throw new Error('Could not download companies.parquet — try --local-dir');
  console.log(`${(fs.statSync(COMPANIES_CACHE).size / 1024 / 1024).toFixed(1)} MB`);
  return COMPANIES_CACHE;
}

// ── SQL extraction ─────────────────────────────────────────────────────────

function buildQuery(parquetPath: string, companiesPath: string): string {
  const safe = (p: string) => p.replace(/\\/g, '/');
  return `
    SELECT
      j.id::VARCHAR AS id,
      j.title,
      c.name AS company,
      j.country,
      json_extract_string(j.job_model_json, '$.location.city')  AS city,
      json_extract_string(j.job_model_json, '$.location.state') AS state,
      COALESCE(
        json_extract_string(j.job_model_json, '$.location.raw_location_text'),
        json_extract_string(j.job_model_json, '$.location.city')
      ) AS location_display,
      COALESCE(j.is_remote, false) AS is_remote,
      j.workplace_type,
      j.employment_type,
      j.posted_at,
      j.apply_url,
      j.department,
      LEFT(COALESCE(
        json_extract_string(j.job_model_json, '$.description_plain'),
        json_extract_string(j.job_model_json, '$.description_html'),
        ''
      ), 2000) AS description,
      j.status
    FROM read_parquet('${safe(parquetPath)}') j
    LEFT JOIN read_parquet('${safe(companiesPath)}') c ON j.company_id = c.id
    WHERE j.status = 'active'
      AND (
        j.country ILIKE '%United States%'
        OR j.country ILIKE '%USA%'
        OR j.country = 'US'
        OR j.is_remote = true
        OR j.workplace_type = 'remote'
      )
  `;
}

// ── Upsert ─────────────────────────────────────────────────────────────────

type JobRow = {
  id: string; title: string; company: string | null; country: string | null;
  city: string | null; state: string | null; locationDisplay: string | null;
  isRemote: boolean; workplaceType: string | null; employmentType: string | null;
  postedAt: Date | null; applyUrl: string | null; department: string | null;
  description: string | null; status: string;
};

async function upsertBatch(batch: JobRow[]): Promise<void> {
  await prisma.$transaction(
    batch.map(job =>
      prisma.jobCatalog.upsert({
        where: { id: job.id },
        create: job,
        update: {
          title: job.title, company: job.company, status: job.status,
          applyUrl: job.applyUrl, isRemote: job.isRemote,
          workplaceType: job.workplaceType, postedAt: job.postedAt,
          description: job.description, importedAt: new Date(),
        },
      }),
    ),
  );
}

async function processRows(rows: any[]): Promise<number> {
  const jobs: JobRow[] = rows.map(r => ({
    id: String(r.id),
    title: r.title ?? 'Unknown',
    company: r.company ?? null,
    country: r.country ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    locationDisplay: r.location_display ?? null,
    isRemote: Boolean(r.is_remote),
    workplaceType: r.workplace_type ?? null,
    employmentType: r.employment_type ?? null,
    postedAt: r.posted_at ? new Date(r.posted_at) : null,
    applyUrl: r.apply_url ?? null,
    department: r.department ?? null,
    description: r.description ?? null,
    status: r.status ?? 'active',
  }));

  for (let i = 0; i < jobs.length; i += BATCH_SIZE) {
    await upsertBatch(jobs.slice(i, i + BATCH_SIZE));
    process.stdout.write(
      `\r    upserting... ${Math.min(i + BATCH_SIZE, jobs.length).toLocaleString()}/${jobs.length.toLocaleString()}`,
    );
  }
  process.stdout.write('\r');
  return jobs.length;
}

// ── Process a single parquet file ──────────────────────────────────────────

async function processParquet(
  db: duckdb.Database,
  label: string,
  parquetPath: string,
  companiesPath: string,
): Promise<number> {
  const mb = (fs.statSync(parquetPath).size / 1024 / 1024).toFixed(0);
  process.stdout.write(`  ${label} (${mb} MB): querying... `);

  const rows = await dbAll(db, buildQuery(parquetPath, companiesPath));
  console.log(`${rows.length.toLocaleString()} US/remote active jobs`);

  if (!rows.length) return 0;

  const count = await processRows(rows);
  console.log(`    ✓ ${count.toLocaleString()} upserted`);
  return count;
}

// ── Full import modes ───────────────────────────────────────────────────────

async function importFromLocalDir(
  db: duckdb.Database,
  localDir: string,
  companiesPath: string,
): Promise<number> {
  const partFiles = fs.readdirSync(localDir)
    .filter(f => f.match(/^part-\d+\.parquet$/i))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)![0]);
      const nb = parseInt(b.match(/\d+/)![0]);
      return na - nb;
    });

  if (!partFiles.length) {
    throw new Error(`No part-N.parquet files found in ${localDir}`);
  }

  console.log(`Found ${partFiles.length} part files in ${localDir}\n`);

  let total = 0;
  for (const file of partFiles) {
    total += await processParquet(db, file, path.join(localDir, file), companiesPath);
  }
  return total;
}

async function importFromUrl(
  db: duckdb.Database,
  companiesPath: string,
): Promise<number> {
  console.log('Downloading full dataset parts from HuggingFace...\n');
  console.log('(If this fails with 404, download the files manually and use --local-dir)\n');

  let total = 0;
  let partIndex = 0;
  let consecutiveMissing = 0;

  while (consecutiveMissing < MAX_MISSING_PARTS) {
    const filename = `part-${partIndex}.parquet`;
    const url = `${HF_FULL_BASE}/${filename}`;
    const tmpPath = path.join(TMP_DIR, filename);

    process.stdout.write(`  ${filename}: downloading... `);
    const result = await tryDownload(url, tmpPath);

    if (result === 'missing') {
      console.log('not found');
      consecutiveMissing++;
      partIndex++;
      continue;
    }

    consecutiveMissing = 0;
    const mb = (fs.statSync(tmpPath).size / 1024 / 1024).toFixed(0);
    console.log(`${mb} MB`);

    try {
      total += await processParquet(db, filename, tmpPath, companiesPath);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }

    partIndex++;
  }

  if (partIndex === 0) {
    throw new Error(
      `Could not download any part files from:\n  ${HF_FULL_BASE}/part-0.parquet\n\n` +
      `Download the files manually from:\n  https://huggingface.co/buckets/Invicto69/Jobs-Dataset-bucket/tree/data/full/\n\n` +
      `Then run:\n  pnpm jobs:import -- --local-dir="C:\\path\\to\\downloaded\\files"`,
    );
  }

  return total;
}

// ── Delta mode ─────────────────────────────────────────────────────────────

async function importDeltas(db: duckdb.Database, companiesPath: string): Promise<number> {
  let total = 0;
  let consecutiveMissing = 0;

  for (let i = 0; i < DAYS_BACK; i++) {
    if (consecutiveMissing >= MAX_MISSING_DAYS) break;

    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    const tmpPath = path.join(TMP_DIR, `delta-${date}.parquet`);

    process.stdout.write(`  ${date}: downloading... `);
    try {
      const result = await tryDownload(
        `${HF_BUCKET_BASE}/data/full/changes/${date}.parquet`,
        tmpPath,
      );
      if (result === 'missing') {
        console.log('no file');
        consecutiveMissing++;
        continue;
      }
      consecutiveMissing = 0;
      total += await processParquet(db, date, tmpPath, companiesPath);
    } catch (err: any) {
      console.error(`ERROR — ${err?.message}`);
    } finally {
      fs.rmSync(tmpPath, { force: true });
    }
  }
  return total;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });

  const modeLabel = LOCAL_DIR
    ? `local files from: ${LOCAL_DIR}`
    : FULL_MODE
    ? 'full dataset (downloading parts from HuggingFace)'
    : `delta — last ${DAYS_BACK} day${DAYS_BACK === 1 ? '' : 's'}`;

  console.log(`\nApComp Job Import — ${modeLabel}`);
  console.log('─'.repeat(60));

  await prisma.$connect();
  const companiesPath = await ensureCompanies(LOCAL_DIR);
  const db = new duckdb.Database(':memory:');

  let total: number;
  if (LOCAL_DIR) {
    total = await importFromLocalDir(db, LOCAL_DIR, companiesPath);
  } else if (FULL_MODE) {
    total = await importFromUrl(db, companiesPath);
  } else {
    total = await importDeltas(db, companiesPath);
  }

  const catalogCount = await prisma.jobCatalog.count();
  console.log('─'.repeat(60));
  console.log(`Imported/updated: ${total.toLocaleString()}`);
  console.log(`Total in catalog: ${catalogCount.toLocaleString()}\n`);

  await prisma.$disconnect();
}

main().catch(err => {
  console.error('\n' + (err?.message ?? err));
  process.exit(1);
});
