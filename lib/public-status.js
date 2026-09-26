// ═══════════════════════════════════════════════════════════════
//  PUBLIC STATUS
// ═══════════════════════════════════════════════════════════════
//
//  The only status reader a public route may use, and it knows one
//  file. Ops decides what the public sees by what it writes into
//  public.json, so nothing here may open another file in status/,
//  not even to filter it (contract § 2).

const fs   = require("fs/promises");
const path = require("path");

const STATUS_DIR  = process.env.STATUS_DIR || "/app/status";
const PUBLIC_FILE = path.join(STATUS_DIR, "public.json");

const STALE_MS = 15 * 60_000;
const STATES   = new Set(["ok", "degraded", "down"]);

/** public.json's `overall`, or "unknown" when the file is missing,
 *  stale, unreadable or on a schema this code doesn't know. */
async function overall() {
  let data;
  try {
    data = JSON.parse(await fs.readFile(PUBLIC_FILE, "utf8"));
  } catch (err) {
    if (err.code !== "ENOENT") console.error("public.json unreadable:", err.message);
    return "unknown";
  }

  // Negated so a missing or unparseable `generated`, whose age is NaN,
  // fails the comparison and lands on unknown too.
  const age = Date.now() - Date.parse(data?.generated);
  if (!(Math.abs(age) <= STALE_MS)) return "unknown";

  if (data.schema !== 1 || !STATES.has(data.overall)) return "unknown";
  return data.overall;
}

module.exports = { overall };
