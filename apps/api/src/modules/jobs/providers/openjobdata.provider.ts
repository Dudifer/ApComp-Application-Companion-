import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as duckdb from 'duckdb';
import { Job, ContractTime } from '@apcomp/types';

// HuggingFace dataset — public, no token required
const HF_DATASET = 'hf://datasets/Invicto69/Jobs-Dataset-bucket';
const COMPANIES_URL = `${HF_DATASET}/data/companies/companies.parquet`;

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

function datesBack(n: number): string[] {
  const results: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    results.push(toDateString(d));
  }
  return results;
}

function mapEmploymentType(val?: string): ContractTime {
  if (!val) return 'unknown';
  const v = val.toLowerCase();
  if (v.includes('full')) return 'full_time';
  if (v.includes('part')) return 'part_time';
  if (v.includes('contract')) return 'contractor';
  if (v.includes('intern')) return 'intern';
  return 'unknown';
}

@Injectable()
export class OpenJobDataProvider implements OnModuleInit {
  private readonly logger = new Logger(OpenJobDataProvider.name);
  private db!: duckdb.Database;
  private ready = false;

  async onModuleInit() {
    this.db = new duckdb.Database(':memory:');
    await this.exec("INSTALL httpfs; LOAD httpfs;");
    this.ready = true;
    this.logger.log('DuckDB initialised with httpfs');
  }

  /**
   * Fetch jobs from OpenJobData delta files.
   * @param queries          Title keywords from the user's CV or search form
   * @param daysBack         How many daily delta files to query (7 for initial, 1 for daily cron)
   * @param postedDays       Only include jobs posted within this many days (undefined = any)
   * @param experienceLevel  'entry' | 'junior' | 'mid' | 'any' — excludes senior/lead at SQL level
   */
  async fetchJobs(
    queries: string[],
    daysBack = 7,
    postedDays?: number,
    experienceLevel: 'entry' | 'junior' | 'mid' | 'any' = 'any',
  ): Promise<Job[]> {
    if (!this.ready) throw new Error('OpenJobDataProvider not initialised');
    if (!queries.length) return [];

    const dates = datesBack(daysBack);
    const titleFilter = queries
      .map(q => `j.title ILIKE '%${q.replace(/'/g, "''")}%'`)
      .join(' OR ');

    // Exclude senior/executive titles for entry and junior filters
    const seniorBlock =
      experienceLevel !== 'any'
        ? `AND NOT (
            j.title ILIKE '%senior%' OR j.title ILIKE '% sr %' OR j.title ILIKE '% sr.%'
            OR j.title ILIKE '%staff %' OR j.title ILIKE '%principal%'
            OR j.title ILIKE '%lead %' OR j.title ILIKE '%tech lead%'
            OR j.title ILIKE '%manager%' OR j.title ILIKE '%director%'
            OR j.title ILIKE '%head of%' OR j.title ILIKE '%vp %'
            OR j.title ILIKE '%vice president%' OR j.title ILIKE '%10+ years%'
            OR j.title ILIKE '%8+ years%' OR j.title ILIKE '%7+ years%'
          )`
        : '';

    const recencyFilter = postedDays
      ? `AND (
          j.posted_at > CURRENT_DATE - INTERVAL '${postedDays} days'
          OR (j.posted_at IS NULL AND j.fetched_time > CURRENT_DATE - INTERVAL '${postedDays} days')
        )`
      : '';

    const allRows: any[] = [];

    for (const date of dates) {
      const url = `${HF_DATASET}/data/full/changes/${date}.parquet`;
      try {
        const rows = await this.all(`
          SELECT
            j.id,
            j.title,
            j.country,
            j.is_remote,
            j.workplace_type,
            j.employment_type,
            j.posted_at,
            j.apply_url,
            j.status,
            j.department,
            j.job_model_json,
            c.name AS company_name
          FROM read_parquet('${url}') j
          LEFT JOIN read_parquet('${COMPANIES_URL}') c ON j.company_id = c.id
          WHERE j.status = 'active'
            AND (${titleFilter})
            AND (
              j.country ILIKE '%United States%'
              OR j.country ILIKE '%USA%'
              OR j.country = 'US'
              OR j.is_remote = true
              OR j.workplace_type = 'remote'
            )
            ${seniorBlock}
            ${recencyFilter}
          LIMIT 150
        `);
        this.logger.log(`${date}: ${rows.length} matching jobs`);
        allRows.push(...rows);
      } catch (err: any) {
        this.logger.debug(`No delta for ${date}: ${err?.message}`);
      }
    }

    return this.mapToJobs(allRows);
  }

  private mapToJobs(rows: any[]): Job[] {
    // Deduplicate by id across multiple delta files
    const seen = new Set<string>();

    return rows
      .filter(row => {
        if (seen.has(row.id)) return false;
        seen.add(row.id);
        return true;
      })
      .map(row => {
        let jobModel: any = {};
        try {
          jobModel = typeof row.job_model_json === 'string'
            ? JSON.parse(row.job_model_json)
            : (row.job_model_json ?? {});
        } catch { /* leave empty */ }

        const loc = jobModel.location ?? {};
        const displayName = loc.raw_location_text
          ?? [loc.city, loc.state].filter(Boolean).join(', ')
          ?? row.country
          ?? 'Unknown';

        const company = row.company_name
          ?? jobModel.metadata?.brand
          ?? 'Unknown Company';

        const description = jobModel.description_plain ?? jobModel.description_html ?? '';

        const tags: string[] = [];
        if (row.department) tags.push(row.department);
        if (row.workplace_type && row.workplace_type !== 'tbc') tags.push(row.workplace_type);

        return {
          id: `openjobdata-${row.id}`,
          externalId: String(row.id),
          source: 'openjobdata' as const,

          title: row.title ?? 'Unknown',
          company,

          location: {
            displayName,
            city: loc.city ?? undefined,
            state: loc.state ?? undefined,
            country: loc.country ?? row.country ?? undefined,
          },
          remote: row.is_remote ?? loc.is_remote ?? false,

          description,
          tags,

          url: row.apply_url ?? '',
          applyOptions: row.apply_url
            ? [{ publisher: 'Direct', url: row.apply_url, isDirect: true }]
            : [],

          contractTime: mapEmploymentType(row.employment_type),
          contractType: 'unknown' as const,
          employmentType: row.employment_type ?? undefined,
          publisher: 'openjobdata',

          postedAt: row.posted_at ?? new Date().toISOString(),

          relevanceScore: 0,
          status: 'new' as const,
        } satisfies Job;
      });
  }

  // ── DuckDB promise wrappers ──────────────────────────────────────────────

  private exec(sql: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.db.run(sql, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private all(sql: string): Promise<any[]> {
    return new Promise((resolve, reject) => {
      this.db.all(sql, (err: Error | null, rows: any[]) => {
        if (err) reject(err);
        else resolve(rows ?? []);
      });
    });
  }
}
