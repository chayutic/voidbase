// ═══════════════════════════════════════════════════════════════
//  LIVE PREVIEW — CodeMirror decorations
// ═══════════════════════════════════════════════════════════════
//
//  Formats markdown in place as you type and reveals the raw source on
//  whichever line the cursor is on, the way Obsidian's Live Preview
//  behaves.
//
//  Two independent mechanisms:
//
//  1. HighlightStyle — the visual weight. Driven by the syntax tree, so
//     a heading looks like a heading and strong text is bold.
//  2. The hide plugin — replaces syntax markers (#, **, ~~, backticks,
//     link brackets) with nothing, except on active lines.


import {
  Decoration, ViewPlugin, EditorView,
  HighlightStyle, syntaxHighlighting, syntaxTree, tags,
} from "../vendor/cm6.min.js";

/**
 * Node types whose text is punctuation rather than content.
 * Names come from @lezer/markdown's grammar.
 */
const SYNTAX_NODES = new Set([
  "HeaderMark",        // the # of a heading
  "EmphasisMark",      // * or _ around em and strong
  "StrikethroughMark", // ~~
  "CodeMark",          // ` and ```
  "LinkMark",          // [ ] ( )
  "QuoteMark",         // >
  "URL",               // the target of an inline link
]);

const hide = Decoration.replace({});

/**
 * Marks the line holding a --- so CSS can draw an actual rule across it.
 *
 * A line decoration rather than a replace-with-widget: the dashes stay
 * in the document and keep their line box, so nothing shifts when the
 * cursor lands on the line and the source is revealed. notes.css hides
 * the glyphs and paints the rule.
 */
const ruleLine = Decoration.line({ class: "cm-md-rule" });

/** Line numbers touched by any cursor or selection. */
function activeLines(state) {
  const lines = new Set();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last  = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) lines.add(n);
  }
  return lines;
}

function buildDecorations(view) {
  const { state } = view;
  const active = activeLines(state);
  const ranges = [];

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(node) {
        const line = state.doc.lineAt(node.from);
        // Leave the line under the cursor as raw source so it stays
        // editable — you cannot fix a link you cannot see.
        if (active.has(line.number)) return;

        if (node.name === "HorizontalRule") {
          ranges.push(ruleLine.range(line.from));
          return;
        }

        if (!SYNTAX_NODES.has(node.name)) return;
        if (node.from === node.to) return;
        ranges.push(hide.range(node.from, node.to));
      },
    });
  }

  // The tree yields nested nodes, so ranges arrive out of order and mix
  // line decorations with replacements. Decoration.set sorts both when
  // told to.
  return Decoration.set(ranges, true);
}

/** Hides syntax markers away from the cursor. */
export const hideMarkers = ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(update) {
      // Selection changes matter as much as edits: moving the caret onto
      // a line is what reveals its source.
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations },
);

/**
 * Visual weight for rendered markdown. Sizes are fixed rem, matching the
 * .markdown heading scale in notes.css exactly, so a heading looks the
 * same while editing as it does in the rendered preview. Every
 * line-height stays >= 1.5 to leave room for Thai vowel and tone marks.
 */
export const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5rem",  fontWeight: "600", lineHeight: "1.5" },
  { tag: tags.heading2, fontSize: "1.25rem", fontWeight: "600", lineHeight: "1.5" },
  { tag: tags.heading3, fontSize: "1rem",    fontWeight: "600", lineHeight: "1.5" },
  { tag: tags.heading4, fontSize: "0.9rem",  fontWeight: "600", lineHeight: "1.5" },
  { tag: tags.heading5, fontSize: "0.9rem",  fontWeight: "600", lineHeight: "1.5", color: "var(--text-secondary)" },
  { tag: tags.heading6, fontSize: "0.9rem",  fontWeight: "600", lineHeight: "1.5", color: "var(--text-secondary)" },

  { tag: tags.strong,        fontWeight: "600" },
  { tag: tags.emphasis,      fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--text-secondary)" },

  { tag: tags.link,    color: "var(--accent-bright)", textDecoration: "underline", textUnderlineOffset: "2px" },
  { tag: tags.url,     color: "var(--text-secondary)" },
  { tag: tags.monospace, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
                         fontSize: "0.9em", background: "var(--surface-glass-hover)", borderRadius: "3px" },
  { tag: tags.quote,   color: "var(--text-secondary)", fontStyle: "italic" },
  // No colour for tags.list. That tag covers the whole list item, not
  // just the marker, so colouring it tinted every line of every list.
  // Items inherit --text-primary like ordinary body text.

  // No rule for tags.contentSeparator. It matches the --- of a
  // horizontal rule, and any colour here lands on a span *inside* the
  // line, which outranks the line-level colour that hides the dashes.
]);

/** Editor chrome. Colours all resolve against theme.css tokens. */
export const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.9rem",
    color: "var(--text-primary)",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    fontFamily: "var(--notes-font)",
    // Thai stacks marks above and below the baseline; this is the same
    // leading the rendered preview uses.
    lineHeight: "1.75",
    padding: "1.5rem 1.75rem",
    overflow: "auto",
  },
  ".cm-content": { padding: "0", caretColor: "var(--accent-bright)" },
  "&.cm-focused": { outline: "none" },
  ".cm-line": { padding: "0" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--accent-bright)", borderLeftWidth: "2px" },

  // CodeMirror's base theme ships
  //   &light.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground
  // set to #d7d4f0. That is a light lavender, and because this theme
  // never declares `dark`, the light variant applied — near-white text
  // on a near-white block.
  //
  // !important rather than a specificity duel: the base selector carries
  // an extra class (&light) that a theme rule cannot match without
  // hard-coding CodeMirror's internal class names, and those are not
  // part of its public API.
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--selection-bg) !important",
  },
  "> .cm-scroller > .cm-selectionLayer .cm-selectionBackground": {
    backgroundColor: "var(--selection-bg-blur) !important",
  },
  ".cm-content ::selection, .cm-line ::selection": {
    backgroundColor: "var(--selection-bg)",
  },
  ".cm-placeholder": { color: "var(--text-secondary)" },
});

export const livePreviewExtensions = [
  syntaxHighlighting(markdownHighlight),
  editorTheme,
];
