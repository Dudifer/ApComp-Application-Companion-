import { useState, useRef, useCallback } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ResumePdfTemplate } from './ResumePdfTemplate';
import type { ResumeState, ResumeExperience, ResumeProject, EditableBullet } from '../hooks/useResumeBuilder';

// ── Hardcoded demo data ───────────────────────────────────────────────────────

const DEMO_STATE: ResumeState = {
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
    id: 'edu-0',
    active: true,
    institution: 'University of Iowa',
    location: 'Iowa City, USA',
    degree: 'Computer Science (BA)',
    dates: 'Jan 2021 - May 2025',
  }],
  experience: [
    {
      id: 'exp-0',
      active: true,
      company: 'University of Iowa Libraries Digital Studio',
      title: 'Junior Developer',
      startDate: '2023-09',
      endDate: undefined,
      bullets: [
        { id: 'b-0-0', active: true, text: 'Explored web development by researching, implementing, and measuring the effects of SEO strategies to improve accessibility and visibility.' },
        { id: 'b-0-1', active: true, text: 'Created app for the Main Library touchscreen to serve as a tool for visitors and advertise the Studio.' },
        { id: 'b-0-2', active: true, text: 'Cut down on maintenance costs by automating updates for Omeka websites distributed across multiple remote servers.' },
      ],
    },
    {
      id: 'exp-1',
      active: true,
      company: 'Liminal Education Consultant',
      title: 'App Developer',
      startDate: '2024-06',
      endDate: '2024-08',
      bullets: [
        { id: 'b-1-0', active: true, text: 'Implemented skills in problem analysis, software design and development building an application used by the business to measure individual and group performance.' },
      ],
    },
    {
      id: 'exp-2',
      active: true,
      company: 'University of Iowa Computational Epidemiology Research Group',
      title: 'Research Assistant/Ambassador',
      startDate: '2023-06',
      endDate: '2023-08',
      bullets: [
        { id: 'b-2-0', active: true, text: 'Displayed communication and leadership skills as Ambassador for incoming undergrad research assistants.' },
        { id: 'b-2-1', active: true, text: 'Strengthened familiarities with Agile, OOP and statistical analysis developing a program that simulates the spread of airborne diseases.' },
      ],
    },
  ],
  projects: [
    { id: 'proj-0', active: true, text: 'Gained ML experience creating identification and series-based prediction programs.' },
    { id: 'proj-1', active: true, text: 'Honed professional software engineering skills developing a voting app facilitating remote voting.' },
  ],
  skillGroups: [
    { id: 'sg-0', active: true, label: 'Primary Languages', skills: 'Java, Python, C#, SQL, JavaScript/HTML/CSS, Bash' },
    { id: 'sg-1', active: true, label: 'Frameworks and Libraries', skills: 'Pandas, PyTorch, Spring, Node.js, Express.js, JUnit, Jest' },
  ],
};

// ── Sortable experience card ──────────────────────────────────────────────────

function SortableExpCard({
  exp, onToggle, onToggleBullet, onEditBullet,
}: {
  exp: ResumeExperience;
  onToggle: () => void;
  onToggleBullet: (id: string) => void;
  onEditBullet: (id: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exp.id });

  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform), transition,
      opacity: isDragging ? 0.4 : exp.active ? 1 : 0.5,
      background: exp.active ? 'white' : '#f7f6f4',
      border: `1px solid ${exp.active ? 'var(--border)' : 'var(--surface-3)'}`,
      borderRadius: 10, marginBottom: 8, overflow: 'hidden',
      boxShadow: isDragging ? '0 8px 24px rgba(0,0,0,0.15)' : 'none',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: exp.active ? 'var(--surface-2)' : 'var(--surface-3)',
      }}>
        <span {...attributes} {...listeners} style={{
          cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 16,
          userSelect: 'none', padding: '0 2px',
          title: 'Drag to reorder',
        }}>⠿</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)' }}>
            {exp.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{exp.company}</div>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', fontSize: 11 }}>
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onToggle} style={{
          background: 'none', padding: '2px 8px', borderRadius: 6,
          border: `1px solid ${exp.active ? 'var(--border)' : 'var(--accent)'}`,
          color: exp.active ? 'var(--ink-tertiary)' : 'var(--accent)',
          cursor: 'pointer', fontSize: 11, fontFamily: 'var(--font-body)',
        }}>
          {exp.active ? 'Hide' : 'Show'}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '10px 14px 12px' }}>
          {exp.bullets.map(b => (
            <BulletRow key={b.id} bullet={b}
              onToggle={() => onToggleBullet(b.id)}
              onEdit={text => onEditBullet(b.id, text)} />
          ))}
        </div>
      )}
    </div>
  );
}

function BulletRow({ bullet, onToggle, onEdit }: {
  bullet: EditableBullet;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 6, opacity: bullet.active ? 1 : 0.35 }}>
      <button onClick={onToggle} style={{
        marginTop: 3, flexShrink: 0, width: 14, height: 14, borderRadius: 3,
        border: `1.5px solid ${bullet.active ? 'var(--accent)' : 'var(--surface-3)'}`,
        background: bullet.active ? 'var(--accent)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {bullet.active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onBlur={() => { if (ref.current) onEdit(ref.current.innerText.trim()); }}
        style={{
          flex: 1, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5,
          outline: 'none', borderBottom: '1px solid transparent', padding: '1px 2px',
          borderRadius: 3,
        }}
        onFocus={e => { (e.target as HTMLElement).style.borderBottomColor = 'var(--accent)'; }}
        onBlurCapture={e => { (e.target as HTMLElement).style.borderBottomColor = 'transparent'; }}>
        {bullet.text}
      </div>
    </div>
  );
}

function SortableProjectRow({ project, onToggle, onEdit }: {
  project: ResumeProject;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <div ref={setNodeRef} style={{
      transform: CSS.Transform.toString(transform), transition,
      opacity: isDragging ? 0.4 : project.active ? 1 : 0.35,
      display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6,
    }}>
      <span {...attributes} {...listeners}
        style={{ cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 14, marginTop: 2, userSelect: 'none' }}>
        ⠿
      </span>
      <button onClick={onToggle} style={{
        marginTop: 3, flexShrink: 0, width: 14, height: 14, borderRadius: 3,
        border: `1.5px solid ${project.active ? 'var(--accent)' : 'var(--surface-3)'}`,
        background: project.active ? 'var(--accent)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {project.active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onBlur={() => { if (ref.current) onEdit(ref.current.innerText.trim()); }}
        style={{
          flex: 1, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5,
          outline: 'none', borderBottom: '1px solid transparent', padding: '1px 2px',
        }}>
        {project.text}
      </div>
    </div>
  );
}

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', padding: '8px 0', background: 'none', border: 'none',
        borderBottom: '1.5px solid var(--ink)', cursor: 'pointer', marginBottom: open ? 12 : 0,
      }}>
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink)',
        }}>{title}</span>
        <span style={{ color: 'var(--ink-tertiary)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  );
}

// ── Main demo page ────────────────────────────────────────────────────────────

export default function ResumeDemoPage() {
  const [state, setState] = useState<ResumeState>(DEMO_STATE);
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Experience handlers
  const toggleExp = (id: string) => setState(s => ({
    ...s, experience: s.experience.map(e => e.id === id ? { ...e, active: !e.active } : e),
  }));

  const toggleBullet = (expId: string, bId: string) => setState(s => ({
    ...s, experience: s.experience.map(e => e.id === expId ? {
      ...e, bullets: e.bullets.map(b => b.id === bId ? { ...b, active: !b.active } : b),
    } : e),
  }));

  const editBullet = (expId: string, bId: string, text: string) => setState(s => ({
    ...s, experience: s.experience.map(e => e.id === expId ? {
      ...e, bullets: e.bullets.map(b => b.id === bId ? { ...b, text } : b),
    } : e),
  }));

  const handleExpDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setState(s => {
      const oldIdx = s.experience.findIndex(e => e.id === active.id);
      const newIdx = s.experience.findIndex(e => e.id === over.id);
      return { ...s, experience: arrayMove(s.experience, oldIdx, newIdx) };
    });
  }, []);

  // Project handlers
  const toggleProject = (id: string) => setState(s => ({
    ...s, projects: s.projects.map(p => p.id === id ? { ...p, active: !p.active } : p),
  }));

  const editProject = (id: string, text: string) => setState(s => ({
    ...s, projects: s.projects.map(p => p.id === id ? { ...p, text } : p),
  }));

  const handleProjDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setState(s => {
      const oldIdx = s.projects.findIndex(p => p.id === active.id);
      const newIdx = s.projects.findIndex(p => p.id === over.id);
      return { ...s, projects: arrayMove(s.projects, oldIdx, newIdx) };
    });
  }, []);

  // Skill handlers
  const toggleSkillGroup = (id: string) => setState(s => ({
    ...s, skillGroups: s.skillGroups.map(sg => sg.id === id ? { ...sg, active: !sg.active } : sg),
  }));

  const editSkillGroup = (id: string, field: 'label' | 'skills', value: string) => setState(s => ({
    ...s, skillGroups: s.skillGroups.map(sg => sg.id === id ? { ...sg, [field]: value } : sg),
  }));

  const handleDownload = useCallback(async () => {
    const blob = await pdf(<ResumePdfTemplate state={state} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Jacob_Nyberg_Resume.pdf';
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  const handleReset = () => setState(DEMO_STATE);

  return (
    <>
      <style>{`
        .demo-wrap { display: flex; height: calc(100vh - 61px); overflow: hidden; }
        .demo-left { width: 42%; min-width: 320px; overflow-y: auto; padding: 24px 20px; border-right: 1px solid var(--border); background: var(--surface); }
        .demo-right { flex: 1; display: flex; flex-direction: column; background: #e8e5df; }
        .demo-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: var(--surface-2); border-bottom: 1px solid var(--border); gap: 8px; }
        .demo-title { font-family: var(--font-display); font-size: 16px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 2px; }
        .demo-sub { font-size: 11px; color: var(--ink-tertiary); margin-bottom: 20px; }
        .demo-badge { font-size: 10px; padding: 2px 8px; background: var(--accent-light); color: var(--accent); border-radius: 99px; border: 1px solid var(--accent); font-family: var(--font-body); font-weight: 500; }
        .export-btn { padding: 7px 16px; background: var(--ink); color: white; border: none; border-radius: 7px; font-family: var(--font-body); font-size: 12px; font-weight: 500; cursor: pointer; }
        .export-btn:hover { opacity: 0.8; }
        .reset-btn { padding: 7px 12px; background: none; color: var(--ink-secondary); border: 1px solid var(--border); border-radius: 7px; font-family: var(--font-body); font-size: 12px; cursor: pointer; }
        .pdf-wrap { flex: 1; overflow: hidden; }
        .drag-hint { font-size: 10px; color: var(--ink-tertiary); text-align: center; padding: 6px 0 12px; }
      `}</style>

      <div className="demo-wrap">
        {/* Left panel */}
        <div className="demo-left">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
            <div className="demo-title">Resume Builder</div>
            <span className="demo-badge">Demo</span>
          </div>
          <div className="demo-sub">Drag ⠿ to reorder · checkboxes to hide · click text to edit</div>

          <SectionPanel title="Work Experience">
            <div className="drag-hint">⠿ Drag cards to reorder jobs</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExpDragEnd}>
              <SortableContext items={state.experience.map(e => e.id)} strategy={verticalListSortingStrategy}>
                {state.experience.map(exp => (
                  <SortableExpCard
                    key={exp.id}
                    exp={exp}
                    onToggle={() => toggleExp(exp.id)}
                    onToggleBullet={bId => toggleBullet(exp.id, bId)}
                    onEditBullet={(bId, text) => editBullet(exp.id, bId, text)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </SectionPanel>

          <SectionPanel title="Personal Projects">
            <div className="drag-hint">⠿ Drag to reorder · checkboxes to hide</div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjDragEnd}>
              <SortableContext items={state.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {state.projects.map(proj => (
                  <SortableProjectRow
                    key={proj.id}
                    project={proj}
                    onToggle={() => toggleProject(proj.id)}
                    onEdit={text => editProject(proj.id, text)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </SectionPanel>

          <SectionPanel title="Technical Skills">
            {state.skillGroups.map(sg => (
              <div key={sg.id} style={{
                background: 'white', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 12px', marginBottom: 8,
                opacity: sg.active ? 1 : 0.5,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <input value={sg.label} onChange={e => editSkillGroup(sg.id, 'label', e.target.value)}
                    style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)' }} />
                  <button onClick={() => toggleSkillGroup(sg.id)} style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 6, cursor: 'pointer',
                    border: `1px solid ${sg.active ? 'var(--border)' : 'var(--accent)'}`,
                    color: sg.active ? 'var(--ink-tertiary)' : 'var(--accent)',
                    background: 'none', fontFamily: 'var(--font-body)',
                  }}>
                    {sg.active ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input value={sg.skills} onChange={e => editSkillGroup(sg.id, 'skills', e.target.value)}
                  style={{ width: '100%', fontSize: 12, color: 'var(--ink-secondary)', border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)' }} />
              </div>
            ))}
          </SectionPanel>
        </div>

        {/* Right panel — live PDF preview */}
        <div className="demo-right">
          <div className="demo-toolbar">
            <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-tertiary)', fontFamily: 'var(--font-body)' }}>
              Live Preview
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="reset-btn" onClick={handleReset}>Reset</button>
              <button className="export-btn" onClick={handleDownload}>↓ Export PDF</button>
            </div>
          </div>
          <div className="pdf-wrap">
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              <ResumePdfTemplate state={state} />
            </PDFViewer>
          </div>
        </div>
      </div>
    </>
  );
}
