import { Link } from 'react-router-dom';

export default function TermsPage() {
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;500;600;700&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;1,9..40,300&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        :root {
          --ink: #1a1814; --ink-secondary: #6b6860; --ink-tertiary: #a8a49e;
          --surface: #faf9f7; --surface-2: #f2f0ec; --surface-3: #e8e5df;
          --accent: #c9622f; --accent-light: #f5ede7;
          --border: rgba(26,24,20,0.1);
          --font-display: 'Syne', sans-serif; --font-body: 'DM Sans', sans-serif;
        }
        body { background: var(--surface); font-family: var(--font-body); color: var(--ink); }

        .tp-nav {
          position: sticky; top: 0; z-index: 100;
          display: flex; justify-content: space-between; align-items: center;
          padding: 18px 48px;
          background: rgba(250,249,247,0.85); backdrop-filter: blur(12px);
          border-bottom: 1px solid var(--border);
        }
        .tp-logo { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); cursor: pointer; }
        .tp-back {
          font-size: 13px; color: var(--ink-secondary); background: none;
          border: 1px solid var(--border); padding: 7px 18px; border-radius: 8px;
          cursor: pointer; font-family: var(--font-body); transition: background 0.15s;
        }
        .tp-back:hover { background: var(--surface-2); }

        .tp-body { max-width: 780px; margin: 0 auto; padding: 64px 48px 96px; }
        .tp-body h1 { font-family: var(--font-display); font-size: 30px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); margin-bottom: 8px; }
        .tp-body .tp-updated { font-size: 12px; color: var(--ink-tertiary); margin-bottom: 48px; }
        .tp-body h2 { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: -0.02em; color: var(--ink); margin: 40px 0 16px; }
        .tp-body h3 { font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ink-secondary); margin: 28px 0 10px; }
        .tp-body p { font-size: 13px; color: var(--ink-secondary); line-height: 1.8; font-weight: 300; margin-bottom: 10px; }
        .tp-body hr { border: none; border-top: 1px solid var(--border); margin: 48px 0; }
        .tp-body a { color: var(--accent); text-decoration: none; }
        .tp-body a:hover { text-decoration: underline; }
      `}</style>

      <nav className="tp-nav">
        <Link to="/home" style={{ textDecoration: 'none' }}>
          <div className="tp-logo">ApComp</div>
        </Link>
        <Link to="/home">
          <button className="tp-back">← Back</button>
        </Link>
      </nav>

      <div className="tp-body">
        <h1>Terms of Service &amp; Privacy Policy</h1>
        <p className="tp-updated">Last updated: July 1, 2026</p>

        <h2>Terms of Service</h2>

        <h3>1. Acceptance of Terms</h3>
        <p>
          By accessing or using ApComp ("the Service," "we," "our"), you agree to be
          bound by these Terms of Service and Privacy Policy. If you do not agree to
          these terms, please do not use the Service.
        </p>

        <h3>2. Description of Service</h3>
        <p>
          ApComp is a job application management tool that provides job search
          functionality, AI-assisted resume tailoring, and automated application tracking
          via Gmail integration. The Service is provided for personal, non-commercial use.
        </p>

        <h3>3. Account Registration</h3>
        <p>
          Account creation and authentication is handled through Clerk, a third-party
          identity provider. By creating an account, you agree to provide accurate
          information and to keep your credentials secure. You are responsible for all
          activity that occurs under your account.
        </p>

        <h3>4. Acceptable Use</h3>
        <p>
          You agree not to use the Service for any unlawful purpose or in any way that
          could damage, disable, or impair the Service. You may not attempt to gain
          unauthorized access to any part of the Service or its related systems.
        </p>

        <h3>5. Limitation of Liability</h3>
        <p>
          The Service is provided "as is" without warranties of any kind. We are not
          liable for any indirect, incidental, or consequential damages arising from
          your use of the Service, including but not limited to loss of data or
          employment outcomes.
        </p>

        <h3>6. Changes to Terms</h3>
        <p>
          We reserve the right to modify these terms at any time. Continued use of
          the Service following any changes constitutes your acceptance of the revised
          terms.
        </p>

        <hr />

        <h2>Privacy Policy</h2>

        <h3>Data We Collect</h3>
        <p>
          <strong>Account information:</strong> When you register, we collect the
          information you provide through Clerk, which may include your name, email
          address, and authentication credentials. This data is stored and managed by
          Clerk in accordance with their privacy policy.
        </p>
        <p>
          <strong>Resume and profile data:</strong> Any resume content, work history,
          or skills you upload or enter are stored in our database and used solely to
          provide the resume tailoring and job matching features of the Service.
        </p>
        <p>
          <strong>Gmail data:</strong> If you choose to connect your Gmail account,
          ApComp requests read-only access to your email inbox through the Google
          Gmail API. We access only the emails necessary to identify job application
          confirmations, recruiter correspondence, and related communications. We do
          not read, store, or share the full content of unrelated emails. Email data
          is processed to extract application status information and is not sold or
          shared with third parties.
        </p>
        <p>
          <strong>Usage data:</strong> We may collect basic usage information (such
          as which features you use) to improve the Service. This data is not linked
          to identifiable individuals.
        </p>

        <h3>How We Use Your Data</h3>
        <p>
          Data collected through the Service is used exclusively to provide, maintain,
          and improve ApComp's features. We do not sell, rent, or share your personal
          information with advertisers or unaffiliated third parties.
        </p>

        <h3>Third-Party Services</h3>
        <p>
          The Service uses the following third-party services, each governed by their
          own privacy policies: Clerk (authentication), Google Gmail API (email access,
          only when you explicitly connect your account), and Anthropic Claude API
          (AI-powered resume generation). We encourage you to review the privacy
          policies of these providers independently.
        </p>

        <h3>Data Retention and Deletion</h3>
        <p>
          You may request deletion of your account and associated data at any time
          by contacting us. Upon deletion, your profile data, resume content, and
          connected account tokens will be removed from our systems within 30 days.
          Gmail access tokens are invalidated immediately upon disconnection or
          account deletion.
        </p>

        <h3>Security</h3>
        <p>
          We take reasonable technical and organizational measures to protect your
          data. However, no method of transmission over the internet is completely
          secure, and we cannot guarantee absolute security.
        </p>

        <h3>Contact</h3>
        <p>
          For questions about these terms or your data, contact us at{' '}
          <a href="mailto:jacob.6nyberg@gmail.com">jacob.6nyberg@gmail.com</a>.
        </p>
      </div>
    </>
  );
}
