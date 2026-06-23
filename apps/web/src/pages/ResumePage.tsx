import { useState, useRef, useCallback, useEffect } from 'react';
import type { CvProfile, GapQuestion, SkillEntry } from '@apcomp/types';
import { useApi } from '../lib/api';

const CATEGORY_COLORS: Record<string, string> = {
  language:    '#c9622f',
  framework:   '#2563a8',
  tool:        '#2d7d4f',
  practice:    '#b45309',
  methodology: '#7c3d8f',
};

const CATEGORY_LABELS: Record<string, string> = {
  language:    'Languages',
  framework:   'Frameworks & Libraries',
  tool:        'Tools & Infrastructure',
  practice:    'Practices',
  methodology: 'Methodologies',
};

type Stage = 'upload' | 'processing' | 'gaps' | 'profile';

function formatMonths(months: number): string {
  if (months < 1) return '< 1 mo';
  if (months < 12) return `${months} mo`;
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m > 0 ? `${y}y ${m}mo` : `${y}y`;
}

function ProficiencyDots({ level }: { level: string }) {
  const map: Record<string, number> = { beginner: 1, intermediate: 2, advanced: 3, expert: 4 };
  const filled = map[level] ?? 2;
  return (
    <span style={{ display: 'flex', gap: 3 }}>
      {[1, 2, 3, 4].map(i => (
        <span key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: i <= filled ? 'var(--accent)' : 'var(--surface-3)',
          display: 'inline-block',
        }} />
      ))}
    </span>
  );
}

function SkillBar({ skill, maxMonths }: { skill: SkillEntry; maxMonths: number }) {
  const pct = Math.max(4, (skill.monthsExperience / maxMonths) * 100);
  const color = CATEGORY_COLORS[skill.category] ?? '#888';
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 500 }}>{skill.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ProficiencyDots level={skill.proficiency} />
          <span style={{ fontSize: 11, color: 'var(--ink-tertiary)', minWidth: 40, textAlign: 'right' }}>
            {formatMonths(skill.monthsExperience)}
          </span>
        </div>
      </div>
      <div style={{ height: 6, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{
          height: '100%',
          width: `${pct}%`,
          background: color,
          borderRadius: 99,
          transition: 'width 0.8s cubic-bezier(0.16,1,0.3,1)',
          opacity: 0.85,
        }} />
      </div>
    </div>
  );
}

function GapSection({
  company,
  questions,
  answers,
  onAnswer,
}: {
  company: string;
  questions: GapQuestion[];
  answers: Record<string, string>;
  onAnswer: (id: string, val: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const answered = questions.filter(q => answers[q.id]).length;

  return (
    <div style={{
      border: '1px solid var(--border)',
      borderRadius: 12,
      marginBottom: 14,
      overflow: 'hidden',
    }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', padding: '16px 20px', background: 'var(--surface-2)',
          border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)',
          fontSize: 14, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.01em',
        }}
      >
        <span>{company}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 99,
            background: answered === questions.length ? 'var(--green-light)' : 'var(--surface-3)',
            color: answered === questions.length ? 'var(--green)' : 'var(--ink-tertiary)',
            fontFamily: 'var(--font-body)', fontWeight: 500,
          }}>
            {answered}/{questions.length} answered
          </span>
          <span style={{ color: 'var(--ink-tertiary)', fontSize: 12 }}>{open ? '▲' : '▼'}</span>
        </div>
      </button>

      {open && (
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {questions.map(q => (
            <div key={q.id}>
              <div style={{ fontSize: 13, color: 'var(--ink)', marginBottom: 10, lineHeight: 1.5 }}>
                {q.question}
              </div>

              {q.type === 'multiselect' && q.options && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {q.options.map(opt => {
                    const selected = (answers[q.id] ?? '').split(',').includes(opt);
                    return (
                      <button
                        key={opt}
                        onClick={() => {
                          const current = (answers[q.id] ?? '').split(',').filter(Boolean);
                          const next = selected
                            ? current.filter(v => v !== opt)
                            : [...current, opt];
                          onAnswer(q.id, next.join(','));
                        }}
                        style={{
                          padding: '6px 12px', borderRadius: 99, fontSize: 12,
                          border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}`,
                          background: selected ? 'var(--accent-light)' : 'white',
                          color: selected ? 'var(--accent)' : 'var(--ink-secondary)',
                          cursor: 'pointer', fontFamily: 'var(--font-body)',
                          transition: 'all 0.15s',
                        }}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              )}

              {q.type === 'text' && (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={e => onAnswer(q.id, e.target.value)}
                  rows={2}
                  placeholder="Type your answer..."
                  style={{
                    width: '100%', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
                    fontSize: 13, color: 'var(--ink)', background: 'white',
                    resize: 'vertical', outline: 'none',
                  }}
                />
              )}

              {q.type === 'scale' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {['1', '2', '3', '4', '5'].map(v => (
                    <button
                      key={v}
                      onClick={() => onAnswer(q.id, v)}
                      style={{
                        width: 40, height: 40, borderRadius: 8, fontSize: 14,
                        border: `1px solid ${answers[q.id] === v ? 'var(--accent)' : 'var(--border)'}`,
                        background: answers[q.id] === v ? 'var(--accent-light)' : 'white',
                        color: answers[q.id] === v ? 'var(--accent)' : 'var(--ink-secondary)',
                        cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600,
                      }}
                    >
                      {v}
                    </button>
                  ))}
                  <span style={{ alignSelf: 'center', fontSize: 11, color: 'var(--ink-tertiary)', marginLeft: 4 }}>
                    1 = beginner · 5 = expert
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ResumePage() {
  const api = useApi();
  const [stage, setStage] = useState<Stage>('upload');
  const [profile, setProfile] = useState<CvProfile | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [processingMsg, setProcessingMsg] = useState('Reading your CV...');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadFile = useCallback(async (file: File) => {
    setError(null);
    setStage('processing');

    const messages = [
      'Reading your CV...',
      'Identifying roles and experience...',
      'Extracting skills and technologies...',
      'Generating clarifying questions...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % messages.length;
      setProcessingMsg(messages[i]);
    }, 2000);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.upload('/resume/upload', formData);
      if (!res.ok) throw new Error(await res.text());
      const data: CvProfile = await res.json();
      setProfile(data);
      setStage(data.gapQuestions.length > 0 ? 'gaps' : 'profile');
      // window.location.reload(); 
    } catch (err: any) {
      setError(err.message ?? 'Upload failed. Please try again.');
      setStage('upload');
    } finally {
      clearInterval(interval);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadFile(file);
  }, [uploadFile]);

  const submitAnswers = async () => {
    if (!profile) return;
    setStage('processing');
    setProcessingMsg('Refining your profile with your answers...');
    try {
      const payload = Object.entries(answers).map(([questionId, answer]) => ({ questionId, answer }));
      const res = await api.post('/resume/gap-answers', {
        body: JSON.stringify({ answers: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      const refined: CvProfile = await res.json();
      setProfile(refined);
      setStage('profile');
    } catch (err: any) {
      setError(err.message ?? 'Failed to process answers.');
      setStage('gaps');
    }
  };

  // Group gap questions by company
  const groupedGaps = profile?.gapQuestions.reduce<Record<string, GapQuestion[]>>((acc, q) => {
    (acc[q.company] = acc[q.company] ?? []).push(q);
    return acc;
  }, {}) ?? {};

  // Group skills by category
  const skillsByCategory = profile?.skills.reduce<Record<string, SkillEntry[]>>((acc, s) => {
    (acc[s.category] = acc[s.category] ?? []).push(s);
    return acc;
  }, {}) ?? {};

  const categories = Object.keys(skillsByCategory);
  const displayCategory = activeCategory ?? categories[0];
  const displaySkills = (skillsByCategory[displayCategory] ?? [])
    .sort((a, b) => b.monthsExperience - a.monthsExperience);
  const maxMonths = Math.max(...displaySkills.map(s => s.monthsExperience), 1);

  const totalAnswered = Object.keys(answers).length;
  const totalQuestions = profile?.gapQuestions.length ?? 0;

  useEffect(() => {
    api.get('/resume/profile')
      .then(r => r.json())
      .then((p: CvProfile) => {
        if (p && p.name) {
          setProfile(p);
          setStage(p.isComplete ? 'profile' : p.gapQuestions?.length > 0 ? 'gaps' : 'profile');
        }
      })
      .catch(() => {});
  }, [api]);

  return (
    <>
      <style>{`
        .resume-page { padding: 48px 40px; max-width: 900px; }
        .page-title { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 6px; }
        .page-sub { font-size: 14px; color: var(--ink-tertiary); font-weight: 300; margin-bottom: 40px; }

        .drop-zone {
          border: 2px dashed var(--surface-3);
          border-radius: 16px;
          padding: 80px 40px;
          text-align: center;
          cursor: pointer;
          transition: border-color 0.2s, background 0.2s;
          background: white;
        }
        .drop-zone:hover, .drop-zone.dragging {
          border-color: var(--accent);
          background: var(--accent-light);
        }
        .drop-icon { font-size: 40px; margin-bottom: 16px; }
        .drop-title { font-family: var(--font-display); font-size: 18px; font-weight: 600; color: var(--ink); margin-bottom: 8px; letter-spacing: -0.02em; }
        .drop-sub { font-size: 13px; color: var(--ink-tertiary); }
        .upload-btn {
          margin-top: 24px;
          display: inline-block;
          padding: 10px 24px;
          background: var(--ink);
          color: white;
          border-radius: 8px;
          font-size: 13px;
          font-family: var(--font-body);
          font-weight: 500;
          cursor: pointer;
          border: none;
          transition: opacity 0.15s;
        }
        .upload-btn:hover { opacity: 0.8; }

        .processing-wrap { display: flex; flex-direction: column; align-items: center; padding: 80px 0; gap: 24px; }
        .spinner { width: 40px; height: 40px; border: 3px solid var(--surface-3); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .processing-msg { font-size: 14px; color: var(--ink-secondary); font-weight: 300; }

        .gaps-header { margin-bottom: 28px; }
        .gaps-progress { height: 4px; background: var(--surface-3); border-radius: 99px; margin-top: 12px; overflow: hidden; }
        .gaps-progress-fill { height: 100%; background: var(--accent); border-radius: 99px; transition: width 0.4s; }
        .submit-btn {
          margin-top: 24px;
          padding: 12px 32px;
          background: var(--ink);
          color: white;
          border: none;
          border-radius: 8px;
          font-family: var(--font-body);
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          transition: opacity 0.15s;
        }
        .submit-btn:hover { opacity: 0.8; }
        .skip-link { margin-left: 16px; font-size: 13px; color: var(--ink-tertiary); cursor: pointer; background: none; border: none; text-decoration: underline; }

        .profile-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
        .profile-name { font-family: var(--font-display); font-size: 22px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); }
        .profile-roles-count { font-size: 13px; color: var(--ink-tertiary); margin-top: 4px; }
        .reupload-btn { font-size: 12px; color: var(--ink-secondary); background: none; border: 1px solid var(--border); padding: 6px 14px; border-radius: 8px; cursor: pointer; font-family: var(--font-body); }

        .cat-tabs { display: flex; gap: 4px; margin-bottom: 24px; flex-wrap: wrap; }
        .cat-tab {
          padding: 6px 14px; border-radius: 99px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--border); background: white; color: var(--ink-secondary);
          cursor: pointer; font-family: var(--font-body); transition: all 0.15s;
        }
        .cat-tab.active { background: var(--ink); color: white; border-color: var(--ink); }

        .skills-panel { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 24px; margin-bottom: 28px; }
        .skills-panel-title { font-family: var(--font-display); font-size: 13px; font-weight: 600; color: var(--ink-secondary); letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 20px; }

        .roles-list { display: flex; flex-direction: column; gap: 12px; }
        .role-card { background: white; border: 1px solid var(--border); border-radius: 12px; padding: 20px; }
        .role-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .role-company { font-family: var(--font-display); font-size: 15px; font-weight: 600; color: var(--ink); letter-spacing: -0.02em; }
        .role-duration { font-size: 11px; color: var(--ink-tertiary); }
        .role-title { font-size: 13px; color: var(--ink-secondary); margin-bottom: 10px; }
        .role-tags { display: flex; flex-wrap: wrap; gap: 6px; }
        .role-tag { font-size: 11px; background: var(--surface-2); color: var(--ink-secondary); padding: 3px 8px; border-radius: 99px; border: 1px solid var(--border); }

        .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; }

        .find-jobs-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 12px 28px; background: var(--accent); color: white;
          border: none; border-radius: 8px; font-family: var(--font-body);
          font-size: 14px; font-weight: 500; cursor: pointer; margin-bottom: 32px;
          transition: opacity 0.15s;
        }
        .find-jobs-btn:hover { opacity: 0.88; }
        .section-divider { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); margin-bottom: 16px; margin-top: 32px; }
      `}</style>

      <div className="resume-page">
        <div className="page-title">Resume Builder</div>
        <div className="page-sub">Upload your full CV to extract your skill profile and find matching roles.</div>

        {error && <div className="error-msg">{error}</div>}

        {/* ── UPLOAD ── */}
        {stage === 'upload' && (
          <>
            <div
              className={`drop-zone${isDragging ? ' dragging' : ''}`}
              onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className="drop-icon">📄</div>
              <div className="drop-title">Drop your CV here</div>
              <div className="drop-sub">PDF or DOCX · Max 10MB</div>
              <button className="upload-btn" onClick={e => { e.stopPropagation(); fileInputRef.current?.click(); }}>
                Browse files
              </button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); }}
            />
          </>
        )}

        {/* ── PROCESSING ── */}
        {stage === 'processing' && (
          <div className="processing-wrap">
            <div className="spinner" />
            <div className="processing-msg">{processingMsg}</div>
          </div>
        )}

        {/* ── GAP Q&A ── */}
        {stage === 'gaps' && profile && (
          <>
            <div className="gaps-header">
              <div style={{ fontSize: 14, color: 'var(--ink)', marginBottom: 6 }}>
                We found <strong>{profile.roles.length} roles</strong> on your CV. Answer a few questions to sharpen your skill profile.
              </div>
              <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
                {totalAnswered} of {totalQuestions} questions answered
              </div>
              <div className="gaps-progress">
                <div className="gaps-progress-fill" style={{ width: `${(totalAnswered / totalQuestions) * 100}%` }} />
              </div>
            </div>

            {Object.entries(groupedGaps).map(([company, questions]) => (
              <GapSection
                key={company}
                company={company}
                questions={questions as GapQuestion[]}
                answers={answers}
                onAnswer={(id, val) => setAnswers(a => ({ ...a, [id]: val }))}
              />
            ))}

            <button className="submit-btn" onClick={submitAnswers}>
              Build my profile →
            </button>
            <button className="skip-link" onClick={() => setStage('profile')}>
              Skip for now
            </button>
          </>
        )}

        {/* ── PROFILE VIEW ── */}
        {stage === 'profile' && profile && (
          <>
            <div className="profile-header">
              <div>
                <div className="profile-name">{profile.name ?? 'Your Profile'}</div>
                <div className="profile-roles-count">
                  {profile.roles.length} roles · {profile.skills.length} skills identified
                </div>
              </div>
              <button className="reupload-btn" onClick={() => { setStage('upload'); setProfile(null); setAnswers({}); }}>
                Re-upload CV
              </button>
            </div>

            <button className="find-jobs-btn"
              onClick={() => {
                window.dispatchEvent(new CustomEvent('navigate', { detail: 'Resume Builder' }));
              }}
              >
              ✦ Build my resume
            </button>

            <div className="section-divider">Skill breakdown</div>

            <div className="cat-tabs">
              {categories.map(cat => (
                <button
                  key={cat}
                  className={`cat-tab${(activeCategory ?? categories[0]) === cat ? ' active' : ''}`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {CATEGORY_LABELS[cat] ?? cat}
                  <span style={{ marginLeft: 6, opacity: 0.6 }}>({skillsByCategory[cat].length})</span>
                </button>
              ))}
            </div>

            <div className="skills-panel">
              <div className="skills-panel-title">{CATEGORY_LABELS[displayCategory] ?? displayCategory}</div>
              {displaySkills.map(skill => (
                <SkillBar key={skill.name} skill={skill} maxMonths={maxMonths} />
              ))}
            </div>

            <div className="section-divider">Experience timeline</div>

            <div className="roles-list">
              {profile.roles
                .sort((a, b) => (b.startDate > a.startDate ? 1 : -1))
                .map(role => (
                  <div className="role-card" key={`${role.company}-${role.startDate}`}>
                    <div className="role-top">
                      <div className="role-company">{role.company}</div>
                      <div className="role-duration">
                        {role.startDate} → {role.endDate ?? 'Present'} · {formatMonths(role.durationMonths)}
                      </div>
                    </div>
                    <div className="role-title">{role.title}</div>
                    <div className="role-tags">
                      {role.technologies.map(t => (
                        <span className="role-tag" key={t}>{t}</span>
                      ))}
                      {role.practices.map(p => (
                        <span className="role-tag" key={p} style={{ borderStyle: 'dashed' }}>{p}</span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}