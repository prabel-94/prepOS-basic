/**
 * Paint role surface on <body> before first paint to avoid theme flash.
 * Pages with a fixed audience set class on <body> directly; dual-role pages
 * use data-prepos-surface="auto" on <html> and last-known role from storage.
 *
 * Also paints note-reader dark class from preferences localStorage when needed.
 */
(function () {
  const SURFACE_KEY = "prepos:last-surface";
  const PREFS_KEY = "prepos:preferences";
  const html = document.documentElement;
  const preset = html.getAttribute("data-prepos-surface");

  if (!document.body) return;

  if (preset && preset !== "auto") {
    document.body.classList.add(preset + "-surface");
  } else if (preset === "auto") {
    let surface = null;
    try {
      surface = sessionStorage.getItem(SURFACE_KEY);
    } catch (_) {}

    if (surface === "student" || surface === "pro" || surface === "auth") {
      document.body.classList.add(surface + "-surface");
    }
  }

  if (!document.body.classList.contains("note-reader-page")) return;

  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const prefs = raw ? JSON.parse(raw) : {};
    let scheme = prefs["reading.colorScheme"] || "light";
    if (scheme === "system") {
      scheme = window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    if (scheme === "dark") {
      document.body.classList.add("note-theme-dark");
      html.style.colorScheme = "dark";
    } else {
      html.style.colorScheme = "light";
    }
  } catch (_) {}
})();
