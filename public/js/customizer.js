// ═══════════════════════════════════════════════════════════════
//  LAYOUT CUSTOMIZER — section order and visibility
// ═══════════════════════════════════════════════════════════════
//
//  The saved layout is applied before first paint by the inline script
//  after the last .section in index.html, which also records the
//  authored order on .container as data-default-order. So by the time
//  this runs, the DOM is the saved layout and Reset reads the default
//  from that attribute. The inline script parses the stored value; this
//  module only ever writes it.

import * as store              from "./store.js";
import { KEYS }                from "./store.js";
import { closeSettingsPanel }  from "./settings.js";

const SECTION_NAMES = {
  "deals":           "Game Deals",
  "arrivals":        "New Arrivals",
  "markets":         "Markets",
  "media-automation":"Media Automation",
  "media-photos":    "Media & Photos",
  "local-network":   "Local Network",
  "website-cms":     "Website & CMS",
  "utilities":       "Utilities",
};

const container = document.querySelector(".container");

function getDefaultLayout() {
  return container.dataset.defaultOrder.split(" ").map(id => ({ id, visible: true }));
}

function currentLayout() {
  return Array.from(document.querySelectorAll(".section[data-section-id]")).map(el => ({
    id:      el.dataset.sectionId,
    visible: el.style.display !== "none",
  }));
}

// ── Customizer modal ───────────────────────────────────────────

const customizerOverlay = document.getElementById("customizerOverlay");
const customizerList    = document.getElementById("customizerList");
const customizerOpen    = document.getElementById("customizerOpen");
const customizerReset = document.getElementById("customizerReset");
const customizerCancel  = document.getElementById("customizerCancel");
const customizerSave    = document.getElementById("customizerSave");

let workingLayout = []; // in-progress state while modal is open
let dragSrcIndex  = null;

function buildCustomizerList(layout) {
  customizerList.innerHTML = "";
  layout.forEach((item, index) => {
    const row = document.createElement("div");
    row.className = "customizer__row" + (item.visible ? "" : " customizer__row--hidden");
    row.draggable = true;
    row.dataset.index = index;

    const handle = document.createElement("span");
    handle.className = "customizer__handle";
    handle.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="16" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="18" x2="16" y2="18"/></svg>`;

    const label = document.createElement("span");
    label.className = "customizer__label";
    label.textContent = SECTION_NAMES[item.id] ?? item.id;

    const eye = document.createElement("button");
    eye.className = "customizer__eye";
    eye.setAttribute("aria-label", item.visible ? "Hide section" : "Show section");
    eye.innerHTML = item.visible
      ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`
      : `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`;

    eye.addEventListener("click", () => {
      workingLayout[index].visible = !workingLayout[index].visible;
      buildCustomizerList(workingLayout);
    });

    row.addEventListener("dragstart", (e) => {
      dragSrcIndex = index;
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      document.querySelectorAll(".customizer__row").forEach(r => r.classList.remove("drag-over"));
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      document.querySelectorAll(".customizer__row").forEach(r => r.classList.remove("drag-over"));
      row.classList.add("drag-over");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragSrcIndex === null || dragSrcIndex === index) return;
      const moved = workingLayout.splice(dragSrcIndex, 1)[0];
      workingLayout.splice(index, 0, moved);
      dragSrcIndex = null;
      buildCustomizerList(workingLayout);
    });

    row.appendChild(handle);
    row.appendChild(label);
    row.appendChild(eye);
    customizerList.appendChild(row);
  });
}

function openCustomizer() {
  // Always build fresh from saved state, never from stale working state
  workingLayout = currentLayout();
  buildCustomizerList(workingLayout);
  customizerOverlay.classList.add("open");
  closeSettingsPanel();
}

function closeCustomizer() {
  customizerOverlay.classList.remove("open");
  customizerSave.classList.remove("saving");
}

export function initCustomizer() {
  if (!customizerOverlay) return;

  customizerOpen.addEventListener("click", openCustomizer);
  customizerCancel.addEventListener("click", closeCustomizer);

  customizerReset.addEventListener("click", () => {
    workingLayout = getDefaultLayout();
    buildCustomizerList(workingLayout);
  });

  customizerOverlay.addEventListener("click", (e) => {
    if (e.target === customizerOverlay) closeCustomizer();
  });

  customizerSave.addEventListener("click", () => {
    if (customizerSave.classList.contains("saving")) return;
    store.set(KEYS.sectionLayout, workingLayout);
    customizerSave.classList.add("saving");
    location.reload();
  });
}
