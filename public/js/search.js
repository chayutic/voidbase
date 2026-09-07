// ═══════════════════════════════════════════════════════════════
//  SEARCH — Google search bar and Turbo Mode
// ═══════════════════════════════════════════════════════════════
//
//  The active preset is prepended to the query on submit, then
//  stripped straight back out so the visible input never shows it.
//
//  The preset list is built with DOM methods rather than innerHTML —
//  preset text is user input and must never be parsed as markup.

import * as store            from "./store.js";
import { KEYS }              from "./store.js";
import { EDIT, CLOSE }       from "./icons.js";
import { beginInlineEdit }   from "./inline-edit.js";

const turboToggle      = document.getElementById("turboToggle");
const searchTurbo      = document.getElementById("searchTurbo");
const udmToggle        = document.getElementById("udmToggle");
const udmParam         = document.getElementById("udmParam");
const newtabToggle     = document.getElementById("newtabToggle");
const searchForm       = document.getElementById("searchForm");
const turboPresetsAdd  = document.getElementById("turboPresetsAdd");
const turboAddRow      = document.getElementById("turboAddRow");
const turboPresetInput = document.getElementById("turboPresetInput");
const turboPresetSave  = document.getElementById("turboPresetSave");
const turboPresetCancel = document.getElementById("turboPresetCancel");
const turboPresetList  = document.getElementById("turboPresetList");

const MAX_PRESETS = 6;

let turboPresets = store.json(KEYS.turboPresets, []);
let turboActive  = store.str(KEYS.turboActive, null); // preset term, or null for none
let turboEnabled = store.bool(KEYS.turboEnabled, false);
let turboNewTab  = store.bool(KEYS.turboNewTab, false);
let turboUdm     = store.bool(KEYS.turboUdm, true);

// ── Apply persisted state to the DOM ───────────────────────────

function applyTurboPanel(on) {
  searchTurbo.classList.toggle("visible", on);
  turboToggle.checked = on;
}

function applyNewTab(on) {
  searchForm.target = on ? "_blank" : "";
  newtabToggle.checked = on;
}

function applyUdm(on) {
  udmParam.value = on ? "14" : "";
  udmToggle.checked = on;
}

// ── Build preset query prefix on submit ────────────────────────

function getActivePresetTerm() {
  if (!turboEnabled) return null;
  return turboActive || null;
}

// ── Add-preset row ─────────────────────────────────────────────

function closeAddRow() {
  turboAddRow.classList.remove("visible");
  turboPresetsAdd.classList.remove("active");
  turboPresetInput.value = "";
}

function savePreset() {
  const val = turboPresetInput.value.trim();
  if (!val || turboPresets.includes(val) || turboPresets.length >= MAX_PRESETS) return;
  turboPresets.push(val);
  store.set(KEYS.turboPresets, turboPresets);
  closeAddRow();
  renderPresets();
}

// ── Render preset list ─────────────────────────────────────────

function renderPresets() {
  turboPresetList.innerHTML = "";
  if (!turboPresets.length) {
    turboPresetList.innerHTML = '<span class="search__turbo-empty">No presets yet.</span>';
    return;
  }
  turboPresets.forEach(term => {
    const isActive = turboActive === term;
    const item = document.createElement("div");
    item.className = "search__preset-item";

    const radio = document.createElement("button");
    radio.type = "button";
    radio.className = "search__preset-radio" + (isActive ? " active" : "");
    radio.setAttribute("aria-label", "Select " + term);
    const dot = document.createElement("span");
    dot.className = "search__preset-dot";
    radio.appendChild(dot);
    radio.addEventListener("click", () => {
      turboActive = turboActive === term ? null : term;
      store.set(KEYS.turboActive, turboActive);
      renderPresets();
    });

    const label = document.createElement("span");
    label.className = "search__preset-label";
    label.textContent = term;

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "search__preset-edit";
    editBtn.setAttribute("aria-label", "Edit " + term);
    editBtn.innerHTML = EDIT;
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      beginInlineEdit({
        target:    label,
        value:     term,
        className: "search__preset-input",
        maxLength: 40,
        hideWhileEditing: editBtn,
        onCommit: (newVal) => {
          const idx = turboPresets.indexOf(term);
          if (idx !== -1) turboPresets[idx] = newVal;
          if (turboActive === term) {
            turboActive = newVal;
            store.set(KEYS.turboActive, turboActive);
          }
          store.set(KEYS.turboPresets, turboPresets);
        },
        restore: () => renderPresets(),
      });
    });

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "search__preset-remove";
    remove.setAttribute("aria-label", "Remove " + term);
    remove.innerHTML = CLOSE;
    remove.addEventListener("click", () => {
      turboPresets = turboPresets.filter(p => p !== term);
      if (turboActive === term) { turboActive = null; store.remove(KEYS.turboActive); }
      store.set(KEYS.turboPresets, turboPresets);
      renderPresets();
    });

    item.appendChild(radio);
    item.appendChild(label);
    item.appendChild(editBtn);
    item.appendChild(remove);
    turboPresetList.appendChild(item);
  });
}

export function initSearch() {
  if (!searchForm) return;

  searchForm.addEventListener("submit", function () {
    const term   = getActivePresetTerm();
    const qInput = this.querySelector('input[name="q"]');
    if (term && qInput) {
      // Temporarily prepend — restore after submit fires
      const original = qInput.value;
      qInput.value = `${term} ${original}`;
      setTimeout(() => { qInput.value = original; }, 0);
    }
  });

  searchForm.querySelector(".search__input").addEventListener("keydown", e => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.target.blur();
    }
  });

  turboPresetsAdd.addEventListener("click", () => {
    turboAddRow.classList.toggle("visible");
    if (turboAddRow.classList.contains("visible")) {
      turboPresetInput.focus();
      turboPresetsAdd.classList.add("active");
    } else {
      closeAddRow();
    }
  });

  turboPresetCancel.addEventListener("click", closeAddRow);
  turboPresetSave.addEventListener("click", savePreset);

  turboPresetInput.addEventListener("keydown", e => {
    if (e.key === "Enter")  { e.preventDefault(); savePreset(); }
    if (e.key === "Escape") closeAddRow();
  });

  turboToggle.addEventListener("change", () => {
    turboEnabled = turboToggle.checked;
    store.set(KEYS.turboEnabled, turboEnabled);
    applyTurboPanel(turboEnabled);
  });

  newtabToggle.addEventListener("change", () => {
    turboNewTab = newtabToggle.checked;
    store.set(KEYS.turboNewTab, turboNewTab);
    applyNewTab(turboNewTab);
  });

  udmToggle.addEventListener("change", () => {
    turboUdm = udmToggle.checked;
    store.set(KEYS.turboUdm, turboUdm);
    applyUdm(turboUdm);
  });

  applyTurboPanel(turboEnabled);
  applyNewTab(turboNewTab);
  applyUdm(turboUdm);
  renderPresets();
}
