// ═══════════════════════════════════════════════════════════════
//  TABS — the pinned notes, along the top of the sheet
// ═══════════════════════════════════════════════════════════════
//
//  Every pin is a tab, oldest pin first. The open note always has a
//  tab: an unpinned one gets the single temporary tab at the end, in
//  italics, which the next unpinned note replaces. Alt+Left and
//  Alt+Right move the open note's tab, when it is a pin, and a mouse
//  can drag any pin along the row.

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
  // Rebuilding would pull the tab out from under the pointer. An
  // autosave landing mid-drag is enough to do it.
  if (drag?.moving) {
    renderLater = true;
    return;
  }
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

// ── Dragging ───────────────────────────────────────────────────

const DRAG_FROM = 5;     // px a press travels before it's a drag
const EDGE      = 32;    // px from the strip's edge that scroll it
const SCROLL    = 8;     // px per frame at that edge

let drag        = null;
let renderLater = false;
let dragged     = false; // swallows the click a drag ends with

function pinnedTabs() {
  return [...stripEl.querySelectorAll(".notes__tab")].filter(tab => library.isPinned(tab.dataset.id));
}

function pointerDown(e) {
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  const tab = e.target.closest(".notes__tab");
  if (!tab || !library.isPinned(tab.dataset.id)) return;
  drag = { id: tab.dataset.id, pointer: e.pointerId, startX: e.clientX, x: e.clientX, moving: false };
}

// Slots are in the strip's scroll coordinates, measured once, so the
// tabs' own transforms never feed back into them.
function startMoving() {
  const tabs = pinnedTabs();
  const from = tabs.findIndex(tab => tab.dataset.id === drag.id);
  if (from === -1) return false;
  const base = stripEl.getBoundingClientRect().left - stripEl.scrollLeft;
  Object.assign(drag, {
    tabs, from, to: from, moving: true,
    startScroll: stripEl.scrollLeft,
    slots: tabs.map(tab => {
      const r = tab.getBoundingClientRect();
      return { left: r.left - base, width: r.width };
    }),
  });
  stripEl.setPointerCapture(drag.pointer);
  stripEl.classList.add("is-dragging");
  tabs[from].classList.add("is-dragged");
  drag.frame = requestAnimationFrame(edgeScroll);
  return true;
}

function pointerMove(e) {
  if (e.pointerId !== drag?.pointer) return;
  drag.x = e.clientX;
  if (!drag.moving) {
    if (Math.abs(drag.x - drag.startX) < DRAG_FROM) return;
    if (!startMoving()) return endDrag();
  }
  follow();
}

// The dragged tab tracks the pointer, kept within the pins, and every
// pin it has passed steps aside by its width.
function follow() {
  const { slots, from, tabs } = drag;
  const self  = slots[from];
  const first = slots[0].left;
  const last  = slots.at(-1).left + slots.at(-1).width;
  const moved = drag.x - drag.startX + stripEl.scrollLeft - drag.startScroll;
  const left  = Math.min(Math.max(self.left + moved, first), last - self.width);
  const centre = left + self.width / 2;

  drag.to = slots.filter((s, i) => i !== from && s.left + s.width / 2 < centre).length;
  tabs[from].style.transform = `translateX(${left - self.left}px)`;
  tabs.forEach((tab, i) => {
    if (i === from) return;
    const shift = i > from && i <= drag.to ? -self.width
                : i < from && i >= drag.to ?  self.width
                : 0;
    tab.style.transform = shift ? `translateX(${shift}px)` : "";
  });
}

function edgeScroll() {
  const { left, right } = stripEl.getBoundingClientRect();
  const by = drag.x < left + EDGE ? -SCROLL : drag.x > right - EDGE ? SCROLL : 0;
  if (by) {
    const before = stripEl.scrollLeft;
    stripEl.scrollLeft += by;
    if (stripEl.scrollLeft !== before) follow();
  }
  drag.frame = requestAnimationFrame(edgeScroll);
}

function endDrag() {
  if (drag?.moving) {
    cancelAnimationFrame(drag.frame);
    stripEl.classList.remove("is-dragging");
    for (const tab of drag.tabs) {
      tab.classList.remove("is-dragged");
      tab.style.transform = "";
    }
  }
  drag = null;
  if (renderLater) {
    renderLater = false;
    render();
  }
}

function pointerUp(e) {
  if (e.pointerId !== drag?.pointer) return;
  const { moving, id, to } = drag;
  endDrag();
  if (!moving) return;
  // The click, if one comes, is dispatched in this same task.
  dragged = true;
  setTimeout(() => { dragged = false; });
  library.placePin(id, to).catch(err => {
    console.error("Tab move failed:", err);
    onError("Could not save the tab order");
  });
}

function swallowClick(e) {
  if (!dragged) return;
  e.stopPropagation();
  dragged = false;
}

export function initTabs(handlers = {}) {
  onSelect = handlers.onSelect ?? onSelect;
  onError  = handlers.onError  ?? onError;

  document.addEventListener("keydown", moveKey);

  stripEl.addEventListener("pointerdown", pointerDown);
  stripEl.addEventListener("pointermove", pointerMove);
  stripEl.addEventListener("pointerup", pointerUp);
  stripEl.addEventListener("pointercancel", endDrag);
  stripEl.addEventListener("lostpointercapture", endDrag);
  stripEl.addEventListener("click", swallowClick, { capture: true });

  stripEl.addEventListener("scroll", markOverflow, { passive: true });
  new ResizeObserver(markOverflow).observe(stripEl);
}
