(function () {
  "use strict";

  const NESTED_SECTIONS = new Set(["hua", "availability", "reporting"]);

  const NAV_ITEMS = [
    { id: "home", label: "HOME", segment: "" },
    { id: "hua", label: "HUA", segment: "hua/" },
    { id: "availability", label: "AVALIBILITY", segment: "availability/" },
    { id: "reporting", label: "REPORTING", segment: "reporting/", locked: true },
  ];

  function createMenuLockIcon() {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "nyx-menu-link-lock");
    svg.setAttribute("width", "13");
    svg.setAttribute("height", "13");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("aria-hidden", "true");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "1.75");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");

    const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    rect.setAttribute("x", "3");
    rect.setAttribute("y", "11");
    rect.setAttribute("width", "18");
    rect.setAttribute("height", "11");
    rect.setAttribute("rx", "2");

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M7 11V7a5 5 0 0 1 10 0v4");

    svg.appendChild(rect);
    svg.appendChild(path);
    return svg;
  }

  function resolveSiteBase() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length && /\.[a-z0-9]+$/i.test(parts[parts.length - 1])) parts.pop();
    const last = parts[parts.length - 1];
    if (NESTED_SECTIONS.has(last)) parts.pop();
    return parts.length ? "/" + parts.join("/") + "/" : "/";
  }

  function currentNavId() {
    const path = location.pathname;
    if (/\/hua(\/|$)/i.test(path)) return "hua";
    if (/\/availability(\/|$)/i.test(path)) return "availability";
    if (/\/reporting(\/|$)/i.test(path)) return "reporting";
    return "home";
  }

  function initNyxMenu() {
    const btn = document.getElementById("nyx-menu-btn");
    const dropdown = document.getElementById("nyx-menu-dropdown");
    const nav = document.getElementById("nyx-menu-nav");
    if (!btn || !dropdown || !nav) return;

    const base = resolveSiteBase();
    const activeId = currentNavId();

    nav.replaceChildren();
    for (const item of NAV_ITEMS) {
      const link = document.createElement("a");
      link.className = "nyx-menu-link";
      link.href = base + item.segment;
      const label = document.createElement("span");
      label.className = "nyx-menu-link-label";
      label.textContent = item.label;
      link.appendChild(label);

      if (item.locked) {
        link.classList.add("nyx-menu-link--locked");
        link.setAttribute("title", "Password protected (coming soon)");
        link.appendChild(createMenuLockIcon());
      }
      if (item.id === activeId) {
        link.classList.add("is-active");
        link.setAttribute("aria-current", "page");
      }
      nav.appendChild(link);
    }

    let open = false;

    function setOpen(next) {
      open = next;
      dropdown.hidden = !open;
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      btn.classList.toggle("is-open", open);
    }

    btn.addEventListener("click", (event) => {
      event.stopPropagation();
      setOpen(!open);
    });

    document.addEventListener("click", (event) => {
      if (!open) return;
      const container = btn.closest(".nyx-menu-container");
      if (container && !container.contains(event.target)) setOpen(false);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && open) {
        setOpen(false);
        btn.focus();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initNyxMenu);
  } else {
    initNyxMenu();
  }
})();
