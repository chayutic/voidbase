// ═══════════════════════════════════════════════════════════════
//  NOTES — entry point
// ═══════════════════════════════════════════════════════════════
//
//  Reuses theme.js and store.js from the dashboard. Same origin, so the
//  theme picked in the Control Panel is already in localStorage and
//  applies here with no extra work. There are no swatches on this page,
//  which initTheme() handles fine.

import { initTheme }    from "../theme.js";
import { initSettings } from "../settings.js";
import * as sidebar    from "./sidebar.js";
import * as editor     from "./editor.js";

initTheme();

// Same Control Panel as the dashboard. Its Markets widgets are inert
// here in the sense that nothing repaints, but they still write the
// preference — which is the point.
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
        // Keep the sidebar row in step with the title and excerpt
        // derived from whatever was just written.
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
