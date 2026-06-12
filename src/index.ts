import { Widget } from "./widget";

export { ApiError } from "./api";
export type { CommentRecord } from "./api";

const DEFAULT_API_BASE = "https://mat-api-orcin.vercel.app";

export interface ElevoraOptions {
  /** Project key the invite codes were issued for (e.g. "hockeytime"). */
  project: string;
  /** Override the feedback backend. Defaults to Elevora's hosted API. */
  apiBase?: string;
}

export interface ElevoraHandle {
  /** Remove the widget and all of its listeners. */
  destroy(): void;
}

const instances = new Map<string, ElevoraHandle>();

const NOOP_HANDLE: ElevoraHandle = {
  destroy() {
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

  const existing = instances.get(options.project);
  if (existing) return existing;

  const widget = new Widget({
    project: options.project,
    apiBase: options.apiBase ?? DEFAULT_API_BASE,
  });

  const handle: ElevoraHandle = {
    destroy() {
      instances.delete(options.project);
      widget.destroy();
    },
  };
  instances.set(options.project, handle);
  return handle;
}
