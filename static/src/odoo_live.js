/* Load live DASH payload from Odoo, then refresh every 5 minutes. */
(function () {
  async function load() {
    const res = await fetch("/kandil/planning/data", { credentials: "same-origin", cache: "no-store" });
    if (!res.ok) throw new Error("Odoo data HTTP " + res.status);
    window.DASH = await res.json();
    window.dispatchEvent(new Event("dash-ready"));
  }
  window.KANDIL_RELOAD = load;
  load().catch(function (err) {
    document.body.innerHTML = "<p style='padding:24px;font-family:sans-serif'>Could not read Odoo: " + err.message + "</p>";
  });
  setInterval(function () {
    load().then(function () {
      window.dispatchEvent(new Event("dash-reload"));
    }).catch(function () {});
  }, 5 * 60 * 1000);
})();
