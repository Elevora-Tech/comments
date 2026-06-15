import type { ClickContext, CommentRecord, ElementAnchor, EffectivePosition } from "./api";
import {
  buildAnchor,
  effectivePosition,
  isCapturable,
  resolveAnchor,
  resolveLegacySelector,
} from "./anchor";
import { buildContext } from "./context";
import { Highlighter } from "./highlight";

/** Tiny element helper shared by widget + pin code. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface PinPick {
  selector: string | null;
  xPercent: number;
  yPercent: number;
  pageX: number;
  pageY: number;
  anchor: ElementAnchor;
  context: ClickContext;
}

export interface PinManagerCallbacks {
  /** True when the (retargeted) event target belongs to the widget host. */
  ownsTarget(target: EventTarget | null): boolean;
  /** POST the comment. Resolves on success; throws to keep the composer open. */
  submit(pick: PinPick, body: string): Promise<void>;
  /** Escape pressed with nothing else open. */
  exitCommentMode(): void;
}

const CURSOR_STYLE_ATTR = "data-elevora-cursor";
const COMPOSER_WIDTH = 264;

/** A rendered pin and the data needed to reposition it on scroll. */
interface LivePin {
  comment: CommentRecord;
  el: Element | null;
  xPercent: number;
  yPercent: number;
  position: EffectivePosition;
  pinEl: HTMLButtonElement;
}

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/** A 0×0 rect or detached/display:none element can't be located meaningfully. */
function isRenderable(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return !(el instanceof HTMLElement) || el.offsetParent !== null || getComputedStyle(el).position === "fixed";
}

/**
 * Owns everything page-coordinate-based: comment-mode click capture, the
 * hover highlight, the temporary pin + composer, and rendering of existing
 * pins with popovers.
 *
 * Flow elements scroll with the page, so their pins live in a document-sized
 * absolute layer. Fixed/sticky elements stay in the viewport, so their pins
 * live in a `position:fixed` layer and are repositioned on every scroll.
 */
export class PinManager {
  private readonly layer: HTMLElement;
  private readonly cb: PinManagerCallbacks;
  private readonly pinsContainer: HTMLDivElement;
  private readonly fixedLayer: HTMLDivElement;
  private readonly fixedPinsContainer: HTMLDivElement;
  private readonly highlighter: Highlighter;

  private comments: CommentRecord[] = [];
  private unlocatable: CommentRecord[] = [];
  private livePins: LivePin[] = [];
  private active = false;
  private composer: HTMLDivElement | null = null;
  private tempPin: HTMLDivElement | null = null;
  private popover: HTMLDivElement | null = null;
  private popoverCommentId: string | null = null;
  private cursorStyle: HTMLStyleElement | null = null;
  private moveRaf: number | null = null;
  private scrollRaf: number | null = null;

  constructor(layer: HTMLElement, callbacks: PinManagerCallbacks) {
    this.layer = layer;
    this.cb = callbacks;
    this.pinsContainer = h("div");
    this.layer.appendChild(this.pinsContainer);
    // A viewport-fixed sibling layer for pins on fixed/sticky elements and the
    // hover highlight. Fixed positioning works here because no ancestor is
    // transformed.
    this.fixedLayer = h("div", "ev-layer-fixed");
    this.layer.appendChild(this.fixedLayer);
    this.fixedPinsContainer = h("div");
    this.fixedLayer.appendChild(this.fixedPinsContainer);
    this.highlighter = new Highlighter(this.fixedLayer);
  }

  /**
   * Capture-phase click handler on document. Page clicks are swallowed
   * (links/buttons on the host page must not fire) and turned into pin picks;
   * clicks on the widget's own UI (event retargeted to the host element) pass
   * through untouched.
   */
  private readonly onDocumentClick = (event: MouseEvent): void => {
    if (!this.active) return;
    if (this.cb.ownsTarget(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
    this.closePopover();
    const target = event.target instanceof Element ? event.target : null;
    this.openComposer(this.buildPick(event, target));
  };

  private readonly onPointerMove = (event: MouseEvent): void => {
    if (!this.active) return;
    if (this.moveRaf !== null) return;
    const { clientX, clientY } = event;
    this.moveRaf = window.requestAnimationFrame(() => {
      this.moveRaf = null;
      const el = document.elementFromPoint(clientX, clientY);
      if (!el || this.cb.ownsTarget(el) || !isCapturable(el)) {
        this.highlighter.hide();
        return;
      }
      this.highlighter.show(el);
    });
  };

  private readonly onScroll = (): void => {
    if (this.scrollRaf !== null) return;
    this.scrollRaf = window.requestAnimationFrame(() => {
      this.scrollRaf = null;
      this.repositionFixedPins();
    });
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.active || event.key !== "Escape") return;
    if (this.composer) {
      this.closeComposer();
      return;
    }
    if (this.popover) {
      this.closePopover();
      return;
    }
    this.cb.exitCommentMode();
  };

  private buildPick(event: MouseEvent, target: Element | null): PinPick {
    const docEl = document.documentElement;
    if (!target || !isCapturable(target)) {
      // html/body click — no element anchor; percentages are document-relative.
      const fallback: PinPick = {
        selector: null,
        xPercent: clampPercent((event.pageX / Math.max(docEl.scrollWidth, 1)) * 100),
        yPercent: clampPercent((event.pageY / Math.max(docEl.scrollHeight, 1)) * 100),
        pageX: event.pageX,
        pageY: event.pageY,
        anchor: { selector: null, fingerprint: null, position: "flow" },
        context: buildContext(target ?? docEl),
      };
      return fallback;
    }
    const rect = target.getBoundingClientRect();
    const anchor = buildAnchor(target);
    return {
      selector: anchor.selector,
      xPercent: clampPercent(rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50),
      yPercent: clampPercent(rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50),
      pageX: event.pageX,
      pageY: event.pageY,
      anchor,
      context: buildContext(target),
    };
  }

  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    if (on) {
      document.addEventListener("click", this.onDocumentClick, { capture: true });
      document.addEventListener("keydown", this.onKeyDown, { capture: true });
      document.addEventListener("mousemove", this.onPointerMove, { passive: true });
      window.addEventListener("scroll", this.onScroll, { passive: true, capture: true });
      // Crosshair cursor for the whole page. A pointer-intercepting overlay
      // would mask the real click target, so the cursor is a light-DOM style
      // tag instead (removed the moment comment mode ends).
      const style = document.createElement("style");
      style.setAttribute(CURSOR_STYLE_ATTR, "");
      style.textContent = "*, *::before, *::after { cursor: crosshair !important; }";
      document.head.appendChild(style);
      this.cursorStyle = style;
    } else {
      document.removeEventListener("click", this.onDocumentClick, { capture: true });
      document.removeEventListener("keydown", this.onKeyDown, { capture: true });
      document.removeEventListener("mousemove", this.onPointerMove);
      window.removeEventListener("scroll", this.onScroll, { capture: true });
      if (this.moveRaf !== null) window.cancelAnimationFrame(this.moveRaf);
      if (this.scrollRaf !== null) window.cancelAnimationFrame(this.scrollRaf);
      this.moveRaf = null;
      this.scrollRaf = null;
      this.highlighter.hide();
      this.cursorStyle?.remove();
      this.cursorStyle = null;
      this.closeComposer();
      this.closePopover();
    }
    this.refresh();
  }

  setComments(comments: CommentRecord[]): void {
    this.comments = comments;
    this.refresh();
  }

  /** Comments whose anchor no longer resolves to anything on the page. */
  getUnlocatable(): CommentRecord[] {
    return this.unlocatable;
  }

  /**
   * Re-resolve anchors and re-render pins. Locatability is always computed
   * (the panel lists it even when comment mode is off); pin elements are only
   * rendered while comment mode is on.
   */
  refresh(): void {
    this.unlocatable = [];
    this.livePins = [];
    this.pinsContainer.textContent = "";
    this.fixedPinsContainer.textContent = "";
    this.closePopover();

    this.comments.forEach((comment, index) => {
      const el = this.resolveComment(comment);
      const hasSelector = comment.anchor?.selector != null || comment.selector != null;

      if (hasSelector && !el) {
        this.unlocatable.push(comment);
        return;
      }
      if (el && !isRenderable(el)) {
        // Anchor matched but the element is currently hidden — list it, no pin.
        this.unlocatable.push(comment);
        return;
      }

      if (!this.active) return;

      const position: EffectivePosition = el
        ? comment.anchor?.position ?? effectivePosition(el)
        : "flow";
      const pin = h("button", "ev-pin", String(index + 1));
      pin.type = "button";
      const live: LivePin = {
        comment,
        el,
        xPercent: comment.xPercent,
        yPercent: comment.yPercent,
        position,
        pinEl: pin,
      };
      this.placePin(live);
      pin.addEventListener("click", () => {
        this.togglePopover(live);
      });
      (position === "flow" ? this.pinsContainer : this.fixedPinsContainer).appendChild(pin);
      this.livePins.push(live);
    });
  }

  /** Resolve a comment to its live element, preferring the rich anchor. */
  private resolveComment(comment: CommentRecord): Element | null {
    if (comment.anchor && (comment.anchor.selector || comment.anchor.fingerprint)) {
      return resolveAnchor(comment.anchor);
    }
    if (comment.selector) return resolveLegacySelector(comment.selector);
    return null; // document-relative pin
  }

  /** Set a pin's left/top from its element + offset, in the right coord space. */
  private placePin(live: LivePin): void {
    const docEl = document.documentElement;
    if (!live.el) {
      // Document-relative pin (html/body click): page coordinates.
      live.pinEl.style.left = `${(docEl.scrollWidth * live.xPercent) / 100}px`;
      live.pinEl.style.top = `${(docEl.scrollHeight * live.yPercent) / 100}px`;
      return;
    }
    const rect = live.el.getBoundingClientRect();
    const offsetX = (rect.width * live.xPercent) / 100;
    const offsetY = (rect.height * live.yPercent) / 100;
    if (live.position === "flow") {
      // Document coordinates — the absolute layer scrolls with the page.
      live.pinEl.style.left = `${rect.left + window.scrollX + offsetX}px`;
      live.pinEl.style.top = `${rect.top + window.scrollY + offsetY}px`;
    } else {
      // Viewport coordinates — fixed layer; no scroll offset added.
      live.pinEl.style.left = `${rect.left + offsetX}px`;
      live.pinEl.style.top = `${rect.top + offsetY}px`;
    }
  }

  /** Re-place pins anchored to fixed/sticky elements after a scroll. */
  private repositionFixedPins(): void {
    let moved = false;
    for (const live of this.livePins) {
      if (live.position === "flow" || !live.el) continue;
      this.placePin(live);
      moved = true;
    }
    // Popovers are anchored to a single point; close on scroll rather than
    // drift. (Only matters when a fixed-pin popover is open.)
    if (moved && this.popover) this.closePopover();
  }

  private togglePopover(live: LivePin): void {
    const comment = live.comment;
    if (this.popoverCommentId === comment.id) {
      this.closePopover();
      return;
    }
    this.closePopover();
    const popover = h("div", "ev-popover");
    popover.appendChild(h("p", "ev-popover-body", comment.body));
    const chip = h("span", `ev-chip ${chipClass(comment.status)}`, comment.status);
    popover.appendChild(chip);
    const left = parseFloat(live.pinEl.style.left) || 0;
    const top = parseFloat(live.pinEl.style.top) || 0;
    if (live.position === "flow") {
      this.positionCard(popover, left, top, false);
      this.layer.appendChild(popover);
    } else {
      this.positionCard(popover, left, top, true);
      this.fixedLayer.appendChild(popover);
    }
    this.popover = popover;
    this.popoverCommentId = comment.id;
  }

  private closePopover(): void {
    this.popover?.remove();
    this.popover = null;
    this.popoverCommentId = null;
  }

  private openComposer(pick: PinPick): void {
    this.closeComposer();

    const tempPin = h("div", "ev-pin ev-pin-temp", "+");
    tempPin.style.left = `${pick.pageX}px`;
    tempPin.style.top = `${pick.pageY}px`;
    this.layer.appendChild(tempPin);
    this.tempPin = tempPin;

    const composer = h("div", "ev-composer");
    const textarea = h("textarea");
    textarea.placeholder = "What should change here?";
    const error = h("p", "ev-error");
    error.hidden = true;
    const actions = h("div", "ev-composer-actions");
    const cancel = h("button", "ev-btn ev-btn-secondary", "Cancel");
    cancel.type = "button";
    const send = h("button", "ev-btn", "Send");
    send.type = "button";
    actions.appendChild(cancel);
    actions.appendChild(send);
    composer.appendChild(textarea);
    composer.appendChild(error);
    composer.appendChild(actions);
    this.positionCard(composer, pick.pageX, pick.pageY, false);
    this.layer.appendChild(composer);
    this.composer = composer;
    textarea.focus();

    const submit = (): void => {
      const body = textarea.value.trim();
      if (!body) {
        error.textContent = "Write a quick note first.";
        error.hidden = false;
        return;
      }
      error.hidden = true;
      textarea.disabled = true;
      cancel.disabled = true;
      send.disabled = true;
      send.textContent = "Sending…";
      this.cb
        .submit(pick, body)
        .then(() => {
          // Widget re-renders pins from its updated comment list; just close.
          if (this.composer === composer) this.closeComposer();
        })
        .catch((err: unknown) => {
          // Composer may already be gone (e.g. 401 → widget signed out).
          if (this.composer !== composer) return;
          textarea.disabled = false;
          cancel.disabled = false;
          send.disabled = false;
          send.textContent = "Send";
          error.textContent = err instanceof Error ? err.message : "Could not send. Try again.";
          error.hidden = false;
        });
    };

    cancel.addEventListener("click", () => {
      this.closeComposer();
    });
    send.addEventListener("click", submit);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        submit();
      }
    });
  }

  private closeComposer(): void {
    this.composer?.remove();
    this.composer = null;
    this.tempPin?.remove();
    this.tempPin = null;
  }

  /**
   * Position a card next to a point, clamped inside its coordinate space:
   * the document for flow pins, the viewport for fixed/sticky pins.
   */
  private positionCard(card: HTMLElement, x: number, y: number, fixed: boolean): void {
    const width = fixed ? window.innerWidth : document.documentElement.scrollWidth;
    const left = Math.min(Math.max(8, x + 16), Math.max(8, width - COMPOSER_WIDTH - 8));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, y + 14)}px`;
  }

  destroy(): void {
    this.setActive(false);
    this.highlighter.destroy();
    this.pinsContainer.remove();
    this.fixedLayer.remove();
  }
}

export function chipClass(status: string): string {
  if (status === "new") return "ev-chip-new";
  if (status === "approved") return "ev-chip-approved";
  return "ev-chip-other";
}
