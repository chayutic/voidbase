// ═══════════════════════════════════════════════════════════════
//  DOM — the small pieces every /ops section is built from
// ═══════════════════════════════════════════════════════════════

export function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

export function dot(state) {
  const node = el("span", "ops__dot");
  node.dataset.status = state;
  node.setAttribute("aria-hidden", "true");
  return node;
}

export function capital(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A footer phrase: "● Backup  finished 16 h ago". */
export function phrase(state, name, said) {
  const li = el("li", "ops__phrase");
  li.dataset.status = state;
  li.append(dot(state), el("span", "ops__phrase-name", name));
  if (said) li.append(el("span", "ops__phrase-said", said));
  return li;
}
