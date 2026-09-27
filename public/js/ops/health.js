// ═══════════════════════════════════════════════════════════════
//  HEALTH — whether the collector is still writing health.json
// ═══════════════════════════════════════════════════════════════
//
//  Reads GET /ops/api/health. The server decides staleness against its
//  own clock and withholds a stale file's checks, so this only words
//  what it was told. `data-file` on the region carries the verdict:
//  fresh, stale, missing or schema (lib/ops-status.js).

import { getJSON, failedState } from "../request.js";

const regionEl = document.getElementById("opsHealth");
const lineEl   = document.getElementById("opsHealthLine");

const REFRESH_MS = 60_000;

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

let latestRequest = 0;
let showingData   = false;

function ago(ms) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

function stamp(iso) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
}

function describe(data) {
  const age = Date.parse(data.checked) - Date.parse(data.generated);

  switch (data.file) {
    case "fresh":
      return `Collector ran ${ago(age)}.`;
    case "stale":
      if (!data.generated) return "The collector stopped. health.json doesn't say when.";
      if (age < 0) return `health.json is dated ${stamp(data.generated)}, which hasn't happened yet.`;
      return `The collector stopped ${ago(age)}. Last run ${stamp(data.generated)}; nothing newer is known.`;
    case "missing":
      return "health.json is missing. The collector has never run, or status/ isn't mounted.";
    case "schema":
      return data.schema == null
        ? "health.json has no schema, so this page won't guess at it."
        : `health.json is on schema ${data.schema}, which this page can't read yet.`;
  }
  return null;
}

async function fetchHealth() {
  const seq = ++latestRequest;
  let data = null;
  let text = null;
  let error;
  try {
    data = await getJSON("/ops/api/health");
    text = describe(data);
    if (!text) throw new Error(`Unknown file state "${data.file}"`);
  } catch (err) {
    console.error("Ops health error:", err.message);
    error = err;
  }

  if (seq !== latestRequest) return;

  if (!error) {
    showingData = true;
    regionEl.dataset.state = "ready";
    regionEl.dataset.file  = data.file;
    lineEl.textContent     = text;
    return;
  }

  regionEl.dataset.state = failedState(error, showingData);
  if (!showingData) lineEl.textContent = "Couldn't check on the collector.";
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
