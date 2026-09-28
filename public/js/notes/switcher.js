// ═══════════════════════════════════════════════════════════════
//  SWITCHER — every note, search, and the folders
// ═══════════════════════════════════════════════════════════════
//
//  A native <dialog>, so Escape, the top layer and handing focus back
//  come from the browser. Ctrl+K opens it from anywhere, the editor
//  included.
//
//  Rows are built with DOM methods, never innerHTML: titles, excerpts
//  and search snippets all come straight out of note bodies.

import * as api     from "./api.js";
import * as library from "./library.js";
import * as store   from "../store.js";
import { KEYS }     from "../store.js";
import { displayTitle, isUntitled, formatEdited } from "./format.js";
import { PLUS } from "../icons.js";
import { beginInlineEdit } from "../inline-edit.js";

const PIN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`;

const dialogEl  = document.getElementById("noteSwitcher");
const searchEl  = document.getElementById("notesSearch");
const foldersEl = document.getElementById("notesFolders");
const listEl    = document.getElementById("notesList");
const openBtn   = document.getElementById("switcherOpen");

const SEARCH_DEBOUNCE_MS = 150;

let viewed      = null;   // folder name, or null for All
let results     = null;   // search results, or null when not searching
let failed      = false;
let notice      = "";     // a one-off message in place of the empty list's
let selected    = 0;
let searchSeq   = 0;
let searchTimer = null;
let onOpen      = () => {};
let onCreate    = () => {};
let onError     = () => {};
let onRenamed   = () => {};

function query() {
  return searchEl.value.trim();
}

function rows() {
  const source = results ?? library.all();
  return viewed === null ? source : source.filter(n => n.folder === viewed);
}

// ── Match highlighting ─────────────────────────────────────────

/**
 * Text with every occurrence of `q` wrapped in <mark>, built as a
 * fragment so note content is never parsed as markup.
 */
function highlighted(text, q) {
  const frag = document.createDocumentFragment();
  if (!q) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }

  const haystack = text.toLowerCase();
  const needle   = q.toLowerCase();
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) break;

    if (at > from) frag.appendChild(document.createTextNode(text.slice(from, at)));
    const mark = document.createElement("mark");
    mark.textContent = text.slice(at, at + needle.length);
    frag.appendChild(mark);
    from = at + needle.length;
  }

  if (from < text.length) frag.appendChild(document.createTextNode(text.slice(from)));
  return frag;
}

// ── Rows ───────────────────────────────────────────────────────

function span(className, content) {
  const el = document.createElement("span");
  el.className = className;
  if (content instanceof Node) el.appendChild(content);
  else el.textContent = content;
  return el;
}

function buildRow(index, glyph, text, meta) {
  const row = document.createElement("button");
  row.type          = "button";
  row.className     = "notes__row";
  row.dataset.index = index;

  const mark = span("notes__row-glyph", "");
  mark.innerHTML = glyph;

  row.append(mark, text, meta);
  row.addEventListener("click", () => choose(index));
  row.addEventListener("pointermove", () => select(index));
  return row;
}

function noteRow(note, index, q) {
  const text = span("notes__row-text", "");
  const title = span("notes__row-title", highlighted(displayTitle(note), q));
  title.classList.toggle("untitled", isUntitled(note));

  // A body match shows the words around it; otherwise the note's
  // usual opening line.
  const secondary = note.snippet ?? note.excerpt ?? "";
  const excerpt = span("notes__row-excerpt", secondary ? highlighted(secondary, q) : "Empty note");
  text.append(title, excerpt);

  const meta = span("notes__row-meta", "");
  if (viewed === null && note.folder) meta.append(span("notes__row-folder", note.folder));
  meta.append(span("notes__row-edited", formatEdited(note.mtime)));

  return buildRow(index, library.isPinned(note.id) ? PIN : "", text, meta);
}

function newRow(index, q) {
  const text = span("notes__row-text", "");
  text.append(span("notes__row-title", q ? `New note “${q}”` : "New note"));
  const row = buildRow(index, PLUS, text, span("notes__row-meta", viewed ?? ""));
  row.classList.add("notes__row--new");
  return row;
}

function emptyMessage(q, count) {
  if (notice) return notice;
  if (failed) return "Search failed — try again.";
  if (count) return "";
  if (results) return viewed === null ? `Nothing matches “${q}”.` : `Nothing in ${viewed} matches “${q}”.`;
  if (viewed !== null) return `No notes in ${viewed}`;
  return "No notes yet.";
}

function renderList() {
  const q    = results ? query() : "";
  const list = rows();
  if (selected > list.length) selected = list.length;

  listEl.textContent = "";
  const message = emptyMessage(q, list.length);
  if (message) {
    const empty = document.createElement("p");
    empty.className   = "notes__empty";
    empty.textContent = message;
    if (!notice && !results && viewed !== null && !list.length) {
      const remove = document.createElement("button");
      remove.type        = "button";
      remove.className   = "notes__empty-action";
      remove.textContent = "Delete folder";
      remove.addEventListener("click", () => deleteFolder(viewed));
      empty.append(" · ", remove);
    }
    listEl.appendChild(empty);
  }

  list.forEach((note, i) => listEl.appendChild(noteRow(note, i, q)));
  listEl.appendChild(newRow(list.length, query()));
  select(selected);
}

function select(index) {
  selected = index;
  for (const row of listEl.querySelectorAll(".notes__row")) {
    row.classList.toggle("is-selected", Number(row.dataset.index) === index);
  }
}

function move(by) {
  const count = rows().length + 1;
  select((selected + by + count) % count);
  listEl.querySelector(".notes__row.is-selected")?.scrollIntoView({ block: "nearest" });
}

function choose(index) {
  const list = rows();
  dialogEl.close();
  if (index < list.length) onOpen(list[index].id);
  else onCreate(query() ? `# ${query()}\n\n` : "", viewed ?? "");
}

// ── Folders ────────────────────────────────────────────────────

function buildPill(label, folder) {
  const pill = document.createElement("button");
  pill.type        = "button";
  pill.className   = "notes__folder";
  pill.textContent = label;
  pill.setAttribute("aria-pressed", String(folder === viewed));
  if (folder !== null && folder === viewed) pill.title = `Rename ${folder}`;
  pill.addEventListener("click", () => {
    if (folder !== null && folder === viewed) startRename(pill, folder);
    else view(folder);
  });
  return pill;
}

function renderFolders() {
  const folders = library.folderNames();
  foldersEl.hidden = !folders.length;
  foldersEl.replaceChildren(...(folders.length
    ? [buildPill("All", null), ...folders.map(f => buildPill(f, f))]
    : []));
}

/** Show one folder's notes, or every note for null. */
function view(folder) {
  viewed   = folder;
  notice   = "";
  selected = 0;
  store.set(KEYS.notesFolder, folder);
  renderFolders();
  renderList();
  searchEl.focus();
}

function startRename(pill, folder) {
  beginInlineEdit({
    target:    pill,
    value:     folder,
    className: "notes__folder notes__folder-input",
    maxLength: 64,
    onCommit:  (next) => renameFolder(folder, next),
    restore:   () => renderFolders(),
  });
}

/** Resolves to the server's refusal, or "" once it's handled. */
async function renameFolder(from, to) {
  let outcome;
  try {
    outcome = await library.renameFolder(from, to);
  } catch (err) {
    console.error("Folder rename failed:", err);
    onError("Could not rename that folder");
    return "";
  }
  if (outcome.refusal) return outcome.refusal;

  // Before the refresh, which would otherwise find the viewed folder
  // gone and fall back to All.
  if (viewed === from) {
    viewed = outcome.name;
    store.set(KEYS.notesFolder, outcome.name);
  }
  onRenamed(from, outcome.name);
  await library.refreshQuietly();
  return "";
}

async function deleteFolder(folder) {
  let gone;
  try {
    gone = await library.deleteFolder(folder);
  } catch (err) {
    console.error("Folder delete failed:", err);
    onError("Could not delete that folder");
    return;
  }
  if (gone) {
    view(null);
    return;
  }
  if (viewed === folder && !rows().length) {
    notice = `${folder} has files in it that Notes doesn't show, so it stays.`;
    renderList();
  }
}

// ── Search ─────────────────────────────────────────────────────

async function runSearch() {
  clearTimeout(searchTimer);
  searchTimer = null;
  const q   = query();
  const seq = ++searchSeq;

  notice = "";
  failed = false;
  if (!q) {
    results = null;
  } else {
    try {
      const found = await api.searchNotes(q);
      if (seq !== searchSeq) return;
      results = found;
    } catch (err) {
      if (seq !== searchSeq) return;
      console.error("Search failed:", err);
      results = [];
      failed  = true;
    }
  }
  selected = 0;
  renderList();
}

// ── Open and close ─────────────────────────────────────────────

function open() {
  if (dialogEl.open) return;
  if (viewed !== null && !library.folderNames().includes(viewed)) {
    viewed = null;
    store.remove(KEYS.notesFolder);
  }

  searchEl.value = "";
  results  = null;
  failed   = false;
  notice   = "";
  selected = 0;
  renderFolders();
  renderList();
  dialogEl.showModal();
  searchEl.focus();
}

/** Repaint after the library changes. Nothing to do while it's shut. */
export function render() {
  if (!dialogEl.open) return;
  renderFolders();
  renderList();
}

// ── Init ───────────────────────────────────────────────────────

export function initSwitcher(handlers = {}) {
  onOpen    = handlers.onOpen    ?? onOpen;
  onCreate  = handlers.onCreate  ?? onCreate;
  onError   = handlers.onError   ?? onError;
  onRenamed = handlers.onRenamed ?? onRenamed;

  viewed = store.str(KEYS.notesFolder, null);

  openBtn.addEventListener("click", open);

  // Capture, so the editor never sees the chord first.
  document.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== "k") return;
    e.preventDefault();
    if (dialogEl.open) dialogEl.close();
    else open();
  }, { capture: true });

  // A click on the backdrop lands on the dialog itself.
  dialogEl.addEventListener("click", (e) => {
    if (e.target === dialogEl) dialogEl.close();
  });

  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  });

  searchEl.addEventListener("keydown", async (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); move(1); }
    if (e.key === "ArrowUp")   { e.preventDefault(); move(-1); }
    if (e.key === "Enter") {
      e.preventDefault();
      // Enter inside the debounce means the rows on screen are for the
      // query before the last keystroke.
      if (searchTimer) await runSearch();
      choose(selected);
    }
  });
}
