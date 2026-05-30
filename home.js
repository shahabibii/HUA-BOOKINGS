(function () {
  "use strict";

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

    renderGrain();

    return () => {
      window.removeEventListener("resize", resize);
      if (animationId) cancelAnimationFrame(animationId);
    };
  }

  function initHome() {
    initFilmGrain();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initHome);
  } else {
    initHome();
  }
})();
