// ═══════════════════════════════════════════════════════════════
//  NOTES STORE — filesystem layer
// ═══════════════════════════════════════════════════════════════
//
//  Filenames never change. The display title is derived from the body
//  at read time, so retitling a note is just editing its first line.
//  A note lives in the root or one folder below it, and its id is the
//  bare timestamp either way; the folder is looked up, never encoded.

const fs   = require("fs/promises");
const path = require("path");

const NOTES_DIR = path.resolve(process.env.NOTES_DIR || "./notes");
const NOTES_TZ  = process.env.NOTES_TZ  || "Asia/Bangkok";

// The only shape a note id may take. No dots, no separators, so a
// validated id cannot escape NOTES_DIR when joined. The optional -N
// suffix disambiguates notes created within the same second.
const ID_RE = /^\d{8}-\d{6}(-\d+)?$/;

// No dot and no separator anywhere, so a validated name is one path
// segment that is never "." or "..". Marks are allowed after the first
// character because Thai vowels and tones are marks, not letters.
const FOLDER_RE = /^(?=.{1,64}$)[\p{L}\p{N}_-][\p{L}\p{M}\p{N} _-]*(?<! )$/u;

// CommonMark ATX: at most three spaces of indent, and a closing run of
// #s only counts when whitespace precedes it — "# C#" is titled "C#".
const HEADING_RE = /^ {0,3}#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/;

const EXCERPT_MAX = 120;
const SNIPPET_PAD = 45;

class StoreError extends Error {
  constructor(message, detail) {
    super(message);
    this.detail = detail;
  }
}
class BadIdError extends StoreError {}
class NotFoundError extends StoreError {}
class ConflictError extends StoreError {}

// ── Paths ──────────────────────────────────────────────────────

function isValidId(id) {
  return typeof id === "string" && ID_RE.test(id);
}

function isValidFolder(name) {
  return typeof name === "string" && FOLDER_RE.test(name);
}

/**
 * Resolve a folder name to an absolute path, refusing anything that
 * does not match FOLDER_RE. "" is the root. This and notePath() are
 * the only functions that build a path; nothing else may join user
 * input onto NOTES_DIR.
 */
function folderPath(folder) {
  if (folder === "") return NOTES_DIR;
  if (!isValidFolder(folder)) {
    throw new BadIdError(`Invalid folder: ${folder}`, "Invalid folder name");
  }

  const full = path.join(NOTES_DIR, folder);

  // Belt and braces, as in notePath().
  if (path.dirname(full) !== NOTES_DIR) {
    throw new BadIdError(`Folder escapes notes directory: ${folder}`, "Invalid folder name");
  }
  return full;
}

function notePath(id, folder) {
  if (!isValidId(id)) throw new BadIdError(`Invalid note id: ${id}`);

  const dir  = folderPath(folder);
  const full = path.join(dir, `${id}.md`);

  // Belt and braces. ID_RE already makes this unreachable, but the cost
  // of being wrong here is arbitrary file read/write.
  if (path.dirname(full) !== dir) {
    throw new BadIdError(`Path escapes notes directory: ${id}`);
  }
  return full;
}

async function exists(file) {
  try {
    await fs.lstat(file);
    return true;
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

/** folderPath() for a folder the caller names, where "" is not the root. */
function namedFolderPath(name) {
  if (name === "") throw new BadIdError("Empty folder name", "Invalid folder name");
  return folderPath(name);
}

function folderMissing(name) {
  return new NotFoundError(`No folder: ${name}`, "Folder not found");
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
 * Ids are unique across every folder, which "wx" alone cannot see, so
 * the caller holds the tree lock and passes the scan it just made.
 */
async function claimId(body, folder, taken) {
  const base = stamp();

  for (let n = 1; n < 1000; n++) {
    const id = n === 1 ? base : `${base}-${n}`;
    if (taken.has(id)) continue;
    try {
      await fs.writeFile(notePath(id, folder), body, { encoding: "utf8", flag: "wx" });
      return id;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }
  }
  throw new Error("Could not allocate a note id");
}

// ── Queues ─────────────────────────────────────────────────────

// Two writes to one file at once can interleave into a body matching
// neither, and a write racing a delete can resurrect the note.
const queues = new Map();

// Anything that changes which folders exist or where a note lives
// takes this first, then any note queues it needs, never the reverse.
const TREE = Symbol("tree");

function exclusive(key, fn) {
  const run  = (queues.get(key) ?? Promise.resolve()).then(fn);
  const tail = run.catch(() => {});
  queues.set(key, tail);
  tail.then(() => { if (queues.get(key) === tail) queues.delete(key); });
  return run;
}

/** Run fn once every id's queue has drained, holding them all. */
function exclusiveAll(ids, fn) {
  if (!ids.length) return fn();
  const [first, ...rest] = ids;
  return exclusive(first, () => exclusiveAll(rest, fn));
}

// ── Scan ───────────────────────────────────────────────────────

// id → folder, as of the last scan plus this process's own changes.
// It can go stale behind an outside edit, so a miss rescans once.
let folderOf = new Map();

const byName = (a, b) => a.localeCompare(b);

function sameName(a, b) {
  return a.toLowerCase() === b.toLowerCase();
}

/**
 * The root and its immediate subdirectories, nothing deeper. Dirent
 * types are lstat's, so a symlinked folder or note is skipped rather
 * than followed out of NOTES_DIR. When one id sits in two places the
 * root wins, then folders by name; the rest are conflicts, reported
 * and never touched.
 */
async function scan() {
  const top     = await fs.readdir(NOTES_DIR, { withFileTypes: true });
  const folders = top
    .filter(d => d.isDirectory() && isValidFolder(d.name))
    .map(d => d.name)
    .sort(byName);

  const listed = await Promise.all(folders.map(async folder => {
    try {
      return { folder, dirents: await fs.readdir(folderPath(folder), { withFileTypes: true }) };
    } catch (err) {
      if (err.code !== "ENOENT") console.error(`Notes: skipped folder ${folder}:`, err.message);
      return null;
    }
  }));

  const map       = new Map();
  const conflicts = [];
  for (const { folder, dirents } of [{ folder: "", dirents: top }, ...listed.filter(Boolean)]) {
    for (const d of dirents) {
      if (!d.isFile() || !d.name.endsWith(".md")) continue;
      const id = d.name.slice(0, -3);
      if (!isValidId(id)) continue;
      if (map.has(id)) conflicts.push({ id, folder });
      else map.set(id, folder);
    }
  }

  folderOf = map;
  return { folders: listed.filter(Boolean).map(l => l.folder), conflicts, map };
}

/**
 * Run fn against a note's current file. A stale map sends fn to a path
 * that is gone, so one ENOENT rescans and retries at the new place.
 */
async function atNote(id, fn) {
  if (!isValidId(id)) throw new BadIdError(`Invalid note id: ${id}`);
  if (!folderOf.has(id)) await scan();
  if (!folderOf.has(id)) throw new NotFoundError(id);

  const first = folderOf.get(id);
  try {
    return await fn(notePath(id, first), first);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;
  }

  await scan();
  const now = folderOf.get(id);
  if (now === undefined || now === first) throw new NotFoundError(id);
  try {
    return await fn(notePath(id, now), now);
  } catch (err) {
    if (err.code === "ENOENT") throw new NotFoundError(id);
    throw err;
  }
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

function summarise(id, folder, body, stat) {
  return {
    id,
    folder,
    title:   deriveTitle(body),
    excerpt: deriveExcerpt(body),
    mtime:   stat.mtime.toISOString(),
  };
}

async function readWithStat(file) {
  const [body, stat] = await Promise.all([
    fs.readFile(file, "utf8"),
    fs.stat(file),
  ]);
  return { body, stat };
}

/**
 * Every note with its body. A file deleted between scan and read is
 * skipped rather than failing the whole scan.
 */
async function readAll() {
  const { folders, conflicts, map } = await scan();
  const all = await Promise.all([...map].map(async ([id, folder]) => {
    try {
      return { id, folder, ...(await readWithStat(notePath(id, folder))) };
    } catch (err) {
      if (err.code !== "ENOENT") console.error(`Notes: skipped ${id}:`, err.message);
      return null;
    }
  }));
  return { folders, conflicts, all: all.filter(Boolean) };
}

const newestFirst = (a, b) => b.mtime.localeCompare(a.mtime);

// ── Notes ──────────────────────────────────────────────────────

async function init() {
  await fs.mkdir(NOTES_DIR, { recursive: true });
  return NOTES_DIR;
}

/** Every folder and note, newest first. Reads each file to derive title + excerpt. */
async function list() {
  const { folders, conflicts, all } = await readAll();
  const notes = all.map(({ id, folder, body, stat }) => summarise(id, folder, body, stat));
  return { folders, notes: notes.sort(newestFirst), conflicts };
}

function read(id) {
  return atNote(id, async (file, folder) => {
    const { body, stat } = await readWithStat(file);
    return { ...summarise(id, folder, body, stat), body };
  });
}

/**
 * Replace a note's body. `base` is the mtime the caller last saw; when
 * given and the file has changed since, nothing is written. The body
 * lands via rename, so a crash mid-write leaves the old file intact.
 * The path is resolved inside the queue: a move or folder rename
 * queued ahead of this write changes it.
 */
function write(id, body, base) {
  return exclusive(id, () => atNote(id, async (file, folder) => {
    const before = await fs.stat(file);
    if (base && before.mtime.toISOString() !== base) throw new ConflictError(id);

    const tmp = `${file}.tmp`;
    await fs.writeFile(tmp, body, "utf8");
    await fs.rename(tmp, file);
    const stat = await fs.stat(file);
    return summarise(id, folder, body, stat);
  }));
}

function create(body = "", folder = "") {
  folderPath(folder);

  return exclusive(TREE, async () => {
    const { folders, map } = await scan();
    if (folder && !folders.includes(folder)) throw folderMissing(folder);

    const id = await claimId(body, folder, map);
    folderOf.set(id, folder);
    const stat = await fs.stat(notePath(id, folder));
    return summarise(id, folder, body, stat);
  });
}

function remove(id) {
  return exclusive(id, async () => {
    await atNote(id, file => fs.unlink(file));
    folderOf.delete(id);
  });
}

/**
 * Move a note to another folder, "" for the root. A rename keeps the
 * id and the mtime, so an open editor's next save still matches base.
 */
function move(id, folder) {
  folderPath(folder);

  return exclusive(TREE, () => exclusive(id, async () => {
    if (folder && !(await isFolder(folder))) throw folderMissing(folder);

    return atNote(id, async (file, from) => {
      if (from !== folder) {
        const dest = notePath(id, folder);
        if (await exists(dest)) throw new ConflictError(id, "A note with this id is already there");
        await fs.rename(file, dest);
        folderOf.set(id, folder);
        file = dest;
      }
      const { body, stat } = await readWithStat(file);
      return summarise(id, folder, body, stat);
    });
  }));
}

/**
 * Case-insensitive substring search across titles and bodies, in every
 * folder.
 *
 * Substring rather than word-boundary matching: Thai has no inter-word
 * spaces, so word boundaries would never match it.
 */
async function search(query) {
  const q = (query || "").trim().toLowerCase();
  if (!q) return [];

  const hits = (await readAll()).all.map(({ id, folder, body, stat }) => {
    const base      = summarise(id, folder, body, stat);
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

  return hits.filter(Boolean).sort(newestFirst);
}

// ── Folders ────────────────────────────────────────────────────

async function isFolder(folder) {
  try {
    return (await fs.lstat(folderPath(folder))).isDirectory();
  } catch (err) {
    if (err.code === "ENOENT") return false;
    throw err;
  }
}

function assertNewName(folders, name, except) {
  if (folders.some(f => f !== except && sameName(f, name))) {
    throw new ConflictError(`Folder exists: ${name}`, "A folder with that name already exists");
  }
}

function createFolder(name) {
  name = typeof name === "string" ? name.normalize("NFC") : name;
  const dir = namedFolderPath(name);

  return exclusive(TREE, async () => {
    assertNewName((await scan()).folders, name);
    try {
      await fs.mkdir(dir);
    } catch (err) {
      if (err.code === "EEXIST") throw new ConflictError(`Exists: ${name}`, "A folder with that name already exists");
      throw err;
    }
    return { name };
  });
}

/**
 * Rename a folder once every note in it has finished its queued work,
 * so no write resolves a path under the old name after it is gone.
 */
function renameFolder(from, to) {
  to = typeof to === "string" ? to.normalize("NFC") : to;
  const src = namedFolderPath(from);
  const dst = namedFolderPath(to);

  return exclusive(TREE, async () => {
    const { folders, map } = await scan();
    if (!folders.includes(from)) throw folderMissing(from);
    if (to === from) return { name: to };
    assertNewName(folders, to, from);
    // Linux rename() silently replaces an empty directory.
    if (!sameName(from, to) && await exists(dst)) {
      throw new ConflictError(`Exists: ${to}`, "A folder with that name already exists");
    }

    const ids = [...map].filter(([, f]) => f === from).map(([id]) => id).sort();
    await exclusiveAll(ids, async () => {
      await fs.rename(src, dst);
      ids.forEach(id => folderOf.set(id, to));
    });
    return { name: to };
  });
}

/** rmdir refuses a non-empty directory, so only an empty folder goes. */
function removeFolder(name) {
  const dir = namedFolderPath(name);

  return exclusive(TREE, async () => {
    try {
      await fs.rmdir(dir);
    } catch (err) {
      if (err.code === "ENOENT" || err.code === "ENOTDIR") throw folderMissing(name);
      if (err.code === "ENOTEMPTY" || err.code === "EEXIST") {
        throw new ConflictError(`Not empty: ${name}`, "Folder isn't empty");
      }
      throw err;
    }
  });
}

module.exports = {
  NOTES_DIR, NOTES_TZ,
  BadIdError, NotFoundError, ConflictError,
  init, list, read, write, create, remove, move, search,
  createFolder, renameFolder, removeFolder,
  isValidId, isValidFolder, deriveTitle, deriveExcerpt, stamp,
};
