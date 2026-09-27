// ═══════════════════════════════════════════════════════════════
//  HEALTH — the header's topline, the collector line, the board
// ═══════════════════════════════════════════════════════════════
//
//  Reads GET /ops/api/health, and /ops/api/updates alongside it for
//  the pending images the board and topline show. Recent and Storage
//  come in the same round, since they take names and thresholds from
//  health.json; Storage only until it has drawn once. The server decides staleness against its own clock
//  and withholds a stale file's checks, so this only words what it
//  was told. `data-file` on the
//  region carries the verdict: fresh, stale, missing or schema
//  (lib/ops-status.js).

import { getJSON, failedState }                               from "../request.js";
import { ago, stamp, count }                                  from "../format.js";
import { buildRows, registryRows, tally }                     from "../health-rows.js";
import { renderBoard, renderRegistry, hideBoard, boardFailed } from "./board.js";
import { showUpdates, pendingText, offered }                  from "./updates.js";
import { showRecent }                                         from "./recent.js";
import { showStorage }                                        from "./storage.js";
import { shown }                                              from "./seen.js";

const regionEl  = document.getElementById("opsHealth");
const toplineEl = document.getElementById("opsTopline");
const lineEl    = document.getElementById("opsHealthLine");

const REFRESH_MS = 60_000;

const REGISTRY_GONE = {
  stale:   "services.json is out of date",
  missing: "services.json is missing",
  schema:  "services.json is on a schema this page can't read",
};

let latestRequest = 0;
let showingData   = false;
let storageShown  = false;

// Updates never set the lead unless nothing else would: "All
// services healthy" is implied by the absence of "Needs attention".
function topline(rows, images) {
  if (!rows.length) return "health.json lists no checks";
  const t = tally(rows);
  const updates = pendingText(images);
  const said = [];
  if (t.fail)    said.push(`${t.fail} down`);
  if (t.warn)    said.push(count(t.warn, "warning"));
  if (t.unknown) said.push(`${t.unknown} unknown`);
  if (t.muted)   said.push(`${t.muted} muted`);
  const lead = t.fail || t.warn ? "Needs attention"
             : t.unknown        ? "Nothing failing"
             : updates          ? updates
             :                    "All services healthy";
  if (updates && lead !== updates) said.push(updates);
  return said.length ? `${lead} (${said.join(", ")})` : lead;
}

function describe(data, rows, images) {
  const age = Date.parse(data.checked) - Date.parse(data.generated);

  switch (data.file) {
    case "fresh": {
      const gone = REGISTRY_GONE[data.servicesFile];
      return {
        topline: topline(rows, images),
        detail: `Collector ran ${ago(age)}` + (gone ? `. ${gone}, so services come from health.json alone` : ""),
      };
    }
    case "stale":
      if (!data.generated) return { topline: "Collector stopped", detail: "health.json doesn't say when" };
      if (age < 0) return { topline: "Status unknown", detail: `health.json is dated ${stamp(data.generated)}, which hasn't happened yet` };
      return { topline: `Collector stopped ${ago(age)}`, detail: `Last run ${stamp(data.generated)}. Nothing newer is known` };
    case "missing":
      return { topline: "No health.json", detail: "The collector has never run, or status/ isn't mounted" };
    case "schema":
      return {
        topline: "Unknown schema",
        detail: data.schema == null
          ? "health.json has no schema, so this page won't guess at it"
          : `health.json is on schema ${data.schema}, which this page can't read yet`,
      };
  }
  return null;
}

async function fetchHealth() {
  const seq = ++latestRequest;
  const [health, updates, recent, storage] = await Promise.allSettled([
    getJSON("/ops/api/health"),
    getJSON("/ops/api/updates"),
    getJSON("/ops/api/recent"),
    storageShown ? null : getJSON("/ops/api/storage"),
  ]);
  if (seq !== latestRequest) return;

  const images = showUpdates(updates);
  const told = health.status === "fulfilled" ? health.value : null;
  showRecent(recent, told?.services);
  if (!storageShown) storageShown = showStorage(storage, told?.file === "fresh" ? told.checks : null);

  let data = null;
  let rows = null;
  let text = null;
  let error;
  try {
    if (health.status === "rejected") throw health.reason;
    data = health.value;
    if (data.file === "fresh") rows = buildRows(data.checks, data.services, data.servicesFile === "fresh");
    text = describe(data, rows, images);
    if (!text) throw new Error(`Unknown file state "${data.file}"`);
  } catch (err) {
    console.error("Ops health error:", err.message);
    error = err;
  }

  if (!error) {
    showingData = true;
    regionEl.dataset.state = "ready";
    regionEl.dataset.file  = data.file;
    if (rows) regionEl.dataset.overall = data.overall;
    else delete regionEl.dataset.overall;
    toplineEl.textContent = text.topline;
    lineEl.textContent    = text.detail;

    if (rows) {
      renderBoard(rows, data.checked, images, offered(images));
      shown(data.generated);
    } else {
      const known = registryRows(data.services);
      if (known.length) renderRegistry(known);
      else hideBoard();
    }
    return;
  }

  const state = failedState(error, showingData);
  regionEl.dataset.state = state;
  boardFailed(state);
}

export function initHealth() {
  fetchHealth();
  setInterval(() => {
    if (document.visibilityState === "visible") fetchHealth();
  }, REFRESH_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") fetchHealth();
  });
}
