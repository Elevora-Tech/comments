import type { ClickContext, SessionUser } from "./api";

const HTML_CAP = 600;
const TEXT_CAP = 160;
const USER_STR_CAP = 200;
const USER_CUSTOM_MAX_KEYS = 20;
const LANDMARK_TAGS = new Set(["MAIN", "NAV", "HEADER", "FOOTER", "ASIDE", "SECTION", "FORM", "DIALOG"]);
const LANDMARK_ROLES = new Set([
  "main",
  "navigation",
  "banner",
  "contentinfo",
  "complementary",
  "search",
  "form",
  "dialog",
  "region",
]);
const HEADINGS = new Set(["H1", "H2", "H3", "H4", "H5", "H6"]);
/** Attributes worth keeping verbatim for analysis. */
const NOTABLE_ATTRS = [
  "id",
  "href",
  "src",
  "alt",
  "title",
  "type",
  "name",
  "value",
  "placeholder",
  "role",
  "aria-label",
];

function clamp(text: string, cap: number): string {
  return text.length > cap ? `${text.slice(0, cap)}…` : text;
}

function tidy(text: string | null | undefined): string {
  return (text ?? "").replace(/\s+/g, " ").trim();
}

/** Nearest ancestor that is a semantic landmark, described as tag/role[+label]. */
function nearestLandmark(el: Element): { node: Element | null; label: string | null } {
  let node: Element | null = el;
  while (node && node !== document.body) {
    const role = node.getAttribute("role");
    const isLandmark =
      LANDMARK_TAGS.has(node.tagName) || (role !== null && LANDMARK_ROLES.has(role));
    if (isLandmark) {
      const base = role ?? node.tagName.toLowerCase();
      const aria = tidy(node.getAttribute("aria-label"));
      return { node, label: aria ? `${base} "${aria}"` : base };
    }
    node = node.parentElement;
  }
  return { node: null, label: null };
}

/**
 * Heading breadcrumb above the element: walk up, and at each level scan
 * preceding siblings for the nearest heading. Produces an outermost → nearest
 * trail like ["Pricing", "Enterprise plan"].
 */
function headingTrail(el: Element): string[] {
  const trail: string[] = [];
  let node: Element | null = el;
  while (node && node !== document.body) {
    let sib: Element | null = node.previousElementSibling;
    while (sib) {
      if (HEADINGS.has(sib.tagName)) {
        const text = tidy(sib.textContent);
        if (text) trail.unshift(clamp(text, 80));
        break;
      }
      // A heading may be nested at the start of a preceding block.
      const nested = sib.querySelector?.("h1,h2,h3,h4,h5,h6");
      if (nested) {
        const text = tidy(nested.textContent);
        if (text) {
          trail.unshift(clamp(text, 80));
          break;
        }
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  // De-dupe consecutive repeats from overlapping levels.
  return trail.filter((h, i) => h !== trail[i - 1]);
}

/** One-line human description of the element, e.g. `button "Send"`. */
function describe(el: Element): string {
  const tag = el.tagName.toLowerCase();
  const label =
    tidy(el.getAttribute("aria-label")) ||
    tidy(el.getAttribute("alt")) ||
    tidy(el.getAttribute("placeholder")) ||
    tidy(el.textContent);
  return label ? `${tag} "${clamp(label, 60)}"` : tag;
}

function notableAttributes(el: Element): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of NOTABLE_ATTRS) {
    const value = tidy(el.getAttribute(name));
    if (value) out[name] = clamp(value, 200);
  }
  for (const a of Array.from(el.attributes)) {
    if (a.name.startsWith("data-")) {
      const value = tidy(a.value);
      if (value) out[a.name] = clamp(value, 200);
    }
  }
  return out;
}

/**
 * Capture rich, human-readable context about the clicked element so a comment
 * stays interpretable during analysis even if its anchor later breaks.
 */
export function buildContext(el: Element): ClickContext {
  const landmark = nearestLandmark(el);
  const headings = headingTrail(el);
  const sectionParts: string[] = [];
  if (landmark.label) sectionParts.push(landmark.label);
  if (headings.length) sectionParts.push(headings[headings.length - 1]);

  return {
    label: describe(el),
    section: sectionParts.length ? sectionParts.join(" › ") : null,
    landmark: landmark.label,
    headings,
    text: tidy(el.textContent) ? clamp(tidy(el.textContent), TEXT_CAP) : null,
    html: clamp(el.outerHTML, HTML_CAP),
    attributes: notableAttributes(el),
    url: window.location.href,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    },
    // Host-site identity is owned by the Widget and stamped at submit time.
    user: null,
  };
}

const USER_STRING_FIELDS = [
  "id",
  "name",
  "email",
  "role",
  "viewingAs",
  "orgId",
  "plan",
  "locale",
] as const;

/**
 * Clamp a host-supplied `SessionUser` to known fields with hard caps before it
 * ever leaves the browser. Returns null when nothing usable remains, so an
 * empty `identify({})` doesn't stamp an empty object onto every comment.
 */
export function normalizeUser(raw: SessionUser | null | undefined): SessionUser | null {
  if (!raw || typeof raw !== "object") return null;
  const out: SessionUser = {};
  for (const field of USER_STRING_FIELDS) {
    const value = raw[field];
    if (typeof value === "string") {
      const trimmed = tidy(value);
      if (trimmed) out[field] = clamp(trimmed, USER_STR_CAP);
    }
  }
  if (raw.custom && typeof raw.custom === "object" && !Array.isArray(raw.custom)) {
    const custom: Record<string, string | number | boolean> = {};
    for (const [key, value] of Object.entries(raw.custom).slice(0, USER_CUSTOM_MAX_KEYS)) {
      if (typeof value === "string") {
        const trimmed = tidy(value);
        if (trimmed) custom[clamp(key, 60)] = clamp(trimmed, USER_STR_CAP);
      } else if (typeof value === "number" ? Number.isFinite(value) : typeof value === "boolean") {
        custom[clamp(key, 60)] = value;
      }
    }
    if (Object.keys(custom).length > 0) out.custom = custom;
  }
  return Object.keys(out).length > 0 ? out : null;
}
