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
  const lines = role.description
    .split(/\n/)
    .map(l => l.replace(/^[•\-]\s*/, '').trim())
    .filter(l => l.length > 15);

  if (lines.length === 0 && role.description.length > 10) {
    return [{ id: `b-${role.company}-0`, text: role.description.trim(), active: true }];
  }

  return lines.map((text, i) => ({
    id: `b-${role.company}-${i}`,
    text,
    active: true,
  }));
}

export function extractProjects(rawText: string): ResumeProject[] {
  const lines: string[] = [];
  const rawLines = rawText.split('\n').map(l => l.trim());
  let inProjects = false;

  for (const line of rawLines) {
    if (/personal projects/i.test(line)) { inProjects = true; continue; }
    if (/technical skills|work experience|education/i.test(line)) { inProjects = false; continue; }
    if (inProjects && line.length > 10) {
      lines.push(line.replace(/^[•\-]\s*/, '').trim());
    }
  }

  return lines
    .filter(t => t.length > 10)
    .map((text, i) => ({ id: `proj-${i}`, active: true, text }));
}

export function extractSkillGroups(profile: CvProfile): ResumeSkillGroup[] {
  // First try structured skills from AI extraction
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

  // Fallback: parse from rawText
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
    projects: extractProjects(rawText),
    skillGroups: extractSkillGroups(p),
  };
}
