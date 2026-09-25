// ═══════════════════════════════════════════════════════════════
//  UTILITIES — collapsible shortcut grid
// ═══════════════════════════════════════════════════════════════

export function initUtilities() {
  const toggle  = document.querySelector(".utilities__toggle");
  const content = document.querySelector(".utilities__content");
  if (!toggle || !content) return;

  toggle.addEventListener("click", () => {
    const expanded = content.classList.toggle("expanded");
    toggle.classList.toggle("expanded", expanded);
    toggle.setAttribute("aria-expanded", expanded);
  });
}
