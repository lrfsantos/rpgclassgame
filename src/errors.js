// Global error handler: never show a silent blank page again.
// Loaded in every page (head, before modules) so it catches boot/load errors.
(function () {
  if (location.protocol === "file:") {
    const div = document.createElement("div");
    div.style.cssText =
      "position:fixed;inset:0;z-index:20000;background:#1b1713;color:#e8dcc3;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;font:16px system-ui;";
    const box = document.createElement("div");
    box.style.cssText = "max-width:520px;border:2px solid #d9a441;padding:22px;background:#241f19;";
    box.innerHTML = "<h1 style='color:#d9a441;margin:0 0 10px;'>Classroom RPG can't start from here</h1>" +
      "<p>You opened this file directly from your computer. The game needs a tiny local server to run.</p>" +
      "<p><b>Do this instead:</b> double-click <code style='color:#ff8b2a'>start.bat</code> (next to this folder's files), then open <code style='color:#ff8b2a'>http://localhost:8000/</code> in your browser.</p>";
    div.appendChild(box);
    const mount = () => document.body.appendChild(div);
    if (document.body) mount();
    else document.addEventListener("DOMContentLoaded", mount, { once: true });
    return;
  }
  let banner = null;

  function show(msg, loc) {
    if (!banner) {
      banner = document.createElement("div");
      banner.id = "err-banner";
      banner.style.cssText =
        "position:fixed;top:0;left:0;right:0;z-index:10000;background:#b23a48;color:#fdf6e3;" +
        "font:14px system-ui;padding:8px 12px;border-bottom:3px solid #ffb07c;max-height:35vh;overflow:auto;";
      const text = document.createElement("div");
      text.id = "err-banner-text";
      text.style.whiteSpace = "pre-wrap";
      banner.appendChild(text);
      const copyBtn = document.createElement("button");
      copyBtn.textContent = "Copy";
      copyBtn.style.cssText = "margin-top:6px;background:#fdf6e3;color:#5c1a1a;border:none;padding:3px 10px;cursor:pointer;";
      copyBtn.addEventListener("click", () => {
        try {
          navigator.clipboard.writeText(text.textContent);
        } catch (e) {
          /* ignore */
        }
      });
      banner.appendChild(copyBtn);
      document.body.appendChild(banner);
    }
    banner.querySelector("#err-banner-text").textContent = "ERROR: " + msg + (loc ? "  [" + loc + "]" : "");
  }

  window.addEventListener("error", (e) => {
    const loc = e.filename ? `${e.filename}:${e.lineno}:${e.colno || 0}` : "";
    show(e.message || "Script error", loc);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    const msg = r && r.message ? r.message : String(r);
    show("Unhandled promise rejection: " + msg, "");
  });
})();
