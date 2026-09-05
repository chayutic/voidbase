// ═══════════════════════════════════════════════════════════════
//  STORE — typed localStorage access
// ═══════════════════════════════════════════════════════════════
//
//  Every persisted preference goes through here. Two reasons:
//
//  1. The raw API is stringly-typed, so reads were scattered as
//     `getItem(k) === "true"` (default false) and `getItem(k) !== "false"`
//     (default true). Those look almost identical and mean the opposite
//     thing — easy to get backwards. `bool()` takes the default explicitly.
//
//  2. KEYS is the single registry of what this app persists. Grep one
//     object instead of the whole codebase.

export const KEYS = {
  // Display
  theme:          "theme",
  statusInfo:     "statusInfo",
  guestMode:      "guestMode",
  sectionLayout:  "sectionLayout",

  // Markets
  stocksRange:    "stocksRange",
  stocksSymbols:  "stocksSymbols",
  expandedCharts: "expandedCharts",
  tickerCount:    "tickerCount",

  // Game Deals
  pinnedGames:    "pinnedGames",
  force90d:       "force90d",

  // Notes
  notesSidebarCollapsed: "notesSidebarCollapsed",

  // Search / Turbo Mode
  turboEnabled:   "turboEnabled",
  turboNewTab:    "turboNewTab",
  turboUdm:       "turboUdm",
  turboPresets:   "turboPresets",
  turboActive:    "turboActivePreset",
};

/** Read a boolean. `fallback` is used when the key was never written. */
export function bool(key, fallback = false) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
}

/** Read an integer, falling back when unset or unparseable. */
export function int(key, fallback = 0) {
  const n = parseInt(localStorage.getItem(key), 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Read JSON, falling back on absent or malformed values. */
export function json(key, fallback = null) {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

/** Read a string. Empty string is treated as unset. */
export function str(key, fallback = null) {
  const raw = localStorage.getItem(key);
  return raw === null || raw === "" ? fallback : raw;
}

/** Write any value. Objects and arrays are JSON-encoded; null clears the key. */
export function set(key, value) {
  if (value === null || value === undefined) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value));
}

/** Remove a key entirely. */
export function remove(key) {
  localStorage.removeItem(key);
}
