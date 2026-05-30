(function () {
  "use strict";

  function initHomeLogoSweep() {
    const grad = document.getElementById("sweepGrad");
    if (!grad) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

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
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
    };
  }

  function initFilmGrain() {
    const canvas = document.getElementById("film-grain-canvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationId = null;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    }

    function renderGrain() {
      const { width, height } = canvas;
      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;
      for (let i = 0; i < data.length; i += 4) {
        const value = Math.random() * 255;
        data[i] = value;
        data[i + 1] = value;
        data[i + 2] = value;
        data[i + 3] = 12;
      }
      ctx.putImageData(imageData, 0, 0);
      animationId = requestAnimationFrame(renderGrain);
    }

    resize();
    window.addEventListener("resize", resize);

    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      renderGrain();
    }

    return () => {
      window.removeEventListener("resize", resize);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }

  function initHome() {
    initHomeLogoSweep();
    initFilmGrain();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHome);
  } else {
    initHome();
  }
})();
