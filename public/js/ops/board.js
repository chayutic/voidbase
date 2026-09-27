// ═══════════════════════════════════════════════════════════════
//  BOARD — the rows, worst first, with ok folded into one line
// ═══════════════════════════════════════════════════════════════
//
//  Checks are drawn only from a fresh health.json, since last-known
//  states are not current ones. Anything else leaves the registry's
//  names and links, folded, every state unknown.

import { ago, stamp, count } from "./format.js";
import { isNew }               from "./seen.js";

const boardEl    = document.getElementById("opsBoard");
const rowsEl     = document.getElementById("opsRows");
const foldEl     = document.getElementById("opsFold");
const summaryEl  = document.getElementById("opsFoldSummary");
const foldLineEl = document.getElementById("opsFoldLine");
const okRowsEl   = document.getElementById("opsOkRows");

function rowEl(row, now) {
  const li = document.createElement("li");
  li.className = "ops__row";
  li.dataset.status = row.state;
  li.toggleAttribute("data-lit", isNew(row.since));

  const dot = document.createElement("span");
  dot.className = "ops__dot";
  dot.setAttribute("aria-hidden", "true");

  const name = document.createElement(row.url ? "a" : "span");
  name.className = "ops__name";
  name.textContent = row.name;
  if (row.url) name.href = row.url;

  const detail = document.createElement("span");
  detail.className = "ops__detail";
  detail.textContent = row.detail ?? "";
  if (row.more) {
    const more = document.createElement("span");
    more.className = "ops__more";
    more.textContent = ` +${row.more} more`;
    detail.append(more);
  }

  const since = document.createElement("time");
  since.className = "ops__since";
  if (row.since && !Number.isNaN(Date.parse(row.since))) {
    since.dateTime    = row.since;
    since.title       = stamp(row.since);
    since.textContent = ago(now - Date.parse(row.since));
  }

  li.append(dot, name, detail, since);
  return li;
}

function foldLabel(services, hosts) {
  const said = [];
  if (services) said.push(count(services, "service"));
  if (hosts)    said.push(count(hosts, "host check"));
  return `${said.join(", ")} ok`;
}

function draw(open, folded, status, label) {
  rowsEl.replaceChildren(...open);
  okRowsEl.replaceChildren(...folded);
  foldEl.hidden = !folded.length;
  summaryEl.dataset.status = status;
  foldLineEl.textContent = label;
  boardEl.dataset.state = "ready";
  boardEl.hidden = false;
}

/** `checked` is the server's clock, which ages every `since`. */
export function renderBoard(rows, checked) {
  const now = Date.parse(checked);
  const ok = rows.filter((r) => r.state === "ok");

  draw(
    rows.filter((r) => r.state !== "ok").map((r) => rowEl(r, now)),
    ok.map((r) => rowEl(r, now)),
    "ok",
    foldLabel(ok.filter((r) => !r.host).length, ok.filter((r) => r.host).length),
  );
  foldEl.toggleAttribute("data-lit", ok.some((r) => isNew(r.since)));
}

/** health.json said nothing current: the registry's rows, all folded. */
export function renderRegistry(rows) {
  draw([], rows.map((r) => rowEl(r, NaN)), "unknown", `${count(rows.length, "service")}, state unknown`);
  foldEl.removeAttribute("data-lit");
}

export function hideBoard() {
  boardEl.hidden = true;
  rowsEl.replaceChildren();
  okRowsEl.replaceChildren();
}

/** The request failed; whatever is drawn stays, marked as old. */
export function boardFailed(state) {
  boardEl.dataset.state = state;
}
