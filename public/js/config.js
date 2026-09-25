// ═══════════════════════════════════════════════════════════════
//  CONFIG — cross-cutting constants
// ═══════════════════════════════════════════════════════════════

import * as store from "./store.js";
import { KEYS }   from "./store.js";

export const VERSION = "v0.7.18";

/**
 * Jellyfin base URL for browser-facing links. A LAN address, so these
 * links resolve only on the local network or over Tailscale, never
 * through the tunnel. Poster images are unaffected — they proxy
 * server-side.
 */
export const JELLYFIN_BASE = "http://192.168.1.41:8096";

/** Upper bound on the ticker stepper, which the Control Panel binds
 *  while Markets owns the symbols themselves. */
export const TICKER_MAX = 6;

/** The stored ticker count, clamped to the stepper's range. Both
 *  readers go through here: a value above TICKER_MAX locks the stepper,
 *  and one below 1 empties Markets. */
export function readTickerCount() {
  return Math.min(Math.max(store.int(KEYS.tickerCount, TICKER_MAX), 1), TICKER_MAX);
}
