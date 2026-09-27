// ═══════════════════════════════════════════════════════════════
//  STORAGE — a tank per volume, its disks beneath
// ═══════════════════════════════════════════════════════════════
//
//  disk.csv draws each volume's 90 days as an area on a fixed 0–100
//  scale, so how much of the card is filled is how full the volume
//  is. smart.json's disks sit under the volume they belong to, on
//  its own 26-hour clock. Cards are made once and updated in place,
//  so the fill rises on the first draw and never again.

import { failedState }     from "../request.js";
import { ago, stamp, day } from "../format.js";

const sectionEl  = document.getElementById("opsStorage");
const checkedEl  = document.getElementById("opsSmartChecked");
const volumesEl  = document.getElementById("opsVolumes");
const looseEl    = document.getElementById("opsLooseDisks");
const looseRows  = document.getElementById("opsLooseRows");
const noteEl     = document.getElementById("opsVolumesNote");

// Which disks make up which volume isn't in the contract yet (asked
// of ops), so it's here, by role.
const VOLUMES = [
  { mount: "/home",    name: "Array", roles: ["raid", "cache"] },
  { mount: "/volume2", name: "SSD",   roles: ["volume2"] },
];

const FULL_SPAN = 90;

const cards = new Map();
let made    = 0;
let showing = false;

// Binary units under decimal names, as UGOS shows them, so the two
// agree.
function size(bytes) {
  const tb = bytes / 1024 ** 4;
  if (tb >= 1) return `${tb.toFixed(1)} TB`;
  const gb = bytes / 1024 ** 3;
  return `${gb >= 100 ? Math.round(gb) : gb.toFixed(1)} GB`;
}

function clampPct(n) {
  return Math.min(100, Math.max(0, n));
}

function paths(history) {
  const ys = history.map(([, pct]) => 100 - clampPct(pct));
  const points = ys.length === 1
    ? [[0, ys[0]], [100, ys[0]]]
    : ys.map((y, i) => [(i / (ys.length - 1)) * 100, y]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(2)},${y}`).join(" ");
  return { line, fill: `${line} L100,100 L0,100 Z` };
}

function cardEl(index) {
  const el = document.createElement("article");
  el.className = "ops__volume";
  el.innerHTML = `
    <div class="ops__tank">
      <div class="ops__tank-top">
        <span class="ops__volume-name"></span>
        <span class="ops__volume-mount"></span>
        <span class="ops__volume-span"></span>
      </div>
      <div class="ops__tank-scale">
        <span class="ops__threshold" data-level="warn" hidden></span>
        <span class="ops__threshold" data-level="fail" hidden></span>
        <svg class="ops__tank-plot" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="opsTank${index}" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="100">
              <stop class="ops__tank-stop" offset="0"/>
              <stop class="ops__tank-stop ops__tank-stop--end" offset="1"/>
            </linearGradient>
          </defs>
          <path class="ops__tank-fill" fill="url(#opsTank${index})"/>
          <path class="ops__tank-line"/>
        </svg>
        <div class="ops__tank-level">
          <div class="ops__tank-reading">
            <span class="ops__volume-pct"></span>
            <span class="ops__volume-used"></span>
          </div>
        </div>
      </div>
    </div>
    <ul class="ops__disks"></ul>`;
  return el;
}

// A threshold the fill has passed is said by its colour instead.
function setThreshold(el, at, pct) {
  el.hidden = !Number.isFinite(at) || at <= pct;
  if (!el.hidden) el.style.setProperty("--at", clampPct(at));
}

function drawVolume(el, volume, check) {
  const q = (s) => el.querySelector(s);
  const { line, fill } = paths(volume.history);
  q(".ops__tank-fill").setAttribute("d", fill);
  q(".ops__tank-line").setAttribute("d", line);

  const [first] = volume.history[0];
  const [, pct] = volume.history.at(-1);

  if (check && (check.state === "warn" || check.state === "fail")) el.dataset.status = check.state;
  else delete el.dataset.status;
  setThreshold(q('[data-level="warn"]'), check?.warn, pct);
  setThreshold(q('[data-level="fail"]'), check?.fail, pct);
  el.style.setProperty("--level", clampPct(pct));
  el.dataset.reading = pct >= 50 ? "below" : "above";

  q(".ops__volume-name").textContent  = volume.name;
  q(".ops__volume-mount").textContent = volume.name === volume.mount ? "" : volume.mount;
  q(".ops__volume-span").textContent  = volume.history.length >= FULL_SPAN ? "90 days" : `since ${day(first)}`;
  q(".ops__volume-pct").textContent   = `${pct} %`;
  q(".ops__volume-used").textContent  = volume.used_bytes == null ? "" : `${size(volume.used_bytes)} used`;
}

function cell(className, text) {
  const span = document.createElement("span");
  span.className = className;
  span.textContent = text;
  return span;
}

function diskEl(disk) {
  const li = document.createElement("li");
  li.className = "ops__disk";
  li.dataset.status = disk.state;

  const dot = document.createElement("span");
  dot.className = "ops__dot";
  dot.setAttribute("aria-hidden", "true");

  const ok = disk.state === "ok";
  const model = cell("ops__disk-model", ok ? disk.model ?? "" : disk.detail);
  if (disk.model) model.title = disk.model;

  li.append(
    dot,
    cell("ops__disk-label", disk.label),
    model,
    cell("ops__disk-num", disk.temp_c == null ? "" : `${disk.temp_c} °C`),
    cell("ops__disk-num", disk.power_on_hours == null ? "" : `${disk.power_on_hours.toLocaleString("en-US")} h`),
    cell("ops__disk-num", disk.wear_pct == null ? "" : `wear ${disk.wear_pct} %`),
  );
  return li;
}

// "raid 1", "raid 2": numbered when a role has several, as
// public.json labels them.
function labelled(disks) {
  const of = new Map();
  for (const d of disks) of.set(d.role, (of.get(d.role) ?? 0) + 1);
  const seen = new Map();
  return disks.map((d) => {
    const n = (seen.get(d.role) ?? 0) + 1;
    seen.set(d.role, n);
    return { ...d, label: of.get(d.role) > 1 ? `${d.role} ${n}` : d.role };
  });
}

function checkedText(smart, checked) {
  const age = Date.parse(checked) - Date.parse(smart.generated);
  switch (smart.file) {
    case "fresh":   return `SMART checked ${ago(age)}`;
    case "stale":
      if (!smart.generated) return "SMART check stopped";
      if (age < 0) return `smart.json is dated ${stamp(smart.generated)}, which hasn't happened yet`;
      return `SMART check stopped ${ago(age)}`;
    case "missing": return "no smart.json";
    case "schema":  return smart.schema == null ? "smart.json has no schema" : `smart.json is on schema ${smart.schema}`;
  }
  return null;
}

function render(data, checks) {
  const text = checkedText(data.smart, data.checked);
  if (!text) throw new Error(`Unknown file state "${data.smart.file}"`);

  sectionEl.dataset.state = "ready";
  sectionEl.dataset.file  = data.smart.file;
  checkedEl.textContent   = text;
  if (data.smart.generated) checkedEl.title = stamp(data.smart.generated);
  else checkedEl.removeAttribute("title");
  sectionEl.hidden = false;

  const disks = labelled(data.smart.disks ?? []);
  const mounts = data.disk.mounts ?? [];
  const known = VOLUMES.filter((v) => mounts.some((m) => m.mount === v.mount));
  const volumes = [
    ...known.map((v) => ({ ...v, ...mounts.find((m) => m.mount === v.mount) })),
    ...mounts.filter((m) => !VOLUMES.some((v) => v.mount === m.mount)).map((m) => ({ ...m, name: m.mount, roles: [] })),
  ].filter((v) => v.history.length);

  for (const [mount, el] of cards) {
    if (!volumes.some((v) => v.mount === mount)) {
      el.remove();
      cards.delete(mount);
    }
  }

  for (const v of volumes) {
    let el = cards.get(v.mount);
    if (!el) {
      el = cardEl(made++);
      cards.set(v.mount, el);
    }
    volumesEl.append(el);
    drawVolume(el, v, checks?.find((c) => c.id === `disk:${v.mount}`));
    el.querySelector(".ops__disks").replaceChildren(...disks.filter((d) => v.roles.includes(d.role)).map(diskEl));
  }

  const placed = new Set(volumes.flatMap((v) => v.roles));
  const loose = disks.filter((d) => !placed.has(d.role));
  looseRows.replaceChildren(...loose.map(diskEl));
  looseEl.hidden = !loose.length;
  noteEl.textContent = data.disk.file !== "fresh" ? "no disk.csv, so no volumes"
                     : !volumes.length          ? "disk.csv has no rows yet"
                     :                            "";
}

/**
 * Draws the answer to GET /ops/api/storage, as a settled promise.
 * `checks` are a fresh health.json's, for each mount's thresholds
 * and state, or null.
 */
export function showStorage(result, checks) {
  try {
    if (result.status === "rejected") throw result.reason;
    render(result.value, checks);
    showing = true;
  } catch (err) {
    console.error("Ops storage error:", err.message);
    sectionEl.dataset.state = failedState(err, showing);
  }
}
