const MODELS = [
  "gemini-2.0-flash",
  "gemini-2.5-flash",
  "gemini-1.5-flash",
];

function buildPrompt(keyword) {
  const today = new Date().toISOString().slice(0, 10);
  return `Google 검색을 사용해 "${keyword}" 관련 최근 3일 이내 주요 뉴스를 조사하고 한국어 분석 보고서를 JSON으로 작성하세요.

오늘: ${today}

아래 JSON 형식만 출력하세요. 마크다운 코드블록 없이 순수 JSON만:
{"summary":"요약 3문장","themes":"주요 이슈 2문장","topStories":[{"title":"","url":"","publisher":"","date":"YYYY-MM-DD"}],"dailyTrends":[{"date":"YYYY-MM-DD","headlines":["",""]}],"articles":[{"title":"","url":"","publisher":"","date":"YYYY-MM-DD","snippet":""}]}

topStories 5건, articles 8건 이상, 실제 검색된 URL 포함.`;
}

function extractJson(text) {
  if (!text) throw new Error("Gemini 응답이 비어 있습니다.");
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1) throw new Error("JSON 형식 응답을 받지 못했습니다.");
  return JSON.parse(raw.slice(start, end + 1));
}

function mergeGroundingSources(report, groundingMetadata) {
  const chunks = groundingMetadata?.groundingChunks || [];
  const fromSearch = chunks
    .filter((c) => c.web?.uri)
    .map((c) => ({
      title: c.web.title || "관련 뉴스",
      url: c.web.uri,
      publisher: "Google 검색",
      date: new Date().toISOString().slice(0, 10),
      snippet: "",
    }));

  if (!fromSearch.length) return report;

  const existing = new Set((report.articles || []).map((a) => a.url));
  const extra = fromSearch.filter((a) => !existing.has(a.url));
  report.articles = [...(report.articles || []), ...extra].slice(0, 15);

  if (!report.topStories?.length) {
    report.topStories = report.articles.slice(0, 5);
  }

  return report;
}

async function callGeminiModel(keyword, apiKey, model) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: buildPrompt(keyword) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.3 },
      }),
    }
  );

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`[${model}] ${res.status}: ${body.slice(0, 300)}`);
  }

  const data = JSON.parse(body);
  const candidate = data.candidates?.[0];
  if (!candidate?.content?.parts?.length) {
    const reason = candidate?.finishReason || data.promptFeedback?.blockReason || "unknown";
    throw new Error(`[${model}] 응답 없음 (${reason})`);
  }

  const text = candidate.content.parts.map((p) => p.text || "").join("");
  const report = extractJson(text);
  return mergeGroundingSources(report, candidate.groundingMetadata);
}

async function callGemini(keyword, apiKey) {
  let lastError;
  for (const model of MODELS) {
    try {
      return await callGeminiModel(keyword, apiKey, model);
    } catch (err) {
      console.error(`Model ${model} failed:`, err.message);
      lastError = err;
    }
  }
  throw lastError || new Error("모든 모델 호출 실패");
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY가 Vercel 환경변수에 설정되지 않았습니다." });
  }

  let keyword;
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    keyword = body?.keyword?.trim();
  } catch {
    return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
  }

  if (!keyword) {
    return res.status(400).json({ error: "키워드를 입력해주세요." });
  }

  try {
    const report = await callGemini(keyword, apiKey);
    return res.status(200).json({
      keyword,
      generatedAt: new Date().toISOString(),
      summary: report.summary || "",
      themes: report.themes || "",
      topStories: report.topStories || [],
      dailyTrends: report.dailyTrends || [],
      articles: report.articles || [],
    });
  } catch (err) {
    console.error("generate-report error:", err);
    const msg = err.message || "";
    let userMsg = "보고서 생성에 실패했습니다. 잠시 후 다시 시도해주세요.";

    if (msg.includes("API key") || msg.includes("API_KEY")) {
      userMsg = "Gemini API 키가 유효하지 않습니다. Vercel의 GEMINI_API_KEY를 확인해주세요.";
    } else if (msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED")) {
      userMsg = "API 호출 한도를 초과했습니다. 잠시 후 다시 시도해주세요.";
    } else if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      userMsg = "Gemini API 접근 권한이 없습니다. API 키와 결제 설정을 확인해주세요.";
    }

    return res.status(500).json({ error: userMsg, detail: msg.slice(0, 200) });
  }
};

module.exports.config = { maxDuration: 60 };
