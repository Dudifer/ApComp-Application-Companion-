import { useState, useEffect } from 'react';
import { useApi } from '../lib/api';

interface Application {
  id: string;
  company: string;
  position?: string;
  status: string;
  appliedAt: string;
  updatedAt: string;
  lastEmailSubject?: string;
  lastEmailDate?: string;
  isAutoRejected: boolean;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SUBMITTED: { label: 'Submitted', color: '#6b6860', bg: '#f2f0ec' },
  APPLIED:   { label: 'Applied',   color: '#6b6860', bg: '#f2f0ec' },
  VIEWED:    { label: 'Viewed',    color: '#2563a8', bg: '#e8f0f9' },
  ASSESSMENT:{ label: 'Assessment',color: '#b45309', bg: '#fef3e2' },
  INTERVIEW: { label: 'Interview', color: '#7c3d8f', bg: '#f3e8ff' },
  OFFER:     { label: 'Offer',     color: '#2d7d4f', bg: '#e8f4ee' },
  REJECTED:  { label: 'Rejected',  color: '#991b1b', bg: '#fef2f2' },
  WITHDRAWN: { label: 'Withdrawn', color: '#a8a49e', bg: '#f2f0ec' },
  UNKNOWN:   { label: 'Unknown',   color: '#a8a49e', bg: '#f2f0ec' },
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.UNKNOWN;
  return (
    <span style={{
      fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 99,
      background: cfg.bg, color: cfg.color, whiteSpace: 'nowrap',
    }}>
      {cfg.label}
    </span>
  );
}

export default function AllApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const api = useApi();

  useEffect(() => {
    api.get('/applications')
      .then(r => r.json())
      .then(data => { setApps(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [api]);

  const statuses = ['ALL', ...Object.keys(STATUS_CONFIG)];

  const filtered = apps.filter(a => {
    const matchesFilter = filter === 'ALL' || a.status === filter;
    const matchesSearch = !search ||
      a.company.toLowerCase().includes(search.toLowerCase()) ||
      (a.position ?? '').toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <>
      <style>{`
        .all-apps-page { padding: 48px 40px; max-width: 900px; }
        .page-title { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 6px; }
        .page-sub { font-size: 14px; color: var(--ink-tertiary); font-weight: 300; margin-bottom: 32px; }

        .toolbar { display: flex; gap: 12px; margin-bottom: 24px; align-items: center; flex-wrap: wrap; }

        .search-input {
          padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border);
          font-family: var(--font-body); font-size: 13px; color: var(--ink);
          background: white; outline: none; width: 220px;
        }
        .search-input:focus { border-color: var(--ink-secondary); }

        .filter-tabs { display: flex; gap: 4px; flex-wrap: wrap; }
        .filter-tab {
          padding: 5px 12px; border-radius: 99px; font-size: 12px; font-weight: 500;
          border: 1px solid var(--border); background: white; color: var(--ink-secondary);
          cursor: pointer; font-family: var(--font-body); transition: all 0.15s;
        }
        .filter-tab.active { background: var(--ink); color: white; border-color: var(--ink); }

        .apps-count { font-size: 13px; color: var(--ink-tertiary); margin-left: auto; }

        .app-row {
          background: white; border: 1px solid var(--border); border-radius: 12px;
          padding: 18px 20px; margin-bottom: 10px;
          display: grid; grid-template-columns: 1fr auto;
          gap: 12px; align-items: start;
          transition: box-shadow 0.2s;
        }
        .app-row:hover { box-shadow: 0 2px 8px rgba(26,24,20,0.08); }

        .app-row-left { display: flex; flex-direction: column; gap: 4px; }
        .app-company { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: -0.02em; color: var(--ink); }
        .app-position { font-size: 13px; color: var(--ink-secondary); }
        .app-email-subject { font-size: 11px; color: var(--ink-tertiary); margin-top: 4px; font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 500px; }

        .app-row-right { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; }
        .app-date { font-size: 11px; color: var(--ink-tertiary); white-space: nowrap; }
        .app-updated { font-size: 11px; color: var(--ink-tertiary); }

        .empty-state { text-align: center; padding: 80px 0; color: var(--ink-tertiary); font-size: 14px; }
        .loading-spinner { display: flex; justify-content: center; padding: 80px 0; }
        .spinner { width: 32px; height: 32px; border: 3px solid var(--surface-3); border-top-color: var(--accent); border-radius: 50%; animation: spin 0.8s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      <div className="all-apps-page">
        <div className="page-title">All Applications</div>
        <div className="page-sub">{apps.length} total applications tracked</div>

        <div className="toolbar">
          <input
            className="search-input"
            placeholder="Search company or role..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <div className="filter-tabs">
            {statuses.map(s => (
              <button
                key={s}
                className={`filter-tab${filter === s ? ' active' : ''}`}
                onClick={() => setFilter(s)}
              >
                {s === 'ALL' ? 'All' : (STATUS_CONFIG[s]?.label ?? s)}
              </button>
            ))}
          </div>
          <div className="apps-count">{filtered.length} shown</div>
        </div>

        {loading ? (
          <div className="loading-spinner"><div className="spinner" /></div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            {apps.length === 0
              ? 'No applications found. Connect Gmail to start tracking.'
              : 'No applications match your filter.'}
          </div>
        ) : (
          filtered.map(app => (
            <div className="app-row" key={app.id}>
              <div className="app-row-left">
                <div className="app-company">{app.company}</div>
                {app.position && <div className="app-position">{app.position}</div>}
                {app.lastEmailSubject && (
                  <div className="app-email-subject">"{app.lastEmailSubject}"</div>
                )}
              </div>
              <div className="app-row-right">
                <StatusBadge status={app.status} />
                <div className="app-date">Applied {formatDate(app.appliedAt)}</div>
                <div className="app-updated">
                  Updated {formatDate(app.lastEmailDate ?? app.updatedAt)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}
