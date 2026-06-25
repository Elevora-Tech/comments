import { h } from "./pins";

export interface HighlighterOptions {
  /** Root box class. Defaults to the comment-mode picker style (`ev-highlight`). */
  className?: string;
  /** Show the small tag-name label above the box. Defaults to true. */
  showLabel?: boolean;
}

/**
 * DevTools-style hover highlight: a fixed, pointer-events:none box (plus an
 * optional tag label) drawn over a target element. It never mutates the target
 * — position comes from getBoundingClientRect, so viewport coordinates are used
 * directly (no scroll offset).
 *
 * Two flavours share this class:
 *  - the comment-mode picker (solid blue, tag label) that tracks the cursor;
 *  - the existing-comment scope outline (`ev-scope`, dashed, no label) shown
 *    when hovering a pin or a panel row.
 */
export class Highlighter {
  private readonly box: HTMLDivElement;
  private readonly label: HTMLSpanElement | null;

  constructor(parent: HTMLElement, options: HighlighterOptions = {}) {
    this.box = h("div", options.className ?? "ev-highlight");
    if (options.showLabel ?? true) {
      this.label = h("span", "ev-highlight-label");
      this.box.appendChild(this.label);
    } else {
      this.label = null;
    }
    this.box.hidden = true;
    parent.appendChild(this.box);
  }

  /** Draw the box over `el`, or hide it when `el` is null. */
  show(el: Element | null): void {
    if (!el) {
      this.hide();
      return;
    }
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) {
      this.hide();
      return;
    }
    Object.assign(this.box.style, {
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
    });
    if (this.label) this.label.textContent = el.tagName.toLowerCase();
    this.box.hidden = false;
  }

  hide(): void {
    this.box.hidden = true;
  }

  destroy(): void {
    this.box.remove();
  }
}
