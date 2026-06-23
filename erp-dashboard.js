(() => {
  const { loadDataset, computeAnalytics, formatKRW, formatNum, formatPct } = window.ErpData;

  const CHART_COLORS = ["#111111", "#1151ff", "#007d48", "#0a7281", "#7c5cfc", "#ed1aa0", "#a66400", "#9e9ea0", "#d30005", "#39393b"];
  const STATUS_COLORS = {
    "결제완료": "#007d48",
    "배송완료": "#111111",
    "배송중": "#1151ff",
    "주문접수": "#a66400",
    "반품": "#9e9ea0",
    "취소": "#d30005",
  };

  const loading = document.getElementById("loading");
  const noData = document.getElementById("no-data");
  const dashboard = document.getElementById("dashboard");
  const kpiGrid = document.getElementById("kpi-grid");
  const dashPeriod = document.getElementById("dash-period");
  const dashMeta = document.getElementById("dash-meta");

  let charts = [];
  let currentAnalytics = null;

  function destroyCharts() {
    charts.forEach((c) => c.destroy());
    charts = [];
  }

  function chartDefaults() {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { font: { size: 11 }, boxWidth: 12 } },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.parsed.y ?? ctx.parsed.x ?? ctx.parsed;
              if (typeof v === "number" && v > 1000) return `${ctx.dataset.label || ""}: ${formatKRW(v)}`;
              return `${ctx.dataset.label || ctx.label || ""}: ${formatNum(v)}`;
            },
          },
        },
      },
      scales: {
        x: { grid: { color: "#e5e5e5" }, ticks: { font: { size: 10 } } },
        y: { grid: { color: "#e5e5e5" }, ticks: { font: { size: 10 }, callback: (v) => window.ErpData.formatAxis(v) } },
      },
    };
  }

  function badgeHtml(level, label) {
    const labels = { normal: "정상", warning: "주의", danger: "위험" };
    return `<span class="badge badge-${level}">${label || labels[level]}</span>`;
  }

  function kpiCard(label, value, sub, level, badgeLabel) {
    const border = level ? `border-${level === "normal" ? "success" : level}` : "";
    return `
      <div class="kpi-card nk-card ${border}">
        <div class="kpi-top">
          <span class="kpi-label">${label}</span>
          ${level ? badgeHtml(level, badgeLabel) : ""}
        </div>
        <div class="kpi-value">${value}</div>
        ${sub ? `<div class="kpi-sub">${sub}</div>` : ""}
      </div>
    `;
  }

  function renderKpis(k, analytics) {
    kpiGrid.innerHTML = [
      kpiCard("유효매출", formatKRW(k.totalRevenue), `유효주문 ${formatNum(k.validOrderCount)}건`),
      kpiCard("매출원가", formatKRW(k.totalCogs)),
      kpiCard("매출총이익", formatKRW(k.grossProfit)),
      kpiCard("매출총이익률", formatPct(k.grossMargin), "", analytics.marginLevel(k.grossMargin)),
      kpiCard("평균 주문금액", formatKRW(k.avgOrderValue)),
      kpiCard("판매 수량", `${formatNum(k.unitsSold)}개`),
      kpiCard("취소율", formatPct(k.cancelRate), formatKRW(k.cancelledAmount), analytics.rateLevel(k.cancelRate, 0.08, 0.12)),
      kpiCard("반품율", formatPct(k.returnRate), formatKRW(k.returnedAmount), analytics.rateLevel(k.returnRate, 0.05, 0.08)),
      kpiCard("활성 고객", `${formatNum(k.activeCustomers)}명`, `전체 ${formatNum(k.totalCustomers)}명`),
      kpiCard("재고 위험", `${formatNum(k.stockRiskCount)}건`, "", k.stockRiskCount > 0 ? "warning" : "normal"),
      kpiCard("단종 상품", `${formatNum(k.discontinuedCount)}건`, "", k.discontinuedCount > 0 ? "warning" : "normal"),
      kpiCard("총 거래액", formatKRW(k.grossRevenue), "취소·반품 포함"),
    ].join("");
  }

  function hideLoading() {
    loading.hidden = true;
    loading.classList.add("is-hidden");
    loading.style.display = "none";
  }

  function renderCharts(a) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js not loaded");
      return;
    }
    destroyCharts();
    const opts = chartDefaults();

    charts.push(new Chart(document.getElementById("chart-monthly"), {
      type: "line",
      data: {
        labels: a.monthly.map((m) => m.label),
        datasets: [
          {
            label: "매출",
            data: a.monthly.map((m) => m.revenue),
            borderColor: "#111111",
            backgroundColor: "rgba(17,17,17,0.12)",
            fill: true,
            tension: 0.3,
            yAxisID: "y",
          },
          {
            label: "매출총이익",
            data: a.monthly.map((m) => m.grossProfit),
            borderColor: "#007d48",
            backgroundColor: "transparent",
            tension: 0.3,
            yAxisID: "y",
          },
        ],
      },
      options: { ...opts, scales: opts.scales },
    }));

    charts.push(new Chart(document.getElementById("chart-category"), {
      type: "bar",
      data: {
        labels: a.categories.map((c) => c.category),
        datasets: [{ label: "매출", data: a.categories.map((c) => c.revenue), backgroundColor: CHART_COLORS }],
      },
      options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } },
    }));

    charts.push(new Chart(document.getElementById("chart-channel"), {
      type: "bar",
      data: {
        labels: a.channels.map((c) => c.name),
        datasets: [{ label: "매출", data: a.channels.map((c) => c.revenue), backgroundColor: CHART_COLORS }],
      },
      options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } },
    }));

    charts.push(new Chart(document.getElementById("chart-payment"), {
      type: "doughnut",
      data: {
        labels: a.payments.map((p) => p.name),
        datasets: [{ data: a.payments.map((p) => p.revenue), backgroundColor: CHART_COLORS }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: opts.plugins },
    }));

    charts.push(new Chart(document.getElementById("chart-tier"), {
      type: "bar",
      data: {
        labels: a.tiers.map((t) => t.name),
        datasets: [{ label: "매출", data: a.tiers.map((t) => t.value), backgroundColor: CHART_COLORS }],
      },
      options: { ...opts, plugins: { ...opts.plugins, legend: { display: false } } },
    }));

    charts.push(new Chart(document.getElementById("chart-status"), {
      type: "doughnut",
      data: {
        labels: a.orderStatus.map((s) => s.name),
        datasets: [{
          data: a.orderStatus.map((s) => s.value),
          backgroundColor: a.orderStatus.map((s, i) => STATUS_COLORS[s.name] || CHART_COLORS[i % CHART_COLORS.length]),
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          ...opts.plugins,
          tooltip: {
            callbacks: {
              label(ctx) {
                return `${ctx.label}: ${formatNum(ctx.parsed)}건`;
              },
            },
          },
        },
      },
    }));

    charts.push(new Chart(document.getElementById("chart-brand"), {
      type: "bar",
      data: {
        labels: a.brands.map((b) => b.name),
        datasets: [{ label: "매출", data: a.brands.map((b) => b.value), backgroundColor: CHART_COLORS }],
      },
      options: {
        ...opts,
        indexAxis: "y",
        plugins: { ...opts.plugins, legend: { display: false } },
      },
    }));

    charts.push(new Chart(document.getElementById("chart-city"), {
      type: "bar",
      data: {
        labels: a.cities.map((c) => c.name),
        datasets: [{ label: "매출", data: a.cities.map((c) => c.value), backgroundColor: CHART_COLORS }],
      },
      options: {
        ...opts,
        indexAxis: "y",
        plugins: { ...opts.plugins, legend: { display: false } },
      },
    }));
  }

  function renderTable(el, columns, rows, emptyMsg = "표시할 데이터가 없습니다.") {
    if (!rows.length) {
      el.innerHTML = `<table class="data-table"><tbody><tr><td class="empty" colspan="${columns.length}">${emptyMsg}</td></tr></tbody></table>`;
      return;
    }
    el.innerHTML = `
      <table class="data-table">
        <thead><tr>${columns.map((c) => `<th class="${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}">${c.header}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row, i) => `<tr>${columns.map((c) => `<td class="${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}">${c.render(row, i)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    `;
  }

  function renderTables(a) {
    renderTable(document.getElementById("table-products"), [
      { key: "rank", header: "#", align: "right", render: (_, i) => i + 1 },
      { key: "name", header: "상품", render: (r) => r.productName },
      { key: "category", header: "카테고리", render: (r) => r.category },
      { key: "revenue", header: "매출", align: "right", render: (r) => formatKRW(r.revenue) },
      { key: "units", header: "수량", align: "right", render: (r) => formatNum(r.units) },
      { key: "margin", header: "이익률", align: "right", render: (r) => formatPct(r.margin) },
    ], a.topProducts);

    renderTable(document.getElementById("table-customers"), [
      { key: "rank", header: "#", align: "right", render: (_, i) => i + 1 },
      { key: "name", header: "고객", render: (r) => r.customerName },
      { key: "tier", header: "등급", align: "center", render: (r) => r.tier },
      { key: "city", header: "지역", render: (r) => r.city },
      { key: "revenue", header: "매출", align: "right", render: (r) => formatKRW(r.revenue) },
      { key: "orders", header: "주문수", align: "right", render: (r) => formatNum(r.orders) },
    ], a.topCustomers);

    renderTable(document.getElementById("table-stock"), [
      { key: "name", header: "상품", render: (r) => r.productName },
      { key: "category", header: "카테고리", render: (r) => r.category },
      { key: "brand", header: "브랜드", render: (r) => r.brand },
      { key: "stock", header: "재고", align: "right", render: (r) => formatNum(r.stockQty) },
      { key: "velocity", header: "월평균판매", align: "right", render: (r) => formatNum(r.monthlyVelocity) },
      { key: "cover", header: "커버(개월)", align: "right", render: (r) => r.coverMonths === null ? "-" : r.coverMonths },
      { key: "status", header: "상태", align: "center", render: (r) => badgeHtml(r.level, r.message) },
    ], a.stockRisks.slice(0, 15), "재고 위험 품목이 없습니다.");
  }

  function render(analytics) {
    const k = analytics.kpis;
    dashPeriod.textContent = `분석 기간 ${analytics.dateRange.start} ~ ${analytics.dateRange.end} (${analytics.dateRange.months}개월)`;
    dashMeta.textContent = `상품 ${formatNum(k.productCount)} · 고객 ${formatNum(k.totalCustomers)} · 주문 ${formatNum(k.orderCount)}`;

    renderKpis(k, analytics);
    requestAnimationFrame(() => {
      renderCharts(analytics);
    });
    renderTables(analytics);
  }

  function showNoData() {
    hideLoading();
    noData.hidden = false;
    noData.classList.remove("is-hidden");
    dashboard.hidden = true;
    dashboard.classList.add("is-hidden");
  }

  function showDashboard(analytics) {
    hideLoading();
    noData.hidden = true;
    noData.classList.add("is-hidden");
    dashboard.hidden = false;
    dashboard.classList.remove("is-hidden");
    currentAnalytics = analytics;
    try {
      render(analytics);
    } catch (err) {
      console.error("dashboard render error:", err);
    }
  }

  async function init() {
    try {
      const saved = await Promise.race([
        loadDataset(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("데이터 로드 시간 초과")), 15000)),
      ]);

      if (!saved?.validation?.ok || !saved?.data?.products?.rows?.length) {
        showNoData();
        return;
      }

      const analytics = computeAnalytics(saved.data);
      showDashboard(analytics);
    } catch (err) {
      console.error("dashboard init error:", err);
      showNoData();
    }
  }

  let resizeTimer;
  window.addEventListener("resize", () => {
    if (!currentAnalytics) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => renderCharts(currentAnalytics), 200);
  });

  init();
})();
