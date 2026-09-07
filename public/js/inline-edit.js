// ═══════════════════════════════════════════════════════════════
//  INLINE EDIT — swap a label for a text field, commit once
// ═══════════════════════════════════════════════════════════════
//
//  Two features rename things in place: a ticker symbol and a Turbo
//  preset. What they share is not the markup — it is the commit
//  protocol, which is easy to get subtly wrong in three places at once.

/**
 * Replace `target` with a text input and take a value from it exactly
 * once. Enter and blur commit; Escape discards. `restore()` runs after
 * either, and is the caller's job because the two sites put back
 * different things — a fresh span, or a re-rendered list.
 *
 * `onCommit` fires only when the value actually changed.
 */
export function beginInlineEdit({
  target,
  value,
  className,
  maxLength,
  hideWhileEditing = null,
  transform = (v) => v.trim(),
  onCommit,
  restore,
}) {
  const input = document.createElement("input");
  input.type      = "text";
  input.value     = value;
  input.className = className;
  input.maxLength = maxLength;

  target.replaceWith(input);
  if (hideWhileEditing) hideWhileEditing.style.display = "none";
  input.focus();
  input.select();

  let settled = false;

  function finish(commit) {
    if (settled) return;
    settled = true;

    if (commit) {
      const next = transform(input.value);
      if (next && next !== value) onCommit(next);
    }

    if (hideWhileEditing) hideWhileEditing.style.display = "";
    restore(input);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });

  // Deferred so a click on the trigger button lands before the input is
  // torn out from under it.
  input.addEventListener("blur", () => setTimeout(() => finish(true), 150));
}
