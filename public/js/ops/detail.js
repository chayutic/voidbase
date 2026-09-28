// ═══════════════════════════════════════════════════════════════
//  DETAIL — one service in a modal: now, its images, 30 days
// ═══════════════════════════════════════════════════════════════
//
//  Opened from a tray tile, or the name on an incident or offer card.
//  Fetched on open and not refreshed while it's up. The service's own
//  UI is a link in the header, and on pointers that can hover, an
//  icon beside whatever opened it.

import { getJSON, failedState }                     from "../request.js";
import { span, stamp, day }                         from "../format.js";
import { buildRows, part }                          from "../health-rows.js";
import { CLOSE }                                    from "../icons.js";
import { isNew }                                    from "./seen.js";
import { glyph, nameOf }                            from "./icons.js";
import { el, dot, capital, version, versionChange } from "./dom.js";

const dialogEl = document.getElementById("opsDetail");
const iconEl   = document.getElementById("opsDetailIcon");
const nameEl   = document.getElementById("opsDetailName");
const stateEl  = document.getElementById("opsDetailState");
const openEl   = document.getElementById("opsDetailOpen");
const closeEl  = document.getElementById("opsDetailClose");
const bodyEl   = document.getElementById("opsDetailBody");

const DAYS = 30;
const RANK = { ok: 0, muted: 1, unknown: 1, warn: 2, fail: 3 };
const ABOUT = { probe: "public URL", dns: "DNS" };

const OPEN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 17 17 7M8 7h9v9"/></svg>`;

let asked = 0;

// ── Pieces ─────────────────────────────────────────────────────

function kindOf(id) {
  const at = id.indexOf(":");
  return at === -1 ? id : id.slice(0, at);
}

function subjectOf(id) {
  const at = id.indexOf(":");
  return at === -1 ? "" : id.slice(at + 1);
}

// What a check is about inside its service: "machine learning",
// "restarts", "public URL", or "" when the service says it alone.
function aboutOf(id, service, several) {
  const kind = kindOf(id);
  const container = several ? part(subjectOf(id), service) : "";
  if (kind === "container") return container;
  if (kind === "restarts") return container ? `${container} restarts` : "restarts";
  if (kind === service) return "";
  return ABOUT[kind] ?? kind;
}

function worst(checks) {
  return checks.reduce((w, c) => ((RANK[c.state] ?? 1) > (RANK[w.state] ?? 1) ? c : w));
}

// "up 2 days" when fine, "since 27 Sep · 04:10 · 3 h" when not.
function whenOf(state, since, now) {
  const at = Date.parse(since);
  if (Number.isNaN(at)) return "";
  return state === "ok" ? `up ${span(now - at)}` : `since ${stamp(since)} · ${span(now - at)}`;
}

function row(state, name, said, when) {
  const li = el("li", "ops__detail-row");
  li.dataset.status = state;
  const text = el("span", "ops__detail-text");
  text.append(el("span", "ops__detail-subject", name));
  if (said) text.append(typeof said === "string" ? el("span", "ops__detail-said", said) : said);
  li.append(dot(state), text);
  if (when) li.append(typeof when === "string" ? el("span", "ops__detail-when", when) : when);
  return li;
}

function section(title) {
  const box = el("section", "ops__detail-section");
  box.append(el("h3", "ops__detail-label", title));
  return box;
}

function note(text) {
  return el("p", "ops__detail-note", text);
}

const FILE_SAID = {
  stale:   "is out of date",
  missing: "is missing",
  schema:  "is on a schema this page can't read",
};

// ── Now ────────────────────────────────────────────────────────

function containerRow(container, checks, data, several, now) {
  const name = several ? capital(part(container, data.name)) : "Container";
  if (!checks.length) return row("unknown", name, "no check");
  const running  = checks.find((c) => c.kind === "container");
  const restarts = checks.find((c) => c.kind === "restarts");
  const said = [running?.detail, restarts && restarts.detail !== "stable" ? restarts.detail : null].filter(Boolean).join(", ");
  const w = worst(checks);
  return row(w.state, name, said, whenOf(w.state, (running ?? w).since, now));
}

function nowSection(data, now) {
  const box = section("Now");
  const { file, checks } = data.health;
  if (file !== "fresh") {
    box.append(note(`health.json ${FILE_SAID[file] ?? "can't be read"}, so nothing current is known`));
    return box;
  }

  const several = data.containers.length > 1;
  const byContainer = new Map(data.containers.map((c) => [c, []]));
  const others = [];
  for (const c of checks) {
    if (c.kind !== "container" && c.kind !== "restarts") {
      others.push(c);
      continue;
    }
    const container = subjectOf(c.id);
    if (!byContainer.has(container)) byContainer.set(container, []);
    byContainer.get(container).push(c);
  }

  const list = el("ul", "ops__detail-list");
  for (const [container, cs] of byContainer) list.append(containerRow(container, cs, data, several, now));
  for (const c of others) {
    list.append(row(c.state, capital(aboutOf(c.id, data.name, several) || c.kind), c.detail, whenOf(c.state, c.since, now)));
  }
  box.append(list);
  return box;
}

// ── Images ─────────────────────────────────────────────────────

const IMAGE_STATE = { ok: "ok", update: "change", skip: "muted" };

function imageRow(image) {
  const running = version(image.running) ?? image.running;
  let said;
  if (image.status === "update") {
    said = versionChange(image.running, image.latest);
    if (image.seen) said.append(` · since ${day(image.seen)}`);
  } else if (image.status === "ok") {
    said = `${running ?? "—"} · up to date`;
  } else {
    said = image.detail || image.status;
  }

  let notes = null;
  if (image.notes_url) {
    notes = el("a", "ops__offer-notes", "Release notes ↗");
    notes.href = image.notes_url;
  }
  return row(IMAGE_STATE[image.status] ?? "unknown", image.id, said, notes);
}

function imagesSection(data) {
  const { file, images } = data.updates;
  if (file === "fresh" && !images.length) return null;
  const box = section("Images");
  if (file !== "fresh") {
    box.append(note(`updates.json ${FILE_SAID[file] ?? "can't be read"}, so versions aren't shown`));
    return box;
  }
  const list = el("ul", "ops__detail-list");
  list.append(...images.map(imageRow));
  box.append(list);
  return box;
}

// ── Last 30 days ───────────────────────────────────────────────

// Each check's time in warn or fail, as [start, end, state]. Before
// its first event in the window a check was in that event's `from`;
// a check with no events has been in its current state throughout.
function spans(data, from, now) {
  const byId = new Map();
  for (const e of data.events.events) {
    if (!byId.has(e.id)) byId.set(e.id, []);
    byId.get(e.id).push(e);
  }

  const out = [];
  for (const events of byId.values()) {
    let t = from;
    let state = events[0].from;
    for (const e of events) {
      out.push([t, Date.parse(e.time), state]);
      t = Date.parse(e.time);
      state = e.to;
    }
    out.push([t, now, state]);
  }
  if (data.health.file === "fresh") {
    for (const c of data.health.checks) {
      if (!byId.has(c.id)) out.push([Math.max(from, Date.parse(c.since) || from), now, c.state]);
    }
  }
  return out.filter(([, , state]) => state === "fail" || state === "warn");
}

function strip(data, now) {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const first = new Date(today);
  first.setDate(today.getDate() - (DAYS - 1));
  const bad = spans(data, +first, now);
  const deployed = data.deploys.map((d) => Date.parse(d.time));

  const cells = el("div", "ops__strip-days");
  for (let i = 0; i < DAYS; i++) {
    const start = new Date(first);
    start.setDate(first.getDate() + i);
    const end = new Date(start);
    end.setDate(start.getDate() + 1);

    const time = { fail: 0, warn: 0 };
    for (const [a, b, state] of bad) time[state] += Math.max(0, Math.min(b, +end) - Math.max(a, +start));
    const cell = el("span", "ops__strip-day");
    const title = [stamp(start.toISOString()).split(" · ")[0]];
    if (time.fail) title.push(`down ${span(time.fail)}`);
    if (time.warn) title.push(`warning ${span(time.warn)}`);
    const updated = deployed.filter((t) => t >= +start && t < +end).length;
    if (updated) title.push(updated === 1 ? "updated" : `updated ${updated} times`);
    if (time.fail || time.warn) cell.dataset.status = time.fail ? "fail" : "warn";
    cell.toggleAttribute("data-deploy", updated > 0);
    cell.title = title.join(", ");
    cells.append(cell);
  }

  const ends = el("div", "ops__strip-ends");
  ends.append(el("span", null, stamp(first.toISOString()).split(" · ")[0]), el("span", null, "Today"));
  const box = el("div", "ops__strip");
  box.append(cells, ends);
  return box;
}

// Transitions at one moment are one line: a mute touches every check.
function grouped(events) {
  const groups = new Map();
  for (const e of events) {
    const key = `${e.time}\t${e.from}\t${e.to}`;
    if (!groups.has(key)) groups.set(key, { ...e, ids: [], details: [] });
    const g = groups.get(key);
    g.ids.push(e.id);
    if (e.detail && !g.details.includes(e.detail)) g.details.push(e.detail);
  }
  return [...groups.values()];
}

const VERB = { fail: "down", warn: "warning", ok: "back", unknown: "unknown" };

function eventRow(g, service, several) {
  let head;
  let said = g.details.join("; ");
  if (g.to === "muted" || (g.from === "muted" && g.to === "ok")) {
    head = g.to === "muted" ? "Muted" : "Unmuted";
    said = "";
  } else {
    const about = [...new Set(g.ids.map((id) => aboutOf(id, service, several)))].filter(Boolean).join(", ");
    const verb = VERB[g.to] ?? g.to;
    head = capital(about ? `${about} ${verb}` : verb);
  }
  const li = row(g.to, head, said, stamp(g.time));
  li.toggleAttribute("data-lit", isNew(g.time));
  return li;
}

function deployRow(d) {
  const li = row("change", `Updated ${d.id}`, versionChange(d.from, d.to), stamp(d.time));
  li.toggleAttribute("data-lit", isNew(d.time));
  return li;
}

function historySection(data, now) {
  const box = section("Last 30 days");
  if (data.events.file !== "fresh") {
    box.append(note("No events.log, so no history"));
    return box;
  }
  box.append(strip(data, now));

  const several = data.containers.length > 1;
  const items = [
    ...grouped(data.events.events).map((g) => [Date.parse(g.time), eventRow(g, data.name, several)]),
    ...data.deploys.map((d) => [Date.parse(d.time), deployRow(d)]),
  ].sort((a, b) => b[0] - a[0]);

  if (!items.length) {
    box.append(note("Nothing changed"));
    return box;
  }
  const list = el("ul", "ops__detail-list");
  list.append(...items.map(([, li]) => li));
  box.append(list);
  return box;
}

// ── Modal ──────────────────────────────────────────────────────

// The same words as its tray tile or incident card, from the same fold.
function headline(data, now) {
  if (data.health.file !== "fresh") return { state: "unknown", said: "State unknown" };
  const [r] = buildRows(data.health.checks, [{ name: data.name, containers: data.containers }], true);
  if (!r) return { state: "unknown", said: "No checks" };
  if (r.state !== "ok") return { state: r.state, said: [capital(r.detail), whenOf(r.state, r.since, now)].filter(Boolean).join(" · ") };
  const image = data.updates.images?.find((i) => version(i.running));
  return { state: "ok", said: capital([version(image?.running), whenOf("ok", r.since, now)].filter(Boolean).join(" · ")) };
}

function render(data) {
  const now = Date.parse(data.checked);
  const head = headline(data, now);
  stateEl.replaceChildren(dot(head.state), el("span", null, head.said));
  openEl.hidden = !data.url;
  if (data.url) openEl.href = data.url;
  bodyEl.replaceChildren(...[nowSection(data, now), imagesSection(data), historySection(data, now)].filter(Boolean));
  bodyEl.dataset.state = "ready";
}

/** Opens `service`'s detail. `url`, its UI, saves the header waiting. */
export function openDetail(service, url) {
  const seq = ++asked;
  iconEl.replaceChildren(glyph(service));
  nameEl.textContent = nameOf(service);
  stateEl.replaceChildren();
  openEl.hidden = !url;
  if (url) openEl.href = url;
  openEl.setAttribute("aria-label", `Open ${nameOf(service)}`);
  bodyEl.replaceChildren();
  bodyEl.dataset.state = "loading";
  if (!dialogEl.open) dialogEl.showModal();

  getJSON(`/ops/api/service/${encodeURIComponent(service)}`)
    .then((data) => {
      if (seq === asked) render(data);
    })
    .catch((err) => {
      if (seq !== asked) return;
      console.error("Ops detail error:", err.message);
      bodyEl.replaceChildren();
      bodyEl.dataset.state = failedState(err, false);
    });
}

/** The icon beside a name that opens the service itself. */
export function openIcon(service, url) {
  const link = el("a", "ops__open");
  link.href = url;
  link.setAttribute("aria-label", `Open ${nameOf(service)}`);
  link.innerHTML = OPEN;
  return link;
}

export function initDetail() {
  closeEl.innerHTML = CLOSE;
  openEl.insertAdjacentHTML("afterbegin", OPEN);
  closeEl.addEventListener("click", () => dialogEl.close());

  // The box fills the dialog, so only the backdrop hits the dialog
  // itself. A drag that starts inside and ends out there is a text
  // selection, not a dismissal.
  let downOnBackdrop = false;
  dialogEl.addEventListener("pointerdown", (e) => {
    downOnBackdrop = e.target === dialogEl;
  });
  dialogEl.addEventListener("click", (e) => {
    if (downOnBackdrop && e.target === dialogEl) dialogEl.close();
  });
}
