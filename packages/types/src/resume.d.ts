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
    gapQuestions: GapQuestion[];
    isComplete: boolean;
    rawText?: string;
}
export interface GapAnswerPayload {
    questionId: string;
    answer: string;
}
