(function () {
  "use strict";

  function initHomeLogoShimmer() {
    const grad = document.getElementById("silverGrad");
    if (!grad) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let angle = 0;
    window.setInterval(() => {
      angle = (angle + 1) % 360;
      grad.setAttribute("gradientTransform", `rotate(${angle}, 0.5, 0.5)`);
    }, 40);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHomeLogoShimmer);
  } else {
    initHomeLogoShimmer();
  }
})();
