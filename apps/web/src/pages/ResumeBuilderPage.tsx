import { useState, useRef, useCallback } from 'react';
import { PDFViewer, pdf } from '@react-pdf/renderer';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useResumeBuilder } from './useResumeBuilder';
import { ResumePdfTemplate } from './ResumePdfTemplate';
import type { ResumeExperience, ResumeProject, EditableBullet } from './useResumeBuilder';

// ── Sortable Experience Card ────────────────────────────────────────────────

function SortableExpCard({
  exp,
  onToggle,
  onToggleBullet,
  onEditBullet,
}: {
  exp: ResumeExperience;
  onToggle: () => void;
  onToggleBullet: (bulletId: string) => void;
  onEditBullet: (bulletId: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exp.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        background: exp.active ? 'white' : '#f7f6f4',
        border: `1px solid ${exp.active ? 'var(--border)' : 'var(--surface-3)'}`,
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
        opacity: exp.active ? 1 : 0.55,
      }}
    >
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px', background: exp.active ? 'var(--surface-2)' : 'var(--surface-3)',
      }}>
        {/* Drag handle */}
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 14, lineHeight: 1 }}
        >
          ⠿
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
            {exp.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{exp.company}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', fontSize: 11 }}
          >
            {expanded ? '▲' : '▼'}
          </button>
          <button
            onClick={onToggle}
            title={exp.active ? 'Archive this job' : 'Restore this job'}
            style={{
              background: 'none', border: `1px solid ${exp.active ? 'var(--border)' : 'var(--accent)'}`,
              borderRadius: 6, cursor: 'pointer', padding: '2px 8px',
              fontSize: 11, color: exp.active ? 'var(--ink-tertiary)' : 'var(--accent)',
              fontFamily: 'var(--font-body)',
            }}
          >
            {exp.active ? 'Hide' : 'Show'}
          </button>
        </div>
      </div>

      {/* Bullets */}
      {expanded && (
        <div style={{ padding: '10px 14px 12px' }}>
          {exp.bullets.map(bullet => (
            <BulletRow
              key={bullet.id}
              bullet={bullet}
              onToggle={() => onToggleBullet(bullet.id)}
              onEdit={text => onEditBullet(bullet.id, text)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Bullet Row ───────────────────────────────────────────────────────────────

function BulletRow({
  bullet,
  onToggle,
  onEdit,
}: {
  bullet: EditableBullet;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 8,
      marginBottom: 6, opacity: bullet.active ? 1 : 0.4,
    }}>
      <button
        onClick={onToggle}
        style={{
          marginTop: 2, flexShrink: 0, width: 14, height: 14,
          borderRadius: 3, border: `1.5px solid ${bullet.active ? 'var(--accent)' : 'var(--surface-3)'}`,
          background: bullet.active ? 'var(--accent)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {bullet.active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={() => { if (ref.current) onEdit(ref.current.innerText.trim()); }}
        style={{
          flex: 1, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5,
          outline: 'none', borderBottom: '1px solid transparent',
          padding: '1px 2px', borderRadius: 3,
        }}
        onFocus={e => {
          (e.target as HTMLElement).style.borderBottomColor = 'var(--accent)';
        }}
        onBlurCapture={e => {
          (e.target as HTMLElement).style.borderBottomColor = 'transparent';
        }}
      >
        {bullet.text}
      </div>
    </div>
  );
}

// ── Sortable Project Row ─────────────────────────────────────────────────────

function SortableProjectRow({
  project,
  onToggle,
  onEdit,
}: {
  project: ResumeProject;
  onToggle: () => void;
  onEdit: (text: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : project.active ? 1 : 0.4,
  };

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6 }}
    >
      <span
        {...attributes}
        {...listeners}
        style={{ cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 13, marginTop: 2 }}
      >
        ⠿
      </span>
      <button
        onClick={onToggle}
        style={{
          marginTop: 3, flexShrink: 0, width: 14, height: 14,
          borderRadius: 3, border: `1.5px solid ${project.active ? 'var(--accent)' : 'var(--surface-3)'}`,
          background: project.active ? 'var(--accent)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {project.active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onBlur={() => { if (ref.current) onEdit(ref.current.innerText.trim()); }}
        style={{
          flex: 1, fontSize: 12, color: 'var(--ink)', lineHeight: 1.5,
          outline: 'none', borderBottom: '1px solid transparent', padding: '1px 2px',
        }}
      >
        {project.text}
      </div>
    </div>
  );
}

// ── Section Panel ─────────────────────────────────────────────────────────────

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '8px 0', background: 'none', border: 'none', borderBottom: '1.5px solid var(--ink)',
          cursor: 'pointer', marginBottom: open ? 12 : 0,
        }}
      >
        <span style={{
          fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700,
          letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink)',
        }}>
          {title}
        </span>
        <span style={{ color: 'var(--ink-tertiary)', fontSize: 10 }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && children}
    </div>
  );
}

// ── Inline Edit Field ─────────────────────────────────────────────────────────

function InlineField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginBottom: 2, letterSpacing: '0.04em' }}>
        {label}
      </div>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: '100%', padding: '5px 8px', borderRadius: 6,
          border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
          fontSize: 12, color: 'var(--ink)', background: 'white', outline: 'none',
        }}
      />
    </div>
  );
}

// ── Main Builder Page ─────────────────────────────────────────────────────────

export default function ResumeBuilderPage() {
  const builder = useResumeBuilder();
  const { state, loading, error } = builder;
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleExpDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !state) return;
    const oldIdx = state.experience.findIndex(e => e.id === active.id);
    const newIdx = state.experience.findIndex(e => e.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) builder.reorderExperience(oldIdx, newIdx);
  }, [state, builder]);

  const handleProjDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !state) return;
    const oldIdx = state.projects.findIndex(p => p.id === active.id);
    const newIdx = state.projects.findIndex(p => p.id === over.id);
    if (oldIdx !== -1 && newIdx !== -1) builder.reorderProjects(oldIdx, newIdx);
  }, [state, builder]);

  const handleDownload = useCallback(async () => {
    if (!state) return;
    const blob = await pdf(<ResumePdfTemplate state={state} />).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.header.name.replace(/\s+/g, '_')}_Resume.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 400 }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{
          width: 36, height: 36, borderRadius: '50%',
          border: '3px solid var(--surface-3)', borderTopColor: 'var(--accent)',
          animation: 'spin 0.8s linear infinite', margin: '0 auto 12px',
        }} />
        <div style={{ fontSize: 13, color: 'var(--ink-secondary)' }}>Loading resume data...</div>
      </div>
    </div>
  );

  if (error || !state) return (
    <div style={{ padding: 48, textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: 'var(--ink-secondary)', marginBottom: 12 }}>
        {error ?? 'No resume data found.'}
      </div>
      <div style={{ fontSize: 13, color: 'var(--ink-tertiary)' }}>
        Please upload your CV first using the CV Upload section.
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        .builder-wrap {
          display: flex;
          height: calc(100vh - 61px);
          overflow: hidden;
        }
        .builder-left {
          width: 42%;
          min-width: 320px;
          overflow-y: auto;
          padding: 28px 24px;
          border-right: 1px solid var(--border);
          background: var(--surface);
        }
        .builder-right {
          flex: 1;
          display: flex;
          flex-direction: column;
          background: #e8e5df;
        }
        .preview-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 20px;
          background: var(--surface-2);
          border-bottom: 1px solid var(--border);
        }
        .preview-label {
          font-size: 11px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--ink-tertiary);
          font-family: var(--font-body);
        }
        .download-btn {
          padding: 7px 18px;
          background: var(--ink);
          color: white;
          border: none;
          border-radius: 7px;
          font-family: var(--font-body);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .download-btn:hover { opacity: 0.8; }
        .pdf-viewer-wrap {
          flex: 1;
          overflow: hidden;
        }
        .builder-title {
          font-family: var(--font-display);
          font-size: 18px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--ink);
          margin-bottom: 4px;
        }
        .builder-sub {
          font-size: 12px;
          color: var(--ink-tertiary);
          margin-bottom: 24px;
        }
        .skill-group-row {
          background: white;
          border: 1px solid var(--border);
          border-radius: 8px;
          padding: 10px 12px;
          margin-bottom: 8px;
        }
      `}</style>

      <div className="builder-wrap">
        {/* ── Left Panel ── */}
        <div className="builder-left">
          <div className="builder-title">Resume Builder</div>
          <div className="builder-sub">Drag to reorder · click bullets to toggle · click text to edit</div>

          {/* Header */}
          <SectionPanel title="Header">
            <InlineField label="Full Name" value={state.header.name} onChange={v => builder.updateHeader('name', v)} />
            <InlineField label="Title" value={state.header.title} onChange={v => builder.updateHeader('title', v)} />
            <InlineField label="Phone" value={state.header.phone} onChange={v => builder.updateHeader('phone', v)} />
            <InlineField label="Email" value={state.header.email} onChange={v => builder.updateHeader('email', v)} />
            <InlineField label="LinkedIn" value={state.header.linkedin} onChange={v => builder.updateHeader('linkedin', v)} />
            <InlineField label="GitHub" value={state.header.github} onChange={v => builder.updateHeader('github', v)} />
          </SectionPanel>

          {/* About Me */}
          {state.aboutMe && (
            <SectionPanel title="About Me">
              <textarea
                value={state.aboutMe}
                onChange={e => builder.updateAboutMe(e.target.value)}
                rows={4}
                style={{
                  width: '100%', padding: '8px 10px', borderRadius: 8,
                  border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
                  fontSize: 12, color: 'var(--ink)', resize: 'vertical', outline: 'none',
                }}
              />
            </SectionPanel>
          )}

          {/* Work Experience */}
          <SectionPanel title="Work Experience">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleExpDragEnd}>
              <SortableContext items={state.experience.map(e => e.id)} strategy={verticalListSortingStrategy}>
                {state.experience.map(exp => (
                  <SortableExpCard
                    key={exp.id}
                    exp={exp}
                    onToggle={() => builder.toggleExperience(exp.id)}
                    onToggleBullet={bId => builder.toggleBullet(exp.id, bId)}
                    onEditBullet={(bId, text) => builder.updateBullet(exp.id, bId, text)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </SectionPanel>

          {/* Personal Projects */}
          {state.projects.length > 0 && (
            <SectionPanel title="Personal Projects">
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjDragEnd}>
                <SortableContext items={state.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                  {state.projects.map(proj => (
                    <SortableProjectRow
                      key={proj.id}
                      project={proj}
                      onToggle={() => builder.toggleProject(proj.id)}
                      onEdit={text => builder.updateProject(proj.id, text)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </SectionPanel>
          )}

          {/* Technical Skills */}
          {state.skillGroups.length > 0 && (
            <SectionPanel title="Technical Skills">
              {state.skillGroups.map(sg => (
                <div key={sg.id} className="skill-group-row" style={{ opacity: sg.active ? 1 : 0.5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <input
                      value={sg.label}
                      onChange={e => builder.updateSkillGroup(sg.id, 'label', e.target.value)}
                      style={{
                        fontSize: 11, fontWeight: 600, color: 'var(--ink)', border: 'none',
                        outline: 'none', background: 'transparent', fontFamily: 'var(--font-body)',
                        letterSpacing: '0.02em',
                      }}
                    />
                    <button
                      onClick={() => builder.toggleSkillGroup(sg.id)}
                      style={{
                        fontSize: 11, padding: '2px 8px', borderRadius: 6,
                        border: `1px solid ${sg.active ? 'var(--border)' : 'var(--accent)'}`,
                        color: sg.active ? 'var(--ink-tertiary)' : 'var(--accent)',
                        background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}
                    >
                      {sg.active ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <input
                    value={sg.skills}
                    onChange={e => builder.updateSkillGroup(sg.id, 'skills', e.target.value)}
                    style={{
                      width: '100%', fontSize: 12, color: 'var(--ink-secondary)',
                      border: 'none', outline: 'none', background: 'transparent',
                      fontFamily: 'var(--font-body)',
                    }}
                  />
                </div>
              ))}
            </SectionPanel>
          )}
        </div>

        {/* ── Right Panel: Live PDF Preview ── */}
        <div className="builder-right">
          <div className="preview-toolbar">
            <span className="preview-label">Live Preview</span>
            <button className="download-btn" onClick={handleDownload}>
              ↓ Export PDF
            </button>
          </div>
          <div className="pdf-viewer-wrap">
            <PDFViewer width="100%" height="100%" showToolbar={false}>
              <ResumePdfTemplate state={state} />
            </PDFViewer>
          </div>
        </div>
      </div>
    </>
  );
}
