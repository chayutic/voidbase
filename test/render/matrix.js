// ═══════════════════════════════════════════════════════════════
//  RENDER MATRIX — painted-pixel regression detection
// ═══════════════════════════════════════════════════════════════
//
//  Why this exists, and why it measures pixels rather than the DOM:
//
//  getComputedStyle reports the *unvisited* colour for :visited, always.
//  That is deliberate anti-history-sniffing behaviour in every browser.
//  It once reported L 0.71 for the notes glyph while the pixel on screen
//  was genuinely 0.97, which sent a debugging session after the wrong
//  cause. Nothing here trusts computed style for a colour. Every value
//  in the baseline is decoded back out of a screenshot.
//
//  Related: a fresh browser profile cannot reproduce a :visited bug at
//  all, because it never populates the visited-links table. So this
//  harness does not try. It tests the *mechanism* with :link — the exact
//  structural twin of :visited: same (0,1,1) specificity, same
//  declaration, and the two match mutually exclusively. See linkCanary().
//
//  Determinism rules, all of which exist because a violation of one of
//  them makes the baseline drift for reasons unrelated to CSS:
//
//    - Every upstream route is fulfilled from test/render/fixtures.
//      Real prices, a real Jellyfin library and real notes all change
//      between runs; worse, a plain static server 404s them and would
//      baseline the dashboard's *error* states instead of its real ones.
//    - Fonts and uPlot are self-hosted under public/, so the static host
//      below serves them like any other asset and nothing reaches the
//      network. This used to be done by intercepting fonts.googleapis.com
//      and unpkg instead, which looked equivalent and was not: Chrome
//      fetched two of the eleven woff2 files and no Geist face at all, so
//      every baseline was recorded in a fallback typeface. Font-swap
//      timing moves every text pixel in the capture, so verify with
//      document.fonts.check(), not by reading the stylesheet.
//    - Every painting-relevant localStorage key is written explicitly,
//      before the page's inline anti-flash script runs, so the baseline
//      records an intended state rather than whatever a fresh profile
//      happened to produce.
//
//  Usage:
//    node test/render/matrix.js             check against baseline
//    node test/render/matrix.js --update    rewrite the baseline
//    node test/render/matrix.js --only=<substring>

const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const HERE = __dirname;
const PUBLIC = path.resolve(HERE, "../../public");
const FIXTURES = path.join(HERE, "fixtures");
const BASELINE = path.join(HERE, "baseline.json");
const PORT = 3996;
const CDP_PORT = 9336;

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7);

// ── Static host ────────────────────────────────────────────────
// Serves public/ only. Everything else is intercepted before it gets here.

const MIME = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p === "/") p = "/index.html";
  if (p === "/notes") p = "/notes.html";
  const f = path.join(PUBLIC, p);
  fs.readFile(f, (e, buf) => {
    if (e) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(f)] || "application/octet-stream",
    });
    res.end(buf);
  });
});

// ── CDP plumbing ───────────────────────────────────────────────

let msgId = 0;
function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const pending = new Map();
    const handlers = new Map();
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && pending.has(m.id)) {
        const { res, rej } = pending.get(m.id);
        pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      } else if (m.method && handlers.has(m.method)) {
        handlers.get(m.method)(m.params);
      }
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send: (method, params = {}) =>
          new Promise((res, rej) => {
            const id = ++msgId;
            pending.set(id, { res, rej });
            ws.send(JSON.stringify({ id, method, params }));
          }),
        on: (method, fn) => handlers.set(method, fn),
      });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Colour ─────────────────────────────────────────────────────

function srgbToLinear(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function oklabL(r, g, b) {
  const R = srgbToLinear(r),
    G = srgbToLinear(g),
    B = srgbToLinear(b);
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);
  return 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
}

// ── Request interception ───────────────────────────────────────
// Maps an intercepted URL to a file on disk, or null to let it through.
// Fixtures are matched by route shape, so adding a symbol or a note means
// adding a fixture file, not editing this function.

function fixtureFor(url) {
  const u = new URL(url);
  const p = u.pathname;

  const json = (n) => ({ file: path.join(FIXTURES, n), type: "application/json" });

  if (p === "/air/current") return json("air_current.json");
  if (p === "/itad/prices") return json("itad_prices.json");
  if (p.startsWith("/steam/price/"))
    return json(`steam_price_${p.split("/").pop()}.json`);
  if (p === "/jellyfin/recent") return json("jellyfin_recent.json");
  if (p.startsWith("/jellyfin/poster/"))
    return json(`jellyfin_poster_${p.split("/").pop()}.json`);
  if (p.startsWith("/jellyfin/image/"))
    return {
      file: path.join(FIXTURES, `poster_${p.split("/").pop()}.png`),
      type: "image/png",
    };
  if (p === "/itad/search") return json("itad_search.json");
  if (p === "/notes/api/list") return json("notes_list.json");
  if (p === "/notes/api/search") return json("notes_search.json");
  if (p.startsWith("/notes/api/note/"))
    return json(`notes_note_${p.split("/").pop()}.json`);
  if (p.startsWith("/api/")) {
    const sym = decodeURIComponent(p.slice(5)).replace(/[^\w-]/g, "_");
    const range = u.searchParams.get("range") || "1mo";
    return json(`api_${sym}_${range}.json`);
  }
  return null;
}

async function installInterception(cdp) {
  await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  cdp.on("Fetch.requestPaused", async (ev) => {
    const hit = fixtureFor(ev.request.url);
    if (!hit) {
      await cdp.send("Fetch.continueRequest", { requestId: ev.requestId });
      return;
    }
    let body;
    try {
      body = fs.readFileSync(hit.file);
    } catch {
      // A missing fixture must fail loudly. Silently 404ing would bake an
      // error state into the baseline and look like a passing run.
      console.error(`  MISSING FIXTURE  ${ev.request.url} -> ${hit.file}`);
      await cdp.send("Fetch.fulfillRequest", {
        requestId: ev.requestId,
        responseCode: 500,
        body: Buffer.from("missing fixture").toString("base64"),
      });
      missingFixtures.add(path.basename(hit.file));
      return;
    }
    await cdp.send("Fetch.fulfillRequest", {
      requestId: ev.requestId,
      responseCode: 200,
      responseHeaders: [
        { name: "Content-Type", value: hit.type },
        { name: "Access-Control-Allow-Origin", value: "*" },
        { name: "Cache-Control", value: "no-store" },
      ],
      body: body.toString("base64"),
    });
  });
}
const missingFixtures = new Set();

// ── Seeded state ───────────────────────────────────────────────
// Every key in store.js's KEYS registry that can move a pixel. Pinned
// explicitly: a fresh profile would give defaults, but by accident rather
// than intent, and a future default change would silently rewrite the
// baseline instead of failing it.

function seedScript(theme, guest) {
  const pinned = require(path.join(FIXTURES, "deals_pinned.json"));
  const state = {
    theme,
    guestMode: String(guest),
    statusInfo: "true",
    sectionLayout: "",
    stocksRange: "1mo",
    stocksSymbols: JSON.stringify(["AAPL", "NVDA", "QQQ", "BTC-USD", "GLD", "^DJI"]),
    expandedCharts: "false",
    tickerCount: "6",
    pinnedGames: JSON.stringify(pinned),
    force90d: "false",
    notesSidebarCollapsed: "false",
    turboEnabled: "false",
    turboNewTab: "false",
    turboUdm: "",
    turboPresets: "[]",
    turboActivePreset: "",
  };
  // sectionLayout empty means "never customised" — let customizer.js take
  // its import-time DEFAULT_LAYOUT snapshot rather than pinning an order
  // that would go stale the moment a section is added.
  delete state.sectionLayout;
  return `
    try {
      localStorage.clear();
      const s = ${JSON.stringify(state)};
      for (const k in s) localStorage.setItem(k, s[k]);
    } catch (e) {}

    // Freeze the clock. The header renders the current time and the notes
    // sidebar renders relative timestamps, so a live Date makes the
    // baseline drift by the minute. Only the zero-argument forms are
    // pinned — format.js builds real Dates from note ids and mtimes, and
    // those have to keep working.
    (() => {
      const FIXED = ${FIXED_NOW};
      const Real = Date;
      const D = function (...a) {
        return a.length ? new Real(...a) : new Real(FIXED);
      };
      D.prototype = Real.prototype;
      D.now = () => FIXED;
      D.parse = Real.parse;
      D.UTC = Real.UTC;
      globalThis.Date = D;
    })();
  `;
}

// 2026-09-05T12:34:56+07:00 — arbitrary, but fixed forever. Chosen after
// the newest fixture mtime so relative timestamps render in the past.
const FIXED_NOW = 1788586496000;

// ── Probes ─────────────────────────────────────────────────────

const PROBES = {
  index: [
    ".header",
    ".search__input-row",
    ".dock",
    ".deals-section",
    ".arrivals-section",
    ".markets",
    '[data-section-id="media-automation"]',
    ".utilities__grid",
    ".deals__row .deals__col-review",
    ".nav-trigger",
    ".settings-trigger",
    ".footer",
  ],
  notes: [
    ".notes__header",
    ".notes__sidebar",
    ".notes__list",
    ".notes__pane",
    ".notes__statusbar",
    ".nav-trigger",
  ],
};

// Hover targets, sampled rather than exhaustive: one representative per
// component family that has a :hover rule.
const HOVER = {
  index: [
    ".dock__item",
    ".search__input-row",
    ".card",
    ".arrivals__card",
    ".stocks__card",
    // .deals__remove is opacity:0 until its row is hovered, and it draws
    // the shared CLOSE icon — one of three components that icons.js now
    // feeds. Without this, an edit there is visible to no probe at all.
    ".deals__row",
    ".footer__top",
    ".settings-trigger",
    ".nav-trigger",
  ],
  notes: [".notes__row", ".notes__new-row", ".notes__collapse", ".nav-trigger"],
};

// Focus sweep. By design only text inputs have a focus treatment of
// their own; every other control shows Chrome's default ring (PRODUCT.md,
// and `focus-ring` in lint:conventions since v0.7.19). Where `paints` is
// true on a non-input, that is the UA ring; false would mean a control
// that shows nothing when tabbed to.
const FOCUS = {
  index: [".search__input", ".card", ".settings-trigger", ".nav-trigger"],
  notes: [".notes__search", ".notes__row", ".nav-trigger"],
};

// Closed, collapsed or empty at rest — invisible to every probe above.
// [label, open, close, targets, hover?]. Toggling the same classes the
// app's own JS toggles, so what gets measured is the real painted state
// and not a forced approximation of one. `open` and `close` are awaited,
// so anything that has to wait for its own effect — a debounce, a fetch,
// a chart rebuild — polls for it rather than trusting settleFrames to be
// long enough. `hover` is forced for the duration of the probes, for
// controls that live inside a revealed component and are themselves
// opacity: 0 until their row is hovered.
const REVEALED = {
  index: [
    ["panel",
     `document.getElementById("settingsPanel")?.classList.add("open")`,
     `document.getElementById("settingsPanel")?.classList.remove("open")`,
     [".settings-panel", ".settings-panel__header", ".settings__section-label",
      ".settings__open-btn", ".settings__version"]],
    // Clicked rather than class-toggled, unlike the others: the overlay's
    // .open class only reveals it, and customizerList is populated by
    // openCustomizer(). Toggling the class alone left .customizer__label
    // MISSING — an empty panel that probed clean.
    ["customizer",
     `document.getElementById("customizerOpen")?.click()`,
     `document.getElementById("customizerCancel")?.click()`,
     [".customizer", ".customizer__title", ".customizer__label",
      ".customizer__reset", ".customizer__save"]],
    // The tooltip's text is set from the dock item's aria-label by dock.js
    // on hover; an empty div has no box, so measure() would refuse it.
    ["dock-tooltip",
     `{const t=document.getElementById("dockTooltip");
       if(t){t.textContent=document.querySelector(".dock__item")?.getAttribute("aria-label")??"NOTES";
       t.classList.add("dock__tooltip--visible");}}`,
     `{const t=document.getElementById("dockTooltip");
       if(t){t.classList.remove("dock__tooltip--visible");t.textContent="";}}`,
     [".dock__tooltip"]],
    // Grows the page, so it closes again like everything else here. The
    // add-row carries the only .deals__search-btn / .deals__cancel-btn
    // pair reachable without running a search — the class names outlived
    // the section they were named for.
    ["turbo",
     `{document.getElementById("searchTurbo")?.classList.add("visible");
       document.getElementById("turboAddRow")?.classList.add("visible");}`,
     `{document.getElementById("searchTurbo")?.classList.remove("visible");
       document.getElementById("turboAddRow")?.classList.remove("visible");}`,
     [".search__turbo", ".search__turbo-label", ".search__turbo-empty",
      ".deals__search-btn", ".deals__cancel-btn"]],
    // A saved preset, added and removed through the app's own handlers.
    // Seeding turboPresets instead would cost the empty state above,
    // which is the one the panel shows by default. The row's edit and
    // remove controls are opacity: 0 until the item is hovered — the
    // remove one draws the shared close cross, so an icons.js edit lands
    // here as well as in the two places .deals__row already covers.
    ["turbo-preset",
     `(async () => {
        document.getElementById("searchTurbo")?.classList.add("visible");
        document.getElementById("turboPresetsAdd")?.click();
        const input = document.getElementById("turboPresetInput");
        if (input) input.value = "site:reddit.com";
        document.getElementById("turboPresetSave")?.click();
        for (let i = 0; i < 120; i++) {
          if (document.querySelector(".search__preset-item")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     `(async () => {
        document.querySelector(".search__preset-remove")?.click();
        document.getElementById("searchTurbo")?.classList.remove("visible");
        document.getElementById("turboAddRow")?.classList.remove("visible");
        for (let i = 0; i < 120; i++) {
          if (!document.querySelector(".search__preset-item")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     [".search__preset-item", ".search__preset-radio", ".search__preset-label",
      ".search__preset-edit", ".search__preset-remove"],
     ".search__preset-item"],
    // Expanded Charts is off by default and no config turns it on, so
    // --chart-h-lg had never been read. Clicked rather than written to
    // localStorage: the toggle is what dispatches SETTINGS_CHANGE, and
    // Markets repainting is half of what this measures. The poll waits
    // for the 180px branch to actually be in the layout.
    ["expanded-charts",
     `(async () => {
        document.getElementById("expandedChartsToggle")?.click();
        for (let i = 0; i < 240; i++) {
          const c = document.querySelector(".stocks__chart");
          if (c && Math.round(c.getBoundingClientRect().height) === 180) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     `(async () => {
        document.getElementById("expandedChartsToggle")?.click();
        for (let i = 0; i < 240; i++) {
          const c = document.querySelector(".stocks__chart");
          if (c && Math.round(c.getBoundingClientRect().height) === 100) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     [".stocks__grid", ".stocks__card", ".stocks__chart"]],
    // The deals search row and its results. Probed by id, deliberately:
    // .deals__search-btn and .deals__cancel-btn each match twice in this
    // document — the Turbo preset row carries the same two class names
    // and comes first, so every querySelector for them has been landing
    // on the preset row, never on the section they are named for.
    ["deals-search",
     `(async () => {
        document.getElementById("dealsAdd")?.click();
        const input = document.getElementById("dealsSearchInput");
        if (input) input.value = "hollow";
        document.getElementById("dealsSearchBtn")?.click();
        for (let i = 0; i < 240; i++) {
          if (document.querySelector(".deals__result-item[data-id]")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     `(async () => {
        document.getElementById("dealsCancelBtn")?.click();
        for (let i = 0; i < 120; i++) {
          if (!document.querySelector(".deals__result-item")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     [".deals__add-row", "#dealsSearchBtn", "#dealsCancelBtn",
      ".deals__search-results", ".deals__result-item"]],
  ],
  notes: [
    // The search-hit <mark> paints only while a query has results, so
    // its radius went in reasoned rather than measured in v0.7.9.
    ["search",
     `(async () => {
        const s = document.getElementById("notesSearch");
        if (!s) return;
        s.value = "server";
        s.dispatchEvent(new Event("input", { bubbles: true }));
        for (let i = 0; i < 240; i++) {
          if (document.querySelector(".notes__list mark")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     `(async () => {
        const s = document.getElementById("notesSearch");
        if (!s) return;
        s.value = "";
        s.dispatchEvent(new Event("input", { bubbles: true }));
        for (let i = 0; i < 240; i++) {
          if (!document.querySelector(".notes__list mark")) return;
          await new Promise(r => requestAnimationFrame(r));
        }
      })()`,
     [".notes__list", ".notes__row", ".notes__list mark"]],
  ],
};

// Finish transitions, then wait for two consecutive frames to agree.
// Same contract as the utilities block's poll: sleeping longer and hoping
// is what produced 82, 86 and 88 CSS px across three identical runs.
async function settleFrames(cdp) {
  await cdp.send("Runtime.evaluate", {
    expression: `(()=>{for(const a of document.getAnimations()){
      try{a.finish();}catch(e){}}})()`,
  });
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      await ensureFonts();
      const frame = () => new Promise(r => requestAnimationFrame(r));
      let prev = null;
      for (let i = 0; i < 120; i++) {
        await frame();
        const now = document.documentElement.scrollHeight + "x" +
          [...document.querySelectorAll("[id]")].length;
        if (now === prev) return;
        prev = now;
      }
    })()`,
    awaitPromise: true,
  });
}

// ── Measurement ────────────────────────────────────────────────
// One clipped screenshot per element. Clipping to the element's own box
// means a layout shift somewhere else on the page cannot smear across
// every region's digest, and it reaches elements below the fold without
// scrolling. captureBeyondViewport does the rest.
//
// A zero-sized box is not the only way to be invisible, and the two ways
// that are missed both leave the layout box intact — so the clip lands on
// the page background and the probe reports a confident measurement of
// something else. `.utilities__content` is the live case: `max-height: 0;
// overflow: hidden; opacity: 0` at rest, with full-sized children inside
// it. Every `.utilities__card` entry in the baseline read peak L 0.1354,
// the backdrop, against the card's real 0.709.
//
// So an element counts as hidden here if it fails checkVisibility —
// display, visibility, or zero effective opacity anywhere up the tree —
// or if an overflow-clipping ancestor leaves nothing of its rect. The
// capture geometry is deliberately left alone: a partially clipped
// element still hashes over its whole box, so this cannot shift a probe
// that was already looking at its target.

async function measure(cdp, selector, dpr) {
  const boxRes = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify((()=>{const el=document.querySelector(${JSON.stringify(
      selector
    )});if(!el)return null;
      if(!el.checkVisibility({opacityProperty:true,visibilityProperty:true,
        contentVisibilityAuto:true}))return {empty:true};
      const r=el.getBoundingClientRect();
      if(!r.width||!r.height)return {empty:true};
      let t=r.top,l=r.left,rt=r.right,b=r.bottom;
      for(let a=el.parentElement;a;a=a.parentElement){
        const cs=getComputedStyle(a);
        if(cs.overflowX==="visible"&&cs.overflowY==="visible")continue;
        const ar=a.getBoundingClientRect();
        if(cs.overflowX!=="visible"){l=Math.max(l,ar.left);rt=Math.min(rt,ar.right);}
        if(cs.overflowY!=="visible"){t=Math.max(t,ar.top);b=Math.min(b,ar.bottom);}
        if(rt<=l||b<=t)return {empty:true};
      }
      const x=r.x+scrollX, y=r.y+scrollY;
      // captureBeyondViewport composites the page into a surface the size
      // of the document, and scrollHeight is an integer: a box whose
      // bottom sits at 1302.296875 in a document that reports 1302 gets a
      // final scanline that was never painted, and an unpainted pixel
      // reads pure white — a lightness this palette does not contain.
      // Whether it happens is decided by which way the fraction rounds,
      // which is why the guest footer had it permanently and the w640
      // footer had it one run in six.
      return {x, y,
              w:Math.min(r.width,  document.documentElement.scrollWidth  - x),
              h:Math.min(r.height, document.documentElement.scrollHeight - y)};})())`,
    returnByValue: true,
  });
  const box = JSON.parse(boxRes.result.value);
  if (!box) return { missing: true };
  if (box.empty) return { hidden: true };

  const shot = await cdp.send("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
    clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: dpr },
  });

  // Decode in-page and reduce there: shipping raw pixels back over CDP
  // would be megabytes per probe.
  const st = await cdp.send("Runtime.evaluate", {
    expression: `(async()=>{
      const img=new Image();img.src="data:image/png;base64,${shot.data}";await img.decode();
      const c=document.createElement("canvas");c.width=img.width;c.height=img.height;
      const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(img,0,0);
      const d=x.getImageData(0,0,c.width,c.height).data;
      let h=2166136261>>>0;
      for(let i=0;i<d.length;i++){h^=d[i];h=Math.imul(h,16777619)>>>0;}
      return JSON.stringify({w:c.width,h:c.height,digest:h.toString(16).padStart(8,"0"),
        px:Array.from(d)});
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  const r = JSON.parse(st.result.value);

  // Peak lightness and how many pixels reach it. The coverage count is the
  // number the stroke-width comments in index.html and notes.html assert,
  // and it is the only way to check them.
  let peak = -1;
  for (let i = 0; i < r.px.length; i += 4) {
    const L = oklabL(r.px[i], r.px[i + 1], r.px[i + 2]);
    if (L > peak) peak = L;
  }
  let atPeak = 0;
  for (let i = 0; i < r.px.length; i += 4) {
    if (Math.abs(oklabL(r.px[i], r.px[i + 1], r.px[i + 2]) - peak) < 0.002) atPeak++;
  }
  return {
    w: r.w,
    h: r.h,
    digest: r.digest,
    peakL: Number(peak.toFixed(4)),
    atPeak,
  };
}

// ── Pseudo-state forcing ───────────────────────────────────────

async function forceState(cdp, selector, states) {
  const doc = await cdp.send("DOM.getDocument", { depth: -1 });
  const node = await cdp.send("DOM.querySelector", {
    nodeId: doc.root.nodeId,
    selector,
  });
  if (!node.nodeId) return false;
  await cdp.send("CSS.forcePseudoState", {
    nodeId: node.nodeId,
    forcedPseudoClasses: states,
  });
  return true;
}

// ── The :link canary ───────────────────────────────────────────
// Not a measurement of the current CSS — a probe of whether the bug class
// is still *representable*.
//
// theme.css used to carry `a:visited { color: inherit }`. At (0,1,1) it
// outranked every single-class component rule, so `.nav-trigger`'s colour
// silently reverted the moment /notes entered history. v0.7.2 deleted that
// rule — but deleting it fixed the instance, not the class. `.nav-trigger`
// still scores (0,1,0), so any bare a:link/a:visited rule beats it again.
//
// This injects the twin, `a:link { color: inherit }`, and records whether
// each probe repaints.
//
// It runs in TWO variants, because cascade layers made the distinction
// load-bearing:
//
//   layered    the rule goes into `@layer reset`, which is where it would
//              land if someone added it to theme.css. This is the real
//              threat model, and since v0.7.4 every probe reports
//              `protected` — a reset-layer rule cannot outrank a component
//              rule at any specificity. A flip back to VULNERABLE means
//              the layer architecture has been broken.
//
//   unlayered  the rule goes in bare, as before. This reports VULNERABLE
//              forever and that is CORRECT, not a failure: CSS in no layer
//              outranks CSS in every layer, by design. It is kept because
//              it is the only live signal on the one real exposure layers
//              introduced — uPlot's stylesheet and CodeMirror's injected
//              theme are both unlayered and now outrank all of ours.
//              See the uPlot entry in TODO.md.
//
// Results are diffed like any other probe rather than asserted, so the
// stable VULNERABLE line costs nothing and a change in either direction
// shows up in the diff.

async function linkCanary(cdp, dpr, { layered, targets }) {
  const before = {};
  for (const s of targets) before[s] = await measure(cdp, s, dpr);

  const rule = layered
    ? "@layer reset { a:link{color:inherit} }"
    : "a:link{color:inherit}";
  await cdp.send("Runtime.evaluate", {
    expression: `{const s=document.createElement("style");s.id="__canary";
      s.textContent=${JSON.stringify(rule)};document.head.appendChild(s);}`,
  });
  await sleep(300);

  const out = {};
  for (const s of targets) {
    // An element that is not on this page must not read as "protected" —
    // both digests would be undefined and compare equal.
    if (before[s].missing || before[s].hidden) {
      out[s] = { absent: true };
      continue;
    }
    const after = await measure(cdp, s, dpr);
    out[s] = {
      vulnerable: before[s].digest !== after.digest,
      beforeL: before[s].peakL,
      afterL: after.peakL,
    };
  }
  await cdp.send("Runtime.evaluate", {
    expression: `document.getElementById("__canary")?.remove()`,
  });
  await sleep(200);
  return out;
}

// ── The view transition ────────────────────────────────────────
// theme.css animates ::view-transition-old(root) with
// `vt-fade-out var(--transition-normal) both`. If that var did not
// resolve inside the pseudo tree the shorthand would be invalid at
// computed-value time, animation-duration would fall back to 0s, and
// the outgoing page would cut instead of fading — silently, and no
// capture can see it, because this harness navigates directly and never
// clicks between pages.
//
// A same-document startViewTransition() builds the same pseudo elements
// against the same rule, so the resolved timing is readable without a
// navigation. What this records is therefore the transition's *timing*,
// not the cross-document navigation itself — that was checked out of
// band by clicking .nav-trigger both ways with a document-start script
// recording document.getAnimations(), and both directions run
// vt-fade-out at 250ms. A resolved duration of 0, or an empty list, is
// the failure this exists to catch.
async function viewTransitionTiming(cdp) {
  const r = await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      if (!document.startViewTransition) return JSON.stringify({ unsupported: true });
      try {
        const t = document.startViewTransition(() => {});
        await t.ready;
        const anims = document.getAnimations()
          .filter(a => (a.effect?.pseudoElement || "").includes("view-transition-old"))
          .map(a => ({
            pseudo: a.effect.pseudoElement,
            name: a.animationName,
            duration: a.effect.getTiming().duration,
            // A CSS animation carries its timing function on the
            // keyframes. getTiming().easing is "linear" whatever the
            // token says, so reading that would have covered the
            // duration half of --transition-normal and reported success
            // for the easing half.
            easing: a.effect.getKeyframes().map(k => k.easing),
          }));
        await t.finished;
        return JSON.stringify(anims);
      } catch (e) {
        return JSON.stringify({ failed: String(e) });
      }
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  return JSON.parse(r.result.value);
}

// ── Configurations ─────────────────────────────────────────────
//
// Not a full cross product. Verified precondition: no stylesheet contains
// a data-theme selector inside any @media block, so themes and breakpoints
// are orthogonal and crossing them measures nothing extra. Themes sweep at
// one width; widths sweep at one theme.
//
// Widths sit just below every breakpoint in the project: 650/500/425
// (style.css), 425 (settings.css), 700 (notes.css). .container and
// .search__form also cap at max-width 1024 and 584 — not breakpoints,
// but the sweep straddles both, 1400/640 above and 480/400 below.
//
// DPR is likewise not a page-level axis — it changes rasterization, not
// layout — so it lives on the glyph coverage probe instead.

const THEMES = ["violet", "blue", "pink", "green"];

function configs() {
  const out = [];
  for (const theme of THEMES)
    out.push({ name: `index-${theme}-w1400`, page: "index", theme, width: 1400, guest: false });
  for (const width of [640, 480, 400])
    out.push({ name: `index-violet-w${width}`, page: "index", theme: "violet", width, guest: false });
  out.push({ name: "index-violet-w1400-guest", page: "index", theme: "violet", width: 1400, guest: true });

  for (const theme of THEMES)
    out.push({ name: `notes-${theme}-w1400`, page: "notes", theme, width: 1400, guest: false });
  out.push({ name: "notes-violet-w600", page: "notes", theme: "violet", width: 600, guest: false });
  return out;
}

// ── Run ────────────────────────────────────────────────────────

async function run() {
  await new Promise((r) => server.listen(PORT, r));

  const userDir = path.join(
    process.env.TEMP || "/tmp",
    "voidbase-render-" + Date.now()
  );
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      `--remote-debugging-port=${CDP_PORT}`,
      "--user-data-dir=" + userDir,
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-lcd-text", // subpixel AA is GPU/driver dependent
      "--disable-gpu", // GPU compositing dithers the backdrop gradients
      "--disable-gpu-rasterization",
      "--force-color-profile=srgb",
      "--window-size=1400,900",
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  let targets;
  for (let i = 0; i < 80; i++) {
    try {
      targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then((r) => r.json());
      if (targets.length) break;
    } catch {}
    await sleep(250);
  }
  if (!targets?.length) throw new Error("Chrome did not expose a CDP target");

  const cdp = await connect(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("DOM.enable");
  await cdp.send("CSS.enable");
  await installInterception(cdp);

  const results = {};
  const list = configs().filter((c) => !ONLY || c.name.includes(ONLY));

  for (const cfg of list) {
    const dpr = 2;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: cfg.width,
      height: 900,
      deviceScaleFactor: dpr,
      mobile: cfg.width <= 500,
    });

    // Seed before the inline anti-flash script runs. Writing localStorage
    // after load and reloading would paint the default palette first.
    await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
      source: seedScript(cfg.theme, cfg.guest) + "; " + ENSURE_FONTS,
    });

    // Navigate directly. Never click between pages: @view-transition is
    // declared inline on both, and a real navigation would risk capturing
    // a frame mid-fade.
    const url = `http://127.0.0.1:${PORT}/${cfg.page === "notes" ? "notes" : ""}`;
    await cdp.send("Page.navigate", { url });
    await settle(cdp);

    const bucket = {};
    for (const sel of PROBES[cfg.page]) {
      bucket[`rest ${sel}`] = await measure(cdp, sel, dpr);
    }

    // Hover and focus sweeps run at one config each, not every config:
    // a hover rule that changes colour does so identically under every
    // theme because it resolves the same tokens.
    if (cfg.name === `index-violet-w1400` || cfg.name === "notes-violet-w1400") {
      for (const sel of HOVER[cfg.page]) {
        if (await forceState(cdp, sel, ["hover"])) {
          await sleep(400); // transitions are var(--transition-normal)
          bucket[`hover ${sel}`] = await measure(cdp, sel, dpr);
          await forceState(cdp, sel, []);
        }
      }
      // Focus is captured as a rest-vs-focused pair rather than a bare
      // measurement, because the question this axis answers is "does
      // anything paint at all", and a lone digest cannot say.
      for (const sel of FOCUS[cfg.page]) {
        const rest = await measure(cdp, sel, dpr);
        if (rest.missing || rest.hidden) continue;
        if (await forceState(cdp, sel, ["focus", "focus-visible"])) {
          await sleep(400);
          const focused = await measure(cdp, sel, dpr);
          bucket[`focus ${sel}`] = {
            paints: rest.digest !== focused.digest,
            restL: rest.peakL,
            focusL: focused.peakL,
            focusDigest: focused.digest,
          };
          await forceState(cdp, sel, []);
        }
      }
      // Components that are closed, collapsed or empty at rest. Each is
      // one class toggle away, and every one of them carried a token or a
      // tracking rule no probe could see — six tracking changes and two
      // size changes landed unverified before this existed.
      //
      // Every entry closes what it opened before the next runs. The
      // utilities block below documents why that matters: anything that
      // grows the page restretches body's gradient and shifts every
      // digest after it. The turbo panel is inline and does exactly that,
      // so leaving it open would smear the sweeps that follow.
      for (const [label, open, close, targets, hover] of REVEALED[cfg.page] ?? []) {
        await cdp.send("Runtime.evaluate", { expression: open, awaitPromise: true });
        await settleFrames(cdp);
        if (hover) {
          await forceState(cdp, hover, ["hover"]);
          await sleep(400); // transitions are var(--transition-normal)
        }
        for (const sel of targets) {
          bucket[`${label} ${sel}`] = await measure(cdp, sel, dpr);
        }
        if (hover) await forceState(cdp, hover, []);
        await cdp.send("Runtime.evaluate", { expression: close, awaitPromise: true });
        await settleFrames(cdp);
      }

      bucket["view-transition"] = await viewTransitionTiming(cdp);

      const canaryTargets = [".nav-trigger"];
      bucket["canary a:link layered"] =
        await linkCanary(cdp, dpr, { layered: true, targets: canaryTargets });
      bucket["canary a:link unlayered"] =
        await linkCanary(cdp, dpr, { layered: false, targets: canaryTargets });

      // The two stroke-width comment blocks assert pixel-coverage counts
      // at DPR 1. Without this pass they cannot be checked at all.
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: cfg.width, height: 900, deviceScaleFactor: 1, mobile: false,
      });
      await sleep(300);
      bucket["dpr1 .nav-trigger"] = await measure(cdp, ".nav-trigger", 1);
      bucket["dpr1 .settings-trigger"] = await measure(cdp, ".settings-trigger", 1);
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: cfg.width, height: 900, deviceScaleFactor: 2, mobile: false,
      });

      // The utilities grid is the only collapsed-by-default section on
      // either page, so this is one fixture rather than a pattern. Open
      // it and probe the card in the state a user actually sees.
      //
      // This runs LAST in the config, and has to. body's gradient paints
      // over the whole scrollable canvas, so growing the page restretches
      // it and every element's backdrop shifts — identical in peak
      // lightness, different in every digest. Expanding before the hover
      // sweep moved 20 unrelated probes.
      if (cfg.page === "index") {
        await cdp.send("Runtime.evaluate", {
          expression: `{document.querySelector(".utilities__content")?.classList.add("expanded");
            document.querySelector(".utilities__toggle")?.classList.add("expanded");}`,
        });
        await sleep(400); // max-height/opacity are var(--transition-normal)
        // settle() pinned the animations that existed at load; expanding
        // starts fresh transitions that need the same treatment.
        await cdp.send("Runtime.evaluate", {
          expression: `(()=>{for(const a of document.getAnimations()){
            try{a.finish();}catch(e){}}})()`,
        });
        // Then wait for the card's own box to stop moving. Finishing the
        // animations is not enough: the drawer's children lay out for the
        // first time here, and their height came back 82, 86 and 88 CSS px
        // across three runs of identical code. Poll until two consecutive
        // frames agree rather than sleeping longer and hoping.
        await cdp.send("Runtime.evaluate", {
          expression: `(async () => {
            await ensureFonts();
            const el = document.querySelector(".utilities__card");
            if (!el) return;
            const frame = () => new Promise(r => requestAnimationFrame(r));
            let prev = null;
            for (let i = 0; i < 120; i++) {
              await frame();
              const r = el.getBoundingClientRect();
              const now = r.width + "x" + r.height + "@" + r.x + "," + r.y;
              if (now === prev) return;
              prev = now;
            }
          })()`,
          awaitPromise: true,
        });

        const sel = ".utilities__card";
        bucket[`expanded ${sel}`] = await measure(cdp, sel, dpr);
        if (await forceState(cdp, sel, ["hover"])) {
          await sleep(400);
          bucket[`expanded hover ${sel}`] = await measure(cdp, sel, dpr);
          await forceState(cdp, sel, []);
          await sleep(400); // let the hover fill transition back out
        }
        // Reuse the pre-hover measurement rather than taking a fresh one:
        // sampled here it catches the hover fill still transitioning out,
        // and restL lands somewhere between 0.709 and 0.9702 run to run.
        const rest = bucket[`expanded ${sel}`];
        if (await forceState(cdp, sel, ["focus", "focus-visible"])) {
          await sleep(400);
          const focused = await measure(cdp, sel, dpr);
          bucket[`expanded focus ${sel}`] = {
            paints: rest.digest !== focused.digest,
            restL: rest.peakL,
            focusL: focused.peakL,
            focusDigest: focused.digest,
          };
          await forceState(cdp, sel, []);
        }
        bucket["expanded canary a:link layered"] =
          await linkCanary(cdp, dpr, { layered: true, targets: [sel] });
        bucket["expanded canary a:link unlayered"] =
          await linkCanary(cdp, dpr, { layered: false, targets: [sel] });
      }
    }

    results[cfg.name] = bucket;
    console.log(`  captured ${cfg.name}  (${Object.keys(bucket).length} probes)`);
  }

  chrome.kill();
  server.close();
  return results;
}

// document.fonts.ready resolves once nothing is *pending* — which is true
// before layout has demanded a face nobody has asked for yet. The Josefin
// wordmark is the live case: awaiting readiness alone let it swap in after
// the capture, moving .header between 1052 and 1056 device px run to run
// while peak lightness and pixel count stayed identical. Requesting each
// face explicitly makes the set deterministic instead of demand-ordered.
const ENSURE_FONTS = `window.ensureFonts = async () => {
  const faces = [
    '200 16px Geist', '400 16px Geist', '600 16px Geist', '700 16px Geist',
    '700 16px "Josefin Sans"',
    '400 16px "Noto Sans Thai"', '600 16px "Noto Sans Thai"',
    '700 16px "Noto Sans Thai"',
  ];
  // The sample text has to cover every unicode-range that will be used, or
  // load() resolves having fetched only the subsets it happens to touch and
  // the rest still arrive on demand. The Thai character is load-bearing:
  // without it Noto Sans Thai's thai subset stayed unrequested and the
  // notes list, rows and statusbar each moved a few px between runs.
  await Promise.all(faces.map(f => document.fonts.load(f, "voidbase 0123 ก").catch(() => {})));
  await document.fonts.ready;
};`;

// Wait for the page to stop moving: fonts loaded, data rendered, two
// animation frames clear. Deferred modules fill data in after first
// paint, so a fixed sleep alone would race them.
async function settle(cdp) {
  for (let i = 0; i < 60; i++) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: `(async()=>{ await ensureFonts();
        return document.readyState==="complete"; })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result.value) break;
    await sleep(100);
  }
  await sleep(1200); // data render + transitions
  await cdp.send("Runtime.evaluate", {
    expression: `ensureFonts()`,
    awaitPromise: true,
  });

  // Pin every running animation to a fixed point on its timeline. The
  // backdrop carries `ambientPulse 12s infinite alternate`, so without
  // this each capture samples a different phase and every element
  // composited over it hashes differently — identical to the eye, and
  // identical in peak lightness, but never byte-equal.
  await cdp.send("Runtime.evaluate", {
    expression: `(()=>{for(const a of document.getAnimations()){
      try{a.pause();a.currentTime=0;}catch(e){}}})()`,
  });

  // CodeMirror measures itself over several async cycles after mount, so
  // the notes pane keeps growing for a while after readyState is complete
  // and fonts are in. Wait for the page's own geometry to stop changing
  // rather than for a duration that happened to be long enough once.
  await cdp.send("Runtime.evaluate", {
    expression: `(async () => {
      const sig = () => {
        const h = (s) => {
          const el = document.querySelector(s);
          return el ? Math.round(el.getBoundingClientRect().height) : -1;
        };
        return [
          document.documentElement.scrollHeight,
          h(".cm-content"), h(".notes__pane"), h(".notes__list"),
          h(".markets"), h(".deals-section"),
        ].join("/");
      };
      const frame = () => new Promise(r => requestAnimationFrame(r));
      let prev = null, same = 0;
      for (let i = 0; i < 180; i++) {
        await frame();
        const now = sig();
        same = now === prev ? same + 1 : 0;
        prev = now;
        if (same >= 4) return;
      }
    })()`,
    awaitPromise: true,
  });

  await cdp.send("Runtime.evaluate", {
    expression: `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`,
    awaitPromise: true,
  });
}

// ── Compare ────────────────────────────────────────────────────

function compare(base, now) {
  const diffs = [];
  for (const cfg of Object.keys(now)) {
    if (!base[cfg]) {
      diffs.push({ cfg, probe: "*", kind: "new config" });
      continue;
    }
    for (const probe of Object.keys(now[cfg])) {
      const a = base[cfg][probe],
        b = now[cfg][probe];
      if (!a) {
        diffs.push({ cfg, probe, kind: "new probe" });
        continue;
      }
      if (JSON.stringify(a) !== JSON.stringify(b)) {
        diffs.push({ cfg, probe, kind: "changed", was: a, now: b });
      }
    }
    for (const probe of Object.keys(base[cfg])) {
      if (!now[cfg][probe]) diffs.push({ cfg, probe, kind: "probe gone" });
    }
  }
  return diffs;
}

(async () => {
  console.log("\n=== Voidbase render matrix ===\n");
  const now = await run();

  if (missingFixtures.size) {
    console.error(`\nFAIL — ${missingFixtures.size} missing fixture(s):`);
    for (const f of missingFixtures) console.error("  " + f);
    process.exit(1);
  }

  // Canary status, reported every run. Not an assertion — see linkCanary.
  // `unlayered` reporting VULNERABLE is the expected, correct result.
  for (const [cfg, bucket] of Object.entries(now)) {
    for (const variant of ["layered", "unlayered", "expanded layered",
                           "expanded unlayered"]) {
      const key = variant.startsWith("expanded ")
        ? `expanded canary a:link ${variant.slice(9)}`
        : `canary a:link ${variant}`;
      const c = bucket[key];
      if (!c) continue;
      for (const [sel, r] of Object.entries(c)) {
        if (r.absent) continue;
        const state = r.vulnerable
          ? `VULNERABLE  L ${r.beforeL} -> ${r.afterL}`
          : `protected`;
        const note = r.vulnerable && variant.endsWith("unlayered") ? "  (expected)" : "";
        console.log(
          `  canary ${variant.padEnd(18)} ${cfg} ${sel.padEnd(18)} ${state}${note}`
        );
      }
    }
  }

  if (UPDATE) {
    fs.writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n");
    const probes = Object.values(now).reduce((n, b) => n + Object.keys(b).length, 0);
    console.log(
      `\nBaseline written: ${Object.keys(now).length} configs, ${probes} probes.`
    );
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE)) {
    console.error("\nNo baseline. Run with --update first.");
    process.exit(1);
  }
  const base = JSON.parse(fs.readFileSync(BASELINE, "utf8"));
  const diffs = compare(base, now);

  if (!diffs.length) {
    const probes = Object.values(now).reduce((n, b) => n + Object.keys(b).length, 0);
    console.log(`\nPASS — ${probes} probes across ${Object.keys(now).length} configs.\n`);
    process.exit(0);
  }
  console.error(`\nFAIL — ${diffs.length} painted-pixel change(s):\n`);
  for (const d of diffs) {
    console.error(`  ${d.cfg}  ${d.probe}  [${d.kind}]`);
    if (d.was) {
      // Not every probe is a box measurement. `expanded focus` records
      // {paints, restL, focusL, focusDigest}; formatted as one, every
      // field reads `undefined` and a real change becomes unreadable.
      const fmt = r =>
        r && r.digest !== undefined
          ? `L=${r.peakL} atPeak=${r.atPeak} ${r.w}x${r.h} ${r.digest}`
          : JSON.stringify(r);
      console.error(`      was  ${fmt(d.was)}`);
      console.error(`      now  ${fmt(d.now)}`);
    }
  }
  console.error("\nIf the change is intended: node test/render/matrix.js --update\n");
  process.exit(1);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
