import type { CvProfile, Role, SkillEntry } from '@apcomp/types';
import type {
  ResumeState,
  ResumeHeader,
  ResumeExperience,
  ResumeProject,
  ResumeSkillGroup,
  ResumeEducation,
  EditableBullet,
} from './useResumeBuilder';

export function parseContactLine(rawText: string): Partial<ResumeHeader> {
  const phone = rawText.match(/(\d{3}[-.]?\d{3}[-.]?\d{4})/)?.[1] ?? '';
  const email = rawText.match(/[\w.]+@[\w.]+\.\w+/)?.[0] ?? '';
  const linkedin = rawText.match(/linkedin\.com\/in\/([\w-]+)/)?.[1] ?? '';
  const github = rawText.match(/github\.com\/([\w-]+)/)?.[1] ?? '';
  return {
    phone,
    email,
    linkedin: linkedin ? `linkedin.com/in/${linkedin}` : '',
    github: github ? `github.com/${github}` : '',
  };
}

export function roleToBullets(role: Role): EditableBullet[] {
  console.log('description for', role.company, ':', JSON.stringify(role.description));
  let lines = role.description
    .split(/\n|•/)
    .map(l => l.replace(/^[•\-]\s*/, '').trim())
    .filter(l => l.length > 15);
  if (lines.length <= 1) {
    lines = role.description
      .split(/\.\s+/)
      .map(l => l.trim())
      .filter(l => l.length > 15)
      .map(l => l.endsWith('.') ? l : l + '.');
  }
  console.log('lines found:', lines.length);

  if (lines.length === 0 && role.description.length > 10) {
    return [{ id: `b-${role.company}-0`, text: role.description.trim(), active: true }];
  }

  return lines.map((text, i) => ({
    id: `b-${role.company}-${i}`,
    text,
    active: true,
  }));
}

export function extractProjects(profile: CvProfile): ResumeProject[] {
  // Use AI-extracted structured projects if available
  console.log('Raw profile.projects:', JSON.stringify(profile.projects));
  if (profile.projects && profile.projects.length > 0) {
    return profile.projects.map((p, i) => ({
      id: `proj-${i}`,
      active: true,
      name: p.name,
      category: p.category,
      date: p.date,
      techStack: p.techStack,
      bullets: (p.bullets ?? []).map((text, j) => ({
        id: `pb-${i}-${j}`,
        text,
        active: true,
      })),
    }));
  }

  // Fallback: parse from rawText
  if (!profile.rawText) return [];
  return extractProjectsFromRawText(profile.rawText);
}

function extractProjectsFromRawText(rawText: string): ResumeProject[] {
  const lines = rawText.split('\n').map(l => l.trim());
  let inProjects = false;
  const projects: ResumeProject[] = [];
  let current: ResumeProject | null = null;

  for (const line of lines) {
    if (/personal projects/i.test(line)) { inProjects = true; continue; }
    if (/technical skills|work experience|education/i.test(line)) { inProjects = false; continue; }
    if (!inProjects || !line) continue;

    const isBullet = /^[•\-]/.test(line);

    if (!isBullet && line.includes('|')) {
      // Project header line: "Name | Category   Date"
      const parts = line.split('|');
      const name = parts[0].trim();
      const rest = parts[1] ?? '';
      // Try to split category and date (date is usually at the end after spaces)
      const dateMatch = rest.match(/^(.*?)\s{2,}(\w+\s+\d{4})$/);
      const category = dateMatch ? dateMatch[1].trim() : rest.trim();
      const date = dateMatch ? dateMatch[2].trim() : undefined;

      if (current) projects.push(current);
      current = {
        id: `proj-${projects.length}`,
        active: true,
        name,
        category,
        date,
        techStack: undefined,
        bullets: [],
      };
    } else if (current && isBullet) {
  current.bullets.push({
    id: `pb-${projects.length}-${current.bullets.length}`,
    text: line.replace(/^[•\-]\s*/, '').trim(),
    active: true,
      });
    } else if (current && !isBullet && current.bullets.length > 0 && !line.includes('|') && !line.match(/^\w+ - /)) {
      // Continuation of previous bullet (PDF line wrap)
      const lastBullet = current.bullets[current.bullets.length - 1];
      lastBullet.text = lastBullet.text + ' ' + line;
    }
  }

  if (current) projects.push(current);
  return projects;
}

export function extractSkillGroups(profile: CvProfile): ResumeSkillGroup[] {
  const byCategory: Record<string, SkillEntry[]> = {};
  (profile.skills ?? []).forEach(s => {
    (byCategory[s.category] = byCategory[s.category] ?? []).push(s);
  });

  const groups: ResumeSkillGroup[] = Object.entries(byCategory).map(([cat, skills], i) => ({
    id: `sg-${i}`,
    active: true,
    label: cat.charAt(0).toUpperCase() + cat.slice(1) + 's',
    skills: skills.map(s => s.name).join(', '),
  }));

  if (groups.length > 0) return groups;

  if (!profile.rawText) return [];
  const result: ResumeSkillGroup[] = [];
  const primaryMatch = profile.rawText.match(/Primary Languages?:\s*([^\n]+)/i);
  const frameworkMatch = profile.rawText.match(/Frameworks? and Libraries?:\s*([^\n]+)/i);
  if (primaryMatch) result.push({ id: 'sg-0', active: true, label: 'Primary Languages', skills: primaryMatch[1].trim() });
  if (frameworkMatch) result.push({ id: 'sg-1', active: true, label: 'Frameworks and Libraries', skills: frameworkMatch[1].trim() });
  return result;
}

export function extractEducation(rawText: string): ResumeEducation[] {
  const eduMatch = rawText.match(/University of Iowa[^\n]*\n([^\n]+)\n([^\n]+)/);
  return [{
    id: 'edu-0',
    active: true,
    institution: 'University of Iowa',
    location: 'Iowa City, USA',
    degree: eduMatch?.[1]?.trim() ?? 'Computer Science (BA)',
    dates: eduMatch?.[2]?.trim() ?? '',
  }];
}

export function extractAboutMe(rawText: string): string {
  const aboutMatch = rawText.match(/About Me\n([\s\S]*?)(?:Work Experience|Technical Skills|Personal Projects|Education|$)/i);
  return aboutMatch?.[1]?.trim() ?? '';
}

export function buildInitialState(p: CvProfile): ResumeState {
  const contact = parseContactLine(p.rawText ?? '');
  const rawText = p.rawText ?? '';

  const experience: ResumeExperience[] = p.roles.map((role, i) => ({
    id: `exp-${i}`,
    active: true,
    company: role.company,
    title: role.title,
    startDate: role.startDate,
    endDate: role.endDate,
    bullets: roleToBullets(role),
  }));

  return {
    header: {
      name: p.name ?? 'Your Name',
      title: 'Software Developer',
      phone: contact.phone ?? '',
      email: contact.email ?? p.email ?? '',
      linkedin: contact.linkedin ?? '',
      github: contact.github ?? '',
    },
    aboutMe: extractAboutMe(rawText),
    education: extractEducation(rawText),
    experience,
    projects: extractProjects(p),
    skillGroups: extractSkillGroups(p),
  };
}
