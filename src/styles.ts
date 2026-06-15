/** All widget CSS, injected as a single <style> tag inside the shadow root. */
export const WIDGET_CSS = `
*, *::before, *::after { box-sizing: border-box; }

.ev-layer {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  font-size: 13px;
  line-height: 1.45;
  color: #e2e8f0;
}

button { font: inherit; }

/* Viewport-fixed layer: pins on fixed/sticky elements + the hover highlight. */
.ev-layer-fixed {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

/* ---- Hover element highlight (comment-mode picker) ---- */
.ev-highlight {
  position: fixed;
  pointer-events: none;
  border: 2px solid #0ea5e9;
  background: rgba(14, 165, 233, 0.12);
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.65);
  transition: left 60ms ease, top 60ms ease, width 60ms ease, height 60ms ease;
  z-index: 1;
}
.ev-highlight-label {
  position: absolute;
  top: -20px;
  left: -2px;
  background: #0ea5e9;
  color: #f8fafc;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

/* ---- Existing-comment scope outline (hovering a pin or a panel row) ---- */
/* Deliberately distinct from the solid-blue picker: a calmer violet dash so
   "this is where an existing comment lives" never reads as "the element I'm
   about to pin." */
.ev-scope {
  position: fixed;
  pointer-events: none;
  border: 2px dashed #a855f7;
  background: rgba(168, 85, 247, 0.08);
  border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.5);
  transition: left 60ms ease, top 60ms ease, width 60ms ease, height 60ms ease;
  z-index: 1;
}

/* ---- Floating action button ---- */
.ev-fab {
  position: fixed;
  right: 20px;
  bottom: 20px;
  width: 48px;
  height: 48px;
  border-radius: 9999px;
  border: none;
  cursor: pointer;
  pointer-events: auto;
  background: #0f172a;
  color: #f8fafc;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  font-weight: 600;
  box-shadow: 0 4px 14px rgba(2, 6, 23, 0.4), 0 0 0 1px rgba(148, 163, 184, 0.18);
  transition: transform 120ms ease, box-shadow 120ms ease, background 120ms ease;
}
.ev-fab:hover { transform: translateY(-1px); }
.ev-fab.ev-fab-active {
  background: #0ea5e9;
  box-shadow: 0 4px 14px rgba(14, 165, 233, 0.5), 0 0 0 3px rgba(56, 189, 248, 0.45);
}
.ev-fab svg { width: 22px; height: 22px; display: block; }

.ev-tooltip {
  position: fixed;
  right: 20px;
  bottom: 78px;
  pointer-events: none;
  background: #0f172a;
  color: #e2e8f0;
  padding: 7px 11px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.18);
  box-shadow: 0 8px 24px rgba(2, 6, 23, 0.45);
  white-space: nowrap;
  font-size: 12px;
}

/* ---- Panel ---- */
.ev-panel {
  position: fixed;
  right: 20px;
  bottom: 80px;
  width: 320px;
  max-height: min(560px, calc(100vh - 110px));
  overflow-y: auto;
  pointer-events: auto;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 14px;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.5);
  padding: 16px;
}
.ev-title {
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 2px;
  color: #f8fafc;
}
.ev-subtitle {
  margin: 0 0 12px;
  color: #94a3b8;
  font-size: 12px;
}
.ev-input {
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: #1e293b;
  color: #f8fafc;
  outline: none;
  font: inherit;
  letter-spacing: 0.04em;
}
.ev-input::placeholder { color: #475569; }
.ev-input:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
}
.ev-btn {
  border: none;
  border-radius: 8px;
  padding: 8px 12px;
  cursor: pointer;
  background: #0ea5e9;
  color: #f8fafc;
  font-weight: 600;
}
.ev-btn:hover { background: #38bdf8; }
.ev-btn:disabled { opacity: 0.6; cursor: default; }
.ev-btn-secondary {
  background: #1e293b;
  color: #e2e8f0;
  border: 1px solid rgba(148, 163, 184, 0.3);
}
.ev-btn-secondary:hover { background: #334155; }
.ev-btn-block { width: 100%; margin-top: 10px; }
.ev-toggle { width: 100%; margin: 10px 0 4px; }
.ev-toggle.ev-toggle-on {
  background: #1e293b;
  color: #38bdf8;
  border: 1px solid rgba(56, 189, 248, 0.5);
}
.ev-error { color: #f87171; font-size: 12px; margin: 8px 0 0; }
.ev-section-label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #64748b;
  margin: 16px 0 6px;
}
.ev-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.ev-item {
  background: #1e293b;
  border-radius: 10px;
  padding: 9px 10px;
  border: 1px solid rgba(148, 163, 184, 0.12);
}
.ev-item-body {
  color: #f1f5f9;
  margin-bottom: 5px;
  overflow-wrap: anywhere;
}
.ev-item-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ev-item-selector {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 11px;
  color: #64748b;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ev-chip {
  flex: none;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 7px;
  border-radius: 999px;
}
.ev-chip-new { background: rgba(56, 189, 248, 0.15); color: #38bdf8; }
.ev-chip-approved { background: rgba(74, 222, 128, 0.15); color: #4ade80; }
.ev-chip-other { background: rgba(148, 163, 184, 0.15); color: #94a3b8; }
.ev-empty { color: #64748b; font-size: 12px; margin: 0; }
.ev-signout {
  display: inline-block;
  margin-top: 14px;
  background: none;
  border: none;
  padding: 0;
  color: #64748b;
  cursor: pointer;
  font-size: 12px;
  text-decoration: underline;
}
.ev-signout:hover { color: #94a3b8; }

/* ---- Pins ---- */
.ev-pin {
  position: absolute;
  width: 26px;
  height: 26px;
  margin: -13px 0 0 -13px;
  border-radius: 9999px;
  background: #0ea5e9;
  color: #f8fafc;
  border: 2px solid #f8fafc;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  box-shadow: 0 2px 8px rgba(2, 6, 23, 0.45);
  padding: 0;
}
.ev-pin:hover { background: #38bdf8; }
.ev-pin-temp { background: #f59e0b; }
.ev-pin-temp:hover { background: #f59e0b; }

/* ---- Composer + popover ---- */
.ev-composer,
.ev-popover {
  position: absolute;
  width: 264px;
  pointer-events: auto;
  background: #0f172a;
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 12px;
  box-shadow: 0 18px 40px rgba(2, 6, 23, 0.5);
  padding: 12px;
  font-size: 13px;
}
.ev-composer textarea {
  width: 100%;
  min-height: 64px;
  resize: vertical;
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: #1e293b;
  color: #f8fafc;
  outline: none;
  font: inherit;
}
.ev-composer textarea:focus {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.25);
}
.ev-composer-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.ev-popover-body { margin: 0 0 8px; color: #f1f5f9; overflow-wrap: anywhere; }
`;
