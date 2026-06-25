/** Shapes returned by the Elevora comments backend. */

/**
 * How a pin must be positioned. "flow" elements ride the document layer and
 * scroll with the page; "fixed"/"sticky" elements stay in the viewport, so
 * their pins live in a fixed layer and are repositioned on scroll.
 */
export type EffectivePosition = "flow" | "fixed" | "sticky";

/**
 * Stable, semantic signals captured for the clicked element, used to
 * re-identify it on later visits when the DOM (or our CSS selector) has
 * drifted. Position/structure is deliberately excluded — it's the most
 * brittle signal — so everything here is content-derived.
 */
export interface ElementFingerprint {
  tag: string;
  id: string | null;
  role: string | null;
  ariaLabel: string | null;
  /** alt / placeholder / title / name — whichever accessible name exists. */
  accName: string | null;
  /** Trimmed visible text, capped. */
  text: string | null;
  /** data-testid / data-test / data-cy. */
  testId: string | null;
  href: string | null;
}

/**
 * A redundant set of anchors for one element. Resolution tries the cheap,
 * precise selector first, then falls back to fuzzy fingerprint matching —
 * mirroring the Hypothes.is "fragile → robust" anchoring model.
 */
export interface ElementAnchor {
  /** Primary CSS selector (finder-generated, cssPath fallback). */
  selector: string | null;
  fingerprint: ElementFingerprint | null;
  position: EffectivePosition;
}

/**
 * Attributes of the user logged into the *host site* (not the Elevora
 * reviewer) at the moment a comment was left. The host app supplies these via
 * `identify()`; everything is optional. Captured so a comment can be read in
 * the context of the persona that rendered the page — e.g. the same URL looks
 * different to an `rta` than to an `admin`. Snapshotted at submit time, so a
 * persona switch later never rewrites an existing comment.
 */
export interface SessionUser {
  /** Opaque, stable id for the host-site account (preferred join key). */
  id?: string;
  name?: string;
  email?: string;
  /** The persona/role that determines what this user sees, e.g. "rta". */
  role?: string;
  /** The role being previewed when the app supports "view as" impersonation. */
  viewingAs?: string;
  /** Tenant/account/org the user belongs to (multi-tenant apps). */
  orgId?: string;
  /** Plan or tier, when entitlements gate the UI. */
  plan?: string;
  locale?: string;
  /** App-specific escape hatch: flag buckets, experiment arms, etc. */
  custom?: Record<string, string | number | boolean>;
}

/**
 * Rich, human-readable context about what was clicked. Not used for
 * positioning — captured so the team can understand a comment during
 * analysis even if the element later becomes unlocatable.
 */
export interface ClickContext {
  /** One-line description of the element, e.g. `button "Send"`. */
  label: string | null;
  /** Nearest landmark + heading breadcrumb, e.g. `main › Pricing`. */
  section: string | null;
  /** Landmark element/role the click fell within (nav, main, footer…). */
  landmark: string | null;
  /** Heading breadcrumb above the element (outermost → nearest). */
  headings: string[];
  /** Element text snippet (capped). */
  text: string | null;
  /** Truncated outerHTML of the clicked element. */
  html: string | null;
  /** Notable attributes (href, src, alt, type, aria-*, data-*…). */
  attributes: Record<string, string>;
  /** Full URL at capture time. */
  url: string;
  viewport: { width: number; height: number; dpr: number };
  /** Host-site user attributes at submit time, or null if none were set. */
  user: SessionUser | null;
}

export interface CommentRecord {
  id: string;
  pagePath: string;
  selector: string | null;
  xPercent: number;
  yPercent: number;
  body: string;
  status: string;
  createdAt: string;
  /** Present on comments created by widget ≥0.2; older rows omit it. */
  anchor?: ElementAnchor | null;
  /** Reviewer who wrote the comment. Always set by backend ≥0.5. */
  authorName?: string;
  /** True when the authenticated reviewer wrote this comment (gates editing). */
  mine?: boolean;
}

export interface ReviewerInfo {
  name: string;
}

export interface AuthExchangeResponse {
  token: string;
  reviewer: ReviewerInfo;
}

export interface ListCommentsResponse {
  comments: CommentRecord[];
}

export interface CreateCommentInput {
  pagePath: string;
  pageUrl: string;
  selector: string | null;
  xPercent: number;
  yPercent: number;
  body: string;
  /** Redundant anchor set for robust re-location. */
  anchor: ElementAnchor;
  /** Human-readable context for analysis. */
  context: ClickContext;
}

export interface CreatedComment {
  id: string;
  createdAt: string;
}

export interface UpdatedComment {
  id: string;
  body: string;
  status: string;
}

/** Typed error thrown for any non-2xx response. `status` is 0 for network failures. */
export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

interface RequestInitOptions {
  method?: "GET" | "POST" | "PATCH";
  token?: string;
  body?: unknown;
}

/** Tiny JSON fetch wrapper. Throws `ApiError` on any failure. */
export async function apiRequest<T>(
  apiBase: string,
  path: string,
  options: RequestInitOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["content-type"] = "application/json";
  if (options.token) headers.authorization = `Bearer ${options.token}`;

  let response: Response;
  try {
    response = await fetch(`${apiBase}${path}`, {
      method: options.method ?? "GET",
      mode: "cors",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Could not reach the feedback service. Check your connection and try again.");
  }

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const data: unknown = await response.json();
      if (
        data !== null &&
        typeof data === "object" &&
        typeof (data as Record<string, unknown>).message === "string"
      ) {
        message = (data as { message: string }).message;
      }
    } catch {
      // Non-JSON error body; keep the default message.
    }
    throw new ApiError(response.status, message);
  }

  return (await response.json()) as T;
}
