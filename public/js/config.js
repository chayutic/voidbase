// ═══════════════════════════════════════════════════════════════
//  CONFIG — cross-cutting constants
// ═══════════════════════════════════════════════════════════════
//
//  Feature-specific tuning values live in their own modules. Only
//  things read by more than one module belong here.

/** Shown in the footer and the Control Panel. Update in one place. */
export const VERSION = "v0.7.4";

/**
 * Jellyfin base URL used for *browser-facing* links (New Arrivals cards,
 * the "Go to Library" card, the Media & Photos service card).
 *
 * Note this is a LAN address, so those links only resolve on the local
 * network or over Tailscale — they will not work for a browser reaching
 * Voidbase through the Cloudflare tunnel. Poster images are unaffected;
 * they proxy through /jellyfin/image/ server-side.
 */
export const JELLYFIN_BASE = "http://192.168.1.41:8096";

/**
 * Upper bound on the Markets ticker stepper. Lives here because the
 * Control Panel binds the stepper (so it works from the notes page too)
 * while Markets owns the symbols themselves.
 */
export const TICKER_MAX = 6;
