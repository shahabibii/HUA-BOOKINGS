(function () {
  "use strict";

  function initHeaderLogoSweep() {
    const grad = document.getElementById("sweepGrad");
    if (!grad) return;

    let start = null;
    let rafId = null;
    const duration = 3800;

    function tick(ts) {
      if (!start) start = ts;
      const t = ((ts - start) % duration) / duration;
      const x1 = -50 + t * 200;
      const x2 = x1 + 50;
      grad.setAttribute("x1", `${x1}%`);
      grad.setAttribute("x2", `${x2}%`);
      rafId = requestAnimationFrame(tick);
    }

    rafId = requestAnimationFrame(tick);
  }

  function init() {
    initHeaderLogoSweep();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
