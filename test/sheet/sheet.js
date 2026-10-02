// ═══════════════════════════════════════════════════════════════
//  CONTACT SHEET — the states nobody visits by habit, as pictures
// ═══════════════════════════════════════════════════════════════
//
//  Not a test: no baseline, no pass or fail. It shoots the running
//  dev server, every theme on both pages at desktop and phone width
//  plus the panels and modes that start shut, into
//  .audit/shots/sheet/ for a person to look at.
//
//  npm run sheet                   every shot
//  npm run sheet -- notes phone    only names holding every word
//
//  Headless Chromium always matches (hover: none), so anything shown
//  only under (hover: hover) is missing from every shot.

const { spawn, execFileSync } = require("node:child_process");
const fs   = require("node:fs");
const os   = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const OUT  = path.join(ROOT, ".audit", "shots", "sheet");
const BASE = process.env.SHEET_BASE || "http://127.0.0.1:3006";

const THEMES = ["violet", "blue", "pink", "green", "black", "white"];
const SIZES  = { desktop: [1440, 900], phone: [390, 844] };

const PAGES = {
  dashboard: { path: "/", ready: `!!document.querySelector(".container")` },
  notes:     { path: "/notes", ready: `!!document.querySelector(".notes__pane.cm6-ready")` },
};

// Each state proves it took before its shot is kept. A selector that
// stops matching would otherwise save the shut state under the open
// state's name.
const STATES = [
  { page: "dashboard", name: "utilities",
    act: `document.querySelector(".utilities__toggle").click()`,
    check: `document.querySelector(".utilities__content.expanded")?.checkVisibility()` },
  { page: "dashboard", name: "panel",
    act: `document.getElementById("settingsTrigger").click()`,
    check: `document.getElementById("settingsPanel").classList.contains("open")` },
  { page: "dashboard", name: "guest", store: { guestMode: "true" },
    check: `document.documentElement.classList.contains("guest-mode")` },
  { page: "notes", name: "panel",
    act: `document.getElementById("settingsTrigger").click()`,
    check: `document.getElementById("settingsPanel").classList.contains("open")` },
  { page: "notes", name: "switcher",
    act: `document.getElementById("switcherOpen").click()`,
    check: `document.getElementById("noteSwitcher").open` },
  { page: "notes", name: "mono", store: { notesFont: "mono" },
    check: `document.documentElement.classList.contains("notes-mono") && document.fonts.check('16px "Geist Mono"')` },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Shot list ──────────────────────────────────────────────────

function shotList(words) {
  const shots = [];
  for (const theme of THEMES)
    for (const page of Object.keys(PAGES))
      for (const size of Object.keys(SIZES))
        shots.push({ name: `${page}-${theme}-${size}`, page, theme, size });
  for (const state of STATES)
    for (const size of Object.keys(SIZES))
      shots.push({ name: `${state.page}-violet-${size}-${state.name}`, page: state.page, theme: "violet", size, state });
  return shots.filter((s) => words.every((w) => s.name.includes(w)));
}

// ── Chrome ─────────────────────────────────────────────────────

function chromePath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const cache = path.join(os.homedir(), ".cache", "ms-playwright");
  const found = fs.existsSync(cache) && fs.readdirSync(cache)
    .filter((d) => d.startsWith("chromium-")).sort().reverse()
    .map((d) => path.join(cache, d, "chrome-linux", "chrome"))
    .find((p) => fs.existsSync(p));
  if (!found) throw new Error("No Chrome: set CHROME_PATH");
  return found;
}

// Port 0 and DevToolsActivePort, never a fixed port: a fixed one
// silently attaches to whatever stale headless Chrome already holds it.
async function launch() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "sheet-"));
  const proc = spawn(chromePath(), ["--headless=new", "--no-sandbox", "--hide-scrollbars",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
  const portFile = path.join(profile, "DevToolsActivePort");
  for (let i = 0; i < 100 && !fs.existsSync(portFile); i++) await sleep(100);
  const port = fs.readFileSync(portFile, "utf8").split("\n")[0];
  const targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  const ws = new WebSocket(targets.find((t) => t.type === "page").webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });

  let id = 0;
  const waiting = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && waiting.has(d.id)) { waiting.get(d.id)(d); waiting.delete(d.id); }
  };
  const send = (method, params = {}) => new Promise((r) => {
    waiting.set(++id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const close = () => {
    ws.close();
    proc.kill("SIGKILL");
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { send, close };
}

// ── Shooting ───────────────────────────────────────────────────

async function main() {
  // Shots hold real notes and real homelab names. Writing them
  // anywhere git can see would put them one `git add -A` from public.
  fs.mkdirSync(OUT, { recursive: true });
  try { execFileSync("git", ["check-ignore", "-q", OUT], { cwd: ROOT }); }
  catch { throw new Error(`${OUT} is not ignored by git; add /.audit/ to .git/info/exclude`); }

  const shots = shotList(process.argv.slice(2));
  if (!shots.length) throw new Error("No shot names match those words");

  process.loadEnvFile(path.join(ROOT, ".env"));
  const auth = "Basic " + Buffer.from("sheet:" + process.env.NOTES_PASSWORD).toString("base64");

  const { send, close } = await launch();
  const ev = async (expression) => {
    const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description);
    return r.result.result.value;
  };
  const until = async (expr, ms) => {
    for (const end = Date.now() + ms; Date.now() < end; await sleep(150))
      if (await ev(`(() => { try { return !!(${expr}); } catch { return false; } })()`)) return true;
    return false;
  };

  const skipped = [];
  try {
    await send("Network.enable");
    await send("Network.setExtraHTTPHeaders", { headers: { Authorization: auth } });
    await send("Page.navigate", { url: BASE + "/" });
    if (!(await until(PAGES.dashboard.ready, 10000))) throw new Error(`Nothing answering at ${BASE}`);

    for (const shot of shots) {
      const file = path.join(OUT, shot.name + ".png");
      fs.rmSync(file, { force: true });

      const [width, height] = SIZES[shot.size];
      await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
      if (!(await ev(`location.origin === ${JSON.stringify(new URL(BASE).origin)}`))) {
        await send("Page.navigate", { url: BASE + "/" });
        await until(PAGES.dashboard.ready, 10000);
      }
      const store = { theme: shot.theme, ...shot.state?.store };
      await ev(`localStorage.clear(); Object.assign(localStorage, ${JSON.stringify(store)}); true`);

      const page = PAGES[shot.page];
      await send("Page.navigate", { url: BASE + page.path });
      await sleep(300);
      if (!(await until(page.ready, 10000))) { skipped.push(`${shot.name}: page never ready`); continue; }
      await ev(`document.fonts.ready.then(() => true)`);
      await until(`!document.querySelector('[data-state="loading"]')`, 8000);

      if (shot.state?.act) await ev(`${shot.state.act}; true`);
      if (shot.state && !(await until(shot.state.check, 3000))) { skipped.push(`${shot.name}: state never took`); continue; }
      // The theme's colour transition and any opening animation.
      await sleep(500);

      const { cssContentSize: c } = (await send("Page.getLayoutMetrics")).result;
      const r = await send("Page.captureScreenshot", {
        captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: Math.max(width, Math.ceil(c.width)), height: Math.max(height, Math.ceil(c.height)), scale: 1 },
      });
      fs.writeFileSync(file, Buffer.from(r.result.data, "base64"));
      console.log("shot  ", shot.name);
    }
  } finally {
    close();
  }

  for (const s of skipped) console.log("SKIP  ", s);
  console.log(`${shots.length - skipped.length} of ${shots.length} in ${path.relative(ROOT, OUT)}/`);
  if (skipped.length) process.exitCode = 1;
}

main().catch((err) => { console.error(err.message); process.exitCode = 1; });
