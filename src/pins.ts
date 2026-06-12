import type { CommentRecord } from "./api";
import { cssPath, isCapturable } from "./selector";

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

function clampPercent(value: number): number {
  return Math.round(Math.min(100, Math.max(0, value)) * 10) / 10;
}

/**
 * Owns everything page-coordinate-based: comment-mode click capture, the
 * temporary pin + composer, and rendering of existing pins with popovers.
 * The layer it renders into is an absolutely-positioned, document-sized,
 * pointer-events:none container inside the widget's shadow root.
 */
export class PinManager {
  private readonly layer: HTMLElement;
  private readonly cb: PinManagerCallbacks;
  private readonly pinsContainer: HTMLDivElement;

  private comments: CommentRecord[] = [];
  private unlocatable: CommentRecord[] = [];
  private active = false;
  private composer: HTMLDivElement | null = null;
  private tempPin: HTMLDivElement | null = null;
  private popover: HTMLDivElement | null = null;
  private popoverCommentId: string | null = null;
  private cursorStyle: HTMLStyleElement | null = null;

  constructor(layer: HTMLElement, callbacks: PinManagerCallbacks) {
    this.layer = layer;
    this.cb = callbacks;
    this.pinsContainer = h("div");
    this.layer.appendChild(this.pinsContainer);
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
      return {
        selector: null,
        xPercent: clampPercent((event.pageX / Math.max(docEl.scrollWidth, 1)) * 100),
        yPercent: clampPercent((event.pageY / Math.max(docEl.scrollHeight, 1)) * 100),
        pageX: event.pageX,
        pageY: event.pageY,
      };
    }
    const rect = target.getBoundingClientRect();
    return {
      selector: cssPath(target),
      xPercent: clampPercent(rect.width > 0 ? ((event.clientX - rect.left) / rect.width) * 100 : 50),
      yPercent: clampPercent(rect.height > 0 ? ((event.clientY - rect.top) / rect.height) * 100 : 50),
      pageX: event.pageX,
      pageY: event.pageY,
    };
  }

  setActive(on: boolean): void {
    if (this.active === on) return;
    this.active = on;
    if (on) {
      document.addEventListener("click", this.onDocumentClick, { capture: true });
      document.addEventListener("keydown", this.onKeyDown, { capture: true });
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

  /** Comments whose selector no longer matches anything on the page. */
  getUnlocatable(): CommentRecord[] {
    return this.unlocatable;
  }

  /**
   * Re-resolve selectors and re-render pins. Locatability is always computed
   * (the panel lists it even when comment mode is off); pin elements are only
   * rendered while comment mode is on.
   */
  refresh(): void {
    this.unlocatable = [];
    this.pinsContainer.textContent = "";
    this.closePopover();
    const docEl = document.documentElement;

    this.comments.forEach((comment, index) => {
      let x: number;
      let y: number;
      if (comment.selector) {
        let target: Element | null = null;
        try {
          target = document.querySelector(comment.selector);
        } catch {
          target = null;
        }
        if (!target) {
          this.unlocatable.push(comment);
          return;
        }
        const rect = target.getBoundingClientRect();
        x = rect.left + window.scrollX + (rect.width * comment.xPercent) / 100;
        y = rect.top + window.scrollY + (rect.height * comment.yPercent) / 100;
      } else {
        x = (docEl.scrollWidth * comment.xPercent) / 100;
        y = (docEl.scrollHeight * comment.yPercent) / 100;
      }

      if (!this.active) return;

      const pin = h("button", "ev-pin", String(index + 1));
      pin.type = "button";
      pin.style.left = `${x}px`;
      pin.style.top = `${y}px`;
      pin.addEventListener("click", () => {
        this.togglePopover(comment, x, y);
      });
      this.pinsContainer.appendChild(pin);
    });
  }

  private togglePopover(comment: CommentRecord, x: number, y: number): void {
    if (this.popoverCommentId === comment.id) {
      this.closePopover();
      return;
    }
    this.closePopover();
    const popover = h("div", "ev-popover");
    popover.appendChild(h("p", "ev-popover-body", comment.body));
    const chip = h("span", `ev-chip ${chipClass(comment.status)}`, comment.status);
    popover.appendChild(chip);
    this.positionCard(popover, x, y);
    this.layer.appendChild(popover);
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
    this.positionCard(composer, pick.pageX, pick.pageY);
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

  /** Position a card next to a page point, clamped inside the document. */
  private positionCard(card: HTMLElement, pageX: number, pageY: number): void {
    const docWidth = document.documentElement.scrollWidth;
    const left = Math.min(Math.max(8, pageX + 16), Math.max(8, docWidth - COMPOSER_WIDTH - 8));
    card.style.left = `${left}px`;
    card.style.top = `${Math.max(8, pageY + 14)}px`;
  }

  destroy(): void {
    this.setActive(false);
    this.pinsContainer.remove();
  }
}

export function chipClass(status: string): string {
  if (status === "new") return "ev-chip-new";
  if (status === "approved") return "ev-chip-approved";
  return "ev-chip-other";
}
