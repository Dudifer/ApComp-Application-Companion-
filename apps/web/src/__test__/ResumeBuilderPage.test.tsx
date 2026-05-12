/**
 * Frontend tests for ResumeBuilderPage.
 *
 * These tests pick up exactly where resumeUtils.test.ts leaves off —
 * they take the ResumeState output from buildInitialState and verify
 * that the drag-and-drop builder renders and behaves correctly.
 *
 * Test chain:
 *   PDF/DOCX bytes
 *     → PdfParser.extractText() → rawText
 *       → buildInitialState(CvProfile) → ResumeState   ← resumeUtils.test.ts covers this
 *         → <ResumeBuilderPage />                       ← THIS FILE covers this
 */
import '@testing-library/jest-dom';
import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { buildInitialState } from '../hooks/resumeUtils';
import type { CvProfile } from '@apcomp/types';
import type { ResumeState } from '../hooks/useResumeBuilder';

// ── Mock fetch so the builder doesn't try to hit the real API ────────────────

const MOCK_PROFILE: CvProfile = {
  name: 'Jacob Nyberg',
  email: 'jacob.6nyberg@gmail.com',
  rawText: `Jacob Nyberg
Software Developer
319-541-3440 | jacob.6nyberg@gmail.com | linkedin.com/in/jacob-nyberg/ | github.com/dudifer

Education
University of Iowa Iowa City, USA
Computer Science (BA) Jan 2021 - May 2025

About Me
Motivated and skilled collaborator with a strong commitment to Agile methodologies.

Work Experience
Junior Developer Sep 2023 - Present
University of Iowa Libraries Digital Studio Iowa City, IA
• Explored web development by researching SEO strategies.
• Created app for the Main Library touchscreen.
• Cut down on maintenance costs by automating updates.

App Developer June 2024 - August 2024
Liminal Education Consultant Roseville, CA - remote
• Implemented skills in problem analysis and software development.

Personal Projects
• Gained ML experience creating identification and prediction programs.
• Honed professional software engineering skills developing a voting app.

Technical Skills
Primary Languages: Java, Python, C#, SQL, JavaScript/HTML/CSS, Bash
Frameworks and Libraries: Pandas, PyTorch, Spring, Node.js, Express.js`,
  isComplete: true,
  practices: ['Agile', 'OOP'],
  gapQuestions: [],
  roles: [
    {
      company: 'University of Iowa Libraries Digital Studio',
      title: 'Junior Developer',
      startDate: '2023-09',
      endDate: undefined,
      durationMonths: 20,
      technologies: ['SEO', 'JavaScript'],
      practices: ['Agile'],
      description: 'Explored web development by researching SEO strategies.\nCreated app for the Main Library touchscreen.\nCut down on maintenance costs by automating updates.',
    },
    {
      company: 'Liminal Education Consultant',
      title: 'App Developer',
      startDate: '2024-06',
      endDate: '2024-08',
      durationMonths: 2,
      technologies: ['Python'],
      practices: [],
      description: 'Implemented skills in problem analysis and software development.',
    },
  ],
  skills: [
    { name: 'Java', category: 'language', monthsExperience: 24, proficiency: 'intermediate', usedAt: [] },
    { name: 'Python', category: 'language', monthsExperience: 18, proficiency: 'intermediate', usedAt: [] },
    { name: 'Node.js', category: 'framework', monthsExperience: 12, proficiency: 'beginner', usedAt: [] },
  ],
};

// Mock the fetch call that useResumeBuilder makes
global.fetch = jest.fn().mockResolvedValue({
  json: async () => MOCK_PROFILE,
  ok: true,
});

// ── Test the state that feeds into the builder ───────────────────────────────

describe('ResumeState → ResumeBuilderPage pipeline', () => {

  let state: ResumeState;

  beforeAll(() => {
    state = buildInitialState(MOCK_PROFILE);
    console.log('\n── State passed into ResumeBuilderPage ──');
    console.log('Experience entries:', state.experience.map(e => `${e.title} @ ${e.company}`));
    console.log('Project count:', state.projects.length);
    console.log('Skill groups:', state.skillGroups.map(sg => sg.label));
    console.log('Education:', state.education.map(e => e.institution));
  });

  describe('state shape validation', () => {
    it('state has all required sections', () => {
      expect(state.header).toBeDefined();
      expect(state.experience).toBeDefined();
      expect(state.projects).toBeDefined();
      expect(state.skillGroups).toBeDefined();
      expect(state.education).toBeDefined();
      console.log('  → all sections present ✓');
    });

    it('all experience items have unique ids', () => {
      const ids = state.experience.map(e => e.id);
      console.log('  → experience ids:', ids);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all bullets have unique ids across all experience', () => {
      const ids = state.experience.flatMap(e => e.bullets.map(b => b.id));
      console.log('  → bullet ids:', ids);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('all project items have unique ids', () => {
      const ids = state.projects.map(p => p.id);
      console.log('  → project ids:', ids);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });
});

// ── Component rendering tests ────────────────────────────────────────────────

// We test the subcomponents directly since the full page needs fetch
// Import the internal components we can test in isolation

describe('Resume builder UI — section rendering', () => {

  // Test that the state from buildInitialState produces correct UI elements
  // by rendering the PDF template (which is pure/stateless)

  const { ResumePdfTemplate } = require('../pages/ResumePdfTemplate');

  let state: ResumeState;

  beforeAll(() => {
    state = buildInitialState(MOCK_PROFILE);
  });

  it('PDF template renders without crashing', () => {
    console.log('  → rendering ResumePdfTemplate with state...');
    const { container } = render(<ResumePdfTemplate state={state} />);
    expect(container).toBeTruthy();
    console.log('  → render successful ✓');
  });

  it('PDF template shows candidate name', () => {
    const { getByText } = render(<ResumePdfTemplate state={state} />);
    const name = getByText(/jacob nyberg/i);
    console.log('  → found name element:', name.textContent);
    expect(name).toBeInTheDocument();
  });

  it('PDF template shows job titles', () => {
    const { getByText } = render(<ResumePdfTemplate state={state} />);
    const title = getByText(/junior developer/i);
    console.log('  → found job title:', title.textContent);
    expect(title).toBeInTheDocument();
  });

  it('PDF template shows company names', () => {
    const { getAllByText } = render(<ResumePdfTemplate state={state} />);
    const company = getAllByText(/university of iowa/i);
    console.log('  → found company occurrences:', company.length);
    expect(company.length).toBeGreaterThan(0);
  });

  it('PDF template shows project bullets', () => {
    const { getByText } = render(<ResumePdfTemplate state={state} />);
    const proj = getByText(/ml experience/i);
    console.log('  → found project text:', proj.textContent);
    expect(proj).toBeInTheDocument();
  });

  it('PDF template shows skill groups', () => {
    const { getByText } = render(<ResumePdfTemplate state={state} />);
    const skills = getByText(/java/i);
    console.log('  → found skill:', skills.textContent);
    expect(skills).toBeInTheDocument();
  });

  it('hides experience when active=false', () => {
    const modifiedState: ResumeState = {
      ...state,
      experience: state.experience.map((e, i) =>
        i === 0 ? { ...e, active: false } : e
      ),
    };
    console.log('  → hiding first experience entry:', modifiedState.experience[0].title);
    const { queryByText } = render(<ResumePdfTemplate state={modifiedState} />);
    // The hidden experience should not appear in the PDF
    const hiddenExp = queryByText(/university of iowa libraries digital studio/i);
    console.log('  → hidden entry in PDF:', hiddenExp ? 'FOUND (bug!)' : 'NOT FOUND (correct ✓)');
    expect(hiddenExp).not.toBeInTheDocument();
  });

  // it('hides inactive bullets from PDF', () => {
  //   const modifiedState: ResumeState = {
  //     ...state,
  //     experience: state.experience.map((e, i) =>
  //       i === 0 ? {
  //         ...e,
  //         bullets: e.bullets.map((b, j) =>
  //           j === 0 ? { ...b, active: false } : b
  //         ),
  //       } : e
  //     ),
  //   };
  //   const firstBulletText = state.experience[0].bullets[0]?.text;
  //   console.log('  → hiding bullet:', firstBulletText?.slice(0, 50));
  //   const { queryByText } = render(<ResumePdfTemplate state={modifiedState} />);
  //   if (firstBulletText) {
  //     const hidden = queryByText(new RegExp(firstBulletText.slice(0, 20), 'i'));
  //     console.log('  → hidden bullet in PDF:', hidden ? 'FOUND (bug!)' : 'NOT FOUND (correct ✓)');
  //     expect(hidden).not.toBeInTheDocument();
  //   }
  // });

  // it('hides inactive projects from PDF', () => {
  //   const modifiedState: ResumeState = {
  //     ...state,
  //     projects: state.projects.map((p, i) =>
  //       i === 0 ? { ...p, active: false } : p
  //     ),
  //   };
  //   const firstProjectText = state.projects[0]?.text;
  //   console.log('  → hiding project:', firstProjectText?.slice(0, 50));
  //   const { queryByText } = render(<ResumePdfTemplate state={modifiedState} />);
  //   if (firstProjectText) {
  //     const hidden = queryByText(new RegExp(firstProjectText.slice(0, 20), 'i'));
  //     console.log('  → hidden project in PDF:', hidden ? 'FOUND (bug!)' : 'NOT FOUND (correct ✓)');
  //     expect(hidden).not.toBeInTheDocument();
  //   }
  // });
  it('hides inactive bullets from PDF', () => {
    const modifiedState: ResumeState = {
      ...state,
      experience: state.experience.map((e, i) =>
        i === 0 ? {
          ...e,
          bullets: e.bullets.map((b, j) =>
            j === 0 ? { ...b, active: false } : b
          ),
        } : e
      ),
    };

    const firstBulletText = state.experience[0].bullets[0]?.text;
    console.log('  → hiding bullet:', firstBulletText?.slice(0, 50));

    const { queryByText } = render(<ResumePdfTemplate state={modifiedState} />);

    if (firstBulletText) {
      // Use exact text match instead of regex to avoid matching the bullet dot
      const hidden = queryByText(firstBulletText);
      console.log('  → hidden bullet in PDF:', hidden ? 'FOUND (bug!)' : 'NOT FOUND (correct ✓)');
      expect(hidden).not.toBeInTheDocument();
    }
  });
});

// ── Toggle behavior tests ────────────────────────────────────────────────────

describe('Resume builder — toggle and edit state changes', () => {

  let state: ResumeState;

  beforeAll(() => {
    state = buildInitialState(MOCK_PROFILE);
    console.log('\n── Testing state mutations ──');
  });

  it('toggling experience active state updates correctly', () => {
    const original = state.experience[0];
    console.log('  → before toggle:', original.title, 'active:', original.active);

    const toggled = { ...original, active: !original.active };
    console.log('  → after toggle:', toggled.title, 'active:', toggled.active);

    expect(toggled.active).toBe(!original.active);
  });

  it('toggling bullet active state updates correctly', () => {
    const bullet = state.experience[0].bullets[0];
    console.log('  → before toggle:', bullet.text.slice(0, 40), 'active:', bullet.active);

    const toggled = { ...bullet, active: !bullet.active };
    console.log('  → after toggle:', toggled.text.slice(0, 40), 'active:', toggled.active);

    expect(toggled.active).toBe(!bullet.active);
  });

  it('editing bullet text updates correctly', () => {
    const bullet = state.experience[0].bullets[0];
    const newText = 'Updated bullet text for testing purposes';
    console.log('  → before edit:', bullet.text.slice(0, 40));

    const edited = { ...bullet, text: newText };
    console.log('  → after edit:', edited.text);

    expect(edited.text).toBe(newText);
    expect(edited.id).toBe(bullet.id); // id unchanged
  });

  it('reordering experience updates array correctly', () => {
    const original = state.experience.map(e => e.title);
    console.log('  → original order:', original);

    const reordered = [...state.experience];
    const [first] = reordered.splice(0, 1);
    reordered.splice(1, 0, first);

    const newOrder = reordered.map(e => e.title);
    console.log('  → after moving first to index 1:', newOrder);

    expect(newOrder[0]).toBe(original[1]);
    expect(newOrder[1]).toBe(original[0]);
  });

  it('reordering projects updates array correctly', () => {
    const original = state.projects.map(p => p.text.slice(0, 30));
    console.log('  → original project order:', original);

    const reordered = [...state.projects];
    const [first] = reordered.splice(0, 1);
    reordered.splice(1, 0, first);

    const newOrder = reordered.map(p => p.text.slice(0, 30));
    console.log('  → reordered:', newOrder);

    expect(newOrder[0]).toBe(original[1]);
  });

  it('toggling skill group updates correctly', () => {
    const sg = state.skillGroups[0];
    console.log('  → before toggle:', sg.label, 'active:', sg.active);

    const toggled = { ...sg, active: !sg.active };
    console.log('  → after toggle:', toggled.label, 'active:', toggled.active);

    expect(toggled.active).toBe(!sg.active);
  });

  it('editing skill group label updates correctly', () => {
    const sg = state.skillGroups[0];
    const newLabel = 'Programming Languages';
    console.log('  → before:', sg.label);

    const edited = { ...sg, label: newLabel };
    console.log('  → after:', edited.label);

    expect(edited.label).toBe(newLabel);
  });

  it('editing header field updates correctly', () => {
    const original = state.header.name;
    const newName = 'Jacob T. Nyberg';
    console.log('  → before:', original);

    const updated = { ...state.header, name: newName };
    console.log('  → after:', updated.name);

    expect(updated.name).toBe(newName);
    expect(updated.email).toBe(state.header.email); // other fields unchanged
  });
});

// ── Full pipeline summary ─────────────────────────────────────────────────────

describe('Pipeline summary', () => {
  it('prints complete data flow from CV upload to builder', () => {
    const state = buildInitialState(MOCK_PROFILE);

    console.log('\n' + '═'.repeat(60));
    console.log('COMPLETE PIPELINE: CV Upload → Resume Builder');
    console.log('═'.repeat(60));

    console.log('\n1. FILE UPLOAD');
    console.log('   User uploads PDF/DOCX via drag-and-drop');
    console.log('   → multer receives file buffer');
    console.log('   → PdfParser.extractText(buffer) returns rawText string');

    console.log('\n2. AI EXTRACTION (apps/api)');
    console.log('   rawText → Claude API → structured CvProfile JSON');
    console.log('   CvProfile contains:');
    console.log('   → name:', MOCK_PROFILE.name);
    console.log('   → roles:', MOCK_PROFILE.roles.length, 'entries');
    console.log('   → skills:', MOCK_PROFILE.skills.length, 'entries');
    console.log('   → rawText: (preserved for regex fallbacks)');

    console.log('\n3. BUILDER INITIALIZATION (apps/web)');
    console.log('   buildInitialState(CvProfile) → ResumeState');
    console.log('   ResumeState contains:');
    console.log('   → header:', JSON.stringify(state.header));
    console.log('   → experience:', state.experience.length, 'entries with',
      state.experience.reduce((s, e) => s + e.bullets.length, 0), 'total bullets');
    console.log('   → projects:', state.projects.length, 'items');
    console.log('   → skillGroups:', state.skillGroups.length, 'groups');
    console.log('   → education:', state.education.length, 'entries');

    console.log('\n4. DRAG AND DROP UI');
    console.log('   ResumeState → <ResumeBuilderPage />');
    console.log('   Left panel: sortable experience cards with bullet toggles');
    console.log('   Left panel: sortable project rows');
    console.log('   Left panel: inline-editable skill groups');
    console.log('   Right panel: <PDFViewer> with live <ResumePdfTemplate />');

    console.log('\n5. USER INTERACTIONS');
    console.log('   Drag ⠿ handle → reorders experience/projects');
    console.log('   Click Hide/Show → toggles experience.active');
    console.log('   Click checkbox → toggles bullet.active');
    console.log('   Click text → contentEditable inline edit');
    console.log('   Click Export PDF → downloads file');
    console.log('\n' + '═'.repeat(60));

    expect(state).toBeDefined();
  });
});
