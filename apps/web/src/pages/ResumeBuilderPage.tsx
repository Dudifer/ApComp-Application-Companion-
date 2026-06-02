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
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useResumeBuilder } from '../hooks/useResumeBuilder';
import { ResumePdfTemplate } from './ResumePdfTemplate';
import type { ResumeExperience, ResumeProject, EditableBullet } from '../hooks/useResumeBuilder';
import type { Job } from '@apcomp/types';
import ResumePage from './ResumePage';

interface Props {
  initialJob?: Job | null;
  onNavigate?: (page: string) => void;
}

// ── Sortable Experience Card ─────────────────────────────────────────────────

function SortableExpCard({
  exp, onToggle, onToggleBullet, onEditBullet,
}: {
  exp: ResumeExperience;
  onToggle: () => void;
  onToggleBullet: (bulletId: string) => void;
  onEditBullet: (bulletId: string, text: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: exp.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : exp.active ? 1 : 0.55,
        background: exp.active ? 'white' : '#f7f6f4',
        border: `1px solid ${exp.active ? 'var(--border)' : 'var(--surface-3)'}`,
        borderRadius: 10, marginBottom: 8, overflow: 'hidden',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
        background: exp.active ? 'var(--surface-2)' : 'var(--surface-3)',
      }}>
        <span {...attributes} {...listeners}
          style={{ cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 14 }}>⠿</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
            {exp.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ink-secondary)' }}>{exp.company}</div>
        </div>
        <button onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', fontSize: 11 }}>
          {expanded ? '▲' : '▼'}
        </button>
        <button onClick={onToggle}
          style={{
            background: 'none', border: `1px solid ${exp.active ? 'var(--border)' : 'var(--accent)'}`,
            borderRadius: 6, cursor: 'pointer', padding: '2px 8px',
            fontSize: 11, color: exp.active ? 'var(--ink-tertiary)' : 'var(--accent)',
            fontFamily: 'var(--font-body)',
          }}>
          {exp.active ? 'Hide' : 'Show'}
        </button>
      </div>
      {expanded && (
        <div style={{ padding: '10px 14px 12px' }}>
          {(exp.bullets ?? []).filter(b => b.active).map(bullet => (
            <BulletRow key={bullet.id} bullet={bullet}
              onToggle={() => onToggleBullet(bullet.id)}
              onEdit={text => onEditBullet(bullet.id, text)} />
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
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 6, opacity: bullet.active ? 1 : 0.4 }}>
      <button onClick={onToggle} style={{
        marginTop: 2, flexShrink: 0, width: 14, height: 14, borderRadius: 3,
        border: `1.5px solid ${bullet.active ? 'var(--accent)' : 'var(--surface-3)'}`,
        background: bullet.active ? 'var(--accent)' : 'transparent',
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {bullet.active && <span style={{ color: 'white', fontSize: 9, lineHeight: 1 }}>✓</span>}
      </button>
      <div ref={ref} contentEditable suppressContentEditableWarning
        onBlur={() => { if (ref.current) onEdit(ref.current.innerText.trim()); }}
        style={{
          flex: 1, 
          fontSize: 12, 
          color: 'var(--ink)', 
          lineHeight: 1.5,
          outline: 'none', 
          borderBottom: '1px solid transparent', 
          padding: '1px 2px', 
          borderRadius: 3, 
          wordBreak: 'break-word',
          whiteSpace: 'pre-wrap',
          overflowWrap: 'break-word',
        }}
        onFocus={e => { (e.target as HTMLElement).style.borderBottomColor = 'var(--accent)'; }}
        onBlurCapture={e => { (e.target as HTMLElement).style.borderBottomColor = 'transparent'; }}
      >
        {bullet.text}
      </div>
    </div>
  );
}

// Replace the SortableProjectRow component in ResumeBuilderPage.tsx with this:

function SortableProjectCard({
  project,
  onToggle,
  onToggleBullet,
  onEditBullet,
  onEditField,
}: {
  project: ResumeProject;
  onToggle: () => void;
  onToggleBullet: (bulletId: string) => void;
  onEditBullet: (bulletId: string, text: string) => void;
  onEditField: (field: 'name' | 'category' | 'date' | 'techStack', value: string) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: project.id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : project.active ? 1 : 0.55,
        background: project.active ? 'white' : '#f7f6f4',
        border: `1px solid ${project.active ? 'var(--border)' : 'var(--surface-3)'}`,
        borderRadius: 10,
        marginBottom: 8,
        overflow: 'hidden',
      }}
    >
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        background: project.active ? 'var(--surface-2)' : 'var(--surface-3)',
      }}>
        <span
          {...attributes}
          {...listeners}
          style={{ cursor: 'grab', color: 'var(--ink-tertiary)', fontSize: 14, userSelect: 'none' }}
        >
          ⠿
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', fontFamily: 'var(--font-display)', letterSpacing: '-0.01em' }}>
            {project.name}
            {project.category && (
              <span style={{ fontWeight: 400, color: 'var(--ink-secondary)' }}>
                {' | '}{project.category}
              </span>
            )}
          </div>
          {project.date && (
            <div style={{ fontSize: 11, color: 'var(--ink-tertiary)' }}>{project.date}</div>
          )}
        </div>
        <button
          onClick={() => setExpanded(e => !e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', fontSize: 11 }}
        >
          {expanded ? '▲' : '▼'}
        </button>
        <button
          onClick={onToggle}
          style={{
            background: 'none',
            border: `1px solid ${project.active ? 'var(--border)' : 'var(--accent)'}`,
            borderRadius: 6, cursor: 'pointer', padding: '2px 8px',
            fontSize: 11, color: project.active ? 'var(--ink-tertiary)' : 'var(--accent)',
            fontFamily: 'var(--font-body)',
          }}
        >
          {project.active ? 'Hide' : 'Show'}
        </button>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div style={{ padding: '10px 14px 12px' }}>
          {/* Tech stack */}
          {project.techStack && (
            <div style={{
              fontSize: 11, color: 'var(--ink-secondary)', fontStyle: 'italic',
              marginBottom: 8, paddingLeft: 2,
            }}>
              {project.techStack}
            </div>
          )}

          {/* Bullets */}
          {(project.bullets ?? []).length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', paddingLeft: 4 }}>
              No bullets extracted.
            </div>
          ) : (
            (project.bullets ?? []).map(bullet => (
              <BulletRow
                key={bullet.id}
                bullet={bullet}
                onToggle={() => onToggleBullet(bullet.id)}
                onEdit={text => onEditBullet(bullet.id, text)}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

function SectionPanel({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 0', background: 'none', border: 'none',
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

function InlineField({ label, value, onChange }: {
  label: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{ fontSize: 10, color: 'var(--ink-tertiary)', marginBottom: 2, letterSpacing: '0.04em' }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} style={{
        width: '100%', padding: '5px 8px', borderRadius: 6,
        border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
        fontSize: 12, color: 'var(--ink)', background: 'white', outline: 'none',
      }} />
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ResumeBuilderPage({ initialJob }: Props) {
  const builder = useResumeBuilder(initialJob);
  const { state, loading, error, tailoringResult, activeJob, resetToFull } = builder;

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
    a.download = `${state.header.name.replace(/\s+/g, '_')}_Resume${activeJob ? `_${activeJob.company.replace(/\s+/g, '_')}` : ''}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  }, [state, activeJob]);

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
      <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        No CV uploaded yet
      </div>
      <div style={{ fontSize: 14, color: 'var(--ink-tertiary)', marginBottom: 24 }}>
        Upload your CV first to use the resume builder.
      </div>
      <button
        onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'CV Upload' }))}
        style={{
          padding: '10px 24px', background: 'var(--ink)', color: 'white',
          border: 'none', borderRadius: 8, cursor: 'pointer',
          fontFamily: 'var(--font-body)', fontSize: 14,
        }}
      >
        Upload CV →
      </button>
    </div>
  );

  return (
    <>
      <style>{`
        .builder-wrap { display: flex; height: calc(100vh - 61px); overflow: hidden; }
        .builder-left { width: 42%; min-width: 320px; overflow-y: auto; padding: 28px 24px; border-right: 1px solid var(--border); background: var(--surface); }
        .builder-right { flex: 1; display: flex; flex-direction: column; background: #e8e5df; }
        .preview-toolbar { display: flex; align-items: center; justify-content: space-between; padding: 10px 20px; background: var(--surface-2); border-bottom: 1px solid var(--border); }
        .preview-label { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ink-tertiary); font-family: var(--font-body); }
        .download-btn { padding: 7px 18px; background: var(--ink); color: white; border: none; border-radius: 7px; font-family: var(--font-body); font-size: 12px; font-weight: 500; cursor: pointer; transition: opacity 0.15s; }
        .download-btn:hover { opacity: 0.8; }
        .pdf-viewer-wrap { flex: 1; overflow: hidden; }
        .builder-title { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 4px; }
        .builder-sub { font-size: 12px; color: var(--ink-tertiary); margin-bottom: 16px; }
        .skill-group-row { background: white; border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; margin-bottom: 8px; }

        .tailor-banner {
          background: var(--accent-light);
          border: 1px solid var(--accent);
          border-radius: 10px;
          padding: 14px 16px;
          margin-bottom: 20px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .tailor-banner-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 8px;
        }
        .tailor-banner-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--accent);
          font-family: var(--font-display);
        }
        .tailor-reset-btn {
          font-size: 11px;
          color: var(--accent);
          background: none;
          border: 1px solid var(--accent);
          border-radius: 6px;
          padding: 2px 8px;
          cursor: pointer;
          font-family: var(--font-body);
          white-space: nowrap;
          flex-shrink: 0;
        }
        .tailor-stats {
          font-size: 11px;
          color: #7a3a1e;
          line-height: 1.5;
        }
        .tailor-keywords {
          display: flex;
          flex-wrap: wrap;
          gap: 4px;
          margin-top: 4px;
        }
        .tailor-kw {
          font-size: 10px;
          background: white;
          border: 1px solid var(--accent);
          color: var(--accent);
          padding: 1px 6px;
          border-radius: 99px;
        }
      `}</style>

      <div className="builder-wrap">
        {/* ── Left Panel ── */}
        <div className="builder-left">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <div className="builder-title">Resume Builder</div>
            <button
              onClick={() => {
                if (confirm('Upload a new CV? This will replace your current profile.')) {
                  fetch('http://localhost:3000/resume/profile', { method: 'DELETE' })
                    .catch(() => {})
                    .finally(() => window.location.reload());
                }
              }}
              style={{
                fontSize: 11, padding: '4px 10px', borderRadius: 6,
                border: '1px solid var(--border)', background: 'white',
                color: 'var(--ink-secondary)', cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              Re-upload CV
            </button>
          </div>
          <div className="builder-sub">Drag to reorder · click bullets to toggle · click text to edit</div>

          {/* Tailoring Banner */}
          {tailoringResult && activeJob && (
            <div className="tailor-banner">
              <div className="tailor-banner-top">
                <div className="tailor-banner-title">
                  ✦ Tailored for {activeJob.company} — {activeJob.title}
                </div>
                <button className="tailor-reset-btn" onClick={resetToFull}>
                  Reset to full CV
                </button>
              </div>
              <div className="tailor-stats">
                {tailoringResult.alreadyFit ? (
                  'Your full CV fits on one page — no items were hidden.'
                ) : (
                  <>
                    {tailoringResult.projectsHidden > 0 &&
                      `${tailoringResult.projectsHidden} project${tailoringResult.projectsHidden !== 1 ? 's' : ''} removed. `}
                    {tailoringResult.bulletsHidden > 0 &&
                      `${tailoringResult.bulletsHidden} bullet${tailoringResult.bulletsHidden !== 1 ? 's' : ''} trimmed. `}
                    {`~${(tailoringResult.estimatedPages * 100).toFixed(0)}% of one page.`}
                  </>
                )}
              </div>
              {tailoringResult.keywordsUsed.slice(0, 12).length > 0 && (
                <div className="tailor-keywords">
                  {tailoringResult.keywordsUsed.slice(0, 12).map(kw => (
                    <span key={kw} className="tailor-kw">{kw}</span>
                  ))}
                </div>
              )}
            </div>
          )}

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

          <SectionPanel title="Personal Projects">
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleProjDragEnd}>
              <SortableContext items={state.projects.map(p => p.id)} strategy={verticalListSortingStrategy}>
                {state.projects.map(proj => (
                  <SortableProjectCard
                    key={proj.id}
                    project={proj}
                    onToggle={() => builder.toggleProject(proj.id)}
                    onToggleBullet={bId => builder.toggleProjectBullet(proj.id, bId)}
                    onEditBullet={(bId, text) => builder.updateProjectBullet(proj.id, bId, text)}
                    onEditField={(field, value) => builder.updateProjectField(proj.id, field, value)}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </SectionPanel>

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
                      }}
                    />
                    <button onClick={() => builder.toggleSkillGroup(sg.id)} style={{
                      fontSize: 11, padding: '2px 8px', borderRadius: 6,
                      border: `1px solid ${sg.active ? 'var(--border)' : 'var(--accent)'}`,
                      color: sg.active ? 'var(--ink-tertiary)' : 'var(--accent)',
                      background: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}>
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

        {/* ── Right Panel ── */}
        <div className="builder-right">
          <div className="preview-toolbar">
            <span className="preview-label">
              {activeJob ? `Tailored for ${activeJob.company}` : 'Live Preview'}
            </span>
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
