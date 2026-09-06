// ═══════════════════════════════════════════════════════════════
//  GAME DEALS — tracked Steam titles with live pricing
// ═══════════════════════════════════════════════════════════════
//
//  Three server proxies feed this, all keyed server-side:
//    GET  /itad/search?q=      → ITAD title search, resolves Steam appid
//    POST /itad/prices         → current cut + 90-day store low
//    GET  /steam/price/:appid  → real THB price + review summary
//
//  Titles are ITAD-supplied and always go in via textContent/dataset,
//  never innerHTML. buildReviewIcon/Text are the one exception.

import * as store from "./store.js";
import { KEYS }   from "./store.js";

// Fire icon appears when the current discount is within this many
// percentage points of the 90-day low. Widened for already-deep lows.
const FIRE_NEAR_PP      = 10;
const FIRE_NEAR_PP_DEEP = 15;
const DEEP_LOW_PCT      = -55;

let pinnedGames  = store.json(KEYS.pinnedGames, []); // [{ id, title, appid }, ...]
const dealsCache  = new Map(); // id → { price, discount, low90, reviewDesc, reviewCount }

const dealsList       = document.getElementById("dealsList");
const dealsAddBtn     = document.getElementById("dealsAdd");
const dealsAddRow     = document.getElementById("dealsAddRow");
const dealsSearchInput  = document.getElementById("dealsSearchInput");
const dealsSearchBtn  = document.getElementById("dealsSearchBtn");
const dealsCancelBtn  = document.getElementById("dealsCancelBtn");
const dealsSearchResults = document.getElementById("dealsSearchResults");

// ── Search UI ──────────────────────────────────────────────────
function initSearchUI() {
  dealsAddBtn.addEventListener("click", () => {
    dealsAddRow.classList.toggle("visible");
    if (dealsAddRow.classList.contains("visible")) {
      dealsSearchInput.focus();
      dealsAddBtn.classList.add("active");
    } else {
      clearSearch();
      dealsAddBtn.classList.remove("active");
    }
  });

  dealsCancelBtn.addEventListener("click", () => {
    dealsAddRow.classList.remove("visible");
    dealsAddBtn.classList.remove("active");
    clearSearch();
  });

  dealsSearchBtn.addEventListener("click", searchGames);
  dealsSearchInput.addEventListener("keydown", e => {
    if (e.key === "Enter") searchGames();
    if (e.key === "Escape") {
      dealsAddRow.classList.remove("visible");
      dealsAddBtn.classList.remove("active");
      clearSearch();
    }
  });
}

function clearSearch() {
  dealsSearchInput.value = "";
  dealsSearchResults.innerHTML = "";
  dealsSearchResults.classList.remove("visible");
}

async function searchGames() {
  const q = dealsSearchInput.value.trim();
  if (!q) return;
  dealsSearchResults.innerHTML = `<div class="deals__result-item deals__result-loading">Searching…</div>`;
  dealsSearchResults.classList.add("visible");

  try {
    const res     = await fetch(`/itad/search?q=${encodeURIComponent(q)}`);
    const data    = await res.json();
    const results = Array.isArray(data) ? data : [];

    if (!results.length) {
      dealsSearchResults.innerHTML = `<div class="deals__result-item">No results found.</div>`;
      return;
    }

    dealsSearchResults.innerHTML = "";
    results.forEach(g => {
      const item = document.createElement("div");
      item.className     = "deals__result-item";
      item.dataset.id    = g.id;
      item.dataset.title = g.title;
      item.dataset.appid = g.appid || "";
      item.append(g.title);

      if (!g.appid) {
        const note = document.createElement("span");
        note.style.opacity  = "0.4";
        note.style.fontSize = "0.75em";
        note.textContent    = " (no Steam ID)";
        item.appendChild(note);
      }

      item.addEventListener("click", () => pinGame(item.dataset.id, item.dataset.title, item.dataset.appid));
      dealsSearchResults.appendChild(item);
    });

  } catch (err) {
    dealsSearchResults.innerHTML = `<div class="deals__result-item">Search failed.</div>`;
    console.error("ITAD search error:", err);
  }
}

function pinGame(id, title, appid) {
  if (pinnedGames.find(g => g.id === id)) { clearSearch(); return; }
  pinnedGames.push({ id, title, appid: appid || null });
  store.set(KEYS.pinnedGames, pinnedGames);
  clearSearch();
  dealsAddRow.classList.remove("visible");
  dealsAddBtn.classList.remove("active");
  fetchDeals().then(renderDeals);
}

function unpinGame(id) {
  pinnedGames = pinnedGames.filter(g => g.id !== id);
  store.set(KEYS.pinnedGames, pinnedGames);
  renderDeals();
}

// ── Data fetching ──────────────────────────────────────────────
async function fetchDeals() {
  if (!pinnedGames.length) return;
  const ids = pinnedGames.map(g => g.id);

  try {
    const steamFetches = pinnedGames
      .filter(g => g.appid)
      .map(g => fetch(`/steam/price/${g.appid}`).then(r => r.json()).then(d => ({
        id:          g.id,
        price:       d.price,
        reviewDesc:  d.reviewDesc  ?? null,
        reviewCount: d.reviewCount ?? null,
      })));

    const [itadRes, ...steamResults] = await Promise.all([
      fetch("/itad/prices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }),
      ...steamFetches,
    ]);
    const itadData = await itadRes.json();

    const steamPrices = new Map();
    steamResults.forEach(s => {
      if (s.price       != null) steamPrices.set(s.id, { price: s.price, reviewDesc: s.reviewDesc, reviewCount: s.reviewCount });
    });

    itadData.forEach(item => {
      const steam = steamPrices.get(item.id) ?? {};
      dealsCache.set(item.id, {
        price:       steam.price       ?? null,
        discount:    item.discount,
        low90:       item.low90discount,
        reviewDesc:  steam.reviewDesc  ?? null,
        reviewCount: steam.reviewCount ?? null,
      });
    });
  } catch (err) {
    console.error("Deals fetch error:", err);
  }
}

// ── Render ─────────────────────────────────────────────────────

const THUMB_UP_PATH   = `<path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3H14z"/>
  <path d="M7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>`;
const THUMB_DOWN_PATH = `<path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3H10z"/>
  <path d="M17 2h2.67A2.31 2.31 0 0 1 22 4v7a2.31 2.31 0 0 1-2.33 2H17"/>`;

const PLUS_SVG  = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const MINUS_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg>`;

function fmtReviewCount(n) {
  if (n == null) return "";
  if (n >= 10000)  return `${Math.round(n / 1000)}k`;
  if (n >= 1000)   return `${(n / 1000).toFixed(1)}k`;
  return `${n}`;
}

function reviewSentimentVar(desc) {
  if (!desc) return null;
  const d = desc.toLowerCase();
  if (d.includes("positive")) return "--steam-positive";
  if (d.includes("negative")) return "--steam-negative";
  if (d.includes("mixed"))    return "--steam-mixed";
  return null;
}

function buildThumbSVG(path) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
}

function buildReviewIcon(desc, count) {
  if (!desc) return `<span class="deals__review-icon">—</span>`;
  const colorVar = reviewSentimentVar(desc);
  const color    = colorVar ? `var(${colorVar})` : "inherit";
  const countStr = count != null ? `(${fmtReviewCount(count)})` : "";
  const d        = desc.toLowerCase();

  if (d.includes("mixed")) {
    return `<span class="deals__review-icon" title="${desc}${count != null ? ` · ${count.toLocaleString()} reviews` : ''}" style="color:${color}">
      <span style="font-size:0.85rem">Mixed</span>${countStr ? `<span style="font-size:0.85rem">${countStr}</span>` : ""}
    </span>`;
  }

  const isPositive = d.includes("positive");
  const thumbPath  = isPositive ? THUMB_UP_PATH : THUMB_DOWN_PATH;
  const thumbSVG   = buildThumbSVG(thumbPath);

  let modifier = "";
  if (d.startsWith("overwhelmingly")) {
    modifier = isPositive
      ? `<span class="deals__review-modifier">${PLUS_SVG}${PLUS_SVG}</span>`
      : `<span class="deals__review-modifier">${MINUS_SVG}${MINUS_SVG}</span>`;
  } else if (d.startsWith("very")) {
    modifier = isPositive
      ? `<span class="deals__review-modifier">${PLUS_SVG}</span>`
      : `<span class="deals__review-modifier">${MINUS_SVG}</span>`;
  } else if (d.startsWith("mostly negative") || d.startsWith("negative")) {
    modifier = `<span class="deals__review-modifier">${MINUS_SVG}</span>`;
  }

  return `<span class="deals__review-icon" title="${desc}${count != null ? ` · ${count.toLocaleString()} reviews` : ''}" style="color:${color}">
    ${thumbSVG}${modifier}${countStr ? `<span style="font-size:0.85rem">${countStr}</span>` : ""}
  </span>`;
}

function buildReviewText(desc, count) {
  if (!desc) return `<span style="color:var(--text-secondary)">—</span>`;
  const colorVar = reviewSentimentVar(desc);
  const color    = colorVar ? `var(${colorVar})` : "inherit";
  const countStr = count != null ? ` (${fmtReviewCount(count)})` : "";
  return `<span class="deals__review-text" style="color:${color}">${desc}${countStr}</span>`;
}
function renderDeals() {
  if (!pinnedGames.length) {
    dealsList.innerHTML = `<div class="deals__empty">No games tracked yet. Hit + to add a game.</div>`;
    return;
  }

  const sorted = [...pinnedGames].sort((a, b) => {
    const da = dealsCache.get(a.id)?.discount ?? 0;
    const db = dealsCache.get(b.id)?.discount ?? 0;
    return da - db;
  });

  const fmtPrice = v => v != null
    ? `฿${Math.round(parseFloat(v)).toLocaleString("th-TH")}`
    : "—";

  const fmtPct = v => v != null ? `${v}%` : "—";

  const fireSVG = `<span class="deals__fire" title="Within 10-15% of 90D low">
    <svg viewBox="0 0 24 24" fill="currentColor">
      <path xmlns="http://www.w3.org/2000/svg" d="M5.926 20.574a7.26 7.26 0 0 0 3.039 1.511c.107.035.179-.105.107-.175-2.395-2.285-1.079-4.758-.107-5.873.693-.796 1.68-2.107 1.608-3.865 0-.176.18-.317.322-.211 1.359.703 2.288 2.25 2.538 3.515.394-.386.537-.984.537-1.511 0-.176.214-.317.393-.176 1.287 1.16 3.503 5.097-.072 8.19-.071.071 0 .212.072.177a8.761 8.761 0 0 0 3.003-1.442c5.827-4.5 2.037-12.48-.43-15.116-.321-.317-.893-.106-.893.351-.036.95-.322 2.004-1.072 2.707-.572-2.39-2.478-5.105-5.195-6.441-.357-.176-.786.105-.75.492.07 3.27-2.063 5.352-3.922 8.059-1.645 2.425-2.717 6.89.822 9.808z" fill="currentColor"/>
    </svg>
  </span>`;

  dealsList.innerHTML = "";

  sorted.forEach(game => {
    const d        = dealsCache.get(game.id);
    const discount = d?.discount ?? 0;
    const low90    = d?.low90    ?? null;
    const firePP = low90 !== null && low90 <= DEEP_LOW_PCT ? FIRE_NEAR_PP_DEEP : FIRE_NEAR_PP;
    const isFire = d && low90 !== null && discount < 0 && discount <= low90 + firePP;

    // reviewIcon/reviewText are built internally from Steam's own fixed
    // review-sentiment vocabulary, not arbitrary external text — safe to
    // insert as markup, unlike game.title below.
    const reviewIcon = buildReviewIcon(d?.reviewDesc ?? null, d?.reviewCount ?? null);
    const reviewText = buildReviewText(d?.reviewDesc ?? null, d?.reviewCount ?? null);

    const row = document.createElement("div");
    row.className   = "deals__row";
    row.dataset.id  = game.id;

    const nameEl = document.createElement("span");
    nameEl.className   = "deals__col-title deals__name";
    nameEl.title       = game.title;
    nameEl.textContent = game.title;

    const reviewEl = document.createElement("span");
    reviewEl.className = "deals__col-review";
    reviewEl.innerHTML = `${reviewText}${reviewIcon}`;

    const priceEl = document.createElement("span");
    priceEl.className = "deals__col-price deals__price";
    if (isFire) {
      priceEl.innerHTML = fireSVG;
    } else {
      const placeholder = document.createElement("span");
      placeholder.className = "deals__fire-placeholder";
      priceEl.appendChild(placeholder);
    }
    priceEl.append(fmtPrice(d?.price));

    const discountEl = document.createElement("span");
    discountEl.className   = "deals__col-discount deals__discount" + (discount < 0 ? " deals__discount--off" : "");
    discountEl.textContent = fmtPct(discount !== 0 ? discount : 0);

    const lowEl = document.createElement("span");
    lowEl.className   = "deals__col-low deals__low";
    lowEl.textContent = low90 != null ? (low90 === 0 ? "0%" : "-" + Math.abs(low90) + "%") : "—";

    const removeCol = document.createElement("span");
    removeCol.className = "deals__col-remove";
    const removeBtn = document.createElement("button");
    removeBtn.className = "deals__remove";
    removeBtn.dataset.id = game.id;
    removeBtn.setAttribute("aria-label", `Remove ${game.title}`);
    removeBtn.innerHTML = `<svg style="transform:rotate(45deg)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    removeBtn.addEventListener("click", () => unpinGame(removeBtn.dataset.id));
    removeCol.appendChild(removeBtn);

    row.append(nameEl, reviewEl, priceEl, discountEl, lowEl, removeCol);
    dealsList.appendChild(row);
  });
}


export function initDeals() {
  if (!dealsList) return;
  initSearchUI();
  fetchDeals().then(renderDeals);
}
