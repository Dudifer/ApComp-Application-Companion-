import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { CvProfile, GapQuestion, Role, SkillEntry } from '@apcomp/types';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

@Injectable()
export class AiExtractorService {
  private readonly logger = new Logger(AiExtractorService.name);

  async extractProfile(rawText: string): Promise<CvProfile> {
    const prompt = `You are a CV parser. Extract a structured developer profile from this CV text.

For each role, calculate durationMonths from the dates. If end date is missing, assume it is current (today: ${new Date().toISOString().slice(0, 7)}).

Return ONLY valid JSON matching this exact structure (no markdown, no explanation):
{
  "name": "string or null",
  "email": "string or null",
  "roles": [
    {
      "company": "string",
      "title": "string",
      "startDate": "YYYY-MM",
      "endDate": "YYYY-MM or null if current",
      "durationMonths": number,
      "technologies": ["explicit techs mentioned"],
      "practices": ["e.g. unit testing, CI/CD, agile, code review"],
      "description": "brief summary of what they did"
    }
  ],
  "skills": [
    {
      "name": "skill name",
      "category": "language|framework|tool|practice|methodology",
      "monthsExperience": number (sum across all roles that used it),
      "proficiency": "beginner|intermediate|advanced|expert",
      "usedAt": ["company names"]
    }
  ],
  "practices": ["list of engineering practices used overall"],
  "gapQuestions": [
    {
      "id": "gap_1",
      "company": "Company Name",
      "question": "Specific question about missing technical detail",
      "type": "multiselect|text|scale",
      "options": ["option1", "option2"] (only for multiselect type)
    }
  ],
  "isComplete": false
}

Gap question rules:
- Only ask about roles where technologies/stack are vague or missing
- Ask about backend stack if only frontend is mentioned (or vice versa)
- Ask about specific libraries if a language is mentioned without context (e.g. "Python" → ask data science vs web vs scripting)
- Ask about testing practices if not mentioned
- Ask about database/infrastructure if not mentioned for backend roles
- Group multiple questions per company — max 3 questions per company
- Use "multiselect" for tech choices (provide 6-10 options), "text" for open-ended, "scale" for proficiency (options: ["1","2","3","4","5"])
- Only generate gap questions for roles that genuinely lack technical detail

CV TEXT:
${rawText}`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const profile: CvProfile = JSON.parse(text);
      profile.rawText = rawText;
      return profile;
    } catch (err) {
      this.logger.error('CV extraction failed', err);
      throw new Error('Failed to analyze CV. Please try again.');
    }
  }

  async refineProfileWithAnswers(
    profile: CvProfile,
    answers: { questionId: string; answer: string }[],
  ): Promise<CvProfile> {
    const answeredQuestions = profile.gapQuestions.map(q => {
      const ans = answers.find(a => a.questionId === q.id);
      return ans ? { ...q, answer: ans.answer } : q;
    });

    const answerSummary = answeredQuestions
      .filter(q => q.answer)
      .map(q => `[${q.company}] ${q.question} → ${q.answer}`)
      .join('\n');

    if (!answerSummary) return { ...profile, gapQuestions: answeredQuestions, isComplete: true };

    const prompt = `You have a developer's CV profile and additional answers they provided to gap questions.
Update the profile's skills and role technologies to reflect the new information.

Current profile skills (JSON):
${JSON.stringify(profile.skills, null, 2)}

Current roles (JSON):
${JSON.stringify(profile.roles, null, 2)}

Additional answers:
${answerSummary}

Return ONLY updated JSON with two keys:
{
  "skills": [...updated full skills array...],
  "roles": [...updated full roles array with technologies filled in...]
}`;

    try {
      const message = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = message.content[0].type === 'text' ? message.content[0].text : '';
      const updates: { skills: SkillEntry[]; roles: Role[] } = JSON.parse(text);

      return {
        ...profile,
        skills: updates.skills,
        roles: updates.roles,
        gapQuestions: answeredQuestions,
        isComplete: true,
      };
    } catch (err) {
      this.logger.error('Profile refinement failed', err);
      return { ...profile, gapQuestions: answeredQuestions, isComplete: true };
    }
  }
}
