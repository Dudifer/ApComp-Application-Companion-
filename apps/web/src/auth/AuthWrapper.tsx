import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import TermsPage from '../pages/TermsPage';

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

      {/* App routes — require auth */}
      <Route
        path="/*"
        element={
          <>
            <SignedIn>{children}</SignedIn>
            <SignedOut><Navigate to="/home" replace /></SignedOut>
          </>
        }
      />
    </Routes>
  );
}
