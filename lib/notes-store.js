// ═══════════════════════════════════════════════════════════════
//  NOTES STORE — filesystem layer
// ═══════════════════════════════════════════════════════════════
//
//  Filenames never change. The display title is derived from the body
//  at read time, so retitling a note is just editing its first line.

const fs   = require("fs/promises");
const path = require("path");

const NOTES_DIR = path.resolve(process.env.NOTES_DIR || "./notes");
const NOTES_TZ  = process.env.NOTES_TZ  || "Asia/Bangkok";

// The only shape a note id may take. No dots, no separators, so a
// validated id cannot escape NOTES_DIR when joined. The optional -N
// suffix disambiguates notes created within the same second.
const ID_RE = /^\d{8}-\d{6}(-\d+)?$/;

const EXCERPT_MAX = 120;
const SNIPPET_PAD = 45;

class BadIdError extends Error {}
class NotFoundError extends Error {}

// ── Paths ──────────────────────────────────────────────────────

function isValidId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

/**
 * Resolve an id to an absolute path, refusing anything that does not
 * match ID_RE. This is the only function that builds a note path;
 * nothing else may join user input onto NOTES_DIR.
 */
function notePath(id) {
  if (!isValidId(id)) throw new BadIdError(`Invalid note id: ${id}`);

  const full = path.join(NOTES_DIR, `${id}.md`);

  // Belt and braces. ID_RE already makes this unreachable, but the cost
  // of being wrong here is arbitrary file read/write.
  if (path.dirname(full) !== NOTES_DIR) {
    throw new BadIdError(`Path escapes notes directory: ${id}`);
  }
  return full;
}

// ── Ids ────────────────────────────────────────────────────────

/**
 * Timestamp in NOTES_TZ, formatted YYYYMMDD-HHmmss.
 *
 * Uses Intl with an explicit timeZone rather than the TZ env var:
 * node:18-alpine ships without tzdata, so process.env.TZ would silently
 * fall back to UTC and file names would be seven hours out.
 */
function stamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone:  NOTES_TZ,
    year:  "numeric", month:  "2-digit", day:    "2-digit",
    hour:  "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).reduce((acc, p) => (acc[p.type] = p.value, acc), {});

  return `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/** Next free id for the current second. */
async function nextId() {
  const base = stamp();
  if (!(await exists(path.join(NOTES_DIR, `${base}.md`)))) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await exists(path.join(NOTES_DIR, `${candidate}.md`)))) return candidate;
  }
  throw new Error("Could not allocate a note id");
}

// ── Derived fields ─────────────────────────────────────────────

/**
 * Title is the first non-empty line, but only when it is an ATX heading.
 * Returns null when the note is untitled — the client renders the
 * timestamp instead.
 */
function deriveTitle(body) {
  const first = body.split("\n").find(line => line.trim().length);
  if (!first) return null;
  const m = first.match(/^\s*#{1,6}\s+(.+?)\s*#*\s*$/);
  return m ? m[1].trim() : null;
}

/** First meaningful line that is not the title heading. */
function deriveExcerpt(body) {
  const lines = body.split("\n").filter(line => line.trim().length);
  if (!lines.length) return "";

  const start = /^\s*#{1,6}\s+/.test(lines[0]) ? 1 : 0;
  const line  = lines[start];
  if (!line) return "";

  const clean = line.trim().replace(/^[#>\-*+]\s*/, "");
  return clean.length > EXCERPT_MAX
    ? clean.slice(0, EXCERPT_MAX).trimEnd() + "…"
    : clean;
}

function summarise(id, body, stat) {
  return {
    id,
    title:   deriveTitle(body),
    excerpt: deriveExcerpt(body),
    mtime:   stat.mtime.toISOString(),
  };
}

/** Ids of every .md file in the directory, unsorted. */
async function allIds() {
  const entries = await fs.readdir(NOTES_DIR);
  return entries
    .filter(name => name.endsWith(".md"))
    .map(name => name.slice(0, -3))
    .filter(isValidId);
}

async function readWithStat(id) {
  const file = notePath(id);
  const [body, stat] = await Promise.all([
    fs.readFile(file, "utf8"),
    fs.stat(file),
  ]);
  return { body, stat };
}

// ── Operations ─────────────────────────────────────────────────

async function init() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  return NOTES_DIR;
}

/** Every note, newest first. Reads each file to derive title + excerpt. */
async function list() {
  const ids   = await allIds();
  const notes = await Promise.all(ids.map(async id => {
    const { body, stat } = await readWithStat(id);
    return summarise(id, body, stat);
  }));

  return notes.sort((a, b) => b.mtime.localeCompare(a.mtime));
}

async function read(id) {
  try {
    const { body, stat } = await readWithStat(id);
    return { ...summarise(id, body, stat), body };
  } catch (err) {
    if (err.code === "ENOENT") throw new NotFoundError(id);
    throw err;
  }
}

async function write(id, body) {
  const file = notePath(id);
  if (!(await exists(file))) throw new NotFoundError(id);

  await fs.writeFile(file, body, "utf8");
  const stat = await fs.stat(file);
  return summarise(id, body, stat);
}

async function create(body = "") {
  const id   = await nextId();
  const file = notePath(id);
  await fs.writeFile(file, body, "utf8");
  const stat = await fs.stat(file);
  return summarise(id, body, stat);
}

async function remove(id) {
  try {
    await fs.unlink(notePath(id));
  } catch (err) {
    if (err.code === "ENOENT") throw new NotFoundError(id);
    throw err;
  }
}

/**
 * Case-insensitive substring search across titles and bodies.
 *
 * Substring rather than word-boundary matching: Thai has no inter-word
 * spaces, so word boundaries would never match it.
 */
async function search(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const ids  = await allIds();
  const hits = await Promise.all(ids.map(async id => {
    const { body, stat } = await readWithStat(id);

    const base      = summarise(id, body, stat);
    const inTitle   = base.title ? base.title.toLowerCase().includes(q) : false;
    const bodyIndex = body.toLowerCase().indexOf(q);

    if (!inTitle && bodyIndex === -1) return null;

    // Body matches show their surrounding context instead of the
    // note's usual opening excerpt.
    let snippet = null;
    if (!inTitle && bodyIndex !== -1) {
      const from = Math.max(0, bodyIndex - SNIPPET_PAD);
      const to   = Math.min(body.length, bodyIndex + q.length + SNIPPET_PAD);
      snippet = (from > 0 ? "…" : "")
              + body.slice(from, to).replace(/\s+/g, " ").trim()
              + (to < body.length ? "…" : "");
    }

    return { ...base, where: inTitle ? "title" : "body", snippet };
  }));

  return hits.filter(Boolean).sort((a, b) => b.mtime.localeCompare(a.mtime));
}

module.exports = {
  NOTES_DIR, NOTES_TZ,
  BadIdError, NotFoundError,
  init, list, read, write, create, remove, search,
  isValidId, deriveTitle, deriveExcerpt, stamp,
};
