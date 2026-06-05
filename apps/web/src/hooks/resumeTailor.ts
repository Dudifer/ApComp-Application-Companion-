import type { Job } from '@apcomp/types';
import type { ResumeState } from './useResumeBuilder';
import { measureResumeHeight, CONTENT_HEIGHT_PX } from './measureResumeHeight';

// ── How many px of overflow counts as "close enough" to switch to bullet trimming
// A typical bullet is ~9pt body text at 1.45 line height ≈ 17px, usually 1-2 lines ≈ 20-35px
// "Within 4 bullets" = ~140px overflow → switch to fine-trim mode
const FINE_TRIM_THRESHOLD_PX = 140;

// ── Keyword extraction ────────────────────────────────────────────────────────

function extractJobKeywords(job: Job): string[] {
  const sources = [
    ...(job.tags ?? []),
    ...(job.highlights?.qualifications ?? []),
    ...(job.highlights?.responsibilities ?? []),
    job.description.slice(0, 2000),
    job.title,
  ].join(' ').toLowerCase();

  const stopWords = new Set([
    'the','a','an','and','or','but','in','on','at','to','for','of','with',
    'is','are','was','were','be','been','have','has','had','do','does','did',
    'will','would','could','should','may','might','must','shall','can',
    'this','that','these','those','we','you','they','our','your','their',
    'as','by','from','into','through','during','including','until','while',
    'per','about','against','between','before','after','above','below',
    'up','down','out','off','over','under','again','further','then','once',
    'here','there','when','where','why','how','all','both','each','few',
    'more','most','other','some','such','no','nor','not','only','own',
    'same','so','than','too','very','just','because','if','experience',
    'years','strong','knowledge','ability','skills','work','team','using',
    'use','used','working','related','well','good','great',
  ]);

  const words = sources.match(/\b[a-z][a-z0-9#+.-]{1,}\b/g) ?? [];
  const counts: Record<string, number> = {};
  for (const w of words) {
    if (!stopWords.has(w)) counts[w] = (counts[w] ?? 0) + 1;
  }

  const tagWords = (job.tags ?? []).map(t => t.toLowerCase());
  return Object.entries(counts)
    .filter(([w, c]) => c >= 2 || tagWords.includes(w))
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w)
    .slice(0, 60);
}

function scoreText(text: string, keywords: string[]): number {
  if (!text) return 0;
  const lower = text.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

function scoreProject(proj: ResumeState['projects'][0], keywords: string[]): number {
  const text = [
    proj.name,
    proj.category,
    proj.techStack,
    ...(proj.bullets ?? []).map(b => b.text),
  ].filter(Boolean).join(' ');
  return scoreText(text, keywords);
}

// ── Hide operations ───────────────────────────────────────────────────────────

function hideProject(state: ResumeState, projId: string): ResumeState {
  return {
    ...state,
    projects: state.projects.map(p =>
      p.id === projId ? {
        ...p,
        active: false,
        bullets: (p.bullets ?? []).map(b => ({ ...b, active: false })),
      } : p
    ),
  };
}

function hideBullet(
  state: ResumeState,
  type: 'exp' | 'proj',
  parentId: string,
  bulletId: string,
): ResumeState {
  if (type === 'exp') {
    const experience = state.experience.map(exp => {
      if (exp.id !== parentId) return exp;
      const bullets = (exp.bullets ?? []).map(b =>
        b.id === bulletId ? { ...b, active: false } : b
      );
      const anyActive = bullets.some(b => b.active);
      return { ...exp, active: anyActive, bullets };
    });
    return { ...state, experience };
  } else {
    const projects = state.projects.map(proj => {
      if (proj.id !== parentId) return proj;
      const bullets = (proj.bullets ?? []).map(b =>
        b.id === bulletId ? { ...b, active: false } : b
      );
      const anyActive = bullets.some(b => b.active);
      return { ...proj, active: anyActive, bullets };
    });
    return { ...state, projects };
  }
}

function hideSkillGroup(state: ResumeState, id: string): ResumeState {
  return {
    ...state,
    skillGroups: state.skillGroups.map(sg =>
      sg.id === id ? { ...sg, active: false } : sg
    ),
  };
}

// ── Phase 1: hide lowest-scoring whole projects ───────────────────────────────

function getLowestScoringProject(
  state: ResumeState,
  keywords: string[],
): string | null {
  const active = state.projects.filter(p => p.active);
  if (active.length === 0) return null;
  return active
    .map(p => ({ id: p.id, score: scoreProject(p, keywords) }))
    .sort((a, b) => a.score - b.score)[0].id;
}

// ── Phase 2: hide lowest-scoring individual bullets + skill groups ────────────

interface FineTrimItem {
  type: 'expBullet' | 'projBullet' | 'skillGroup';
  parentId: string;
  bulletId?: string;
  score: number;
}

function getFineTrimQueue(state: ResumeState, keywords: string[]): FineTrimItem[] {
  const items: FineTrimItem[] = [];

  state.experience.forEach(exp => {
    if (!exp.active) return;
    (exp.bullets ?? []).forEach(b => {
      if (!b.active) return;
      items.push({
        type: 'expBullet',
        parentId: exp.id,
        bulletId: b.id,
        score: scoreText(b.text ?? '', keywords),
      });
    });
  });

  state.projects.forEach(proj => {
    if (!proj.active) return;
    (proj.bullets ?? []).forEach(b => {
      if (!b.active) return;
      items.push({
        type: 'projBullet',
        parentId: proj.id,
        bulletId: b.id,
        score: scoreText(b.text ?? '', keywords),
      });
    });
  });

  state.skillGroups.forEach(sg => {
    if (!sg.active) return;
    items.push({
      type: 'skillGroup',
      parentId: sg.id,
      score: scoreText(`${sg.label} ${sg.skills}`, keywords),
    });
  });

  // Lowest score first; skill groups before bullets on tiebreak
  return items.sort((a, b) => {
    if (a.score !== b.score) return a.score - b.score;
    if (a.type === 'skillGroup' && b.type !== 'skillGroup') return -1;
    if (a.type !== 'skillGroup' && b.type === 'skillGroup') return 1;
    return 0;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export interface TailoringResult {
  state: ResumeState;
  keywordsUsed: string[];
  projectsHidden: number;
  bulletsHidden: number;
  itemsHidden: number;
  alreadyFit: boolean;
  estimatedPages: number;
}

export function tailorResumeForJob(state: ResumeState, job: Job): TailoringResult {
  const keywords = extractJobKeywords(job);

  const initial = measureResumeHeight(state);

  if (initial.fitsOnePage) {
    return {
      state,
      keywordsUsed: keywords,
      projectsHidden: 0,
      bulletsHidden: 0,
      itemsHidden: 0,
      alreadyFit: true,
      estimatedPages: initial.estimatedPages,
    };
  }

  // Sort experience and projects by relevance (reorder without hiding)
  const sortedExp = state.experience
    .map(exp => ({
      ...exp,
      _s: scoreText(
        [exp.title, exp.company, ...(exp.bullets ?? []).map(b => b.text)].join(' '),
        keywords
      ),
    }))
    .sort((a, b) => b._s - a._s)
    .map(({ _s, ...exp }) => exp);

  const sortedProjects = state.projects
    .map(proj => ({
      ...proj,
      _s: scoreProject(proj, keywords),
    }))
    .sort((a, b) => b._s - a._s)
    .map(({ _s, ...proj }) => proj);

  let working: ResumeState = { ...state, experience: sortedExp, projects: sortedProjects };

  let projectsHidden = 0;
  let bulletsHidden = 0;
  let itemsHidden = 0;
  let safetyLimit = 200;
  let measure = measureResumeHeight(working);

  // ── Phase 1: hide whole projects until close to fitting ───────────────────

  while (
    !measure.fitsOnePage &&
    measure.overflowPx > FINE_TRIM_THRESHOLD_PX &&
    safetyLimit-- > 0
  ) {
    const projId = getLowestScoringProject(working, keywords);
    if (!projId) break;

    working = hideProject(working, projId);
    projectsHidden++;
    itemsHidden++;
    measure = measureResumeHeight(working);
  }

  // ── Phase 2: fine-trim bullets and skill groups until fits ────────────────

  while (!measure.fitsOnePage && safetyLimit-- > 0) {
    const queue = getFineTrimQueue(working, keywords);
    if (queue.length === 0) break;

    const toHide = queue[0];

    if (toHide.type === 'expBullet') {
      const prev = working;
      working = hideBullet(working, 'exp', toHide.parentId, toHide.bulletId!);
      bulletsHidden++;
      const wasActive = prev.experience.find(e => e.id === toHide.parentId)?.active;
      const nowActive = working.experience.find(e => e.id === toHide.parentId)?.active;
      if (wasActive && !nowActive) itemsHidden++;
    } else if (toHide.type === 'projBullet') {
      const prev = working;
      working = hideBullet(working, 'proj', toHide.parentId, toHide.bulletId!);
      bulletsHidden++;
      const wasActive = prev.projects.find(p => p.id === toHide.parentId)?.active;
      const nowActive = working.projects.find(p => p.id === toHide.parentId)?.active;
      if (wasActive && !nowActive) itemsHidden++;
    } else {
      working = hideSkillGroup(working, toHide.parentId);
      itemsHidden++;
    }

    measure = measureResumeHeight(working);
  }

  return {
    state: working,
    keywordsUsed: keywords,
    projectsHidden,
    bulletsHidden,
    itemsHidden,
    alreadyFit: false,
    estimatedPages: measure.estimatedPages,
  };
}
