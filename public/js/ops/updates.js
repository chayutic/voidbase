// ═══════════════════════════════════════════════════════════════
//  UPDATES — updates.json's images, and the services they lift
// ═══════════════════════════════════════════════════════════════
//
//  Pending (status "update") and failed checks are rows of their own;
//  up-to-date and skipped images fold. A pending image also lifts its
//  service out of the board's ok fold, below every health problem.
//  Only a fresh file's images reach the page, so a stale one lifts
//  nothing.

import { failedState }       from "../request.js";
import { ago, stamp, count } from "../format.js";
import { rowEl }             from "./board.js";

const sectionEl  = document.getElementById("opsUpdates");
const checkedEl  = document.getElementById("opsUpdatesChecked");
const cardEl     = document.getElementById("opsUpdatesCard");
const rowsEl     = document.getElementById("opsUpdateRows");
const foldEl     = document.getElementById("opsUpdateFold");
const foldLineEl = document.getElementById("opsUpdateFoldLine");
const okRowsEl   = document.getElementById("opsUpdateOkRows");

const TIER = { fast: 0, slow: 1 };

let showing = null;

function tierRank(image) {
  return TIER[image.tier] ?? 2;
}

function byTier(a, b) {
  return tierRank(a) - tierRank(b);
}

function isPending(image) {
  return image.status === "update";
}

// immich-server in immich → "immich server"; an image with no
// service goes by its id.
function nameOf(image, several) {
  if (!image.service) return image.id;
  if (!several.has(image.service)) return image.service;
  const rest = image.id.startsWith(image.service) ? image.id.slice(image.service.length).replace(/^[-_]/, "") : image.id;
  return `${image.service} ${(rest || image.id).replace(/[-_]+/g, " ")}`;
}

function change(image) {
  if (image.detail) return image.detail;
  if (image.running && image.latest) return `${image.running} → ${image.latest}`;
  return "update available";
}

function rowOf(image, several) {
  const state = image.status === "ok" ? "ok"
              : image.status === "skip" ? "muted"
              : isPending(image) ? "update"
              : "unknown";
  return {
    name:   nameOf(image, several),
    state,
    detail: isPending(image) ? change(image) : image.detail || image.running || image.status || "",
    since:  null,
    more:   0,
    url:    image.notes_url,
    aside:  image.tier ?? "",
  };
}

function checkedText(data) {
  const age = Date.parse(data.checked) - Date.parse(data.generated);
  switch (data.file) {
    case "fresh":
      return `checked ${ago(age)}`;
    case "stale":
      if (!data.generated) return "update check stopped";
      if (age < 0) return `updates.json is dated ${stamp(data.generated)}, which hasn't happened yet`;
      return `update check stopped ${ago(age)}`;
    case "missing":
      return "no updates.json";
    case "schema":
      return data.schema == null ? "updates.json has no schema" : `updates.json is on schema ${data.schema}`;
  }
  return null;
}

function render(data) {
  const text = checkedText(data);
  if (!text) throw new Error(`Unknown file state "${data.file}"`);

  sectionEl.dataset.state = "ready";
  sectionEl.dataset.file  = data.file;
  checkedEl.textContent   = text;
  if (data.generated) checkedEl.title = stamp(data.generated);
  else checkedEl.removeAttribute("title");
  sectionEl.hidden = false;

  if (data.file !== "fresh") {
    cardEl.hidden = true;
    rowsEl.replaceChildren();
    okRowsEl.replaceChildren();
    return;
  }

  const perService = new Map();
  for (const i of data.images) if (i.service) perService.set(i.service, (perService.get(i.service) ?? 0) + 1);
  const several = new Set([...perService].filter(([, n]) => n > 1).map(([s]) => s));

  const images  = [...data.images].sort((a, b) => nameOf(a, several).localeCompare(nameOf(b, several)));
  const pending = images.filter(isPending).sort(byTier);
  const failed  = images.filter((i) => !isPending(i) && i.status !== "ok" && i.status !== "skip");
  const quiet   = images.filter((i) => i.status === "ok" || i.status === "skip");

  rowsEl.replaceChildren(...[...pending, ...failed].map((i) => rowEl(rowOf(i, several), NaN)));
  okRowsEl.replaceChildren(...quiet.map((i) => rowEl(rowOf(i, several), NaN)));

  const ok      = quiet.filter((i) => i.status === "ok").length;
  const skipped = quiet.length - ok;
  const said = [];
  if (ok)      said.push(`${ok} up to date`);
  if (skipped) said.push(`${skipped} skipped`);
  foldLineEl.textContent = said.join(", ");
  foldEl.hidden = !quiet.length;
  cardEl.hidden = !images.length;
}

/**
 * Draws the answer to GET /ops/api/updates, as a settled promise, and
 * returns the pending images now on screen. A failed request keeps
 * whatever was drawn, marked as old.
 */
export function showUpdates(result) {
  if (result.status === "fulfilled") {
    try {
      render(result.value);
      showing = result.value;
    } catch (err) {
      console.error("Ops updates error:", err.message);
      sectionEl.dataset.state = failedState(err, showing !== null);
    }
  } else {
    console.error("Ops updates error:", result.reason?.message);
    sectionEl.dataset.state = failedState(result.reason, showing !== null);
  }
  return showing?.file === "fresh" ? showing.images.filter(isPending) : [];
}

/** "2 updates available", or nothing. */
export function pendingText(pending) {
  return pending.length ? `${count(pending.length, "update")} available` : "";
}

/**
 * The board's rows with each healthy service that has a pending image
 * lifted out of the ok fold: after every health problem, fast tier
 * first. A service already in trouble keeps its health row.
 */
export function withUpdates(rows, pending) {
  const byService = new Map();
  for (const i of [...pending].sort(byTier)) {
    if (!i.service) continue;
    if (!byService.has(i.service)) byService.set(i.service, []);
    byService.get(i.service).push(i);
  }

  const lifted = [];
  const rest   = [];
  for (const r of rows) {
    const images = !r.host && r.state === "ok" ? byService.get(r.name) : null;
    if (!images) {
      rest.push(r);
      continue;
    }
    const first = images[0];
    lifted.push({
      ...r,
      state:  "update",
      detail: first.detail || (first.latest ? `update to ${first.latest}` : "update available"),
      since:  null,
      more:   images.length - 1,
      rank:   tierRank(first),
    });
  }
  lifted.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));

  const at = rest.findIndex((r) => r.state === "ok");
  if (at === -1) return [...rest, ...lifted];
  return [...rest.slice(0, at), ...lifted, ...rest.slice(at)];
}
