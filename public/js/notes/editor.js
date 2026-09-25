// ═══════════════════════════════════════════════════════════════
//  EDITOR — CodeMirror surface, autosave, status
// ═══════════════════════════════════════════════════════════════
//
//  There is no save button. Typing schedules a save 600ms after you
//  stop; switching notes, blurring, or leaving the page flushes any
//  pending write immediately so nothing is lost in the debounce window.
//
//  On a cold cache the note is rendered read-only with marked first,
//  then the editor replaces it. If the import fails outright the plain
//  textarea takes over — a worse editor, but still an editor.

import * as api from "./api.js";
import { formatEdited } from "./format.js";
import { renderPreview, renderPreviewNow } from "./preview.js";

const paneEl     = document.querySelector(".notes__pane");
const mountEl    = document.getElementById("noteEditor");
const previewEl  = document.getElementById("notePreview");
const fallbackEl = document.getElementById("noteFallback");
const statusEl   = document.getElementById("noteStatus");
const metaEl     = document.getElementById("noteMeta");

const SAVE_DEBOUNCE_MS = 600;

let currentId = null;
let lastSaved = "";
let baseMtime = null;      // mtime of the copy being edited, for conflict checks
let conflict  = false;     // the server refused a save; this copy is stale
let saveTimer = null;
let saving    = Promise.resolve();
let loadSeq   = 0;
let onSaved   = () => {};

// The active editing surface: "loading" | "cm6" | "fallback"
let mode = "loading";
let view = null;           // CodeMirror EditorView once ready
let cm   = null;           // the loaded module namespace
let extensions = null;

// ── Status line ────────────────────────────────────────────────

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function setMeta(note) {
  metaEl.textContent = note ? `Edited ${formatEdited(note.mtime)}` : "";
}

// ── Surface abstraction ────────────────────────────────────────

function getValue() {
  if (mode === "cm6" && view) return view.state.doc.toString();
  if (mode === "fallback") return fallbackEl.value;
  return lastSaved;
}

// A fresh state, not a dispatch: a dispatched load lands in the undo
// history, and Ctrl+Z would then restore the previous note's text.
function setValue(text) {
  if (mode === "cm6" && view) {
    view.setState(cm.EditorState.create({ doc: text, extensions }));
  } else if (mode === "fallback") {
    fallbackEl.value = text;
  }
  renderPreviewNow(text);
}

function setEditable(on) {
  if (mode === "fallback") fallbackEl.disabled = !on;
  paneEl.classList.toggle("is-empty", !on);
}

// ── Saving ─────────────────────────────────────────────────────

function isDirty() {
  return currentId !== null && getValue() !== lastSaved;
}

function onEdit() {
  setStatus("Unsaved changes", "dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), SAVE_DEBOUNCE_MS);
}

async function saveNow() {
  if (!isDirty()) return;

  const id      = currentId;
  const payload = getValue();

  setStatus("Saving…", "saving");

  try {
    const summary = await api.saveNote(id, payload, baseMtime);

    // The note may have been switched while the request was in flight.
    if (currentId === id) {
      lastSaved = payload;
      baseMtime = summary.mtime;
      const dirty = isDirty();
      setStatus(dirty ? "Unsaved changes" : "Saved", dirty ? "dirty" : "saved");
      setMeta(summary);
    }
    onSaved(summary);
  } catch (err) {
    console.error("Save failed:", err);
    if (currentId !== id) return;
    if (err.status === 409) conflict = true;
    setStatus(err.status === 409
      ? "Changed elsewhere — not saved. Copy your edits, then reload"
      : "Save failed — retrying on next edit", "error");
  }
}

// Saves run one at a time. Two PUTs in flight can land out of order,
// and the older text would win.
function save() {
  saving = saving.then(saveNow);
  return saving;
}

export async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  await save();
}

export function reportError(text) {
  setStatus(text, "error");
}

// ── CodeMirror bootstrap ───────────────────────────────────────

async function mountCodeMirror(initialText) {
  cm = await import("../vendor/cm6.min.js");
  const { hideMarkers, livePreviewExtensions } = await import("./livepreview.js");
  const { notesKeymap } = await import("./commands.js");

  extensions = [
    cm.history(),
    cm.drawSelection(),
    cm.EditorView.lineWrapping,
    // Highest precedence so Enter reaches continueList before the
    // default newline command, and so Mod-i is not swallowed.
    cm.Prec.highest(cm.keymap.of(notesKeymap)),
    cm.keymap.of([...cm.defaultKeymap, ...cm.historyKeymap, cm.indentWithTab]),
    cm.placeholder("Start typing. A first line like “# Groceries” becomes the title."),
    // markdownLanguage is a Language instance built in the bundle
    // entry; .extension is what wires its parser into the editor.
    cm.markdownLanguage.extension,
    ...livePreviewExtensions,
    hideMarkers,
    cm.EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onEdit();
        renderPreview(update.state.doc.toString());
      }
    }),
    cm.EditorView.domEventHandlers({
      blur: () => { flush(); },
    }),
  ];

  view = new cm.EditorView({
    parent: mountEl,
    state:  cm.EditorState.create({ doc: initialText, extensions }),
  });

  mode = "cm6";
  paneEl.classList.add("cm6-ready");
}

// ── Loading a note ─────────────────────────────────────────────

function showNothing() {
  currentId = null;
  lastSaved = "";
  baseMtime = null;
  conflict  = false;
  setValue("");
  setEditable(false);
  setStatus("");
  setMeta(null);
}

/**
 * Show a note, or nothing for null. Resolves false when the note did
 * not end up on screen: a later load superseded it, the read failed, or
 * unsaved edits were kept. `discard` throws unsaved edits away — for
 * a note that has just been deleted.
 */
export async function load(id, { discard = false } = {}) {
  const seq = ++loadSeq;

  if (discard) {
    clearTimeout(saveTimer);
    showNothing();
  } else {
    await flush();
    if (isDirty() && !window.confirm("Your latest edits could not be saved. Discard them and switch notes?")) {
      return false;
    }
  }
  if (seq !== loadSeq) return false;

  if (id === null) {
    showNothing();
    return true;
  }

  let note;
  try {
    note = await api.readNote(id);
  } catch (err) {
    console.error("Could not open note:", err);
    if (seq === loadSeq) setStatus("Could not open that note", "error");
    return false;
  }
  if (seq !== loadSeq) return false;

  currentId = id;
  lastSaved = note.body;
  baseMtime = note.mtime;
  conflict  = false;
  setValue(note.body);
  setEditable(true);
  setStatus("Saved", "saved");
  setMeta(note);
  return true;
}

export function focus() {
  if (mode === "cm6" && view) view.focus();
  else if (mode === "fallback" && !fallbackEl.disabled) fallbackEl.focus();
}

// ── Init ───────────────────────────────────────────────────────

export async function initEditor(handlers = {}) {
  onSaved = handlers.onSaved ?? onSaved;

  // Fallback surface stays wired whether or not it is ever shown.
  fallbackEl.addEventListener("input", onEdit);
  fallbackEl.addEventListener("blur", () => { flush(); });

  // Last line of defence. sendBeacon survives page teardown where a
  // normal fetch would be cancelled mid-flight. It can only issue POST,
  // which is why the API accepts POST on /note/:id as well as PUT.
  //
  // No base mtime: a save still in flight moves it on, and the beacon
  // would then be refused as a conflict. That makes it unconditional, so
  // a copy already known to be stale must not send it — it would
  // overwrite the newer version. Neither can a body over the 64 KiB
  // beacon quota. Both ask the browser to hold the page instead.
  window.addEventListener("beforeunload", (e) => {
    if (!isDirty()) return;
    if (conflict) {
      e.preventDefault();
      return;
    }
    const sent = navigator.sendBeacon(
      `/notes/api/note/${currentId}`,
      new Blob([JSON.stringify({ body: getValue() })], { type: "application/json" }),
    );
    if (!sent) e.preventDefault();
  });

  try {
    await mountCodeMirror(lastSaved);
  } catch (err) {
    console.error("CodeMirror failed to load, falling back to a plain textarea:", err);
    mode = "fallback";
    paneEl.classList.add("fallback-mode");
    fallbackEl.value = lastSaved;
    setStatus("Plain editor — formatting unavailable", "error");
  }
}
