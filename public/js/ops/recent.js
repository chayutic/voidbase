// ═══════════════════════════════════════════════════════════════
//  RECENT — the week's outages, a headline each
// ═══════════════════════════════════════════════════════════════
//
//  The server sends only transitions into or out of `fail` from the
//  last seven days. Each service gets one line: down now, or how long
//  it was down and when it came back. Anything more is the board's.

import { failedState } from "../request.js";
import { rowEl }       from "./board.js";

const sectionEl = document.getElementById("opsRecent");
const noteEl    = document.getElementById("opsRecentNote");
const cardEl    = document.getElementById("opsRecentCard");
const rowsEl    = document.getElementById("opsRecentRows");

const SHOWN = 3;

let showing = false;

// container:immich_machine_learning → "immich", by the registry when
// it has one; anything it can't place goes by its id.
function nameOf(id, services) {
  const at = id.indexOf(":");
  const subject = at === -1 ? "" : id.slice(at + 1);
  const service = services?.find((s) => s.name === subject || s.containers?.includes(subject));
  return service ? service.name : id.replace(":", " ");
}

function lasted(ms) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

// The latest outage per check, then per service: one still going
// beats one that ended, and otherwise the newest wins.
function outages(events, services) {
  const byCheck = new Map();
  for (const e of events) {
    const o = byCheck.get(e.id);
    if (e.to === "fail") {
      byCheck.set(e.id, { name: nameOf(e.id, services), down: e.time, up: null, times: (o?.times ?? 0) + 1 });
    } else if (o && !o.up) {
      o.up = e.time;
    } else if (!o) {
      byCheck.set(e.id, { name: nameOf(e.id, services), down: null, up: e.time, times: 1 });
    }
  }

  const when  = (o) => Date.parse(o.up ?? o.down);
  const ended = (o) => (o.up ? 1 : 0);
  const byName = new Map();
  for (const o of byCheck.values()) {
    const had = byName.get(o.name);
    if (!had || ended(o) - ended(had) < 0 || (ended(o) === ended(had) && when(o) > when(had))) byName.set(o.name, o);
  }
  return [...byName.values()].sort((a, b) => ended(a) - ended(b) || when(b) - when(a));
}

function rowOf(o) {
  if (!o.up) return { name: o.name, state: "fail", detail: "went down", since: o.down, more: 0 };
  const detail = o.times > 1 ? `down ${o.times} times, back up`
               : o.down      ? `down ${lasted(Date.parse(o.up) - Date.parse(o.down))}, back up`
               :               "back up";
  return { name: o.name, state: "ok", detail, since: o.up, more: 0 };
}

function render(data, services) {
  sectionEl.dataset.state = "ready";
  sectionEl.dataset.file  = data.file;
  sectionEl.hidden = false;

  if (data.file !== "fresh") {
    noteEl.textContent = "no events.log";
    cardEl.hidden = true;
    rowsEl.replaceChildren();
    return;
  }

  const all = outages(data.events, services);
  const now = Date.parse(data.checked);
  rowsEl.replaceChildren(...all.slice(0, SHOWN).map((o) => rowEl(rowOf(o), now)));
  cardEl.hidden = !all.length;
  noteEl.textContent = !all.length          ? "nothing went down this week"
                     : all.length > SHOWN   ? `${all.length - SHOWN} more this week`
                     :                        "";
}

/**
 * Draws the answer to GET /ops/api/recent, as a settled promise.
 * `services` is the registry health.json came with, for names.
 */
export function showRecent(result, services) {
  try {
    if (result.status === "rejected") throw result.reason;
    render(result.value, services);
    showing = true;
  } catch (err) {
    console.error("Ops recent error:", err.message);
    sectionEl.dataset.state = failedState(err, showing);
  }
}
