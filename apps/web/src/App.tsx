import { useState } from 'react';
import type { Job } from '../../../packages/types/src/job';
import { JobDetailPanel } from './components/JobDetailPanel';
import { useApplications, STATUS_CONFIG } from './hooks/useApplications';
import AllApplicationsPage from './pages/AllApplicationsPage';
import ResumeBuilderPage from './pages/ResumeBuilderPage';
import { useJobs } from './hooks/useJobs';
import JobSearchPage from './pages/JobSearchPage';
import ResumeDemoPage from './pages/ResumeDemoPage';


const NAV_ITEMS = ["Dashboard", "Applications", "Resume Builder", "Resume Demo", "Job Search", "Practice"];
 
const STATUS_COLORS: Record<string, string> = {
  Applied: "status-applied",
  "Phone Screen": "status-phone",
  Technical: "status-tech",
  Offer: "status-offer",
};
 
export default function App() {
  const { jobs } = useJobs();

  const [active, setActive] = useState("Dashboard");

  const { applications, loading, gmailConnected, connectGmail } = useApplications();
  
  const [tailorJob, setTailorJob] = useState<Job | null>(null);

  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  return (
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
          <div className="avatar">JD</div>
        </div>
      </nav>
 
      <main style={{ padding: active === 'Resume Builder' ? 0 : undefined }}>
        {active === 'Applications' ? (
          <AllApplicationsPage />
        ) : active === 'Resume Demo' ? (
          <ResumeDemoPage />
        ) : active === 'Resume Builder' ? (
          <ResumeBuilderPage initialJob={tailorJob} />
        ) : active === 'Job Search' ? (
          <JobSearchPage onJobSelect={job => { setSelectedJob(job); }}/>
        ) : (
          
          <>
            <div className="greeting">Good evening, John.</div>
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
                {!gmailConnected && (
                  <button onClick={connectGmail} style={{
                    fontSize: 12, padding: '4px 12px', borderRadius: 8,
                    background: 'var(--ink)', color: 'white', border: 'none',
                    cursor: 'pointer', fontFamily: 'var(--font-body)',
                  }}>
                    Connect Gmail
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
                applications.map((app) => (
                  <div className="app-card" key={app.id}>
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
                {jobs.length === 0 ? (
                  <div style={{
                    padding: '40px 20px', color: 'var(--ink-tertiary)',
                    fontSize: 13, textAlign: 'center',
                  }}>
                    No recommendations yet — connect your profile to get started.
                  </div>
                ) : (
                  jobs.map((job) => (
                    <div className="rec-card" key={job.id} onClick={() => setSelectedJob(job)}>
                      <div className="rec-match">{job.relevanceScore > 0 ? `${job.relevanceScore}% match` : job.source}</div>
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
                        <button className="save-btn">Save ♡</button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </>
        )}
      </main>
    <JobDetailPanel
      job={selectedJob}
      onClose={() => setSelectedJob(null)}
      onDismiss={(j) => console.log('dismiss', j.id)}
      onSave={(j) => console.log('save', j.id)}
      onTailor={(j) => { setTailorJob(j); setActive('Resume Builder'); setSelectedJob(null); }}
    />
  </>  
  );
}