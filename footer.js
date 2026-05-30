(function () {
  "use strict";

  /**
   * Shared site footer — include on every page:
   *   <script src="footer.js?v=..."></script>           (site root)
   *   <script src="../footer.js?v=..."></script>        (nested pages)
   */

  const FOOTER_HTML =
    '<footer class="site-footer" id="site-footer">' +
    '<div class="footer-container">' +
    '<p class="copyright-detailed">© ' +
    new Date().getFullYear() +
    " ONYX. All rights reserved.</p>" +
    '<p class="builder-credit">Built and maintained by Shahab Manafi</p>' +
    "</div>" +
    "</footer>";

  function initSiteFooter() {
    if (document.getElementById("site-footer")) return;
    document.body.insertAdjacentHTML("beforeend", FOOTER_HTML);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initSiteFooter);
  } else {
    initSiteFooter();
  }
})();
