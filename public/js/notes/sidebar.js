// ═══════════════════════════════════════════════════════════════
//  SIDEBAR — note list, search, selection, create and delete
// ═══════════════════════════════════════════════════════════════
//
//  Rows are built with DOM methods, never innerHTML: titles, excerpts
//  and search snippets all come straight out of note bodies.
//
//  Autosave updates a row in place rather than reloading the list.
//  Re-sorting on every keystroke would make the row you are editing
//  jump under the cursor; the order settles on the next full refresh.

import * as api   from "./api.js";
import * as store from "../store.js";
import { KEYS }   from "../store.js";
import { displayTitle, isUntitled, formatCreated } from "./format.js";

const listEl     = document.getElementById("notesList");
const newBtn     = document.getElementById("noteNew");
const searchEl   = document.getElementById("notesSearch");
const layoutEl   = document.querySelector(".notes__layout");
const collapseBtn = document.getElementById("sidebarToggle");

const SEARCH_DEBOUNCE_MS = 150;

let notes       = [];   // full list, newest first
let results     = null; // search results, or null when not searching
let selectedId  = null;
let searchTimer = null;
let onSelect    = () => {};
let onDelete    = () => {};

function visibleNotes() {
  return results ?? notes;
}

// ── Match highlighting ───────────────────────────────────────────

/**
 * Text with every occurrence of `query` wrapped in <mark>, built as a
 * fragment so note content is never parsed as markup.
 */
function highlighted(text, query) {
  const frag = document.createDocumentFragment();
  if (!query) {
    frag.appendChild(document.createTextNode(text));
    return frag;
  }

  const haystack = text.toLowerCase();
  const needle   = query.toLowerCase();
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

// ── Rendering ────────────────────────────────────────────────────

function buildRow(note, query) {
  const row = document.createElement("button");
  row.type       = "button";
  row.className  = "notes__row" + (note.id === selectedId ? " active" : "");
  row.dataset.id = note.id;

  const title = document.createElement("span");
  title.className = "notes__row-title" + (isUntitled(note) ? " untitled" : "");
  title.appendChild(highlighted(displayTitle(note), query));

  // A body match shows its surrounding context; otherwise the note's
  // usual opening line.
  const secondary = note.snippet ?? note.excerpt ?? "";
  const excerpt = document.createElement("span");
  excerpt.className = "notes__row-excerpt";
  if (secondary) {
    excerpt.appendChild(highlighted(secondary, query));
  } else {
    excerpt.textContent = "Empty note";
  }

  const remove = document.createElement("span");
  remove.className = "notes__row-remove";
  remove.setAttribute("role", "button");
  remove.setAttribute("aria-label", `Delete ${displayTitle(note)}`);
  remove.innerHTML = `<svg style="transform:rotate(45deg)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
  remove.addEventListener("click", (e) => {
    e.stopPropagation();
    confirmDelete(note);
  });

  row.append(title, excerpt, remove);
  row.addEventListener("click", () => select(note.id));
  return row;
}

function renderEmpty(message) {
  const empty = document.createElement("p");
  empty.className   = "notes__empty";
  empty.textContent = message;
  listEl.appendChild(empty);
}

function render() {
  const query = searchEl.value.trim();
  listEl.textContent = "";

  const rows = visibleNotes();

  if (!rows.length) {
    renderEmpty(results
      ? `Nothing matches “${query}”.`
      : "No notes yet — start one above.");
    return;
  }

  rows.forEach(note => listEl.appendChild(buildRow(note, results ? query : "")));
}

/**
 * Refresh one row's text without rebuilding or reordering the list.
 * Called after every autosave.
 */
export function updateRow(summary) {
  const index = notes.findIndex(n => n.id === summary.id);
  if (index !== -1) notes[index] = { ...notes[index], ...summary };

  // While searching, the visible row belongs to the results set.
  if (results) {
    const r = results.findIndex(n => n.id === summary.id);
    if (r !== -1) results[r] = { ...results[r], ...summary };
  }

  const row = listEl.querySelector(`.notes__row[data-id="${summary.id}"]`);
  if (!row) return;

  const note  = (results ?? notes).find(n => n.id === summary.id);
  const title = row.querySelector(".notes__row-title");
  title.textContent = "";
  title.appendChild(document.createTextNode(displayTitle(note)));
  title.classList.toggle("untitled", isUntitled(note));

  const excerpt = row.querySelector(".notes__row-excerpt");
  excerpt.textContent = note.excerpt || "Empty note";
}

// ── Selection ────────────────────────────────────────────────────

function markActive() {
  listEl.querySelectorAll(".notes__row").forEach(row => {
    row.classList.toggle("active", row.dataset.id === selectedId);
  });
}

export async function select(id) {
  if (id === selectedId) return;
  selectedId = id;
  markActive();
  await onSelect(id);
}

// ── Search ───────────────────────────────────────────────────────

async function runSearch() {
  const query = searchEl.value.trim();

  if (!query) {
    results = null;
    render();
    return;
  }

  try {
    results = await api.searchNotes(query);
    render();
  } catch (err) {
    console.error("Search failed:", err);
    results = [];
    render();
  }
}

function clearSearch() {
  searchEl.value = "";
  results = null;
  render();
}

// ── Mutations ────────────────────────────────────────────────────

export async function refresh({ keepSelection = true } = {}) {
  notes = await api.listNotes();

  if (!keepSelection || !notes.some(n => n.id === selectedId)) {
    selectedId = notes[0]?.id ?? null;
  }
  render();
  return selectedId;
}

async function createNote() {
  // A new note can never match the active query, so drop out of search
  // rather than creating something the list then refuses to show.
  clearSearch();

  const summary = await api.createNote("");
  notes.unshift(summary);
  selectedId = summary.id;
  render();
  await onSelect(summary.id);
}

async function confirmDelete(note) {
  const label = isUntitled(note) ? formatCreated(note.id) : note.title;
  if (!window.confirm(`Delete “${label}”? This cannot be undone.`)) return;

  await api.deleteNote(note.id);
  const wasSelected = note.id === selectedId;

  notes = notes.filter(n => n.id !== note.id);
  if (results) results = results.filter(n => n.id !== note.id);
  if (wasSelected) selectedId = visibleNotes()[0]?.id ?? null;
  render();

  await onDelete(selectedId);
}

// ── Collapse ─────────────────────────────────────────────────────

// The sidebar collapses to a rail rather than to nothing, so this
// button survives its own click and is the only way back.
function applyCollapsed(collapsed) {
  layoutEl.classList.toggle("notes__layout--sidebar-collapsed", collapsed);

  const label = collapsed ? "Expand note list" : "Collapse note list";
  collapseBtn.setAttribute("aria-expanded", String(!collapsed));
  collapseBtn.setAttribute("aria-label", label);
  collapseBtn.title = label;
}

// ── Init ─────────────────────────────────────────────────────────

export function initSidebar(handlers = {}) {
  onSelect = handlers.onSelect ?? onSelect;
  onDelete = handlers.onDelete ?? onDelete;

  let collapsed = store.bool(KEYS.notesSidebarCollapsed, false);
  applyCollapsed(collapsed);

  collapseBtn.addEventListener("click", () => {
    collapsed = !collapsed;
    store.set(KEYS.notesSidebarCollapsed, collapsed);
    applyCollapsed(collapsed);
  });

  newBtn.addEventListener("click", () => {
    createNote().catch(err => console.error("Create failed:", err));
  });

  searchEl.addEventListener("input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, SEARCH_DEBOUNCE_MS);
  });

  searchEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      clearTimeout(searchTimer);
      clearSearch();
      searchEl.blur();
    }
  });
}
