// ═══════════════════════════════════════════════════════════════
//  FONT — the note in Geist or Geist Mono, on trial
// ═══════════════════════════════════════════════════════════════
//
//  The band's button flips the notes-mono class on <html>. The inline
//  script in notes.html sets it before first paint; this only toggles
//  it and remembers.

import * as store from "../store.js";
import { KEYS }   from "../store.js";

const root   = document.documentElement;
const button = document.getElementById("noteFont");

function show() {
  const mono = root.classList.contains("notes-mono");
  button.textContent = mono ? "Mono" : "Sans";
  button.title = mono ? "The note is in Geist Mono. Switch to Geist" : "The note is in Geist. Switch to Geist Mono";
}

export function initFont() {
  button.addEventListener("click", () => {
    const mono = root.classList.toggle("notes-mono");
    store.set(KEYS.notesFont, mono ? "mono" : "sans");
    show();
  });
  show();
}
