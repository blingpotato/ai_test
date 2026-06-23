(() => {
  const dropZone = document.getElementById("drop-zone");
  const fileInput = document.getElementById("file-input");
  const browseBtn = document.getElementById("browse-btn");
  const loading = document.getElementById("loading");
  const errorEl = document.getElementById("error");
  const errorText = document.getElementById("error-text");
  const retryBtn = document.getElementById("retry-btn");
  const reportEl = document.getElementById("report");

  function parseFilenameTime(filename) {
    const base = filename.replace(/\.(xlsx|xls)$/i, "").trim();

    const patterns = [
      { re: /(\d{4})_(\d{2})_(\d{2})_(\d{4})$/, fn: (m) => new Date(+m[1], +m[2] - 1, +m[3], +m[4].slice(0, 2), +m[4].slice(2, 4), 0) },
      { re: /(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/, fn: (m) => new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) },
      { re: /(\d{4})-(\d{2})-(\d{2})[_\s](\d{2})-?(\d{2})-?(\d{2})/, fn: (m) => new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) },
      { re: /(\d{4})(\d{2})(\d{2})[_-](\d{4})/, fn: (m) => new Date(+m[1], +m[2] - 1, +m[3], +m[4].slice(0, 2), +m[4].slice(2, 4), 0) },
      { re: /(\d{4})(\d{2})(\d{2})/, fn: (m) => new Date(+m[1], +m[2] - 1, +m[3], 0, 0, 0) },
    ];

    for (const { re, fn } of patterns) {
      const m = base.match(re);
      if (m) {
        const d = fn(m);
        if (!Number.isNaN(d.getTime())) {
          return { date: d, label: d.toLocaleString("ko-KR"), raw: m[0] };
        }
      }
    }
    return { date: null, label: "생성시간 미확인", raw: "" };
  }

  function sheetRows(sheet) {
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  }

  function norm(s) {
    return String(s ?? "").trim().toLowerCase();
  }

  function cellText(row, col = 0) {
    return String(row?.[col] ?? "").trim();
  }

  function toNum(v) {
    if (typeof v === "number") return v;
    const n = Number(String(v).replace(/,/g, "").replace(/%/g, "").replace(/~/g, ""));
    return Number.isFinite(n) ? n : null;
  }

  function changeClass(v) {
    if (v === null || v === 0) return "change-flat";
    return v > 0 ? "change-up" : "change-down";
  }

  function fmtNum(n, digits = 2) {
    if (n === null || n === undefined) return "-";
    return n.toLocaleString("ko-KR", { maximumFractionDigits: digits });
  }

  function fmtPct(n) {
    if (n === null || n === undefined) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${n.toFixed(2)}%`;
  }

  function fmtChange(n) {
    if (n === null || n === undefined) return "-";
    const sign = n > 0 ? "+" : "";
    return `${sign}${fmtNum(n)}`;
  }

  function fmtVolumeMillion(n) {
    if (n === null || n === undefined) return "-";
    if (n >= 10000) return `${fmtNum(n / 100, 0)}억`;
    return `${fmtNum(n, 0)}백만`;
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function isKiwoomFormat(rows) {
    const top = rows.slice(0, 8).map((r) => cellText(r)).join(" ");
    return /■\s*전일\s*미국증시/.test(top) || /■\s*오늘\s*국내증시/.test(top);
  }

  function parseIndicesFromText(text) {
    const items = [];
    const re = /(다우|S&P\s*500?|나스닥|코스피|코스닥)\s*([\d,.]+(?:선)?)\s*\(([+-]?[\d.~%대]+)\)/gi;
    let m;
    while ((m = re.exec(text)) !== null) {
      const name = m[1].replace(/\s+/g, "");
      const priceStr = m[2].replace(/,/g, "").replace(/선$/, "");
      const pctStr = m[3];
      const pctMatch = pctStr.match(/([+-]?[\d.]+)/);
      items.push({
        name: name === "S&P500" || name === "S&P" ? "S&P500" : name,
        price: toNum(priceStr),
        pct: pctMatch ? toNum(pctMatch[1]) : null,
        change: null,
        label: m[0],
      });
    }
    return items;
  }

  function parseKiwoomNarrative(rows) {
    const narrative = {
      overseasTitle: "",
      overseasIndices: [],
      bigtech: "",
      fx: "",
      overseasComment: "",
      domesticTitle: "",
      domesticIndices: [],
      domesticComment: "",
    };

    for (let i = 0; i < Math.min(rows.length, 10); i++) {
      const text = cellText(rows[i]);
      if (!text) continue;

      if (/■\s*전일\s*미국증시/.test(text)) {
        narrative.overseasTitle = text.split(/\s{2,}/)[0] || text;
        narrative.overseasIndices = parseIndicesFromText(text);
      } else if (/빅테크/.test(text)) {
        narrative.bigtech = text.trim();
      } else if (/^\s*·/.test(text) && /환율/.test(text)) {
        narrative.fx = text.trim();
      } else if (text.startsWith("└") && !narrative.overseasComment) {
        narrative.overseasComment = text.replace(/^└\s*/, "").trim();
      } else if (/■\s*오늘\s*국내증시/.test(text)) {
        narrative.domesticTitle = text.split(/\s{2,}/)[0] || text;
        narrative.domesticIndices = parseIndicesFromText(text);
      } else if (text.startsWith("└") && narrative.overseasComment) {
        narrative.domesticComment = text.replace(/^└\s*/, "").trim();
      }
    }

    return narrative;
  }

  function findHeaderRow(rows, keywords) {
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const line = rows[i].map(norm).join(" ");
      if (keywords.every((k) => line.includes(k)) || keywords.some((k) => line.includes(k) && line.includes("순위"))) {
        if (line.includes("순위") && (line.includes("종목") || line.includes("종목명"))) return i;
      }
    }
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const line = rows[i].map(norm).join(" ");
      if (keywords.some((k) => line.includes(k))) return i;
    }
    return 0;
  }

  function colIndex(headers, candidates) {
    const h = headers.map(norm);
    for (const c of candidates) {
      const idx = h.findIndex((x) => x.includes(c));
      if (idx >= 0) return idx;
    }
    return -1;
  }

  function parseKiwoomVolumeTable(rows) {
    const hi = findHeaderRow(rows, ["순위", "종목코드", "거래대금"]);
    const headers = rows[hi] || [];
    const cols = {
      rank: colIndex(headers, ["순위"]),
      code: colIndex(headers, ["종목코드", "코드"]),
      market: colIndex(headers, ["시장"]),
      name: colIndex(headers, ["종목명", "종목"]),
      theme: colIndex(headers, ["테마"]),
      price: colIndex(headers, ["현재가"]),
      change: colIndex(headers, ["전일대비", "대비"]),
      pct: colIndex(headers, ["등락률"]),
      volume: colIndex(headers, ["거래대금"]),
      news: colIndex(headers, ["뉴스"]),
    };

    const items = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some((c) => String(c).trim())) continue;

      const name = String(row[cols.name >= 0 ? cols.name : 3] ?? "").trim();
      const rank = toNum(row[cols.rank >= 0 ? cols.rank : 0]);
      if (!name || rank === null) continue;

      items.push({
        rank,
        code: String(row[cols.code >= 0 ? cols.code : 1] ?? "").trim(),
        market: String(row[cols.market >= 0 ? cols.market : 2] ?? "").trim(),
        name,
        theme: String(row[cols.theme >= 0 ? cols.theme : 5] ?? "").trim(),
        price: toNum(row[cols.price >= 0 ? cols.price : 8]),
        change: toNum(row[cols.change >= 0 ? cols.change : 9]),
        pct: toNum(row[cols.pct >= 0 ? cols.pct : 10]),
        volume: toNum(row[cols.volume >= 0 ? cols.volume : 14]),
        news: String(row[cols.news >= 0 ? cols.news : 15] ?? "").trim(),
      });
    }

    return items.sort((a, b) => a.rank - b.rank);
  }

  function parseKiwoomSheet(rows) {
    const narrative = parseKiwoomNarrative(rows);
    const volume = parseKiwoomVolumeTable(rows);
    return {
      format: "kiwoom",
      narrative,
      domestic: narrative.domesticIndices,
      overseas: narrative.overseasIndices,
      volume,
    };
  }

  function classifySheet(name, rows) {
    const n = norm(name);
    const text = rows.slice(0, 5).flat().map(norm).join(" ");
    if (/국내|kospi|kosdaq|domestic/.test(n) || (/kospi|kosdaq/.test(text) && !/해외/.test(n))) return "domestic";
    if (/해외|global|overseas|world|다우|나스닥/.test(n) || /다우|나스닥|s&p|니케이/.test(text)) return "overseas";
    if (/거래대금|상위|volume|rank|종목/.test(n) || /거래대금|종목명|종목코드/.test(text)) return "volume";
    if (/지수/.test(text) && /해외/.test(text)) return "overseas";
    if (/지수/.test(text)) return "domestic";
    if (/순위/.test(text) && /종목/.test(text)) return "volume";
    return "unknown";
  }

  function parseMarketSheet(rows) {
    const hi = findHeaderRow(rows, ["지수", "index", "구분"]);
    const headers = rows[hi] || [];
    const nameCol = colIndex(headers, ["지수", "index", "명"]);
    const priceCol = colIndex(headers, ["현재", "종가", "price", "지수"]);
    const changeCol = colIndex(headers, ["전일", "대비", "change"]);
    const pctCol = colIndex(headers, ["등락률", "%", "pct"]);

    const items = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some((c) => String(c).trim())) continue;
      const name = String(row[nameCol >= 0 ? nameCol : 1] ?? row[1] ?? "").trim();
      if (!name || name === "구분") continue;
      const price = toNum(row[priceCol >= 0 ? priceCol : 2]);
      const change = toNum(row[changeCol >= 0 ? changeCol : 3]);
      let pct = toNum(row[pctCol >= 0 ? pctCol : 4]);
      if (pct === null && change !== null && price) pct = (change / (price - change)) * 100;
      items.push({ name, price, change, pct });
    }
    return items;
  }

  function parseLegacyVolumeSheet(rows) {
    const hi = findHeaderRow(rows, ["순위", "종목", "거래대금"]);
    const headers = rows[hi] || [];
    const rankCol = colIndex(headers, ["순위", "rank"]);
    const nameCol = colIndex(headers, ["종목명", "종목", "name"]);
    const codeCol = colIndex(headers, ["코드", "code"]);
    const volCol = colIndex(headers, ["거래대금", "대금", "volume"]);
    const pctCol = colIndex(headers, ["등락률", "%"]);
    const priceCol = colIndex(headers, ["현재가", "가격", "price"]);

    const items = [];
    for (let i = hi + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || !row.some((c) => String(c).trim())) continue;
      const name = String(row[nameCol >= 0 ? nameCol : 1] ?? "").trim();
      if (!name) continue;
      items.push({
        rank: toNum(row[rankCol >= 0 ? rankCol : 0]) ?? items.length + 1,
        name,
        code: String(row[codeCol >= 0 ? codeCol : 2] ?? "").trim(),
        market: "",
        theme: "",
        volume: toNum(row[volCol >= 0 ? volCol : 3]),
        pct: toNum(row[pctCol >= 0 ? pctCol : 4]),
        price: toNum(row[priceCol >= 0 ? priceCol : 5]),
        change: null,
        news: "",
      });
    }
    return items.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999));
  }

  function buildAnalysis(data, fileTime) {
    const { domestic, overseas, volume, narrative, format } = data;
    const insights = [];

    if (format === "kiwoom" && narrative) {
      if (narrative.overseasComment) {
        insights.push(narrative.overseasComment.length > 120
          ? `${narrative.overseasComment.slice(0, 120)}…`
          : narrative.overseasComment);
      }
      if (narrative.domesticComment) {
        insights.push(narrative.domesticComment.length > 120
          ? `${narrative.domesticComment.slice(0, 120)}…`
          : narrative.domesticComment);
      }
    }

    const domUp = domestic.filter((d) => (d.pct ?? 0) > 0).length;
    const domDown = domestic.filter((d) => (d.pct ?? 0) < 0).length;
    const ovsUp = overseas.filter((d) => (d.pct ?? 0) > 0).length;
    const ovsDown = overseas.filter((d) => (d.pct ?? 0) < 0).length;

    if (overseas.length) {
      const dow = overseas.find((d) => /다우/.test(d.name));
      const nasdaq = overseas.find((d) => /나스닥/.test(d.name));
      if (dow) insights.push(`전일 다우지수 ${dow.price ? fmtNum(dow.price, 0) + " " : ""}(${dow.pct !== null ? (dow.pct > 0 ? "+" : "") + dow.pct + "%" : "등락 확인"}) 마감.`);
      if (nasdaq) insights.push(`나스닥 ${nasdaq.pct !== null ? (nasdaq.pct > 0 ? "+" : "") + nasdaq.pct + "%" : ""}로 기술주 중심 조정${nasdaq.pct < 0 ? " 압력" : ""}.`);
      if (!format) insights.push(`해외 주요 지수 ${overseas.length}개 중 상승 ${ovsUp}개, 하락 ${ovsDown}개.`);
    }

    if (domestic.length) {
      const kospi = domestic.find((d) => /코스피|kospi/i.test(d.name));
      const kosdaq = domestic.find((d) => /코스닥|kosdaq/i.test(d.name));
      if (kospi) insights.push(`국내 코스피 ${kospi.label || (kospi.pct !== null ? fmtPct(kospi.pct) : "장중 변동")}.`);
      if (kosdaq) insights.push(`코스닥 ${kosdaq.label || (kosdaq.pct !== null ? fmtPct(kosdaq.pct) : "장중 변동")}.`);
      if (!format) insights.push(`국내 지수 ${domestic.length}개 중 상승 ${domUp}개, 하락 ${domDown}개.`);
    }

    if (volume.length) {
      const top = volume[0];
      const totalVol = volume.reduce((s, v) => s + (v.volume ?? 0), 0);
      insights.push(`거래대금 1위 ${top.name}(${top.market || ""}) — ${fmtVolumeMillion(top.volume)}, ${fmtPct(top.pct)}.`);
      insights.push(`상위 ${volume.length}종목 합산 거래대금 약 ${fmtVolumeMillion(totalVol)}.`);

      const kospiCount = volume.filter((v) => /kospi/i.test(v.market)).length;
      const kosdaqCount = volume.filter((v) => /kosdaq/i.test(v.market)).length;
      if (kospiCount || kosdaqCount) {
        insights.push(`상위 종목 시장 구성: KOSPI ${kospiCount}개, KOSDAQ ${kosdaqCount}개.`);
      }

      const themes = {};
      volume.slice(0, 20).forEach((v) => {
        const t = (v.theme || "기타").split("/")[0];
        themes[t] = (themes[t] || 0) + 1;
      });
      const hotTheme = Object.entries(themes).sort((a, b) => b[1] - a[1])[0];
      if (hotTheme) insights.push(`상위권 주요 테마: ${hotTheme[0]} (${hotTheme[1]}종목).`);
    }

    const timeNote = fileTime.date
      ? `본 보고서는 파일명 기준 생성시각 ${fileTime.label}의 증시현황 데이터를 분석했습니다.`
      : "파일명에서 생성시각을 확인하지 못해 업로드 시각 기준으로 분석했습니다.";

    let summary = timeNote + " ";
    if (format === "kiwoom") {
      if (ovsDown > ovsUp) summary += "전일 미국 증시는 기술주 중심 하락 압력이 있었고, ";
      else if (ovsUp > ovsDown) summary += "전일 미국 증시는 상승 우위 흐름이었으며, ";
      if (domDown >= domUp) summary += "국내 증시는 장중 동반 약세가 두드러졌습니다. ";
      else summary += "국내 증시는 장중 상승 우위 흐름입니다. ";
    } else if (domestic.length && overseas.length) {
      summary += `${domUp >= domDown ? "국내 증시 상승 우위" : "국내 증시 하락 우위"}, ${ovsUp >= ovsDown ? "해외 증시 상승 우위" : "해외 증시 하락 우위"}로 나타났습니다. `;
    }
    if (volume.length) {
      summary += `당일 자금은 ${volume[0].name} 등 거래대금 상위 종목에 집중되었습니다.`;
    }

    return { summary, insights };
  }

  function renderNarrative(el, narrative, type) {
    const isOverseas = type === "overseas";
    const title = isOverseas ? narrative.overseasTitle : narrative.domesticTitle;
    const comment = isOverseas ? narrative.overseasComment : narrative.domesticComment;
    const extra = isOverseas
      ? [narrative.bigtech, narrative.fx].filter(Boolean)
      : [];

    const parts = [];
    if (title) parts.push(`<div class="narrative-line"><strong>${escapeHtml(title)}</strong></div>`);
    extra.forEach((line) => parts.push(`<div class="narrative-line">${escapeHtml(line)}</div>`));
    if (comment) parts.push(`<div class="narrative-comment">${escapeHtml(comment)}</div>`);

    el.innerHTML = parts.length ? parts.join("") : '<p class="narrative-line">요약 정보가 없습니다.</p>';
  }

  function renderIndexCards(el, items) {
    if (!items.length) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    el.innerHTML = items.map((item) => `
      <div class="index-card">
        <div class="index-card-name">${escapeHtml(item.name)}</div>
        <div class="index-card-price">${item.price !== null ? fmtNum(item.price) : (item.label || "-")}</div>
        <div class="index-card-change ${changeClass(item.pct)}">${item.pct !== null ? fmtPct(item.pct) : ""}</div>
      </div>
    `).join("");
  }

  function renderVolumeTable(el, items, format) {
    const isKiwoom = format === "kiwoom";
    el.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>순위</th>
            ${isKiwoom ? "<th>시장</th>" : ""}
            <th>종목명</th>
            <th>코드</th>
            ${isKiwoom ? "<th>테마</th>" : ""}
            <th class="text-right">현재가</th>
            <th class="text-right">등락률</th>
            <th class="text-right">거래대금</th>
            ${isKiwoom ? "<th>뉴스 요약</th>" : ""}
          </tr>
        </thead>
        <tbody>${items.map((i) => `
          <tr>
            <td>${i.rank ?? "-"}</td>
            ${isKiwoom ? `<td>${escapeHtml(i.market || "-")}</td>` : ""}
            <td>${escapeHtml(i.name)}</td>
            <td>${escapeHtml(i.code || "-")}</td>
            ${isKiwoom ? `<td>${escapeHtml(i.theme || "-")}</td>` : ""}
            <td class="text-right">${fmtNum(i.price, 0)}</td>
            <td class="text-right ${changeClass(i.pct)}">${fmtPct(i.pct)}</td>
            <td class="text-right">${isKiwoom ? fmtVolumeMillion(i.volume) : fmtNum(i.volume, 0)}</td>
            ${isKiwoom ? `<td class="news-cell">${escapeHtml(i.news || "-")}</td>` : ""}
          </tr>
        `).join("")}</tbody>
      </table>
    `;
  }

  function parseWorkbook(wb, filename) {
    const fileTime = parseFilenameTime(filename);
    const firstSheet = wb.SheetNames[0];
    const firstRows = sheetRows(wb.Sheets[firstSheet]);

    if (isKiwoomFormat(firstRows)) {
      const parsed = parseKiwoomSheet(firstRows);
      const analysis = buildAnalysis({ ...parsed, format: "kiwoom" }, fileTime);
      return {
        format: "kiwoom",
        narrative: parsed.narrative,
        domestic: parsed.domestic,
        overseas: parsed.overseas,
        volume: parsed.volume,
        fileTime,
        filename,
        analysis,
      };
    }

    const domestic = [];
    const overseas = [];
    let volume = [];

    wb.SheetNames.forEach((name) => {
      const rows = sheetRows(wb.Sheets[name]);
      const type = classifySheet(name, rows);
      if (type === "domestic") domestic.push(...parseMarketSheet(rows));
      else if (type === "overseas") overseas.push(...parseMarketSheet(rows));
      else if (type === "volume") {
        const parsed = parseLegacyVolumeSheet(rows);
        if (parsed.length) volume = parsed;
      }
    });

    if (!domestic.length && !overseas.length && !volume.length) {
      throw new Error("증시현황 데이터를 찾지 못했습니다. 키움 거래대금상위 형식 또는 국내·해외·거래대금 시트 구조를 확인해주세요.");
    }

    const analysis = buildAnalysis({ domestic, overseas, volume, format: null }, fileTime);
    return { format: "legacy", narrative: null, domestic, overseas, volume, fileTime, filename, analysis };
  }

  function renderReport(data) {
    document.getElementById("report-time").textContent = `데이터 생성시각: ${data.fileTime.label}`;
    document.getElementById("report-file").textContent = `파일: ${data.filename}`;
    document.getElementById("summary-text").textContent = data.analysis.summary;
    document.getElementById("insight-list").innerHTML = data.analysis.insights.map((t) => `<li>${escapeHtml(t)}</li>`).join("");

    if (data.format === "kiwoom" && data.narrative) {
      const ovsTitle = data.narrative.overseasTitle || "해외 증시 현황";
      const domTitle = data.narrative.domesticTitle || "국내 증시 현황";
      document.getElementById("overseas-title").textContent = ovsTitle.replace(/■\s*/, "").trim() || "해외 증시 현황";
      document.getElementById("domestic-title").textContent = domTitle.replace(/■\s*/, "").trim() || "국내 증시 현황";
      renderNarrative(document.getElementById("overseas-narrative"), data.narrative, "overseas");
      renderNarrative(document.getElementById("domestic-narrative"), data.narrative, "domestic");
    } else {
      document.getElementById("overseas-title").textContent = "해외 증시 현황";
      document.getElementById("domestic-title").textContent = "국내 증시 현황";
      document.getElementById("overseas-narrative").innerHTML = "<p class='narrative-line'>별도 해외 시장 요약이 없습니다.</p>";
      document.getElementById("domestic-narrative").innerHTML = "<p class='narrative-line'>별도 국내 시장 요약이 없습니다.</p>";
    }

    renderIndexCards(document.getElementById("overseas-cards"), data.overseas);
    renderIndexCards(document.getElementById("domestic-cards"), data.domestic);

    const volDesc = data.volume.length
      ? `총 ${data.volume.length}개 종목 · 거래대금 단위: ${data.format === "kiwoom" ? "백만원" : "파일 기준"}`
      : "";
    document.getElementById("volume-desc").textContent = volDesc;
    renderVolumeTable(document.getElementById("volume-table"), data.volume, data.format);
  }

  function showState(state) {
    loading.hidden = state !== "loading";
    errorEl.hidden = state !== "error";
    reportEl.hidden = state !== "report";
    dropZone.style.display = state === "report" ? "none" : "";
  }

  async function processFile(file) {
    if (typeof XLSX === "undefined") {
      throw new Error("엑셀 라이브러리를 불러오지 못했습니다.");
    }

    showState("loading");
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const data = parseWorkbook(wb, file.name);
      renderReport(data);
      showState("report");
    } catch (err) {
      errorText.textContent = err.message || "파일 분석에 실패했습니다.";
      showState("error");
    }
  }

  dropZone.addEventListener("click", () => fileInput.click());
  browseBtn.addEventListener("click", (e) => { e.stopPropagation(); fileInput.click(); });
  fileInput.addEventListener("change", () => {
    if (fileInput.files?.[0]) processFile(fileInput.files[0]);
    fileInput.value = "";
  });
  dropZone.addEventListener("dragover", (e) => { e.preventDefault(); dropZone.classList.add("dragover"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));
  dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
  });
  retryBtn.addEventListener("click", () => {
    errorEl.hidden = true;
    dropZone.style.display = "";
  });

  const MARKET_API_URL = (() => {
    const base = document.querySelector('meta[name="vercel-api-base"]')?.content?.trim().replace(/\/$/, "");
    return base ? `${base}/api/market-quotes` : "/api/market-quotes";
  })();
  const liveMarketLoading = document.getElementById("live-market-loading");
  const liveMarketError = document.getElementById("live-market-error");
  const liveMarketErrorText = document.getElementById("live-market-error-text");
  const liveMarketContent = document.getElementById("live-market-content");
  const liveMarketUpdated = document.getElementById("live-market-updated");
  const liveMarketRefresh = document.getElementById("live-market-refresh");

  function renderLiveQuoteCards(el, items, { compact = false } = {}) {
    if (compact) el.classList.add("index-cards-compact");
    else el.classList.remove("index-cards-compact");

    el.innerHTML = items.map((item) => {
      if (item.error) {
        return `
          <div class="index-card index-card-error${compact ? " index-card-compact" : ""}">
            <div class="index-card-name">${escapeHtml(item.label || item.symbol)}</div>
            <div class="index-card-change change-flat">${escapeHtml(item.error)}</div>
          </div>
        `;
      }

      const digits = item.decimals ?? (item.currency === "KRW" ? 2 : 2);
      const compactClass = compact ? " index-card-compact" : "";
      return `
        <div class="index-card${compactClass}">
          <div class="index-card-name">${escapeHtml(item.label || item.name)}</div>
          <div class="index-card-price">${fmtNum(item.price, digits)}</div>
          <div class="index-card-change ${changeClass(item.change)}">${fmtChange(item.change)} (${fmtPct(item.pct)})</div>
        </div>
      `;
    }).join("");
  }

  function renderLiveSummary(summary) {
    const el = document.getElementById("live-market-summary");
    if (!summary) {
      el.innerHTML = '<p class="live-summary-line">요약 정보를 생성하지 못했습니다.</p>';
      return;
    }

    const parts = [];
    if (summary.overseasLine) {
      parts.push(`<p class="live-summary-line"><strong>해외</strong> ${escapeHtml(summary.overseasLine)}</p>`);
    }
    if (summary.domesticLine) {
      parts.push(`<p class="live-summary-line"><strong>국내</strong> ${escapeHtml(summary.domesticLine)}</p>`);
    }

    const highlights = (summary.highlights || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");

    el.innerHTML = `${parts.join("")}${highlights ? `<ul class="live-summary-highlights">${highlights}</ul>` : ""}`;
  }

  function renderLiveNews(items) {
    const el = document.getElementById("live-market-news");
    if (!items?.length) {
      el.innerHTML = '<li class="live-news-item"><span class="live-news-meta">표시할 뉴스가 없습니다.</span></li>';
      return;
    }

    el.innerHTML = items.map((item) => {
      const date = item.publishedAt
        ? new Date(item.publishedAt).toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
        : "";
      const meta = [item.publisher, date].filter(Boolean).join(" · ");
      const title = escapeHtml(item.title || "제목 없음");
      const url = escapeHtml(item.url || "#");
      return `
        <li class="live-news-item">
          <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
          ${meta ? `<div class="live-news-meta">${escapeHtml(meta)}</div>` : ""}
        </li>
      `;
    }).join("");
  }

  async function loadLiveMarket() {
    liveMarketLoading.hidden = false;
    liveMarketError.hidden = true;
    liveMarketContent.hidden = true;
    liveMarketUpdated.textContent = "불러오는 중…";
    liveMarketRefresh.disabled = true;

    try {
      const res = await fetch(MARKET_API_URL);
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || `시세 API 오류 (${res.status})`);
      }

      renderLiveSummary(data.summary);
      renderLiveQuoteCards(document.getElementById("live-overseas-cards"), data.overseas || []);
      renderLiveQuoteCards(document.getElementById("live-bigtech-cards"), data.bigTech || [], { compact: true });
      renderLiveQuoteCards(document.getElementById("live-commodity-cards"), data.commodities || [], { compact: true });
      renderLiveQuoteCards(document.getElementById("live-domestic-cards"), data.domestic || []);
      renderLiveNews(data.news || []);

      const times = [
        ...(data.overseas || []),
        ...(data.domestic || []),
        ...(data.bigTech || []),
        ...(data.commodities || []),
      ]
        .map((q) => q.marketTime)
        .filter(Boolean)
        .map((t) => new Date(t).getTime())
        .filter((t) => !Number.isNaN(t));

      const latest = times.length ? new Date(Math.max(...times)) : new Date(data.fetchedAt);
      liveMarketUpdated.textContent = `갱신: ${latest.toLocaleString("ko-KR")} · ${data.source || "Yahoo Finance"}`;

      liveMarketLoading.hidden = true;
      liveMarketContent.hidden = false;
    } catch (err) {
      liveMarketLoading.hidden = true;
      liveMarketError.hidden = false;
      liveMarketErrorText.textContent = err.message || "실시간 시세를 불러오지 못했습니다.";
      liveMarketUpdated.textContent = "갱신 실패";
    } finally {
      liveMarketRefresh.disabled = false;
    }
  }

  liveMarketRefresh.addEventListener("click", loadLiveMarket);
  loadLiveMarket();
})();
