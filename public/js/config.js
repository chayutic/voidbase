// ═══════════════════════════════════════════════════════════════
//  CONFIG — cross-cutting constants
// ═══════════════════════════════════════════════════════════════

export const VERSION = "v0.7.14";

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
