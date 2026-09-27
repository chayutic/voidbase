// ═══════════════════════════════════════════════════════════════
//  INLINE EDIT — swap a label for a text field, commit once
// ═══════════════════════════════════════════════════════════════
//
//  Three features rename things in place: a ticker symbol, a Turbo
//  preset and a notes folder. What they share is not the markup — it
//  is the commit protocol, which is easy to get subtly wrong in three
//  places at once.

/**
 * Replace `target` with a text input and take a value from it exactly
 * once. Enter and blur commit; Escape discards. `restore()` runs after
 * either, and is the caller's job because the two sites put back
 * different things — a fresh span, or a re-rendered list.
 *
 * `onCommit` fires only when the value actually changed. `validate`
 * returns a message to refuse the new value with, or "" to accept it.
 * For a refusal only a server can make, `onCommit` may return a
 * promise of one; the field waits, read-only, and refuses in place.
 */
export function beginInlineEdit({
  target,
  value,
  className,
  maxLength,
  hideWhileEditing = null,
  transform = (v) => v.trim(),
  validate = () => "",
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

  async function finish(commit, fromBlur = false) {
    if (settled) return;

    const next    = transform(input.value);
    const changed = commit && next && next !== value;
    const problem = changed ? validate(next) : "";
    // After a blur there is no field left to point the refusal at, so a
    // refused value is discarded, as Escape would.
    if (problem && !fromBlur) {
      reject(input, problem);
      return;
    }

    settled = true;
    if (changed && !problem) {
      input.readOnly = true;
      const refusal = await onCommit(next);
      input.readOnly = false;
      // Focus gone while it waited means the blur that would have
      // settled it has already been spent.
      if (refusal && !fromBlur && document.activeElement === input) {
        settled = false;
        reject(input, refusal);
        return;
      }
    }

    refusals.get(input)?.();
    if (hideWhileEditing) hideWhileEditing.style.display = "";
    restore(input);
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter")  { e.preventDefault(); finish(true); }
    if (e.key === "Escape") { e.preventDefault(); finish(false); }
  });

  // Deferred so a click on the trigger button lands before the input is
  // torn out from under it.
  input.addEventListener("blur", () => setTimeout(() => finish(true, true), 150));
}

// input → the function that takes its refusal down again
const refusals = new WeakMap();
let refusalCount = 0;

/**
 * Refuse what `input` holds: the field turns red and `message` shows in
 * a tip under it. Both clear on the next keystroke, or when the field
 * loses focus.
 */
export function reject(input, message) {
  refusals.get(input)?.();

  const anchor = `--refusal-${++refusalCount}`;
  const tip = document.createElement("div");
  tip.className   = "refusal";
  tip.popover     = "manual";
  tip.role        = "alert";
  tip.textContent = message;
  tip.style.positionAnchor = anchor;

  input.style.anchorName = anchor;
  input.setCustomValidity(message);
  input.setAttribute("aria-invalid", "true");
  document.body.append(tip);
  tip.showPopover();

  function clear() {
    refusals.delete(input);
    input.removeEventListener("input", clear);
    input.removeEventListener("blur", clear);
    input.style.anchorName = "";
    input.setCustomValidity("");
    input.removeAttribute("aria-invalid");
    tip.remove();
  }

  refusals.set(input, clear);
  input.addEventListener("input", clear);
  input.addEventListener("blur", clear);
}
