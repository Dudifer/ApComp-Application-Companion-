import type { Meta, StoryObj } from '@storybook/react';
import { useState } from 'react';
import { JobDetailPanel } from '../components/JobDetailPanel';
import type { Job } from '@apcomp/types';

const MOCK_JOB_FULL: Job = {
  id: 'jsearch-abc123',
  externalId: 'abc123',
  source: 'jsearch',
  title: 'Software Engineer',
  company: 'Stripe',
  companyLogo: undefined,
  companyWebsite: 'https://stripe.com',
  companyType: 'Fintech',
  location: {
    displayName: 'San Francisco, CA',
    city: 'San Francisco',
    state: 'CA',
    country: 'US',
    lat: 37.7749,
    lng: -122.4194,
  },
  remote: false,
  description: `We are looking for a Software Engineer to join our team.\n\nYou will work on building the infrastructure that powers global payments.\n\nResponsibilities include designing scalable systems, writing clean code, and collaborating with cross-functional teams.\n\nThis is a full-time role based in San Francisco.`,
  highlights: {
    qualifications: [
      '2+ years of professional software engineering experience',
      'Strong proficiency in TypeScript or Python',
      'Experience with distributed systems',
      'Familiarity with REST APIs and microservices',
    ],
    responsibilities: [
      'Design and build scalable backend services',
      'Collaborate with product and design teams',
      'Participate in code reviews and architecture discussions',
      'Monitor and improve system reliability',
    ],
    benefits: [
      'Competitive salary and equity',
      'Comprehensive health, dental, and vision',
      'Flexible PTO',
      '401(k) matching',
    ],
  },
  tags: ['TypeScript', 'Python', 'Distributed Systems', 'REST APIs'],
  url: 'https://stripe.com/jobs/listing/software-engineer',
  applyOptions: [
    { publisher: 'Stripe', url: 'https://stripe.com/jobs/listing/software-engineer', isDirect: true },
    { publisher: 'LinkedIn', url: 'https://linkedin.com/jobs/view/123', isDirect: false },
  ],
  applyIsDirect: true,
  contractTime: 'full_time',
  contractType: 'permanent',
  employmentType: 'FULLTIME',
  publisher: 'LinkedIn',
  salary: { min: 130000, max: 180000, currency: 'USD', period: 'YEAR' },
  experience: { noExperienceRequired: false, requiredMonths: 24, experienceMentioned: true },
  education: { bachelorsRequired: true, degreePreferred: true },
  postedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
  expiresAt: new Date(Date.now() + 28 * 24 * 60 * 60 * 1000).toISOString(),
  relevanceScore: 87,
  status: 'new',
};

const MOCK_JOB_MINIMAL: Job = {
  ...MOCK_JOB_FULL,
  id: 'adzuna-xyz789',
  externalId: 'xyz789',
  source: 'adzuna',
  title: 'Frontend Developer',
  company: 'Linear',
  companyWebsite: undefined,
  highlights: undefined,
  salary: undefined,
  experience: undefined,
  education: undefined,
  relevanceScore: 0,
  applyOptions: undefined,
  tags: ['React', 'TypeScript'],
  location: {
    displayName: 'Remote',
    country: 'US',
  },
  remote: true,
};

// Wrapper with open state
function PanelWrapper({ job, ...props }: { job: Job; onTailor?: (j: Job) => void }) {
  const [open, setOpen] = useState(true);
  if (!open) return (
    <div style={{ padding: 40, fontFamily: 'sans-serif' }}>
      <p style={{ color: '#666', marginBottom: 16 }}>Panel closed.</p>
      <button onClick={() => setOpen(true)}
        style={{ padding: '8px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #ccc' }}>
        Re-open panel
      </button>
    </div>
  );
  return (
    <JobDetailPanel
      job={job}
      onClose={() => setOpen(false)}
      onDismiss={j => alert(`Dismissed: ${j.company}`)}
      onSave={j => alert(`Saved: ${j.company}`)}
      onTailor={props.onTailor ?? (j => alert(`Tailor resume for: ${j.company}`))}
    />
  );
}

const meta: Meta<typeof PanelWrapper> = {
  title: 'Jobs/JobDetailPanel',
  component: PanelWrapper,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component: 'Job detail slide-over panel. Shows all available job info and contact finder.',
      },
    },
  },
};

export default meta;
type Story = StoryObj<typeof PanelWrapper>;

export const FullDetails: Story = {
  name: 'Full job details (JSearch)',
  args: { job: MOCK_JOB_FULL },
};

export const MinimalDetails: Story = {
  name: 'Minimal details (Adzuna, no salary/highlights)',
  args: { job: MOCK_JOB_MINIMAL },
};

export const RemoteJob: Story = {
  name: 'Remote job',
  args: {
    job: { ...MOCK_JOB_FULL, remote: true, location: { displayName: 'Remote — US', country: 'US' } },
  },
};

export const HighRelevance: Story = {
  name: 'High relevance score (95%)',
  args: { job: { ...MOCK_JOB_FULL, relevanceScore: 95 } },
};

export const LowRelevance: Story = {
  name: 'Low relevance score (32%)',
  args: { job: { ...MOCK_JOB_FULL, relevanceScore: 32 } },
};
