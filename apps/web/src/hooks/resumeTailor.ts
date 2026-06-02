import type { Job } from '@apcomp/types';
import type { ResumeState } from './useResumeBuilder';
import { measureResumeHeight } from './measureResumeHeight';

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

// ── Hideable item types ───────────────────────────────────────────────────────

type HideableItem =
  | { type: 'expBullet';  expId: string;  bulletId: string; score: number }
  | { type: 'projBullet'; projId: string; bulletId: string; score: number }
  | { type: 'skillGroup'; id: string;     score: number };

// ── Apply a single hide operation ─────────────────────────────────────────────

function hideItem(state: ResumeState, item: HideableItem): ResumeState {
  switch (item.type) {
    case 'expBullet': {
      const experience = state.experience.map(exp => {
        if (exp.id !== item.expId) return exp;
        const bullets = (exp.bullets ?? []).map(b =>
          b.id === item.bulletId ? { ...b, active: false } : b
        );
        const anyActive = bullets.some(b => b.active);
        return { ...exp, active: anyActive, bullets };
      });
      return { ...state, experience };
    }
    case 'projBullet': {
      const projects = state.projects.map(proj => {
        if (proj.id !== item.projId) return proj;
        const bullets = (proj.bullets ?? []).map(b =>
          b.id === item.bulletId ? { ...b, active: false } : b
        );
        const anyActive = bullets.some(b => b.active);
        return { ...proj, active: anyActive, bullets };
      });
      return { ...state, projects };
    }
    case 'skillGroup': {
      return {
        ...state,
        skillGroups: state.skillGroups.map(sg =>
          sg.id === item.id ? { ...sg, active: false } : sg
        ),
      };
    }
  }
}

// ── Build priority queue from current state ───────────────────────────────────

function buildQueue(state: ResumeState, keywords: string[]): HideableItem[] {
  const items: HideableItem[] = [];

  state.experience.forEach(exp => {
    if (!exp.active) return;
    (exp.bullets ?? []).forEach(b => {
      if (!b.active) return;
      items.push({
        type: 'expBullet',
        expId: exp.id,
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
        projId: proj.id,
        bulletId: b.id,
        score: scoreText(b.text ?? '', keywords),
      });
    });
  });

  state.skillGroups.forEach(sg => {
    if (!sg.active) return;
    items.push({
      type: 'skillGroup',
      id: sg.id,
      score: scoreText(`${sg.label} ${sg.skills}`, keywords),
    });
  });

  // Lowest score hidden first; skill groups before bullets on tiebreak
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
  itemsHidden: number;
  bulletsHidden: number;
  alreadyFit: boolean;
  estimatedPages: number;
}

export function tailorResumeForJob(state: ResumeState, job: Job): TailoringResult {
  const keywords = extractJobKeywords(job);

  // Measure actual rendered height
  const initial = measureResumeHeight(state);

  if (initial.fitsOnePage) {
    return {
      state,
      keywordsUsed: keywords,
      itemsHidden: 0,
      bulletsHidden: 0,
      alreadyFit: true,
      estimatedPages: initial.estimatedPages,
    };
  }

  // Reorder experience and projects by relevance score
  const scoredExp = state.experience
    .map(exp => ({
      ...exp,
      _score: scoreText(
        [exp.title, exp.company, ...(exp.bullets ?? []).map(b => b.text)].join(' '),
        keywords
      ),
    }))
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...exp }) => exp);

  const scoredProjects = state.projects
    .map(proj => ({
      ...proj,
      _score: scoreText(
        [proj.name, proj.category, proj.techStack, ...(proj.bullets ?? []).map(b => b.text)]
          .filter(Boolean).join(' '),
        keywords
      ),
    }))
    .sort((a, b) => b._score - a._score)
    .map(({ _score, ...proj }) => proj);

  let working: ResumeState = { ...state, experience: scoredExp, projects: scoredProjects };

  let bulletsHidden = 0;
  let itemsHidden = 0;
  let safetyLimit = 300;
  let lastMeasure = measureResumeHeight(working);

  while (!lastMeasure.fitsOnePage && safetyLimit-- > 0) {
    const queue = buildQueue(working, keywords);
    if (queue.length === 0) break;

    const toHide = queue[0];
    const prev = working;
    working = hideItem(working, toHide);

    // Count hidden items
    if (toHide.type === 'expBullet') {
      bulletsHidden++;
      const wasActive = prev.experience.find(e => e.id === toHide.expId)?.active;
      const nowActive = working.experience.find(e => e.id === toHide.expId)?.active;
      if (wasActive && !nowActive) itemsHidden++;
    } else if (toHide.type === 'projBullet') {
      bulletsHidden++;
      const wasActive = prev.projects.find(p => p.id === toHide.projId)?.active;
      const nowActive = working.projects.find(p => p.id === toHide.projId)?.active;
      if (wasActive && !nowActive) itemsHidden++;
    } else {
      itemsHidden++;
    }

    // Re-measure after each hide
    lastMeasure = measureResumeHeight(working);
  }

  return {
    state: working,
    keywordsUsed: keywords,
    itemsHidden,
    bulletsHidden,
    alreadyFit: false,
    estimatedPages: lastMeasure.estimatedPages,
  };
}
