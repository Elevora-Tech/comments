import { Widget } from "./widget";

export { ApiError } from "./api";
export type { CommentRecord, SessionUser } from "./api";

import type { SessionUser } from "./api";

export interface ElevoraOptions {
  /** Project key the invite codes were issued for (e.g. "my-site"). */
  project: string;
  /**
   * Feedback backend the widget talks to (your deployment of the Elevora
   * comments API). Required — the package ships with no default backend.
   */
  apiBase: string;
  /**
   * Attributes of the user currently logged into *your* site (not the Elevora
   * reviewer). Optional. Attached to every comment so a report can be read in
   * the context of the persona that saw the page. Update it at runtime with
   * `handle.identify()` when the user switches role/persona.
   */
  user?: SessionUser;
}

export interface ElevoraHandle {
  /** Remove the widget and all of its listeners. */
  destroy(): void;
  /**
   * Set (or clear, with `null`) the host-site user attributes attached to
   * subsequent comments. Call whenever the logged-in persona changes — the new
   * value is snapshotted onto each comment at submit time.
   */
  identify(user: SessionUser | null): void;
}

const instances = new Map<string, ElevoraHandle>();

const NOOP_HANDLE: ElevoraHandle = {
  destroy() {
    // SSR no-op.
  },
  identify() {
    // SSR no-op.
  },
};

/**
 * Mount the Elevora feedback widget. Idempotent per project: calling again
 * with the same project returns the existing instance's handle. Safe to call
 * during SSR (returns a no-op handle).
 */
export function initElevora(options: ElevoraOptions): ElevoraHandle {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return NOOP_HANDLE;
  }

  if (!options.apiBase) {
    console.error("[elevora] apiBase is required — widget not mounted.");
    return NOOP_HANDLE;
  }

  const existing = instances.get(options.project);
  if (existing) return existing;

  const widget = new Widget({
    project: options.project,
    apiBase: options.apiBase.replace(/\/+$/, ""),
    user: options.user,
  });

  const handle: ElevoraHandle = {
    destroy() {
      instances.delete(options.project);
      widget.destroy();
    },
    identify(user) {
      widget.identify(user);
    },
  };
  instances.set(options.project, handle);
  return handle;
}
