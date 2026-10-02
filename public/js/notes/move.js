// ═══════════════════════════════════════════════════════════════
//  MOVE — the picker that changes the open note's folder
// ═══════════════════════════════════════════════════════════════
//
//  The picker is a native popover, so light dismiss, Escape and the
//  top layer come from the browser. Its list is built on open, from
//  whatever folders the library last fetched. The dateline's folder
//  button opens it, and says where the note is.

import * as api   from "./api.js";
import { reject } from "../inline-edit.js";

const pickerEl = document.getElementById("folderPicker");
const listEl   = document.getElementById("folderPickerList");
const newEl    = document.getElementById("folderPickerNew");

let note       = null;  // { id, folder } of the open note
let folders    = () => [];
let beforeMove = async () => {};
let onMoved    = () => {};
let onCreated  = async () => {};
let onError    = () => {};

function label(folder) {
  return folder || "No folder";
}

function close() {
  if (pickerEl.matches(":popover-open")) pickerEl.hidePopover();
}

/** The note now in the editor, or null for none. */
export function show(summary) {
  note = summary ? { id: summary.id, folder: summary.folder } : null;
  if (!note) close();
}

export function folderRenamed(from, to) {
  if (note?.folder === from) note.folder = to;
}

// ── Picker ─────────────────────────────────────────────────────

function renderList() {
  listEl.textContent = "";

  for (const folder of ["", ...folders()]) {
    const item = document.createElement("button");
    item.type        = "button";
    item.className   = "notes__picker-item";
    item.textContent = label(folder);
    if (folder === note.folder) item.setAttribute("aria-current", "true");
    item.addEventListener("click", () => {
      close();
      if (folder !== note.folder) moveTo(folder);
    });
    listEl.appendChild(item);
  }
}

async function moveTo(folder) {
  const { id } = note;
  try {
    await beforeMove();
    const summary = await api.moveNote(id, folder);
    if (note?.id === id) show(summary);
    onMoved(summary);
  } catch (err) {
    console.error("Move failed:", err);
    onError("Could not move that note");
  }
}

async function createFolder() {
  const name = newEl.value.trim();
  if (!name) return;

  try {
    await api.createFolder(name);
  } catch (err) {
    reject(newEl, err.detail ?? "Could not create that folder");
    return;
  }

  newEl.value = "";
  await onCreated();
  if (pickerEl.matches(":popover-open")) renderList();
}

// ── Init ───────────────────────────────────────────────────────

export function initMove(handlers = {}) {
  folders    = handlers.folders    ?? folders;
  beforeMove = handlers.beforeMove ?? beforeMove;
  onMoved    = handlers.onMoved    ?? onMoved;
  onCreated  = handlers.onCreated  ?? onCreated;
  onError    = handlers.onError    ?? onError;

  // Whichever surface's button opened it lights up while it's open.
  pickerEl.addEventListener("toggle", (e) => {
    for (const el of document.querySelectorAll(".notes__dateline-folder")) {
      el.setAttribute("aria-expanded", String(e.newState === "open" && el.checkVisibility()));
    }
  });

  pickerEl.addEventListener("beforetoggle", (e) => {
    if (e.newState === "open") {
      renderList();
    } else {
      newEl.value = "";
      newEl.setCustomValidity("");
    }
  });

  newEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    createFolder();
  });
}
