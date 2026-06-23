const OVERSEAS = [
  { symbol: "^DJI", label: "다우존스", decimals: 2 },
  { symbol: "^GSPC", label: "S&P 500", decimals: 2 },
  { symbol: "^IXIC", label: "나스닥", decimals: 2 },
];

const DOMESTIC = [
  { symbol: "^KS11", label: "코스피", decimals: 2 },
  { symbol: "^KQ11", label: "코스닥", decimals: 2 },
];

const BIG_TECH = [
  { symbol: "NVDA", label: "엔비디아", decimals: 2 },
  { symbol: "AAPL", label: "애플", decimals: 2 },
  { symbol: "MSFT", label: "MS", decimals: 2 },
  { symbol: "GOOGL", label: "알파벳", decimals: 2 },
  { symbol: "AMZN", label: "아마존", decimals: 2 },
  { symbol: "META", label: "메타", decimals: 2 },
  { symbol: "TSLA", label: "테슬라", decimals: 2 },
  { symbol: "AMD", label: "AMD", decimals: 2 },
  { symbol: "AVGO", label: "브로드컴", decimals: 2 },
];

const COMMODITIES = [
  { symbol: "KRW=X", label: "달러/원", decimals: 2 },
  { symbol: "DX-Y.NYB", label: "달러인덱스", decimals: 2 },
  { symbol: "CL=F", label: "WTI 유가", decimals: 2 },
  { symbol: "GC=F", label: "금", decimals: 2 },
  { symbol: "SI=F", label: "은", decimals: 2 },
];

const UA = { "User-Agent": "Mozilla/5.0 (compatible; StockReport/1.0)" };
const FETCH_TIMEOUT_MS = 8000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchYahooQuote(item) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(item.symbol)}?range=1d&interval=1d`;
  const res = await fetchWithTimeout(url, { headers: UA });

  if (!res.ok) {
    throw new Error(`Yahoo Finance 오류 (${item.symbol}): ${res.status}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.meta) {
    throw new Error(`시세 데이터 없음 (${item.symbol})`);
  }

  const meta = result.meta;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const price = meta.regularMarketPrice ?? null;
  const change = price !== null && prevClose !== null ? price - prevClose : null;
  const pct = change !== null && prevClose ? (change / prevClose) * 100 : null;

  return {
    symbol: item.symbol,
    label: item.label,
    name: meta.shortName || item.label,
    price,
    change,
    pct,
    decimals: item.decimals ?? 2,
    currency: meta.currency || "",
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
  };
}

async function fetchQuotes(items) {
  const results = await Promise.allSettled(items.map((item) => fetchYahooQuote(item)));
  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      symbol: items[index].symbol,
      label: items[index].label,
      error: result.reason?.message || "조회 실패",
    };
  });
}

async function fetchYahooNews(query, limit = 5) {
  const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&newsCount=${limit}&quotesCount=0&listsCount=0`;
  const res = await fetchWithTimeout(url, { headers: UA });
  if (!res.ok) return [];

  const data = await res.json();
  return (data.news || []).map((n) => ({
    title: n.title || "",
    url: n.link || "",
    publisher: n.publisher || "",
    publishedAt: n.providerPublishTime
      ? new Date(n.providerPublishTime * 1000).toISOString()
      : null,
    region: query,
  }));
}

async function fetchMarketNews() {
  const batches = await Promise.allSettled([
    fetchYahooNews("US stock market", 5),
    fetchYahooNews("NASDAQ technology", 4),
    fetchYahooNews("KOSPI Korea stock", 4),
  ]);

  const merged = [];
  const seen = new Set();

  for (const batch of batches) {
    if (batch.status !== "fulfilled") continue;
    for (const item of batch.value) {
      const key = item.url || item.title;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(item);
    }
  }

  return merged.slice(0, 10);
}

function fmtPctSigned(pct) {
  if (pct === null || pct === undefined) return "-";
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function pickMover(items) {
  return [...items]
    .filter((q) => !q.error && q.pct !== null)
    .sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct))[0];
}

function buildSummary(overseas, domestic, bigTech, commodities) {
  const ovs = overseas.filter((q) => !q.error);
  const dom = domestic.filter((q) => !q.error);
  const tech = bigTech.filter((q) => !q.error);
  const comm = commodities.filter((q) => !q.error);

  const overseasLine = ovs.map((q) => `${q.label} ${fmtPctSigned(q.pct)}`).join(" · ");
  const domesticLine = dom.map((q) => `${q.label} ${fmtPctSigned(q.pct)}`).join(" · ");

  const highlights = [];

  const nasdaq = ovs.find((q) => q.symbol === "^IXIC");
  const dow = ovs.find((q) => q.symbol === "^DJI");
  const sp = ovs.find((q) => q.symbol === "^GSPC");

  if (dow && sp && nasdaq) {
    highlights.push(
      `미국 증시: 다우 ${fmtPctSigned(dow.pct)}, S&P500 ${fmtPctSigned(sp.pct)}, 나스닥 ${fmtPctSigned(nasdaq.pct)}.`,
    );
    if (nasdaq.pct < -0.5 && dow.pct > nasdaq.pct) {
      highlights.push("나스닥 하락폭이 커 기술주·성장주 중심 조정 흐름입니다.");
    } else if (nasdaq.pct > 0.5 && nasdaq.pct > dow.pct) {
      highlights.push("나스닥이 상대적으로 강해 기술주가 시장을 주도하고 있습니다.");
    }
  }

  const topTech = pickMover(tech);
  if (topTech) {
    highlights.push(`빅테크·반도체 중 변동 큰 종목: ${topTech.label} ${fmtPctSigned(topTech.pct)}.`);
  }

  const usdkrw = comm.find((q) => q.symbol === "KRW=X");
  const wti = comm.find((q) => q.symbol === "CL=F");
  const gold = comm.find((q) => q.symbol === "GC=F");
  const silver = comm.find((q) => q.symbol === "SI=F");

  const commParts = [];
  if (usdkrw?.price != null) commParts.push(`달러/원 ${usdkrw.price.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}원 (${fmtPctSigned(usdkrw.pct)})`);
  if (wti?.price != null) commParts.push(`WTI ${wti.price.toFixed(1)} (${fmtPctSigned(wti.pct)})`);
  if (gold?.price != null) commParts.push(`금 ${gold.price.toFixed(0)} (${fmtPctSigned(gold.pct)})`);
  if (silver?.price != null) commParts.push(`은 ${silver.price.toFixed(1)} (${fmtPctSigned(silver.pct)})`);
  if (commParts.length) highlights.push(`환율·원자재: ${commParts.join(" · ")}.`);

  const kospi = dom.find((q) => q.symbol === "^KS11");
  const kosdaq = dom.find((q) => q.symbol === "^KQ11");
  if (kospi && kosdaq) {
    highlights.push(`국내 증시: 코스피 ${fmtPctSigned(kospi.pct)}, 코스닥 ${fmtPctSigned(kosdaq.pct)}.`);
    if (kospi.pct < -1 && kosdaq.pct < -1) {
      highlights.push("국내 증시가 동반 약세이며 위험자산 선호가 약화된 흐름입니다.");
    } else if (kospi.pct > 0 && kosdaq.pct > 0) {
      highlights.push("국내 증시가 동반 상승하며 위험자산 선호가 회복된 흐름입니다.");
    }
  }

  return {
    overseasLine,
    domesticLine,
    highlights: highlights.slice(0, 6),
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const [overseas, domestic, bigTech, commodities, news] = await Promise.all([
      fetchQuotes(OVERSEAS),
      fetchQuotes(DOMESTIC),
      fetchQuotes(BIG_TECH),
      fetchQuotes(COMMODITIES),
      fetchMarketNews(),
    ]);

    const summary = buildSummary(overseas, domestic, bigTech, commodities);

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      source: "Yahoo Finance",
      overseas,
      domestic,
      bigTech,
      commodities,
      summary,
      news,
    });
  } catch (err) {
    console.error("market-quotes error:", err);
    return res.status(500).json({
      error: "실시간 증시 시세를 불러오지 못했습니다.",
      detail: (err.message || "").slice(0, 200),
    });
  }
};

module.exports.config = { maxDuration: 60 };
