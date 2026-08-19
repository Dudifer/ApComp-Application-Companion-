import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';

export const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
const DEMO_TOKEN = import.meta.env.VITE_DEMO_ACCESS_TOKEN as string | undefined;

// The most recently resolved auth token, cached module-wide. Clerk's
// getToken() is async (it may need a network round-trip to refresh), but a
// page-unload handler (beforeunload/pagehide — see RecLab2.tsx's session-end
// tracking) can't reliably wait on an async call before the page actually
// unloads. Since normal API calls throughout the session keep this fresh,
// reusing the last-known-good token there is a reasonable trade: worst case
// it's slightly stale and the one final request fails, which is fine for a
// best-effort analytics ping.
let lastToken: string | null = null;

/** Synchronous best-effort token for contexts that can't await resolveToken() — see the comment above. */
export function getCachedToken(): string | null {
  if (isDemoMode() && DEMO_TOKEN) return DEMO_TOKEN;
  return lastToken;
}

// Set by the "Demo" button on the landing page (see LandingPage.tsx) and
// read here + by AuthWrapper/App.tsx. A plain localStorage flag rather than
// React context/state, since it only needs to be read at request time and at
// route-guard time — both of which happen on a fresh render anyway.
export const DEMO_MODE_KEY = 'apcomp_demo_mode';

export function isDemoMode(): boolean {
  return typeof window !== 'undefined' && window.localStorage.getItem(DEMO_MODE_KEY) === '1';
}

export function exitDemoMode(): void {
  window.localStorage.removeItem(DEMO_MODE_KEY);
}

export function useApi() {
  const { getToken } = useAuth();

  const resolveToken = useCallback(async () => {
    if (isDemoMode() && DEMO_TOKEN) return DEMO_TOKEN;
    const token = await getToken();
    if (token) lastToken = token;
    return token;
  }, [getToken]);

  const request = useCallback(async (
    path: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const token = await resolveToken();

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, [resolveToken]);

  const get = useCallback((path: string) =>
    request(path, { method: 'GET' }), [request]);

  const post = useCallback((path: string, body?: unknown) =>
    request(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }), [request]);

  const patch = useCallback((path: string, body?: unknown) =>
    request(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }), [request]);

  const del = useCallback((path: string) =>
    request(path, { method: 'DELETE' }), [request]);

  const upload = useCallback(async (path: string, formData: FormData) => {
    const token = await resolveToken();
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [resolveToken]);

  return { get, post, patch, del, upload, request };
}
