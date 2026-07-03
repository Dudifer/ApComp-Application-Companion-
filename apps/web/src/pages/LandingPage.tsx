import { useClerk } from '@clerk/clerk-react';
import { Link } from 'react-router-dom';

export default function LandingPage() {
  const { openSignIn } = useClerk();

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
          --border: rgba(26,24,20,0.1);
          --font-display: 'Syne', sans-serif;
          --font-body: 'DM Sans', sans-serif;
        }

        body { background: var(--surface); font-family: var(--font-body); color: var(--ink); }

        .lp-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 18px 48px;
          background: rgba(250,249,247,0.85); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .lp-logo {
          font-family: var(--font-display); font-size: 18px; font-weight: 700;
          letter-spacing: -0.03em; color: var(--ink);
        }
        .lp-nav-signin {
          font-size: 13px; color: var(--ink-secondary); background: none;
          border: 1px solid var(--border); padding: 7px 18px; border-radius: 8px;
          cursor: pointer; font-family: var(--font-body); transition: background 0.15s;
        }
        .lp-nav-signin:hover { background: var(--surface-2); }

        .lp-hero {
          max-width: 860px; margin: 0 auto;
          padding: 96px 48px 80px;
          text-align: center;
        }
        .lp-hero-eyebrow {
          display: inline-block;
          font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--accent);
          background: var(--accent-light); padding: 4px 14px; border-radius: 99px;
          margin-bottom: 28px;
        }
        .lp-hero-h1 {
          font-family: var(--font-display); font-size: clamp(36px, 6vw, 60px);
          font-weight: 700; letter-spacing: -0.04em; color: var(--ink);
          line-height: 1.08; margin-bottom: 22px;
        }
        .lp-hero-sub {
          font-size: clamp(15px, 2vw, 18px); color: var(--ink-secondary);
          font-weight: 300; line-height: 1.65; max-width: 580px;
          margin: 0 auto 40px;
        }
        .lp-cta {
          display: inline-block; padding: 14px 36px;
          background: var(--ink); color: white;
          font-family: var(--font-body); font-size: 15px; font-weight: 500;
          border: none; border-radius: 10px; cursor: pointer;
          transition: opacity 0.15s; letter-spacing: -0.01em;
        }
        .lp-cta:hover { opacity: 0.8; }

        .lp-features {
          background: white; border-top: 1px solid var(--border);
          border-bottom: 1px solid var(--border);
          padding: 80px 48px;
        }
        .lp-features-inner { max-width: 1080px; margin: 0 auto; }
        .lp-features-label {
          font-size: 11px; font-weight: 600; letter-spacing: 0.1em;
          text-transform: uppercase; color: var(--ink-tertiary);
          margin-bottom: 48px; text-align: center;
        }
        .lp-cards {
          display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px;
        }
        @media (max-width: 700px) { .lp-cards { grid-template-columns: 1fr; } }
        .lp-card {
          border: 1px solid var(--border); border-radius: 14px;
          padding: 32px 28px; background: var(--surface);
        }
        .lp-card-icon {
          font-size: 28px; margin-bottom: 18px; display: block;
        }
        .lp-card-title {
          font-family: var(--font-display); font-size: 17px; font-weight: 600;
          letter-spacing: -0.02em; color: var(--ink); margin-bottom: 10px;
        }
        .lp-card-body {
          font-size: 13px; color: var(--ink-secondary); line-height: 1.7;
          font-weight: 300;
        }

        .lp-gmail-section {
          max-width: 780px; margin: 0 auto; padding: 72px 48px;
        }
        .lp-gmail-section h2 {
          font-family: var(--font-display); font-size: clamp(20px, 3vw, 26px);
          font-weight: 700; letter-spacing: -0.03em; color: var(--ink);
          margin-bottom: 14px;
        }
        .lp-gmail-section p {
          font-size: 14px; color: var(--ink-secondary); line-height: 1.75;
          font-weight: 300; margin-bottom: 12px;
        }
        .lp-gmail-list {
          list-style: none; padding: 0; margin: 16px 0;
        }
        .lp-gmail-list li {
          font-size: 13px; color: var(--ink-secondary); line-height: 1.7;
          padding: 10px 0; border-bottom: 1px solid var(--border);
          display: flex; gap: 12px;
        }
        .lp-gmail-list li:last-child { border-bottom: none; }
        .lp-gmail-list .check { color: var(--green); flex-shrink: 0; font-weight: 600; }
        .lp-gmail-list .cross { color: var(--accent); flex-shrink: 0; font-weight: 600; }

        .lp-bottom-cta {
          padding: 80px 48px; text-align: center; max-width: 680px; margin: 0 auto;
        }
        .lp-bottom-cta-h2 {
          font-family: var(--font-display); font-size: clamp(26px, 4vw, 38px);
          font-weight: 700; letter-spacing: -0.03em; color: var(--ink);
          margin-bottom: 16px;
        }
        .lp-bottom-cta-sub {
          font-size: 14px; color: var(--ink-secondary); font-weight: 300;
          line-height: 1.6; margin-bottom: 36px;
        }

        .lp-footer {
          padding: 24px 48px; border-top: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
          flex-wrap: wrap; gap: 8px;
          background: var(--surface-2);
        }
        .lp-footer-copy { font-size: 11px; color: var(--ink-tertiary); }
        .lp-footer-link {
          font-size: 11px; color: var(--ink-tertiary);
          text-decoration: underline; font-family: var(--font-body);
        }
        .lp-footer-link:hover { color: var(--ink-secondary); }
      `}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-logo">ApComp</div>
        <button className="lp-nav-signin" onClick={() => openSignIn()}>
          Sign in
        </button>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <span className="lp-hero-eyebrow">Your job search, organized</span>
        <h1 className="lp-hero-h1">The companion app for serious job applicants</h1>
        <p className="lp-hero-sub">
          ApComp brings together job discovery, resume tailoring, and application tracking —
          so you can spend less time juggling tabs and more time landing interviews.
        </p>
        <button className="lp-cta" onClick={() => openSignIn()}>
          Get started →
        </button>
      </section>

      {/* Features */}
      <section className="lp-features">
        <div className="lp-features-inner">
          <div className="lp-features-label">What's inside</div>
          <div className="lp-cards">
            <div className="lp-card">
              <span className="lp-card-icon">🔍</span>
              <div className="lp-card-title">Job Search</div>
              <p className="lp-card-body">
                Search a live database of thousands of US job listings filtered to your
                titles and experience level. No more bouncing between job boards —
                relevant postings surface directly in your dashboard.
              </p>
            </div>
            <div className="lp-card">
              <span className="lp-card-icon">✦</span>
              <div className="lp-card-title">Resume Tailoring</div>
              <p className="lp-card-body">
                Paste a job description and let ApComp rewrite your resume to match it.
                The AI highlights the right skills, adjusts phrasing, and outputs a
                polished PDF ready to submit — in seconds.
              </p>
            </div>
            <div className="lp-card">
              <span className="lp-card-icon">📬</span>
              <div className="lp-card-title">Application Tracker</div>
              <p className="lp-card-body">
                Connect your Gmail account and ApComp uses read-only access to detect
                job application confirmation emails, interview invitations, and recruiter
                replies. It builds a live status board of every application automatically
                — no manual entry needed. ApComp never modifies, sends, or deletes your emails.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Google data use — required disclosure for OAuth verification */}
      <div style={{ background: 'white', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <div className="lp-gmail-section">
          <h2>How ApComp uses your Google account</h2>
          <p>
            When you connect Gmail, ApComp requests <strong>read-only</strong> access to your inbox
            via the Google Gmail API. This is the only Google permission the app requests.
            Here is exactly what that access is used for:
          </p>
          <ul className="lp-gmail-list">
            <li><span className="check">✓</span> Reading the subject lines, sender addresses, and bodies of emails that appear to be job application confirmations, recruiter messages, or interview invitations.</li>
            <li><span className="check">✓</span> Extracting the company name, application status, and date from those emails to populate your application tracker dashboard.</li>
            <li><span className="cross">✗</span> ApComp does <strong>not</strong> read, store, or process any emails unrelated to job applications.</li>
            <li><span className="cross">✗</span> ApComp does <strong>not</strong> send, modify, or delete any emails on your behalf.</li>
            <li><span className="cross">✗</span> ApComp does <strong>not</strong> share your email data with any third party or use it for advertising purposes.</li>
          </ul>
          <p>
            You can disconnect your Gmail account at any time from your dashboard. Disconnecting
            immediately revokes ApComp's access token and stops all email scanning.
            See our <Link to="/terms" style={{ color: 'var(--accent)' }}>Privacy Policy</Link> for full details.
          </p>
        </div>
      </div>

      {/* Bottom CTA */}
      <div style={{ textAlign: 'center' }}>
        <div className="lp-bottom-cta">
          <h2 className="lp-bottom-cta-h2">Ready to take control of your search?</h2>
          <p className="lp-bottom-cta-sub">
            Create a free account and get your dashboard set up in under two minutes.
          </p>
          <button className="lp-cta" onClick={() => openSignIn()}>
            Get started →
          </button>
        </div>
      </div>

      {/* Footer */}
      <footer className="lp-footer">
        <span className="lp-footer-copy">© {new Date().getFullYear()} ApComp. All rights reserved.</span>
        <Link to="/terms" className="lp-footer-link">
          Terms of Service &amp; Privacy Policy
        </Link>
      </footer>
    </>
  );
}
