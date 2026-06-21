/* Math_Study — app.js : bootstrap. */
(function () {
  "use strict";
  const APP = window.APP;
  function boot() {
    try {
      APP.store.load();
      APP.ui.renderHome();
      // Safety net: force-write any pending (debounced) save when the tab is
      // hidden or closed, so the last answer is never lost.
      var doFlush = function () { try { APP.store.flush(); } catch (e) { } };
      window.addEventListener("pagehide", doFlush);
      document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") doFlush(); });
    } catch (e) {
      document.getElementById("app").innerHTML =
        '<div class="boot">Something went wrong starting Math_Study.<br><br><code style="color:#ef4444">' +
        (e && e.message ? e.message : e) + '</code><br><br>Try refreshing, or open Settings → Reset.</div>';
      console.error(e);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
