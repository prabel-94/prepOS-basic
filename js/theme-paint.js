/**
 * Paint role surface on <body> before first paint to avoid theme flash.
 * Pages with a fixed audience set class on <body> directly; dual-role pages
 * use data-prepos-surface="auto" on <html> and last-known role from storage.
 */
(function () {
  const STORAGE_KEY = "prepos:last-surface";
  const html = document.documentElement;
  const preset = html.getAttribute("data-prepos-surface");

  if (!document.body) return;

  if (preset && preset !== "auto") {
    document.body.classList.add(preset + "-surface");
    return;
  }

  if (preset !== "auto") return;

  let surface = null;
  try {
    surface = sessionStorage.getItem(STORAGE_KEY);
  } catch (_) {}

  if (surface === "student" || surface === "pro" || surface === "auth") {
    document.body.classList.add(surface + "-surface");
  }
})();
