const OVERSEAS = [
  { symbol: "^DJI", label: "다우존스" },
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^IXIC", label: "나스닥" },
];

const DOMESTIC = [
  { symbol: "^KS11", label: "코스피" },
  { symbol: "^KQ11", label: "코스닥" },
];

async function fetchYahooQuote(symbol, label) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; StockReport/1.0)" },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance 오류 (${symbol}): ${res.status}`);
  }

  const data = await res.json();
  const result = data?.chart?.result?.[0];
  if (!result?.meta) {
    throw new Error(`시세 데이터 없음 (${symbol})`);
  }

  const meta = result.meta;
  const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
  const price = meta.regularMarketPrice ?? null;
  const change = price !== null && prevClose !== null ? price - prevClose : null;
  const pct = change !== null && prevClose ? (change / prevClose) * 100 : null;

  return {
    symbol,
    label,
    name: meta.shortName || label,
    price,
    change,
    pct,
    currency: meta.currency || "",
    marketTime: meta.regularMarketTime
      ? new Date(meta.regularMarketTime * 1000).toISOString()
      : null,
  };
}

async function fetchQuotes(items) {
  const results = await Promise.allSettled(items.map((item) => fetchYahooQuote(item.symbol, item.label)));
  return results.map((result, index) => {
    if (result.status === "fulfilled") return result.value;
    return {
      symbol: items[index].symbol,
      label: items[index].label,
      error: result.reason?.message || "조회 실패",
    };
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  try {
    const [overseas, domestic] = await Promise.all([
      fetchQuotes(OVERSEAS),
      fetchQuotes(DOMESTIC),
    ]);

    return res.status(200).json({
      fetchedAt: new Date().toISOString(),
      source: "Yahoo Finance",
      overseas,
      domestic,
    });
  } catch (err) {
    console.error("market-quotes error:", err);
    return res.status(500).json({
      error: "실시간 증시 시세를 불러오지 못했습니다.",
      detail: (err.message || "").slice(0, 200),
    });
  }
};

module.exports.config = { maxDuration: 30 };
