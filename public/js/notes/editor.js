// ═══════════════════════════════════════════════════════════════
//  EDITOR — CodeMirror surface, autosave, status
// ═══════════════════════════════════════════════════════════════
//
//  There is no save button. Typing schedules a save 600ms after you
//  stop; switching notes, blurring, or leaving the page flushes any
//  pending write immediately so nothing is lost in the debounce window.
//
//  LOADING
//  CodeMirror is ~100kb gzipped and prefetched from the dashboard, so
//  it is usually already cached. On a cold cache — typing /notes
//  directly — the note is rendered read-only with marked first, which
//  is already loaded and instant, then the editor replaces it.
//
//  If the import fails outright the plain textarea takes over. It is a
//  worse editor but it is still an editor, and losing formatting beats
//  losing the ability to write.

import * as api from "./api.js";
import { formatEdited } from "./format.js";
import { renderPreviewNow } from "./preview.js";

const paneEl     = document.querySelector(".notes__pane");
const mountEl    = document.getElementById("noteEditor");
const previewEl  = document.getElementById("notePreview");
const fallbackEl = document.getElementById("noteFallback");
const statusEl   = document.getElementById("noteStatus");
const metaEl     = document.getElementById("noteMeta");

const SAVE_DEBOUNCE_MS = 600;

let currentId = null;
let lastSaved = "";
let saveTimer = null;
let inFlight  = null;
let onSaved   = () => {};

// The active editing surface: "loading" | "cm6" | "fallback"
let mode = "loading";
let view = null;           // CodeMirror EditorView once ready
let cm   = null;           // the loaded module namespace

// ── Status line ──────────────────────────────────────────────────

function setStatus(text, state = "") {
  statusEl.textContent = text;
  statusEl.dataset.state = state;
}

function setMeta(note) {
  metaEl.textContent = note ? `Edited ${formatEdited(note.mtime)}` : "";
}

// ── Surface abstraction ──────────────────────────────────────────

function getValue() {
  if (mode === "cm6" && view) return view.state.doc.toString();
  if (mode === "fallback") return fallbackEl.value;
  return lastSaved;
}

function setValue(text) {
  if (mode === "cm6" && view) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: text },
      selection: { anchor: 0 },
    });
    return;
  }
  if (mode === "fallback") fallbackEl.value = text;
  renderPreviewNow(text);
}

function setEditable(on) {
  if (mode === "fallback") fallbackEl.disabled = !on;
  paneEl.classList.toggle("is-empty", !on);
}

// ── Saving ───────────────────────────────────────────────────────

function isDirty() {
  return currentId !== null && getValue() !== lastSaved;
}

function onEdit() {
  setStatus("Unsaved changes", "dirty");
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), SAVE_DEBOUNCE_MS);
}

async function save() {
  if (!isDirty()) return;

  const id      = currentId;
  const payload = getValue();

  setStatus("Saving…", "saving");

  try {
    inFlight = api.saveNote(id, payload);
    const summary = await inFlight;

    // The note may have been switched while the request was in flight.
    if (currentId === id) {
      lastSaved = payload;
      const dirty = isDirty();
      setStatus(dirty ? "Unsaved changes" : "Saved", dirty ? "dirty" : "saved");
      setMeta(summary);
    }
    onSaved(summary);
  } catch (err) {
    console.error("Save failed:", err);
    setStatus("Save failed — retrying on next edit", "error");
  } finally {
    inFlight = null;
  }
}

export async function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (inFlight) await inFlight;
  await save();
}

// ── CodeMirror bootstrap ─────────────────────────────────────────

async function mountCodeMirror(initialText) {
  cm = await import("../vendor/cm6.min.js");
  const { hideMarkers, livePreviewExtensions } = await import("./livepreview.js");
  const { notesKeymap } = await import("./commands.js");

  view = new cm.EditorView({
    parent: mountEl,
    state: cm.EditorState.create({
      doc: initialText,
      extensions: [
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
        // Unconditional. This was a Compartment behind a header toggle;
        // there is no reason to read raw markdown in a notes app whose
        // whole point is that formatting happens in place.
        hideMarkers,
        cm.EditorView.updateListener.of((update) => {
          if (update.docChanged) onEdit();
        }),
        cm.EditorView.domEventHandlers({
          blur: () => { flush(); },
        }),
      ],
    }),
  });

  mode = "cm6";
  paneEl.classList.add("cm6-ready");
}

export function isReady() {
  return mode === "cm6";
}

// ── Loading a note ───────────────────────────────────────────────

export async function load(id) {
  await flush();

  if (id === null) {
    currentId = null;
    lastSaved = "";
    setValue("");
    setEditable(false);
    setStatus("");
    setMeta(null);
    return;
  }

  const note = await api.readNote(id);
  currentId = id;
  lastSaved = note.body;
  setValue(note.body);
  setEditable(true);
  setStatus("Saved", "saved");
  setMeta(note);
}

export function focus() {
  if (mode === "cm6" && view) view.focus();
  else if (mode === "fallback" && !fallbackEl.disabled) fallbackEl.focus();
}

// ── Init ─────────────────────────────────────────────────────────

export async function initEditor(handlers = {}) {
  onSaved = handlers.onSaved ?? onSaved;

  // Fallback surface stays wired whether or not it is ever shown.
  fallbackEl.addEventListener("input", onEdit);
  fallbackEl.addEventListener("blur", () => { flush(); });

  // Last line of defence. sendBeacon survives page teardown where a
  // normal fetch would be cancelled mid-flight. It can only issue POST,
  // which is why the API accepts POST on /note/:id as well as PUT.
  window.addEventListener("beforeunload", () => {
    if (!isDirty()) return;
    navigator.sendBeacon(
      `/notes/api/note/${currentId}`,
      new Blob([JSON.stringify({ body: getValue() })], { type: "application/json" }),
    );
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
