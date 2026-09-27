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
 * `fresh` and `stale` carry `data`. Whether a stale file's data may
 * leave the server is the caller's call.
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
    return { file: "stale", generated: Number.isNaN(generated) ? null : data.generated, data };
  }

  return { file: "fresh", generated: data.generated, data };
}

/**
 * Where a service opens from the host the page was requested on:
 * `url_private` with its host swapped for that one, keeping the port,
 * so one page works from the LAN and the tailnet. `url_public` when
 * there is no private one.
 */
function link(service, host) {
  const raw = service.url_private || service.url_public;
  if (typeof raw !== "string") return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (service.url_private && host) url.hostname = host;
  return url.href;
}

/**
 * health.json's verdict, and when fresh its checks. A stale file's
 * states are last-known, not current, so they never leave the server.
 *
 * `services` is the registry's names, containers and links. They are
 * config rather than state, so they come along from a stale
 * services.json too, and under any health.json. `servicesFile` says
 * how old they are: the board folds checks into them only when fresh.
 */
async function health(host) {
  const checked = new Date().toISOString();

  const registry = await read("services.json");
  const services = Array.isArray(registry.data?.services)
    ? registry.data.services.map((s) => ({ name: s.name, containers: s.containers, url: link(s, host) }))
    : null;
  const servicesFile = services || registry.data === undefined ? registry.file : "schema";

  const { data, ...verdict } = await read("health.json");
  if (verdict.file !== "fresh") return { ...verdict, checked, services, servicesFile };

  return {
    file: "fresh",
    checked,
    generated: verdict.generated,
    overall: data.overall,
    checks: Array.isArray(data.checks) ? data.checks : [],
    services,
    servicesFile,
  };
}

module.exports = { health };
