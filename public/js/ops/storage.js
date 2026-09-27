// ═══════════════════════════════════════════════════════════════
//  STORAGE — the NAS from the front, and what it says in words
// ═══════════════════════════════════════════════════════════════
//
//  The array's drives stand in their bays, each filled to how full
//  the array is; the SSD volume is the M.2 stick below. The readout says the same in sentences. disk.csv gives the
//  levels, smart.json the drives on its own 26-hour clock. Fetched
//  once per page load: none of it changes more than daily.

import { failedState }      from "../request.js";
import { ago, stamp, day }  from "../format.js";
import { el, dot, capital } from "./dom.js";

const sectionEl = document.getElementById("opsStorage");
const checkedEl = document.getElementById("opsSmartChecked");
const chassisEl = document.getElementById("opsChassis");
const noteEl    = document.getElementById("opsVolumesNote");

// Which disks make up which volume, by role: contract § 3's roles to
// mounts. smart.json doesn't say so per disk.
const VOLUMES = [
  { mount: "/home",    name: "Array", roles: ["raid", "cache"] },
  { mount: "/volume2", name: "SSD",   roles: ["volume2"] },
];

// The DXP4800 Plus's front. smart.json has no bay numbers, so drives
// fill bays in its order.
const BAYS = 4;

const MODELS = {
  "WDC WD40EFRX-68N32N0": "WD Red Plus 4 TB",
  "WD Blue SN5000 1TB":   "WD Blue SN5000 1 TB",
  "WD Blue SN5000 500GB": "WD Blue SN5000 500 GB",
  "YSO128GTLCW-E3C-2":    "128 GB",
};

const COUNTS = ["", "", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight"];

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

function modelOf(disk) {
  return MODELS[disk.model] ?? disk.model ?? "";
}

// 21,865 h → "2 yr 6 mo"
function age(hours) {
  const months = Math.round(hours / 730);
  if (months < 1) return `${Math.max(1, Math.round(hours / 24))} days`;
  if (months < 12) return `${months} mo`;
  const years = Math.floor(months / 12), rest = months % 12;
  return rest ? `${years} yr ${rest} mo` : `${years} yr`;
}

function statusOf(check) {
  return check && (check.state === "warn" || check.state === "fail") ? check.state : null;
}

// ── Drawing ────────────────────────────────────────────────────

function bayEl(disk, level, status) {
  const bay = el("div", "ops__bay");
  const body = el("div", "ops__bay-body");
  if (disk) {
    const fill = el("span", "ops__bay-fill");
    if (status) fill.dataset.status = status;
    fill.style.setProperty("--level", level);
    const led = dot(disk.state);
    led.classList.add("ops__bay-led");
    body.append(fill, led, el("span", "ops__bay-grip"));
    body.title = disk.model ?? "";
  } else {
    bay.classList.add("ops__bay--empty");
    body.append(el("span", "ops__bay-empty", "empty"));
  }
  bay.append(body, el("span", "ops__bay-temp", disk?.temp_c == null ? "" : `${disk.temp_c}°`));
  return bay;
}

function stickEl(name, level, status, disk) {
  const stick = el("div", "ops__stick");
  const body = el("div", "ops__stick-body");
  const fill = el("span", "ops__stick-fill");
  if (status) fill.dataset.status = status;
  fill.style.setProperty("--level", level);
  body.append(fill);
  if (disk?.model) body.title = disk.model;
  stick.append(body, el("span", null, name));
  return stick;
}

function scaleEl(check) {
  const scale = el("div", "ops__scale");
  for (const at of [check?.warn, check?.fail]) {
    if (!Number.isFinite(at)) continue;
    const tick = el("span", null, String(at));
    tick.style.setProperty("--at", clampPct(at));
    scale.append(tick);
  }
  return scale;
}

// ── Sentences ──────────────────────────────────────────────────

// "flat since 26 Sep", "up 4 points since 1 Jul".
function trend(history) {
  const [first, was] = history[0];
  const [, now] = history.at(-1);
  const moved = now - was;
  const since = `since ${day(first)}`;
  if (!moved) return `flat ${since}`;
  return `${moved > 0 ? "up" : "down"} ${Math.abs(moved)} point${Math.abs(moved) === 1 ? "" : "s"} ${since}`;
}

function range(values) {
  const lo = Math.min(...values), hi = Math.max(...values);
  return lo === hi ? `${lo}°` : `${lo}–${hi}°`;
}

// "Three WD Red Plus 4 TB drives, 2 yr 6 mo old, 41–43°, SMART passed."
function drivesSaid(disks) {
  if (!disks.length) return "";
  const models = [...new Set(disks.map(modelOf))];
  const what = disks.length === 1  ? models[0]
             : models.length === 1 ? `${COUNTS[disks.length] ?? disks.length} ${models[0]} drives`
             :                       `${disks.length} drives`;
  const said = [what];
  const hours = disks.map((d) => d.power_on_hours).filter(Number.isFinite);
  if (hours.length) said.push(`${age(Math.max(...hours))} old`);
  const temps = disks.map((d) => d.temp_c).filter(Number.isFinite);
  if (temps.length) said.push(range(temps));
  const wear = disks.map((d) => d.wear_pct).filter(Number.isFinite);
  if (wear.length) said.push(`${100 - Math.max(...wear)} % life left`);
  const bad = disks.filter((d) => d.state !== "ok");
  said.push(bad.length ? bad.map((d) => d.detail).join(", ") : "SMART passed");
  return `${said.join(", ")}.`;
}

function volumeEl(volume, disks, check) {
  const [, pct] = volume.history.at(-1);
  const box = el("div", "ops__vol");
  const status = statusOf(check);
  if (status) box.dataset.status = status;

  const head = el("div", "ops__vol-head");
  const reading = el("span", "ops__vol-pct", `${pct} %`);
  reading.append(el("small", null, "full"));
  head.append(el("span", "ops__vol-name", volume.name), reading);

  const said = el("p", "ops__vol-said");
  if (volume.used_bytes != null) said.append(el("b", null, size(volume.used_bytes)), " used, ");
  said.append(`${trend(volume.history)}. ${drivesSaid(disks)}`);
  box.append(head, said);
  return box;
}

// "Cache: WD Blue SN5000 1 TB, 42°, 100 % life left."
function looseSaid(disk) {
  const said = [modelOf(disk)];
  if (Number.isFinite(disk.temp_c)) said.push(`${disk.temp_c}°`);
  if (Number.isFinite(disk.wear_pct)) said.push(`${100 - disk.wear_pct} % life left`);
  if (disk.state !== "ok") said.push(disk.detail);
  return `${capital(disk.role)}: ${said.filter(Boolean).join(", ")}.`;
}

// ── Render ─────────────────────────────────────────────────────

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

  const disks = data.smart.disks ?? [];
  const mounts = (data.disk.mounts ?? []).filter((m) => m.history.length);
  const volumes = [
    ...VOLUMES.filter((v) => mounts.some((m) => m.mount === v.mount)).map((v) => ({ ...v, ...mounts.find((m) => m.mount === v.mount) })),
    ...mounts.filter((m) => !VOLUMES.some((v) => v.mount === m.mount)).map((m) => ({ ...m, name: m.mount, roles: [] })),
  ];
  const checkOf = (v) => checks?.find((c) => c.id === `disk:${v.mount}`);
  const levelOf = (v) => (v ? clampPct(v.history.at(-1)[1]) : 0);

  const array = volumes.find((v) => v.mount === "/home");
  const ssd   = volumes.find((v) => v.mount === "/volume2");
  const raid  = disks.filter((d) => d.role === "raid");

  const rack = el("div", "ops__rack");
  const bays = el("div", "ops__bays");
  bays.append(scaleEl(checkOf(array)));
  // With no drives known, every bay is drawn as one, unknown.
  const drawn = raid.length ? raid : Array.from({ length: BAYS }, () => ({ state: "unknown" }));
  if (array) {
    for (let i = 0; i < Math.max(BAYS, drawn.length); i++) bays.append(bayEl(drawn[i], levelOf(array), statusOf(checkOf(array))));
  }
  const sticks = el("div", "ops__sticks");
  if (ssd) sticks.append(stickEl(ssd.name, levelOf(ssd), statusOf(checkOf(ssd)), disks.find((d) => d.role === "volume2")));
  rack.append(bays, sticks);

  const readout = el("div", "ops__readout");
  readout.append(...volumes.map((v) => volumeEl(v, disks.filter((d) => v.roles.includes(d.role) && d.role !== "cache"), checkOf(v))));
  const placed = new Set(volumes.flatMap((v) => v.roles).filter((r) => r !== "cache"));
  const loose = disks.filter((d) => !placed.has(d.role));
  if (loose.length) readout.append(el("p", "ops__readout-foot", loose.map(looseSaid).join(" ")));

  chassisEl.replaceChildren(rack, readout);
  chassisEl.hidden = !volumes.length && !disks.length;
  noteEl.textContent = data.disk.file !== "fresh" ? "no disk.csv, so no volumes"
                     : !volumes.length          ? "disk.csv has no rows yet"
                     :                            "";
}

/**
 * Draws the answer to GET /ops/api/storage, as a settled promise, and
 * says whether it drew. `checks` are a fresh health.json's, for each
 * mount's thresholds and state, or null.
 */
export function showStorage(result, checks) {
  try {
    if (result.status === "rejected") throw result.reason;
    render(result.value, checks);
    showing = true;
  } catch (err) {
    console.error("Ops storage error:", err.message);
    sectionEl.dataset.state = failedState(err, showing);
    if (!showing) sectionEl.hidden = false;
  }
  return showing;
}
