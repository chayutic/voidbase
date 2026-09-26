// ═══════════════════════════════════════════════════════════════
//  DOCK — magnification and tooltip
// ═══════════════════════════════════════════════════════════════

export function initDock() {
  const list      = document.querySelector(".dock__list");
  const tooltip   = document.getElementById("dockTooltip");
  const dockItems = [...document.querySelectorAll(".dock__item")];
  if (!list || !tooltip || !dockItems.length) return;

  const show = (item) => {
    tooltip.textContent = item.getAttribute("aria-label");
    tooltip.classList.add("dock__tooltip--visible");
  };
  const hide = () => tooltip.classList.remove("dock__tooltip--visible");

  // ── Magnification ────────────────────────────────────────────
  let active = null;
  let pointerX = 0;
  let frame = 0;

  const setActive = (item) => {
    if (item === active) return;
    active?.classList.remove("dock__item--active");
    item?.classList.add("dock__item--active");
    active = item;
    item ? show(item) : hide();
  };

  const nearest = () => {
    let best = null, bestDist = Infinity;
    for (const item of dockItems) {
      const r = item.getBoundingClientRect();
      const d = Math.abs(pointerX - (r.left + r.width / 2));
      if (d < bestDist) { best = item; bestDist = d; }
    }
    return best;
  };

  const track = (e) => {
    pointerX = e.clientX;
    frame ||= requestAnimationFrame(() => { frame = 0; setActive(nearest()); });
  };

  list.addEventListener("pointerover", track);
  list.addEventListener("pointermove", track);
  list.addEventListener("pointerleave", () => {
    cancelAnimationFrame(frame);
    frame = 0;
    setActive(null);
  });

  // ── Keyboard ─────────────────────────────────────────────────
  dockItems.forEach(item => {
    item.addEventListener("focus", () => { if (item.matches(":focus-visible")) show(item); });
    item.addEventListener("blur", () => { if (!active) hide(); });
  });

  // bfcache restores the page as it froze, tooltip and all.
  window.addEventListener("pagehide", () => { setActive(null); hide(); });
}
