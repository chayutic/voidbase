// ═══════════════════════════════════════════════════════════════
//  DOCK — shortcut bar tooltip
// ═══════════════════════════════════════════════════════════════

export function initDock() {
  const tooltip   = document.getElementById("dockTooltip");
  const dockItems = document.querySelectorAll(".dock__item");
  if (!tooltip || !dockItems.length) return;

  const show = (item) => {
    tooltip.textContent = item.getAttribute("aria-label");
    tooltip.classList.add("dock__tooltip--visible");
  };
  const hide = () => tooltip.classList.remove("dock__tooltip--visible");

  dockItems.forEach(item => {
    item.addEventListener("mouseenter", () => show(item));
    item.addEventListener("mouseleave", hide);
    item.addEventListener("focus", () => { if (item.matches(":focus-visible")) show(item); });
    item.addEventListener("blur", hide);
  });

  // bfcache restores the page as it froze, tooltip and all.
  window.addEventListener("pagehide", hide);
}
