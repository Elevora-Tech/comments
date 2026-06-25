import {
  ApiError,
  apiRequest,
  type CommentRecord,
  type CreateCommentInput,
  type CreatedComment,
  type ListCommentsResponse,
  type SessionUser,
} from "./api";
import { clearToken, exchangeCode, getReviewerName, getToken } from "./auth";
import { normalizeUser } from "./context";
import { chipClass, h, PinManager, type PinPick } from "./pins";
import { WIDGET_CSS } from "./styles";

const COMMENT_GLYPH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-9 8.36 8.5 8.5 0 0 1-3.4-.7L3 21l1.84-4.6A8.5 8.5 0 1 1 21 11.5z"/></svg>`;

export interface WidgetOptions {
  project: string;
  apiBase: string;
  user?: SessionUser;
}

/**
 * The Elevora widget: a document-sized pointer-events:none host element with
 * an open shadow root. Fixed-position FAB + panel and absolutely-positioned
 * pins all live inside the shadow root; children that need interaction opt
 * back in with pointer-events:auto.
 */
export class Widget {
  private readonly project: string;
  private readonly apiBase: string;
  private readonly host: HTMLDivElement;
  private readonly layer: HTMLDivElement;
  private readonly fab: HTMLButtonElement;
  private readonly panel: HTMLDivElement;
  private readonly pins: PinManager;

  private token: string | null;
  private reviewerName: string | null;
  private currentUser: SessionUser | null;
  private comments: CommentRecord[] = [];
  private currentPath: string;
  private panelOpen = false;
  private commentMode = false;
  private commentIndex = 0;
  private tooltipShown = false;
  private tooltip: HTMLDivElement | null = null;
  private tooltipTimer: number | null = null;
  private authError: string | null = null;
  private notice: string | null = null;
  private lastHeight = 0;
  private readonly routeTimer: number;
  private resizeTimer: number | null = null;
  private destroyed = false;

  private readonly onResize = (): void => {
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => {
      this.resizeTimer = null;
      this.syncLayout();
    }, 150);
  };

  private readonly onPopState = (): void => {
    this.checkRoute();
  };

  /** Left/right arrows cycle through comments while the panel is browsing. */
  private readonly onPanelKey = (event: KeyboardEvent): void => {
    if (!this.panelOpen || !this.token || this.commentMode) return;
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return; // don't hijack typing
    if (this.comments.length < 2) return;
    event.preventDefault();
    this.step(event.key === "ArrowRight" ? 1 : -1);
  };

  constructor(options: WidgetOptions) {
    this.project = options.project;
    this.apiBase = options.apiBase;
    this.currentPath = window.location.pathname;
    this.token = getToken(this.project);
    this.reviewerName = getReviewerName(this.project);
    this.currentUser = normalizeUser(options.user);

    this.host = document.createElement("div");
    this.host.setAttribute("data-elevora", this.project);
    Object.assign(this.host.style, {
      position: "absolute",
      top: "0",
      left: "0",
      width: "100%",
      height: "0px",
      pointerEvents: "none",
      zIndex: "2147483000",
    });

    const shadow = this.host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = WIDGET_CSS;
    shadow.appendChild(style);

    this.layer = h("div", "ev-layer");
    shadow.appendChild(this.layer);

    this.fab = h("button", "ev-fab");
    this.fab.type = "button";
    this.fab.addEventListener("click", () => {
      this.panelOpen = !this.panelOpen;
      this.renderAll();
      if (this.panelOpen && this.token) this.focusCurrentComment();
      else this.pins.clearFocus();
    });
    this.layer.appendChild(this.fab);

    this.panel = h("div", "ev-panel");
    this.panel.hidden = true;
    this.layer.appendChild(this.panel);

    this.pins = new PinManager(this.layer, {
      ownsTarget: (target) => target instanceof Node && this.host.contains(target),
      submit: (pick, body) => this.submitComment(pick, body),
      exitCommentMode: () => {
        this.setCommentMode(false);
      },
    });

    document.body.appendChild(this.host);

    window.addEventListener("resize", this.onResize);
    window.addEventListener("popstate", this.onPopState);
    document.addEventListener("keydown", this.onPanelKey, { capture: true });
    // Lightweight SPA route watcher (Next.js App Router does client-side nav
    // without popstate); also catches late layout growth (images, lazy data).
    this.routeTimer = window.setInterval(() => {
      this.checkRoute();
      if (document.documentElement.scrollHeight !== this.lastHeight) this.syncLayout();
    }, 1000);

    this.syncHostHeight();
    this.renderAll();
    if (this.token) void this.loadComments();
  }

  // ---- Layout ----

  private syncHostHeight(): void {
    // Zero out first so the host's own height never inflates the measurement.
    this.host.style.height = "0px";
    const height = document.documentElement.scrollHeight;
    this.host.style.height = `${height}px`;
    this.lastHeight = height;
  }

  private syncLayout(): void {
    if (this.destroyed) return;
    this.syncHostHeight();
    this.pins.refresh();
    if (this.panelOpen) this.renderPanel();
  }

  // ---- Routing ----

  private checkRoute(): void {
    const path = window.location.pathname;
    if (path === this.currentPath) return;
    this.currentPath = path;
    this.comments = [];
    this.commentIndex = 0;
    this.pins.setComments([]);
    this.pins.clearFocus();
    this.syncHostHeight();
    this.renderAll();
    if (this.token) void this.loadComments();
  }

  // ---- Data ----

  private async loadComments(): Promise<void> {
    const token = this.token;
    if (!token) return;
    const path = this.currentPath;
    try {
      const result = await apiRequest<ListCommentsResponse>(
        this.apiBase,
        `/api/comments?path=${encodeURIComponent(path)}`,
        { token },
      );
      if (this.destroyed || path !== this.currentPath) return;
      this.notice = null;
      this.comments = result.comments;
      if (this.commentIndex >= this.comments.length) this.commentIndex = 0;
      this.pins.setComments(result.comments);
      this.renderAll();
      if (this.panelOpen) this.focusCurrentComment();
    } catch (error) {
      if (this.destroyed) return;
      this.handleApiError(error, "Could not load your comments.");
    }
  }

  private async submitComment(pick: PinPick, body: string): Promise<void> {
    const token = this.token;
    if (!token) throw new ApiError(401, "Not signed in.");
    const input: CreateCommentInput = {
      pagePath: this.currentPath,
      pageUrl: window.location.href,
      selector: pick.selector,
      xPercent: pick.xPercent,
      yPercent: pick.yPercent,
      body,
      anchor: pick.anchor,
      // Snapshot the host-site persona as it is at submit time.
      context: { ...pick.context, user: this.currentUser },
    };
    let created: CreatedComment;
    try {
      created = await apiRequest<CreatedComment>(this.apiBase, "/api/comments", {
        method: "POST",
        token,
        body: input,
      });
    } catch (error) {
      this.handleApiError(error, null);
      throw error;
    }
    const record: CommentRecord = {
      id: created.id,
      createdAt: created.createdAt,
      pagePath: input.pagePath,
      selector: input.selector,
      xPercent: input.xPercent,
      yPercent: input.yPercent,
      body: input.body,
      status: "new",
      anchor: input.anchor,
    };
    this.comments = [...this.comments, record];
    this.pins.setComments(this.comments);
    this.renderAll();
  }

  /** Any 401 → token is invalid/revoked: clear it and fall back to code entry. */
  private handleApiError(error: unknown, fallbackNotice: string | null): void {
    if (error instanceof ApiError && error.status === 401) {
      this.signOut("Your session expired — enter your invite code again.");
      return;
    }
    if (fallbackNotice !== null) {
      this.notice = fallbackNotice;
      this.renderAll();
    }
  }

  private signOut(message: string | null = null): void {
    clearToken(this.project);
    this.token = null;
    this.reviewerName = null;
    this.comments = [];
    this.commentIndex = 0;
    this.notice = null;
    this.authError = message;
    this.pins.setComments([]);
    this.pins.clearFocus();
    this.setCommentMode(false);
    this.renderAll();
  }

  /** Update the host-site user attributes stamped onto subsequent comments. */
  identify(user: SessionUser | null): void {
    this.currentUser = normalizeUser(user);
  }

  // ---- Comment browser ----

  /** Move the browse cursor by `delta`, wrapping, and surface the new comment. */
  private step(delta: number): void {
    const n = this.comments.length;
    if (n === 0) return;
    this.commentIndex = (this.commentIndex + delta + n) % n;
    this.renderPanel();
    this.focusCurrentComment();
  }

  private focusCurrentComment(): void {
    const comment = this.comments[this.commentIndex];
    if (comment) this.pins.focusComment(comment);
  }

  // ---- Comment mode ----

  private setCommentMode(on: boolean): void {
    if (this.commentMode === on) return;
    this.commentMode = on;
    this.pins.setActive(on);
    if (on) {
      this.panelOpen = false;
      this.pins.clearFocus();
      if (!this.tooltipShown) {
        this.tooltipShown = true;
        this.showTooltip("Click anywhere to comment");
      }
    } else {
      this.hideTooltip();
    }
    this.renderAll();
  }

  private showTooltip(text: string): void {
    this.hideTooltip();
    this.tooltip = h("div", "ev-tooltip", text);
    this.layer.appendChild(this.tooltip);
    this.tooltipTimer = window.setTimeout(() => {
      this.hideTooltip();
    }, 4000);
  }

  private hideTooltip(): void {
    if (this.tooltipTimer !== null) {
      window.clearTimeout(this.tooltipTimer);
      this.tooltipTimer = null;
    }
    this.tooltip?.remove();
    this.tooltip = null;
  }

  // ---- Rendering ----

  private renderAll(): void {
    this.renderFab();
    this.renderPanel();
  }

  private renderFab(): void {
    this.fab.classList.toggle("ev-fab-active", this.commentMode);
    if (this.commentMode) {
      this.fab.title = "Comment mode on — click anywhere on the page";
    } else {
      this.fab.title = this.token ? "Elevora feedback" : "Leave feedback";
    }
    const initial = this.reviewerName?.trim().charAt(0).toUpperCase();
    if (this.token && initial) {
      this.fab.textContent = initial;
    } else {
      this.fab.innerHTML = COMMENT_GLYPH;
    }
  }

  private renderPanel(): void {
    this.panel.hidden = !this.panelOpen;
    if (!this.panelOpen) return;
    this.panel.textContent = "";
    if (this.token) {
      this.renderSignedInPanel();
    } else {
      this.renderSignedOutPanel();
    }
  }

  private renderSignedOutPanel(): void {
    this.panel.appendChild(h("p", "ev-title", "Leave feedback"));
    this.panel.appendChild(
      h("p", "ev-subtitle", `Enter the invite code you were given for ${this.project}.`),
    );

    const form = h("form");
    const input = h("input", "ev-input");
    input.type = "text";
    input.placeholder = "e.g. ELV-MAT-4821";
    input.autocomplete = "off";
    input.spellcheck = false;
    input.setAttribute("aria-label", "Invite code");
    const submit = h("button", "ev-btn ev-btn-block", "Continue");
    submit.type = "submit";
    form.appendChild(input);
    form.appendChild(submit);

    const error = h("p", "ev-error");
    error.hidden = this.authError === null;
    if (this.authError !== null) error.textContent = this.authError;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const code = input.value.trim();
      if (!code) return;
      submit.disabled = true;
      submit.textContent = "Checking…";
      exchangeCode(this.apiBase, this.project, code)
        .then(({ token, name }) => {
          if (this.destroyed) return;
          this.token = token;
          this.reviewerName = name;
          this.authError = null;
          this.renderAll();
          void this.loadComments();
        })
        .catch((err: unknown) => {
          if (this.destroyed) return;
          this.authError =
            err instanceof ApiError && err.status === 401
              ? "That code didn't work. Double-check it and try again."
              : "Could not reach the feedback service. Try again in a moment.";
          this.renderPanel();
        });
    });

    this.panel.appendChild(form);
    this.panel.appendChild(error);
  }

  private renderSignedInPanel(): void {
    this.panel.appendChild(h("p", "ev-title", `Hi ${this.reviewerName ?? "there"}`));
    this.panel.appendChild(
      h("p", "ev-subtitle", "Turn on comment mode, then click anywhere on the page."),
    );

    const toggle = h(
      "button",
      `ev-btn ev-toggle${this.commentMode ? " ev-toggle-on" : ""}`,
      `Comment mode: ${this.commentMode ? "On" : "Off"}`,
    );
    toggle.type = "button";
    toggle.addEventListener("click", () => {
      this.setCommentMode(!this.commentMode);
    });
    this.panel.appendChild(toggle);

    if (this.notice !== null) {
      this.panel.appendChild(h("p", "ev-error", this.notice));
    }

    if (this.comments.length === 0) {
      this.panel.appendChild(h("p", "ev-section-label", "Comments on this page"));
      this.panel.appendChild(h("p", "ev-empty", "No comments on this page yet."));
    } else {
      this.panel.appendChild(this.renderCarousel());
    }

    const signOut = h("button", "ev-signout", "Sign out");
    signOut.type = "button";
    signOut.addEventListener("click", () => {
      this.signOut();
    });
    this.panel.appendChild(signOut);
  }

  /**
   * One comment at a time with ‹ › navigation, so a long comment can't blow up
   * the panel. Cycling also scrolls the page to the comment and spotlights it.
   */
  private renderCarousel(): HTMLElement {
    const total = this.comments.length;
    if (this.commentIndex >= total || this.commentIndex < 0) this.commentIndex = 0;
    const comment = this.comments[this.commentIndex]!;
    const unlocatable = new Set(this.pins.getUnlocatable().map((c) => c.id));

    const wrap = h("div");

    const nav = h("div", "ev-nav");
    nav.appendChild(h("span", "ev-nav-count", `Comment ${this.commentIndex + 1} of ${total}`));
    const btns = h("div", "ev-nav-btns");
    const prev = h("button", "ev-nav-btn", "‹");
    prev.type = "button";
    prev.setAttribute("aria-label", "Previous comment");
    prev.addEventListener("click", () => {
      this.step(-1);
    });
    const next = h("button", "ev-nav-btn", "›");
    next.type = "button";
    next.setAttribute("aria-label", "Next comment");
    next.addEventListener("click", () => {
      this.step(1);
    });
    if (total < 2) {
      prev.disabled = true;
      next.disabled = true;
    }
    btns.appendChild(prev);
    btns.appendChild(next);
    nav.appendChild(btns);
    wrap.appendChild(nav);

    const card = h("div", "ev-item");
    card.appendChild(h("div", "ev-card-body", comment.body));
    const meta = h("div", "ev-item-meta");
    const selector = comment.selector ?? comment.anchor?.selector ?? null;
    meta.appendChild(h("span", "ev-item-selector", shortSelector(selector)));
    meta.appendChild(h("span", `ev-chip ${chipClass(comment.status)}`, comment.status));
    card.appendChild(meta);
    if (unlocatable.has(comment.id)) {
      card.appendChild(h("p", "ev-card-note", "Can’t locate this on the current page."));
    }
    wrap.appendChild(card);
    return wrap;
  }

  // ---- Lifecycle ----

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    window.clearInterval(this.routeTimer);
    if (this.resizeTimer !== null) window.clearTimeout(this.resizeTimer);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("popstate", this.onPopState);
    document.removeEventListener("keydown", this.onPanelKey, { capture: true });
    this.hideTooltip();
    this.pins.destroy();
    this.host.remove();
  }
}

function shortSelector(selector: string | null): string {
  if (!selector) return "page position";
  const segments = selector.split(" > ");
  const last = segments[segments.length - 1];
  return last ?? selector;
}
