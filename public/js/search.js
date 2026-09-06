// ═══════════════════════════════════════════════════════════════
//  SEARCH — Google search bar and Turbo Mode
// ═══════════════════════════════════════════════════════════════
//
//  The active preset is prepended to the query on submit, then
//  stripped straight back out so the visible input never shows it.
//
//  The preset list is built with DOM methods rather than innerHTML —
//  preset text is user input and must never be parsed as markup.

import * as store from "./store.js";
import { KEYS }   from "./store.js";

const turboToggle      = document.getElementById('turboToggle');
const searchTurbo      = document.getElementById('searchTurbo');
const udmToggle        = document.getElementById('udmToggle');
const udmParam         = document.getElementById('udmParam');
const newtabToggle     = document.getElementById('newtabToggle');
const searchForm       = document.getElementById('searchForm');
const turboPresetsAdd  = document.getElementById('turboPresetsAdd');
const turboAddRow      = document.getElementById('turboAddRow');
const turboPresetInput = document.getElementById('turboPresetInput');
const turboPresetSave  = document.getElementById('turboPresetSave');
const turboPresetCancel= document.getElementById('turboPresetCancel');
const turboPresetList  = document.getElementById('turboPresetList');

const MAX_PRESETS = 6;

let turboPresets = store.json(KEYS.turboPresets, []);
let turboActive  = store.str(KEYS.turboActive, null); // preset term, or null for none
let turboEnabled = store.bool(KEYS.turboEnabled, false);
let turboNewTab  = store.bool(KEYS.turboNewTab, false);
let turboUdm     = store.bool(KEYS.turboUdm, true);

// ── Apply turbo panel visibility ───────────────────────────────
function applyTurboPanel(on) {
  searchTurbo.classList.toggle('visible', on);
  turboToggle.checked = on;
}

// ── Apply new tab ──────────────────────────────────────────────
function applyNewTab(on) {
  searchForm.target = on ? '_blank' : '';
  newtabToggle.checked = on;
}

// ── Apply udm ──────────────────────────────────────────────────
function applyUdm(on) {
  udmParam.value = on ? '14' : '';
  udmToggle.checked = on;
}

// ── Build preset query prefix on submit ────────────────────────
function getActivePresetTerm() {
  if (!turboEnabled) return null;
  return turboActive || null;
}

searchForm.addEventListener('submit', function(e) {
  const term = getActivePresetTerm();
  const qInput = this.querySelector('input[name="q"]');
  if (term && qInput) {
    // Temporarily prepend — restore after submit fires
    const original = qInput.value;
    qInput.value = `${term} ${original}`;
    setTimeout(() => { qInput.value = original; }, 0);
  }
});

// ── Render preset list ─────────────────────────────────────────
function renderPresets() {
  turboPresetList.innerHTML = '';
  if (!turboPresets.length) {
    turboPresetList.innerHTML = '<span class="search__turbo-empty">No presets yet.</span>';
    return;
  }
  turboPresets.forEach(term => {
    const isActive = turboActive === term;
    const item = document.createElement('div');
    item.className = 'search__preset-item';

    const radio = document.createElement('button');
    radio.type = 'button';
    radio.className = 'search__preset-radio' + (isActive ? ' active' : '');
    radio.setAttribute('aria-label', 'Select ' + term);
    const dot = document.createElement('span');
    dot.className = 'search__preset-dot';
    radio.appendChild(dot);
    radio.addEventListener('click', () => {
      turboActive = turboActive === term ? null : term;
      store.set(KEYS.turboActive, turboActive);
      renderPresets();
    });

    const label = document.createElement('span');
    label.className = 'search__preset-label';
    label.textContent = term;

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'search__preset-edit';
    editBtn.setAttribute('aria-label', 'Edit ' + term);
    editBtn.innerHTML = `<svg width="800px" height="800px" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M15.4998 5.50067L18.3282 8.3291M13 21H21M3 21.0004L3.04745 20.6683C3.21536 19.4929 3.29932 18.9052 3.49029 18.3565C3.65975 17.8697 3.89124 17.4067 4.17906 16.979C4.50341 16.497 4.92319 16.0772 5.76274 15.2377L17.4107 3.58969C18.1918 2.80865 19.4581 2.80864 20.2392 3.58969C21.0202 4.37074 21.0202 5.63707 20.2392 6.41812L8.37744 18.2798C7.61579 19.0415 7.23497 19.4223 6.8012 19.7252C6.41618 19.994 6.00093 20.2167 5.56398 20.3887C5.07171 20.5824 4.54375 20.6889 3.48793 20.902L3 21.0004Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'search__preset-input';
      input.value = term;
      input.maxLength = 40;
      label.replaceWith(input);
      editBtn.style.display = 'none';
      input.focus();
      input.select();

      let committed = false;
      function commitEdit() {
        if (committed) return;
        committed = true;
        const newVal = input.value.trim();
        if (newVal && newVal !== term) {
          const idx = turboPresets.indexOf(term);
          if (idx !== -1) turboPresets[idx] = newVal;
          if (turboActive === term) {
            turboActive = newVal;
            store.set(KEYS.turboActive, turboActive);
          }
          store.set(KEYS.turboPresets, turboPresets);
        }
        renderPresets();
      }

      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); commitEdit(); }
        if (e.key === 'Escape') { committed = true; renderPresets(); }
      });
      input.addEventListener('blur', () => setTimeout(commitEdit, 150));
    });

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'search__preset-remove';
    remove.setAttribute('aria-label', 'Remove ' + term);
    remove.innerHTML = `<svg style="transform:rotate(45deg)" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    remove.addEventListener('click', () => {
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

// ── Add preset ─────────────────────────────────────────────────
turboPresetsAdd.addEventListener('click', () => {
  turboAddRow.classList.toggle('visible');
  if (turboAddRow.classList.contains('visible')) {
    turboPresetInput.focus();
    turboPresetsAdd.classList.add('active');
  } else {
    turboPresetInput.value = '';
    turboPresetsAdd.classList.remove('active');
  }
});

turboPresetCancel.addEventListener('click', () => {
  turboAddRow.classList.remove('visible');
  turboPresetsAdd.classList.remove('active');
  turboPresetInput.value = '';
});

function savePreset() {
  const val = turboPresetInput.value.trim();
  if (!val || turboPresets.includes(val) || turboPresets.length >= MAX_PRESETS) return;
  turboPresets.push(val);
  store.set(KEYS.turboPresets, turboPresets);
  turboPresetInput.value = '';
  turboAddRow.classList.remove('visible');
turboPresetsAdd.classList.remove('active');
  renderPresets();
}

turboPresetSave.addEventListener('click', savePreset);
turboPresetInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); savePreset(); }
  if (e.key === 'Escape') {
    turboAddRow.classList.remove('visible');
    turboPresetsAdd.classList.remove('active');
    turboPresetInput.value = '';
  }
});

// ── Turbo toggle ───────────────────────────────────────────────
turboToggle.addEventListener('change', () => {
  turboEnabled = turboToggle.checked;
  store.set(KEYS.turboEnabled, turboEnabled);
  applyTurboPanel(turboEnabled);
});

// ── New tab toggle ─────────────────────────────────────────────
newtabToggle.addEventListener('change', () => {
  turboNewTab = newtabToggle.checked;
  store.set(KEYS.turboNewTab, turboNewTab);
  applyNewTab(turboNewTab);
});

// ── Udm toggle ─────────────────────────────────────────────────
udmToggle.addEventListener('change', () => {
  turboUdm = udmToggle.checked;
  store.set(KEYS.turboUdm, turboUdm);
  applyUdm(turboUdm);
});

export function initSearch() {
  searchForm.querySelector('.search__input').addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.target.blur();
    }
  });

  applyTurboPanel(turboEnabled);
  applyNewTab(turboNewTab);
  applyUdm(turboUdm);
  renderPresets();
}
