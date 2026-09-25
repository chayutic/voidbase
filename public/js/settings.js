// ═══════════════════════════════════════════════════════════════
//  SETTINGS — Control Panel shell and display preferences
// ═══════════════════════════════════════════════════════════════
//
//  Guest Mode is a presentation filter, not a security boundary: it
//  toggles a class on <html> and nothing more. Markup, URLs and every
//  proxy route stay reachable. Do not put private data behind it.
//
//  The display toggles' classes are first set by the inline <head>
//  script in index.html, before paint. Rename one here, rename it there.

import * as store              from "./store.js";
import { KEYS }                from "./store.js";
import { VERSION, TICKER_MAX, readTickerCount } from "./config.js";

/** Fired on document after any Control Panel preference changes. */
export const SETTINGS_CHANGE = "voidbase:settingschange";

function announce(key) {
  document.dispatchEvent(new CustomEvent(SETTINGS_CHANGE, { detail: { key } }));
}

const settingsTrigger = document.getElementById("settingsTrigger");
const settingsPanel   = document.getElementById("settingsPanel");

export function closeSettingsPanel() {
  if (!settingsPanel || !settingsTrigger) return;
  settingsPanel.classList.remove("open");
  settingsTrigger.classList.remove("open");
  settingsTrigger.setAttribute("aria-expanded", "false");
}

function initPanel() {
  if (!settingsTrigger || !settingsPanel) return;

  settingsTrigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isOpen = settingsPanel.classList.toggle("open");
    settingsTrigger.classList.toggle("open", isOpen);
    settingsTrigger.setAttribute("aria-expanded", String(isOpen));
  });

  document.addEventListener("click", (e) => {
    if (!settingsPanel.contains(e.target) && e.target !== settingsTrigger) {
      closeSettingsPanel();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSettingsPanel();
  });
}

/**
 * Wire a checkbox to a persisted boolean.
 * `apply` runs once on load and again on every change.
 */
function bindToggle(elementId, key, fallback, apply) {
  const el = document.getElementById(elementId);
  if (!el) return;

  const initial = store.bool(key, fallback);
  el.checked = initial;
  apply(initial);

  el.addEventListener("change", () => {
    store.set(key, el.checked);
    apply(el.checked);
    announce(key);
  });
}

function initDisplayToggles() {
  const root = document.documentElement;

  bindToggle("statusInfoToggle", KEYS.statusInfo, true, (show) => {
    root.classList.toggle("status-hidden", !show);
  });

  bindToggle("guestModeToggle", KEYS.guestMode, false, (on) => {
    root.classList.toggle("guest-mode", on);
  });

  bindToggle("force90dToggle", KEYS.force90d, false, (on) => {
    root.classList.toggle("force-90d", on);
  });
}

// ── Markets widgets ────────────────────────────────────────────
//  Bound here, not in markets.js, so they still work on the notes page.

function initMarketsWidgets() {
  const expanded = document.getElementById("expandedChartsToggle");
  if (expanded) {
    expanded.checked = store.bool(KEYS.expandedCharts, false);
    expanded.addEventListener("change", () => {
      store.set(KEYS.expandedCharts, expanded.checked);
      announce(KEYS.expandedCharts);
    });
    // markets.js's inline chart toggle writes the same key directly.
    document.addEventListener(SETTINGS_CHANGE, (e) => {
      if (e.detail?.key === KEYS.expandedCharts) {
        expanded.checked = store.bool(KEYS.expandedCharts, false);
      }
    });
  }

  const countEl = document.getElementById("tickerCount");
  const minusEl = document.getElementById("tickerMinus");
  const plusEl  = document.getElementById("tickerPlus");
  if (!countEl || !minusEl || !plusEl) return;

  let count = readTickerCount();

  function paint() {
    countEl.textContent = count;
    minusEl.disabled = count <= 1;
    plusEl.disabled  = count >= TICKER_MAX;
  }

  function step(delta) {
    const next = count + delta;
    if (next < 1 || next > TICKER_MAX) return;
    count = next;
    store.set(KEYS.tickerCount, count);
    paint();
    announce(KEYS.tickerCount);
  }

  minusEl.addEventListener("click", () => step(-1));
  plusEl.addEventListener("click",  () => step(+1));
  paint();
}

function initVersionStamps() {
  const year = new Date().getFullYear();

  const footerLabel = document.getElementById("footerVersionLabel");
  if (footerLabel) footerLabel.textContent = `VOIDBASE ${year} · ${VERSION}`;

  const panelLabel = document.getElementById("settingsVersion");
  if (panelLabel) panelLabel.textContent = `VOIDBASE · ${VERSION}`;
}

export function initSettings() {
  initPanel();
  initDisplayToggles();
  initMarketsWidgets();
  initVersionStamps();
}
