// ═══════════════════════════════════════════════════════════════
//  FORMAT — display helpers shared by the sidebar and status bar
// ═══════════════════════════════════════════════════════════════

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/**
 * Note ids encode creation time as Bangkok wall-clock components
 * (YYYYMMDD-HHmmss). Reconstructing a local Date from those components
 * renders correctly for a browser in the same zone, and if you are
 * travelling it keeps showing the time you actually wrote the note —
 * which is the more useful reading.
 */
export function idToDate(id) {
  const m = id.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
}

/** "24 Aug · 22:09" — the fallback label for a note with no heading. */
export function formatCreated(id) {
  const d = idToDate(id);
  if (!d) return id;
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
}

/** Relative wording for recent edits, absolute once it stops being useful. */
export function formatEdited(isoString) {
  const then = new Date(isoString);
  const secs = Math.floor((Date.now() - then.getTime()) / 1000);

  if (secs < 10)   return "just now";
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;

  const time = `${String(then.getHours()).padStart(2, "0")}:${String(then.getMinutes()).padStart(2, "0")}`;
  return `${then.getDate()} ${MONTHS[then.getMonth()]} · ${time}`;
}

/** The label a note shows in the sidebar. */
export function displayTitle(note) {
  return note.title || formatCreated(note.id);
}

/** True when the title is derived from the timestamp rather than authored. */
export function isUntitled(note) {
  return !note.title;
}
