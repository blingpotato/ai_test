module.exports = function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  const from = process.env.REPORT_FROM_EMAIL || "onboarding@resend.dev";
  const testMode = from.includes("resend.dev");
  const allowedEmail = process.env.RESEND_TEST_EMAIL || "";

  return res.status(200).json({ testMode, allowedEmail });
};
