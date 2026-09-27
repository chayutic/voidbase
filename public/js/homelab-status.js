// ═══════════════════════════════════════════════════════════════
//  HOMELAB STATUS — service health on the cards, and a header line
// ═══════════════════════════════════════════════════════════════
//
//  Reads GET /ops/api/health, which answers on the LAN only: Caddy
//  refuses /ops* through the tunnel, so there the first request fails
//  and nothing is ever drawn. The markup carries no status of its
//  own; everything below is added after the first answer.

import { getJSON, failedState } from "./request.js";
import { ago, count }           from "./format.js";
import { buildRows, tally }     from "./health-rows.js";

const locationEl = document.querySelector(".header__location");
const cardEls    = document.querySelectorAll(".card[data-service]");

const REFRESH_MS = 60_000;

// States a card speaks up for. Muted was silenced on purpose.
const LOUD = new Set(["fail", "warn", "unknown"]);

let latestRequest = 0;
let lineEl = null;

function describe(data, rows) {
  switch (data.file) {
    case "fresh": {
      const t = tally(rows);
      const said = [];
      if (t.fail)    said.push(`${t.fail} down`);
      if (t.warn)    said.push(count(t.warn, "warning"));
      if (t.unknown) said.push(`${t.unknown} unknown`);
      const status = t.fail ? "fail" : t.warn ? "warn" : t.unknown ? "unknown" : "ok";
      return { status, text: said.length ? said.join(", ") : "All services healthy" };
    }
    case "stale": {
      const age = Date.parse(data.checked) - Date.parse(data.generated);
      if (!(age >= 0)) return { status: "unknown", text: "Status unknown" };
      return { status: "fail", text: `Collector stopped ${ago(age)}` };
    }
    case "missing":
      return { status: "fail", text: "Collector stopped" };
  }
  return { status: "unknown", text: "Status unknown" };
}

function ensureLine() {
  if (lineEl) return lineEl;
  lineEl = document.createElement("span");
  lineEl.className = "header__health";
  lineEl.innerHTML = ` · <a class="header__health-link" href="/ops"><span class="header__health-dot" aria-hidden="true"></span><span></span></a>`;
  locationEl.append(lineEl);
  return lineEl;
}

function paintCard(card, row) {
  if (!row || !LOUD.has(row.state)) {
    delete card.dataset.status;
    return;
  }
  let detail = card.querySelector(".card__detail");
  if (!detail) {
    const dot = document.createElement("span");
    dot.className = "card__dot";
    dot.setAttribute("aria-hidden", "true");
    detail = document.createElement("span");
    detail.className = "card__detail";
    card.append(dot, detail);
  }
  const text = row.more ? `${row.detail} +${row.more} more` : row.detail;
  card.dataset.status = row.state;
  detail.textContent = text;
  detail.title = text;
}

async function fetchStatus() {
  const seq = ++latestRequest;
  let data;
  try {
    data = await getJSON("/ops/api/health");
  } catch (err) {
    if (seq !== latestRequest) return false;
    if (lineEl) {
      console.error("Homelab status error:", err.message);
      lineEl.dataset.state = failedState(err, true);
    }
    return false;
  }

  if (seq !== latestRequest) return true;

  const rows = data.file === "fresh"
    ? buildRows(data.checks, data.services, data.servicesFile === "fresh")
    : null;
  const { status, text } = describe(data, rows);

  const line = ensureLine();
  line.dataset.state  = "ready";
  line.dataset.status = status;
  line.querySelector(".header__health-link > span:last-child").textContent = text;

  const byName = new Map((rows ?? []).filter((r) => !r.host).map((r) => [r.name, r]));
  for (const card of cardEls) paintCard(card, byName.get(card.dataset.service));
  return true;
}

export async function initHomelabStatus() {
  if (!locationEl) return;
  // A first failure is the tunnel's refusal, or no /ops at all:
  // either way there is nothing to poll for.
  if (!(await fetchStatus())) return;
  setInterval(() => {
    if (document.visibilityState === "visible") fetchStatus();
  }, REFRESH_MS);
}
