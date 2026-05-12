import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Job, DismissedJob } from '@apcomp/types';
import { CvProfile } from '@apcomp/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SENIOR_KEYWORDS = [
  'senior', 'staff', 'principal', 'lead', 'manager', 'director',
  'vp ', 'vice president', 'head of', '10+ years', '8+ years',
  '7+ years', '6+ years', '15+ years', 'decade',
];

const EXCLUDED_FIELDS = [
  'nursing', 'nurse', 'healthcare', 'medical', 'dental',
  'sales', 'marketing', 'accounting', 'legal',
];

@Injectable()
export class AiFilterService {
  private readonly logger = new Logger(AiFilterService.name);

  async scoreAndFilter(
    jobs: Job[],
    dismissals: DismissedJob[] = [],
    profile?: CvProfile | null,
  ): Promise<Job[]> {
    if (!jobs.length) return [];

    // Step 1: Pre-filter obvious mismatches without using AI credits
    const preFiltered = jobs.filter(job => {
      const text = `${job.title} ${job.description}`.toLowerCase();

      // Filter out senior/lead roles
      if (SENIOR_KEYWORDS.some(kw => text.includes(kw.toLowerCase()))) return false;

      // Filter out excluded fields
      if (EXCLUDED_FIELDS.some(kw => text.includes(kw.toLowerCase()))) return false;

      return true;
    });

    this.logger.log(`Pre-filter: ${jobs.length} → ${preFiltered.length} jobs`);

    if (!preFiltered.length) return [];

    // Step 2: Build profile context from real CV data
    const skills = profile?.skills?.map(s => s.name).join(', ')
      ?? 'TypeScript, JavaScript, React, Node.js';

    const totalMonths = profile?.roles?.reduce((sum, r) => sum + (r.durationMonths ?? 0), 0) ?? 36;
    const experienceYears = Math.round(totalMonths / 12);

    const jobTitles = profile?.roles?.map(r => r.title).join(', ')
      ?? 'Software Developer';

    const practices = profile?.practices?.join(', ')
      ?? 'Agile, REST APIs, unit testing';

    // Step 3: Build dismissal patterns
    const dismissalPatterns = this.extractDismissalPatterns(dismissals);

    const prompt = `You are a job relevance filter.

Candidate profile (extracted from their real CV):
- Past titles: ${jobTitles}
- Skills: ${skills}
- Total experience: ~${experienceYears} years
- Practices: ${practices}
- Experience level: ${experienceYears <= 2 ? 'junior' : experienceYears <= 4 ? 'junior to mid-level' : 'mid-level'}

${dismissalPatterns ? `Previously dismissed job patterns (score these lower):\n${dismissalPatterns}\n` : ''}

Score each job 0-100 for relevance. Rules:
- 80-100: Strong match (matching title/skills, appropriate experience level)
- 50-79: Decent match (related role, some skill overlap)
- 20-49: Weak match (tangential)
- 0-19: Not relevant (drop these)
- Always score 0 for: roles requiring 5+ years, Senior/Staff/Lead/Principal/Manager titles

Jobs to score:
${JSON.stringify(preFiltered.map(j => ({
  id: j.externalId,
  title: j.title,
  company: j.company,
  description: j.description?.slice(0, 300),
  tags: j.tags,
})))}

Respond ONLY with a JSON array: [{ "id": "...", "score": 0-100, "tags": ["skill", "tags"] }]
No explanation, no markdown, just the JSON array.`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const clean = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
      const scores: { id: string; score: number; tags: string[] }[] = JSON.parse(clean);

      return preFiltered
        .map(job => {
          const scored = scores.find(s => s.id === job.externalId);
          return {
            ...job,
            relevanceScore: scored?.score ?? 0,
            tags: scored?.tags?.length ? scored.tags : job.tags,
          };
        })
        .filter(job => job.relevanceScore >= 20)
        .sort((a, b) => b.relevanceScore - a.relevanceScore);
    } catch (err) {
      this.logger.error('AI filter failed, returning pre-filtered jobs unscored', err);
      return preFiltered;
    }
  }

  private extractDismissalPatterns(dismissals: DismissedJob[]): string {
    if (!dismissals.length) return '';
    const companies = [...new Set(dismissals.map(d => d.company))].slice(0, 5);
    const titles = [...new Set(dismissals.map(d => d.title))].slice(0, 5);
    return `Companies: ${companies.join(', ')}\nTitles: ${titles.join(', ')}`;
  }
}
