import { resolveAppPath } from "./access.js";

let linkRoutingReady = false;

export function preposGo(target) {
  window.location.href = resolveAppPath(target);
}

export function initPrepOSLinkRouting() {
  if (linkRoutingReady) {
    return;
  }

  linkRoutingReady = true;

  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-prepos-href]");
    if (!target) {
      return;
    }

    event.preventDefault();
    const href = target.getAttribute("data-prepos-href");
    if (href) {
      preposGo(href);
    }
  });
}

export function upgradeLegacyOnclickNav(root = document) {
  root.querySelectorAll("button[onclick], a[onclick]").forEach((el) => {
    const handler = el.getAttribute("onclick");
    const match = handler?.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (!match) {
      return;
    }

    el.removeAttribute("onclick");
    el.setAttribute("data-prepos-href", match[1]);
  });
}

window.preposGo = preposGo;
