/**
 * jobs-server.ts
 *
 * Standalone Express server that runs on the LAPTOP (port 3002).
 * Searches the local job_catalog PostgreSQL table and returns Job[] results.
 * Exposed to the internet via Cloudflare Tunnel at https://jobs.apcomp.us
 *
 * Start: pnpm jobs:server  (from apps/api/)
 */
import 'dotenv/config';
import express from 'express';
import { PrismaClient, Prisma } from '../generated/prisma';
import type { Job, ContractTime } from '@apcomp/types';

const app = express();
const prisma = new PrismaClient();
const PORT = Number(process.env.JOB_SERVER_PORT ?? 3002);

app.use(express.json());

// ── Helpers ────────────────────────────────────────────────────────────────

function mapContractTime(val?: string | null): ContractTime {
  if (!val) return 'unknown';
  const v = val.toLowerCase();
  if (v.includes('full')) return 'full_time';
  if (v.includes('part')) return 'part_time';
  if (v.includes('contract')) return 'contractor';
  if (v.includes('intern')) return 'intern';
  return 'unknown';
}

const SENIOR_PATTERNS = [
  'senior', ' sr ', ' sr.', 'staff ', 'principal',
  'lead ', 'tech lead', 'manager', 'director',
  'head of', ' vp ', 'vice president',
];

function isSenior(title: string): boolean {
  const t = title.toLowerCase();
  return SENIOR_PATTERNS.some(p => t.includes(p));
}

// ── Routes ─────────────────────────────────────────────────────────────────

app.get('/health', (_, res) => {
  res.json({ ok: true, service: 'jobs-server' });
});

app.post('/search', async (req, res) => {
  try {
    const {
      titles = [],
      postedDays,
      experienceLevel = 'any',
      limit = 150,
    } = req.body as {
      titles: string[];
      postedDays?: number;
      experienceLevel?: 'entry' | 'junior' | 'mid' | 'any';
      limit?: number;
    };

    if (!titles.length) return res.json([]);

    const where: Prisma.JobCatalogWhereInput = {
      status: 'active',
      // Match any of the requested titles (case-insensitive)
      OR: titles.map(t => ({
        title: { contains: t, mode: 'insensitive' as const },
      })),
      // Must be US or remote
      AND: [{
        OR: [
          { isRemote: true },
          { workplaceType: { equals: 'remote', mode: 'insensitive' as const } },
          { country: { contains: 'United States', mode: 'insensitive' as const } },
          { country: { equals: 'US' } },
          { country: { equals: 'USA' } },
        ],
      }],
    };

    if (postedDays) {
      const cutoff = new Date(Date.now() - postedDays * 86_400_000);
      where.postedAt = { gte: cutoff };
    }

    const rows = await prisma.jobCatalog.findMany({
      where,
      // Fetch extra so we have room after senior filtering
      take: experienceLevel !== 'any' ? limit * 2 : limit,
      orderBy: { postedAt: 'desc' },
    });

    const filtered = experienceLevel !== 'any'
      ? rows.filter(r => !isSenior(r.title)).slice(0, limit)
      : rows;

    const jobs: Job[] = filtered.map(row => ({
      id: `openjobdata-${row.id}`,
      externalId: row.id,
      source: 'openjobdata' as const,
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
      applyOptions: row.applyUrl
        ? [{ publisher: 'Direct', url: row.applyUrl, isDirect: true }]
        : [],
      contractTime: mapContractTime(row.employmentType),
      contractType: 'unknown' as const,
      employmentType: row.employmentType ?? undefined,
      publisher: 'openjobdata',
      postedAt: row.postedAt?.toISOString() ?? new Date().toISOString(),
      relevanceScore: 0,
      status: 'new' as const,
    }));

    res.json(jobs);
  } catch (err: any) {
    console.error('[jobs-server] Search error:', err?.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────

async function main() {
  await prisma.$connect();
  app.listen(PORT, () => {
    console.log(`[jobs-server] Listening on http://localhost:${PORT}`);
    console.log(`[jobs-server] Health: http://localhost:${PORT}/health`);
  });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
