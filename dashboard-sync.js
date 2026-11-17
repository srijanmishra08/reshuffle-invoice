/*
 * Sends each invoice and work order PDF to the Reshuffle dashboard as well as downloading it.
 *
 * Setup, once per browser: on the dashboard open Finance > Invoice PDFs, make a key, then click
 * "Dashboard: not connected" in the corner of this page and paste it. The key is kept only in this
 * browser (localStorage). It can upload PDFs and nothing else, and it can be revoked on the dashboard.
 *
 * The PDF is always downloaded first. If saving to the dashboard fails, the page says so and offers Retry.
 * Salary slips, offer letters and letterheads are deliberately not sent.
 */
(function () {
  var DASHBOARD_URL = "https://dashboard-silk-kappa-86.vercel.app";
  var STORAGE_KEY = "reshuffle_dashboard_key";

  function readKey() {
    try { return localStorage.getItem(STORAGE_KEY) || ""; } catch (e) { return ""; }
  }
  function writeKey(value) {
    try {
      if (value) localStorage.setItem(STORAGE_KEY, value); else localStorage.removeItem(STORAGE_KEY);
    } catch (e) { /* private mode: the key just is not remembered */ }
  }

  var style = document.createElement("style");
  style.textContent =
    "#dash-sync{position:fixed;right:16px;bottom:16px;z-index:9999;font:13px/1.4 system-ui,sans-serif}" +
    "#dash-sync button{font:inherit;cursor:pointer;border-radius:999px;padding:7px 14px;border:1px solid #bbb;background:#fff;color:#111}" +
    "#dash-sync button.on{border-color:#2e7d32;color:#1b5e20}" +
    "#dash-toast{margin-bottom:8px;max-width:340px;padding:9px 12px;border-radius:10px;color:#fff;background:#333;display:none}" +
    "#dash-toast.ok{background:#2e7d32}#dash-toast.error{background:#b71c1c}#dash-toast.warn{background:#8a6100}" +
    "#dash-toast button{margin-left:8px;padding:2px 10px;font-size:12px}" +
    "@media print{#dash-sync{display:none}}";
  document.head.appendChild(style);

  var box = document.createElement("div");
  box.id = "dash-sync";
  box.className = "no-print";
  var toastEl = document.createElement("div");
  toastEl.id = "dash-toast";
  toastEl.setAttribute("role", "status");
  var control = document.createElement("button");
  control.type = "button";
  box.appendChild(toastEl);
  box.appendChild(control);
  document.body.appendChild(box);

  function paintControl() {
    var connected = !!readKey();
    control.textContent = connected ? "Dashboard: connected" : "Dashboard: not connected";
    control.className = connected ? "on" : "";
  }
  paintControl();

  var hideTimer;
  function toast(message, tone, retry) {
    toastEl.textContent = message;
    toastEl.className = tone || "";
    toastEl.style.display = "block";
    if (retry) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = "Retry";
      b.onclick = retry;
      toastEl.appendChild(b);
    }
    clearTimeout(hideTimer);
    if (tone === "ok" || !tone) hideTimer = setTimeout(function () { toastEl.style.display = "none"; }, 5000);
  }

  control.onclick = function () {
    var entered = window.prompt(
      "Paste the dashboard key (made on the dashboard under Finance > Invoice PDFs).\nLeave it empty to disconnect.",
      ""
    );
    if (entered === null) return;
    entered = entered.trim();
    if (entered && !/^rsk_[A-Za-z0-9_-]{20,}$/.test(entered)) {
      toast("That does not look like a dashboard key. It starts with rsk_.", "error");
      return;
    }
    writeKey(entered);
    paintControl();
    toast(entered ? "Connected. New PDFs will be saved to the dashboard." : "Disconnected from the dashboard.", entered ? "ok" : "warn");
  };

  function upload(blob, meta) {
    var key = readKey();
    if (!key) {
      toast("PDF downloaded. It was not saved to the dashboard because this browser is not connected. Click the button in the corner.", "warn");
      return Promise.resolve(false);
    }
    var retry = function () { upload(blob, meta); };
    var form = new FormData();
    form.append("file", blob, meta.filename);
    ["docType", "number", "partyName", "amountText", "dateText", "filename"].forEach(function (name) {
      form.append(name, meta[name] || "");
    });
    toast("Saving to the dashboard…");
    return fetch(DASHBOARD_URL + "/api/ingest/documents", { method: "POST", headers: { Authorization: "Bearer " + key }, body: form })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (body) {
          if (res.ok) {
            toast(body.data && body.data.duplicate ? "This exact PDF is already in the dashboard." : "Saved to the dashboard ✓", "ok");
            return true;
          }
          if (res.status === 401) toast("The dashboard key is no longer valid. Click the corner button and enter a new one.", "error");
          else toast((body.error || "Could not save to the dashboard.") + " The PDF was still downloaded.", "error", retry);
          return false;
        });
      })
      .catch(function () {
        toast("Could not reach the dashboard. The PDF was downloaded. Retry when you are online.", "error", retry);
        return false;
      });
  }

  /** The value of a form field, or the text of a table cell. */
  function field(id) {
    var el = document.getElementById(id);
    if (!el) return "";
    return typeof el.value === "string" ? el.value : (el.textContent || "");
  }

  /** A file name made from the document number, for example RESHUFFLE-2026-05-01.pdf. */
  function fileName(number, fallback) {
    var base = String(number || "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
    return (base || fallback) + ".pdf";
  }

  window.DashboardSync = { upload: upload, field: field, fileName: fileName };
})();
