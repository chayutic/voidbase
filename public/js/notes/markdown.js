// ═══════════════════════════════════════════════════════════════
//  MARKDOWN — configured parser
// ═══════════════════════════════════════════════════════════════
//
//  Wraps the vendored marked build so the rest of the app never
//  touches it directly, and so the security posture lives in one file.
//
//  Raw HTML is escaped rather than passed through. marked ships no
//  sanitizer, and the alternative — vendoring DOMPurify as well — buys
//  nothing here: underline was dropped in favour of strikethrough, so
//  no feature needs raw HTML. Escaping makes markup injection
//  structurally impossible instead of merely unlikely.

import { Marked } from "../vendor/marked.esm.js";

const ENTITIES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, ch => ENTITIES[ch]);
}

const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Allowlist rather than blocklist. Relative and anchor links resolve
 * against this page and are fine; anything with a protocol has to be
 * one we named. Covers javascript:, data:, vbscript: and whatever
 * comes next without needing to enumerate them.
 */
function isSafeHref(href) {
  const raw = String(href ?? "").trim();
  if (!raw) return false;
  if (raw.startsWith("#") || raw.startsWith("/") || raw.startsWith("./") || raw.startsWith("../")) return true;

  try {
    return SAFE_PROTOCOLS.has(new URL(raw, window.location.origin).protocol);
  } catch {
    return false;
  }
}

const parser = new Marked({
  gfm:    true,   // task lists, strikethrough, tables
  breaks: true,   // a single newline is a line break, as in a plain text editor
});

parser.use({
  renderer: {
    // Block and inline raw HTML both route through here.
    html({ text }) {
      return escapeHtml(text);
    },

    // Anything linked from a note is external to this page.
    //
    // The protocol check is this renderer's own responsibility.
    // marked's stock link renderer rejects javascript: and friends,
    // but overriding link() replaces that logic wholesale — so an
    // override that only escapes the href reintroduces exactly the
    // hole the default was closing.
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens);
      if (!isSafeHref(href)) return text;

      const attrs = [
        `href="${escapeHtml(href)}"`,
        title ? `title="${escapeHtml(title)}"` : "",
        'target="_blank"',
        'rel="noopener noreferrer"',
      ].filter(Boolean).join(" ");
      return `<a ${attrs}>${text}</a>`;
    },
  },
});

/** Markdown source to HTML. Returns an empty string for empty input. */
export function toHtml(source) {
  if (!source || !source.trim()) return "";
  try {
    return parser.parse(source);
  } catch (err) {
    console.error("Markdown render failed:", err);
    return `<p class="markdown__error">Could not render this note.</p>`;
  }
}
