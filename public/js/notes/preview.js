// ═══════════════════════════════════════════════════════════════
//  PREVIEW — the read-only render until an editor mounts
// ═══════════════════════════════════════════════════════════════

import { toHtml } from "./markdown.js";

const previewEl = document.getElementById("notePreview");

export function renderPreviewNow(source) {
  if (!previewEl) return;
  const html = toHtml(source);
  if (html) {
    previewEl.innerHTML = html;
    previewEl.classList.remove("empty");
  } else {
    previewEl.textContent = "Nothing to preview yet.";
    previewEl.classList.add("empty");
  }
}
