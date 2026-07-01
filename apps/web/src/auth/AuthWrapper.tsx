import { SignedIn, SignedOut } from '@clerk/clerk-react';
import { Routes, Route, Navigate } from 'react-router-dom';
import LandingPage from '../pages/LandingPage';
import TermsPage from '../pages/TermsPage';

/** Wraps the authenticated app. Unauthenticated users are routed to /home. */
export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <Routes>
      {/* Public routes — always accessible */}
      <Route path="/home" element={<LandingPage />} />
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
