// ═══════════════════════════════════════════════════════════════
//  OPS STATUS
// ═══════════════════════════════════════════════════════════════
//
//  The private reader for status/. Only the ops router may use it:
//  public routes read public.json through public-status.js and
//  nothing else (contract § 2).

const fs   = require("fs/promises");
const path = require("path");

const STATUS_DIR  = process.env.STATUS_DIR || "/app/status";
const HEALTH_FILE = path.join(STATUS_DIR, "health.json");

const STALE_MS = 15 * 60_000;

/**
 * What health.json can say right now. `file` is one of
 *
 *   fresh     `overall` and `checks` are current
 *   stale     older than 15 minutes: the collector has stopped
 *   missing   never written, which the contract treats as stale
 *   schema    a version this code can't read, so nothing is guessed
 *
 * Only `fresh` carries checks. A stale file's states are last-known,
 * not current, so they never leave the server.
 */
async function health() {
  const checked = new Date().toISOString();

  let data;
  try {
    data = JSON.parse(await fs.readFile(HEALTH_FILE, "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { file: "missing", checked };
    throw err;
  }

  if (data?.schema !== 1) return { file: "schema", checked, schema: data?.schema ?? null };

  const generated = Date.parse(data.generated);
  // Negated so a missing `generated`, whose age is NaN, reads as stale.
  if (!(Math.abs(Date.now() - generated) <= STALE_MS)) {
    return { file: "stale", checked, generated: Number.isNaN(generated) ? null : data.generated };
  }

  return { file: "fresh", checked, generated: data.generated, overall: data.overall, checks: data.checks };
}

module.exports = { health };
