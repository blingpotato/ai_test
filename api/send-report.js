function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(report) {
  const topStories = report.topStories || [];
  const articles = report.articles || [];
  const dailyTrends = report.dailyTrends || [];

  const topList = topStories.map((a, i) => `
    <li style="margin-bottom:12px;">
      <strong>${i + 1}. ${escapeHtml(a.title)}</strong><br>
      <span style="color:#64748b;font-size:13px;">${escapeHtml(a.publisher || "")} · ${escapeHtml(a.date || "")}</span><br>
      <a href="${escapeHtml(a.url)}" style="color:#8b5cf6;">${escapeHtml(a.url)}</a>
    </li>
  `).join("");

  const dailyHtml = dailyTrends.map((day) => `
    <div style="margin-bottom:16px;">
      <h3 style="margin:0 0 8px;font-size:15px;">${escapeHtml(day.date)}</h3>
      <ul style="margin:0;padding-left:20px;">${(day.headlines || []).map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>
    </div>
  `).join("");

  const articleList = articles.map((a) => `
    <div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;margin-bottom:10px;">
      <div style="font-weight:600;margin-bottom:4px;">${escapeHtml(a.title)}</div>
      ${a.snippet ? `<div style="color:#64748b;font-size:13px;margin-bottom:6px;">${escapeHtml(a.snippet)}</div>` : ""}
      <div style="font-size:12px;color:#94a3b8;">${escapeHtml(a.publisher || "")} · ${escapeHtml(a.date || "")}</div>
      <a href="${escapeHtml(a.url)}" style="color:#8b5cf6;font-size:13px;">${escapeHtml(a.url)}</a>
    </div>
  `).join("");

  return `
    <div style="font-family:sans-serif;max-width:640px;margin:0 auto;color:#1e293b;">
      <div style="background:#8b5cf6;color:#fff;padding:20px;border-radius:12px 12px 0 0;">
        <div style="font-size:12px;opacity:0.9;">News Report</div>
        <h1 style="margin:8px 0 0;font-size:22px;">「${escapeHtml(report.keyword)}」 뉴스 분석 보고서</h1>
      </div>
      <div style="background:#f8fafc;padding:24px;border:1px solid #e2e8f0;border-top:none;">
        <h2 style="font-size:16px;color:#8b5cf6;">1. 요약</h2>
        <p style="line-height:1.7;">${escapeHtml(report.summary)}</p>
        <h2 style="font-size:16px;color:#8b5cf6;">2. 주요 이슈</h2>
        <p style="line-height:1.7;">${escapeHtml(report.themes)}</p>
        <h2 style="font-size:16px;color:#8b5cf6;">3. 핵심 뉴스</h2>
        <ol style="padding-left:20px;">${topList}</ol>
        <h2 style="font-size:16px;color:#8b5cf6;">4. 일별 동향</h2>
        ${dailyHtml || "<p>데이터 없음</p>"}
        <h2 style="font-size:16px;color:#8b5cf6;">5. 전체 뉴스 목록</h2>
        ${articleList}
        <p style="font-size:12px;color:#94a3b8;margin-top:24px;">생성: ${escapeHtml(report.generatedAt || new Date().toISOString())}</p>
      </div>
    </div>
  `;
}

function isTestMode() {
  const from = process.env.REPORT_FROM_EMAIL || "onboarding@resend.dev";
  return from.includes("resend.dev");
}

function formatResendError(message) {
  if (message?.includes("only send testing emails")) {
    const match = message.match(/\(([^)]+@[^)]+)\)/);
    const email = match?.[1] || process.env.RESEND_TEST_EMAIL || "Resend 가입 이메일";
    return `테스트 모드에서는 ${email} 로만 전송할 수 있습니다. 다른 주소로내려면 resend.com/domains 에서 도메인을 인증해주세요.`;
  }
  return message || "메일 전송에 실패했습니다.";
}

async function sendEmail(to, report) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.REPORT_FROM_EMAIL || "News Report <onboarding@resend.dev>";
  const allowedEmail = process.env.RESEND_TEST_EMAIL;

  if (!apiKey) {
    throw new Error("RESEND_API_KEY가 Vercel 환경변수에 설정되지 않았습니다.");
  }

  if (isTestMode() && allowedEmail && to.toLowerCase() !== allowedEmail.toLowerCase()) {
    throw new Error(`테스트 모드에서는 ${allowedEmail} 로만 전송할 수 있습니다.`);
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: `[News Report] 「${report.keyword}」 뉴스 분석 보고서`,
      html: buildEmailHtml(report),
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(formatResendError(data.message) || `메일 전송 실패 (${res.status})`);
  }
  return data;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  } catch {
    return res.status(400).json({ error: "요청 형식이 올바르지 않습니다." });
  }

  const to = body?.to?.trim();
  const report = body?.report;

  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return res.status(400).json({ error: "올바른 이메일 주소를 입력해주세요." });
  }
  if (!report?.keyword) {
    return res.status(400).json({ error: "전송할 보고서가 없습니다." });
  }

  try {
    await sendEmail(to, report);
    return res.status(200).json({ success: true, message: "보고서가 메일로 전송되었습니다." });
  } catch (err) {
    console.error("send-report error:", err);
    return res.status(500).json({ error: err.message || "메일 전송에 실패했습니다." });
  }
};
