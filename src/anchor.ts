import { finder } from "@medv/finder";
import type { ElementAnchor, ElementFingerprint, EffectivePosition } from "./api";

const SIMPLE_ID = /^[A-Za-z][\w-]*$/;
const MAX_DEPTH = 8;
const TEXT_CAP = 80;
const TEST_ID_ATTRS = ["data-testid", "data-test", "data-cy"];
/** Attributes finder may use in a selector (stable, semantic). */
const STABLE_ATTRS = new Set(["role", "name", "type", "rel", "href", "aria-label", "alt"]);

/**
 * Guard used by pin capture: html/body clicks are not anchored to an element —
 * callers fall back to a null selector with document-relative percentages.
 */
export function isCapturable(el: Element): boolean {
  const tag = el.tagName;
  return tag !== "HTML" && tag !== "BODY";
}

/**
 * Fallback CSS path used when finder can't produce a unique selector. Walks up
 * toward document.body (max depth 8). A simple id anchors the path; otherwise
 * segments are `tag:nth-of-type(n)` when same-tag siblings exist, bare `tag`
 * otherwise. Class names are never used.
 */
export function cssPath(el: Element): string {
  const parts: string[] = [];
  let node: Element | null = el;
  let depth = 0;

  while (node && node !== document.body && node !== document.documentElement) {
    if (depth >= MAX_DEPTH) {
      // Truncated before reaching body — return the partial path without a
      // body anchor so it still matches as a loose selector.
      return parts.join(" > ");
    }
    const current: Element = node;
    const id = current.getAttribute("id");
    if (id && SIMPLE_ID.test(id)) {
      parts.unshift(`#${id}`);
      return parts.join(" > ");
    }
    const tag = current.tagName.toLowerCase();
    const parent = current.parentElement;
    if (parent) {
      const sameTag = Array.from(parent.children).filter((c) => c.tagName === current.tagName);
      parts.unshift(
        sameTag.length > 1 ? `${tag}:nth-of-type(${sameTag.indexOf(current) + 1})` : tag,
      );
    } else {
      parts.unshift(tag);
    }
    node = parent;
    depth += 1;
  }

  return parts.length > 0 ? `body > ${parts.join(" > ")}` : "body";
}

/**
 * Best-effort unique selector: finder first (prefers id/class/stable attrs,
 * skips hashed/utility classes, treats positional selectors as last resort),
 * falling back to the hand-rolled cssPath when finder gives up.
 */
export function buildSelector(el: Element): string {
  try {
    return finder(el, {
      attr: (name, value) =>
        (STABLE_ATTRS.has(name) || name.startsWith("data-")) && value.length > 0 && value.length < 100,
      timeoutMs: 1000,
    });
  } catch {
    return cssPath(el);
  }
}

/** Effective positioning, walking ancestors — a child of a fixed element is fixed. */
export function effectivePosition(el: Element): EffectivePosition {
  let node: Element | null = el;
  while (node && node !== document.documentElement) {
    const pos = getComputedStyle(node).position;
    if (pos === "fixed") return "fixed";
    if (pos === "sticky") return "sticky";
    node = node.parentElement;
  }
  return "flow";
}

function attr(el: Element, name: string): string | null {
  const value = el.getAttribute(name);
  return value && value.trim() ? value.trim() : null;
}

function firstAttr(el: Element, names: string[]): string | null {
  for (const name of names) {
    const value = attr(el, name);
    if (value) return value;
  }
  return null;
}

function visibleText(el: Element): string | null {
  const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
  if (!text) return null;
  return text.length > TEXT_CAP ? text.slice(0, TEXT_CAP) : text;
}

export function buildFingerprint(el: Element): ElementFingerprint {
  const id = el.getAttribute("id");
  return {
    tag: el.tagName.toLowerCase(),
    id: id && SIMPLE_ID.test(id) ? id : null,
    role: attr(el, "role"),
    ariaLabel: attr(el, "aria-label"),
    accName: firstAttr(el, ["alt", "placeholder", "title", "name"]),
    text: visibleText(el),
    testId: firstAttr(el, TEST_ID_ATTRS),
    href: el instanceof HTMLAnchorElement ? el.getAttribute("href") : null,
  };
}

export function buildAnchor(el: Element): ElementAnchor {
  return {
    selector: buildSelector(el),
    fingerprint: buildFingerprint(el),
    position: effectivePosition(el),
  };
}

// ---- Resolution ----

const ACCEPT_THRESHOLD = 0.6;
const AMBIGUITY_MARGIN = 0.1;
const MAX_CANDIDATES = 600;

/** Normalised Levenshtein similarity in [0,1] over short, capped strings. */
function strSim(a: string | null, b: string | null): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length;
  const n = b.length;
  const max = Math.max(m, n);
  if (max === 0) return 1;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return 1 - prev[n] / max;
}

/**
 * Weighted similarity of a candidate element to a stored fingerprint. Only
 * signals present in the fingerprint contribute (weights are renormalised),
 * so a button with just text scores fairly against one with a testid + role.
 */
function scoreCandidate(el: Element, fp: ElementFingerprint): number {
  const cand = buildFingerprint(el);
  let score = 0;
  let total = 0;
  const add = (weight: number, sim: number): void => {
    score += weight * sim;
    total += weight;
  };

  add(0.05, cand.tag === fp.tag ? 1 : 0);
  if (fp.testId) add(0.3, cand.testId === fp.testId ? 1 : 0);
  if (fp.id) add(0.2, cand.id === fp.id ? 1 : 0);
  if (fp.role) add(0.12, cand.role === fp.role ? 1 : 0);
  if (fp.ariaLabel) add(0.12, strSim(cand.ariaLabel, fp.ariaLabel));
  if (fp.accName) add(0.1, strSim(cand.accName, fp.accName));
  if (fp.text) add(0.12, strSim(cand.text, fp.text));
  if (fp.href) add(0.06, cand.href === fp.href ? 1 : 0);

  return total > 0 ? score / total : 0;
}

/** Does a structural selector hit plausibly agree with the fingerprint? */
function validates(el: Element, fp: ElementFingerprint): boolean {
  // A structural selector that lands on a different tag, or whose strongest
  // stored signal disagrees, is rejected so we fall through to fuzzy matching.
  if (el.tagName.toLowerCase() !== fp.tag) return false;
  if (fp.testId) return firstAttr(el, TEST_ID_ATTRS) === fp.testId;
  if (fp.id) return el.getAttribute("id") === fp.id;
  return scoreCandidate(el, fp) >= ACCEPT_THRESHOLD;
}

/** Gather a bounded candidate pool for fuzzy matching, cheapest query first. */
function candidatePool(fp: ElementFingerprint): Element[] {
  if (fp.testId) {
    const sel = TEST_ID_ATTRS.map((a) => `[${a}="${cssEscape(fp.testId as string)}"]`).join(",");
    const hits = safeQueryAll(sel);
    if (hits.length) return hits;
  }
  if (fp.id) {
    const byId = document.getElementById(fp.id);
    if (byId) return [byId];
  }
  return safeQueryAll(fp.tag).slice(0, MAX_CANDIDATES);
}

function cssEscape(value: string): string {
  const fn = (window as unknown as { CSS?: { escape?: (v: string) => string } }).CSS?.escape;
  return fn ? fn(value) : value.replace(/["\\]/g, "\\$&");
}

function safeQuery(selector: string): Element | null {
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

function safeQueryAll(selector: string): Element[] {
  try {
    return Array.from(document.querySelectorAll(selector));
  } catch {
    return [];
  }
}

/**
 * Resolve an anchor back to a live element, fragile → robust:
 *   1. CSS selector (unique hit, cross-validated against the fingerprint)
 *   2. CSS selector with multiple hits → best-scoring one
 *   3. fuzzy fingerprint search over a candidate pool
 * Returns null (→ comment is unlocatable) when nothing clears the threshold.
 */
export function resolveAnchor(anchor: ElementAnchor): Element | null {
  const fp = anchor.fingerprint;

  if (anchor.selector) {
    const hits = safeQueryAll(anchor.selector);
    if (hits.length === 1) {
      if (!fp || validates(hits[0], fp)) return hits[0];
    } else if (hits.length > 1 && fp) {
      const best = bestByScore(hits, fp);
      if (best) return best;
    }
  }

  if (fp) {
    const best = bestByScore(candidatePool(fp), fp);
    if (best) return best;
  }

  return null;
}

function bestByScore(candidates: Element[], fp: ElementFingerprint): Element | null {
  let best: Element | null = null;
  let bestScore = 0;
  let secondScore = 0;
  for (const el of candidates) {
    const score = scoreCandidate(el, fp);
    if (score > bestScore) {
      secondScore = bestScore;
      bestScore = score;
      best = el;
    } else if (score > secondScore) {
      secondScore = score;
    }
  }
  if (best && bestScore >= ACCEPT_THRESHOLD && bestScore - secondScore >= AMBIGUITY_MARGIN) {
    return best;
  }
  return null;
}

/** Resolve a legacy (selector-only) comment, kept for rows created pre-anchor. */
export function resolveLegacySelector(selector: string): Element | null {
  return safeQuery(selector);
}
