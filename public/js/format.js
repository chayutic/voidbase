// ═══════════════════════════════════════════════════════════════
//  FORMAT — time and count wording for the ops page and the cards
// ═══════════════════════════════════════════════════════════════

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function ago(ms) {
  const mins = Math.floor(ms / 60_000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** How long something lasted: "5 min", "15 h", "3 days". */
export function span(ms) {
  const mins = Math.max(1, Math.round(ms / 60_000));
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

export function stamp(iso) {
  const d = new Date(iso);
  const time = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
}

/** A `YYYY-MM-DD` date as "26 Sep", read as written rather than as UTC. */
export function day(date) {
  const [, m, d] = date.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export function count(n, one, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}
