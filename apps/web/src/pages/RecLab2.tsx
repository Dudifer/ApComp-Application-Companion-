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

  // ── Compare mode: pick up to 2 jobs, see their CV match + how similar
  // they are to each other. Job-to-job similarity is fetched fresh from
  // /rec-lab2/compare each time exactly 2 are selected.
  const [compareMode, setCompareMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [jobJobSimilarity, setJobJobSimilarity] = useState<number | null>(null);
  const [comparing, setComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  const toggleCompareMode = () => {
    setCompareMode(prev => !prev);
    setSelectedIds([]);
    setJobJobSimilarity(null);
    setCompareError(null);
  };

  const toggleSelected = (jobId: string) => {
    setSelectedIds(prev => {
      if (prev.includes(jobId)) return prev.filter(id => id !== jobId);
      if (prev.length >= 2) return prev; // deselect one before picking a third
      return [...prev, jobId];
    });
  };

  useEffect(() => {
    if (selectedIds.length !== 2) {
      setJobJobSimilarity(null);
      setCompareError(null);
      return;
    }
    setComparing(true);
    setCompareError(null);
    api.post('/rec-lab2/compare', { jobIdA: selectedIds[0], jobIdB: selectedIds[1] })
      .then(r => {
        if (!r.ok) throw new Error(`Compare request failed (${r.status})`);
        return r.json();
      })
      .then(data => setJobJobSimilarity(typeof data?.similarity === 'number' ? data.similarity : null))
      .catch(err => setCompareError(err.message ?? 'Failed to compare jobs'))
      .finally(() => setComparing(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIds]);

  const selectedJobs = selectedIds
    .map(id => recommended.find(r => r.job.id === id))
    .filter((r): r is RankedJob => Boolean(r));

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">Rec Lab 2</div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Box title="Recommended Jobs" count={recommended.length}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
            <button
              onClick={toggleCompareMode}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${compareMode ? 'var(--green)' : 'var(--border)'}`,
                background: compareMode ? 'var(--green-light)' : 'white',
                color: compareMode ? 'var(--green)' : 'var(--ink-secondary)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              {compareMode ? '✕ Cancel compare' : 'Compare jobs'}
            </button>
          </div>

          {compareMode && (
            <div
              style={{
                marginBottom: 12, padding: '10px 14px', borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--green)', background: 'var(--green-light)',
                fontSize: 12, color: 'var(--green)',
              }}
            >
              {selectedIds.length === 0 && 'Select up to 2 jobs to compare.'}
              {selectedIds.length === 1 && selectedJobs[0] && (
                <span>
                  <strong>{selectedJobs[0].job.title}</strong> — CV match:{' '}
                  <strong>{selectedJobs[0].similarity ?? '—'}%</strong>. Pick one more to compare them to each other.
                </span>
              )}
              {selectedIds.length === 2 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {selectedJobs.map(({ job, similarity }) => (
                    <div key={job.id}>
                      <strong>{job.title}</strong> — CV match: <strong>{similarity ?? '—'}%</strong>
                    </div>
                  ))}
                  <div
                    style={{
                      marginTop: 4, padding: '6px 10px', borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--amber)', background: 'var(--amber-light)',
                      color: 'var(--amber)', display: 'inline-block', width: 'fit-content',
                    }}
                  >
                    {comparing ? 'Comparing…' : compareError ? compareError
                      : <>Similarity to each other: <strong>{jobJobSimilarity ?? '—'}%</strong></>}
                  </div>
                </div>
              )}
            </div>
          )}

          {loading ? (
            <Empty>Loading…</Empty>
          ) : error ? (
            <Empty tone="error">{error}</Empty>
          ) : recommended.length === 0 ? (
            <Empty>No jobs yet.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
              {recommended.map(({ job, similarity }) => {
                const isSelected = compareMode && selectedIds.includes(job.id);
                return (
                  <div
                    key={job.id}
                    onClick={() => compareMode ? toggleSelected(job.id) : onJobSelect?.(job)}
                    style={{
                      border: `1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-sm)',
                      background: isSelected ? 'var(--green-light)' : 'white',
                      padding: '10px 12px',
                      cursor: (compareMode || onJobSelect) ? 'pointer' : 'default',
                      transition: 'box-shadow 0.15s',
                    }}
                    onMouseEnter={e => { if (!isSelected && (compareMode || onJobSelect)) e.currentTarget.style.boxShadow = 'var(--card-shadow)'; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{job.title}</div>
                      {typeof similarity === 'number' && (
                        <span
                          style={{
                            fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                            padding: '2px 8px', borderRadius: 99,
                            background: isSelected ? 'var(--green)' : 'var(--accent-light)',
                            color: isSelected ? 'white' : 'var(--accent)',
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
                );
              })}
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
