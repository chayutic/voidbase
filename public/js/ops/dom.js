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

/** "release-4.0.20.3014" and "v3.5.2" → bare numbers; a digest is none. */
export function version(tag) {
  if (!tag || tag.startsWith("sha256:")) return null;
  return tag.replace(/^(release-|v(?=\d))/, "");
}

/** 2.3.2243 → 2.3.2363 with "2363" picked out; digests whole. */
export function versionChange(fromRaw, toRaw) {
  const box = el("span", "ops__change");
  const from = version(fromRaw), to = version(toRaw);
  if (!from || !to) {
    box.append(el("span", null, fromRaw), el("span", "ops__change-arrow", "→"), el("b", null, toRaw));
    return box;
  }
  const a = from.split("."), b = to.split(".");
  let i = 0;
  while (i < b.length - 1 && a[i] === b[i]) i++;
  const kept = b.slice(0, i).join(".");
  box.append(el("span", null, from), el("span", "ops__change-arrow", "→"),
    el("span", null, kept ? `${kept}.` : ""), el("b", null, b.slice(i).join(".")));
  return box;
}

/** A footer phrase: "● Backup  finished 16 h ago". */
export function phrase(state, name, said) {
  const li = el("li", "ops__phrase");
  li.dataset.status = state;
  li.append(dot(state), el("span", "ops__phrase-name", name));
  if (said) li.append(el("span", "ops__phrase-said", said));
  return li;
}
