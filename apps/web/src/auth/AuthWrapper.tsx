import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import TermsPage from '../pages/TermsPage';
import { isDemoMode } from '../lib/api';

/** Wraps the authenticated app. Unauthenticated users are routed to /home. */
export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Routes>
      {/* /home is only the logged-out landing page — a signed-in user landing
          here (e.g. Clerk's post-sign-in redirect defaulting to the current
          URL) must bounce into the app, or they'd be stuck seeing "Sign in"
          / "Get started" again while already authenticated. */}
      <Route
        path="/home"
        element={
          <>
            <SignedIn><Navigate to="/" replace /></SignedIn>
            <SignedOut><LandingPage /></SignedOut>
          </>
        }
      />
      <Route path="/terms" element={<TermsPage />} />

      {/* Always shows the landing page, signed in or not — this is where the
          ApComp logo links to, deliberately bypassing the /home
          redirect-to-app behavior above. */}
      <Route path="/welcome" element={<LandingPage />} />

      {/* App routes — require auth, except for the "Demo" sandbox: a visitor
          who clicked Demo on the landing page is SignedOut but has a demo-mode
          flag set (see lib/api.ts's isDemoMode()), so they get the real app
          UI wired to a fixed, seeded sandbox account instead of a real one. */}
      <Route
        path="/*"
        element={
          <>
            <SignedIn>{children}</SignedIn>
            <SignedOut>{isDemoMode() ? children : <Navigate to="/home" replace />}</SignedOut>
          </>
        }
      />
    </Routes>
  );
}
