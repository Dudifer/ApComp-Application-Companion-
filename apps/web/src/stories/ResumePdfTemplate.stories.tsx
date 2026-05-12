import type { Meta, StoryObj } from '@storybook/react';
import { PDFViewer } from '@react-pdf/renderer';
import { ResumePdfTemplate } from '../components/ResumePdfTemplate';
import type { ResumeState } from '../hooks/useResumeBuilder';

const BASE_STATE: ResumeState = {
  header: {
    name: 'Jacob Nyberg',
    title: 'Software Developer',
    phone: '319-541-3440',
    email: 'jacob.6nyberg@gmail.com',
    linkedin: 'linkedin.com/in/jacob-nyberg/',
    github: 'github.com/dudifer',
  },
  aboutMe: 'Motivated and skilled collaborator with a strong commitment to Agile methodologies and a proven track record of designing and developing innovative software applications.',
  education: [{
    id: 'edu-0', active: true,
    institution: 'University of Iowa', location: 'Iowa City, USA',
    degree: 'Computer Science (BA)', dates: 'Jan 2021 - May 2025',
  }],
  experience: [
    {
      id: 'exp-0', active: true,
      company: 'University of Iowa Libraries Digital Studio',
      title: 'Junior Developer',
      startDate: '2023-09', endDate: undefined,
      bullets: [
        { id: 'b-0-0', active: true, text: 'Explored web development by researching, implementing, and measuring the effects of SEO strategies.' },
        { id: 'b-0-1', active: true, text: 'Created app for the Main Library touchscreen to serve as a tool for visitors.' },
        { id: 'b-0-2', active: true, text: 'Cut down on maintenance costs by automating updates for Omeka websites.' },
      ],
    },
    {
      id: 'exp-1', active: true,
      company: 'Liminal Education Consultant',
      title: 'App Developer',
      startDate: '2024-06', endDate: '2024-08',
      bullets: [
        { id: 'b-1-0', active: true, text: 'Implemented skills in problem analysis, software design and development.' },
      ],
    },
    {
      id: 'exp-2', active: true,
      company: 'University of Iowa Computational Epidemiology Research Group',
      title: 'Research Assistant/Ambassador',
      startDate: '2023-06', endDate: '2023-08',
      bullets: [
        { id: 'b-2-0', active: true, text: 'Displayed communication and leadership skills as Ambassador.' },
        { id: 'b-2-1', active: true, text: 'Developed a program that simulates the spread of airborne diseases.' },
      ],
    },
  ],
  projects: [
    { id: 'proj-0', active: true, text: 'Gained ML experience creating identification and series-based prediction programs.' },
    { id: 'proj-1', active: true, text: 'Honed professional software engineering skills developing a voting app.' },
  ],
  skillGroups: [
    { id: 'sg-0', active: true, label: 'Primary Languages', skills: 'Java, Python, C#, SQL, JavaScript/HTML/CSS, Bash' },
    { id: 'sg-1', active: true, label: 'Frameworks and Libraries', skills: 'Pandas, PyTorch, Spring, Node.js, Express.js, JUnit, Jest' },
  ],
};

// Wrapper to show PDF in a viewer
function PdfPreview({ state }: { state: ResumeState }) {
  return (
    <PDFViewer width="100%" height="700px" showToolbar={false}>
      <ResumePdfTemplate state={state} />
    </PDFViewer>
  );
}

const meta: Meta<typeof PdfPreview> = {
  title: 'Resume/ResumePdfTemplate',
  component: PdfPreview,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Live PDF preview of the resume template. Each story shows a different visibility state.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PdfPreview>;

// Full CV — everything visible
export const FullCV: Story = {
  name: 'Full CV (all items visible)',
  args: { state: BASE_STATE },
};

// Hidden oldest job
export const TwoJobs: Story = {
  name: 'Two jobs (oldest hidden)',
  args: {
    state: {
      ...BASE_STATE,
      experience: BASE_STATE.experience.map((e, i) =>
        i === 2 ? { ...e, active: false } : e
      ),
    },
  },
};

// Trimmed bullets — only first bullet per job
export const TrimmedBullets: Story = {
  name: 'Trimmed bullets (1 per job)',
  args: {
    state: {
      ...BASE_STATE,
      experience: BASE_STATE.experience.map(e => ({
        ...e,
        bullets: e.bullets.map((b, i) => ({ ...b, active: i === 0 })),
      })),
    },
  },
};

// No projects
export const NoProjects: Story = {
  name: 'No projects section',
  args: {
    state: {
      ...BASE_STATE,
      projects: BASE_STATE.projects.map(p => ({ ...p, active: false })),
    },
  },
};

// Tailored — minimal 1-page version
export const TailoredMinimal: Story = {
  name: 'Tailored minimal (1 job, key bullets only)',
  args: {
    state: {
      ...BASE_STATE,
      experience: BASE_STATE.experience.map((e, i) => ({
        ...e,
        active: i === 0,
        bullets: e.bullets.map((b, j) => ({ ...b, active: j === 0 })),
      })),
      projects: BASE_STATE.projects.map((p, i) => ({ ...p, active: i === 0 })),
    },
  },
};
