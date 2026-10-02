// ═══════════════════════════════════════════════════════════════
//  DATELINE — the open note's folder and edit time, above line one
// ═══════════════════════════════════════════════════════════════
//
//  Every surface draws its own copy, so it scrolls with the note. The
//  rendered note's and the fallback's are filled in place here;
//  CodeMirror's is a block widget the editor rebuilds on each change.
//  The folder button opens move.js's picker.

import { formatEdited } from "./format.js";

const CHEVRON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>`;

const hosts = [
  document.getElementById("previewDateline"),
  document.getElementById("fallbackDateline"),
];

let current  = null;   // { folder, mtime } of the open note
let onChange = () => {};

function fill(el, info) {
  el.hidden = !info;
  if (!info) {
    el.replaceChildren();
    return;
  }

  const folder = document.createElement("button");
  folder.type      = "button";
  folder.className = "notes__dateline-folder";
  folder.title     = "Move to another folder";
  folder.setAttribute("popovertarget", "folderPicker");
  const name = document.createElement("span");
  name.textContent = info.folder || "No folder";
  folder.append(name);
  folder.insertAdjacentHTML("beforeend", CHEVRON);

  const dot = document.createElement("span");
  dot.textContent = "·";
  dot.setAttribute("aria-hidden", "true");

  const edited = document.createElement("span");
  edited.textContent = `Edited ${formatEdited(info.mtime)}`;

  el.replaceChildren(folder, dot, edited);
}

/** A detached copy for CodeMirror's widget, drawn from `info`. */
export function build(info) {
  const el = document.createElement("div");
  el.className = "notes__dateline";
  fill(el, info);
  return el;
}

/** The open note's summary, or null for none. */
export function set(note) {
  current = note ? { folder: note.folder ?? "", mtime: note.mtime } : null;
  for (const el of hosts) fill(el, current);
  onChange(current);
}

export function folderRenamed(from, to) {
  if (current?.folder === from) set({ ...current, folder: to });
}

export function info() {
  return current;
}

/** `fn` runs with the new info after every set. The editor's only. */
export function watch(fn) {
  onChange = fn;
}
