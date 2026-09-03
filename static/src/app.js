/* Kandil Production Planning Dashboard */
(function boot() {
  if (!window.DASH) {
    window.addEventListener("dash-ready", boot, { once: true });
    return;
  }
  window.addEventListener("dash-reload", function () { location.reload(); });
  const D = window.DASH;

  const PLANTS = ["KI", "Mekano", "Vertica", "Makinat"];
  const state = {
    view: "overview",
    company: "",
    customer: "",
    delivery: "",
    category: "",
    factory: "",
    woStatus: "",
    search: "",
    eligibleOnly: true,
    factoryTab: "Mekano",
    matTab: "Mekano",
    selectedSO: D.eligibleSOs[0] || (D.so[0] && D.so[0].so),
  };

  const charts = {};
  const $ = (id) => document.getElementById(id);
  const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
  const fmt0 = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const fmtC = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

  function num(v) { return typeof v === "number" && isFinite(v) ? v : 0; }
  function pct(v) { return (Math.round(num(v) * 1000) / 10) + "%"; }
  function shortDate(s) { return s ? String(s).slice(0, 10) : "—"; }
  function money(v) { return fmtC.format(num(v)); }
  function esc(s) {
    return String(s ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  }
  function includesQ(hay, q) { return String(hay || "").toLowerCase().includes(q); }
  function unique(arr) { return [...new Set(arr)]; }

  function badge(status) {
    const s = String(status || "");
    const l = s.toLowerCase();
    let cls = "b-muted";
    if (l.includes("full") || l === "done" || l === "finished") cls = "b-green";
    else if (l.includes("not") || l.includes("late") || l.includes("cancel")) cls = "b-red";
    else if (l.includes("partial") || l.includes("progress") || l.includes("ready")) cls = "b-amber";
    else if (l.includes("wait")) cls = "b-blue";
    else if (l.includes("draft") || l.includes("confirm")) cls = "b-violet";
    else if (l.includes("close")) cls = "b-teal";
    return `<span class="badge ${cls}">${esc(s || "—")}</span>`;
  }

  function soMatches(row) {
    if (state.eligibleOnly && !D.eligibleSOs.includes(row.so)) return false;
    if (state.company && row.co !== state.company) return false;
    if (state.customer && row.cust !== state.customer) return false;
    if (state.delivery && row.ds !== state.delivery) return false;
    const cat = D.soCategory[row.so] || "Other";
    if (state.category && cat !== state.category) return false;
    const q = state.search.trim().toLowerCase();
    if (q && ![row.so, row.cust, row.co, cat].some((x) => includesQ(x, q))) return false;
    return true;
  }
  function filteredSO() { return D.so.filter(soMatches); }

  function woMatches(w) {
    if (state.factory && w.fy !== state.factory) return false;
    if (state.company && w.co !== state.company) return false;
    if (state.woStatus && w.st !== state.woStatus) return false;
    const q = state.search.trim().toLowerCase();
    if (q && ![w.so, w.mo, w.prod, w.wc, w.op, w.fy, w.grp].some((x) => includesQ(x, q))) return false;
    return true;
  }
  function filteredWO() { return D.wos.filter(woMatches); }
  function filteredMO() {
    const q = state.search.trim().toLowerCase();
    return D.mos.filter((m) => {
      if (state.company && m.co !== state.company) return false;
      if (q && ![m.so, m.ref, m.prod, m.co, m.st].some((x) => includesQ(x, q))) return false;
      return true;
    });
  }
  function mcMatches(m) {
    if (state.factory && m.fy !== state.factory) return false;
    if (state.woStatus && m.st !== state.woStatus) return false;
    const q = state.search.trim().toLowerCase();
    if (q && ![m.so, m.mo, m.prod, m.mc, m.grp, m.fy, m.op].some((x) => includesQ(x, q))) return false;
    return true;
  }

  function populateFilters() {
    const soSrc = state.eligibleOnly ? D.so.filter((r) => D.eligibleSOs.includes(r.so)) : D.so;
    fillSelect("fCompany", unique(soSrc.map((r) => r.co)).filter(Boolean).sort());
    fillSelect("fCustomer", unique(soSrc.map((r) => r.cust)).filter(Boolean).sort());
    fillSelect("fDelivery", unique(D.so.map((r) => r.ds)).filter(Boolean).sort());
    fillSelect("fCategory", unique(Object.values(D.soCategory)).filter(Boolean).sort());
    fillSelect("fFactory", unique(D.wos.map((w) => w.fy).concat(PLANTS)).filter(Boolean).sort());
    fillSelect("fWoStatus", unique(D.wos.map((w) => w.st)).filter(Boolean).sort());
    const list = $("soList");
    list.innerHTML = "";
    const names = (state.eligibleOnly ? D.eligibleSOs.slice() : unique(D.so.map((r) => r.so))).sort();
    names.forEach((so) => {
      const o = document.createElement("option");
      o.value = so;
      list.appendChild(o);
    });
    $("soInput").value = state.selectedSO || "";
  }

  function fillSelect(id, values) {
    const map = { fCompany: "company", fCustomer: "customer", fDelivery: "delivery", fCategory: "category", fFactory: "factory", fWoStatus: "woStatus" };
    const cur = state[map[id]];
    $(id).innerHTML = `<option value="">All</option>` + values.map((v) =>
      `<option${v === cur ? " selected" : ""}>${esc(v)}</option>`
    ).join("");
  }

  function kpiCard(label, value, tone, extra) {
    return `<div class="kpi ${tone || ""}"><div class="label">${esc(label)}</div><div class="value">${value}</div><div class="delta">${extra || ""}</div></div>`;
  }

  function tableHTML(headers, rows, opts) {
    if (!rows.length) return `<div class="empty">No rows for the current filters.</div>`;
    const head = headers.map((h) => `<th class="${h.num ? "num" : ""}">${esc(h.label)}</th>`).join("");
    const body = rows.map((r) => {
      const cells = headers.map((h) => `<td class="${h.num ? "num" : ""}">${r[h.key] ?? "—"}</td>`).join("");
      const click = opts && opts.onClickAttr && r._so ? ` class="clickable" data-so="${esc(r._so)}"` : "";
      return `<tr${click}>${cells}</tr>`;
    }).join("");
    return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  }

  function barColors() {
    return ["#f5b942", "#2dd4bf", "#60a5fa", "#a78bfa", "#f87171", "#34d399", "#f472b6", "#94a3b8"];
  }

  function upsertChart(id, spec) {
    const canvas = $(id);
    if (!canvas) return;
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(canvas, spec);
  }

  function doughnut(id, labels, data) {
    upsertChart(id, {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: barColors(), borderWidth: 0 }] },
      options: {
        maintainAspectRatio: false,
        plugins: { legend: { position: "bottom", labels: { color: "#93a0b8", boxWidth: 12 } } },
        cutout: "62%",
      },
    });
  }

  function bar(id, labels, data, label, horizontal) {
    upsertChart(id, {
      type: "bar",
      data: { labels, datasets: [{ label, data, backgroundColor: "#f5b942cc", borderRadius: 6, maxBarThickness: 28 }] },
      options: {
        indexAxis: horizontal ? "y" : "x",
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#93a0b8" }, grid: { color: "#2a365055" } },
          y: { ticks: { color: "#93a0b8" }, grid: { color: "#2a365055" } },
        },
      },
    });
  }

  function barCell(p) {
    const w = Math.max(0, Math.min(100, num(p) * 100));
    return `<div class="progress" title="${pct(p)}"><span style="width:${w}%"></span></div>`;
  }
  function countBy(arr, keyFn) {
    const o = {};
    arr.forEach((x) => { const k = keyFn(x); o[k] = (o[k] || 0) + 1; });
    return o;
  }
  function sumBy(arr, keyFn, valFn) {
    const o = {};
    arr.forEach((x) => { const k = keyFn(x); o[k] = (o[k] || 0) + valFn(x); });
    return o;
  }
  function stat(k, v) { return `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div></div>`; }

  function renderOverview() {
    const sos = filteredSO();
    const wos = filteredWO();
    const mos = filteredMO();
    const openQty = sos.reduce((a, r) => a + num(r.open), 0);
    const late = sos.reduce((a, r) => a + num(r.moL), 0);
    const remH = wos.reduce((a, r) => a + num(r.remH), 0);
    const ip = wos.filter((w) => w.st === "In Progress").length;
    const valOpen = sos.filter((r) => r.ds !== "Fully Delivered").reduce((a, r) => a + num(r.val), 0);

    $("kpiGrid").innerHTML = [
      kpiCard("Sales orders", fmt0.format(sos.length), "amber", state.eligibleOnly ? "MO-linked planning set" : "Full register"),
      kpiCard("Open quantity", fmt.format(openQty), "teal", "Units still to deliver"),
      kpiCard("Open order value", money(valOpen), "blue", "As recorded · mixed currency"),
      kpiCard("Active work orders", fmt0.format(wos.length), "", ip + " in progress"),
      kpiCard("Remaining hours", fmt.format(remH), "red", "Planned hours left on active WOs"),
      kpiCard("Late MOs on SOs", fmt0.format(late), "red", "From SO tracking logic"),
    ].join("");

    const del = countBy(sos, (r) => r.ds || "Unknown");
    doughnut("chDelivery", Object.keys(del), Object.values(del));
    const co = sumBy(sos, (r) => r.co || "Unknown", (r) => num(r.open));
    bar("chCompany", Object.keys(co), Object.values(co), "Open qty");
    const hrs = sumBy(wos, (r) => r.fy || "Unmapped", (r) => num(r.remH));
    bar("chHours", Object.keys(hrs), Object.values(hrs), "Hours");
    const moSt = countBy(mos, (r) => r.st || "Unknown");
    doughnut("chMo", Object.keys(moSt), Object.values(moSt));

    const hot = sos.map((r) => {
      const hrsSO = D.wos.filter((w) => w.so === r.so).reduce((a, w) => a + num(w.remH), 0);
      return Object.assign({}, r, { hrsSO });
    }).sort((a, b) => b.hrsSO - a.hrsSO || b.moL - a.moL).slice(0, 12).map((r) => ({
      _so: r.so,
      so: "<strong>" + esc(r.so) + "</strong>",
      cust: esc(r.cust),
      co: esc(r.co),
      ds: badge(r.ds),
      open: fmt.format(r.open),
      mo: r.moD + "/" + r.moT,
      late: r.moL ? badge(r.moL + " late") : "—",
      prog: barCell(r.moP),
      hrs: fmt.format(r.hrsSO),
    }));
    $("hotOrders").innerHTML = tableHTML([
      { key: "so", label: "SO" }, { key: "cust", label: "Customer" }, { key: "co", label: "Company" },
      { key: "ds", label: "Delivery" }, { key: "open", label: "Open qty", num: true },
      { key: "mo", label: "MO done/total" }, { key: "late", label: "Late" },
      { key: "prog", label: "MO progress" }, { key: "hrs", label: "Rem. hrs", num: true },
    ], hot, { onClickAttr: true });
  }

  function renderOrders() {
    const sos = filteredSO().slice().sort((a, b) => String(b.od).localeCompare(String(a.od)));
    $("orderKpis").innerHTML = [
      kpiCard("Shown", fmt0.format(sos.length)),
      kpiCard("Not delivered", fmt0.format(sos.filter((r) => r.ds === "Not Delivered").length), "red"),
      kpiCard("Partial", fmt0.format(sos.filter((r) => r.ds === "Partially Delivered").length), "amber"),
      kpiCard("Fully delivered", fmt0.format(sos.filter((r) => r.ds === "Fully Delivered").length), "green"),
      kpiCard("Open qty", fmt.format(sos.reduce((a, r) => a + num(r.open), 0)), "teal"),
      kpiCard("Shortage lines", fmt0.format(sos.reduce((a, r) => a + num(r.msL), 0)), "red"),
    ].join("");
    $("orderCount").textContent = sos.length + " orders";
    const rows = sos.slice(0, 400).map((r) => ({
      _so: r.so,
      so: "<strong>" + esc(r.so) + "</strong>",
      cust: esc(r.cust),
      co: esc(r.co),
      cat: esc(D.soCategory[r.so] || "—"),
      ds: badge(r.ds),
      od: shortDate(r.od),
      rd: shortDate(r.rd),
      oq: fmt.format(r.oq),
      dq: fmt.format(r.dq),
      open: fmt.format(r.open),
      val: money(r.val),
      mo: r.moD + "/" + r.moT,
      late: r.moL || "—",
      sh: r.msL || "—",
    }));
    $("orderTable").innerHTML = tableHTML([
      { key: "so", label: "SO" }, { key: "cust", label: "Customer" }, { key: "co", label: "Company" },
      { key: "cat", label: "Category" }, { key: "ds", label: "Delivery" },
      { key: "od", label: "Order date" }, { key: "rd", label: "Req. delivery" },
      { key: "oq", label: "Ordered", num: true }, { key: "dq", label: "Delivered", num: true },
      { key: "open", label: "Open", num: true }, { key: "val", label: "Value", num: true },
      { key: "mo", label: "MO" }, { key: "late", label: "Late" }, { key: "sh", label: "Shortage" },
    ], rows, { onClickAttr: true });
  }

  function moTable(mos) {
    return tableHTML([
      { key: "ref", label: "MO" }, { key: "st", label: "Status" }, { key: "prod", label: "Product" },
      { key: "qty", label: "Qty", num: true }, { key: "expH", label: "Exp. hrs", num: true },
      { key: "realH", label: "Real hrs", num: true }, { key: "schedEnd", label: "Sched. end" },
    ], mos.map((m) => ({
      ref: esc(m.consol || m.ref), st: badge(m.st), prod: esc(m.prod),
      qty: fmt.format(m.qty), expH: fmt.format(m.expH), realH: fmt.format(m.realH),
      schedEnd: shortDate(m.schedEnd),
    })));
  }

  function woTable(wos) {
    return tableHTML([
      { key: "mo", label: "MO" }, { key: "op", label: "Operation" }, { key: "st", label: "Status" },
      { key: "wc", label: "Work center" }, { key: "fy", label: "Factory" },
      { key: "prod", label: "Product" }, { key: "remH", label: "Rem. hrs", num: true },
      { key: "out", label: "Outsourcing" }, { key: "se", label: "Sched. end" },
    ], wos.map((w) => ({
      mo: esc(w.consol || w.mo), op: esc(w.op), st: badge(w.st), wc: esc(w.wc),
      fy: esc(w.fy), prod: esc(w.prod), remH: fmt.format(w.remH),
      out: w.out ? badge(w.out) : "—", se: shortDate(w.se),
    })));
  }

  function renderSearch() {
    const so = (state.selectedSO || "").trim().toUpperCase();
    const row = D.so.find((r) => r.so === so);
    const box = $("soDetail");
    if (!row) {
      box.innerHTML = `<article class="card"><div class="empty">Sales order ${esc(so || "")} was not found in SO Tracking.</div></article>`;
      return;
    }
    const mos = D.mos.filter((m) => m.so === so || m.soKey === so);
    const wos = D.wos.filter((w) => w.so === so || mos.some((m) => m.ref === w.mo || m.consol === w.consol));
    const remH = wos.reduce((a, w) => a + num(w.remH), 0);
    box.innerHTML =
      `<div class="detail-grid">
        ${stat("Sales order", so + " · " + badge(row.ds))}
        ${stat("Customer", esc(row.cust))}
        ${stat("Company", esc(row.co))}
        ${stat("Category", esc(D.soCategory[so] || "—"))}
        ${stat("Order date", shortDate(row.od))}
        ${stat("Requested delivery", shortDate(row.rd))}
        ${stat("Ordered / delivered / open", fmt.format(row.oq) + " / " + fmt.format(row.dq) + " / " + fmt.format(row.open))}
        ${stat("Order value", money(row.val))}
        ${stat("MO total / done / active / late", row.moT + " / " + row.moD + " / " + row.moA + " / " + row.moL)}
        ${stat("MO progress", pct(row.moP))}
        ${stat("Draft / confirmed / in progress / to close", row.moDr + " / " + row.moC + " / " + row.moIP + " / " + row.moTC)}
        ${stat("Material shortages", row.msL + " lines · qty " + fmt.format(row.msQ))}
      </div>
      <article class="card">
        <header><h2>Manufacturing orders</h2><span class="hint">${mos.length} open / non-done records · remaining WO hours ${fmt.format(remH)}</span></header>
        <div class="table-wrap">${moTable(mos)}</div>
      </article>
      <article class="card">
        <header><h2>Active work orders</h2><span class="hint">${wos.length} operations</span></header>
        <div class="table-wrap">${woTable(wos)}</div>
      </article>`;
  }

  function renderMachines() {
    const rows = D.machineStatus.filter(mcMatches);
    const mix = countBy(rows, (r) => r.st || "Unknown");
    $("machineKpis").innerHTML = [
      kpiCard("Machines listed", fmt0.format(rows.length)),
      kpiCard("In progress", fmt0.format(mix["In Progress"] || 0), "amber"),
      kpiCard("Ready", fmt0.format(mix["Ready"] || 0), "green"),
      kpiCard("Waiting", fmt0.format((mix["Waiting for another WO"] || 0) + (mix["Waiting for components"] || 0)), "blue"),
      kpiCard("No active WO", fmt0.format(mix["No matching active WO"] || 0)),
      kpiCard("Remaining hours", fmt.format(rows.reduce((a, r) => a + num(r.hrs), 0)), "red"),
    ].join("");
    doughnut("chMcStatus", Object.keys(mix), Object.values(mix));
    const grp = sumBy(rows, (r) => r.grp || "Unmapped", (r) => num(r.hrs));
    const sorted = Object.entries(grp).sort((a, b) => b[1] - a[1]);
    bar("chMcGroup", sorted.map((x) => x[0]), sorted.map((x) => x[1]), "Hours", true);
    $("machineTable").innerHTML = tableHTML([
      { key: "fy", label: "Factory" }, { key: "grp", label: "Group" }, { key: "mc", label: "Machine" },
      { key: "st", label: "Status" }, { key: "so", label: "SO" }, { key: "mo", label: "MO" },
      { key: "op", label: "Operation" }, { key: "prod", label: "Product" },
      { key: "qty", label: "Qty" }, { key: "hrs", label: "Rem. hrs", num: true },
    ], rows.map((r) => ({
      _so: r.so, fy: esc(r.fy), grp: esc(r.grp), mc: esc(r.mc), st: badge(r.st),
      so: r.so ? "<strong>" + esc(r.so) + "</strong>" : "—",
      mo: esc(r.mo), op: esc(r.op), prod: esc(r.prod), qty: esc(r.qty), hrs: fmt.format(r.hrs),
    })), { onClickAttr: true });
  }

  function renderFactory() {
    const fac = state.factoryTab;
    $("factorySeg").innerHTML = ["Mekano", "KI", "Vertica"].map((f) =>
      `<button data-fac="${f}" class="${f === fac ? "active" : ""}">${f}</button>`
    ).join("");
    $("factorySeg").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.factoryTab = b.dataset.fac;
      renderFactory();
    };
    const view = D.factoryViews[fac] || {};
    const open = (view.openSalesOrders || []).filter((r) => r._rowType !== "total" && r.SO);
    const cap = (view.demandByGroup && view.demandByGroup.rows) || [];
    const pri = (view.machinePriority && view.machinePriority.rows) || [];
    const rem = open.reduce((a, r) => a + num(r["Remaining WO Hrs"]), 0);
    const oval = open.reduce((a, r) => a + num(r["Order Value"]), 0);
    $("factoryKpis").innerHTML = [
      kpiCard("Open SOs", fmt0.format(open.length), "amber", fac),
      kpiCard("Open qty", fmt.format(open.reduce((a, r) => a + num(r["Open Qty"]), 0)), "teal"),
      kpiCard("Order value", money(oval), "blue", "Factory workbook currency"),
      kpiCard("Remaining WO hrs", fmt.format(rem), "red"),
      kpiCard("In-progress MOs", fmt0.format(open.reduce((a, r) => a + num(r["In Progress MOs"]), 0))),
      kpiCard("Late MOs", fmt0.format(open.reduce((a, r) => a + num(r["Late MOs"]), 0)), "red"),
    ].join("");
    const labels = cap.map((r) => r["Group of Machines"] || r.Factory).filter(Boolean);
    const days = cap.map((r) => num(r["#Working Days"]));
    bar("chCapacity", labels, days, "Working days of load", true);
    $("factoryOpenSO").innerHTML = tableHTML([
      { key: "so", label: "SO" }, { key: "client", label: "Client" }, { key: "ds", label: "Delivery" },
      { key: "mix", label: "MO mix" }, { key: "moP", label: "MO %" }, { key: "woP", label: "WO %" },
      { key: "open", label: "Open", num: true }, { key: "hrs", label: "Rem. hrs", num: true },
      { key: "val", label: "Value", num: true },
    ], open.map((r) => ({
      _so: r.SO, so: "<strong>" + esc(r.SO) + "</strong>", client: esc(r.Client),
      ds: badge(r["Delivery Status"]), mix: esc(r["MO Status Mix"]),
      moP: pct(r["MO Completion %"]), woP: pct(r["WO Completion %"]),
      open: fmt.format(r["Open Qty"]), hrs: fmt.format(r["Remaining WO Hrs"]), val: money(r["Order Value"]),
    })), { onClickAttr: true });
    $("factoryMachines").innerHTML = tableHTML([
      { key: "grp", label: "Group" }, { key: "mc", label: "Machine" }, { key: "st", label: "Status" },
      { key: "so", label: "SO" }, { key: "prod", label: "Product" }, { key: "hrs", label: "Rem. hrs", num: true },
    ], pri.filter((r) => r.Machine || r["Group of Machines"]).map((r) => ({
      _so: r.SO, grp: esc(r["Group of Machines"]), mc: esc(r.Machine),
      st: badge(r["Selected WO Status"]), so: esc(r.SO), prod: esc(r.Product),
      hrs: fmt.format(r["Remaining Hrs"]),
    })), { onClickAttr: true });
  }

  function genericTable(rows) {
    if (!rows || !rows.length) return `<div class="empty">No rows in this factory snapshot.</div>`;
    const keys = unique(rows.flatMap((r) => Object.keys(r))).filter((k) => k !== "_rowType");
    const headers = keys.map((k) => ({ key: k, label: k, num: rows.some((r) => typeof r[k] === "number") }));
    return tableHTML(headers, rows.map((r) => {
      const o = {};
      keys.forEach((k) => {
        const v = r[k];
        o[k] = typeof v === "number" ? fmt.format(v) : esc(v);
      });
      return o;
    }));
  }

  function renderMaterials() {
    const fac = state.matTab;
    $("matSeg").innerHTML = ["Mekano", "KI", "Vertica"].map((f) =>
      `<button data-fac="${f}" class="${f === fac ? "active" : ""}">${f}</button>`
    ).join("");
    $("matSeg").onclick = (e) => {
      const b = e.target.closest("button");
      if (!b) return;
      state.matTab = b.dataset.fac;
      renderMaterials();
    };
    $("wkCurrent").textContent = D.meta.planningWeekCurrent;
    $("wkPrev").textContent = D.meta.planningWeekPrevious;
    const v = D.factoryViews[fac] || {};
    $("draftMats").innerHTML = genericTable(v.draftMaterials && v.draftMaterials.rows);
    $("rmAvail").innerHTML = genericTable(v.rmAvailability && v.rmAvailability.rows);
    $("rmCurr").innerHTML = genericTable(v.rmCurrentWeek && v.rmCurrentWeek.rows);
    $("rmPrev").innerHTML = genericTable(v.rmPreviousWeek && v.rmPreviousWeek.rows);
  }

  function renderOutsourcing() {
    const wos = D.wos.filter((w) => w.out && woMatches(w));
    const byType = sumBy(wos, (w) => w.out, (w) => num(w.remH));
    $("outKpis").innerHTML = [
      kpiCard("Outsourced WOs", fmt0.format(wos.length), "amber"),
      kpiCard("Heat treatment", fmt0.format(wos.filter((w) => w.out === "Heat Treatment").length), "blue"),
      kpiCard("Welding", fmt0.format(wos.filter((w) => w.out === "Welding").length)),
      kpiCard("Remaining hours", fmt.format(wos.reduce((a, w) => a + num(w.remH), 0)), "red"),
      kpiCard("Factories", unique(wos.map((w) => w.fy)).filter(Boolean).length),
      kpiCard("Linked SOs", unique(wos.map((w) => w.so)).filter(Boolean).length, "teal"),
    ].join("");
    doughnut("chOut", Object.keys(byType), Object.values(byType));
    $("outTable").innerHTML = woTable(wos.slice(0, 250));
  }

  function renderClients() {
    $("suezTable").innerHTML = genericTable(D.suez);
    $("glassTable").innerHTML = genericTable(D.glass);
    const names = new Set(["Kandil Glass", "Kandil Glass Suez", "Suez", "Glass"]);
    const rows = D.so.filter((r) => names.has(r.cust) && soMatches(r)).slice(0, 200);
    $("clientOrders").innerHTML = tableHTML([
      { key: "so", label: "SO" }, { key: "cust", label: "Customer" }, { key: "co", label: "Company" },
      { key: "ds", label: "Delivery" }, { key: "open", label: "Open", num: true },
      { key: "rd", label: "Req. delivery" }, { key: "mo", label: "MO done/total" },
    ], rows.map((r) => ({
      _so: r.so, so: "<strong>" + esc(r.so) + "</strong>", cust: esc(r.cust), co: esc(r.co),
      ds: badge(r.ds), open: fmt.format(r.open), rd: shortDate(r.rd), mo: r.moD + "/" + r.moT,
    })), { onClickAttr: true });
  }

  const TITLES = {
    overview: ["Overview", "Executive planning picture. Filters apply to every KPI and chart."],
    orders: ["Sales Orders", "Register built from the SO Tracking calculation table."],
    search: ["SO Search", "Identity, delivery, manufacturing and work-order progress for one order."],
    machines: ["Machine Status", "Current WO priority — In Progress, then Ready, then Waiting."],
    factory: ["Factory Load", "Open orders, capacity and machine priority from each factory sheet."],
    materials: ["Materials", "Draft requirements, weekly movements and C45 / SS431 availability."],
    outsourcing: ["Outsourcing", "Heat treatment and welding operations on active work orders."],
    clients: ["Suez & Glass", "Dedicated client views plus matching sales orders."],
  };

  function render() {
    $("metaStamp").textContent = "Week " + D.meta.planningWeekCurrent;
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === state.view));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + state.view));
    $("viewTitle").textContent = TITLES[state.view][0];
    $("viewSub").textContent = TITLES[state.view][1];
    ({
      overview: renderOverview, orders: renderOrders, search: renderSearch,
      machines: renderMachines, factory: renderFactory, materials: renderMaterials,
      outsourcing: renderOutsourcing, clients: renderClients,
    })[state.view]();
  }

  function openSO(so) {
    if (!so) return;
    state.selectedSO = so;
    state.view = "search";
    $("soInput").value = so;
    render();
  }

  function bind() {
    $("nav").addEventListener("click", (e) => {
      const b = e.target.closest(".nav-btn");
      if (!b) return;
      state.view = b.dataset.view;
      $("sidebar").classList.remove("open");
      $("backdrop").classList.remove("show");
      render();
    });
    $("menuBtn").onclick = () => {
      $("sidebar").classList.toggle("open");
      $("backdrop").classList.toggle("show");
    };
    $("backdrop").onclick = () => {
      $("sidebar").classList.remove("open");
      $("backdrop").classList.remove("show");
    };
    ["fCompany", "fCustomer", "fDelivery", "fCategory", "fFactory", "fWoStatus"].forEach((id) => {
      $(id).addEventListener("change", (e) => {
        const map = { fCompany: "company", fCustomer: "customer", fDelivery: "delivery", fCategory: "category", fFactory: "factory", fWoStatus: "woStatus" };
        state[map[id]] = e.target.value;
        render();
      });
    });
    $("fSearch").addEventListener("input", (e) => { state.search = e.target.value; render(); });
    $("eligibleOnly").addEventListener("change", (e) => {
      state.eligibleOnly = e.target.checked;
      populateFilters();
      render();
    });
    $("resetFilters").onclick = () => {
      state.company = state.customer = state.delivery = state.category = state.factory = state.woStatus = state.search = "";
      $("fSearch").value = "";
      populateFilters();
      render();
    };
    $("soGo").onclick = () => openSO($("soInput").value.trim().toUpperCase());
    $("soInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") openSO($("soInput").value.trim().toUpperCase());
    });
    document.body.addEventListener("click", (e) => {
      const tr = e.target.closest("tr[data-so]");
      if (tr && tr.dataset.so) openSO(tr.dataset.so);
    });
  }

  populateFilters();
  bind();
  render();
})();
