import { SignedIn, SignedOut, SignIn } from '@clerk/clerk-react';

export function AuthWrapper({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SignedIn>{children}</SignedIn>
      <SignedOut>
        <div style={{
          minHeight: '100vh', display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'var(--surface)',
        }}>
          <SignIn
            appearance={{
              elements: {
                rootBox: { fontFamily: 'var(--font-body)' },
                card: { borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
              },
            }}
          />
        </div>
      </SignedOut>
    </>
  );
}