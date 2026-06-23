(() => {
  const { formatKRW, formatNum, formatPct } = window.ErpData;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function buildSummary(a) {
    const k = a.kpis;
    const topCat = a.categories[0];
    const topCh = a.channels[0];
    const lines = [
      `분석 기간 ${a.dateRange.start} ~ ${a.dateRange.end} (${a.dateRange.months}개월) 동안 유효 매출은 ${formatKRW(k.totalRevenue)}이며, 매출총이익은 ${formatKRW(k.grossProfit)}(이익률 ${formatPct(k.grossMargin)})입니다.`,
      `총 ${formatNum(k.validOrderCount)}건의 유효 주문이 발생했고, 평균 주문금액은 ${formatKRW(k.avgOrderValue)}입니다. 활성 고객은 ${formatNum(k.activeCustomers)}명(전체 ${formatNum(k.totalCustomers)}명)입니다.`,
      `취소율 ${formatPct(k.cancelRate)}, 반품율 ${formatPct(k.returnRate)}이며, 재고 위험 품목은 ${formatNum(k.stockRiskCount)}건입니다.`,
    ];
    if (topCat) lines.push(`카테고리별 매출 1위는 「${topCat.category}」(${formatKRW(topCat.revenue)})입니다.`);
    if (topCh) lines.push(`채널별 매출 1위는 「${topCh.name}」(${formatKRW(topCh.revenue)})입니다.`);
    return lines.join(" ");
  }

  function tableRows(items, cols) {
    if (!items.length) return `<tr><td colspan="${cols}" class="empty">데이터 없음</td></tr>`;
    return items.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("");
  }

  function buildReportHtml(analytics) {
    const k = analytics.kpis;
    const now = new Date().toLocaleString("ko-KR");
    const summary = buildSummary(analytics);

    const kpiRows = [
      ["유효매출", formatKRW(k.totalRevenue), `유효주문 ${formatNum(k.validOrderCount)}건`],
      ["매출원가", formatKRW(k.totalCogs), ""],
      ["매출총이익", formatKRW(k.grossProfit), `이익률 ${formatPct(k.grossMargin)}`],
      ["평균 주문금액", formatKRW(k.avgOrderValue), ""],
      ["판매 수량", `${formatNum(k.unitsSold)}개`, ""],
      ["취소율", formatPct(k.cancelRate), formatKRW(k.cancelledAmount)],
      ["반품율", formatPct(k.returnRate), formatKRW(k.returnedAmount)],
      ["활성 고객", `${formatNum(k.activeCustomers)}명`, `전체 ${formatNum(k.totalCustomers)}명`],
      ["재고 위험", `${formatNum(k.stockRiskCount)}건`, ""],
      ["총 거래액", formatKRW(k.grossRevenue), "취소·반품 포함"],
    ];

    const productRows = analytics.topProducts.slice(0, 10).map((p, i) => [
      String(i + 1),
      escapeHtml(p.productName),
      escapeHtml(p.category),
      formatKRW(p.revenue),
      formatNum(p.units),
      formatPct(p.margin),
    ]);

    const customerRows = analytics.topCustomers.slice(0, 10).map((c, i) => [
      String(i + 1),
      escapeHtml(c.customerName),
      escapeHtml(c.tier),
      escapeHtml(c.city),
      formatKRW(c.revenue),
      formatNum(c.orders),
    ]);

    const channelRows = analytics.channels.slice(0, 8).map((c) => [
      escapeHtml(c.name),
      formatKRW(c.revenue),
      `${formatNum(c.orders)}건`,
    ]);

    const stockRows = analytics.stockRisks.slice(0, 10).map((s) => [
      escapeHtml(s.productName),
      escapeHtml(s.category),
      formatNum(s.stockQty),
      s.coverMonths === null ? "-" : String(s.coverMonths),
      escapeHtml(s.message),
    ]);

    const monthlyRows = analytics.monthly.slice(-12).map((m) => [
      escapeHtml(m.label),
      formatKRW(m.revenue),
      formatKRW(m.grossProfit),
      `${formatNum(m.orders)}건`,
    ]);

    return `
      <div class="pdf-report">
        <header class="pdf-header">
          <div class="pdf-brand">ERP ANALYTICS</div>
          <h1>ERP 분석 보고서</h1>
          <p class="pdf-meta">분석 기간: ${escapeHtml(analytics.dateRange.start)} ~ ${escapeHtml(analytics.dateRange.end)} (${analytics.dateRange.months}개월)</p>
          <p class="pdf-meta">생성일시: ${escapeHtml(now)}</p>
          <p class="pdf-meta">상품 ${formatNum(k.productCount)}종 · 고객 ${formatNum(k.totalCustomers)}명 · 주문 ${formatNum(k.orderCount)}건</p>
        </header>

        <section class="pdf-section">
          <h2>경영 요약</h2>
          <p class="pdf-summary">${escapeHtml(summary)}</p>
        </section>

        <section class="pdf-section">
          <h2>핵심 지표 (KPI)</h2>
          <table class="pdf-table">
            <thead><tr><th>지표</th><th>값</th><th>비고</th></tr></thead>
            <tbody>${tableRows(kpiRows, 3)}</tbody>
          </table>
        </section>

        <section class="pdf-section">
          <h2>월별 매출 추이</h2>
          <table class="pdf-table">
            <thead><tr><th>월</th><th>매출</th><th>매출총이익</th><th>주문수</th></tr></thead>
            <tbody>${tableRows(monthlyRows, 4)}</tbody>
          </table>
        </section>

        <section class="pdf-section">
          <h2>채널별 매출</h2>
          <table class="pdf-table">
            <thead><tr><th>채널</th><th>매출</th><th>주문수</th></tr></thead>
            <tbody>${tableRows(channelRows, 3)}</tbody>
          </table>
        </section>

        <section class="pdf-section">
          <h2>상위 상품 (매출 TOP 10)</h2>
          <table class="pdf-table">
            <thead><tr><th>#</th><th>상품</th><th>카테고리</th><th>매출</th><th>수량</th><th>이익률</th></tr></thead>
            <tbody>${tableRows(productRows, 6)}</tbody>
          </table>
        </section>

        <section class="pdf-section">
          <h2>상위 고객 (매출 TOP 10)</h2>
          <table class="pdf-table">
            <thead><tr><th>#</th><th>고객</th><th>등급</th><th>지역</th><th>매출</th><th>주문수</th></tr></thead>
            <tbody>${tableRows(customerRows, 6)}</tbody>
          </table>
        </section>

        <section class="pdf-section">
          <h2>재고 위험 품목</h2>
          <table class="pdf-table">
            <thead><tr><th>상품</th><th>카테고리</th><th>재고</th><th>커버(개월)</th><th>상태</th></tr></thead>
            <tbody>${tableRows(stockRows, 5)}</tbody>
          </table>
        </section>

        <footer class="pdf-footer">
          ERP DATA ANALYTICS · 본 보고서는 업로드된 ERP CSV 데이터를 브라우저에서 분석하여 자동 생성되었습니다.
        </footer>
      </div>
    `;
  }

  async function downloadPdf(analytics) {
    if (typeof html2pdf === "undefined") {
      throw new Error("PDF 라이브러리를 불러오지 못했습니다.");
    }

    const container = document.createElement("div");
    container.id = "pdf-report-container";
    container.innerHTML = buildReportHtml(analytics);
    document.body.appendChild(container);

    const filename = `ERP_분석보고서_${analytics.dateRange.end || "report"}.pdf`;

    try {
      await html2pdf().set({
        margin: [12, 12, 12, 12],
        filename,
        image: { type: "jpeg", quality: 0.95 },
        html2canvas: { scale: 2, useCORS: true, logging: false },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["avoid-all", "css", "legacy"] },
      }).from(container.querySelector(".pdf-report")).save();
    } finally {
      container.remove();
    }
  }

  window.ErpReport = { downloadPdf, buildReportHtml, buildSummary };
})();
