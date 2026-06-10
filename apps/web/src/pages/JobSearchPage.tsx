import { useState, useEffect } from 'react';
import type { Job } from '@apcomp/types';
import { useApi } from '../lib/api';

interface SearchQuery {
  title: string;
  skills: string;
  location: string;
  remote: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  new: '#6b6860',
  saved: '#2d7d4f',
  dismissed: '#991b1b',
};

function formatSalary(job: Job): string {
  if (!job.salary) return '';
  const { min, max, currency } = job.salary;
  const fmt = (n?: number) => n ? `$${n.toLocaleString()}` : null;
  const range = [fmt(min), fmt(max)].filter(Boolean).join(' – ');
  return range ? `${range} ${currency}` : '';
}

function timeAgo(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

export default function JobSearchPage({
  onJobSelect,
}: {
  onJobSelect?: (job: Job) => void;
}) {
  const [stage, setStage] = useState<'form' | 'searching' | 'results'>('form');
  const [query, setQuery] = useState<SearchQuery>({
    title: '', skills: '', location: '', remote: false,
  });
  const [results, setResults] = useState<Job[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchMsg, setSearchMsg] = useState('Fetching jobs...');
  const api = useApi();

  // Populate query from CV profile on load
  useEffect(() => {
    api.get('/resume/profile')
      .then(r => r.json())
      .then(p => {
        if (!p?.roles?.length) return;
        const topRole = p.roles.sort((a: any, b: any) =>
          b.startDate > a.startDate ? 1 : -1
        )[0];
        const topSkills = (p.skills ?? [])
          .sort((a: any, b: any) => b.monthsExperience - a.monthsExperience)
          .slice(0, 5)
          .map((s: any) => s.name)
          .join(', ');
        setQuery(q => ({
          ...q,
          title: topRole?.title ?? q.title,
          skills: topSkills || q.skills,
        }));
      })
      .catch(() => {});
  }, [api]);

  const handleSearch = async () => {
    setError(null);
    setStage('searching');

    const msgs = [
      'Fetching jobs...',
      'Enriching company data...',
      'Filtering with AI...',
      'Almost done...',
    ];
    let i = 0;
    const interval = setInterval(() => {
      i = (i + 1) % msgs.length;
      setSearchMsg(msgs[i]);
    }, 2500);

    try {
      const res = await api.post('/jobs/search', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(query),
      });
      if (!res.ok) throw new Error(await res.text());
      const data: Job[] = await res.json();
      setResults(data);
      setStage('results');
    } catch (err: any) {
      setError(err.message ?? 'Search failed. Please try again.');
      setStage('form');
    } finally {
      clearInterval(interval);
    }
  };

  return (
    <>
      <style>{`
        .search-page { padding: 48px 40px; max-width: 900px; }
        .search-title { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 6px; }
        .search-sub { font-size: 14px; color: var(--ink-tertiary); font-weight: 300; margin-bottom: 36px; }

        .query-form { display: flex; flex-direction: column; gap: 16px; max-width: 600px; }
        .field-label { font-size: 11px; color: var(--ink-tertiary); font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 6px; }
        .field-input {
          width: 100%; padding: 10px 14px; border-radius: 8px;
          border: 1px solid var(--border); font-family: var(--font-body);
          font-size: 13px; color: var(--ink); background: white;
          outline: none; transition: border-color 0.15s;
        }
        .field-input:focus { border-color: var(--ink-secondary); }
        .field-hint { font-size: 11px; color: var(--ink-tertiary); margin-top: 4px; }

        .remote-row { display: flex; align-items: center; gap: 10px; }
        .remote-toggle {
          width: 36px; height: 20px; border-radius: 99px; border: none;
          cursor: pointer; position: relative; transition: background 0.2s;
          flex-shrink: 0;
        }
        .remote-toggle::after {
          content: ''; position: absolute; width: 14px; height: 14px;
          border-radius: 50%; background: white; top: 3px; transition: left 0.2s;
        }
        .remote-label { font-size: 13px; color: var(--ink); }

        .search-btn {
          margin-top: 8px; padding: 12px 32px; background: var(--ink);
          color: white; border: none; border-radius: 8px;
          font-family: var(--font-body); font-size: 14px; font-weight: 500;
          cursor: pointer; align-self: flex-start; transition: opacity 0.15s;
        }
        .search-btn:hover { opacity: 0.8; }

        .searching-wrap { display: flex; flex-direction: column; align-items: center; padding: 80px 0; gap: 20px; }
        .spinner { width: 36px; height: 36px; border: 3px solid var(--surface-3); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
        .search-msg { font-size: 14px; color: var(--ink-secondary); font-weight: 300; }

        .results-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        .results-count { font-family: var(--font-display); font-size: 20px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .new-search-btn {
          font-size: 13px; color: var(--ink-secondary); background: none;
          border: 1px solid var(--border); padding: 7px 16px; border-radius: 8px;
          cursor: pointer; font-family: var(--font-body);
        }

        .result-card {
          background: white; border: 1px solid var(--border); border-radius: 12px;
          padding: 20px 24px; margin-bottom: 12px; cursor: pointer;
          transition: box-shadow 0.2s, transform 0.15s;
        }
        .result-card:hover { box-shadow: 0 4px 16px rgba(26,24,20,0.08); transform: translateY(-1px); }

        .result-top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
        .result-title { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .result-score { font-size: 12px; font-weight: 500; padding: 3px 10px; border-radius: 99px; }
        .result-company { font-size: 13px; color: var(--ink-secondary); margin-bottom: 4px; }
        .result-meta { display: flex; gap: 12px; font-size: 12px; color: var(--ink-tertiary); margin-bottom: 12px; flex-wrap: wrap; }
        .result-tags { display: flex; gap: 6px; flex-wrap: wrap; }
        .result-tag { font-size: 11px; background: var(--surface-2); color: var(--ink-secondary); padding: 3px 8px; border-radius: 99px; border: 1px solid var(--border); }
        .result-desc { font-size: 12px; color: var(--ink-secondary); line-height: 1.5; margin-top: 10px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }

        .error-msg { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 12px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; }
        .cv-hint { background: var(--surface-2); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; font-size: 12px; color: var(--ink-tertiary); margin-bottom: 24px; }
      `}</style>

      <div className="search-page">

        {/* ── Form ── */}
        {stage === 'form' && (
          <>
            <div className="search-title">Job Search</div>
            <div className="search-sub">
              {query.title
                ? 'Query pre-filled from your CV — edit as needed before searching.'
                : 'Enter your search criteria below.'}
            </div>

            {!query.title && !query.skills && (
              <div className="cv-hint">
                💡 Upload your CV to auto-fill these fields with your experience.
              </div>
            )}

            {error && <div className="error-msg">{error}</div>}

            <div className="query-form">
              <div>
                <div className="field-label">Job Title</div>
                <input
                  className="field-input"
                  value={query.title}
                  onChange={e => setQuery(q => ({ ...q, title: e.target.value }))}
                  placeholder="e.g. Software Engineer, Frontend Developer"
                />
              </div>

              <div>
                <div className="field-label">Key Skills</div>
                <input
                  className="field-input"
                  value={query.skills}
                  onChange={e => setQuery(q => ({ ...q, skills: e.target.value }))}
                  placeholder="e.g. TypeScript, React, Node.js"
                />
                <div className="field-hint">Used to refine search and relevance scoring</div>
              </div>

              <div>
                <div className="field-label">Location</div>
                <input
                  className="field-input"
                  value={query.location}
                  onChange={e => setQuery(q => ({ ...q, location: e.target.value }))}
                  placeholder="e.g. New York, Chicago — leave blank for US-wide"
                />
              </div>

              <div>
                <div className="field-label">Remote</div>
                <div className="remote-row">
                  <button
                    className="remote-toggle"
                    onClick={() => setQuery(q => ({ ...q, remote: !q.remote }))}
                    style={{
                      background: query.remote ? 'var(--accent)' : 'var(--surface-3)',
                    }}
                  >
                    <span style={{
                      position: 'absolute', width: 14, height: 14, borderRadius: '50%',
                      background: 'white', top: 3, left: query.remote ? 19 : 3,
                      transition: 'left 0.2s',
                    }} />
                  </button>
                  <span className="remote-label">
                    {query.remote ? 'Remote only' : 'Include all locations'}
                  </span>
                </div>
              </div>

              <button
                className="search-btn"
                onClick={handleSearch}
                disabled={!query.title.trim()}
              >
                Search jobs →
              </button>
            </div>
          </>
        )}

        {/* ── Searching ── */}
        {stage === 'searching' && (
          <div className="searching-wrap">
            <div className="spinner" />
            <div className="search-msg">{searchMsg}</div>
          </div>
        )}

        {/* ── Results ── */}
        {stage === 'results' && (
          <>
            <div className="results-header">
              <div className="results-count">
                {results.length} result{results.length !== 1 ? 's' : ''} for "{query.title}"
              </div>
              <button className="new-search-btn" onClick={() => setStage('form')}>
                ← New search
              </button>
            </div>

            {results.length === 0 ? (
              <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--ink-tertiary)', fontSize: 14 }}>
                No results found. Try broadening your search terms.
              </div>
            ) : (
              results.map(job => {
                const scoreColor = job.relevanceScore >= 70 ? 'var(--green)' : job.relevanceScore >= 40 ? 'var(--amber)' : 'var(--ink-tertiary)';
                const scoreBg = job.relevanceScore >= 70 ? 'var(--green-light)' : job.relevanceScore >= 40 ? 'var(--amber-light)' : 'var(--surface-2)';
                return (
                  <div
                    className="result-card"
                    key={job.id}
                    onClick={() => onJobSelect?.(job)}
                  >
                    <div className="result-top">
                      <div>
                        <div className="result-title">{job.title}</div>
                        <div className="result-company">
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
                        <span className="result-score" style={{ color: scoreColor, background: scoreBg }}>
                          {job.relevanceScore}% match
                        </span>
                      )}
                    </div>

                    <div className="result-meta">
                      <span>📍 {job.location?.displayName ?? 'Unknown'}</span>
                      {job.remote && <span>🌐 Remote</span>}
                      {job.salary && <span>💰 {formatSalary(job)}</span>}
                      <span>🕐 {timeAgo(job.postedAt)}</span>
                      <span style={{ textTransform: 'capitalize', opacity: 0.7 }}>
                        via {job.source === 'adzuna' ? 'Adzuna' : job.publisher ?? 'JSearch'}
                      </span>
                    </div>

                    {job.tags?.length > 0 && (
                      <div className="result-tags">
                        {job.tags.slice(0, 5).map(t => (
                          <span className="result-tag" key={t}>{t}</span>
                        ))}
                      </div>
                    )}

                    <div className="result-desc">{job.description}</div>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
    </>
  );
}
