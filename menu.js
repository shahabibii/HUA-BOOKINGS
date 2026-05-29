(function () {
  "use strict";

  const NAV_ITEMS = [
    { id: "home", label: "HOME", segment: "" },
    { id: "hua", label: "HUA", segment: "hua/" },
    { id: "availability", label: "AVALIBILITY", segment: "availability/" },
  ];

  function resolveSiteBase() {
    const parts = location.pathname.split("/").filter(Boolean);
    if (parts.length && /\.[a-z0-9]+$/i.test(parts[parts.length - 1])) parts.pop();
    const last = parts[parts.length - 1];
    if (last === "hua" || last === "availability") parts.pop();
    return parts.length ? "/" + parts.join("/") + "/" : "/";
  }

  function currentNavId() {
    const path = location.pathname;
    if (/\/hua(\/|$)/i.test(path)) return "hua";
    if (/\/availability(\/|$)/i.test(path)) return "availability";
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
      link.textContent = item.label;
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
