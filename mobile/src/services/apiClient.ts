/**
 * Central authenticated HTTP client for all RunEasy backend calls.
 *
 * The backend enforces a global Supabase auth guard, so every request must
 * carry `Authorization: Bearer <access_token>`. This wrapper injects it (plus
 * the legacy `x-user-id` header used by the guard's consistency check and the
 * referral throttler), and transparently refreshes the session once on a 401.
 *
 * Migration note: call sites keep building their own URL (BASE_API_URL/...) and
 * passing method/body/headers exactly as before — just swap `fetch(` for
 * `authedFetch(`. Public endpoints (auth login/refresh) must keep using raw
 * `fetch` to avoid a refresh recursion.
 */
import {
  getSessionToken,
  getAuthenticatedUserId,
  refreshSessionViaBackend,
} from './supabase';

async function buildRequest(init: RequestInit): Promise<RequestInit> {
  const token = await getSessionToken();
  const userId = await getAuthenticatedUserId();
  const headers = new Headers(init.headers as HeadersInit | undefined);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (userId && !headers.has('x-user-id')) headers.set('x-user-id', userId);
  return { ...init, headers };
}

/** Tears down the session and routes the app back to login. Lazy-imported to
 *  avoid a circular dependency between apiClient and authStore. */
async function forceLogout(): Promise<void> {
  try {
    const { useAuthStore } = await import('../stores/authStore');
    await useAuthStore.getState().logout();
  } catch {
    // best-effort — AppNavigator also reacts to a missing session
  }
}

export async function authedFetch(
  input: string,
  init: RequestInit = {},
): Promise<Response> {
  let response = await fetch(input, await buildRequest(init));

  if (response.status === 401) {
    const refreshed = await refreshSessionViaBackend();
    if (refreshed) {
      response = await fetch(input, await buildRequest(init));
    }
    if (response.status === 401) {
      await forceLogout();
    }
  }

  return response;
}
