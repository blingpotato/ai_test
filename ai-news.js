(() => {
  const API_URL = "/api/generate-report";
  const DAYS = 3;

  const form = document.getElementById("search-form");
  const keywordInput = document.getElementById("keyword-input");
  const generateBtn = document.getElementById("generate-btn");
  const emptyEl = document.getElementById("empty-state");
  const loadingEl = document.getElementById("loading");
  const loadingTextEl = document.getElementById("loading-text");
  const errorEl = document.getElementById("error");
  const errorTextEl = document.getElementById("error-text");
  const reportEl = document.getElementById("report");
  const retryBtn = document.getElementById("retry-btn");

  let lastKeyword = "";

  function threeDaysAgo() {
    return new Date(Date.now() - DAYS * 24 * 60 * 60 * 1000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  function formatFullDate(d) {
    return d.toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric", weekday: "short",
    });
  }

  function formatRelative(dateStr) {
    if (!dateStr) return "";
    const d = new Date(dateStr);
    if (Number.isNaN(d.getTime())) return dateStr;
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 3600) return `${Math.max(1, Math.floor(diff / 60))}분 전`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}시간 전`;
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  }

  function setState(state) {
    emptyEl.classList.toggle("is-visible", state === "idle");
    loadingEl.classList.toggle("is-visible", state === "loading");
    errorEl.classList.toggle("is-visible", state === "error");
    reportEl.classList.toggle("is-visible", state === "done");
    generateBtn.disabled = state === "loading";
  }

  async function fetchReport(keyword) {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword }),
    });

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("서버 응답을 읽을 수 없습니다. Vercel 배포 URL에서 접속 중인지 확인해주세요.");
    }

    if (!res.ok) throw new Error(data.error || data.detail || "보고서 생성 실패");
    return data;
  }

  function renderReport(data) {
    const periodStart = threeDaysAgo();
    const periodEnd = new Date();
    const topStories = data.topStories || [];
    const articles = data.articles || [];
    const dailyTrends = data.dailyTrends || [];

    reportEl.innerHTML = `
      <header class="report-header">
        <span class="report-badge">AI 뉴스 분석 보고서</span>
        <h2 class="report-title">「${escapeHtml(data.keyword)}」 키워드 분석</h2>
        <div class="report-meta">
          <span>📅 ${formatFullDate(periodStart)} ~ ${formatFullDate(periodEnd)}</span>
          <span>🕐 생성: ${new Date(data.generatedAt || Date.now()).toLocaleString("ko-KR")}</span>
          <span>📊 수집: ${articles.length}건 (Google 검색 · Gemini)</span>
        </div>
      </header>

      <section class="report-section">
        <h3>1. 요약</h3>
        <p class="report-body">${escapeHtml(data.summary)}</p>
      </section>

      <section class="report-section">
        <h3>2. 주요 이슈</h3>
        <p class="report-body theme-text">${escapeHtml(data.themes)}</p>
      </section>

      <section class="report-section">
        <h3>3. 핵심 뉴스 Top ${topStories.length}</h3>
        <ol class="report-list">
          ${topStories.map((a) => `
            <li>
              <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(a.title)}</a>
              <span class="item-meta">${escapeHtml(a.publisher || "")} · ${formatRelative(a.date)}</span>
            </li>
          `).join("")}
        </ol>
      </section>

      <section class="report-section">
        <h3>4. 일별 동향</h3>
        ${dailyTrends.length === 0
          ? "<p class='report-body'>일별 데이터가 없습니다.</p>"
          : dailyTrends.map((day) => `
            <div class="day-group">
              <h4>${escapeHtml(day.date)} <span class="day-count">${(day.headlines || []).length}건</span></h4>
              <ul class="day-list">
                ${(day.headlines || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("")}
              </ul>
            </div>
          `).join("")}
      </section>

      <section class="report-section">
        <h3>5. 전체 뉴스 목록</h3>
        <div class="news-list">
          ${articles.map((a) => `
            <a class="news-card" href="${escapeHtml(a.url)}" target="_blank" rel="noopener noreferrer">
              <div class="news-card-title">${escapeHtml(a.title)}</div>
              ${a.snippet ? `<p class="news-snippet">${escapeHtml(a.snippet)}</p>` : ""}
              <div class="news-card-meta">
                <span class="news-tag">Google</span>
                ${a.publisher ? `<span>${escapeHtml(a.publisher)}</span>` : ""}
                <span>${formatRelative(a.date)}</span>
              </div>
            </a>
          `).join("")}
        </div>
      </section>
    `;
  }

  async function generateReport(keyword) {
    if (!keyword.trim()) return;
    lastKeyword = keyword.trim();
    setState("loading");
    loadingTextEl.textContent = `「${lastKeyword}」 Google 검색 중... Gemini가 보고서를 작성하고 있습니다.`;

    try {
      const data = await fetchReport(lastKeyword);
      renderReport(data);
      setState("done");
      reportEl.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
      const msg = err.message || "";
      if (msg.includes("GEMINI_API_KEY")) {
        errorTextEl.textContent = "API 키가 설정되지 않았습니다. Vercel 환경변수에 GEMINI_API_KEY를 등록해주세요.";
      } else if (msg.includes("Failed to fetch") || msg.includes("NetworkError")) {
        errorTextEl.textContent = "API 서버에 연결할 수 없습니다. Vercel에 배포된 URL에서 접속해주세요.";
      } else {
        errorTextEl.textContent = msg || "보고서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";
      }
      setState("error");
    }
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    generateReport(keywordInput.value);
  });

  retryBtn.addEventListener("click", () => {
    if (lastKeyword) generateReport(lastKeyword);
  });

  setState("idle");
})();
