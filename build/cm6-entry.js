// ═══════════════════════════════════════════════════════════════
//  CM6 BUNDLE ENTRY
// ═══════════════════════════════════════════════════════════════
//
//  Source for public/js/vendor/cm6.min.js. Not served — esbuild reads
//  this, and the built output is committed.
//
//  Rebuild with:  npm run build:cm6
//
//  CodeMirror requires a SINGLE instance of @codemirror/state at
//  runtime — facets and state fields are compared by object identity.
//  Vendoring the packages separately gives each its own copy and breaks
//  at runtime, so they must be linked together once, ahead of time.
//
//  Do not swap @lezer/markdown for @codemirror/lang-markdown: it pulls
//  in lang-html and with it the full JavaScript and CSS grammars, ~30%
//  of the bundle, to colour code fences nobody writes here.

import { parser as baseMarkdownParser, GFM } from "@lezer/markdown";
import { Language, defineLanguageFacet, languageDataProp } from "@codemirror/language";

const markdownFacet = defineLanguageFacet({
  commentTokens: { block: { open: "<!--", close: "-->" } },
});

const parserWithGFM = baseMarkdownParser.configure([
  GFM,
  {
    props: [
      languageDataProp.add(type => type.name === "Document" ? markdownFacet : undefined),
    ],
  },
]);

/** Markdown language with GFM, minus the embedded-code grammars. */
export const markdownLanguage = new Language(markdownFacet, parserWithGFM, [], "markdown");

export { EditorState, EditorSelection, StateField, StateEffect, RangeSetBuilder, Compartment, Prec } from "@codemirror/state";

export {
  EditorView,
  Decoration,
  ViewPlugin,
  WidgetType,
  keymap,
  drawSelection,
  placeholder,
} from "@codemirror/view";

export { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";

export {
  syntaxTree,
  HighlightStyle,
  syntaxHighlighting,
} from "@codemirror/language";

export { tags } from "@lezer/highlight";
