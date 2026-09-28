// ═══════════════════════════════════════════════════════════════
//  TABS — the pinned notes, along the top of the sheet
// ═══════════════════════════════════════════════════════════════
//
//  Every pin is a tab, oldest pin first. The open note always has a
//  tab: an unpinned one gets the single temporary tab at the end, in
//  italics, which the next unpinned note replaces. Alt+Left and
//  Alt+Right move the open note's tab, when it is a pin.

import * as library from "./library.js";
import { displayTitle, isUntitled } from "./format.js";

const stripEl = document.getElementById("noteTabs");

let active   = null;
let temp     = null;
let scrolled = null;   // the active tab's id and place, as last scrolled to
let onSelect = () => {};
let onError  = () => {};

function ids() {
  const pins = library.pinned();
  return temp ? [...pins, temp] : pins;
}

function buildTab(note) {
  const label = displayTitle(note);
  const tab = document.createElement("button");
  tab.type        = "button";
  tab.className   = "notes__tab";
  tab.textContent = label;
  tab.title       = label;
  tab.dataset.id  = note.id;
  tab.classList.toggle("is-temp", note.id === temp);
  tab.classList.toggle("untitled", isUntitled(note));
  if (note.id === active) tab.setAttribute("aria-current", "true");
  if (note.id === active && library.isPinned(note.id)) {
    tab.setAttribute("aria-keyshortcuts", "Alt+ArrowLeft Alt+ArrowRight");
  }
  tab.addEventListener("click", () => {
    if (note.id !== active) onSelect(note.id);
  });
  return tab;
}

function markOverflow() {
  stripEl.classList.toggle("has-before", stripEl.scrollLeft > 1);
  stripEl.classList.toggle("has-more", stripEl.scrollLeft + stripEl.clientWidth < stripEl.scrollWidth - 1);
}

export function render() {
  if (active && library.get(active) && !library.isPinned(active)) temp = active;
  if (temp && (library.isPinned(temp) || !library.get(temp))) temp = null;

  stripEl.replaceChildren(...ids().map(library.get).filter(Boolean).map(buildTab));

  const place = `${active}@${ids().indexOf(active)}`;
  if (place !== scrolled) {
    scrolled = place;
    stripEl.querySelector('[aria-current="true"]')?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
  markOverflow();
}

/** The note now in the editor, or null for none. */
export function show(id) {
  active = id;
  render();
}

/** The tab to take over when `id`'s closes: its left neighbour, else its right. */
export function neighbour(id) {
  const list = ids();
  const at = list.indexOf(id);
  if (at === -1) return null;
  return list[at - 1] ?? list[at + 1] ?? null;
}

const MOVES = { ArrowLeft: -1, ArrowRight: 1 };

function moveKey(e) {
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || !(e.key in MOVES)) return;
  if (!active || !library.isPinned(active) || e.target.closest?.("dialog, [popover]")) return;
  // Alt+Left is also Back: kept even at the end of the row, or it leaves the page.
  e.preventDefault();
  library.movePin(active, MOVES[e.key]).catch(err => {
    console.error("Tab move failed:", err);
    onError("Could not save the tab order");
  });
}

export function initTabs(handlers = {}) {
  onSelect = handlers.onSelect ?? onSelect;
  onError  = handlers.onError  ?? onError;

  document.addEventListener("keydown", moveKey);

  stripEl.addEventListener("scroll", markOverflow, { passive: true });
  new ResizeObserver(markOverflow).observe(stripEl);
}
