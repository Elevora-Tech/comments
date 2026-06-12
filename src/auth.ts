import { apiRequest, type AuthExchangeResponse } from "./api";

function storageKey(project: string, suffix: "token" | "name"): string {
  return `elevora:${project}:${suffix}`;
}

function safeGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage unavailable (private mode, blocked) — auth just won't persist.
  }
}

function safeRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore.
  }
}

export function getToken(project: string): string | null {
  return safeGet(storageKey(project, "token"));
}

export function getReviewerName(project: string): string | null {
  return safeGet(storageKey(project, "name"));
}

export function clearToken(project: string): void {
  safeRemove(storageKey(project, "token"));
  safeRemove(storageKey(project, "name"));
}

/**
 * Exchange an invite code for a reviewer token and persist it.
 * Throws `ApiError` (401 for a bad code).
 */
export async function exchangeCode(
  apiBase: string,
  project: string,
  code: string,
): Promise<{ token: string; name: string }> {
  const result = await apiRequest<AuthExchangeResponse>(apiBase, "/api/comments/auth", {
    method: "POST",
    body: { project, code },
  });
  safeSet(storageKey(project, "token"), result.token);
  safeSet(storageKey(project, "name"), result.reviewer.name);
  return { token: result.token, name: result.reviewer.name };
}
