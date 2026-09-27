// ═══════════════════════════════════════════════════════════════
//  HEALTH ROWS — health.json's checks folded into rows
// ═══════════════════════════════════════════════════════════════
//
//  One row per service, carrying its worst check, and one per check
//  with no `service` (the host's own: disk, raid, smart…). The fold is
//  by the `service` field and nothing else, which is how dns and
//  tailscale join theirs, and a kind neither page has heard of
//  still lands somewhere.

// Contract § 3's ranking. muted and unknown tie.
const RANK = { ok: 0, muted: 1, unknown: 1, warn: 2, fail: 3 };

// Kinds that name one container in their id: `container:<name>`.
const PER_CONTAINER = new Set(["container", "restarts"]);

function stateOf(check) {
  return Object.hasOwn(RANK, check.state) ? check.state : "unknown";
}

// NaN sorts as oldest, so a check with no `since` never jumps the queue.
function time(iso) {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? -Infinity : t;
}

function worse(a, b) {
  return RANK[stateOf(a)] - RANK[stateOf(b)] || time(a.since) - time(b.since);
}

function worst(checks) {
  return checks.reduce((w, c) => (worse(c, w) > 0 ? c : w));
}

function subject(check) {
  const at = check.id.indexOf(":");
  return at === -1 ? "" : check.id.slice(at + 1);
}

// immich_machine_learning in immich → "machine learning".
function part(container, service) {
  const rest = container.startsWith(service) ? container.slice(service.length).replace(/^[-_]/, "") : container;
  return (rest || container).replace(/[-_]+/g, " ");
}

// Which of the service's checks this is, when the detail alone
// can't say: "no answer" is the probe's or the dns check's.
function detailOf(check, service, containers) {
  const said = [];
  if (PER_CONTAINER.has(check.kind)) {
    if (containers > 1) said.push(part(subject(check), service));
  } else if (check.kind !== service) {
    said.push(check.kind);
  }
  return said.length ? `${said.join(" ")}: ${check.detail}` : check.detail;
}

function serviceRow(name, containers, checks, url) {
  if (!checks.length) {
    return { name, state: "unknown", detail: "no checks", since: null, more: 0, host: false, url };
  }
  const w = worst(checks);
  const count = containers ?? new Set(checks.filter((c) => PER_CONTAINER.has(c.kind)).map(subject)).size;
  return {
    name,
    state: stateOf(w),
    detail: detailOf(w, name, count),
    since: w.since ?? null,
    more: checks.filter((c) => c !== w && stateOf(c) !== "ok").length,
    host: false,
    url,
    parts: count > 1 ? partsOf(checks, name) : [],
  };
}

// Each container's worst check: [{ name: "machine learning", state }].
function partsOf(checks, service) {
  const by = new Map();
  for (const c of checks) {
    if (!PER_CONTAINER.has(c.kind)) continue;
    const had = by.get(subject(c));
    if (!had || worse(c, had) > 0) by.set(subject(c), c);
  }
  return [...by].map(([container, c]) => ({ name: part(container, service), state: stateOf(c) }));
}

function hostRow(check) {
  const at = check.id.indexOf(":");
  return {
    name: at === -1 ? check.id : `${check.id.slice(0, at)} ${check.id.slice(at + 1)}`,
    state: stateOf(check),
    detail: check.detail,
    since: check.since ?? null,
    more: 0,
    host: true,
    url: null,
  };
}

function sorted(rows) {
  return rows.sort((a, b) =>
    RANK[b.state] - RANK[a.state] || time(b.since) - time(a.since) || a.name.localeCompare(b.name));
}

function checkable(s) {
  return Array.isArray(s.containers) && s.containers.length > 0;
}

/**
 * Worst first: fail, warn, then muted and unknown together, then ok;
 * ties by the newest `since`. `services` is the registry, which decides
 * which services exist only when `fresh`; otherwise the checks alone
 * do, and the registry only lends its links.
 */
export function buildRows(checks, services, fresh) {
  const folds = new Map();
  if (fresh) {
    for (const s of services ?? []) {
      folds.set(s.name, { containers: Array.isArray(s.containers) ? s.containers.length : null, checks: [] });
    }
  }

  const rows = [];
  for (const c of checks) {
    if (typeof c?.id !== "string") continue;
    if (!c.service) {
      rows.push(hostRow(c));
      continue;
    }
    if (!folds.has(c.service)) folds.set(c.service, { containers: null, checks: [] });
    folds.get(c.service).checks.push(c);
  }

  const links = new Map((services ?? []).map((s) => [s.name, s.url ?? null]));
  for (const [name, fold] of folds) {
    // A registry entry with no containers has nothing to check.
    if (!fold.checks.length && !fold.containers) continue;
    rows.push(serviceRow(name, fold.containers, fold.checks, links.get(name) ?? null));
  }

  return sorted(rows);
}

/**
 * The registry alone, for when health.json can't say anything: every
 * state unknown, nothing but names and links.
 */
export function registryRows(services) {
  return sorted((services ?? []).filter(checkable).map((s) => ({
    name: s.name, state: "unknown", detail: "", since: null, more: 0, host: false, url: s.url ?? null,
  })));
}

export function tally(rows) {
  const t = { fail: 0, warn: 0, unknown: 0, muted: 0, okServices: 0, okHosts: 0 };
  for (const r of rows) {
    if (r.state !== "ok") t[r.state]++;
    else if (r.host) t.okHosts++;
    else t.okServices++;
  }
  return t;
}
