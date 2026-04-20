import { useState } from "react";
 
const NAV_ITEMS = ["Dashboard", "Applications", "Resume Builder", "Job Board", "Practice"];
 
const PENDING_APPS = [
  { company: "Stripe", role: "Software Engineer II", date: "Apr 17", status: "Applied" },
  { company: "Vercel", role: "Frontend Engineer", date: "Apr 15", status: "Phone Screen" },
  { company: "Linear", role: "Full Stack Engineer", date: "Apr 12", status: "Applied" },
  { company: "Notion", role: "Backend Engineer", date: "Apr 10", status: "Technical" },
  { company: "Figma", role: "Software Engineer", date: "Apr 8", status: "Applied" },
  { company: "Loom", role: "Platform Engineer", date: "Apr 5", status: "Offer" },
];
 
const RECOMMENDED = [
  { company: "Supabase", role: "Developer Advocate", match: "94% match", tags: ["TypeScript", "PostgreSQL"] },
  { company: "PlanetScale", role: "Software Engineer", match: "91% match", tags: ["MySQL", "Go"] },
  { company: "Railway", role: "Full Stack Engineer", match: "88% match", tags: ["React", "Node.js"] },
  { company: "Resend", role: "Frontend Engineer", match: "85% match", tags: ["React", "TypeScript"] },
  { company: "Trigger.dev", role: "Backend Engineer", match: "82% match", tags: ["TypeScript", "Redis"] },
  { company: "Neon", role: "Cloud Engineer", match: "79% match", tags: ["PostgreSQL", "Rust"] },
];
 
const STATUS_COLORS: Record<string, string> = {
  Applied: "status-applied",
  "Phone Screen": "status-phone",
  Technical: "status-tech",
  Offer: "status-offer",
};
 
export default function App() {
  const [active, setActive] = useState("Dashboard");
 
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
 
      <main>
        <div className="greeting">Good evening, John.</div>
        <div className="greeting-sub">Here's where things stand today.</div>
 
        <div className="stats-row">
          {[
            { num: "24", label: "Total Applications" },
            { num: "6", label: "Pending Response" },
            { num: "3", label: "Interviews Scheduled" },
            { num: "1", label: "Offers Received" },
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
            <div className="section-count">{PENDING_APPS.length} active</div>
            <a className="section-link">View all →</a>
          </div>
          <div className="scroll-row">
            {PENDING_APPS.map((app) => (
              <div className="app-card" key={app.company}>
                <div className="app-card-top">
                  <div className="company-logo">{app.company.slice(0, 2)}</div>
                  <span className={`status-badge ${STATUS_COLORS[app.status]}`}>
                    {app.status}
                  </span>
                </div>
                <div className="app-company">{app.company}</div>
                <div className="app-role">{app.role}</div>
                <div className="app-date">Applied {app.date}</div>
              </div>
            ))}
          </div>
        </div>
 
        <div className="section">
          <div className="section-header">
            <div className="section-title">Recommended Job Postings</div>
            <div className="section-count">Based on your profile</div>
            <a className="section-link">View all →</a>
          </div>
          <div className="scroll-row">
            {RECOMMENDED.map((job) => (
              <div className="rec-card" key={job.company}>
                <div className="rec-match">{job.match}</div>
                <div className="rec-company">{job.company}</div>
                <div className="rec-role">{job.role}</div>
                <div className="tags">
                  {job.tags.map((t) => (
                    <span className="tag" key={t}>{t}</span>
                  ))}
                </div>
                <div className="rec-card-footer">
                  <button className="apply-btn">Quick Apply</button>
                  <button className="save-btn">Save ♡</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </main>
    </>
  );
}