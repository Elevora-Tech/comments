import { h } from "./pins";

/**
 * DevTools-style hover highlight: a fixed, pointer-events:none box (plus a small
 * tag label) drawn over the element under the cursor while comment mode is on.
 * It never mutates the target — position comes from getBoundingClientRect, so
 * viewport coordinates are used directly (no scroll offset).
 */
export class Highlighter {
  private readonly box: HTMLDivElement;
  private readonly label: HTMLSpanElement;

  constructor(parent: HTMLElement) {
    this.box = h("div", "ev-highlight");
    this.label = h("span", "ev-highlight-label");
    this.box.appendChild(this.label);
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
    this.label.textContent = el.tagName.toLowerCase();
    this.box.hidden = false;
  }

  hide(): void {
    this.box.hidden = true;
  }

  destroy(): void {
    this.box.remove();
  }
}
