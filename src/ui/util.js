// Small shared DOM / text helpers for the views.

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Create an element: el("div", {class:"x", onclick: fn}, [children...], "text")
// children can be elements or strings (strings are escaped).
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "dataset") Object.assign(node.dataset, v);
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    if (typeof c === "string") node.appendChild(document.createTextNode(c));
    else node.appendChild(c);
  }
  return node;
}

// HP / Focus bar (v2 markup: .bar .bar-hp/.bar-focus)
export function bar(value, max, kind = "hp") {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const b = el("div", { class: `bar bar-${kind}` });
  const fill = el("div", { class: "bar-fill" });
  fill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
  b.appendChild(fill);
  b.appendChild(el("span", { class: "bar-label" }, `${value}/${max}`));
  return b;
}
