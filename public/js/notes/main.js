// ═══════════════════════════════════════════════════════════════
//  NOTES — entry point
// ═══════════════════════════════════════════════════════════════
//
//  Reuses theme.js and store.js from the dashboard — same origin, so
//  the Control Panel's theme is already in localStorage. This page has
//  no swatches, which initTheme() handles fine.

import { initTheme }    from "../theme.js";
import { initSettings } from "../settings.js";
import * as sidebar    from "./sidebar.js";
import * as editor     from "./editor.js";

initTheme();

// The Control Panel's Markets widgets repaint nothing here, but they
// still write the preference — which is the point.
initSettings();

sidebar.initSidebar({
  onSelect: (id) => editor.load(id),
  onDelete: (nextId) => editor.load(nextId),
});

// Flush before the tab is hidden as well as on unload — on mobile a
// backgrounded tab is often killed without ever firing beforeunload.
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") editor.flush();
});

async function start() {
  try {
    // The list does not depend on the editor, so both go at once: the
    // sidebar paints while CodeMirror is still downloading.
    const [firstId] = await Promise.all([
      sidebar.refresh({ keepSelection: false }),
      editor.initEditor({
        onSaved: (summary) => sidebar.updateRow(summary),
      }),
    ]);

    await editor.load(firstId);
    if (firstId) editor.focus();
  } catch (err) {
    console.error("Could not load notes:", err);
    document.getElementById("noteStatus").textContent = "Could not reach the notes service.";
  }
}

start();
