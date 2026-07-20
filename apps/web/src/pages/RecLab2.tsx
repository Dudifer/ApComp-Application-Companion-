import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Job } from '@apcomp/types';
import { useApi } from '../lib/api';

/** Mirrors the API's RecLab2RankedJob — a job plus its cosine-similarity match to the CV, 0-100 (or null with no CV / no job embedding yet). */
interface RankedJob {
  job: Job;
  similarity: number | null;
}

/**
 * Rec Lab 2 — clean rebuild of the Rec Lab sandbox. Three boxes:
 * recommended / dismissed / saved jobs. Recommended is wired up to
 * GET /rec-lab2/recommended, which reads the test-dataset.ts jobs and
 * scores + (once per CV upload) sorts them by similarity to the user's CV
 * embedding — see RecLab2Service.getRecommendedJobs. Dismissed/saved are
 * still empty, filled in incrementally from here.
 *
 * Clicking a job hands it up to onJobSelect — App.tsx wires this to the
 * same selectedJob state that renders the app-wide JobDetailPanel, so
 * clicking a job here opens the exact same description/apply-url/save/
 * dismiss panel every other job list in the app uses, instead of a
 * duplicate one-off implementation.
 */
export default function RecLab2Page({ onJobSelect }: { onJobSelect?: (job: Job) => void }) {
  const api = useApi();
  const [recommended, setRecommended] = useState<RankedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRecommended = useCallback(() => {
    setLoading(true);
    setError(null);
    api.get('/rec-lab2/recommended')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load recommended jobs (${r.status})`);
        return r.json();
      })
      .then(data => setRecommended(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message ?? 'Failed to load recommended jobs'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRecommended(); }, [fetchRecommended]);

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">Rec Lab 2</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Box title="Recommended Jobs" count={recommended.length}>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : error ? (
            <Empty tone="error">{error}</Empty>
          ) : recommended.length === 0 ? (
            <Empty>No jobs yet.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
              {recommended.map(({ job, similarity }) => (
                <div
                  key={job.id}
                  onClick={() => onJobSelect?.(job)}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'white',
                    padding: '10px 12px',
                    cursor: onJobSelect ? 'pointer' : 'default',
                    transition: 'box-shadow 0.15s',
                  }}
                  onMouseEnter={e => { if (onJobSelect) e.currentTarget.style.boxShadow = 'var(--card-shadow)'; }}
                  onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{job.title}</div>
                    {typeof similarity === 'number' && (
                      <span
                        style={{
                          fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                          padding: '2px 8px', borderRadius: 99,
                          background: 'var(--accent-light)', color: 'var(--accent)',
                        }}
                      >
                        {similarity}% match
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 2 }}>
                    {job.company}{job.location?.displayName ? ` · ${job.location.displayName}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Box>

        <Box title="Dismissed Jobs">
          <Empty>No jobs yet.</Empty>
        </Box>

        <Box title="Saved Jobs">
          <Empty>No jobs yet.</Empty>
        </Box>
      </div>
    </div>
  );
}

function Box({ title, count, children }: { title: string; count?: number; children?: ReactNode }) {
  return (
    <div
      style={{
        width: '100%',
        minHeight: 200,
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 20,
      }}
    >
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 14,
          fontWeight: 600,
          color: 'var(--ink)',
          marginBottom: 14,
        }}
      >
        {title}{typeof count === 'number' ? ` (${count})` : ''}
      </div>
      {children}
    </div>
  );
}

function Empty({ children, tone }: { children: ReactNode; tone?: 'error' }) {
  return (
    <div style={{ fontSize: 13, color: tone === 'error' ? '#991b1b' : 'var(--ink-tertiary)' }}>
      {children}
    </div>
  );
}
