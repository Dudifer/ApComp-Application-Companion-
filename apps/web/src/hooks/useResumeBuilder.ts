import { useState, useEffect, useRef, useCallback } from 'react';
import type { CvProfile, Role, SkillEntry } from '@apcomp/types';
import type { Job } from '@apcomp/types';
import { tailorResumeForJob, type TailoringResult } from './resumeTailor';
import { buildInitialState } from './resumeUtils';

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
  name: string;           // e.g. "Iris-Seratota Flower Identification"
  category?: string;      // e.g. "Computer Vision & Machine Learning"
  date?: string;          // e.g. "Fall 2022"
  techStack?: string;     // e.g. "Python - PyTorch - sklearn - NumPy"
  bullets: EditableBullet[];
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
        console.log('Profile fetch result:', p);
        console.log('Has name:', p?.name);
        console.log('Roles length:', p?.roles?.length);
        if (!p || !p.name) { setLoading(false); return; }
        setProfile(p);
        const initial = buildInitialState(p);
        console.log('Built initial state:', initial);  // ← add this
        setBaseState(initial);
        if (initialJob) {
          const result = tailorResumeForJob(initial, initialJob);
          setState(result.state);
          setTailoringResult(result);
        } else {
          setState(initial);
        }
        setLoading(false);
        console.log('Loading set to false');  
      })
      .catch((err) => {
        console.log('Fetch error:', err);  
        setError('Could not load profile.');
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
  const toggleProjectBullet = useCallback((projId: string, bulletId: string) => {
    setState(s => s ? {
      ...s,
      projects: s.projects.map(p => p.id === projId ? {
        ...p,
        bullets: (p.bullets ?? []).map(b => b.id === bulletId ? { ...b, active: !b.active } : b),
      } : p),
    } : s);
  }, []);

  const updateProjectBullet = useCallback((projId: string, bulletId: string, text: string) => {
    setState(s => s ? {
      ...s,
      projects: s.projects.map(p => p.id === projId ? {
        ...p,
        bullets: (p.bullets ?? []).map(b => b.id === bulletId ? { ...b, text } : b),
      } : p),
    } : s);
  }, []);

  const updateProjectField = useCallback((projId: string, field: 'name' | 'category' | 'date' | 'techStack', value: string) => {
    setState(s => s ? {
      ...s,
      projects: s.projects.map(p => p.id === projId ? { ...p, [field]: value } : p),
    } : s);
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
    toggleProjectBullet,
    updateProjectBullet,
    updateProjectField,
  };
}
