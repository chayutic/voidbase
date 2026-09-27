// ═══════════════════════════════════════════════════════════════
//  RECENT — the week's outages: a ribbon per incident, a phrase each
// ═══════════════════════════════════════════════════════════════
//
//  The server sends only transitions into or out of `fail` from the
//  last seven days. An outage still going is the board's to show, on
//  its incident card's ribbon; the tray's footer says how the ended
//  ones went.

import { failedState }       from "../request.js";
import { ago, span }         from "../format.js";
import { isNew }             from "./seen.js";
import { nameOf as labelOf } from "./icons.js";
import { el, phrase }        from "./dom.js";

const rowEl  = document.getElementById("opsRecent");
const listEl = document.getElementById("opsRecentList");

const SHOWN = 3;
const DAY_MS = 86_400_000;
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

let showing = false;
let latest  = { events: [], services: null };

// container:immich_machine_learning → "immich", by the registry when
// it has one; anything it can't place goes by its id.
function nameOf(id, services) {
  const at = id.indexOf(":");
  const subject = at === -1 ? "" : id.slice(at + 1);
  const service = services?.find((s) => s.name === subject || s.containers?.includes(subject));
  return service ? service.name : id.replace(":", " ");
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

function said(o, now) {
  const back = `back up ${ago(now - Date.parse(o.up))}`;
  if (o.times > 1) return `down ${o.times} times, ${back}`;
  if (o.down) return `down ${span(Date.parse(o.up) - Date.parse(o.down))}, ${back}`;
  return back;
}

function render(data, services) {
  rowEl.dataset.state = "ready";
  rowEl.dataset.file  = data.file;
  rowEl.hidden = false;

  if (data.file !== "fresh") {
    latest = { events: [], services };
    listEl.replaceChildren(phrase("unknown", "No events.log"));
    return;
  }

  latest = { events: data.events, services };
  const now = Date.parse(data.checked);
  const all = outages(data.events, services);
  const done = all.filter((o) => o.up);
  const items = done.slice(0, SHOWN).map((o) => {
    const li = phrase("ok", labelOf(o.name), said(o, now));
    li.toggleAttribute("data-lit", isNew(o.up));
    return li;
  });
  if (done.length > SHOWN) items.push(phrase("ok", `${done.length - SHOWN} more`));
  if (!all.length) items.push(phrase("ok", "Nothing went down"));
  listEl.replaceChildren(...items);
  rowEl.hidden = !items.length;
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
    rowEl.dataset.state = failedState(err, showing);
    if (!showing) rowEl.hidden = false;
  }
}

// ── Ribbon ─────────────────────────────────────────────────────

// Every span `service` spent in fail this week, as [start, end]; an
// outage already going when the week began starts with it.
function spans(service, now) {
  const from = now - 7 * DAY_MS;
  const open = new Map();
  const out = [];
  for (const e of latest.events) {
    if (nameOf(e.id, latest.services) !== service) continue;
    const t = Date.parse(e.time);
    if (e.to === "fail") open.set(e.id, t);
    else if (e.from === "fail") {
      out.push([open.get(e.id) ?? from, t]);
      open.delete(e.id);
    }
  }
  for (const t of open.values()) out.push([t, now]);
  return out;
}

/** Seven day cells ending today, red on any day `service` was down. */
export function ribbon(service, now) {
  const wrap  = el("div", "ops__ribbon");
  const cells = el("div", "ops__ribbon-days");
  const names = el("div", "ops__ribbon-names");
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const down = spans(service, now);

  for (let i = 6; i >= 0; i--) {
    const start = new Date(today);
    start.setDate(today.getDate() - i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const cell = el("span", "ops__ribbon-day");
    const ms = down.reduce((sum, [a, b]) => sum + Math.max(0, Math.min(b, +end) - Math.max(a, +start)), 0);
    if (ms) {
      cell.dataset.status = "fail";
      cell.title = `Down ${span(ms)}`;
    }
    cells.append(cell);
    names.append(el("span", null, DAYS[start.getDay()]));
  }
  wrap.append(el("span", "ops__ribbon-label", "Last seven days"), cells, names);
  return wrap;
}
