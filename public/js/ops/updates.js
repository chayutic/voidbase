// ═══════════════════════════════════════════════════════════════
//  UPDATES — an offer per pending image, the rest in one line
// ═══════════════════════════════════════════════════════════════
//
//  Pending images (status "update") get a card under Needs attention,
//  fast tier first; up-to-date, skipped and failed checks are counted
//  in the tray's footer. Only a fresh file's images reach the page, so
//  a stale one offers nothing.

import { failedState }              from "../request.js";
import { ago, stamp, count }        from "../format.js";
import { glyph, nameOf as labelOf } from "./icons.js";
import { el, dot, capital, phrase } from "./dom.js";

const offersEl = document.getElementById("opsOffers");
const rowEl    = document.getElementById("opsUpdates");
const listEl   = document.getElementById("opsUpdateList");

const TIER = { fast: 0, slow: 1 };

let showing = null;

function byTier(a, b) {
  return (TIER[a.tier] ?? 2) - (TIER[b.tier] ?? 2);
}

function isPending(image) {
  return image.status === "update";
}

// immich-server in immich → "Immich server"; an image with no
// service goes by its id.
function nameOf(image, several) {
  if (!image.service) return capital(image.id);
  if (!several.has(image.service)) return labelOf(image.service);
  const rest = image.id.startsWith(image.service) ? image.id.slice(image.service.length).replace(/^[-_]/, "") : image.id;
  return `${labelOf(image.service)} ${(rest || image.id).replace(/[-_]+/g, " ")}`;
}

/** "release-4.0.20.3014" and "v3.5.2" → bare numbers; a digest is none. */
export function version(running) {
  if (!running || running.startsWith("sha256:")) return null;
  return running.replace(/^(release-|v(?=\d))/, "");
}

// 2.3.2243 → 2.3.2363 with "2363" picked out.
function change(image) {
  const box = el("span", "ops__change");
  const from = version(image.running), to = version(image.latest);
  if (image.detail || !from || !to) {
    box.textContent = image.detail || "update available";
    return box;
  }
  const a = from.split("."), b = to.split(".");
  let i = 0;
  while (i < b.length - 1 && a[i] === b[i]) i++;
  const kept = b.slice(0, i).join(".");
  box.append(el("span", null, from), el("span", "ops__change-arrow", "→"),
    el("span", null, kept ? `${kept}.` : ""), el("b", null, b.slice(i).join(".")));
  return box;
}

function offerEl(image, several) {
  const card = el("article", "ops__offer");
  const icon = el("span", "ops__icon");
  icon.append(glyph(image.service ?? image.id));
  card.append(icon, el("b", "ops__offer-name", `${nameOf(image, several)} can update`), change(image));
  if (image.notes_url) {
    const notes = el("a", "ops__offer-notes", "Release notes ↗");
    notes.href = image.notes_url;
    card.append(notes);
  }
  return card;
}

// "3 couldn't be checked", which opens on each one's reason.
function failedEl(failed, several) {
  const li = el("li", "ops__phrase");
  li.dataset.status = "unknown";
  const more = el("details", "ops__why");
  const summary = el("summary");
  summary.append(dot("unknown"), el("span", "ops__phrase-name", `${failed.length} couldn't be checked`));
  const list = el("ul", "ops__why-list");
  for (const i of failed) {
    const item = el("li");
    item.append(el("span", "ops__phrase-name", nameOf(i, several)), el("span", "ops__phrase-said", i.detail || i.status || ""));
    list.append(item);
  }
  more.append(summary, list);
  li.append(more);
  return li;
}

function checkedText(data) {
  const age = Date.parse(data.checked) - Date.parse(data.generated);
  switch (data.file) {
    case "fresh":
      return `checked ${ago(age)}`;
    case "stale":
      if (!data.generated) return "Update check stopped";
      if (age < 0) return `updates.json is dated ${stamp(data.generated)}, which hasn't happened yet`;
      return `Update check stopped ${ago(age)}`;
    case "missing":
      return "No updates.json";
    case "schema":
      return data.schema == null ? "updates.json has no schema" : `updates.json is on schema ${data.schema}`;
  }
  return null;
}

function render(data) {
  const text = checkedText(data);
  if (!text) throw new Error(`Unknown file state "${data.file}"`);

  rowEl.dataset.state    = "ready";
  offersEl.dataset.state = "ready";
  rowEl.dataset.file     = data.file;
  rowEl.hidden = false;

  if (data.file !== "fresh") {
    offersEl.replaceChildren();
    listEl.replaceChildren(phrase("unknown", text));
    return;
  }

  const perService = new Map();
  for (const i of data.images) if (i.service) perService.set(i.service, (perService.get(i.service) ?? 0) + 1);
  const several = new Set([...perService].filter(([, n]) => n > 1).map(([s]) => s));

  const images  = [...data.images].sort((a, b) => nameOf(a, several).localeCompare(nameOf(b, several)));
  const pending = images.filter(isPending).sort(byTier);
  const failed  = images.filter((i) => !isPending(i) && i.status !== "ok" && i.status !== "skip");
  const ok      = images.filter((i) => i.status === "ok").length;
  const skipped = images.filter((i) => i.status === "skip").length;

  offersEl.replaceChildren(...pending.map((i) => offerEl(i, several)));

  const items = [];
  if (ok)      items.push(phrase("ok", `${ok} up to date`));
  if (skipped) items.push(phrase("muted", `${skipped} skipped`));
  if (failed.length) items.push(failedEl(failed, several));
  const when = el("li", "ops__phrase ops__phrase--note", text);
  if (data.generated) when.title = stamp(data.generated);
  items.push(when);
  listEl.replaceChildren(...items);
}

/**
 * Draws the answer to GET /ops/api/updates, as a settled promise, and
 * returns a fresh file's images, or none. A failed request keeps
 * whatever was drawn, marked as old.
 */
export function showUpdates(result) {
  try {
    if (result.status === "rejected") throw result.reason;
    render(result.value);
    showing = result.value;
  } catch (err) {
    console.error("Ops updates error:", err.message);
    const state = failedState(err, showing !== null);
    rowEl.dataset.state    = state;
    offersEl.dataset.state = state;
    if (showing === null) rowEl.hidden = false;
  }
  return showing?.file === "fresh" ? showing.images : [];
}

/** "2 updates", or nothing. */
export function pendingText(images) {
  const n = images.filter(isPending).length;
  return n ? count(n, "update") : "";
}

/** The services an offer card already speaks for. */
export function offered(images) {
  return new Set(images.filter(isPending).map((i) => i.service).filter(Boolean));
}
