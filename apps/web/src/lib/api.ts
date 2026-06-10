import { useAuth } from '@clerk/clerk-react';
import { useCallback } from 'react';

const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export function useApi() {
  const { getToken } = useAuth();

  const request = useCallback(async (
    path: string,
    options: RequestInit = {},
  ): Promise<Response> => {
    const token = await getToken();

    return fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, [getToken]);

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
    const token = await getToken();
    return fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  }, [getToken]);

  return { get, post, patch, del, upload, request };
}