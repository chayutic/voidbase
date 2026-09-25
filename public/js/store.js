// ═══════════════════════════════════════════════════════════════
//  STORE — typed localStorage access
// ═══════════════════════════════════════════════════════════════
//
//  Every persisted preference goes through here, and KEYS is the
//  registry of everything this app persists.

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

// Blocked site data makes merely reading `localStorage` throw. Every
// access goes through these two, so a blocked profile runs on defaults
// instead of aborting whichever module imported this one.
function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(fn) {
  try {
    fn(localStorage);
  } catch {}
}

/** Read a boolean. `fallback` is always explicit — left implicit, a
 *  default-true and a default-false reader look identical. */
export function bool(key, fallback = false) {
  const raw = read(key);
  if (raw === null) return fallback;
  return raw === "true";
}

/** Read an integer, falling back when unset or unparseable. */
export function int(key, fallback = 0) {
  const n = parseInt(read(key), 10);
  return Number.isNaN(n) ? fallback : n;
}

/** Read JSON, falling back on absent or malformed values. */
export function json(key, fallback = null) {
  const raw = read(key);
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
  const raw = read(key);
  return raw === null || raw === "" ? fallback : raw;
}

/** Write any value. Objects and arrays are JSON-encoded; null clears the key. */
export function set(key, value) {
  if (value === null || value === undefined) {
    remove(key);
    return;
  }
  write(ls => ls.setItem(key, typeof value === "object" ? JSON.stringify(value) : String(value)));
}

/** Remove a key entirely. */
export function remove(key) {
  write(ls => ls.removeItem(key));
}
