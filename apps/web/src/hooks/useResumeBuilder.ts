import { useState, useEffect, useCallback } from 'react';
import type { CvProfile, Role, SkillEntry } from '@apcomp/types';
import type { Job } from '@apcomp/types';
import { tailorResumeForJob, type TailoringResult } from './resumeTailor';

const API = 'http://localhost:3000';

export interface EditableBullet {
  id: string;
  text: string;
  active: boolean;
}

export interface ResumeExperience {
  id: string;
  active: boolean;
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  location?: string;
  bullets: EditableBullet[];
}

export interface ResumeProject {
  id: string;
  active: boolean;
  text: string;
}

export interface ResumeSkillGroup {
  id: string;
  active: boolean;
  label: string;
  skills: string;
}

export interface ResumeEducation {
  id: string;
  active: boolean;
  institution: string;
  degree: string;
  location: string;
  dates: string;
}

export interface ResumeHeader {
  name: string;
  title: string;
  phone: string;
  email: string;
  linkedin: string;
  github: string;
}

export interface ResumeState {
  header: ResumeHeader;
  aboutMe: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skillGroups: ResumeSkillGroup[];
}

function parseContactLine(rawText: string): Partial<ResumeHeader> {
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

function roleToBullets(role: Role): EditableBullet[] {
  const lines = role.description
    .split(/[•\n]/)
    .map(l => l.trim())
    .filter(l => l.length > 10);

  if (lines.length === 0) {
    return [{ id: `b-${Math.random()}`, text: role.description, active: true }];
  }

  return lines.map((text, i) => ({
    id: `b-${role.company}-${i}`,
    text,
    active: true,
  }));
}

function buildInitialState(p: CvProfile): ResumeState {
  const contact = parseContactLine(p.rawText ?? '');

  const experience: ResumeExperience[] = p.roles.map((role, i) => ({
    id: `exp-${i}`,
    active: true,
    company: role.company,
    title: role.title,
    startDate: role.startDate,
    endDate: role.endDate,
    bullets: roleToBullets(role),
  }));

  const projectsMatch = p.rawText?.match(/Personal Projects([\s\S]*?)(?:Technical Skills|$)/i);
  const projectLines = projectsMatch
    ? projectsMatch[1].split(/[•\n]/).map(l => l.trim()).filter(l => l.length > 10)
    : [];

  const projects: ResumeProject[] = projectLines.map((text, i) => ({
    id: `proj-${i}`,
    active: true,
    text,
  }));

  const byCategory: Record<string, SkillEntry[]> = {};
  p.skills.forEach(s => {
    (byCategory[s.category] = byCategory[s.category] ?? []).push(s);
  });

  const skillGroups: ResumeSkillGroup[] = Object.entries(byCategory).map(([cat, skills], i) => ({
    id: `sg-${i}`,
    active: true,
    label: cat.charAt(0).toUpperCase() + cat.slice(1) + 's',
    skills: skills.map(s => s.name).join(', '),
  }));

  if (skillGroups.length === 0 && p.rawText) {
    const primaryMatch = p.rawText.match(/Primary Languages?:\s*([^\n]+)/i);
    const frameworkMatch = p.rawText.match(/Frameworks? and Libraries?:\s*([^\n]+)/i);
    if (primaryMatch) skillGroups.push({ id: 'sg-0', active: true, label: 'Primary Languages', skills: primaryMatch[1].trim() });
    if (frameworkMatch) skillGroups.push({ id: 'sg-1', active: true, label: 'Frameworks and Libraries', skills: frameworkMatch[1].trim() });
  }

  const eduMatch = p.rawText?.match(/University of Iowa[^\n]*\n([^\n]+)\n([^\n]+)/);
  const education: ResumeEducation[] = [{
    id: 'edu-0',
    active: true,
    institution: 'University of Iowa',
    location: 'Iowa City, USA',
    degree: eduMatch?.[1]?.trim() ?? 'Computer Science (BA)',
    dates: eduMatch?.[2]?.trim() ?? '',
  }];

  const aboutMatch = p.rawText?.match(/About Me\n([\s\S]*?)(?:Work Experience|$)/i);
  const aboutMe = aboutMatch?.[1]?.trim() ?? '';

  return {
    header: {
      name: p.name ?? 'Your Name',
      title: 'Software Developer',
      phone: contact.phone ?? '',
      email: contact.email ?? p.email ?? '',
      linkedin: contact.linkedin ?? '',
      github: contact.github ?? '',
    },
    aboutMe,
    education,
    experience,
    projects,
    skillGroups,
  };
}

export function useResumeBuilder(initialJob?: Job | null) {
  const [profile, setProfile] = useState<CvProfile | null>(null);
  const [baseState, setBaseState] = useState<ResumeState | null>(null);
  const [state, setState] = useState<ResumeState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tailoringResult, setTailoringResult] = useState<TailoringResult | null>(null);
  const [activeJob, setActiveJob] = useState<Job | null>(initialJob ?? null);

  useEffect(() => {
    fetch(`${API}/resume/profile`)
      .then(r => r.json())
      .then((p: CvProfile) => {
        if (!p) { setLoading(false); return; }
        setProfile(p);
        const initial = buildInitialState(p);
        setBaseState(initial);

        // If a job was passed in, tailor immediately
        if (initialJob) {
          const result = tailorResumeForJob(initial, initialJob);
          setState(result.state);
          setTailoringResult(result);
        } else {
          setState(initial);
        }
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load profile. Please upload your CV first.');
        setLoading(false);
      });
  }, []);

  const tailorForJob = useCallback((job: Job) => {
    if (!baseState) return;
    setActiveJob(job);
    const result = tailorResumeForJob(baseState, job);
    setState(result.state);
    setTailoringResult(result);
  }, [baseState]);

  const resetToFull = useCallback(() => {
    if (!baseState) return;
    setActiveJob(null);
    setState(baseState);
    setTailoringResult(null);
  }, [baseState]);

  // Updaters
  const updateHeader = useCallback((field: keyof ResumeHeader, value: string) => {
    setState(s => s ? { ...s, header: { ...s.header, [field]: value } } : s);
  }, []);

  const updateAboutMe = useCallback((value: string) => {
    setState(s => s ? { ...s, aboutMe: value } : s);
  }, []);

  const toggleExperience = useCallback((id: string) => {
    setState(s => s ? {
      ...s,
      experience: s.experience.map(e => e.id === id ? { ...e, active: !e.active } : e),
    } : s);
  }, []);

  const reorderExperience = useCallback((from: number, to: number) => {
    setState(s => {
      if (!s) return s;
      const arr = [...s.experience];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...s, experience: arr };
    });
  }, []);

  const updateBullet = useCallback((expId: string, bulletId: string, text: string) => {
    setState(s => s ? {
      ...s,
      experience: s.experience.map(e => e.id === expId ? {
        ...e,
        bullets: e.bullets.map(b => b.id === bulletId ? { ...b, text } : b),
      } : e),
    } : s);
  }, []);

  const toggleBullet = useCallback((expId: string, bulletId: string) => {
    setState(s => s ? {
      ...s,
      experience: s.experience.map(e => e.id === expId ? {
        ...e,
        bullets: e.bullets.map(b => b.id === bulletId ? { ...b, active: !b.active } : b),
      } : e),
    } : s);
  }, []);

  const toggleProject = useCallback((id: string) => {
    setState(s => s ? {
      ...s,
      projects: s.projects.map(p => p.id === id ? { ...p, active: !p.active } : p),
    } : s);
  }, []);

  const reorderProjects = useCallback((from: number, to: number) => {
    setState(s => {
      if (!s) return s;
      const arr = [...s.projects];
      const [item] = arr.splice(from, 1);
      arr.splice(to, 0, item);
      return { ...s, projects: arr };
    });
  }, []);

  const updateProject = useCallback((id: string, text: string) => {
    setState(s => s ? {
      ...s,
      projects: s.projects.map(p => p.id === id ? { ...p, text } : p),
    } : s);
  }, []);

  const toggleSkillGroup = useCallback((id: string) => {
    setState(s => s ? {
      ...s,
      skillGroups: s.skillGroups.map(sg => sg.id === id ? { ...sg, active: !sg.active } : sg),
    } : s);
  }, []);

  const updateSkillGroup = useCallback((id: string, field: 'label' | 'skills', value: string) => {
    setState(s => s ? {
      ...s,
      skillGroups: s.skillGroups.map(sg => sg.id === id ? { ...sg, [field]: value } : sg),
    } : s);
  }, []);

  return {
    profile,
    state,
    loading,
    error,
    tailoringResult,
    activeJob,
    tailorForJob,
    resetToFull,
    updateHeader,
    updateAboutMe,
    toggleExperience,
    reorderExperience,
    updateBullet,
    toggleBullet,
    toggleProject,
    reorderProjects,
    updateProject,
    toggleSkillGroup,
    updateSkillGroup,
  };
}
