// ═══════════════════════════════════════════════════════════════
//  PREVIEW — rendered pane beside the editor
// ═══════════════════════════════════════════════════════════════
//
//  Rendering is coalesced with requestAnimationFrame, not debounced,
//  so the preview never lags the caret. The frame guard stops a fast
//  typist queueing redundant parses.

import { toHtml } from "./markdown.js";

const previewEl = document.getElementById("notePreview");

let pending = null;
let queued  = null;

function paint() {
  pending = null;
  const source = queued;
  queued = null;

  const html = toHtml(source);
  if (html) {
    previewEl.innerHTML = html;
    previewEl.classList.remove("empty");
  } else {
    previewEl.textContent = "Nothing to preview yet.";
    previewEl.classList.add("empty");
  }
}

/** Queue a render for the next frame. */
export function renderPreview(source) {
  if (!previewEl) return;
  queued = source;
  if (pending === null) pending = requestAnimationFrame(paint);
}

/** Render immediately, skipping the frame wait. Used when loading a note. */
export function renderPreviewNow(source) {
  if (!previewEl) return;
  if (pending !== null) {
    cancelAnimationFrame(pending);
    pending = null;
  }
  queued = source;
  paint();
}
