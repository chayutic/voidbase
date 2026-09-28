// ═══════════════════════════════════════════════════════════════
//  BOARD — an incident card per problem, the rest in one tray
// ═══════════════════════════════════════════════════════════════
//
//  Checks are drawn only from a fresh health.json, since last-known
//  states are not current ones. Anything else leaves the registry's
//  names and links in the tray, every state unknown.

import { stamp, count, span }                from "../format.js";
import { isNew }                             from "./seen.js";
import { glyph, nameOf }                     from "./icons.js";
import { el, dot, capital, phrase, version } from "./dom.js";
import { ribbon }                            from "./recent.js";
import { openDetail, openIcon }              from "./detail.js";

const boardEl     = document.getElementById("opsBoard");
const incidentsEl = document.getElementById("opsIncidents");
const titleEl     = document.getElementById("opsTrayTitle");
const noteEl      = document.getElementById("opsTrayNote");
const servicesEl  = document.getElementById("opsServices");
const machineEl   = document.getElementById("opsMachine");
const hostsEl     = document.getElementById("opsHostList");

const LOUD = new Set(["fail", "warn", "unknown"]);

// A host row is named by its check's id: "raid md1", "review".
const HOST_NAMES = { raid: "RAID", smart: "SMART", review: "Last review" };

function icon(row) {
  const box = el("span", "ops__icon");
  box.append(glyph(row.host ? null : row.name));
  return box;
}

function label(row) {
  if (!row.host) return nameOf(row.name);
  const [kind, ...rest] = row.name.split(" ");
  return [HOST_NAMES[kind] ?? capital(kind), ...rest].join(" ");
}

// A service's name opens its detail; a host check's is only a name.
function nameEl(row, className) {
  if (row.host) return el("span", className, label(row));
  const name = el("button", className, label(row));
  name.type = "button";
  name.addEventListener("click", () => openDetail(row.name, row.url));
  return name;
}

// "since 04:10" today, "since 26 Sep · 04:10" before it.
function sinceEl(row, now) {
  const time = el("time", "ops__when");
  if (!row.since || Number.isNaN(Date.parse(row.since))) return time;
  const at = new Date(row.since);
  const sameDay = at.toDateString() === new Date(now).toDateString();
  const clock = stamp(row.since);
  time.dateTime = row.since;
  time.title = clock;
  time.textContent = `since ${sameDay ? clock.split(" · ")[1] : clock} · ${span(now - at)}`;
  return time;
}

// "last review 104 days ago" under "Last review" says it twice.
function said(row) {
  const detail = row.host ? hostSaid(row) : row.detail ?? "";
  const name = label(row).toLowerCase();
  return detail.toLowerCase().startsWith(name) ? detail.slice(name.length).trim() : detail;
}

function incidentEl(row, now) {
  const card = el("article", "ops__incident");
  card.dataset.status = row.state;
  card.toggleAttribute("data-lit", isNew(row.since));

  const plate = el("div", "ops__plate");
  plate.append(icon(row), dot(row.state));

  const body = el("div", "ops__incident-body");
  const title = el("h3", "ops__incident-name");
  title.append(nameEl(row, "ops__name"));
  if (row.url) title.append(openIcon(row.name, row.url));
  const say = said(row);
  body.append(title, el("p", "ops__incident-say", capital(say || "state unknown")));

  // "104 days ago" already says when; a since under it would disagree.
  if (!say.endsWith(" ago") || row.more) {
    const when = el("p", "ops__incident-when");
    if (!say.endsWith(" ago")) when.append(sinceEl(row, now));
    if (row.more) when.append(el("span", "ops__more", `${say.endsWith(" ago") ? "" : " · "}+${row.more} more`));
    body.append(when);
  }

  if (row.parts?.length) {
    const parts = el("ul", "ops__parts");
    for (const p of row.parts) {
      const li = el("li", null, p.name);
      li.dataset.status = p.state;
      li.prepend(dot(p.state));
      parts.append(li);
    }
    body.append(parts);
  }

  card.append(plate, body);
  if (!row.host) {
    const week = el("div", "ops__incident-week");
    week.append(ribbon(row.name, now));
    card.append(week);
  }
  return card;
}

function serviceEl(row, now, versions) {
  const li = el("li", "ops__tile");
  const tile = el("button", "ops__service");
  tile.type = "button";
  tile.addEventListener("click", () => openDetail(row.name, row.url));
  tile.dataset.status = row.state;
  tile.toggleAttribute("data-lit", isNew(row.since));

  const said = [];
  const v = versions.get(row.name);
  if (v) said.push(v);
  if (row.state === "muted") said.push("muted");
  else if (row.state === "ok" && row.since) said.push(`up ${span(now - Date.parse(row.since))}`);

  const sub = el("small", "ops__service-said", capital(said.join(" · ")));
  if (row.since) sub.title = `Up since ${stamp(row.since)}`;
  tile.append(icon(row), el("b", "ops__service-name", nameOf(row.name)), sub, dot(row.state));
  li.append(tile);
  if (row.url) li.append(openIcon(row.name, row.url));
  return li;
}

// raid [UU_] → "2 of 3 in sync"; the collector's "1 days" → "1 day".
function hostSaid(row) {
  const raid = /^\[([U_]+)\]$/.exec(row.detail ?? "");
  if (raid) {
    const up = raid[1].replaceAll("_", "").length;
    return `${up} of ${raid[1].length} in sync`;
  }
  return (row.detail ?? "").replace(/\b1 (day|hour|minute)s\b/, "1 $1");
}

function kind(row) {
  return row.name.split(" ")[0];
}

function hostEl(row) {
  const li = kind(row) === "drift" && row.detail === "none"
    ? phrase(row.state, "No config drift")
    : phrase(row.state, label(row), said(row));
  li.toggleAttribute("data-lit", isNew(row.since));
  return li;
}

// Healthy arrays say it once between them. SMART and the disks are
// Storage's to say, so they go unless something's wrong.
function hostItems(hosts) {
  const quiet = hosts.filter((r) => kind(r) !== "disk" && kind(r) !== "smart");
  const raid = quiet.filter((r) => kind(r) === "raid");
  const items = quiet.filter((r) => kind(r) !== "raid").map(hostEl);
  if (raid.length && raid.every((r) => r.state === "ok" && !/_/.test(r.detail ?? ""))) {
    const li = phrase("ok", "RAID", raid.length === 1 ? hostSaid(raid[0]) : `${raid.length} arrays in sync`);
    li.toggleAttribute("data-lit", raid.some((r) => isNew(r.since)));
    items.push(li);
  } else {
    items.push(...raid.map(hostEl));
  }
  return items;
}

function versionsOf(images) {
  const out = new Map();
  for (const i of images) {
    const v = version(i.running);
    if (i.service && v && !out.has(i.service)) out.set(i.service, v);
  }
  return out;
}

function tally(fine) {
  const muted = fine.filter((r) => r.state === "muted").length;
  const said = [count(fine.length - muted, "service")];
  if (muted) said.push(`${muted} muted`);
  return said.join(", ");
}

function show() {
  boardEl.dataset.state = "ready";
  incidentsEl.dataset.state = "ready";
  boardEl.hidden = false;
}

/**
 * `checked` is the server's clock, which ages every `since`. `images`
 * are a fresh updates.json's; a service one of them offers to update
 * has its card under Needs attention and leaves the tray.
 */
export function renderBoard(rows, checked, images, offered) {
  const now = Date.parse(checked);
  const loud  = rows.filter((r) => LOUD.has(r.state));
  const fine  = rows.filter((r) => !r.host && !LOUD.has(r.state) && !offered.has(r.name));
  const hosts = hostItems(rows.filter((r) => r.host && !LOUD.has(r.state)));
  const versions = versionsOf(images);

  incidentsEl.replaceChildren(...loud.map((r) => incidentEl(r, now)));
  titleEl.firstChild.textContent = "Operational";
  noteEl.textContent = fine.length ? tally(fine) : "nothing else";
  servicesEl.replaceChildren(...fine.map((r) => serviceEl(r, now, versions)));
  hostsEl.replaceChildren(...hosts);
  machineEl.hidden = !hosts.length;
  show();
}

/** health.json said nothing current: the registry's names, unknown. */
export function renderRegistry(rows) {
  incidentsEl.replaceChildren();
  titleEl.firstChild.textContent = "Services";
  noteEl.textContent = `${count(rows.length, "service")}, state unknown`;
  servicesEl.replaceChildren(...rows.map((r) => serviceEl(r, NaN, new Map())));
  hostsEl.replaceChildren();
  machineEl.hidden = true;
  show();
}

export function hideBoard() {
  boardEl.hidden = true;
  incidentsEl.replaceChildren();
  servicesEl.replaceChildren();
  hostsEl.replaceChildren();
}

/** The request failed; whatever is drawn stays, marked as old. */
export function boardFailed(state) {
  boardEl.dataset.state = state;
  incidentsEl.dataset.state = state;
}
