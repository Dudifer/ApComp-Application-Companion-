import { useState, useEffect, useCallback, useRef } from 'react';
import type { ReactNode, MouseEvent } from 'react';
import type { Job } from '@apcomp/types';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';
import { useApi, getCachedToken, BASE_URL } from '../lib/api';

/** Mirrors the API's RecLab2RankedJob — a job plus its cosine-similarity match to the CV, 0-100 (or null with no CV / no job embedding yet). */
interface RankedJob {
  job: Job;
  similarity: number | null;
}

/** Mirrors the API's RecLab2InteractionRecord. */
interface InteractionRecord {
  id: string;
  jobId: string;
  jobTitle: string;
  jobCompany?: string;
  type: string;
  weight: number;
  createdAt: string;
}

/** Mirrors the API's PropagatedContribution — one neighbor job's interaction spilling a fraction of its score onto this job. */
interface PropagatedContribution {
  fromJobId: string;
  fromJobTitle: string;
  fromJobCompany?: string;
  type: string;
  similarity: number;
  amount: number;
  createdAt: string;
}

/** Mirrors the API's RecLab2JobHistory. */
interface JobHistory {
  jobId: string;
  jobTitle: string;
  jobCompany?: string;
  score: number;
  directScore: number;
  propagatedScore: number;
  propagatedFrom: PropagatedContribution[];
  interactionCount: number;
  recentInteractions: InteractionRecord[];
}

/** Mirrors the API's RecLab2EmbeddingPoint — a job (or the CV) plus its 2-d position under all three reduction methods. */
interface EmbeddingPoint {
  jobId: string;
  title: string;
  company: string;
  category: 'software' | 'retail' | 'cv';
  pca: [number, number];
  umap: [number, number];
  tsne: [number, number];
}

/** Mirrors the API's RecLab2SessionSummary — one ended interaction session's headline metrics, for the Metrics screen's graphs. */
interface SessionSummary {
  id: string;
  sessionNumber: number;
  startedAt: string;
  endedAt: string;
  avgTopFiveScoreChange: number | null;
  firstPositivePosition: number | null;
  mostInteractedPosition: number | null;
}

const REDUCTION_METHODS = [
  { key: 'pca', label: 'PCA' },
  { key: 'umap', label: 'UMAP' },
  { key: 'tsne', label: 't-SNE' },
] as const;

/** Mirrors the API's high/low score-bucket split (score > 10 / < -10) — jobs in between are excluded as noise for a "does the embedding space separate my likes from my dislikes" plot. */
const SCORE_BUCKETS = [
  { key: 'high', label: 'High score (>10)' },
  { key: 'low', label: 'Low score (<-10)' },
] as const;

const CATEGORY_STYLE: Record<EmbeddingPoint['category'], { label: string; color: string }> = {
  software: { label: 'Software', color: 'var(--blue)' },
  retail: { label: 'Retail', color: 'var(--amber)' },
  cv: { label: 'Your CV', color: 'var(--green)' },
};

// SAVED and DISMISSED double as which box a job sits in (Saved Jobs /
// Dismissed Jobs / Recommended Jobs) — a job shouldn't be in both boxes at
// once, so turning one on locally clears the other's toggle state too,
// mirroring what the backend does server-side (see rec-lab2.service.ts's
// clearOpposingToggle).
const OPPOSITE_TOGGLE: Record<string, string> = { SAVED: 'DISMISSED', DISMISSED: 'SAVED' };
const TOGGLE_TYPES = ['MORE_LIKE_THIS', 'LESS_LIKE_THIS', 'SAVED', 'DISMISSED'];

const INTERACTION_LABELS: Record<string, string> = {
  VIEWED: 'Viewed',
  CLICKED: 'Clicked',
  SAVED: 'Saved',
  APPLIED: 'Applied',
  MORE_LIKE_THIS: 'More like this',
  IGNORED: 'Ignored',
  DISMISSED: 'Dismissed',
  LESS_LIKE_THIS: 'Less like this',
};

/**
 * Rec Lab 2 — clean rebuild of the Rec Lab sandbox. Three boxes: recommended
 * / saved / dismissed jobs. All three are the same underlying job list from
 * GET /rec-lab2/recommended (which reads the test-dataset.ts jobs and scores
 * + (once per CV upload) sorts them by similarity to the user's CV embedding
 * — see RecLab2Service.getRecommendedJobs) split by each job's current
 * SAVED/DISMISSED toggle state (see jobBoxOf below) — there's no separate
 * "saved jobs" or "dismissed jobs" endpoint, a job just moves boxes when its
 * toggle state changes. SAVED and DISMISSED are mutually exclusive (saving a
 * dismissed job un-dismisses it, and vice versa — enforced both here and in
 * rec-lab2.service.ts), so every job is in exactly one box at a time.
 *
 * Clicking a job hands it up to onJobSelect — App.tsx wires this to the
 * same selectedJob state that renders the app-wide JobDetailPanel, so
 * clicking a job here opens the exact same description/apply-url/save/
 * dismiss panel every other job list in the app uses, instead of a
 * duplicate one-off implementation.
 *
 * Interaction tracking (👍/👎/♡/✕ on each row, plus an automatic "viewed"
 * when a row is opened) logs to Rec Lab 2's own isolated interaction table
 * (see RecLab2Service) — deliberately not the original Rec Lab's, so
 * nothing here affects the live app's dismissed/saved jobs, and nothing
 * here reorders the Recommended list (yet).
 */
export default function RecLab2Page({ onJobSelect }: { onJobSelect?: (job: Job) => void }) {
  const api = useApi();
  const [recommended, setRecommended] = useState<RankedJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Interaction sessions ─────────────────────────────────────────────────
  // A session spans from the first click/scroll in the Recommended Jobs box
  // until the user navigates away, refreshes/closes the tab, or hits
  // "Refresh box". sessionIdRef mirrors sessionId state so unload/unmount
  // handlers (which can't rely on a fresh render) always see the current id.
  const [sessionId, setSessionId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const setSession = (id: string | null) => { sessionIdRef.current = id; setSessionId(id); };

  // Starts a session on first focus into the Recommended box (click or
  // scroll) — a no-op if one's already running. Best-effort: if it hasn't
  // resolved yet, the interaction that triggered it just goes unattributed
  // to a session rather than blocking the click.
  const ensureSession = useCallback(() => {
    if (sessionIdRef.current) return;
    api.post('/rec-lab2/sessions/start')
      .then(r => { if (!r.ok) throw new Error(`Failed to start session (${r.status})`); return r.json(); })
      .then(data => setSession(data.id))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Ends the in-progress session, if any. `keepalive` is used from unload/
  // unmount paths, where the normal fetch (via useApi's async getToken)
  // can't be trusted to finish before the page actually goes away — see
  // getCachedToken's comment in lib/api.ts.
  const endSession = useCallback((keepalive = false) => {
    const id = sessionIdRef.current;
    if (!id) return;
    setSession(null);
    if (keepalive) {
      const token = getCachedToken();
      fetch(`${BASE_URL}/rec-lab2/sessions/${id}/end`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        keepalive: true,
      }).catch(() => {});
    } else {
      api.post(`/rec-lab2/sessions/${id}/end`).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cover both a hard page unload/refresh (beforeunload/pagehide) and a
  // plain SPA navigation away from this page (the cleanup function below).
  useEffect(() => {
    const handleUnload = () => endSession(true);
    window.addEventListener('beforeunload', handleUnload);
    window.addEventListener('pagehide', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      window.removeEventListener('pagehide', handleUnload);
      endSession(true);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ── Interaction tracking ─────────────────────────────────────────────────
  // Row buttons (👍/👎/♡/✕) toggle: the first click logs an interaction and
  // highlights the button; clicking again deletes that same interaction and
  // un-highlights it. Keyed by `${jobId}:${type}` -> the created
  // interaction's id, so a click always knows whether it's turning a signal
  // on or off, instead of stacking up a new row every time someone clicks
  // (or double-clicks) the same button.
  const [activeInteractions, setActiveInteractions] = useState<Record<string, string>>({});

  // On load, the row buttons should reflect whatever's actually still in the
  // DB — otherwise every refresh resets every button to "off" even though
  // the interaction it represents is still logged (and still counted in the
  // history/score). GET /rec-lab2/interactions/active returns exactly the
  // toggle-eligible rows (MORE_LIKE_THIS/LESS_LIKE_THIS/SAVED/DISMISSED)
  // that are still present, which is exactly what "this button is on" means.
  useEffect(() => {
    api.get('/rec-lab2/interactions/active')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load active interactions (${r.status})`);
        return r.json();
      })
      .then((rows: { id: string; jobId: string; type: string }[]) => {
        if (!Array.isArray(rows)) return;
        setActiveInteractions(prev => {
          const next = { ...prev };
          for (const row of rows) next[`${row.jobId}:${row.type}`] = row.id;
          return next;
        });
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marks `type` active for `jobId` (used right after logging/editing an
  // interaction into that type) and — for SAVED/DISMISSED specifically —
  // drops whichever key represents the opposite box, since the backend just
  // deleted that opposing row too (see clearOpposingToggle).
  const setActiveToggle = (jobId: string, type: string, interactionId: string) => {
    setActiveInteractions(prev => {
      const next = { ...prev, [`${jobId}:${type}`]: interactionId };
      const opposite = OPPOSITE_TOGGLE[type];
      if (opposite) delete next[`${jobId}:${opposite}`];
      return next;
    });
  };

  const toggleInteraction = useCallback((job: Job, type: string) => {
    ensureSession();
    const key = `${job.id}:${type}`;
    const existingId = activeInteractions[key];
    if (existingId) {
      api.del(`/rec-lab2/interactions/${existingId}`)
        .then(() => setActiveInteractions(prev => {
          const next = { ...prev };
          delete next[key];
          return next;
        }))
        .catch(() => {});
      return;
    }
    api.post('/rec-lab2/interactions', {
      jobId: job.id, jobTitle: job.title, jobCompany: job.company, type,
      sessionId: sessionIdRef.current ?? undefined,
    })
      .then(r => r.json())
      .then(record => setActiveToggle(job.id, type, record.id))
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeInteractions]);

  // Opening a job's detail panel isn't a toggle — just a plain log each time.
  const logViewed = useCallback((job: Job) => {
    api.post('/rec-lab2/interactions', {
      jobId: job.id, jobTitle: job.title, jobCompany: job.company, type: 'VIEWED',
      sessionId: sessionIdRef.current ?? undefined,
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRowClick = (job: Job) => {
    ensureSession();
    if (compareMode) { toggleSelected(job.id); return; }
    logViewed(job);
    onJobSelect?.(job);
  };

  // ── Interaction history view — replaces the 3 boxes when toggled on ──────
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<JobHistory[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const fetchHistory = useCallback(() => {
    setHistoryLoading(true);
    setHistoryError(null);
    api.get('/rec-lab2/interactions/history')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load interaction history (${r.status})`);
        return r.json();
      })
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(err => setHistoryError(err.message ?? 'Failed to load interaction history'))
      .finally(() => setHistoryLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleHistory = () => {
    setShowHistory(prev => {
      const next = !prev;
      if (next) { setShowEmbeddingsPlot(false); setShowMetrics(false); fetchHistory(); } // sub-pages are mutually exclusive
      return next;
    });
  };

  // ── Embeddings plot — replaces the 3 boxes with a scatter of every
  // embedded job's (and the CV's) composite embedding, squashed from 384
  // dims down to 2 via whichever of PCA/UMAP/t-SNE is selected (see the
  // API's embedding-reduction.ts for why all three are offered). The server
  // computes all three up front so switching methods is just a re-render,
  // no re-fetch.
  const [showEmbeddingsPlot, setShowEmbeddingsPlot] = useState(false);
  const [embeddingBuckets, setEmbeddingBuckets] = useState<{ high: EmbeddingPoint[]; low: EmbeddingPoint[] }>({ high: [], low: [] });
  const [embeddingsLoading, setEmbeddingsLoading] = useState(false);
  const [embeddingsError, setEmbeddingsError] = useState<string | null>(null);
  const [reductionMethod, setReductionMethod] = useState<'pca' | 'umap' | 'tsne'>('pca');
  const [scoreBucket, setScoreBucket] = useState<'high' | 'low'>('high');

  const fetchEmbeddingsPlot = useCallback(() => {
    setEmbeddingsLoading(true);
    setEmbeddingsError(null);
    api.get('/rec-lab2/embeddings-plot')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load embeddings plot (${r.status})`);
        return r.json();
      })
      .then(data => setEmbeddingBuckets({
        high: Array.isArray(data?.high) ? data.high : [],
        low: Array.isArray(data?.low) ? data.low : [],
      }))
      .catch(err => setEmbeddingsError(err.message ?? 'Failed to load embeddings plot'))
      .finally(() => setEmbeddingsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleEmbeddingsPlot = () => {
    setShowEmbeddingsPlot(prev => {
      const next = !prev;
      if (next) { setShowHistory(false); setShowMetrics(false); fetchEmbeddingsPlot(); } // sub-pages are mutually exclusive
      return next;
    });
  };

  // If the interaction being edited/deleted here is also the one a row
  // button's toggle-state points to (activeInteractions), drop it — otherwise
  // that button would keep showing "on" for an interaction that no longer
  // exists (deleted) or no longer means what the button represents (edited).
  const clearStaleToggleState = (interactionId: string) => {
    setActiveInteractions(prev => {
      const entry = Object.entries(prev).find(([, id]) => id === interactionId);
      if (!entry) return prev;
      const next = { ...prev };
      delete next[entry[0]];
      return next;
    });
  };

  const handleEditInteraction = (interactionId: string, jobId: string, newType: string) => {
    api.patch(`/rec-lab2/interactions/${interactionId}`, { type: newType })
      .then(r => { if (!r.ok) throw new Error(`Failed to update interaction (${r.status})`); })
      .then(() => {
        // Drop whatever key used to point at this interaction (its old
        // type), then — if it landed on a toggle-eligible type — mark it
        // active under the new one. This is what makes a job relocate
        // between the Recommended/Saved/Dismissed boxes when you retype an
        // interaction from the history screen, not just when clicking a row
        // button directly.
        clearStaleToggleState(interactionId);
        if (TOGGLE_TYPES.includes(newType)) setActiveToggle(jobId, newType, interactionId);
        fetchHistory();
      })
      .catch(err => alert(err.message ?? 'Failed to update interaction'));
  };

  const handleDeleteInteraction = (interactionId: string) => {
    api.del(`/rec-lab2/interactions/${interactionId}`)
      .then(r => { if (!r.ok) throw new Error(`Failed to delete interaction (${r.status})`); })
      .then(() => { clearStaleToggleState(interactionId); fetchHistory(); })
      .catch(err => alert(err.message ?? 'Failed to delete interaction'));
  };

  const handleResetScores = () => {
    if (!window.confirm('Clear all Rec Lab 2 interaction history? This can\'t be undone.')) return;
    api.post('/rec-lab2/interactions/reset', {})
      .then(() => {
        setHistory([]);
        setActiveInteractions({}); // reset wipes every row's DB interactions, so no button should still show as toggled on
        if (showHistory) fetchHistory();
      })
      .catch(err => alert(err.message ?? 'Failed to reset interaction history'));
  };

  // ── Metrics screen — session-over-session graphs ─────────────────────────
  const [showMetrics, setShowMetrics] = useState(false);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  const fetchSessions = useCallback(() => {
    setSessionsLoading(true);
    setSessionsError(null);
    api.get('/rec-lab2/sessions')
      .then(r => {
        if (!r.ok) throw new Error(`Failed to load session metrics (${r.status})`);
        return r.json();
      })
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(err => setSessionsError(err.message ?? 'Failed to load session metrics'))
      .finally(() => setSessionsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleMetrics = () => {
    setShowMetrics(prev => {
      const next = !prev;
      if (next) { setShowHistory(false); setShowEmbeddingsPlot(false); fetchSessions(); } // sub-pages are mutually exclusive
      return next;
    });
  };

  // "Refresh box" — ends the in-progress session (so it gets scored and
  // shows up on the Metrics screen), re-fetches the ranking (picking up any
  // score changes from this session's interactions), and clears sessionId so
  // the next click/scroll starts a fresh session.
  const handleRefreshBox = () => {
    endSession(false);
    fetchRecommended();
  };

  const activeEmbeddingPoints = embeddingBuckets[scoreBucket];

  // Which box a job belongs in is derived straight from its SAVED/DISMISSED
  // toggle state — not a separate flag anywhere — so it's automatically
  // correct (and automatically persists across reload) for however that
  // state got set: a row-button click, a history-screen edit, or a reset.
  const jobBoxOf = (jobId: string): 'saved' | 'dismissed' | 'recommended' => {
    if (activeInteractions[`${jobId}:DISMISSED`]) return 'dismissed';
    if (activeInteractions[`${jobId}:SAVED`]) return 'saved';
    return 'recommended';
  };
  const recommendedList = recommended.filter(r => jobBoxOf(r.job.id) === 'recommended');
  const savedList = recommended.filter(r => jobBoxOf(r.job.id) === 'saved');
  const dismissedList = recommended.filter(r => jobBoxOf(r.job.id) === 'dismissed');

  const renderJobRow = ({ job, similarity }: RankedJob) => (
    <JobRow
      key={job.id}
      job={job}
      similarity={similarity}
      compareMode={compareMode}
      isSelected={compareMode && selectedIds.includes(job.id)}
      clickable={compareMode || Boolean(onJobSelect)}
      activeInteractions={activeInteractions}
      onRowClick={handleRowClick}
      onToggleInteraction={toggleInteraction}
    />
  );

  return (
    <div className="section">
      <div className="section-header">
        <div className="section-title">Rec Lab 2</div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={toggleHistory}
            style={{
              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${showHistory ? 'var(--blue)' : 'var(--border)'}`,
              background: showHistory ? 'var(--blue-light)' : 'white',
              color: showHistory ? 'var(--blue)' : 'var(--ink-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            {showHistory ? '✕ Close history' : 'View interaction history'}
          </button>
          <button
            onClick={toggleMetrics}
            style={{
              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
              border: `1px solid ${showMetrics ? 'var(--blue)' : 'var(--border)'}`,
              background: showMetrics ? 'var(--blue-light)' : 'white',
              color: showMetrics ? 'var(--blue)' : 'var(--ink-secondary)',
              cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            {showMetrics ? '✕ Close metrics' : 'Metrics'}
          </button>
          <button
            onClick={handleResetScores}
            style={{
              fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
              border: '1px solid var(--border)', background: 'white',
              color: 'var(--ink-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)',
            }}
          >
            Reset scores
          </button>
        </div>

        {!showHistory && !showMetrics && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleRefreshBox}
              title="Ends the current interaction session (scoring it for the Metrics screen) and re-checks rankings"
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
                border: '1px solid var(--border)', background: 'white',
                color: 'var(--ink-secondary)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              ↻ Refresh box
            </button>
            <button
              onClick={toggleEmbeddingsPlot}
              style={{
                fontSize: 12, fontWeight: 500, padding: '6px 12px', borderRadius: 999,
                border: `1px solid ${showEmbeddingsPlot ? 'var(--accent)' : 'var(--border)'}`,
                background: showEmbeddingsPlot ? 'var(--accent-light)' : 'white',
                color: showEmbeddingsPlot ? 'var(--accent)' : 'var(--ink-secondary)',
                cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}
            >
              {showEmbeddingsPlot ? '✕ Close plot' : 'Plot embeddings'}
            </button>
            {!showEmbeddingsPlot && (
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
            )}
          </div>
        )}
      </div>

      {showHistory ? (
        <Box title="Interaction History" count={history.length}>
          {historyLoading ? (
            <Empty>Loading…</Empty>
          ) : historyError ? (
            <Empty tone="error">{historyError}</Empty>
          ) : history.length === 0 ? (
            <Empty>No interactions logged yet — click into jobs, or use the 👍/👎/♡/✕ buttons on a job row.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map(job => (
                <div
                  key={job.jobId}
                  style={{
                    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                    background: 'white', padding: '12px 14px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{job.jobTitle}</div>
                      {job.jobCompany && <div style={{ fontSize: 12, color: 'var(--ink-tertiary)', marginTop: 2 }}>{job.jobCompany}</div>}
                    </div>
                    <span
                      style={{
                        fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
                        padding: '2px 8px', borderRadius: 99,
                        background: job.score >= 0 ? 'var(--green-light)' : '#fef2f2',
                        color: job.score >= 0 ? 'var(--green)' : '#991b1b',
                      }}
                    >
                      score: {job.score.toFixed(1)}
                    </span>
                  </div>
                  {Math.abs(job.propagatedScore) >= 0.01 && (
                    <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 4 }}>
                      direct {job.directScore.toFixed(1)} · propagated {job.propagatedScore >= 0 ? '+' : ''}{job.propagatedScore.toFixed(1)}
                    </div>
                  )}
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {job.recentInteractions.map(i => (
                      <div key={i.id} style={{ fontSize: 12, color: 'var(--ink-secondary)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                        <select
                          value={i.type}
                          onChange={e => handleEditInteraction(i.id, i.jobId, e.target.value)}
                          style={{
                            fontSize: 12, fontFamily: 'var(--font-body)', color: 'var(--ink-secondary)',
                            border: '1px solid var(--border)', borderRadius: 6, padding: '2px 4px',
                            background: 'white', cursor: 'pointer',
                          }}
                        >
                          {Object.entries(INTERACTION_LABELS).map(([type, label]) => (
                            <option key={type} value={type}>{label}</option>
                          ))}
                        </select>
                        <span style={{ color: 'var(--ink-tertiary)', whiteSpace: 'nowrap' }}>({i.weight > 0 ? '+' : ''}{i.weight})</span>
                        <span style={{ color: 'var(--ink-tertiary)', flex: 1, textAlign: 'right' }}>{new Date(i.createdAt).toLocaleString()}</span>
                        <button
                          title="Delete this interaction"
                          onClick={() => handleDeleteInteraction(i.id)}
                          style={{
                            fontSize: 11, padding: '2px 7px', borderRadius: 6,
                            border: '1px solid var(--border)', background: 'white',
                            color: '#991b1b', cursor: 'pointer', lineHeight: 1.4,
                          }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  {job.propagatedFrom.length > 0 && (
                    <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink-tertiary)', marginBottom: 6 }}>
                        Propagated from similar jobs
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {job.propagatedFrom
                          .slice()
                          .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))
                          .map((p, idx) => (
                            <div
                              key={`${p.fromJobId}-${idx}`}
                              style={{ fontSize: 11, color: 'var(--ink-tertiary)', display: 'flex', justifyContent: 'space-between', gap: 8 }}
                            >
                              <span>
                                {p.amount >= 0 ? '+' : ''}{p.amount.toFixed(2)} — {INTERACTION_LABELS[p.type] ?? p.type} on "{p.fromJobTitle}"
                                {p.fromJobCompany ? ` (${p.fromJobCompany})` : ''}
                              </span>
                              <span style={{ whiteSpace: 'nowrap' }}>{p.similarity}% similar</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Box>
      ) : showEmbeddingsPlot ? (
        <Box title="Embeddings Plot" count={activeEmbeddingPoints.length}>
          {embeddingsLoading ? (
            <Empty>Loading…</Empty>
          ) : embeddingsError ? (
            <Empty tone="error">{embeddingsError}</Empty>
          ) : (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  {REDUCTION_METHODS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setReductionMethod(key)}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 999,
                        border: `1px solid ${reductionMethod === key ? 'var(--accent)' : 'var(--border)'}`,
                        background: reductionMethod === key ? 'var(--accent-light)' : 'white',
                        color: reductionMethod === key ? 'var(--accent)' : 'var(--ink-secondary)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {SCORE_BUCKETS.map(({ key, label }) => (
                    <button
                      key={key}
                      onClick={() => setScoreBucket(key)}
                      style={{
                        fontSize: 12, fontWeight: 500, padding: '5px 11px', borderRadius: 999,
                        border: `1px solid ${scoreBucket === key ? 'var(--blue)' : 'var(--border)'}`,
                        background: scoreBucket === key ? 'var(--blue-light)' : 'white',
                        color: scoreBucket === key ? 'var(--blue)' : 'var(--ink-secondary)',
                        cursor: 'pointer', fontFamily: 'var(--font-body)',
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              {activeEmbeddingPoints.length === 0 ? (
                <Empty>
                  {scoreBucket === 'high'
                    ? 'No jobs scored above 10 yet — save/react to jobs to build up a score.'
                    : 'No jobs scored below -10 yet — dismiss/react negatively to jobs to build up a score.'}
                </Empty>
              ) : (
              <div style={{ width: '100%', height: 440 }}>
                <ResponsiveContainer>
                  <ScatterChart margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis type="number" dataKey="x" tick={{ fontSize: 11 }} stroke="var(--ink-tertiary)" />
                    <YAxis type="number" dataKey="y" tick={{ fontSize: 11 }} stroke="var(--ink-tertiary)" />
                    <Tooltip content={<EmbeddingTooltip />} cursor={{ strokeDasharray: '3 3' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {(Object.keys(CATEGORY_STYLE) as EmbeddingPoint['category'][]).map(category => (
                      <Scatter
                        key={category}
                        name={CATEGORY_STYLE[category].label}
                        data={activeEmbeddingPoints
                          .filter(p => p.category === category)
                          .map(p => ({ x: p[reductionMethod][0], y: p[reductionMethod][1], title: p.title, company: p.company }))}
                        fill={CATEGORY_STYLE[category].color}
                      />
                    ))}
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
              )}
            </>
          )}
        </Box>
      ) : showMetrics ? (
        <Box title="Session Metrics" count={sessions.length}>
          {sessionsLoading ? (
            <Empty>Loading…</Empty>
          ) : sessionsError ? (
            <Empty tone="error">{sessionsError}</Empty>
          ) : sessions.length === 0 ? (
            <Empty>No completed sessions yet — click or scroll in Recommended Jobs, then hit "Refresh box" (or navigate away) to close out a session.</Empty>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <MetricChart
                title="Top-5 Recommendation Score Lift"
                subtitle="Avg. score change across the first 5 recommended jobs, start to end of session"
                data={sessions.map(s => ({ sessionNumber: s.sessionNumber, value: s.avgTopFiveScoreChange }))}
                color="var(--blue)"
              />
              <MetricChart
                title="First Positive-Signal Position"
                subtitle="Rank of the earliest job in the session with a positive interaction"
                data={sessions.map(s => ({ sessionNumber: s.sessionNumber, value: s.firstPositivePosition }))}
                color="var(--green)"
                reversed
              />
              <MetricChart
                title="Most-Engaged Job Position"
                subtitle="Rank of the job with the most interactions during the session"
                data={sessions.map(s => ({ sessionNumber: s.sessionNumber, value: s.mostInteractedPosition }))}
                color="var(--accent)"
                reversed
              />
            </div>
          )}
        </Box>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Box title="Recommended Jobs" count={recommendedList.length}>
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
            ) : recommendedList.length === 0 ? (
              <Empty>No jobs yet.</Empty>
            ) : (
              <div
                onScroll={ensureSession}
                style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}
              >
                {recommendedList.map(renderJobRow)}
              </div>
            )}
          </Box>

          <Box title="Saved Jobs" count={savedList.length}>
            {savedList.length === 0 ? (
              <Empty>No saved jobs yet — use the ♡ button on a job.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {savedList.map(renderJobRow)}
              </div>
            )}
          </Box>

          <Box title="Dismissed Jobs" count={dismissedList.length}>
            {dismissedList.length === 0 ? (
              <Empty>No dismissed jobs yet — use the ✕ button on a job.</Empty>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 480, overflowY: 'auto' }}>
                {dismissedList.map(renderJobRow)}
              </div>
            )}
          </Box>
        </div>
      )}
    </div>
  );
}

/** One job row — shared by the Recommended/Saved/Dismissed boxes so all three render identically (title, CV-match badge, and the 👍/👎/♡/✕ toggle buttons) instead of tripling the same JSX per box. */
function JobRow({
  job, similarity, compareMode, isSelected, clickable, activeInteractions, onRowClick, onToggleInteraction,
}: {
  job: Job;
  similarity: number | null;
  compareMode: boolean;
  isSelected: boolean;
  clickable: boolean;
  activeInteractions: Record<string, string>;
  onRowClick: (job: Job) => void;
  onToggleInteraction: (job: Job, type: string) => void;
}) {
  return (
    <div
      onClick={() => onRowClick(job)}
      style={{
        border: `1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`,
        borderRadius: 'var(--radius-sm)',
        background: isSelected ? 'var(--green-light)' : 'white',
        padding: '10px 12px',
        cursor: clickable ? 'pointer' : 'default',
        transition: 'box-shadow 0.15s',
      }}
      onMouseEnter={e => { if (!isSelected && clickable) e.currentTarget.style.boxShadow = 'var(--card-shadow)'; }}
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

      {!compareMode && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }} onClick={e => e.stopPropagation()}>
          <InteractionButton
            title="More like this"
            active={Boolean(activeInteractions[`${job.id}:MORE_LIKE_THIS`])}
            activeColor="var(--green)" activeBg="var(--green-light)"
            onClick={e => { e.stopPropagation(); onToggleInteraction(job, 'MORE_LIKE_THIS'); }}
          >
            👍
          </InteractionButton>
          <InteractionButton
            title="Less like this"
            active={Boolean(activeInteractions[`${job.id}:LESS_LIKE_THIS`])}
            activeColor="var(--amber)" activeBg="var(--amber-light)"
            onClick={e => { e.stopPropagation(); onToggleInteraction(job, 'LESS_LIKE_THIS'); }}
          >
            👎
          </InteractionButton>
          <InteractionButton
            title="Save"
            active={Boolean(activeInteractions[`${job.id}:SAVED`])}
            activeColor="var(--accent)" activeBg="var(--accent-light)"
            onClick={e => { e.stopPropagation(); onToggleInteraction(job, 'SAVED'); }}
          >
            ♡
          </InteractionButton>
          <InteractionButton
            title="Dismiss"
            active={Boolean(activeInteractions[`${job.id}:DISMISSED`])}
            activeColor="#991b1b" activeBg="#fef2f2"
            onClick={e => { e.stopPropagation(); onToggleInteraction(job, 'DISMISSED'); }}
          >
            ✕
          </InteractionButton>
        </div>
      )}
    </div>
  );
}

function InteractionButton({
  children, title, onClick, active, activeColor, activeBg,
}: {
  children: ReactNode;
  title: string;
  onClick: (e: MouseEvent<HTMLButtonElement>) => void;
  active: boolean;
  activeColor: string;
  activeBg: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      style={{
        fontSize: 12, padding: '3px 8px', borderRadius: 6,
        border: `1px solid ${active ? activeColor : 'var(--border)'}`,
        background: active ? activeBg : 'var(--surface-2)',
        color: active ? activeColor : 'var(--ink-secondary)',
        fontWeight: active ? 700 : 400,
        cursor: 'pointer', lineHeight: 1.4,
      }}
    >
      {children}
    </button>
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

/** Recharts tooltip for the embeddings plot — shows the hovered job's title/company instead of raw x/y coordinates, which mean nothing on their own for any of PCA/UMAP/t-SNE. */
function EmbeddingTooltip({ active, payload }: any) {
  if (!active || !payload || !payload.length) return null;
  const point = payload[0].payload;
  return (
    <div
      style={{
        background: 'white', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
        padding: '8px 12px', fontSize: 12, boxShadow: 'var(--card-shadow)',
      }}
    >
      <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{point.title}</div>
      {point.company && <div style={{ color: 'var(--ink-tertiary)', marginTop: 2 }}>{point.company}</div>}
    </div>
  );
}

/**
 * One session-over-session line chart on the Metrics screen. `reversed`
 * flips the y-axis for the two position-based metrics, where a *lower*
 * rank (closer to the top of Recommended Jobs) is the improvement, so the
 * line trending upward on the chart always reads as "getting better."
 * `value: null` sessions (e.g. no positive interaction that session) leave
 * a gap rather than plotting as 0, which would misleadingly read as "top
 * position."
 */
function MetricChart({
  title, subtitle, data, color, reversed,
}: {
  title: string;
  subtitle: string;
  data: { sessionNumber: number; value: number | null }[];
  color: string;
  reversed?: boolean;
}) {
  return (
    <div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginBottom: 8 }}>{subtitle}</div>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 6, right: 20, bottom: 6, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="sessionNumber"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              tick={{ fontSize: 11 }}
              stroke="var(--ink-tertiary)"
              label={{ value: 'Session #', position: 'insideBottom', offset: -4, fontSize: 11, fill: 'var(--ink-tertiary)' }}
            />
            <YAxis
              allowDecimals={false}
              reversed={reversed}
              tick={{ fontSize: 11 }}
              stroke="var(--ink-tertiary)"
              width={36}
            />
            <Tooltip
              formatter={(value: number) => [value, title]}
              labelFormatter={(label: number) => `Session ${label}`}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
            <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
