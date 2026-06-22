const MODEL = "gemini-2.0-flash";

function buildPrompt(keyword) {
  const today = new Date().toISOString().slice(0, 10);
  return `Google 검색을 사용해 "${keyword}" 키워드와 관련된 최근 3일 이내 주요 뉴스를 조사하고 한국어 분석 보고서를 작성하세요.

오늘 날짜: ${today}
검색 시 "최근 3일", "latest news" 등을 활용해 최신 뉴스만 수집하세요.

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.
{
  "summary": "전체 요약 3~5문장",
  "themes": "주요 이슈 및 트렌드 설명 (2~4문장)",
  "topStories": [
    { "title": "뉴스 제목", "url": "https://...", "publisher": "언론사", "date": "YYYY-MM-DD" }
  ],
  "dailyTrends": [
    { "date": "YYYY-MM-DD", "headlines": ["헤드라인1", "헤드라인2"] }
  ],
  "articles": [
    { "title": "뉴스 제목", "url": "https://...", "publisher": "언론사", "date": "YYYY-MM-DD", "snippet": "한 줄 요약" }
  ]
}

topStories는 5건, articles는 10건 이상, 실제 검색된 뉴스 URL을 포함하세요.`;
}

async function callGemini(keyword, apiKey) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPrompt(keyword) }] }],
        tools: [{ google_search: {} }],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.4,
        },
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} ${err}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response");

  return JSON.parse(text);
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

  const keyword = typeof req.body === "string" ? JSON.parse(req.body).keyword : req.body?.keyword;
  if (!keyword?.trim()) {
    return res.status(400).json({ error: "키워드를 입력해주세요." });
  }

  try {
    const report = await callGemini(keyword.trim(), apiKey);
    return res.status(200).json({
      keyword: keyword.trim(),
      generatedAt: new Date().toISOString(),
      ...report,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "보고서 생성에 실패했습니다. 잠시 후 다시 시도해주세요." });
  }
}
