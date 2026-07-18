import { useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Job } from '@apcomp/types';
import { useApi } from '../lib/api';

/**
 * Rec Lab 2 — clean rebuild of the Rec Lab sandbox. Three boxes:
 * recommended / dismissed / saved jobs. Recommended is wired up to
 * GET /rec-lab2/recommended (process 2), which reads the test-dataset.ts
 * jobs (process 1, on the backend — see RecLab2Service.getTestDatasetJobs).
 * Dismissed/saved are still empty, filled in incrementally from here.
 */
export default function RecLab2Page() {
  const api = useApi();
  const [recommended, setRecommended] = useState<Job[]>([]);
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

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <Box title="Recommended Jobs" count={recommended.length}>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : error ? (
            <Empty tone="error">{error}</Empty>
          ) : recommended.length === 0 ? (
            <Empty>No jobs yet.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
              {recommended.map(job => (
                <div
                  key={job.id}
                  style={{
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    background: 'white',
                    padding: '10px 12px',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{job.title}</div>
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
        flex: 1,
        minHeight: 320,
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
