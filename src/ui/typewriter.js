// Typewriter text: reveals text one character at a time; click/Enter skips.
// Respects prefers-reduced-motion (shows instantly, no animation).
import { el } from "./util.js";

const REDUCED = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function typewriterText(text, { speed = 28, onDone } = {}) {
  const node = el("span", { class: "typewriter" });
  if (REDUCED || speed <= 0) {
    node.textContent = text;
    if (onDone) queueMicrotask(onDone);
    return node;
  }

  let i = 0;
  node.classList.add("typewriter-caret");
  let done = false;
  const step = () => {
    if (done) return;
    i++;
    node.textContent = text.slice(0, i);
    if (i < text.length) {
      timer = setTimeout(step, speed);
    } else {
      done = true;
      node.classList.remove("typewriter-caret");
      if (onDone) onDone();
    }
  };
  let timer = setTimeout(step, speed);

  const skip = () => {
    if (done) return;
    done = true;
    clearTimeout(timer);
    node.textContent = text;
    node.classList.remove("typewriter-caret");
    if (onDone) onDone();
  };

  // skip on click or Enter
  node.addEventListener("click", skip);
  node.tabIndex = 0;
  node.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); skip(); }
  });
  return node;
}
