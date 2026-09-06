// ═══════════════════════════════════════════════════════════════
//  THEME — colour scheme selection and persistence
// ═══════════════════════════════════════════════════════════════

import * as store from "./store.js";
import { KEYS }   from "./store.js";

/** Dispatched on document after the new theme is on the DOM. */
export const THEME_CHANGE = "voidbase:themechange";

// Kept in sync with the inline anti-flash script in each page's <head>.
// If you change this, change that too.
const DEFAULT_THEME = "violet";

const themeNames = {
  violet: "Voidbase Violet",
  blue:   "Arctic Blue",
  pink:   "Montepulciano",
  green:  "Jade Dragon",
  black:  "Obsidian Black",
  white:  "Spirit White",
  beige:  "Parchment Beige",
};

const swatches = document.querySelectorAll(".theme__swatch[data-theme]");

export function applyTheme(theme, notify = false) {
  document.documentElement.dataset.theme = theme;
  swatches.forEach(s => s.classList.toggle("active", s.dataset.theme === theme));
  store.set(KEYS.theme, theme);

  const nameEl = document.getElementById("swatchName");
  if (nameEl) nameEl.textContent = themeNames[theme] ?? theme;

  // Skipped on initial load: the features that listen are about to draw
  // themselves anyway, and firing here would make them do it twice.
  if (notify) {
    document.dispatchEvent(new CustomEvent(THEME_CHANGE, { detail: { theme } }));
  }
}

export function initTheme() {
  swatches.forEach(btn => {
    btn.addEventListener("click", () => applyTheme(btn.dataset.theme, true));
  });

  applyTheme(store.str(KEYS.theme, DEFAULT_THEME));
}
