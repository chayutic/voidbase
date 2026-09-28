// ═══════════════════════════════════════════════════════════════
//  LIBRARY — every note's summary, the folders, and the pins
// ═══════════════════════════════════════════════════════════════
//
//  No DOM. The tabs and the switcher draw from this, and main.js
//  repaints both whenever it changes.

import * as api from "./api.js";

let notes   = [];   // newest first, as of the last refresh
let folders = [];
let pins    = [];   // ids, oldest pin first
let onChange = () => {};

export function all()         { return notes; }
export function folderNames() { return folders; }
export function pinned()      { return pins; }
export function get(id)       { return notes.find(n => n.id === id) ?? null; }
export function isPinned(id)  { return pins.includes(id); }

export async function refresh() {
  ({ notes, folders, pins } = await api.listNotes());
  onChange();
}

/** For after a change that has already landed. */
export function refreshQuietly() {
  return refresh().catch(err => console.error("Notes refresh failed:", err));
}

/**
 * Merge a note's new summary in place, after a save or a move. Order is
 * left alone: re-sorting on every autosave would move the note you're
 * typing in. It settles on the next refresh.
 */
export function update(summary) {
  if (summary.folder && !folders.includes(summary.folder)) {
    refreshQuietly();
    return;
  }
  notes = notes.map(n => n.id === summary.id ? { ...n, ...summary } : n);
  onChange();
}

export async function create(body, folder) {
  const summary = await api.createNote(body, folder);
  notes = [summary, ...notes];
  onChange();
  return summary;
}

export async function remove(id) {
  await api.deleteNote(id);
  notes = notes.filter(n => n.id !== id);
  pins  = pins.filter(p => p !== id);
  onChange();
}

export async function setPinned(id, on) {
  ({ pins } = await api.setPinned(id, on));
  onChange();
}

/**
 * Resolves to { name } as the server stored it, or { refusal }. The
 * caller refreshes, once it has moved whatever pointed at the old name.
 */
export async function renameFolder(from, to) {
  try {
    const { name } = await api.renameFolder(from, to);
    return { name };
  } catch (err) {
    if (err.status === 400 || err.status === 409) return { refusal: err.detail };
    if (err.status === 404) await refreshQuietly();
    throw err;
  }
}

/**
 * Resolves true once it's gone. A 409 means something the app never
 * shows is still in it, or a note landed there since the last list.
 */
export async function deleteFolder(name) {
  try {
    await api.deleteFolder(name);
  } catch (err) {
    if (err.status === 409) {
      await refreshQuietly();
      return false;
    }
    if (err.status !== 404) throw err;
  }
  await refreshQuietly();
  return true;
}

export function initLibrary(handlers = {}) {
  onChange = handlers.onChange ?? onChange;
}
