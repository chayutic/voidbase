// ═══════════════════════════════════════════════════════════════
//  NOTES — entry point
// ═══════════════════════════════════════════════════════════════
//
//  Reuses theme.js and store.js from the dashboard — same origin, so
//  the Control Panel's theme is already in localStorage.

import { initTheme }    from "../theme.js";
import { initSettings } from "../settings.js";
import * as store       from "../store.js";
import { KEYS }         from "../store.js";
import * as library     from "./library.js";
import * as tabs        from "./tabs.js";
import * as switcher    from "./switcher.js";
import * as editor      from "./editor.js";
import * as move        from "./move.js";
import * as dateline    from "./dateline.js";

initTheme();

// The Control Panel's Markets widgets repaint nothing here, but they
// still write the preference — which is the point.
initSettings();

let openId = null;

async function open(id) {
  const shown = await editor.load(id);
  if (shown && id) editor.focus();
  return shown;
}

async function create(body = "", folder = "") {
  try {
    const summary = await library.create(body, folder);
    if (await editor.load(summary.id)) editor.focus({ atEnd: true });
  } catch (err) {
    console.error("Create failed:", err);
    editor.reportError("Could not create a note");
  }
}

// Unpinning closes the tab. Moving first means the note is never on
// screen unpinned, where it would take the temporary tab.
async function unpin(id) {
  const next = tabs.neighbour(id);
  if (next) await open(next);
  await library.setPinned(id, false);
}

// The open note's tab hands over to the one beside it, as closing a
// tab would. Any other note just goes.
async function remove(id) {
  if (id !== openId) return library.remove(id);
  const next = tabs.neighbour(id) ?? library.all().find(n => n.id !== id)?.id ?? null;
  await library.remove(id);
  await editor.load(next, { discard: true });
}

function shown(note) {
  const id = note?.id ?? null;
  openId = id;
  tabs.show(id);
  move.show(note);
  store.set(KEYS.notesOpen, id);
  // Made since the last list, on another device; only search found it.
  if (id && !library.get(id)) library.refreshQuietly();
}

library.initLibrary({
  onChange: () => {
    tabs.render();
    switcher.render();
  },
});

tabs.initTabs({
  onSelect: open,
  onUnpin:  unpin,
  onError:  (message) => editor.reportError(message),
});

switcher.initSwitcher({
  onOpen:    open,
  onCreate:  create,
  onDelete:  remove,
  onError:   (message) => editor.reportError(message),
  onRenamed: (from, to) => {
    move.folderRenamed(from, to);
    dateline.folderRenamed(from, to);
  },
});

move.initMove({
  folders:    () => library.folderNames(),
  // A save still in flight could land after the move, carrying the
  // old folder back into the list.
  beforeMove: () => editor.flush(),
  onMoved:    (summary) => {
    library.update(summary);
    dateline.set(summary);
  },
  onCreated:  () => library.refreshQuietly(),
  onError:    (message) => editor.reportError(message),
});

document.getElementById("noteNew").addEventListener("click", () => create());

// Flush before the tab is hidden as well as on unload — on mobile a
// backgrounded tab is often killed without ever firing beforeunload.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") editor.flush();
});

async function start() {
  try {
    // The list does not depend on the editor, so both go at once: the
    // tabs paint while CodeMirror is still downloading.
    await Promise.all([
      library.refresh(),
      editor.initEditor({
        onSaved: (summary) => library.update(summary),
        onShown: shown,
        onSave:  (state) => tabs.showSave(state),
      }),
    ]);

    const last = store.str(KEYS.notesOpen, null);
    await open(library.get(last) ? last : library.all()[0]?.id ?? null);
  } catch (err) {
    console.error("Could not load notes:", err);
    editor.reportError("Could not reach the notes service.", { sticky: true });
  }
}

start();
