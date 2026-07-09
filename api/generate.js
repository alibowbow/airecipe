// Vercel serverless function → served at POST /api/generate
//
// The AI provider key lives ONLY in the Vercel project's Environment Variables
// (Project → Settings → Environment Variables). It is never committed to git and
// never sent to the browser. The client posts { message } to this same-origin
// endpoint and receives { text } back, so the key stays entirely server-side.
//
// This replaces the old Glitch proxy (magenta-morning-find.glitch.me).

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash";

// Best-effort in-memory rate limiter. It only survives within a warm serverless
// instance, but still blunts casual abuse of the paid AI endpoint.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const rateLimitBuckets = new Map();

function isRateLimited(req) {
  const forwarded = String(req.headers["x-forwarded-for"] || "");
  const ip = forwarded.split(",")[0].trim() || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip);

  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(ip, { start: now, count: 1 });
    return false;
  }

  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX;
}

function normalizeBody(body) {
  if (!body) return {};
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      return {};
    }
  }
  return body;
}

function extractText(payload) {
  return (payload?.candidates ?? [])
    .flatMap((candidate) => candidate?.content?.parts ?? [])
    .map((part) => String(part?.text ?? "").trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed", message: "POST 요청만 허용됩니다." });
  }

  if (isRateLimited(req)) {
    return res.status(429).json({
      error: "Too many requests",
      message: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
    });
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_STUDIO_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: "Missing API key",
      message: "Vercel 프로젝트 환경변수에 GEMINI_API_KEY를 설정하세요.",
    });
  }

  const body = normalizeBody(req.body);
  const prompt = String(body.message ?? body.prompt ?? "").trim();
  if (!prompt) {
    return res.status(400).json({ error: "Empty prompt", message: "message 필드가 비어 있습니다." });
  }

  const model = String(body.model || process.env.GEMINI_MODEL || DEFAULT_MODEL);
  const url = `${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`;

  const temperature = Number.isFinite(Number(body.temperature)) ? Number(body.temperature) : 0.7;
  const maxOutputTokens = Number.isFinite(Number(body.max_tokens)) ? Number(body.max_tokens) : 2048;

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { temperature, maxOutputTokens },
      }),
    });

    const rawText = await upstream.text();
    let payload = {};
    try {
      payload = rawText ? JSON.parse(rawText) : {};
    } catch {
      return res.status(502).json({
        error: "Invalid upstream response",
        message: "AI 서버가 JSON이 아닌 응답을 반환했습니다.",
      });
    }

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: payload?.error?.status || "AI request failed",
        message:
          payload?.error?.message || payload?.message || `AI 요청이 실패했습니다 (${upstream.status}).`,
      });
    }

    const text = extractText(payload);
    if (!text) {
      return res.status(502).json({
        error: "Empty model response",
        message: "AI가 텍스트 응답을 반환하지 않았습니다.",
        details: payload?.promptFeedback ?? null,
      });
    }

    // Match the response shape the frontend already expects ({ text }).
    return res.status(200).json({ text });
  } catch (error) {
    console.error("Vercel AI proxy error:", error);
    return res.status(500).json({
      error: "AI proxy error",
      message: error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다.",
    });
  }
};
