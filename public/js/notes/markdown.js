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
 * Where a link opens, or null if it shouldn't. Shared with the editor,
 * so Ctrl+click and the rendered note agree.
 *
 * Allowlist rather than blocklist: anything with a protocol has to be
 * one we named. Covers javascript:, data:, vbscript: and whatever
 * comes next without needing to enumerate them. A bare domain or
 * www. gets https://, and a bare address mailto:, where the browser
 * would resolve either as a path under /notes.
 */
export function linkTarget(href) {
  let raw = String(href ?? "").trim();
  if (!raw) return null;
  if (/^(#|\/|\.\.?\/)/.test(raw)) return raw;
  if (!/^[a-z][a-z\d+.-]*:/i.test(raw)) {
    if (/^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(raw)) raw = `mailto:${raw}`;
    else if (/^[^\s/.]+(\.[^\s/.]+)+(\/|$)/.test(raw)) raw = `https://${raw}`;
    else return null;
  }
  try {
    const url = new URL(raw);
    return SAFE_PROTOCOLS.has(url.protocol) ? url.href : null;
  } catch {
    return null;
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
      const target = linkTarget(href);
      if (!target) return text;

      const attrs = [
        `href="${escapeHtml(target)}"`,
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
