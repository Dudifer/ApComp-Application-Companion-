import { useState, useEffect, useRef } from 'react';
import type { Job } from '@apcomp/types';
import { useApi } from '../lib/api';

interface SearchParams {
  titles: string[];
  skills: string;
  location: string;
  remote: boolean;
  postedDays: number | null;
  experienceLevel: 'entry' | 'junior' | 'mid' | 'any';
}

const EXPERIENCE_OPTIONS = [
  { value: 'entry',  label: 'Entry Level'  },
  { value: 'junior', label: 'Junior'        },
  { value: 'mid',    label: 'Mid-Level'     },
  { value: 'any',    label: 'Any Level'     },
] as const;

const RECENCY_OPTIONS = [
  { value: 7,    label: 'Last 7 days'   },
  { value: 14,   label: 'Last 2 weeks'  },
  { value: 30,   label: 'Last 30 days'  },
  { value: 90,   label: 'Last 3 months' },
  { value: null, label: 'Any time'      },
] as const;

function formatSalary(job: Job): string {
  if (!job.salary) return '';
  const { min, max, currency } = job.salary;
  const fmt = (n?: number) => (n ? `$${n.toLocaleString()}` : null);
  const range = [fmt(min), fmt(max)].filter(Boolean).join(' – ');
  return range ? `${range} ${currency}` : '';
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function JobSearchPage({ onJobSelect }: { onJobSelect?: (job: Job) => void }) {
  const [stage, setStage] = useState<'form' | 'searching' | 'results'>('form');
  const [params, setParams] = useState<SearchParams>({
    titles: [],
    skills: '',
    location: '',
    remote: false,
    postedDays: 30,
    experienceLevel: 'junior',
  });
  const [titleInput, setTitleInput] = useState('');
  const [results, setResults] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState('Fetching jobs...');
  const titleInputRef = useRef<HTMLInputElement>(null);
  const api = useApi();

  // Pre-fill from CV on mount only
  useEffect(() => {
    api.get('/resume/profile')
      .then(r => r.json())
      .then(p => {
        if (!p?.roles?.length) return;
        const sorted = [...p.roles].sort((a: any, b: any) => b.startDate > a.startDate ? 1 : -1);
        const titles = sorted.slice(0, 2).map((r: any) => r.title).filter(Boolean);
        const topSkills = (p.skills ?? [])
          .sort((a: any, b: any) => b.monthsExperience - a.monthsExperience)
          .slice(0, 5)
          .map((s: any) => s.name)
          .join(', ');
        setParams(prev => ({
          ...prev,
          titles: titles.length ? titles : prev.titles,
          skills: topSkills || prev.skills,
        }));
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addTitle = (raw: string) => {
    const t = raw.trim();
    if (!t || params.titles.includes(t)) return;
    setParams(prev => ({ ...prev, titles: [...prev.titles, t] }));
    setTitleInput('');
  };

  const removeTitle = (t: string) => {
    setParams(prev => ({ ...prev, titles: prev.titles.filter(x => x !== t) }));
  };

  const handleSearch = async () => {
    setError(null);
    setStage('searching');
    const msgs = ['Querying job database...', 'Enriching company data...', 'Filtering with AI...', 'Almost done...'];
    let i = 0;
    const interval = setInterval(() => { i = (i + 1) % msgs.length; setSearchMsg(msgs[i]); }, 2500);
    try {
      const res = await api.post('/jobs/search', {
        titles: params.titles,
        skills: params.skills || undefined,
        location: params.location || undefined,
        remote: params.remote,
        postedDays: params.postedDays ?? undefined,
        experienceLevel: params.experienceLevel,
      });
      if (!res.ok) throw new Error(await res.text());
      setResults(await res.json());
      setStage('results');
    } catch (err: any) {
      setError(err.message ?? 'Search failed. Please try again.');
      setStage('form');
    } finally {
      clearInterval(interval);
    }
  };

  const canSearch = params.titles.length > 0 || titleInput.trim().length > 0;

  return (
    <>
      <style>{`
        /* ── page shell ── */
        .sp-page { padding: 48px 48px; width: 100%; box-sizing: border-box; }
        .sp-inner { max-width: 760px; margin: 0 auto; }
        .sp-title { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 6px; }
        .sp-sub { font-size: 13px; color: var(--ink-tertiary); font-weight: 300; margin-bottom: 36px; }

        /* ── form ── */
        .sp-form { display: flex; flex-direction: column; gap: 20px; }
        .sp-label { font-size: 11px; color: var(--ink-tertiary); font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px; }
        .sp-hint { font-size: 11px; color: var(--ink-tertiary); margin-top: 5px; }
        .sp-input {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid var(--border); font-family: var(--font-body);
          font-size: 13px; color: var(--ink); background: white;
          outline: none; transition: border-color 0.15s; box-sizing: border-box;
        }
        .sp-input:focus { border-color: var(--ink-secondary); }
        .sp-input::placeholder { color: var(--ink-tertiary); }

        /* ── title chips ── */
        .sp-chips-wrap {
          display: flex; flex-wrap: wrap; gap: 8px; align-items: center;
          min-height: 44px; padding: 8px 12px; border-radius: 8px;
          border: 1px solid var(--border); background: white;
          transition: border-color 0.15s; cursor: text;
        }
        .sp-chips-wrap:focus-within { border-color: var(--ink-secondary); }
        .sp-chip {
          display: inline-flex; align-items: center; gap: 5px;
          background: var(--ink); color: white;
          font-size: 12px; padding: 4px 10px 4px 12px; border-radius: 99px;
          white-space: nowrap;
        }
        .sp-chip-x {
          background: none; border: none; color: rgba(255,255,255,0.7);
          cursor: pointer; padding: 0; font-size: 14px; line-height: 1;
          display: flex; align-items: center;
        }
        .sp-chip-x:hover { color: white; }
        .sp-chip-input {
          border: none; outline: none; font-family: var(--font-body);
          font-size: 13px; color: var(--ink); flex: 1; min-width: 180px;
          background: transparent; padding: 2px 0;
        }
        .sp-chip-input::placeholder { color: var(--ink-tertiary); }

        /* ── 2-col row ── */
        .sp-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        @media (max-width: 600px) { .sp-row { grid-template-columns: 1fr; } }

        /* ── select ── */
        .sp-select {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid var(--border); font-family: var(--font-body);
          font-size: 13px; color: var(--ink); background: white;
          outline: none; cursor: pointer; appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          padding-right: 36px; box-sizing: border-box;
        }
        .sp-select:focus { border-color: var(--ink-secondary); }

        /* ── remote toggle ── */
        .sp-toggle-row { display: flex; align-items: center; gap: 10px; height: 44px; }
        .sp-toggle {
          width: 36px; height: 20px; border-radius: 99px; border: none;
          cursor: pointer; position: relative; transition: background 0.2s; flex-shrink: 0;
        }
        .sp-toggle-thumb {
          position: absolute; width: 14px; height: 14px; border-radius: 50%;
          background: white; top: 3px; transition: left 0.2s;
        }
        .sp-toggle-label { font-size: 13px; color: var(--ink); }

        /* ── search button ── */
        .sp-submit {
          padding: 13px 0; background: var(--ink); color: white;
          border: none; border-radius: 8px; font-family: var(--font-body);
          font-size: 14px; font-weight: 500; cursor: pointer;
          transition: opacity 0.15s; width: 100%;
        }
        .sp-submit:hover:not(:disabled) { opacity: 0.8; }
        .sp-submit:disabled { opacity: 0.4; cursor: not-allowed; }

        /* ── loading ── */
        .sp-loading { display: flex; flex-direction: column; align-items: center; padding: 80px 0; gap: 20px; }
        .sp-spinner { width: 36px; height: 36px; border: 3px solid var(--surface-3); border-top-color: var(--accent); border-radius: 50%; animation: sp-spin 0.8s linear infinite; }
        @keyframes sp-spin { to { transform: rotate(360deg); } }
        .sp-loading-msg { font-size: 14px; color: var(--ink-secondary); font-weight: 300; }

        /* ── results ── */
        .sp-results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .sp-results-count { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .sp-back-btn {
          font-size: 13px; color: var(--ink-secondary); background: none;
          border: 1px solid var(--border); padding: 7px 16px; border-radius: 8px;
          cursor: pointer; font-family: var(--font-body);
        }

        .sp-card {
          background: white; border: 1px solid var(--border); border-radius: 12px;
          padding: 20px 24px; margin-bottom: 12px; cursor: pointer;
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .sp-card:hover { box-shadow: 0 4px 16px rgba(26,24,20,0.08); transform: translateY(-1px); }
        .sp-card-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px; }
        .sp-card-title { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .sp-card-score { font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 99px; white-space: nowrap; margin-left: 12px; flex-shrink: 0; }
        .sp-card-company { font-size: 13px; color: var(--ink-secondary); margin-bottom: 6px; }
        .sp-card-meta { display: flex; gap: 12px; font-size: 12px; color: var(--ink-tertiary); flex-wrap: wrap; margin-bottom: 10px; }
        .sp-card-tags { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
        .sp-card-tag { font-size: 11px; background: var(--surface-2); color: var(--ink-secondary); padding: 3px 8px; border-radius: 99px; border: 1px solid var(--border); }
        .sp-card-desc { font-size: 12px; color: var(--ink-secondary); line-height: 1.6; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .sp-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; }
        .sp-empty { padding: 60px 0; text-align: center; color: var(--ink-tertiary); font-size: 14px; }
        .sp-cv-hint { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; font-size: 12px; color: var(--ink-tertiary); margin-bottom: 24px; }
      `}</style>

      <div className="sp-page">
        <div className="sp-inner">

          {/* ── Form ── */}
          {stage === 'form' && (
            <>
              <div className="sp-title">Job Search</div>
              <div className="sp-sub">
                {params.titles.length
                  ? 'Titles pre-filled from your CV — add, remove or adjust before searching.'
                  : 'Enter what you\'re looking for below.'}
              </div>

              {params.titles.length === 0 && !params.skills && (
                <div className="sp-cv-hint">
                  💡 Upload your CV on the Resume Builder page to auto-fill these fields.
                </div>
              )}

              {error && <div className="sp-error">{error}</div>}

              <div className="sp-form">

                {/* Job Titles (multi-chip) */}
                <div>
                  <div className="sp-label">Job Titles</div>
                  <div
                    className="sp-chips-wrap"
                    onClick={() => titleInputRef.current?.focus()}
                  >
                    {params.titles.map(t => (
                      <span className="sp-chip" key={t}>
                        {t}
                        <button className="sp-chip-x" onClick={e => { e.stopPropagation(); removeTitle(t); }}>×</button>
                      </span>
                    ))}
                    <input
                      ref={titleInputRef}
                      className="sp-chip-input"
                      value={titleInput}
                      onChange={e => setTitleInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); addTitle(titleInput); }
                        if (e.key === 'Backspace' && !titleInput && params.titles.length) {
                          removeTitle(params.titles[params.titles.length - 1]);
                        }
                      }}
                      onBlur={() => { if (titleInput.trim()) addTitle(titleInput); }}
                      placeholder={params.titles.length === 0 ? 'e.g. Junior Software Engineer — press Enter to add' : 'Add another title...'}
                    />
                  </div>
                  <div className="sp-hint">Add multiple titles to search all at once</div>
                </div>

                {/* Experience Level + Posted Within */}
                <div className="sp-row">
                  <div>
                    <div className="sp-label">Experience Level</div>
                    <select
                      className="sp-select"
                      value={params.experienceLevel}
                      onChange={e => setParams(prev => ({ ...prev, experienceLevel: e.target.value as SearchParams['experienceLevel'] }))}
                    >
                      {EXPERIENCE_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <div className="sp-label">Posted Within</div>
                    <select
                      className="sp-select"
                      value={params.postedDays ?? ''}
                      onChange={e => setParams(prev => ({
                        ...prev,
                        postedDays: e.target.value === '' ? null : Number(e.target.value),
                      }))}
                    >
                      {RECENCY_OPTIONS.map(o => (
                        <option key={String(o.value)} value={o.value ?? ''}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Skills */}
                <div>
                  <div className="sp-label">Key Skills</div>
                  <input
                    className="sp-input"
                    value={params.skills}
                    onChange={e => setParams(prev => ({ ...prev, skills: e.target.value }))}
                    placeholder="e.g. TypeScript, React, Node.js"
                  />
                  <div className="sp-hint">Used for relevance scoring, not for filtering</div>
                </div>

                {/* Location + Remote */}
                <div className="sp-row">
                  <div>
                    <div className="sp-label">Location</div>
                    <input
                      className="sp-input"
                      value={params.location}
                      onChange={e => setParams(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="e.g. New York — blank for US-wide"
                    />
                  </div>
                  <div>
                    <div className="sp-label">Remote</div>
                    <div className="sp-toggle-row">
                      <button
                        className="sp-toggle"
                        onClick={() => setParams(prev => ({ ...prev, remote: !prev.remote }))}
                        style={{ background: params.remote ? 'var(--accent)' : 'var(--surface-3)' }}
                      >
                        <span className="sp-toggle-thumb" style={{ left: params.remote ? 19 : 3 }} />
                      </button>
                      <span className="sp-toggle-label">
                        {params.remote ? 'Remote only' : 'Include all locations'}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  className="sp-submit"
                  onClick={() => { if (titleInput.trim()) addTitle(titleInput); handleSearch(); }}
                  disabled={!canSearch}
                >
                  Search jobs →
                </button>

              </div>
            </>
          )}

          {/* ── Searching ── */}
          {stage === 'searching' && (
            <div className="sp-loading">
              <div className="sp-spinner" />
              <div className="sp-loading-msg">{searchMsg}</div>
            </div>
          )}

          {/* ── Results ── */}
          {stage === 'results' && (
            <>
              <div className="sp-results-header">
                <div className="sp-results-count">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                  {params.titles.length === 1 ? ` for "${params.titles[0]}"` : ''}
                </div>
                <button className="sp-back-btn" onClick={() => setStage('form')}>← Refine search</button>
              </div>

              {results.length === 0 ? (
                <div className="sp-empty">
                  No results found. Try broadening your titles, experience level, or recency window.
                </div>
              ) : (
                results.map(job => {
                  const hi = job.relevanceScore >= 70;
                  const mid = job.relevanceScore >= 40;
                  const scoreColor = hi ? 'var(--green)' : mid ? 'var(--amber)' : 'var(--ink-tertiary)';
                  const scoreBg = hi ? 'var(--green-light)' : mid ? 'var(--amber-light)' : 'var(--surface-2)';
                  return (
                    <div className="sp-card" key={job.id} onClick={() => onJobSelect?.(job)}>
                      <div className="sp-card-top">
                        <div>
                          <div className="sp-card-title">{job.title}</div>
                          <div className="sp-card-company">
                            {job.company}
                            {job.companyWebsite && (
                              <a
                                href={job.companyWebsite}
                                target="_blank"
                                rel="noopener noreferrer"
                                style={{ marginLeft: 8, fontSize: 11, color: 'var(--accent)', textDecoration: 'none' }}
                                onClick={e => e.stopPropagation()}
                              >
                                {job.companyWebsite.replace(/^https?:\/\//, '')} ↗
                              </a>
                            )}
                          </div>
                        </div>
                        {job.relevanceScore > 0 && (
                          <span className="sp-card-score" style={{ color: scoreColor, background: scoreBg }}>
                            {job.relevanceScore}% match
                          </span>
                        )}
                      </div>

                      <div className="sp-card-meta">
                        <span>📍 {job.location?.displayName ?? 'Unknown'}</span>
                        {job.remote && <span>🌐 Remote</span>}
                        {job.salary && <span>💰 {formatSalary(job)}</span>}
                        <span>🕐 {timeAgo(job.postedAt)}</span>
                      </div>

                      {job.tags?.length > 0 && (
                        <div className="sp-card-tags">
                          {job.tags.slice(0, 6).map(t => (
                            <span className="sp-card-tag" key={t}>{t}</span>
                          ))}
                        </div>
                      )}

                      <div className="sp-card-desc">{job.description}</div>
                    </div>
                  );
                })
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
