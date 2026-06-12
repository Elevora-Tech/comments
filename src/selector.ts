const SIMPLE_ID = /^[A-Za-z][\w-]*$/;
const MAX_DEPTH = 8;

/**
 * Build a stable-ish CSS path for an element: walk up toward document.body
 * (max depth 8). A node with a simple id anchors the path (`#id > ...`);
 * otherwise segments are `tag:nth-of-type(n)` when same-tag siblings exist,
 * bare `tag` otherwise. Class names are never used.
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
 * Guard used by pin capture: html/body clicks are not anchored to an element —
 * callers fall back to a null selector with document-relative percentages.
 */
export function isCapturable(el: Element): boolean {
  const tag = el.tagName;
  return tag !== "HTML" && tag !== "BODY";
}
