// ═══════════════════════════════════════════════════════════════
//  OPS STATUS
// ═══════════════════════════════════════════════════════════════
//
//  The private reader for status/. Only the ops router may use it:
//  public routes read public.json through public-status.js and
//  nothing else (contract § 2).

const fs   = require("fs/promises");
const path = require("path");

const STATUS_DIR = process.env.STATUS_DIR || "/app/status";

const STALE_MS = 15 * 60_000;

/**
 * One status file and what it can say right now. `file` is one of
 *
 *   fresh     `data` is current
 *   stale     older than 15 minutes: the collector has stopped
 *   missing   never written, which the contract treats as stale
 *   schema    a version this code can't read, so nothing is guessed
 *
 * Only `fresh` carries `data`.
 */
async function read(name) {
  let data;
  try {
    data = JSON.parse(await fs.readFile(path.join(STATUS_DIR, name), "utf8"));
  } catch (err) {
    if (err.code === "ENOENT") return { file: "missing" };
    throw err;
  }

  if (data?.schema !== 1) return { file: "schema", schema: data?.schema ?? null };

  const generated = Date.parse(data.generated);
  // Negated so a missing `generated`, whose age is NaN, reads as stale.
  if (!(Math.abs(Date.now() - generated) <= STALE_MS)) {
    return { file: "stale", generated: Number.isNaN(generated) ? null : data.generated };
  }

  return { file: "fresh", generated: data.generated, data };
}

/**
 * health.json's verdict, and when fresh its checks plus the service
 * registry they fold into. A stale file's states are last-known, not
 * current, so they never leave the server.
 *
 * `services` is null unless services.json is fresh too, and
 * `servicesFile` says why. The board then groups by the checks'
 * own `service` fields.
 */
async function health() {
  const checked = new Date().toISOString();

  const { data, ...verdict } = await read("health.json");
  if (verdict.file !== "fresh") return { ...verdict, checked };

  const registry = await read("services.json");
  const services = Array.isArray(registry.data?.services)
    ? registry.data.services.map(({ name, containers }) => ({ name, containers }))
    : null;

  return {
    file: "fresh",
    checked,
    generated: verdict.generated,
    overall: data.overall,
    checks: Array.isArray(data.checks) ? data.checks : [],
    services,
    servicesFile: services ? "fresh" : registry.file === "fresh" ? "schema" : registry.file,
  };
}

module.exports = { health };
