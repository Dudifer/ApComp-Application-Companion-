/**
 * import-jobs.ts
 *
 * Downloads OpenJobData delta parquet files from HuggingFace and upserts
 * US/remote active jobs into the local job_catalog PostgreSQL table.
 *
 * Usage:
 *   pnpm jobs:import              # last 7 days (daily refresh)
 *   pnpm jobs:import -- --days=90 # initial backfill (run once)
 *
 * Runs on the LAPTOP only. EC2 never needs to run this.
 */
import 'dotenv/config';
import * as duckdb from 'duckdb';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { PrismaClient } from '../../generated/prisma';

// ── Config ─────────────────────────────────────────────────────────────────

const HF_BASE = 'https://huggingface.co/datasets/Invicto69/Jobs-Dataset-bucket/resolve/main';
const TMP_DIR = path.join(os.tmpdir(), 'apcomp-import');
const COMPANIES_CACHE = path.join(TMP_DIR, 'companies.parquet');
const COMPANIES_TTL_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

// ── Args ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const daysArg = args.find(a => a.startsWith('--days='))?.split('=')[1];
const DAYS_BACK = Number(daysArg ?? 7);

// ── Prisma ─────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

// ── DuckDB helper ──────────────────────────────────────────────────────────

function dbAll(db: duckdb.Database, sql: string): Promise<any[]> {
  return new Promise((resolve, reject) =>
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows ?? []))),
  );
}

// ── File helpers ───────────────────────────────────────────────────────────

async function downloadFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  fs.writeFileSync(dest, Buffer.from(buf));
}

async function ensureCompanies(): Promise<string> {
  if (fs.existsSync(COMPANIES_CACHE)) {
    const age = Date.now() - fs.statSync(COMPANIES_CACHE).mtimeMs;
    if (age < COMPANIES_TTL_MS) {
      console.log('  companies.parquet: using cache');
      return COMPANIES_CACHE;
    }
  }
  process.stdout.write('  companies.parquet: downloading... ');
  await downloadFile(`${HF_BASE}/data/companies/companies.parquet`, COMPANIES_CACHE);
  console.log('done');
  return COMPANIES_CACHE;
}

// ── Upsert helpers ─────────────────────────────────────────────────────────

type JobRow = {
  id: string;
  title: string;
  company: string | null;
  country: string | null;
  city: string | null;
  state: string | null;
  locationDisplay: string | null;
  isRemote: boolean;
  workplaceType: string | null;
  employmentType: string | null;
  postedAt: Date | null;
  applyUrl: string | null;
  department: string | null;
  description: string | null;
  status: string;
};

async function upsertBatch(batch: JobRow[]): Promise<void> {
  await prisma.$transaction(
    batch.map(job =>
      prisma.jobCatalog.upsert({
        where: { id: job.id },
        create: job,
        update: {
          title: job.title,
          company: job.company,
          status: job.status,
          applyUrl: job.applyUrl,
          isRemote: job.isRemote,
          workplaceType: job.workplaceType,
          postedAt: job.postedAt,
          description: job.description,
          importedAt: new Date(),
        },
      }),
    ),
    { timeout: 30_000 },
  );
}

// ── Per-date import ────────────────────────────────────────────────────────

async function importDate(
  db: duckdb.Database,
  date: string,
  companiesPath: string,
): Promise<number> {
  const url = `${HF_BASE}/data/full/changes/${date}.parquet`;
  const tmpPath = path.join(TMP_DIR, `delta-${date}.parquet`);

  try {
    process.stdout.write(`  ${date}: downloading... `);
    await downloadFile(url, tmpPath);
    console.log(`${(fs.statSync(tmpPath).size / 1024 / 1024).toFixed(1)} MB`);

    const safeTmp = tmpPath.replace(/\\/g, '/');
    const safeCo = companiesPath.replace(/\\/g, '/');

    const rows = await dbAll(db, `
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
      FROM read_parquet('${safeTmp}') j
      LEFT JOIN read_parquet('${safeCo}') c ON j.company_id = c.id
      WHERE j.status = 'active'
        AND (
          j.country ILIKE '%United States%'
          OR j.country ILIKE '%USA%'
          OR j.country = 'US'
          OR j.is_remote = true
          OR j.workplace_type = 'remote'
        )
    `);

    if (!rows.length) {
      console.log(`  ${date}: 0 US/remote active jobs`);
      return 0;
    }

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
        `\r  ${date}: ${Math.min(i + BATCH_SIZE, jobs.length)}/${jobs.length} upserted`,
      );
    }
    console.log(`\r  ${date}: ✓ ${jobs.length} jobs                    `);
    return jobs.length;
  } catch (err: any) {
    if (err?.message?.includes('HTTP 404') || err?.message?.includes('404')) {
      console.log(`  ${date}: no delta file (skipped)`);
      return 0;
    }
    console.error(`  ${date}: ERROR — ${err?.message}`);
    return 0;
  } finally {
    fs.rmSync(tmpPath, { force: true });
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  fs.mkdirSync(TMP_DIR, { recursive: true });
  console.log(`\nApComp Job Import — last ${DAYS_BACK} day${DAYS_BACK === 1 ? '' : 's'}`);
  console.log('─'.repeat(50));

  await prisma.$connect();

  const companiesPath = await ensureCompanies();
  const db = new duckdb.Database(':memory:');

  let total = 0;
  for (let i = 0; i < DAYS_BACK; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    total += await importDate(db, date, companiesPath);
  }

  console.log('─'.repeat(50));
  console.log(`Done. ${total.toLocaleString()} jobs imported/updated.\n`);
  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
