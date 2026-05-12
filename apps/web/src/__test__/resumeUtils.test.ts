/**
 * Tests for resume CV parsing and itemization.
 * Verifies that buildInitialState correctly separates sections
 * without relying on any AI calls.
 */

import { buildInitialState } from '../hooks/resumeUtils';
import type { CvProfile } from '@apcomp/types';

const SAMPLE_RAW_TEXT = `Jacob Nyberg
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
Frameworks and Libraries: Pandas, PyTorch, Spring, Node.js, Express.js`;

const SAMPLE_PROFILE: CvProfile = {
  name: 'Jacob Nyberg',
  email: 'jacob.6nyberg@gmail.com',
  rawText: SAMPLE_RAW_TEXT,
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
    { name: 'Agile', category: 'methodology', monthsExperience: 20, proficiency: 'intermediate', usedAt: [] },
  ],
};

describe('buildInitialState — resume itemization', () => {

  let result: ReturnType<typeof buildInitialState>;

  beforeAll(() => {
    console.log('\n' + '═'.repeat(60));
    console.log('INPUT: CvProfile');
    console.log('═'.repeat(60));
    console.log('Name:', SAMPLE_PROFILE.name);
    console.log('Email:', SAMPLE_PROFILE.email);
    console.log('Roles:', SAMPLE_PROFILE.roles.map(r => `${r.title} @ ${r.company}`));
    console.log('Skills:', SAMPLE_PROFILE.skills.map(s => s.name));
    console.log('Raw text length:', SAMPLE_PROFILE.rawText?.length, 'chars');

    result = buildInitialState(SAMPLE_PROFILE);

    console.log('\n' + '═'.repeat(60));
    console.log('OUTPUT: ResumeState');
    console.log('═'.repeat(60));

    console.log('\n── Header ──');
    console.log(JSON.stringify(result.header, null, 2));

    console.log('\n── About Me ──');
    console.log(result.aboutMe || '(empty)');

    console.log('\n── Education ──');
    result.education.forEach(e => {
      console.log(`  [${e.id}] ${e.institution} — ${e.degree} (${e.dates})`);
    });

    console.log('\n── Experience ──', `(${result.experience.length} entries)`);
    result.experience.forEach(exp => {
      console.log(`  [${exp.id}] ${exp.title} @ ${exp.company} (active: ${exp.active})`);
      exp.bullets.forEach(b => {
        console.log(`    ${b.active ? '✓' : '✗'} [${b.id}] "${b.text}"`);
      });
    });

    console.log('\n── Projects ──', `(${result.projects.length} entries)`);
    result.projects.forEach(p => {
      console.log(`  [${p.id}] (active: ${p.active}) "${p.text}"`);
    });

    console.log('\n── Skill Groups ──', `(${result.skillGroups.length} groups)`);
    result.skillGroups.forEach(sg => {
      console.log(`  [${sg.id}] ${sg.label}: ${sg.skills}`);
    });

    console.log('\n' + '═'.repeat(60) + '\n');
  });

  describe('header', () => {
    it('extracts name correctly', () => {
      console.log('  → header.name:', result.header.name);
      expect(result.header.name).toBe('Jacob Nyberg');
    });

    it('extracts email correctly', () => {
      console.log('  → header.email:', result.header.email);
      expect(result.header.email).toBe('jacob.6nyberg@gmail.com');
    });

    it('extracts phone correctly', () => {
      console.log('  → header.phone:', result.header.phone);
      expect(result.header.phone).toBe('319-541-3440');
    });

    it('extracts linkedin correctly', () => {
      console.log('  → header.linkedin:', result.header.linkedin);
      expect(result.header.linkedin).toContain('linkedin.com/in/');
    });

    it('extracts github correctly', () => {
      console.log('  → header.github:', result.header.github);
      expect(result.header.github).toContain('github.com/');
    });
  });

  describe('experience', () => {
    it('creates one entry per role', () => {
      console.log('  → experience count:', result.experience.length, '(expected 2)');
      expect(result.experience).toHaveLength(2);
    });

    it('sets all experience entries active by default', () => {
      result.experience.forEach(exp => {
        console.log(`  → ${exp.title} active:`, exp.active);
        expect(exp.active).toBe(true);
      });
    });

    it('preserves company names', () => {
      const companies = result.experience.map(e => e.company);
      console.log('  → companies:', companies);
      expect(companies).toContain('University of Iowa Libraries Digital Studio');
      expect(companies).toContain('Liminal Education Consultant');
    });

    it('preserves job titles', () => {
      const titles = result.experience.map(e => e.title);
      console.log('  → titles:', titles);
      expect(titles).toContain('Junior Developer');
      expect(titles).toContain('App Developer');
    });

    it('splits description into bullets', () => {
      const uiLibs = result.experience.find(
        e => e.company === 'University of Iowa Libraries Digital Studio'
      );
      console.log('  → bullet count for UI Libraries:', uiLibs?.bullets.length);
      expect(uiLibs).toBeDefined();
      expect(uiLibs!.bullets.length).toBeGreaterThan(1);
    });

    it('sets all bullets active by default', () => {
      result.experience.forEach(exp => {
        exp.bullets.forEach(b => {
          console.log(`  → bullet "${b.text.slice(0, 40)}..." active:`, b.active);
          expect(b.active).toBe(true);
        });
      });
    });

    it('does NOT put project bullets into experience', () => {
      result.experience.forEach(exp => {
        exp.bullets.forEach(b => {
          const text = b.text.toLowerCase();
          console.log(`  → checking exp bullet for project bleed: "${b.text.slice(0, 50)}"`);
          expect(text).not.toContain('ml experience');
          expect(text).not.toContain('voting app');
        });
      });
    });
  });

  describe('projects', () => {
    it('extracts projects from Personal Projects section', () => {
      console.log('  → project count:', result.projects.length);
      expect(result.projects.length).toBeGreaterThan(0);
    });

    it('sets all projects active by default', () => {
      result.projects.forEach(p => {
        console.log(`  → project "${p.text.slice(0, 40)}..." active:`, p.active);
        expect(p.active).toBe(true);
      });
    });

    it('contains ML project', () => {
      const texts = result.projects.map(p => p.text.toLowerCase());
      console.log('  → project texts:', texts);
      expect(texts.some(t => t.includes('ml') || t.includes('identification'))).toBe(true);
    });

    it('contains voting app project', () => {
      const texts = result.projects.map(p => p.text.toLowerCase());
      console.log('  → checking for voting app in:', texts);
      expect(texts.some(t => t.includes('voting'))).toBe(true);
    });

    it('does NOT contain work experience entries as projects', () => {
      result.projects.forEach(p => {
        console.log(`  → checking project for exp bleed: "${p.text.slice(0, 50)}"`);
        expect(p.text).not.toContain('University of Iowa Libraries');
        expect(p.text).not.toContain('Liminal Education');
        expect(p.text).not.toContain('SEO strategies');
      });
    });
  });

  describe('skills', () => {
    it('extracts skill groups', () => {
      console.log('  → skill group count:', result.skillGroups.length);
      expect(result.skillGroups.length).toBeGreaterThan(0);
    });

    it('sets all skill groups active by default', () => {
      result.skillGroups.forEach(sg => {
        console.log(`  → skill group "${sg.label}" active:`, sg.active);
        expect(sg.active).toBe(true);
      });
    });

    it('contains primary languages group', () => {
      const labels = result.skillGroups.map(sg => sg.label.toLowerCase());
      console.log('  → skill group labels:', labels);
      expect(labels.some(l => l.includes('language'))).toBe(true);
    });

    it('primary languages includes Java and Python', () => {
      const langGroup = result.skillGroups.find(sg =>
        sg.label.toLowerCase().includes('language')
      );
      console.log('  → language group skills:', langGroup?.skills);
      expect(langGroup).toBeDefined();
      expect(langGroup!.skills).toContain('Java');
      expect(langGroup!.skills).toContain('Python');
    });
  });

  describe('education', () => {
    it('extracts education entry', () => {
      console.log('  → education count:', result.education.length);
      expect(result.education.length).toBeGreaterThan(0);
    });

    it('extracts institution name', () => {
      console.log('  → institution:', result.education[0]?.institution);
      expect(result.education[0].institution).toContain('University of Iowa');
    });

    it('sets education active by default', () => {
      result.education.forEach(e => {
        console.log(`  → education "${e.institution}" active:`, e.active);
        expect(e.active).toBe(true);
      });
    });
  });

  describe('aboutMe', () => {
    it('extracts about me text', () => {
      console.log('  → aboutMe:', result.aboutMe.slice(0, 80) + '...');
      expect(result.aboutMe.length).toBeGreaterThan(10);
    });

    it('does not bleed into other sections', () => {
      console.log('  → checking aboutMe for section bleed:', result.aboutMe.slice(0, 80));
      expect(result.aboutMe).not.toContain('Work Experience');
      expect(result.aboutMe).not.toContain('Technical Skills');
    });
  });

  describe('section isolation', () => {
    it('experience and projects have no overlapping text', () => {
      const expTexts = result.experience
        .flatMap(e => e.bullets.map(b => b.text.toLowerCase()));
      const projTexts = result.projects.map(p => p.text.toLowerCase());

      console.log('  → exp bullet texts:', expTexts);
      console.log('  → project texts:', projTexts);

      expTexts.forEach(expText => {
        projTexts.forEach(projText => {
          expect(expText).not.toBe(projText);
        });
      });
    });

    it('all items have unique ids', () => {
      const ids = [
        ...result.experience.map(e => e.id),
        ...result.projects.map(p => p.id),
        ...result.skillGroups.map(sg => sg.id),
        ...result.education.map(e => e.id),
      ];
      console.log('  → all ids:', ids);
      const unique = new Set(ids);
      expect(unique.size).toBe(ids.length);
    });
  });
});
