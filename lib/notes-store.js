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

// CommonMark ATX: at most three spaces of indent, and a closing run of
// #s only counts when whitespace precedes it — "# C#" is titled "C#".
const HEADING_RE = /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

const EXCERPT_MAX = 120;
const SNIPPET_PAD = 45;

class BadIdError extends Error {}
class NotFoundError extends Error {}
class ConflictError extends Error {}

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

/**
 * Claim the next free id for the current second by creating its file.
 * The "wx" flag makes the claim atomic: two creates in the same second
 * cannot both win the same name.
 */
async function claimId(body) {
  const base = stamp();

  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    try {
      await fs.writeFile(notePath(id), body, { encoding: "utf8", flag: "wx" });
      return id;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
  throw new Error("Could not allocate a note id");
}

// ── Per-note queue ─────────────────────────────────────────────

// Two writes to one file at once can interleave into a body matching
// neither, and a write racing a delete can resurrect the note.
const queues = new Map();

function exclusive(id, fn) {
  const run  = (queues.get(id) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  queues.set(id, tail);
  tail.then(() => { if (queues.get(id) === tail) queues.delete(id); });
  return run;
}

// ── Derived fields ─────────────────────────────────────────────

/**
 * Title is the first non-empty line, but only when it is an ATX heading.
 * Returns null when the note is untitled — the client renders the
 * timestamp instead.
 */
function deriveTitle(body) {
  const first = body.split(/\r?\n/).find(line => line.trim().length);
  if (!first) return null;
  const m = first.match(HEADING_RE);
  return m ? m[1].trim() : null;
}

/** First meaningful line that is not the title heading. */
function deriveExcerpt(body) {
  const lines = body.split(/\r?\n/).filter(line => line.trim().length);
  if (!lines.length) return "";

  const start = HEADING_RE.test(lines[0]) ? 1 : 0;
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

/**
 * Every note with its body. A file deleted between readdir and read is
 * skipped rather than failing the whole scan.
 */
async function readAll() {
  const ids = await allIds();
  const all = await Promise.all(ids.map(async id => {
    try {
      return { id, ...(await readWithStat(id)) };
    } catch (err) {
      if (err.code !== "ENOENT") console.error(`Notes: skipped ${id}:`, err.message);
      return null;
    }
  }));
  return all.filter(Boolean);
}

// ── Operations ─────────────────────────────────────────────────

async function init() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  return NOTES_DIR;
}

/** Every note, newest first. Reads each file to derive title + excerpt. */
async function list() {
  const notes = (await readAll()).map(({ id, body, stat }) => summarise(id, body, stat));
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

/**
 * Replace a note's body. `base` is the mtime the caller last saw; when
 * given and the file has changed since, nothing is written. The body
 * lands via rename, so a crash mid-write leaves the old file intact.
 */
function write(id, body, base) {
  const file = notePath(id);

  return exclusive(id, async () => {
    let before;
    try {
      before = await fs.stat(file);
    } catch (err) {
      if (err.code === "ENOENT") throw new NotFoundError(id);
      throw err;
    }
    if (base && before.mtime.toISOString() !== base) throw new ConflictError(id);

    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, file);
    const stat = await fs.stat(file);
    return summarise(id, body, stat);
  });
}

async function create(body = "") {
  const id   = await claimId(body);
  const stat = await fs.stat(notePath(id));
  return summarise(id, body, stat);
}

function remove(id) {
  const file = notePath(id);

  return exclusive(id, async () => {
    try {
      await fs.unlink(file);
    } catch (err) {
      if (err.code === "ENOENT") throw new NotFoundError(id);
      throw err;
    }
  });
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

  const hits = (await readAll()).map(({ id, body, stat }) => {
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
  });

  return hits.filter(Boolean).sort((a, b) => b.mtime.localeCompare(a.mtime));
}

module.exports = {
  NOTES_DIR, NOTES_TZ,
  BadIdError, NotFoundError, ConflictError,
  init, list, read, write, create, remove, search,
  isValidId, deriveTitle, deriveExcerpt, stamp,
};
