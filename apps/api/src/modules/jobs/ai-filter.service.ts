import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { Job, DismissedJob } from '@pkg-types/job';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const USER_PROFILE = {
  title: 'Software Engineer',
  skills: ['TypeScript', 'JavaScript', 'React', 'Node.js', 'PostgreSQL', 'REST APIs'],
  experienceYears: 3,
  excludeFields: ['nursing', 'healthcare', 'medical', 'sales', 'marketing'],
};

@Injectable()
export class AiFilterService {
  private readonly logger = new Logger(AiFilterService.name);

  async scoreAndFilter(
    jobs: Partial<Job>[],
    dismissals: DismissedJob[] = [],
  ): Promise<Partial<Job>[]> {
    if (!jobs.length) return [];

    // Build a summary of dismissed patterns to inform the AI
    const dismissalPatterns = this.extractDismissalPatterns(dismissals);

    const prompt = `You are a job relevance filter for a software engineer.

User profile:
- Title: ${USER_PROFILE.title}
- Skills: ${USER_PROFILE.skills.join(', ')}
- Experience: ${USER_PROFILE.experienceYears} years
- Exclude fields: ${USER_PROFILE.excludeFields.join(', ')}

${dismissalPatterns ? `User has previously dismissed jobs with these patterns (score these lower):\n${dismissalPatterns}\n` : ''}

Score each job 0-100 for relevance. Rules:
- 80-100: Strong match (right title, matching skills, good company)
- 50-79: Decent match (related role, some skills overlap)  
- 20-49: Weak match (tangential role)
- 0-19: Not relevant (wrong field entirely — drop these)

Jobs to score (JSON array):
${JSON.stringify(jobs.map(j => ({
  id: j.externalId,
  title: j.title,
  company: j.company,
  description: j.description?.slice(0, 300),
  tags: j.tags,
})))}

Respond ONLY with a JSON array of objects: [{ "id": "...", "score": 0-100, "tags": ["extracted", "skill", "tags"] }]
No explanation, no markdown, just the JSON array.`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const scores: { id: string; score: number; tags: string[] }[] = JSON.parse(text);

      // Merge scores back into jobs and filter out irrelevant ones
      return jobs
        .map(job => {
          const scored = scores.find(s => s.id === job.externalId);
          return {
            ...job,
            relevanceScore: scored?.score ?? 0,
            tags: scored?.tags?.length ? scored.tags : job.tags,
          };
        })
        .filter(job => (job.relevanceScore ?? 0) >= 20)
        .sort((a, b) => (b.relevanceScore ?? 0) - (a.relevanceScore ?? 0));
    } catch (err) {
      this.logger.error('AI filter failed, returning unscored jobs', err);
      return jobs;
    }
  }

  private extractDismissalPatterns(dismissals: DismissedJob[]): string {
    if (!dismissals.length) return '';
    const companies = [...new Set(dismissals.map(d => d.company))].slice(0, 5);
    const titles = [...new Set(dismissals.map(d => d.title))].slice(0, 5);
    return `Companies: ${companies.join(', ')}\nTitles: ${titles.join(', ')}`;
  }
}
