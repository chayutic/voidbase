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
//    - Fonts and uPlot are served from test/render/vendor, never the
//      network. Font-swap timing moves every text pixel in the capture.
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
const VENDOR = path.join(HERE, "vendor");
const BASELINE = path.join(HERE, "baseline.json");
const PORT = 3996;
const CDP_PORT = 9336;

const CHROME =
  process.env.CHROME_PATH ||
  "C:/Program Files/Google/Chrome/Application/chrome.exe";

const args = process.argv.slice(2);
const UPDATE = args.includes("--update");
const ONLY = (args.find((a) => a.startsWith("--only=")) || "").slice(7);

// ── Static host ──────────────────────────────────────────────────
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

// ── CDP plumbing ─────────────────────────────────────────────────
// Raw WebSocket rather than puppeteer: Node has a global WebSocket, and
// this project has no runtime dependencies worth adding one for.

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

// ── Colour ───────────────────────────────────────────────────────

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

// ── Request interception ─────────────────────────────────────────
// Maps an intercepted URL to a file on disk, or null to let it through.
// Fixtures are matched by route shape, so adding a symbol or a note means
// adding a fixture file, not editing this function.

function fixtureFor(url) {
  const u = new URL(url);
  const p = u.pathname;

  if (u.host === "fonts.googleapis.com")
    return { file: path.join(VENDOR, "fonts.css"), type: "text/css" };
  if (u.host === "fonts.gstatic.com")
    return { file: path.join(VENDOR, "fonts", path.basename(p)), type: "font/woff2" };
  if (p.startsWith("/__fixture__/fonts/"))
    return { file: path.join(VENDOR, "fonts", path.basename(p)), type: "font/woff2" };
  if (u.host === "unpkg.com")
    return {
      file: path.join(VENDOR, path.basename(p)),
      type: p.endsWith(".css") ? "text/css" : "text/javascript",
    };

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
  if (p === "/notes/api/list") return json("notes_list.json");
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

// ── Seeded state ─────────────────────────────────────────────────
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

// ── Probes ───────────────────────────────────────────────────────

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
    ".utilities__card",
    ".arrivals__card",
    ".stocks__card",
    ".footer__top",
    ".settings-trigger",
    ".nav-trigger",
  ],
  notes: [".notes__row", ".notes__new-row", ".notes__collapse", ".nav-trigger"],
};

// Focus sweep. The project has no :focus-visible rule anywhere, and
// DESIGN.md describes focus states the CSS does not implement (see
// TODO.md, "Keyboard focus states"). What this measures is therefore not
// the design system: where `paints` is true it is Chrome's own default
// focus ring showing through, and where it is false the control shows
// nothing at all when tabbed to. Both are findings, not baselines to be
// proud of; the axis exists so that whichever way that decision goes, the
// diff says so.
const FOCUS = {
  index: [".search__input", ".card", ".utilities__card", ".settings-trigger", ".nav-trigger"],
  notes: [".notes__search", ".notes__row", ".nav-trigger"],
};

// ── Measurement ──────────────────────────────────────────────────
// One clipped screenshot per element. Clipping to the element's own box
// means a layout shift somewhere else on the page cannot smear across
// every region's digest, and it reaches elements below the fold without
// scrolling. captureBeyondViewport does the rest.

async function measure(cdp, selector, dpr) {
  const boxRes = await cdp.send("Runtime.evaluate", {
    expression: `JSON.stringify((()=>{const el=document.querySelector(${JSON.stringify(
      selector
    )});if(!el)return null;const r=el.getBoundingClientRect();
      if(!r.width||!r.height)return {empty:true};
      return {x:r.x+scrollX,y:r.y+scrollY,w:r.width,h:r.height};})())`,
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

// ── Pseudo-state forcing ─────────────────────────────────────────

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

// ── The :link canary ─────────────────────────────────────────────
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
// each probe repaints. Today .nav-trigger does and .utilities__card does
// not, because the card carries a :link/:visited specificity bump — the
// Lane B fossil, which turns out to be genuinely protective against this.
//
// The result is diffed like any other probe rather than asserted, because
// "vulnerable" is the honest current state. When Lane A lands cascade
// layers and puts the reset below components, these flip to false and the
// diff will say so. After that, a flip back to true is the regression.

async function linkCanary(cdp, dpr) {
  const targets = [".nav-trigger", ".utilities__card"];
  const before = {};
  for (const s of targets) before[s] = await measure(cdp, s, dpr);

  await cdp.send("Runtime.evaluate", {
    expression: `{const s=document.createElement("style");s.id="__canary";
      s.textContent="a:link{color:inherit}";document.head.appendChild(s);}`,
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

// ── Configurations ───────────────────────────────────────────────
//
// Not a full cross product. Verified precondition: no stylesheet contains
// a data-theme selector inside any @media block, so themes and breakpoints
// are orthogonal and crossing them measures nothing extra. Themes sweep at
// one width; widths sweep at one theme.
//
// Widths sit just below each real breakpoint so every block executes:
// style.css has 650/500/425, settings.css 425, notes.css 700.
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

// ── Run ──────────────────────────────────────────────────────────

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
      source: seedScript(cfg.theme, cfg.guest),
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
      bucket["canary a:link"] = await linkCanary(cdp, dpr);

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
    }

    results[cfg.name] = bucket;
    console.log(`  captured ${cfg.name}  (${Object.keys(bucket).length} probes)`);
  }

  chrome.kill();
  server.close();
  return results;
}

// Wait for the page to stop moving: fonts loaded, data rendered, two
// animation frames clear. Deferred modules apply body classes (guest mode)
// after first paint, so a fixed sleep alone would race them.
async function settle(cdp) {
  for (let i = 0; i < 60; i++) {
    const r = await cdp.send("Runtime.evaluate", {
      expression: `(async()=>{ await document.fonts.ready;
        return document.readyState==="complete"; })()`,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.result.value) break;
    await sleep(100);
  }
  await sleep(1200); // data render + transitions

  // Pin every running animation to a fixed point on its timeline. The
  // backdrop carries `ambientPulse 12s infinite alternate`, so without
  // this each capture samples a different phase and every element
  // composited over it hashes differently — identical to the eye, and
  // identical in peak lightness, but never byte-equal.
  await cdp.send("Runtime.evaluate", {
    expression: `(()=>{for(const a of document.getAnimations()){
      try{a.pause();a.currentTime=0;}catch(e){}}})()`,
  });

  await cdp.send("Runtime.evaluate", {
    expression: `new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`,
    awaitPromise: true,
  });
}

// ── Compare ──────────────────────────────────────────────────────

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
  for (const [cfg, bucket] of Object.entries(now)) {
    const c = bucket["canary a:link"];
    if (!c) continue;
    for (const [sel, r] of Object.entries(c)) {
      if (r.absent) continue;
      const state = r.vulnerable
        ? `VULNERABLE  L ${r.beforeL} -> ${r.afterL} under a:link{color:inherit}`
        : `protected`;
      console.log(`  canary ${cfg} ${sel.padEnd(18)} ${state}`);
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
      console.error(
        `      was  L=${d.was.peakL} atPeak=${d.was.atPeak} ${d.was.w}x${d.was.h} ${d.was.digest}`
      );
      console.error(
        `      now  L=${d.now.peakL} atPeak=${d.now.atPeak} ${d.now.w}x${d.now.h} ${d.now.digest}`
      );
    }
  }
  console.error("\nIf the change is intended: node test/render/matrix.js --update\n");
  process.exit(1);
})().catch((e) => {
  console.error("HARNESS ERROR", e);
  process.exit(1);
});
