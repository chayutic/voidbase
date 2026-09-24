// ═══════════════════════════════════════════════════════════════
//  COMMANDS — formatting shortcuts and list behaviour
// ═══════════════════════════════════════════════════════════════
//
//  Everything here edits the markdown source. Nothing renders — the
//  decorations in livepreview.js handle appearance, so a command only
//  ever has to get the characters right.

import { EditorSelection } from "../vendor/cm6.min.js";

// ── Inline wrapping ────────────────────────────────────────────

/**
 * Toggle a marker pair around each selection: Ctrl+B on already-bold
 * text unwraps it. With no selection the markers are inserted and the
 * caret is parked between them.
 */
function toggleWrap(marker) {
  return (view) => {
    const { state } = view;
    const len = marker.length;

    const changes = [];
    const ranges  = [];

    for (const range of state.selection.ranges) {
      const { from, to } = range;

      const before = state.sliceDoc(Math.max(0, from - len), from);
      const after  = state.sliceDoc(to, Math.min(state.doc.length, to + len));
      const inner  = state.sliceDoc(from, to);

      // Already wrapped, either just outside the selection or just inside it.
      if (before === marker && after === marker) {
        changes.push({ from: from - len, to: from });
        changes.push({ from: to, to: to + len });
        ranges.push(EditorSelection.range(from - len, to - len));
        continue;
      }
      if (inner.length >= len * 2 && inner.startsWith(marker) && inner.endsWith(marker)) {
        changes.push({ from, to: from + len });
        changes.push({ from: to - len, to });
        ranges.push(EditorSelection.range(from, to - len * 2));
        continue;
      }

      changes.push({ from, to: from, insert: marker });
      changes.push({ from: to, to, insert: marker });
      ranges.push(range.empty
        ? EditorSelection.cursor(from + len)
        : EditorSelection.range(from + len, to + len));
    }

    view.dispatch(state.update({
      changes,
      selection: EditorSelection.create(ranges, state.selection.mainIndex),
      scrollIntoView: true,
      userEvent: "input.format",
    }));
    return true;
  };
}

// ── Lists ──────────────────────────────────────────────────────

// indent · marker · spacing · optional task box
const LIST_RE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?/;

/**
 * Enter continues the current list instead of dropping out of it.
 *
 * On an item that has content, the next line gets the same indent and
 * marker (numbered markers increment, task boxes reset to unchecked).
 * On an empty item, the marker is removed instead.
 *
 * Returns false when the cursor is not in a list so the default Enter
 * handler takes over.
 */
function continueList(view) {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;

  const line  = state.doc.lineAt(range.head);
  const match = line.text.match(LIST_RE);
  if (!match) return false;

  const [prefix, indent, marker, spacing, task] = match;

  // Caret must be after the marker; before it, Enter should just split.
  if (range.head < line.from + prefix.length) return false;

  const content = line.text.slice(prefix.length);

  // Empty item: clear it rather than adding another empty one.
  if (!content.trim()) {
    view.dispatch(state.update({
      changes: { from: line.from, to: line.to, insert: "" },
      selection: EditorSelection.cursor(line.from),
      userEvent: "input.list",
    }));
    return true;
  }

  let nextMarker = marker;
  const numbered = marker.match(/^(\d+)([.)])$/);
  if (numbered) nextMarker = `${Number(numbered[1]) + 1}${numbered[2]}`;

  const insert = `\n${indent}${nextMarker}${spacing}${task ? "[ ] " : ""}`;

  view.dispatch(state.update({
    changes: { from: range.head, to: range.head, insert },
    selection: EditorSelection.cursor(range.head + insert.length),
    scrollIntoView: true,
    userEvent: "input.list",
  }));
  return true;
}

/** Turn the selected lines into a list, or strip the markers off again. */
function toggleList(makeMarker) {
  return (view) => {
    const { state } = view;
    const range = state.selection.main;

    const first = state.doc.lineAt(range.from).number;
    const last  = state.doc.lineAt(range.to).number;

    const lines = [];
    for (let n = first; n <= last; n++) lines.push(state.doc.line(n));

    // Strip only if every non-blank line already carries a marker.
    const meaningful = lines.filter(l => l.text.trim());
    const allMarked  = meaningful.length > 0 && meaningful.every(l => LIST_RE.test(l.text));

    const changes = lines.map((line, i) => {
      if (!line.text.trim() && lines.length > 1) return null;

      if (allMarked) {
        const m = line.text.match(LIST_RE);
        return m ? { from: line.from, to: line.from + m[0].length, insert: m[1] } : null;
      }

      const existing = line.text.match(LIST_RE);
      const body = existing ? line.text.slice(existing[0].length) : line.text.trimStart();
      const indent = existing ? existing[1] : line.text.match(/^\s*/)[0];
      return {
        from: line.from,
        to: line.to,
        insert: `${indent}${makeMarker(i)} ${body}`,
      };
    }).filter(Boolean);

    if (!changes.length) return false;

    view.dispatch(state.update({ changes, userEvent: "input.list" }));
    return true;
  };
}

// ── Keymap ─────────────────────────────────────────────────────
//
//  Mod is Ctrl on Windows and Linux, Cmd on macOS.

export const notesKeymap = [
  { key: "Mod-b",       run: toggleWrap("**"),  preventDefault: true },
  { key: "Mod-i",       run: toggleWrap("*"),   preventDefault: true },
  { key: "Mod-Shift-x", run: toggleWrap("~~"),  preventDefault: true },
  { key: "Mod-e",       run: toggleWrap("`"),   preventDefault: true },

  { key: "Mod-Shift-8", run: toggleList(() => "-"),      preventDefault: true },
  { key: "Mod-Shift-7", run: toggleList(i => `${i + 1}.`), preventDefault: true },

  { key: "Enter", run: continueList },
];
