// ═══════════════════════════════════════════════════════════════
//  DOCK — shortcut bar tooltip
// ═══════════════════════════════════════════════════════════════

export function initDock() {
  const tooltip   = document.getElementById("dockTooltip");
  const dockItems = document.querySelectorAll(".dock__item");
  if (!tooltip || !dockItems.length) return;

  dockItems.forEach(item => {
    item.addEventListener("mouseenter", () => {
      tooltip.textContent = item.getAttribute("aria-label");
      tooltip.classList.add("dock__tooltip--visible");
    });

    item.addEventListener("mouseleave", () => {
      tooltip.classList.remove("dock__tooltip--visible");
    });
  });
}
