// ═══════════════════════════════════════════════════════════════
//  CLOCK — header time and date
// ═══════════════════════════════════════════════════════════════

const clockEl = document.getElementById("clockDate");

function updateHeaderClock() {
  const now = new Date();
  const d = now.toLocaleDateString(undefined, {
    weekday: 'short',
    month:   'short',
    day:     'numeric'
  });
  const t = now.toLocaleTimeString(undefined, { hour12: false });

  if (clockEl) {
    clockEl.textContent = `${t} · ${d}`;
  }
}

export function initClock() {
  if (!clockEl) return;
  updateHeaderClock();
  setInterval(updateHeaderClock, 1000);
}
