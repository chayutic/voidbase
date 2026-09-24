// ═══════════════════════════════════════════════════════════════
//  CONVENTIONS — the greppable rules from the project brief
// ═══════════════════════════════════════════════════════════════
//
//  Every check here is a rule that review keeps having to catch by
//  eye. Each one prints the file:line of every violation and the
//  script exits 1 if any fired. `npm run lint:conventions`.
//
//  Allowlists are explicit and carry their reason inline. A new entry
//  is a decision, not a way to make the run go green.

const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "../..");
const PUBLIC = path.join(ROOT, "public");

// ── Files ──────────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const read = (p) => fs.readFileSync(p, "utf8");

const isVendor = (p) => rel(p).startsWith("public/js/vendor/") || rel(p) === "public/vendor.css";

const publicFiles = walk(PUBLIC).filter((p) => !isVendor(p));
const JS   = publicFiles.filter((p) => p.endsWith(".js"));
const CSS  = publicFiles.filter((p) => p.endsWith(".css"));
const HTML = publicFiles.filter((p) => p.endsWith(".html"));
const SERVER_JS = [path.join(ROOT, "server.js"), ...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "test")).filter((p) => p.endsWith(".js"))];

const THEME_CSS = path.join(PUBLIC, "theme.css");
const STORE_JS  = path.join(PUBLIC, "js/store.js");

// ── Source helpers ─────────────────────────────────────────────

/** Blank out comments, keeping every newline so offsets map to lines.
 *  Strings are skipped over rather than parsed; good enough for code
 *  that has no regex literals containing quotes or slashes. */
function stripJsComments(src) {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i], n = src[i + 1];
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
    } else if (c === "/" && n === "*") {
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) { out += src[i] === "\n" ? "\n" : " "; i++; }
      out += "  "; i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      out += c; i++;
      while (i < src.length && src[i] !== c) {
        if (src[i] === "\\") { out += src[i++]; }
        out += src[i++];
      }
      out += src[i++] ?? "";
    } else {
      out += c; i++;
    }
  }
  return out;
}

function stripCssComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
}

function stripHtmlComments(src) {
  return src.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

// ── Reporting ──────────────────────────────────────────────────

const results = [];

function check(name, rule, fn) {
  const hits = [];
  fn((file, line, msg) => hits.push({ where: `${rel(file)}:${line}`, msg }));
  results.push({ name, rule, hits });
}

// ── Storage ────────────────────────────────────────────────────

const storeSrc = read(STORE_JS);
const KEYS = Object.fromEntries(
  [...storeSrc.match(/export const KEYS = \{([\s\S]*?)\};/)[1].matchAll(/^\s*(\w+):\s*"([^"]+)"/gm)]
    .map((m) => [m[1], m[2]]),
);

check("storage-direct", "All persisted state goes through store.js", (hit) => {
  for (const f of JS) {
    if (f === STORE_JS) continue;
    const src = stripJsComments(read(f));
    for (const m of src.matchAll(/\b(localStorage|sessionStorage)\b/g)) hit(f, lineOf(src, m.index), m[1]);
  }
  // The inline anti-flash script in each <head> is the one sanctioned
  // exception: it runs before any module can load. It must read the
  // same key store.js writes, or the theme resets on every load.
  for (const f of HTML) {
    const src = stripHtmlComments(read(f));
    for (const m of src.matchAll(/\b(localStorage|sessionStorage)\b(\.getItem\("([^"]*)"\))?/g)) {
      if (m[1] === "localStorage" && m[3] === KEYS.theme) continue;
      hit(f, lineOf(src, m.index), m[3] ? `${m[1]} key "${m[3]}" is not KEYS.theme` : m[1]);
    }
  }
});

check("storage-literal-key", "store.* is called with a KEYS entry, never a string", (hit) => {
  for (const f of JS) {
    const src = stripJsComments(read(f));
    for (const m of src.matchAll(/\bstore\.(bool|int|json|str|set|remove)\(\s*(["'`])/g)) hit(f, lineOf(src, m.index), `store.${m[1]}(<literal>)`);
  }
});

check("keys-registry", "KEYS matches actual use in both directions", (hit) => {
  const used = new Map();
  for (const f of JS) {
    if (f === STORE_JS) continue;
    const src = stripJsComments(read(f));
    for (const m of src.matchAll(/\bKEYS\.(\w+)/g)) {
      if (!(m[1] in KEYS)) hit(f, lineOf(src, m.index), `KEYS.${m[1]} is not in the registry`);
      used.set(m[1], true);
    }
  }
  const keysLine = (k) => lineOf(storeSrc, storeSrc.indexOf(`  ${k}:`));
  for (const k of Object.keys(KEYS)) {
    if (!used.has(k) && !(k === "theme" && HTML.length)) hit(STORE_JS, keysLine(k), `KEYS.${k} is never used`);
  }
  const seen = new Map();
  for (const [k, v] of Object.entries(KEYS)) {
    if (seen.has(v)) hit(STORE_JS, keysLine(k), `KEYS.${k} and KEYS.${seen.get(v)} share the string "${v}"`);
    seen.set(v, k);
  }
});

// ── Themes ─────────────────────────────────────────────────────

const themeSrc = stripCssComments(read(THEME_CSS));
const THEMES = new Set([...themeSrc.matchAll(/:root\[data-theme="([\w-]+)"\]/g)].map((m) => m[1]));

check("theme-selector", "No data-theme selector outside theme.css", (hit) => {
  for (const f of CSS) {
    if (f === THEME_CSS) continue;
    const src = stripCssComments(read(f));
    for (const m of src.matchAll(/([^\s{},]*)\[data-theme\b/g)) {
      // A swatch previews one theme while another is active, so it keys
      // off its own attribute, not the document's. Not a theme selector.
      if (m[1] === ".theme__swatch") continue;
      hit(f, lineOf(src, m.index), `${m[1]}[data-theme…]`);
    }
  }
});

check("theme-set", "Every theme has a theme.css block, a swatch on both pages, and a swatch colour", (hit) => {
  const js = read(path.join(PUBLIC, "js/theme.js"));
  const def = js.match(/DEFAULT_THEME\s*=\s*"([^"]+)"/)?.[1];
  if (!THEMES.has(def)) hit(path.join(PUBLIC, "js/theme.js"), lineOf(js, js.indexOf("DEFAULT_THEME")), `DEFAULT_THEME "${def}" has no theme.css block`);

  for (const f of HTML) {
    const src = stripHtmlComments(read(f));
    const fallbacks = [...src.matchAll(/dataset\.theme\s*=[^;]*?"([\w-]+)"\s*;/g)];
    for (const m of fallbacks) if (m[1] !== def) hit(f, lineOf(src, m.index), `inline fallback "${m[1]}" is not DEFAULT_THEME "${def}"`);

    const swatches = new Set();
    for (const m of src.matchAll(/class="theme__swatch"\s+data-theme="([\w-]+)"/g)) {
      swatches.add(m[1]);
      if (!THEMES.has(m[1])) hit(f, lineOf(src, m.index), `swatch "${m[1]}" has no theme.css block`);
    }
    for (const t of THEMES) if (!swatches.has(t)) hit(f, 1, `theme "${t}" has no swatch`);
  }

  const settings = path.join(PUBLIC, "settings.css");
  const sSrc = stripCssComments(read(settings));
  const painted = new Set([...sSrc.matchAll(/\.theme__swatch\[data-theme="([\w-]+)"\]\s*\{[^}]*background/g)].map((m) => m[1]));
  for (const t of THEMES) if (!painted.has(t)) hit(settings, 1, `swatch "${t}" has no background rule`);

  // Swatch lightness and chroma are tuned by eye (DESIGN.md, The
  // Perceptual Swatch Exception), but the hue must match its theme.
  const hues = Object.fromEntries([...themeSrc.matchAll(/:root\[data-theme="([\w-]+)"\] body\s*\{\s*--theme-hue:\s*([\d.]+)/g)].map((m) => [m[1], Number(m[2])]));
  for (const m of sSrc.matchAll(/\.theme__swatch\[data-theme="([\w-]+)"\]\s*\{[^}]*oklch\(\s*[\d.]+\s+([\d.]+)\s+([\d.]+)/g)) {
    const [, t, chroma, hue] = m;
    if (Number(chroma) === 0 || !(t in hues)) continue;
    if (Number(hue) !== hues[t]) hit(settings, lineOf(sSrc, m.index), `swatch "${t}" hue ${hue} is not --theme-hue ${hues[t]}`);
  }
});

// ── Colour ─────────────────────────────────────────────────────

const COLOUR_FN = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(\s*(?!from\b)/g;
const HEX = /#[0-9a-fA-F]{3,8}\b/g;
const NAMED = /\b(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|beige|silver|navy|teal)\b/g;
const COLOUR_PROPS = /^\s*(color|background(-color)?|border(-\w+)*(-color)?|outline(-color)?|fill|stroke|(box|text)-shadow|caret-color|accent-color|text-decoration(-color)?|column-rule(-color)?)\s*:/;

check("colour-literal", "No hard-coded colour outside theme.css (The One Hue Rule)", (hit) => {
  for (const f of CSS) {
    if (f === THEME_CSS) continue;
    const src = stripCssComments(read(f));
    src.split("\n").forEach((line, i) => {
      // Swatches preview themes other than the active one, so they
      // cannot read --accent. Drift against theme.css is its own check.
      if (/\.theme__swatch\[data-theme=/.test(line)) return;
      for (const re of [COLOUR_FN, HEX]) for (const m of line.matchAll(re)) hit(f, i + 1, m[0].trim());
      for (const decl of line.split(/[;{}]/)) {
        if (!COLOUR_PROPS.test(decl)) continue;
        const value = decl.slice(decl.indexOf(":") + 1).replace(/var\([^)]*\)/g, "");
        for (const m of value.matchAll(NAMED)) hit(f, i + 1, m[0]);
      }
    });
  }
  for (const f of [...JS, ...HTML]) {
    const src = f.endsWith(".js") ? stripJsComments(read(f)) : stripHtmlComments(read(f));
    for (const re of [COLOUR_FN, HEX]) {
      for (const m of src.matchAll(re)) {
        // HTML ids and fragment links are not colours.
        if (m[0].startsWith("#") && !/["'`:\s(]#/.test(src.slice(m.index - 1, m.index + 1))) continue;
        if (m[0].startsWith("#") && /href="#|querySelector|getElementById/.test(src.slice(m.index - 30, m.index))) continue;
        hit(f, lineOf(src, m.index), m[0].trim());
      }
    }
  }
});

// ── Motion and prefixes ────────────────────────────────────────

check("reduced-motion", "prefers-reduced-motion is deliberately not honoured", (hit) => {
  for (const f of [...CSS, ...JS, ...HTML]) {
    const src = read(f);
    for (const m of src.matchAll(/prefers-reduced-motion/g)) hit(f, lineOf(src, m.index), m[0]);
  }
});

// Prefixed features with no unprefixed equivalent that ships in every
// evergreen browser yet. Anything not listed here is a twin.
const WEBKIT_ONLY = new Set([
  "-webkit-tap-highlight-color",
  "-webkit-font-smoothing",
  "-webkit-text-stroke",
  "-webkit-touch-callout",
  "-webkit-line-clamp",
  "-webkit-box",
  "-webkit-box-orient",
]);

check("webkit-prefix", "A -webkit- prefix earns its place only when nothing unprefixed exists", (hit) => {
  for (const f of [...CSS, ...JS, ...HTML]) {
    const src = f.endsWith(".css") ? stripCssComments(read(f)) : read(f);
    for (const m of src.matchAll(/-webkit-[a-z-]+/g)) {
      if (!WEBKIT_ONLY.has(m[0])) hit(f, lineOf(src, m.index), m[0]);
    }
  }
});

// ── Banners ────────────────────────────────────────────────────

const width = (s) => [...s].length;

check("banner-js", "JS section rules are `// ── Name ──…` ending at column 66", (hit) => {
  for (const f of [...JS, ...SERVER_JS]) {
    read(f).split("\n").forEach((raw, i) => {
      const line = raw.replace(/\r$/, "");
      if (!/^\s*\/\/\s*──/.test(line)) return;
      if (!/^\s*\/\/ ── \S.*? ─+$/.test(line)) hit(f, i + 1, "malformed");
      else if (width(line) !== 66) hit(f, i + 1, `ends at column ${width(line)}`);
    });
  }
});

check("banner-css", "CSS subsections are unpadded `/* ── Name ── */`", (hit) => {
  for (const f of CSS) {
    read(f).split("\n").forEach((raw, i) => {
      const line = raw.replace(/\r$/, "");
      if (!/\/\*\s*──/.test(line)) return;
      // A banner may open a comment block that runs on below it.
      if (!/^\s*\/\* ── \S.*? ──( \*\/)?$/.test(line)) hit(f, i + 1, "padded or malformed");
    });
  }
});

check("banner-html", "HTML banners are `<!-- ════ NAME ════ -->`", (hit) => {
  for (const f of HTML) {
    read(f).split("\n").forEach((raw, i) => {
      const line = raw.replace(/\r$/, "");
      if (!/<!--\s*[═─]/.test(line)) return;
      if (!/^\s*<!-- ════ [^a-z]+ ════( -->)?$/.test(line)) hit(f, i + 1, "malformed");
    });
  }
});

// ── Exports ────────────────────────────────────────────────────

check("unused-export", "Every export is imported somewhere", (hit) => {
  const exports = new Map();
  for (const f of JS) {
    const src = stripJsComments(read(f));
    for (const m of src.matchAll(/^export\s+(?:async\s+)?(?:const|let|function\*?|class)\s+(\w+)/gm)) {
      exports.set(`${f}#${m[1]}`, { f, name: m[1], line: lineOf(src, m.index) });
    }
    for (const m of src.matchAll(/^export\s*\{([^}]*)\}/gm)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop();
        if (name) exports.set(`${f}#${name}`, { f, name, line: lineOf(src, m.index) });
      }
    }
  }
  const used = new Set();
  for (const f of JS) {
    const src = stripJsComments(read(f));
    for (const m of src.matchAll(/import\s+([\s\S]*?)\s+from\s+["']([^"']+)["']/g)) {
      if (!m[2].startsWith(".")) continue;
      const target = path.resolve(path.dirname(f), m[2]);
      const spec = m[1];
      const ns = spec.match(/\*\s+as\s+(\w+)/);
      if (ns) {
        for (const u of src.matchAll(new RegExp(`\\b${ns[1]}\\.(\\w+)`, "g"))) used.add(`${target}#${u[1]}`);
      }
      const named = spec.match(/\{([^}]*)\}/);
      if (named) {
        for (const part of named[1].split(",")) {
          const name = part.trim().split(/\s+as\s+/)[0];
          if (name) used.add(`${target}#${name}`);
        }
      }
    }
    for (const m of src.matchAll(/\{([^{}]*)\}\s*=\s*await\s+import\(\s*["']([^"']+)["']\s*\)/g)) {
      const target = path.resolve(path.dirname(f), m[2]);
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s*:\s*/)[0];
        if (name) used.add(`${target}#${name}`);
      }
    }
  }
  for (const [key, e] of exports) {
    if (!used.has(key)) hit(e.f, e.line, `${e.name} is exported but never imported`);
  }
});

// ── Summary ────────────────────────────────────────────────────

let failed = 0;
for (const r of results) {
  const mark = r.hits.length ? "✗" : "✓";
  console.log(`${mark} ${r.name.padEnd(20)} ${r.rule}`);
  for (const h of r.hits) console.log(`    ${h.where}  ${h.msg}`);
  failed += r.hits.length;
}
console.log(failed ? `\n${failed} violation${failed === 1 ? "" : "s"}` : "\nclean");
process.exit(failed ? 1 : 0);
