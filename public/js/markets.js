// ═══════════════════════════════════════════════════════════════
//  MARKETS — ticker cards with uPlot sparklines
// ═══════════════════════════════════════════════════════════════
//
//  Price data comes from GET /api/:symbol, which proxies Yahoo Finance.
//
//  Expanded Charts and Ticker Count live in the Control Panel and are
//  bound by settings.js, so they keep working on pages that never load
//  this module. Markets just listens for SETTINGS_CHANGE and repaints.

import * as store           from "./store.js";
import { KEYS }             from "./store.js";
import { THEME_CHANGE }     from "./theme.js";
import { SETTINGS_CHANGE }  from "./settings.js";
import { TICKER_MAX }       from "./config.js";

const rangeButtons    = document.querySelectorAll(".stocks__range");
const stocksGrid      = document.getElementById("stocksGrid");
const DEFAULT_SYMBOLS  = ["AAPL", "NVDA", "QQQ", "BTC-USD", "GLD", "^DJI"];
const REFRESH_MS       = 60000;

let currentRange   = store.str(KEYS.stocksRange, "1mo");
let symbols        = store.json(KEYS.stocksSymbols, null) || DEFAULT_SYMBOLS;
let expandedCharts = store.bool(KEYS.expandedCharts, false);
let tickerCount    = store.int(KEYS.tickerCount, TICKER_MAX);
let refreshTimer   = null;
const chartInstances = new Map();

// ── Stocks widget card factory ──────────────────────────────────────────────────────
function createCard(symbol) {
  const card = document.createElement("div");
  card.className      = "stocks__card";
  card.dataset.symbol = symbol;
  card.innerHTML = `
    <div class="stocks__chart"></div>
    <div class="stocks__overlay">
      <div class="stocks__overlay-top">
        <span class="stocks__symbol">${symbol}</span>
        <button class="stocks__edit" aria-label="Edit symbol">
          <svg width="800px" height="800px" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
          <path d="M15.4998 5.50067L18.3282 8.3291M13 21H21M3 21.0004L3.04745 20.6683C3.21536 19.4929 3.29932 18.9052 3.49029 18.3565C3.65975 17.8697 3.89124 17.4067 4.17906 16.979C4.50341 16.497 4.92319 16.0772 5.76274 15.2377L17.4107 3.58969C18.1918 2.80865 19.4581 2.80864 20.2392 3.58969C21.0202 4.37074 21.0202 5.63707 20.2392 6.41812L8.37744 18.2798C7.61579 19.0415 7.23497 19.4223 6.8012 19.7252C6.41618 19.994 6.00093 20.2167 5.56398 20.3887C5.07171 20.5824 4.54375 20.6889 3.48793 20.902L3 21.0004Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>
      <div class="stocks__overlay-bottom">
        <span class="stocks__price">—</span>
        <span class="stocks__delta"></span>
      </div>
    </div>`;

  const editBtn = card.querySelector(".stocks__edit");

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Always query live — symbolEl is replaced on each edit
    const symbolEl = card.querySelector(".stocks__symbol");
    if (!symbolEl) return;
    const input    = document.createElement("input");
    input.type      = "text";
    input.value     = card.dataset.symbol;
    input.className = "stocks__symbol-input";
    input.maxLength = 10;
    symbolEl.replaceWith(input);
    editBtn.style.display = "none";
    input.focus();
    input.select();

    let committed = false;
    function commit() {
      if (committed) return;
      committed = true;
      const newSymbol = input.value.trim().toUpperCase();
      if (newSymbol && newSymbol !== card.dataset.symbol) {
        const idx = symbols.indexOf(card.dataset.symbol);
        if (idx !== -1) symbols[idx] = newSymbol;
        store.set(KEYS.stocksSymbols, symbols);
        card.dataset.symbol = newSymbol;
        card.querySelector(".stocks__price").textContent = "—";
        card.querySelector(".stocks__delta").textContent = "";
        fetchCard(card);
      }
      const span       = document.createElement("span");
      span.className   = "stocks__symbol";
      span.textContent = card.dataset.symbol;
      input.replaceWith(span);
      editBtn.style.display = "";
    }

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter")  commit();
      if (e.key === "Escape") {
        committed = true; // skip commit on blur
        const span       = document.createElement("span");
        span.className   = "stocks__symbol";
        span.textContent = card.dataset.symbol;
        input.replaceWith(span);
        editBtn.style.display = "";
      }
    });
    // Delay blur so edit button click can fire first before commit tears down the input
    input.addEventListener("blur", () => setTimeout(commit, 150));
  });

  return card;
}

// ── Render grid from symbols array ───────────────────────────────────
function renderGrid() {
  stocksGrid.classList.toggle("expanded-charts", expandedCharts);

  const targetSymbols = symbols.slice(0, tickerCount);

  // Remove cards that are no longer in the target list
  const existingCards = Array.from(stocksGrid.querySelectorAll(".stocks__card"));
  existingCards.forEach(card => {
    if (!targetSymbols.includes(card.dataset.symbol)) {
      if (chartInstances.has(card)) { chartInstances.get(card).destroy(); chartInstances.delete(card); }
      if (card._resizeObserver) card._resizeObserver.disconnect();
      card.remove();
    }
  });

  // Append any new symbols that don't have a card yet
  const existingSymbols = Array.from(stocksGrid.querySelectorAll(".stocks__card")).map(c => c.dataset.symbol);
  targetSymbols.forEach(sym => {
    if (!existingSymbols.includes(sym)) {
      stocksGrid.appendChild(createCard(sym));
    }
  });

  // Reorder cards to match targetSymbols order without destroying them
  targetSymbols.forEach(sym => {
    const card = stocksGrid.querySelector(`.stocks__card[data-symbol="${sym}"]`);
    if (card) stocksGrid.appendChild(card); // appendChild moves if already in DOM
  });
}

// ── Fetch and render a single card from cache if available ───────────────────────────────────
async function fetchCard(card) {
  const symbol         = card.dataset.symbol;
  const chartContainer = card.querySelector(".stocks__chart");
  const priceEl        = card.querySelector(".stocks__price");
  const deltaEl        = card.querySelector(".stocks__delta");

  // ── Paint from cache immediately if available ─────────────────
  const key = `${symbol}:${currentRange}`;
  if (dataCache.has(key)) {
    renderCardData(card, dataCache.get(key), chartContainer, priceEl, deltaEl);
  }

  try {
    const data = await fetchSymbol(symbol);   // fetchSymbol now also writes to cache
    renderCardData(card, data, chartContainer, priceEl, deltaEl);
  } catch (err) {
    console.error("Error fetching", symbol, err);
  }
}

function renderCardData(card, data, chartContainer, priceEl, deltaEl) {
  const closes = data[1];
  if (!closes || !closes.length) return;

  const latest = closes[closes.length - 1];
  const first  = closes[0];
  const delta  = ((latest - first) / first) * 100;
  const sign   = delta >= 0 ? "+" : "";

  priceEl.textContent  = `${latest.toFixed(2)}`;
  deltaEl.textContent  = `${sign}${delta.toFixed(2)}%`;
  deltaEl.dataset.sign = delta >= 0 ? "up" : "down";

  if (chartInstances.has(card)) {
    chartInstances.get(card).destroy();
    chartInstances.delete(card);
  }
  if (card._resizeObserver) card._resizeObserver.disconnect();

  chartContainer.innerHTML = "";
  const uplot = createChart(chartContainer, data);
  chartInstances.set(card, uplot);

  card._resizeObserver = new ResizeObserver(entries => {
    const w = entries[0].contentRect.width;
    if (w > 0) uplot.setSize({ width: w, height: expandedCharts ? 180 : 100 });
  });
  card._resizeObserver.observe(card);
}

// ── In-memory data cache: key = "SYMBOL:range" ───────────────────
const dataCache = new Map();

async function fetchSymbol(symbol) {
  const key      = `${symbol}:${currentRange}`;
  const response = await fetch(`/api/${symbol}?range=${currentRange}`);
  const json     = await response.json();

  const result    = json.chart.result[0];
  const rawTs     = result.timestamp;
  const rawCloses = result.indicators.quote[0].close;

  const timestamps = [];
  const closes     = [];
  for (let i = 0; i < rawTs.length; i++) {
    const close = rawCloses[i];
    if (close != null && !isNaN(close)) {
      timestamps.push(rawTs[i]);
      closes.push(close);
    }
  }

  const data = [timestamps, closes];
  dataCache.set(key, data);   // store after every successful fetch
  return data;
}


async function fetchStocks() {
  const cards = stocksGrid.querySelectorAll(".stocks__card");
  for (const card of cards) await fetchCard(card);
}

// ── Chart factory ────────────────────────────────────────────────
// Reads expandedCharts and currentRange from module scope.
function createChart(container, data) {
  const style         = getComputedStyle(document.body);
  const accentColor   = style.getPropertyValue('--accent').trim();
  const borderColor   = style.getPropertyValue('--border-color').trim();
  const textColor     = style.getPropertyValue('--text-secondary').trim();
  const axisLineColor = 'oklch(1 0 0 / 0.15)';
  const MONTHS        = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const axisDefaults = {
    stroke: textColor,
    ticks:  { stroke: borderColor, width: 1, size: 4 },
    grid:   { stroke: borderColor, width: 1 },
    border: { stroke: axisLineColor, width: 1 },
    font:   '11px Geist, sans-serif',
  };

  function makeGradient(u) {
    const ctx  = u.ctx;
    const b    = u.bbox;
    const grad = ctx.createLinearGradient(0, b.top, 0, b.top + b.height);
    const withAlpha = (a) => accentColor.replace(/\)$/, ` / ${a})`);
    grad.addColorStop(0, withAlpha(expandedCharts ? 0.35 : 0.70));
    grad.addColorStop(1, withAlpha(0));
    return grad;
  }

  // Build x-axis splits: month boundaries for 6M/1Y, day boundaries for 1M, raw for 1D
  function xSplits(u) {
    const min = u.scales.x.min, max = u.scales.x.max;

    if (currentRange === '6mo' || currentRange === '1y') {
      // Snap to 1st of each month
      const ticks = [];
      const start = new Date(min * 1000);
      let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      while (d.getTime() / 1000 < max) {
        const t = d.getTime() / 1000;
        if (t > min) ticks.push(t);
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      }
      // For 1Y, keep only every other month
      return currentRange === '1y' ? ticks.filter((_, i) => i % 2 === 0) : ticks;
    }

    // 1M / 1D: evenly spaced
    const step = (max - min) / 5;
    const snapSec = currentRange === '1mo' ? 86400 : 1;
    const seen = new Set(), ticks = [];
    for (let i = 1; i <= 4; i++) {
      const raw     = min + step * i;
      const snapped = snapSec > 1 ? Math.floor(raw / snapSec) * snapSec : Math.round(raw);
      const clamped = Math.min(Math.max(snapped, min + snapSec), max - snapSec);
      if (!seen.has(clamped)) { seen.add(clamped); ticks.push(clamped); }
    }
    return ticks;
  }

  function xValues(u, vals) {
    return vals.map(v => {
      if (v == null) return '';
      const d = new Date(v * 1000);
      if (currentRange === '1d') {
        return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      }
      if (currentRange === '6mo' || currentRange === '1y') {
        return MONTHS[d.getUTCMonth()];
      }
      // 1M: "12 Feb"
      return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
    });
  }

  const axes = expandedCharts ? [
    { ...axisDefaults, splits: xSplits, values: xValues, size: 28 },
    {
      ...axisDefaults,
      side:   1,
      size: 35,
      values: (u, vals) => vals.map(v => v == null ? '' : `${v.toFixed(0)}`),
      splits: (u) => {
        const lo = u.scales.y.min, hi = u.scales.y.max;
        const range = hi - lo;
        const padTop    = range * 0.12;
        const padBottom = range * 0;
        const insetLo = lo + padBottom;
        const insetHi = hi - padTop;
        const step = (insetHi - insetLo) / 3;
        return [insetLo, insetLo + step, insetLo + step * 2, insetHi];
      },
    },
  ] : [{ show: false }, { show: false }];

  const CHART_H = expandedCharts ? 180 : 100;

  const options = {
    width:   container.clientWidth,
    height:  CHART_H,
    padding: expandedCharts ? [0, 0, 0, 0] : [0, 0, 0, 0],
    scales:  { x: { time: true } },
    axes,
    series: [
      {},
      {
        stroke: accentColor,
        width:  1.5,
        points: { show: false },
        fill:   makeGradient,
      },
    ],
    legend: { show: false },
  };

  return new uPlot(options, data, container);
}

// ── Range selector ───────────────────────────────────────────────
function initRangeButtons() {
  rangeButtons.forEach(btn => {
    btn.classList.toggle("active", btn.dataset.range === currentRange);
    btn.addEventListener("click", () => {
      rangeButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      currentRange = btn.dataset.range;
      store.set(KEYS.stocksRange, currentRange);
      fetchStocks();
    });
  });
}

// Auto-refresh every 60s, no toggle needed
function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchStocks, REFRESH_MS);
}

export function initMarkets() {
  if (!stocksGrid) return;

  initRangeButtons();

  // The Control Panel owns these two controls; re-read and repaint when
  // it says they changed.
  document.addEventListener(SETTINGS_CHANGE, (e) => {
    const key = e.detail?.key;
    if (key !== KEYS.expandedCharts && key !== KEYS.tickerCount) return;
    expandedCharts = store.bool(KEYS.expandedCharts, false);
    tickerCount    = store.int(KEYS.tickerCount, TICKER_MAX);
    renderGrid();
    fetchStocks();
  });

  // uPlot rasterizes the accent colour into a canvas, so a CSS-only
  // theme swap leaves stale lines behind. Redraw on theme change.
  document.addEventListener(THEME_CHANGE, () => fetchStocks());

  renderGrid();
  fetchStocks();
  startAutoRefresh();
}
