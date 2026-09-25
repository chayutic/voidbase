// ═══════════════════════════════════════════════════════════════
//  MARKETS — ticker cards with uPlot sparklines
// ═══════════════════════════════════════════════════════════════
//
//  Price data comes from GET /api/:symbol, which proxies Yahoo Finance.

import * as store           from "./store.js";
import { KEYS }             from "./store.js";
import { THEME_CHANGE }     from "./theme.js";
import { SETTINGS_CHANGE }  from "./settings.js";
import { readTickerCount }  from "./config.js";
import { EDIT }             from "./icons.js";
import { beginInlineEdit }  from "./inline-edit.js";

const rangeButtons    = document.querySelectorAll(".stocks__range");
const expandToggleBtn = document.getElementById("chartsExpandToggle");
const stocksGrid      = document.getElementById("stocksGrid");

// Material "fullscreen" / "fullscreen_exit". The button shows the icon for
// the current state — collapse glyph while expanded, expand glyph while not.
const EXPAND_ICON   = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
const COLLAPSE_ICON  = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
const DEFAULT_SYMBOLS  = ["AAPL", "NVDA", "QQQ", "BTC-USD", "GLD", "^DJI"];
const REFRESH_MS       = 60000;

let currentRange   = store.str(KEYS.stocksRange, "1mo");
let symbols        = store.json(KEYS.stocksSymbols, null) || DEFAULT_SYMBOLS;
let expandedCharts = store.bool(KEYS.expandedCharts, false);
let tickerCount    = readTickerCount();
let refreshTimer   = null;
const chartInstances = new Map();

// ── Chart teardown ─────────────────────────────────────────────
//  A card owns a uPlot instance and a ResizeObserver watching it; both
//  outlive the element unless released together.

function teardownChart(card) {
  const chart = chartInstances.get(card);
  if (chart) {
    chart.destroy();
    chartInstances.delete(card);
  }
  if (card._resizeObserver) card._resizeObserver.disconnect();
}

function teardownAllCharts() {
  for (const card of stocksGrid.querySelectorAll(".stocks__card")) teardownChart(card);
}

// ── Chart height, read back from CSS ───────────────────────────

function chartHeight() {
  const token = expandedCharts ? "--chart-h-lg" : "--chart-h";
  return parseFloat(getComputedStyle(document.body).getPropertyValue(token));
}

// ── Stocks widget card factory ─────────────────────────────────
function createCard(symbol) {
  const card = document.createElement("div");
  card.className      = "stocks__card";
  card.dataset.symbol = symbol;
  card.innerHTML = `
    <div class="stocks__chart"></div>
    <div class="stocks__overlay">
      <div class="stocks__overlay-top">
        <span class="stocks__symbol"></span>
        <button class="stocks__edit" aria-label="Edit symbol">${EDIT}</button>
      </div>
      <div class="stocks__overlay-bottom">
        <span class="stocks__price">—</span>
        <span class="stocks__delta"></span>
      </div>
    </div>`;

  // Symbol comes from persisted localStorage state (or DEFAULT_SYMBOLS),
  // never trust it as markup — set via textContent, not the template above.
  card.querySelector(".stocks__symbol").textContent = symbol;

  const editBtn = card.querySelector(".stocks__edit");

  editBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    // Always query live — symbolEl is replaced on each edit
    const symbolEl = card.querySelector(".stocks__symbol");
    if (!symbolEl) return;

    beginInlineEdit({
      target:    symbolEl,
      value:     card.dataset.symbol,
      className: "stocks__symbol-input",
      maxLength: 10,
      hideWhileEditing: editBtn,
      transform: (v) => v.trim().toUpperCase(),
      onCommit: (newSymbol) => {
        const idx = symbols.indexOf(card.dataset.symbol);
        if (idx !== -1) symbols[idx] = newSymbol;
        store.set(KEYS.stocksSymbols, symbols);
        card.dataset.symbol = newSymbol;
        card.querySelector(".stocks__price").textContent = "—";
        card.querySelector(".stocks__delta").textContent = "";
        fetchCard(card);
      },
      restore: (input) => {
        const span       = document.createElement("span");
        span.className   = "stocks__symbol";
        span.textContent = card.dataset.symbol;
        input.replaceWith(span);
      },
    });
  });

  return card;
}

// ── Render grid from symbols array ─────────────────────────────
// Diffs against the cards already in the DOM rather than rebuilding the
// grid: a rebuild destroys every uPlot instance and the charts flash.
// Symbols come from localStorage and hold whatever the edit field
// accepted, so cards are matched as data rather than interpolated into
// a selector — one quote in a symbol would throw and take the grid down.
function renderGrid() {
  stocksGrid.classList.toggle("expanded-charts", expandedCharts);

  const targetSymbols = symbols.slice(0, tickerCount);

  const surviving = new Map();
  for (const card of stocksGrid.querySelectorAll(".stocks__card")) {
    if (targetSymbols.includes(card.dataset.symbol)) {
      surviving.set(card.dataset.symbol, card);
    } else {
      teardownChart(card);
      card.remove();
    }
  }

  // appendChild moves a card that is already in the DOM, so this one
  // pass both adds the missing cards and puts them all in target order.
  targetSymbols.forEach(sym => {
    stocksGrid.appendChild(surviving.get(sym) ?? createCard(sym));
  });
}

// ── Fetch and render a single card from cache if available ─────
async function fetchCard(card) {
  const symbol         = card.dataset.symbol;
  const chartContainer = card.querySelector(".stocks__chart");
  const priceEl        = card.querySelector(".stocks__price");
  const deltaEl        = card.querySelector(".stocks__delta");

  const key = `${symbol}:${currentRange}`;
  if (dataCache.has(key)) {
    renderCardData(card, dataCache.get(key), chartContainer, priceEl, deltaEl);
  }

  try {
    const data = await fetchSymbol(symbol);   // fetchSymbol also writes to cache
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

  const existing = chartInstances.get(card);
  if (existing) {
    existing.setData(data);
    return;
  }

  chartContainer.innerHTML = "";
  const uplot = createChart(chartContainer, data);
  chartInstances.set(card, uplot);

  card._resizeObserver = new ResizeObserver(entries => {
    const w = entries[0].contentRect.width;
    if (w > 0) uplot.setSize({ width: w, height: chartHeight() });
  });
  card._resizeObserver.observe(card);
}

// ── In-memory data cache: key = "SYMBOL:range" ─────────────────
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
  dataCache.set(key, data);
  return data;
}


function fetchStocks() {
  const cards = [...stocksGrid.querySelectorAll(".stocks__card")];
  return Promise.all(cards.map(fetchCard));
}

// ── Chart factory ──────────────────────────────────────────────
function createChart(container, data) {
  const style         = getComputedStyle(document.body);
  const accentColor   = style.getPropertyValue('--accent').trim();
  const borderColor   = style.getPropertyValue('--border-color').trim();
  const textColor     = style.getPropertyValue('--text-secondary').trim();
  const axisLineColor = style.getPropertyValue('--axis-line-color').trim();
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
      const ticks = [];
      const start = new Date(min * 1000);
      let d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
      while (d.getTime() / 1000 < max) {
        const t = d.getTime() / 1000;
        if (t > min) ticks.push(t);
        d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
      }
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

  const CHART_H = chartHeight();

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

// ── Expand toggle ──────────────────────────────────────────────
//  Same preference as the Control Panel's Expanded Charts checkbox — this
//  button just gives it a one-click home next to the range it affects.
function paintExpandToggle() {
  if (!expandToggleBtn) return;
  expandToggleBtn.innerHTML = expandedCharts ? COLLAPSE_ICON : EXPAND_ICON;
  const label = expandedCharts ? "Collapse charts" : "Expand charts";
  expandToggleBtn.setAttribute("aria-label", label);
  expandToggleBtn.title = label;
}

function initExpandToggle() {
  if (!expandToggleBtn) return;
  paintExpandToggle();
  expandToggleBtn.addEventListener("click", () => {
    store.set(KEYS.expandedCharts, !expandedCharts);
    document.dispatchEvent(new CustomEvent(SETTINGS_CHANGE, { detail: { key: KEYS.expandedCharts } }));
  });
}

// ── Range selector ─────────────────────────────────────────────
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

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(fetchStocks, REFRESH_MS);
}

export function initMarkets() {
  if (!stocksGrid) return;

  initRangeButtons();
  initExpandToggle();

  document.addEventListener(SETTINGS_CHANGE, (e) => {
    const key = e.detail?.key;
    if (key !== KEYS.expandedCharts && key !== KEYS.tickerCount) return;
    expandedCharts = store.bool(KEYS.expandedCharts, false);
    tickerCount    = readTickerCount();
    paintExpandToggle();
    renderGrid();
    // Expanded Charts changes chartHeight(), which is read once at
    // construction; surviving cards have to rebuild, not refresh.
    teardownAllCharts();
    fetchStocks();
  });

  // uPlot rasterizes the accent colour into a canvas, so a CSS-only
  // theme swap leaves stale lines behind. Rebuild, don't refresh.
  document.addEventListener(THEME_CHANGE, () => {
    teardownAllCharts();
    fetchStocks();
  });

  renderGrid();
  fetchStocks();
  startAutoRefresh();
}
