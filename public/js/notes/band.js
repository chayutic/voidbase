// ═══════════════════════════════════════════════════════════════
//  BAND — pin and delete, for the open note
// ═══════════════════════════════════════════════════════════════
//
//  The status and the folder pill share the band, but belong to the
//  editor and move.js.

import * as library from "./library.js";
import { displayTitle } from "./format.js";

const pinBtn    = document.getElementById("notePin");
const moveHint  = document.getElementById("noteMoveHint");
const deleteBtn = document.getElementById("noteDelete");

let current  = null;   // id of the open note
let onUnpin  = () => {};
let onDelete = () => {};
let onError  = () => {};

/** Repaint the pin's state, or hide both for no note. */
export function render() {
  const on = current !== null && library.isPinned(current);
  pinBtn.hidden = deleteBtn.hidden = current === null;
  pinBtn.setAttribute("aria-pressed", String(on));
  pinBtn.title = on ? "Unpin" : "Pin as a tab";
  moveHint.hidden = !on || library.pinned().length < 2;
}

/** The note now in the editor, or null for none. */
export function show(id) {
  current = id;
  render();
}

async function togglePin() {
  const id = current;
  try {
    if (library.isPinned(id)) await onUnpin(id);
    else await library.setPinned(id, true);
  } catch (err) {
    console.error("Pin failed:", err);
    onError(err.status === 404 ? "That note is gone" : "Could not change the pin");
  }
}

async function remove() {
  const note = library.get(current);
  if (!note || !window.confirm(`Delete “${displayTitle(note)}”? This cannot be undone.`)) return;

  const { id } = note;
  try {
    await onDelete(id);
  } catch (err) {
    console.error("Delete failed:", err);
    onError("Could not delete that note");
  }
}

export function initBand(handlers = {}) {
  onUnpin  = handlers.onUnpin  ?? onUnpin;
  onDelete = handlers.onDelete ?? onDelete;
  onError  = handlers.onError  ?? onError;

  pinBtn.addEventListener("click", togglePin);
  deleteBtn.addEventListener("click", remove);
}
