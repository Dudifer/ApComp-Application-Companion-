export type SkillCategory = 'language' | 'framework' | 'tool' | 'practice' | 'methodology';
export type Proficiency = 'beginner' | 'intermediate' | 'advanced' | 'expert';
export type GapQuestionType = 'multiselect' | 'text' | 'scale';

export interface SkillEntry {
  name: string;
  category: SkillCategory;
  monthsExperience: number;
  proficiency: Proficiency;
  usedAt: string[];
}

export interface Role {
  company: string;
  title: string;
  startDate: string;
  endDate?: string;
  durationMonths: number;
  technologies: string[];
  practices: string[];
  description: string;
}

export interface Project {
  name: string;
  category?: string;
  date?: string;
  techStack?: string;
  bullets: string[];
}

/**
 * One entry on the CV's Education section.
 *
 * `school`, `degree`, and dates cover what most application forms ask for.
 * `gpa`, `major`, `activities` and `honors` are surfaced where pages ask but
 * left undefined when the CV doesn't mention them — applications skip
 * unknown fields rather than guess.
 */
export interface EducationEntry {
  school: string;
  degree?: string;          // e.g. "Bachelor of Science", "B.S."
  field?: string;           // e.g. "Computer Science"
  startDate?: string;       // YYYY-MM (or YYYY if month is unknown)
  endDate?: string;         // YYYY-MM, or "Expected YYYY-MM"
  gpa?: string;             // string, not number — sometimes "3.8/4.0"
  location?: string;
  honors?: string[];        // e.g. ["cum laude", "Dean's List"]
  activities?: string[];
}

export interface GapQuestion {
  id: string;
  company: string;
  question: string;
  type: GapQuestionType;
  options?: string[];
  answer?: string;
}

export interface CvProfile {
  name?: string;
  email?: string;
  roles: Role[];
  skills: SkillEntry[];
  practices: string[];
  projects?: Project[];
  education?: EducationEntry[];
  gapQuestions: GapQuestion[];
  isComplete: boolean;
  rawText?: string;
}

export interface GapAnswerPayload {
  questionId: string;
  answer: string;
}
