import { useState, useEffect, useCallback } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import type {
  RankedJob, JobInteractionRecord, InteractionType, TimelinePoint,
} from '@apcomp/types';
import { useApi } from '../lib/api';

/**
 * Rec Lab — sandbox for the embedding-based recommendation + interaction-
 * scoring system. Lets you see exactly why a job was ranked where it was
 * (CV similarity breakdown + similarity to jobs you've liked before), fire
 * interactions (click/save/apply/more-like-this/ignore/dismiss/less-like-
 * this) and watch the ranking react, and "replay" — edit or remove a past
 * interaction to see how that change ripples through the whole ranking.
 */

const POSITIVE_TYPES: InteractionType[] = ['CLICKED', 'SAVED', 'APPLIED', 'MORE_LIKE_THIS'];
const NEGATIVE_TYPES: InteractionType[] = ['IGNORED', 'DISMISSED', 'LESS_LIKE_THIS'];

const TYPE_LABELS: Record<InteractionType, string> = {
  VIEWED: 'Viewed',
  CLICKED: 'Click',
  SAVED: 'Save',
  APPLIED: 'Apply',
  MORE_LIKE_THIS: 'More like this',
  IGNORED: 'Ignore',
  DISMISSED: 'Dismiss',
  LESS_LIKE_THIS: 'Less like this',
};

function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = value >= 70 ? 'var(--green)' : value >= 40 ? 'var(--amber)' : 'var(--accent)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
      <span style={{ fontSize: 11, color: 'var(--ink-tertiary)', width: 92, flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 99, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${value}%`, background: color, borderRadius: 99 }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--ink-secondary)', width: 32, textAlign: 'right' }}>{value}%</span>
    </div>
  );
}

function InteractionButton({
  type, onClick, active,
}: { type: InteractionType; onClick: () => void; active?: boolean }) {
  const positive = POSITIVE_TYPES.includes(type);
  const negative = NEGATIVE_TYPES.includes(type);
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 11, padding: '5px 10px', borderRadius: 99,
        border: `1px solid ${active ? 'var(--ink)' : 'var(--border)'}`,
        background: active ? 'var(--ink)' : 'white',
        color: active ? 'white' : positive ? 'var(--green)' : negative ? 'var(--accent)' : 'var(--ink-secondary)',
        cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--font-body)',
        transition: 'opacity 0.15s',
      }}
    >
      {TYPE_LABELS[type]}
    </button>
  );
}

function RecLabCard({
  ranked, onInteract, onToggleHistory, historyOpen, history, onReplayType, onReplayDelete,
}: {
  ranked: RankedJob;
  onInteract: (type: InteractionType) => void;
  onToggleHistory: () => void;
  historyOpen: boolean;
  history: JobInteractionRecord[] | undefined;
  onReplayType: (interactionId: string, type: InteractionType) => void;
  onReplayDelete: (interactionId: string) => void;
}) {
  const { job, explanation } = ranked;
  const [showWhy, setShowWhy] = useState(false);

  return (
    <div style={{
      background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      padding: 18, boxShadow: 'var(--card-shadow)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontSize: 15, fontWeight: 600,
              color: 'var(--ink)', letterSpacing: '-0.01em',
            }}>
              {job.title}
            </span>
            {explanation.novelty && (
              <span style={{
                fontSize: 10, padding: '2px 7px', borderRadius: 99,
                background: 'var(--amber-light)', color: 'var(--amber)', fontWeight: 500,
              }}>
                Novelty pick
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>{job.company}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 700, color: 'var(--ink)' }}>
            {explanation.finalScore}
          </div>
          <div style={{ fontSize: 10, color: 'var(--ink-tertiary)' }}>final score</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, marginBottom: 12 }}>
        {[...POSITIVE_TYPES, ...NEGATIVE_TYPES].map(type => (
          <InteractionButton key={type} type={type} onClick={() => onInteract(type)} />
        ))}
      </div>

      <div style={{ display: 'flex', gap: 16, fontSize: 12 }}>
        <button
          onClick={() => setShowWhy(o => !o)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--accent)', fontSize: 12, fontFamily: 'var(--font-body)',
          }}
        >
          {showWhy ? '▾' : '▸'} Why this job?
        </button>
        <button
          onClick={onToggleHistory}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            color: 'var(--ink-tertiary)', fontSize: 12, fontFamily: 'var(--font-body)',
          }}
        >
          {historyOpen ? '▾' : '▸'} Interaction history ({explanation.interactionCount})
        </button>
      </div>

      {showWhy && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
            CV similarity — {explanation.cvSimilarity.combined}%
          </div>
          <ScoreBar label="Titles" value={explanation.cvSimilarity.title} />
          <ScoreBar label="Descriptions + skills" value={explanation.cvSimilarity.description} />

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>
            Similarity to jobs you've liked
          </div>
          <ScoreBar label="Best match" value={explanation.similarityToLikedJobs} />
          {explanation.mostSimilarLikedJob ? (
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
              Most similar to <strong>{explanation.mostSimilarLikedJob.title}</strong>
              {explanation.mostSimilarLikedJob.company ? ` at ${explanation.mostSimilarLikedJob.company}` : ''}
              {' '}({explanation.mostSimilarLikedJob.similarity}%)
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>No liked jobs to compare against yet.</div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>
            Similarity to jobs you said "less like this" to
          </div>
          <ScoreBar label="Best match" value={explanation.similarityToDislikedJobs} />
          {explanation.mostSimilarDislikedJob ? (
            <div style={{ fontSize: 12, color: 'var(--ink-secondary)' }}>
              Most similar to <strong>{explanation.mostSimilarDislikedJob.title}</strong>
              {explanation.mostSimilarDislikedJob.company ? ` at ${explanation.mostSimilarDislikedJob.company}` : ''}
              {' '}({explanation.mostSimilarDislikedJob.similarity}%)
              {explanation.similarityToDislikedJobs > 0 && (
                // 0.4 mirrors DISLIKE_PENALTY_WEIGHT in apps/api's scoring.ts — update both if that's retuned.
                <span style={{ color: 'var(--accent)' }}>
                  {' '}— docking {Math.round(explanation.similarityToDislikedJobs * 0.4)} pts
                </span>
              )}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>No "less like this" jobs to compare against yet.</div>
          )}

          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '14px 0 8px' }}>
            Interaction score
          </div>
          <ScoreBar label="Normalized" value={explanation.interactionScore} />
          <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>
            Raw: {explanation.interactionScoreRaw.toFixed(2)} across {explanation.interactionCount} interaction{explanation.interactionCount === 1 ? '' : 's'}
          </div>
        </div>
      )}

      {historyOpen && (
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
          {!history?.length && (
            <div style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>No interactions logged for this job yet.</div>
          )}
          {history?.map(h => (
            <div key={h.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0',
              borderBottom: '1px solid var(--border)', fontSize: 12,
            }}>
              <select
                value={h.type}
                onChange={e => onReplayType(h.id, e.target.value as InteractionType)}
                style={{
                  fontSize: 11, padding: '3px 6px', borderRadius: 6,
                  border: '1px solid var(--border)', fontFamily: 'var(--font-body)',
                  color: 'var(--ink)', background: 'white',
                }}
              >
                {[...POSITIVE_TYPES, ...NEGATIVE_TYPES, 'VIEWED'].map(t => (
                  <option key={t} value={t}>{TYPE_LABELS[t as InteractionType]}</option>
                ))}
              </select>
              <span style={{ color: 'var(--ink-tertiary)', flex: 1 }}>
                weight {h.weight > 0 ? '+' : ''}{h.weight} · {new Date(h.createdAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
              <button
                onClick={() => onReplayDelete(h.id)}
                title="Remove this interaction"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-tertiary)', fontSize: 14, padding: 0 }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RecLabPage() {
  const api = useApi();
  const [ranked, setRanked] = useState<RankedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [decay, setDecay] = useState(true);
  const [noveltyRate, setNoveltyRate] = useState(20);
  const [limit, setLimit] = useState(20);

  const [openHistoryFor, setOpenHistoryFor] = useState<string | null>(null);
  const [historyByJob, setHistoryByJob] = useState<Record<string, JobInteractionRecord[]>>({});

  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);

  // Optional manual test set — job_catalog.id values (raw, e.g. from a
  // "SELECT id, title FROM job_catalog WHERE ..." query), not the composite
  // "openjobdata-<id>" Job.id. Empty = fall back to the live recommended-jobs
  // feed, same as before.
  const [testSetInput, setTestSetInput] = useState('');

  const fetchRank = useCallback(() => {
    setLoading(true);
    setError(null);
    const catalogJobIds = testSetInput.split(/[\s,]+/).map(s => s.trim()).filter(Boolean);
    api.post('/rec-lab/rank', {
      limit, noveltyRate: noveltyRate / 100, decay,
      ...(catalogJobIds.length ? { catalogJobIds } : {}),
    })
      .then(r => {
        if (!r.ok) throw new Error(`Rank request failed (${r.status})`);
        return r.json();
      })
      .then(data => setRanked(Array.isArray(data) ? data : []))
      .catch(err => setError(err.message ?? 'Failed to rank jobs'))
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit, noveltyRate, decay, testSetInput]);

  const fetchTimeline = useCallback(() => {
    api.get('/rec-lab/timeline')
      .then(r => r.json())
      .then(data => setTimeline(Array.isArray(data) ? data : []))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { fetchRank(); fetchTimeline(); }, [fetchRank, fetchTimeline]);

  const loadHistory = useCallback((jobId: string) => {
    api.get(`/rec-lab/interactions?jobId=${encodeURIComponent(jobId)}`)
      .then(r => r.json())
      .then(data => setHistoryByJob(prev => ({ ...prev, [jobId]: Array.isArray(data) ? data : [] })))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleToggleHistory = (jobId: string) => {
    const opening = openHistoryFor !== jobId;
    setOpenHistoryFor(opening ? jobId : null);
    if (opening) loadHistory(jobId);
  };

  const handleInteract = (rankedJob: RankedJob, type: InteractionType) => {
    const { job } = rankedJob;
    api.post('/rec-lab/interactions', {
      jobId: job.id,
      source: job.source,
      externalId: job.externalId,
      jobTitle: job.title,
      jobCompany: job.company,
      type,
      context: 'RECOMMENDED',
    })
      .then(() => {
        fetchRank();
        fetchTimeline();
        if (openHistoryFor === job.id) loadHistory(job.id);
      })
      .catch(err => setError(err.message ?? 'Failed to log interaction'));
  };

  const handleReplayType = (jobId: string, interactionId: string, type: InteractionType) => {
    api.patch(`/rec-lab/interactions/${interactionId}`, { type })
      .then(() => { fetchRank(); fetchTimeline(); loadHistory(jobId); })
      .catch(err => setError(err.message ?? 'Failed to replay interaction'));
  };

  const handleReplayDelete = (jobId: string, interactionId: string) => {
    api.del(`/rec-lab/interactions/${interactionId}`)
      .then(() => { fetchRank(); fetchTimeline(); loadHistory(jobId); })
      .catch(err => setError(err.message ?? 'Failed to remove interaction'));
  };

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <div style={{
          fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 700,
          letterSpacing: '-0.02em', color: 'var(--ink)',
        }}>
          Rec Lab
        </div>
        <div style={{ fontSize: 13, color: 'var(--ink-tertiary)', marginTop: 4, maxWidth: 640 }}>
          A sandbox for the embedding-based recommendation engine. Fire interactions, replay or remove
          past ones, and watch the CV-similarity, liked-job-similarity, and interaction scores shift.
        </div>
      </div>

      <div style={{
        display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap',
        margin: '20px 0 28px', padding: '14px 18px', background: 'var(--surface-2)',
        border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13,
      }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={decay} onChange={e => setDecay(e.target.checked)} />
          Time-decay old interactions
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Novelty rate
          <input
            type="number" min={0} max={100} value={noveltyRate}
            onChange={e => setNoveltyRate(Math.max(0, Math.min(100, Number(e.target.value))))}
            style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)' }}
          />%
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Result count
          <input
            type="number" min={1} max={100} value={limit}
            onChange={e => setLimit(Math.max(1, Math.min(100, Number(e.target.value))))}
            style={{ width: 52, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--border)' }}
          />
        </label>
        <button
          onClick={fetchRank}
          style={{
            fontSize: 12, padding: '6px 14px', borderRadius: 8, background: 'var(--ink)',
            color: 'white', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)',
          }}
        >
          Re-rank
        </button>
        {loading && <span style={{ fontSize: 12, color: 'var(--ink-tertiary)' }}>Ranking…</span>}

        <label style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%' }}>
          Test set (job_catalog IDs, comma/space/newline separated — empty = live recommended jobs)
          <textarea
            value={testSetInput}
            onChange={e => setTestSetInput(e.target.value)}
            placeholder="e.g. 4858917101, 4858917102, 4858917103"
            rows={2}
            style={{
              flex: 1, fontSize: 12, padding: '6px 8px', borderRadius: 6,
              border: '1px solid var(--border)', fontFamily: 'var(--font-body)', resize: 'vertical',
            }}
          />
        </label>
      </div>

      {error && (
        <div style={{ fontSize: 13, color: 'var(--accent)', marginBottom: 16 }}>{error}</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
        {!loading && ranked.length === 0 && (
          <div style={{ fontSize: 13, color: 'var(--ink-tertiary)', padding: '20px 0' }}>
            No jobs to rank yet — upload a CV or refresh recommendations first.
          </div>
        )}
        {ranked.map(r => (
          <RecLabCard
            key={r.job.id}
            ranked={r}
            onInteract={type => handleInteract(r, type)}
            onToggleHistory={() => handleToggleHistory(r.job.id)}
            historyOpen={openHistoryFor === r.job.id}
            history={historyByJob[r.job.id]}
            onReplayType={(interactionId, type) => handleReplayType(r.job.id, interactionId, type)}
            onReplayDelete={interactionId => handleReplayDelete(r.job.id, interactionId)}
          />
        ))}
      </div>

      <div className="section">
        <div className="section-header">
          <div className="section-title">Saved &amp; liked jobs over time</div>
        </div>
        <div style={{
          background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          padding: 20, height: 260,
        }}>
          {timeline.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--ink-tertiary)', textAlign: 'center', paddingTop: 90 }}>
              No saved, applied, or "more like this" interactions logged yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={timeline} margin={{ top: 10, right: 20, bottom: 0, left: -20 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: 'var(--ink-tertiary)' }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--ink-tertiary)' }} />
                <Tooltip
                  contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--border)' }}
                />
                <Line type="monotone" dataKey="count" name="liked jobs" stroke="var(--accent)" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
