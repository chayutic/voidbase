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

const HEALTH_STALE_MS  = 15 * 60_000;
const UPDATES_STALE_MS = 26 * 3_600_000;

/**
 * One status file and what it can say right now. `file` is one of
 *
 *   fresh     `data` is current
 *   stale     older than `staleMs`: the script writing it has stopped
 *   missing   never written, which the contract treats as stale
 *   schema    a version this code can't read, so nothing is guessed
 *
 * `fresh` and `stale` carry `data`. Whether a stale file's data may
 * leave the server is the caller's call.
 */
async function read(name, staleMs) {
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
  if (!(Math.abs(Date.now() - generated) <= staleMs)) {
    return { file: "stale", generated: Number.isNaN(generated) ? null : data.generated, data };
  }

  return { file: "fresh", generated: data.generated, data };
}

function httpUrl(raw) {
  if (typeof raw !== "string") return null;
  let url;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}

/**
 * Where a service opens from the host the page was requested on:
 * `url_private` with its host swapped for that one, keeping the port,
 * so one page works from the LAN and the tailnet. `url_public` when
 * there is no private one.
 */
function link(service, host) {
  const url = httpUrl(service.url_private || service.url_public);
  if (!url) return null;
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

  const registry = await read("services.json", HEALTH_STALE_MS);
  const services = Array.isArray(registry.data?.services)
    ? registry.data.services.map((s) => ({ name: s.name, containers: s.containers, url: link(s, host) }))
    : null;
  const servicesFile = services || registry.data === undefined ? registry.file : "schema";

  const { data, ...verdict } = await read("health.json", HEALTH_STALE_MS);
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

/**
 * updates.json on its own 26-hour clock. As with health.json, a stale
 * file's images are last-known and stay on the server. `notified` is
 * the script's bookkeeping and stays too.
 */
async function updates() {
  const checked = new Date().toISOString();

  const { data, ...verdict } = await read("updates.json", UPDATES_STALE_MS);
  if (verdict.file !== "fresh") return { ...verdict, checked };

  const images = Array.isArray(data.images) ? data.images : [];
  return {
    file: "fresh",
    checked,
    generated: verdict.generated,
    images: images.filter((i) => typeof i?.id === "string").map((i) => ({
      id:        i.id,
      service:   i.service ?? null,
      tier:      i.tier ?? null,
      running:   i.running ?? null,
      latest:    i.latest ?? null,
      status:    i.status,
      detail:    i.detail ?? "",
      notes_url: httpUrl(i.notes_url)?.href ?? null,
      seen:      /^\d{4}-\d{2}-\d{2}$/.test(i.seen) ? i.seen : null,
    })),
  };
}

const EVENTS_TAIL_BYTES = 16_384;
const RECENT_MS         = 7 * 86_400_000;
const DISK_DAYS         = 90;

async function text(name) {
  try {
    return await fs.readFile(path.join(STATUS_DIR, name), "utf8");
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
}

async function tail(name, bytes) {
  let handle;
  try {
    handle = await fs.open(path.join(STATUS_DIR, name));
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  try {
    const { size } = await handle.stat();
    const start = Math.max(0, size - bytes);
    const buf = Buffer.alloc(size - start);
    await handle.read(buf, 0, buf.length, start);
    const lines = buf.toString("utf8").split("\n");
    // A tail that starts mid-file starts mid-line.
    if (start > 0) lines.shift();
    return lines;
  } finally {
    await handle.close();
  }
}

/**
 * events.log's outages from the last week: transitions into or out of
 * `fail`, oldest first. The log's detail and every other transition
 * stay on the server. The file is appended while this reads, so a
 * last line without its four fields is one still being written.
 */
async function recent() {
  const checked = new Date().toISOString();
  const lines = await tail("events.log", EVENTS_TAIL_BYTES);
  if (lines === null) return { file: "missing", checked };

  const since = Date.now() - RECENT_MS;
  const events = [];
  for (const line of lines) {
    const fields = line.split("\t");
    if (fields.length < 4) continue;
    const [time, id, change] = fields;
    const [from, to] = change.split("→");
    if (from !== "fail" && to !== "fail") continue;
    if (!(Date.parse(time) >= since)) continue;
    events.push({ time, id, from, to });
  }
  return { file: "fresh", checked, events };
}

/**
 * disk.csv's last 90 days per mount, and smart.json's disks on the
 * same 26-hour clock as updates. A disk leaves without its serial or
 * device: they're sorted by device here, so "raid 1" stays raid 1,
 * and nothing that names the hardware goes further.
 */
async function storage() {
  const checked = new Date().toISOString();

  const csv = await text("disk.csv");
  let disk = { file: "missing" };
  if (csv !== null) {
    const mounts = new Map();
    for (const line of csv.split("\n").slice(1)) {
      const [date, mount, pct, bytes] = line.split(",");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !mount) continue;
      const used = Number(pct);
      if (!Number.isFinite(used)) continue;
      if (!mounts.has(mount)) mounts.set(mount, []);
      mounts.get(mount).push({ date, used, bytes: Number(bytes) });
    }
    disk = {
      file: "fresh",
      mounts: [...mounts].map(([mount, rows]) => {
        const days = rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-DISK_DAYS);
        const last = days.at(-1);
        return {
          mount,
          history:    days.map((d) => [d.date, d.used]),
          used_bytes: Number.isFinite(last.bytes) ? last.bytes : null,
        };
      }),
    };
  }

  const { data, ...smart } = await read("smart.json", UPDATES_STALE_MS);
  if (smart.file === "fresh") {
    const disks = Array.isArray(data.disks) ? data.disks : [];
    smart.disks = disks
      .filter((d) => typeof d?.role === "string")
      .sort((a, b) => String(a.device).localeCompare(String(b.device)))
      .map((d) => ({
        role:           d.role,
        state:          d.state,
        detail:         d.detail ?? "",
        model:          d.model ?? null,
        temp_c:         d.temp_c ?? null,
        power_on_hours: d.power_on_hours ?? null,
        wear_pct:       d.wear_pct ?? null,
      }));
  }

  return { checked, disk, smart };
}

module.exports = { health, updates, recent, storage };
