import type { Job } from '@apcomp/types';
import type { ResumeState, ResumeExperience, ResumeProject } from './useResumeBuilder';

// Rough character-based page estimation
// A letter page at 9.5pt with our margins fits ~4000 chars of content
const PAGE_CHAR_LIMIT = 3000;

function extractJobKeywords(job: Job): string[] {
  const sources = [
    ...(job.tags ?? []),
    ...(job.highlights?.qualifications ?? []),
    ...(job.highlights?.responsibilities ?? []),
    job.description.slice(0, 2000),
    job.title,
  ].join(' ').toLowerCase();

  // Extract meaningful words — skip common stop words
  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','have','has','had','do','does','did',
    'will','would','could','should','may','might','must','shall','can',
    'this','that','these','those','we','you','they','our','your','their',
    'as','by','from','into','through','during','including','until','while',
    'per','about','against','between','into','through','during','before',
    'after','above','below','up','down','out','off','over','under','again',
    'further','then','once','here','there','when','where','why','how','all',
    'both','each','few','more','most','other','some','such','no','nor','not',
    'only','own','same','so','than','too','very','just','because','if',
    'experience','years','strong','knowledge','ability','skills','work',
    'team','using','use','used','working','related','well','good','great',
  ]);

  const words = sources.match(/\b[a-z][a-z0-9#+.-]{1,}\b/g) ?? [];
  const counts: Record<string, number> = {};
  for (const w of words) {
    if (!stopWords.has(w)) counts[w] = (counts[w] ?? 0) + 1;
  }

  // Return words that appear at least twice OR are explicitly in tags
  const tagWords = (job.tags ?? []).map(t => t.toLowerCase());
  return Object.entries(counts)
    .filter(([w, c]) => c >= 2 || tagWords.includes(w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 60);
}

function scoreText(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function estimateChars(state: ResumeState): number {
  let chars = 0;
  // Header
  chars += 150;
  // About me
  if (state.aboutMe) chars += state.aboutMe.length + 50;
  // Education
  state.education.filter(e => e.active).forEach(e => {
    chars += e.institution.length + e.degree.length + 60;
  });
  // Experience
  state.experience.filter(e => e.active).forEach(exp => {
    chars += exp.title.length + exp.company.length + 80;
    exp.bullets.filter(b => b.active).forEach(b => {
      chars += b.text.length + 20;
    });
  });
  // Projects
  state.projects.filter(p => p.active).forEach(p => {
    chars += (p.name?.length ?? 0) + (p.techStack?.length ?? 0) + 60;
    (p.bullets ?? []).filter(b => b.active).forEach(b => {
      chars += (b.text?.length ?? 0) + 20;
    });
  });
  // Skills
  state.skillGroups.filter(sg => sg.active).forEach(sg => {
    chars += sg.label.length + sg.skills.length + 20;
  });
  return chars;
}

export interface TailoringResult {
  state: ResumeState;
  keywordsUsed: string[];
  itemsHidden: number;
  bulletsHidden: number;
  alreadyFit: boolean;
}

export function tailorResumeForJob(state: ResumeState, job: Job): TailoringResult {
  const keywords = extractJobKeywords(job);

  // Check if it already fits
  const originalChars = estimateChars(state);
  if (originalChars <= PAGE_CHAR_LIMIT) {
    return {
      state,
      keywordsUsed: keywords,
      itemsHidden: 0,
      bulletsHidden: 0,
      alreadyFit: true,
    };
  }

  // Score each experience
  const scoredExp: (ResumeExperience & { score: number })[] = state.experience.map(exp => {
    const contextText = `${exp.title} ${exp.company} ${exp.bullets.map(b => b.text).join(' ')}`;
    return { ...exp, score: scoreText(contextText, keywords) };
  });

  // Sort by score descending
  scoredExp.sort((a, b) => b.score - a.score);

  // Score and sort individual bullets within each experience
  const tailoredExp: ResumeExperience[] = scoredExp.map(exp => {
    const scoredBullets = exp.bullets.map(b => ({
      ...b,
      score: scoreText(b.text, keywords),
    }));
    // Sort bullets by score, keep structure but mark low scorers inactive if needed
    scoredBullets.sort((a, b) => b.score - a.score);
    return {
      ...exp,
      bullets: scoredBullets.map(b => ({ id: b.id, text: b.text, active: b.active })),
    };
  });

  // Score projects
  const scoredProjects = state.projects
    .map(p => ({ ...p, score: scoreText(
      [p.name, p.category, p.techStack, ...(p.bullets ?? []).map(b => b.text)].filter(Boolean).join(' '),
      keywords
      ),
    }))
    .sort((a, b) => b.score - a.score)
    .map(p => ({ id: p.id, active: p.active, name: p.name, category: p.category, date: p.date, techStack: p.techStack, bullets: p.bullets }));

  // Build new state with sorted items, all initially active
  let working: ResumeState = {
    ...state,
    experience: tailoredExp,
    projects: scoredProjects,
  };

  let itemsHidden = 0;
  let bulletsHidden = 0;

  // Iteratively hide lowest-scoring items until it fits
  // Pass 1: hide bullets in lowest-scoring experiences
  for (let expIdx = tailoredExp.length - 1; expIdx >= 0; expIdx--) {
    if (estimateChars(working) <= PAGE_CHAR_LIMIT) break;
    const exp = working.experience[expIdx];
    if (!exp.active) continue;

    // Hide bullets from the bottom up within this exp
    for (let bIdx = exp.bullets.length - 1; bIdx >= 0; bIdx--) {
      if (estimateChars(working) <= PAGE_CHAR_LIMIT) break;
      if (!exp.bullets[bIdx].active) continue;
      working = {
        ...working,
        experience: working.experience.map((e, i) => i === expIdx ? {
          ...e,
          bullets: e.bullets.map((b, j) => j === bIdx ? { ...b, active: false } : b),
        } : e),
      };
      bulletsHidden++;
    }
  }

  // Pass 2: hide lowest-scoring projects
  for (let i = scoredProjects.length - 1; i >= 0; i--) {
    if (estimateChars(working) <= PAGE_CHAR_LIMIT) break;
    if (!working.projects[i].active) continue;
    working = {
      ...working,
      projects: working.projects.map((p, j) => j === i ? { ...p, active: false } : p),
    };
    itemsHidden++;
  }

  // Pass 3: hide lowest-scoring experience entries entirely
  for (let i = working.experience.length - 1; i >= 0; i--) {
    if (estimateChars(working) <= PAGE_CHAR_LIMIT) break;
    if (!working.experience[i].active) continue;
    working = {
      ...working,
      experience: working.experience.map((e, j) => j === i ? { ...e, active: false } : e),
    };
    itemsHidden++;
  }

  return {
    state: working,
    keywordsUsed: keywords,
    itemsHidden,
    bulletsHidden,
    alreadyFit: false,
  };
}
