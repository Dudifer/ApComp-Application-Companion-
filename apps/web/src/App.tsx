import { useState, useEffect, useRef } from 'react';
import { useUser, useClerk } from '@clerk/clerk-react';
import type { Job } from '../../../packages/types/src/job';
import { JobDetailPanel } from './components/JobDetailPanel';
import { useApplications, STATUS_CONFIG } from './hooks/useApplications';
import AllApplicationsPage from './pages/AllApplicationsPage';
import ResumeBuilderPage from './pages/ResumeBuilderPage';
import { useJobs } from './hooks/useJobs';
import JobSearchPage from './pages/JobSearchPage';
import ResumePage from './pages/ResumePage';
import RecLabPage from './pages/RecLabPage';
import { AuthWrapper } from './auth/AuthWrapper';
import { useApi } from './lib/api';

// const NAV_ITEMS = ["Dashboard", "Applications", "Resume Builder", "Resume Demo", "Job Search", "Rec Lab"];
const NAV_ITEMS = ["Dashboard", "Applications", "Resume Builder", "Job Search", "Rec Lab"];



const STATUS_ORDER: Record<string, number> = {
  OFFER: 0,
  FINAL_ROUND: 1,
  INTERVIEW: 2,
  TECHNICAL: 3,
  PHONE_SCREEN: 4,
  ASSESSMENT: 5,
  VIEWED: 6,
  SUBMITTED: 7,
  APPLIED: 8,
  UNKNOWN: 9,
  WITHDRAWN: 10,
  REJECTED: 11,
};
 
export default function App() {
  const api = useApi();
  const { user } = useUser();
  const { signOut } = useClerk();

  const firstName = user?.firstName ?? user?.username ?? 'there';
  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const initials = fullName
    ? fullName.split(' ').map(w => w[0].toUpperCase()).slice(0, 2).join('')
    : (user?.username?.[0]?.toUpperCase() ?? '?');

  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);

  // Close avatar menu on outside click
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarMenuOpen]);

  const { jobs } = useJobs();

  const [active, setActive] = useState("Dashboard");

  const { applications: fetchedApplications, loading, gmailConnected, connectGmail } = useApplications();
  const [applications, setApplications] = useState(fetchedApplications);  
  
  const [tailorJob, setTailorJob] = useState<Job | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [removedJobIds, setRemovedJobIds] = useState<string[]>([]);
  const [savedJobs, setSavedJobs] = useState<Job[]>([]);

  const saveJob = (j: Job) => {
    setSavedJobs(prev => prev.some(sj => sj.id === j.id) ? prev : [j, ...prev]);
  };
  const unsaveJob = (jobId: string) => {
    setSavedJobs(prev => prev.filter(sj => sj.id !== jobId));
  };

  const [scraping, setScraping] = useState(false);
  
  useEffect(() => {
    const handler = (e: Event) => {
      setActive((e as CustomEvent).detail);
    };
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  useEffect(() => {
    setApplications(fetchedApplications);
  }, [fetchedApplications]);

  return (
  <AuthWrapper>
    <>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
  
          *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  
          :root {
            --ink: #1a1814;
            --ink-secondary: #6b6860;
            --ink-tertiary: #a8a49e;
            --surface: #faf9f7;
            --surface-2: #f2f0ec;
            --surface-3: #e8e5df;
            --accent: #c9622f;
            --accent-light: #f5ede7;
            --green: #2d7d4f;
            --green-light: #e8f4ee;
            --blue: #2563a8;
            --blue-light: #e8f0f9;
            --amber: #b45309;
            --amber-light: #fef3e2;
            --border: rgba(26,24,20,0.1);
            --card-shadow: 0 1px 3px rgba(26,24,20,0.06), 0 4px 16px rgba(26,24,20,0.04);
            --card-shadow-hover: 0 2px 8px rgba(26,24,20,0.1), 0 8px 24px rgba(26,24,20,0.08);
            --font-display: 'Syne', sans-serif;
            --font-body: 'DM Sans', sans-serif;
            --radius: 12px;
            --radius-sm: 6px;
          }
  
          body {
            background: var(--surface);
            color: var(--ink);
            font-family: var(--font-body);
            min-height: 100vh;
          }
  
          /* NAV */
          nav {
            position: sticky;
            top: 0;
            z-index: 100;
            background: rgba(250,249,247,0.92);
            backdrop-filter: blur(12px);
            border-bottom: 1px solid var(--border);
            padding: 0 40px;
            display: flex;
            align-items: stretch;
            gap: 4px;
          }
  
          .nav-logo {
            font-family: var(--font-display);
            font-weight: 700;
            font-size: 17px;
            letter-spacing: -0.02em;
            color: var(--ink);
            padding: 20px 24px 20px 0;
            margin-right: 16px;
            border-right: 1px solid var(--border);
            white-space: nowrap;
            display: flex;
            align-items: center;
            gap: 8px;
          }
  
          .nav-logo span {
            color: var(--accent);
          }
  
          .nav-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 20px 16px;
            font-family: var(--font-body);
            font-size: 14px;
            font-weight: 400;
            color: var(--ink-secondary);
            position: relative;
            transition: color 0.15s;
            letter-spacing: 0.01em;
            white-space: nowrap;
          }
  
          .nav-btn:hover { color: var(--ink); }
  
          .nav-btn.active {
            color: var(--ink);
            font-weight: 500;
          }
  
          .nav-btn.active::after {
            content: '';
            position: absolute;
            bottom: 0;
            left: 16px;
            right: 16px;
            height: 2px;
            background: var(--ink);
            border-radius: 2px 2px 0 0;
          }
  
          .nav-right {
            margin-left: auto;
            display: flex;
            align-items: center;
            gap: 12px;
          }
  
          .avatar {
            width: 32px;
            height: 32px;
            border-radius: 50%;
            background: var(--surface-3);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 12px;
            font-weight: 600;
            color: var(--ink-secondary);
            cursor: pointer;
          }
  
          /* MAIN */
          main {
            padding: 48px 40px;
            max-width: 1400px;
          }
  
          .greeting {
            font-family: var(--font-display);
            font-size: 28px;
            font-weight: 600;
            letter-spacing: -0.03em;
            color: var(--ink);
            margin-bottom: 6px;
          }
  
          .greeting-sub {
            font-size: 14px;
            color: var(--ink-tertiary);
            font-weight: 300;
            margin-bottom: 40px;
          }
  
          /* STATS ROW */
          .stats-row {
            display: flex;
            gap: 16px;
            margin-bottom: 48px;
          }
  
          .stat-pill {
            background: var(--surface-2);
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 16px 24px;
            display: flex;
            flex-direction: column;
            gap: 4px;
          }
  
          .stat-num {
            font-family: var(--font-display);
            font-size: 26px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: var(--ink);
          }
  
          .stat-label {
            font-size: 12px;
            color: var(--ink-tertiary);
            font-weight: 400;
            letter-spacing: 0.02em;
          }
  
          /* SECTION */
          .section { margin-bottom: 48px; }
  
          .section-header {
            display: flex;
            align-items: baseline;
            gap: 10px;
            margin-bottom: 20px;
          }
  
          .section-title {
            font-family: var(--font-display);
            font-size: 16px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: var(--ink);
          }
  
          .section-count {
            font-size: 12px;
            color: var(--ink-tertiary);
            font-weight: 400;
          }
  
          .section-link {
            margin-left: auto;
            font-size: 13px;
            color: var(--ink-secondary);
            cursor: pointer;
            text-decoration: none;
            border-bottom: 1px solid var(--border);
            padding-bottom: 1px;
            transition: color 0.15s, border-color 0.15s;
          }
  
          .section-link:hover { color: var(--ink); border-color: var(--ink); }
  
          /* SCROLL ROW */
          .scroll-row {
            display: flex;
            gap: 14px;
            overflow-x: auto;
            padding-bottom: 12px;
            scrollbar-width: thin;
            scrollbar-color: var(--surface-3) transparent;
          }
  
          .scroll-row::-webkit-scrollbar { height: 4px; }
          .scroll-row::-webkit-scrollbar-track { background: transparent; }
          .scroll-row::-webkit-scrollbar-thumb { background: var(--surface-3); border-radius: 2px; }
  
          /* APPLICATION CARD */
          .app-card {
            flex: 0 0 240px;
            background: white;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px;
            cursor: pointer;
            transition: box-shadow 0.2s, transform 0.2s;
            box-shadow: var(--card-shadow);
          }
  
          .app-card:hover {
            box-shadow: var(--card-shadow-hover);
            transform: translateY(-2px);
          }
  
          .app-card-top {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 14px;
          }
  
          .company-logo {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            background: var(--surface-2);
            border: 1px solid var(--border);
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: var(--font-display);
            font-size: 13px;
            font-weight: 700;
            color: var(--ink-secondary);
            letter-spacing: -0.02em;
          }
  
          .status-badge {
            font-size: 11px;
            font-weight: 500;
            padding: 3px 8px;
            border-radius: 99px;
            letter-spacing: 0.01em;
          }
  
          .status-applied { background: var(--surface-2); color: var(--ink-secondary); }
          .status-phone { background: var(--blue-light); color: var(--blue); }
          .status-tech { background: var(--amber-light); color: var(--amber); }
          .status-offer { background: var(--green-light); color: var(--green); }
          .status-rejected { background: #fef2f2; color: #991b1b; }

          .app-company {
            font-family: var(--font-display);
            font-size: 15px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: var(--ink);
            margin-bottom: 3px;
          }
  
          .app-role {
            font-size: 12px;
            color: var(--ink-secondary);
            font-weight: 300;
            margin-bottom: 14px;
            line-height: 1.4;
          }
  
          .app-date {
            font-size: 11px;
            color: var(--ink-tertiary);
          }
  
          /* RECOMMENDED CARD */
          .rec-card {
            flex: 0 0 260px;
            background: white;
            border: 1px solid var(--border);
            border-radius: var(--radius);
            padding: 20px;
            cursor: pointer;
            transition: box-shadow 0.2s, transform 0.2s;
            box-shadow: var(--card-shadow);
          }
  
          .rec-card:hover {
            box-shadow: var(--card-shadow-hover);
            transform: translateY(-2px);
          }
  
          .rec-match {
            font-size: 11px;
            font-weight: 500;
            color: var(--accent);
            margin-bottom: 10px;
            letter-spacing: 0.02em;
          }
  
          .rec-company {
            font-family: var(--font-display);
            font-size: 15px;
            font-weight: 600;
            letter-spacing: -0.02em;
            color: var(--ink);
            margin-bottom: 3px;
          }
  
          .rec-role {
            font-size: 12px;
            color: var(--ink-secondary);
            font-weight: 300;
            margin-bottom: 14px;
          }
  
          .tags {
            display: flex;
            gap: 6px;
            flex-wrap: wrap;
          }
  
          .tag {
            font-size: 11px;
            background: var(--surface-2);
            color: var(--ink-secondary);
            padding: 3px 8px;
            border-radius: 99px;
            border: 1px solid var(--border);
          }
  
          .rec-card-footer {
            margin-top: 16px;
            padding-top: 14px;
            border-top: 1px solid var(--border);
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
  
          .apply-btn {
            font-size: 12px;
            font-family: var(--font-body);
            font-weight: 500;
            background: var(--ink);
            color: white;
            border: none;
            padding: 6px 14px;
            border-radius: var(--radius-sm);
            cursor: pointer;
            transition: opacity 0.15s;
          }
  
          .apply-btn:hover { opacity: 0.8; }
  
          .save-btn {
            font-size: 12px;
            color: var(--ink-tertiary);
            background: none;
            border: none;
            cursor: pointer;
            transition: color 0.15s;
          }
  
          .save-btn:hover { color: var(--ink); }
        `}</style>
  
        <nav>
          <div className="nav-logo">
            Ap<span>Comp</span>
          </div>
          {NAV_ITEMS.map((item) => (
            <button
              key={item}
              className={`nav-btn${active === item ? " active" : ""}`}
              onClick={() => setActive(item)}
            >
              {item}
            </button>
          ))}
          <div className="nav-right">
            <div style={{ position: 'relative' }} ref={avatarRef}>
              <div className="avatar" onClick={() => setAvatarMenuOpen(o => !o)}>
                {initials}
              </div>
              {avatarMenuOpen && (
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', right: 0,
                  background: 'white', border: '1px solid var(--border)',
                  borderRadius: 10, boxShadow: '0 4px 20px rgba(26,24,20,0.1)',
                  minWidth: 180, zIndex: 500, overflow: 'hidden',
                }}>
                  <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>{fullName || user?.username}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink-tertiary)', marginTop: 2 }}>{user?.primaryEmailAddress?.emailAddress}</div>
                  </div>
                  <button
                    onClick={() => signOut()}
                    style={{
                      width: '100%', padding: '10px 14px', background: 'none',
                      border: 'none', cursor: 'pointer', fontSize: 13,
                      color: 'var(--ink-secondary)', textAlign: 'left',
                      fontFamily: 'var(--font-body)', transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </nav>
  
        <main style={{ padding: active === 'Resume Builder' ? 0 : undefined }}>
          {active === 'Applications' ? (
            <AllApplicationsPage />
          ) : active === 'CV Upload' ? (
            <ResumePage />
          ): active === 'Resume Builder' ? (
            <ResumeBuilderPage initialJob={tailorJob} onNavigate={(page) => setActive(page)}/>
          ) : active === 'Job Search' ? (
            <JobSearchPage onJobSelect={job => setSelectedJob(job)} removedJobIds={removedJobIds} />
          ) : active === 'Rec Lab' ? (
            <RecLabPage />
          ) : (//active === 'Resume Demo' ? (
          //   <ResumeDemoPage />
          // ) : (
            
            <>
              <div className="greeting">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, {firstName}.</div>
              <div className="greeting-sub">Here's where things stand today.</div>

              <div className="stats-row">
                {[
                  { num: String(applications.length), label: "Total Applications" },
                  { num: String(applications.filter(a => ['SUBMITTED','APPLIED','VIEWED'].includes(a.status)).length), label: "Pending Response" },
                  { num: String(applications.filter(a => a.status === 'INTERVIEW').length), label: "Interviews Scheduled" },
                  { num: String(applications.filter(a => a.status === 'OFFER').length), label: "Offers Received" },
                ].map((s) => (
                  <div className="stat-pill" key={s.label}>
                    <div className="stat-num">{s.num}</div>
                    <div className="stat-label">{s.label}</div>
                  </div>
                ))}
              </div>

              <div className="section">
                <div className="section-header">
                  <div className="section-title">Pending Applications</div>
                  <div className="section-count">{applications.length} active</div>
                  {!gmailConnected ? (
                  <button
                    onClick={() => {
                      const GMAIL_ALLOWED = ['jacob.6nyberg@gmail.com', 'sheeshthebot@gmail.com'];
                      if (GMAIL_ALLOWED.includes(user?.primaryEmailAddress?.emailAddress ?? '')) {
                        connectGmail();
                      } else {
                        alert('Gmail integration is not available yet for your account.');
                      }
                    }}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 8,
                      background: 'var(--ink)', color: 'white', border: 'none',
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    Connect Gmail
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (scraping) return;
                      setScraping(true);
                      api.post('/applications/scrape')
                        .then(() => window.location.reload())
                        .catch(err => console.warn('Scrape failed:', err))
                        .finally(() => setScraping(false));
                    }}
                    disabled={scraping}
                    style={{
                      fontSize: 12, padding: '4px 12px', borderRadius: 8,
                      background: 'none',
                      color: scraping ? 'var(--ink-tertiary)' : 'var(--ink-secondary)',
                      border: `1px solid ${scraping ? 'var(--surface-3)' : 'var(--border)'}`,
                      cursor: scraping ? 'not-allowed' : 'pointer',
                      fontFamily: 'var(--font-body)',
                      transition: 'all 0.2s',
                    }}
                  >
                    {scraping ? '⟳ Scraping...' : '↻ Refresh emails'}
                  </button>
                )}
                  <a className="section-link" onClick={() => setActive('Applications')}>View all →</a>
                </div>
              </div>
              <div className="scroll-row">
                {applications.length === 0 ? (
                  <div style={{
                    padding: '40px 20px', color: 'var(--ink-tertiary)',
                    fontSize: 13, textAlign: 'center', width: '100%',
                  }}>
                    {gmailConnected
                      ? 'No applications found yet — check back after your next email sync.'
                      : 'Connect Gmail to start tracking your applications.'}
                  </div>
                ) : (
                  [...applications]
                    .filter(a => a.status !== 'DISMISSED' && a.status !== 'REJECTED' && a.status !== 'WITHDRAWN')
                    .sort((a, b) => {
                      const statusDiff = (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
                      if (statusDiff !== 0) return statusDiff;
                      return new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime();
                    })
                    .map((app) => (
                    <div className="app-card" key={app.id}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => {
                            setApplications(prev => prev.filter(a => a.id !== app.id));
                            api.patch(`/applications/${app.id}/dismiss`)
                              .catch(err => console.warn('Failed to dismiss:', err));
                          }}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--ink-tertiary)', fontSize: 16, padding: '0 2px',
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                      <div className="app-card-top">
                        <div className="company-logo">{app.company.slice(0, 2)}</div>
                        <span className={`status-badge ${STATUS_CONFIG[app.status]?.colorClass ?? 'status-applied'}`}>
                          {STATUS_CONFIG[app.status]?.label ?? app.status}
                        </span>
                      </div>
                      <div className="app-company">{app.company}</div>
                      <div className="app-role">{app.position ?? 'Unknown Position'}</div>
                      <div className="app-date">Applied {new Date(app.appliedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
                    </div>
                  ))
                )}
              </div>

              <div className="section">
                <div className="section-header">
                  <div className="section-title">Recommended Job Postings</div>
                  <div className="section-count">Based on your profile</div>
                  <a className="section-link">View all →</a>
                </div>
                <div className="scroll-row">
                  {jobs.length === 0 && savedJobs.length === 0 ? (
                    <div style={{
                      padding: '40px 20px', color: 'var(--ink-tertiary)',
                      fontSize: 13, textAlign: 'center',
                    }}>
                      No recommendations yet — connect your profile to get started.
                    </div>
                  ) : (
                    [...savedJobs, ...jobs.filter(j => !savedJobs.some(sj => sj.id === j.id))].map((job) => {
                      const isSaved = savedJobs.some(sj => sj.id === job.id);
                      return (
                      <div className="rec-card" key={job.id} onClick={() => setSelectedJob(job)}>
                        <div className="rec-match">{isSaved ? 'Saved' : job.relevanceScore > 0 ? `${job.relevanceScore}% match` : job.source}</div>
                        <div className="rec-company">{job.company}</div>
                        <div className="rec-role">{job.title}</div>
                        <div className="tags">
                          {(job.tags ?? []).slice(0, 4).map((t) => (
                            <span className="tag" key={t}>{t}</span>
                          ))}
                        </div>
                        <div className="rec-card-footer">
                          <a href={job.url} target="_blank" rel="noopener noreferrer" className="apply-btn"
                            onClick={e => e.stopPropagation()}>
                            Quick Apply
                          </a>
                          <button
                            className="save-btn"
                            onClick={e => {
                              e.stopPropagation();
                              if (isSaved) {
                                unsaveJob(job.id);
                              } else {
                                saveJob(job);
                                setRemovedJobIds(prev => [...prev, job.id]);
                                api.post('/jobs/capture', {
                                  title: job.title,
                                  company: job.company,
                                  url: job.url,
                                  description: job.description,
                                  location: job.location?.displayName,
                                  remote: job.remote,
                                  employmentType: job.employmentType,
                                  postedAt: job.postedAt,
                                  tags: job.tags,
                                }).catch(err => console.warn('Failed to save job:', err));
                              }
                            }}
                          >
                            {isSaved ? 'Saved ♥' : 'Save ♡'}
                          </button>
                        </div>
                      </div>
                      );
                    })
                  )}
                </div>
              </div>
            </>
          )}
        </main>
      <JobDetailPanel
        job={selectedJob}
        onClose={() => setSelectedJob(null)}
        onDismiss={(j) => {
          setRemovedJobIds(prev => [...prev, j.id]);
          api.post('/jobs/dismiss', {
            jobId: j.externalId ?? j.id,
            source: j.source,
            company: j.company,
            title: j.title,
          }).catch(err => console.warn('Failed to dismiss job:', err));
        }}
        onSave={(j) => {
          saveJob(j);
          setRemovedJobIds(prev => [...prev, j.id]);
          api.post('/jobs/capture', {
            title: j.title,
            company: j.company,
            url: j.url,
            description: j.description,
            location: j.location?.displayName,
            remote: j.remote,
            employmentType: j.employmentType,
            postedAt: j.postedAt,
            tags: j.tags,
          }).catch(err => console.warn('Failed to save job:', err));
        }}
        onTailor={(j) => { setTailorJob(j); setActive('Resume Builder'); setSelectedJob(null); }}
        onMoreLikeThis={() => { /* TODO: wire up recommendation tuning */ }}
        onLessLikeThis={() => { /* TODO: wire up recommendation tuning */ }}
      />
    </>
  </AuthWrapper>  
  );
}