"use strict";

/* ─────────────────────────────────────────────────────────
   Scaling AI Readiness — backend

   One Lambda behind an HTTP API. Three routes:
     POST /responses          record an anonymous quiz result
     GET  /responses/summary  aggregate counts per ladder step
     POST /analyze            rules-first assessment, explained by Bedrock

   Design notes:
   - Rules run FIRST and decide the substance. The model only turns
     structured findings into friendly bilingual prose. Cheap + stable.
   - A per-day budget counter caps model spend. When exceeded we return
     429 and the frontend falls back gracefully.
   - No secrets in code. Everything comes from environment variables set
     by Terraform. Uses the AWS SDK v3 bundled in the Node.js runtime.
   ───────────────────────────────────────────────────────── */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const {
  DynamoDBDocumentClient,
  UpdateCommand,
  GetCommand,
} = require("@aws-sdk/lib-dynamodb");
const {
  BedrockRuntimeClient,
  ConverseCommand,
} = require("@aws-sdk/client-bedrock-runtime");

const REGION = process.env.AWS_REGION;
const TABLE = process.env.TABLE_NAME;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-micro-v1:0";
const FALLBACK_MODEL_ID = process.env.BEDROCK_FALLBACK_MODEL_ID || "amazon.nova-lite-v1:0";
const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || "8000", 10);
const MAX_AI_PER_DAY = parseInt(process.env.MAX_AI_REQUESTS_PER_DAY || "2000", 10);
const MAX_OUTPUT_TOKENS = parseInt(process.env.MAX_OUTPUT_TOKENS || "800", 10);
const CORS_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const BUDGET_TTL_DAYS = 2;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const bedrock = new BedrockRuntimeClient({ region: REGION });

const CORS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

function reply(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", ...CORS },
    body: JSON.stringify(body),
  };
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

/* ── DynamoDB helpers (atomic counters) ─────────────────── */

async function bumpCounter(pk, ttlSeconds) {
  const attrs = { ":one": 1 };
  let expr = "ADD #n :one";
  const names = { "#n": "n" };
  if (ttlSeconds) {
    expr += " SET #ttl = :ttl";
    names["#ttl"] = "ttl";
    attrs[":ttl"] = ttlSeconds;
  }
  const out = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk },
      UpdateExpression: expr,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: attrs,
      ReturnValues: "UPDATED_NEW",
    })
  );
  return out.Attributes ? out.Attributes.n : 0;
}

async function readCounter(pk) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk } }));
  return out.Item && typeof out.Item.n === "number" ? out.Item.n : 0;
}

/* ── Route: record a result ─────────────────────────────── */

async function recordResponse(payload) {
  const step = parseInt(payload.step, 10);
  if (![1, 2, 3].includes(step)) return reply(400, { error: "invalid step" });
  await bumpCounter(`count#step#${step}`);
  return reply(200, { ok: true });
}

async function responsesSummary() {
  const [a, b, c] = await Promise.all([
    readCounter("count#step#1"),
    readCounter("count#step#2"),
    readCounter("count#step#3"),
  ]);
  const counts = [a, b, c];
  return reply(200, { counts, total: a + b + c });
}

/* ── Route: analyze (rules first, model explains) ───────── */

// Deterministic scan for scaling-readiness signals. No model needed.
function deriveFindings(text) {
  const t = text.toLowerCase();
  const findings = [];
  let score = 0;

  const has = (re) => re.test(text);

  const hasReadme = /read ?me|## |setup|installation|getting started/i.test(text);
  const hasSetup = /npm install|pip install|requirements\.txt|package\.json|dockerfile|docker-compose|make install/i.test(text);
  const hasLicense = /licen[sc]e|mit|apache|gpl/i.test(text);
  const hasSecretRisk = has(/(sk-[a-z0-9]{10,})|(api[_-]?key\s*[:=])|(bearer\s+[a-z0-9._-]{12,})|(aws_secret|AKIA[0-9A-Z]{16})/i);
  const hasHardcodedPersonal = /localhost|127\.0\.0\.1|\/users\/[a-z]+\/|c:\\users\\|my-email|@gmail\.com|@hotmail\./i.test(t);
  const mentionsSharing = /shared|team|colleague|repo|repository|deploy|production|handover|documented/i.test(t);
  const mentionsData = /database|s3|storage|persist|dynamo|postgres|mysql|sqlite/i.test(t);

  if (hasReadme) { score += 2; findings.push({ k: "readme", ok: true }); }
  else findings.push({ k: "readme", ok: false });

  if (hasSetup) { score += 2; findings.push({ k: "setup", ok: true }); }
  else findings.push({ k: "setup", ok: false });

  if (hasLicense) { score += 1; findings.push({ k: "license", ok: true }); }
  else findings.push({ k: "license", ok: false });

  if (hasSecretRisk) { score -= 2; findings.push({ k: "secret", ok: false, hard: true }); }
  if (hasHardcodedPersonal) { score -= 1; findings.push({ k: "personal", ok: false }); }
  if (mentionsSharing) { score += 2; findings.push({ k: "sharing", ok: true }); }
  if (mentionsData) { score += 1; findings.push({ k: "data", ok: true }); }

  // Map score → ladder step (1 personal, 2 shared, 3 institutional)
  let step = 1;
  if (score >= 6) step = 3;
  else if (score >= 3) step = 2;

  return { step, findings };
}

// Build the compact, structured payload the model must EXPLAIN (not invent).
function buildPrompt(context, findings, step, excerpt) {
  const flags = findings.map((f) => `${f.k}:${f.ok ? "ok" : "missing"}${f.hard ? "(critical)" : ""}`).join(", ");
  return `You are a "Scaling AI Readiness" assessor for institutions, using a 3-step ladder: Step 1 = Personal Skill (works, but lives with one person), Step 2 = Shared Practice (documented, reusable by colleagues), Step 3 = Institutional Capability (governed, owned, measured). Also consider three gaps: Shadow AI (data boundaries/visibility), Hero Dependency (would it survive the creator leaving?), Pilot Purgatory (path to standard practice).

A deterministic rule engine already assessed a user's AI-built work. Do NOT change its conclusions — only explain them clearly and kindly.

Context of the work: ${context}
Rule engine verdict: step ${step}
Signals detected: ${flags}

Assess ONLY scaling readiness (documentation, reproducible setup, ownership/licence clarity, whether a colleague could run it, data handling), never code quality. If a critical secret signal is present, treat exposed credentials as the top risk but NEVER repeat the secret value.

Respond ONLY with raw JSON (no markdown fences), exactly:
{"step": ${step}, "verdict_en": "2-3 sentences", "verdict_th": "2-3 sentences in Thai", "risks": [{"en":"","th":""},{"en":"","th":""},{"en":"","th":""}], "recs": [{"en":"","th":""},{"en":"","th":""}]}

Exactly 3 risks and 2 recs, each a short sentence. Be encouraging but honest.

WORK EXCERPT:
${excerpt}`;
}

async function converse(modelId, prompt) {
  const out = await bedrock.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0.3 },
    })
  );
  const parts = out.output?.message?.content || [];
  return parts.map((p) => p.text || "").join("\n");
}

function parseModelJson(raw, step) {
  const clean = raw.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  const end = clean.lastIndexOf("}");
  const slice = start >= 0 && end >= 0 ? clean.slice(start, end + 1) : clean;
  const parsed = JSON.parse(slice);
  parsed.step = step; // rules own the step, not the model
  return parsed;
}

async function analyze(payload) {
  const text = String(payload.text || "").slice(0, MAX_INPUT_CHARS);
  const context = String(payload.context || "other").slice(0, 40);
  if (!text.trim()) return reply(400, { error: "empty" });

  // Daily budget guard
  const used = await bumpCounter(
    `budget#${today()}`,
    Math.floor(Date.now() / 1000) + BUDGET_TTL_DAYS * 86400
  );
  if (used > MAX_AI_PER_DAY) {
    return reply(429, { error: "quota" });
  }

  const { step, findings } = deriveFindings(text);
  const prompt = buildPrompt(context, findings, step, text.slice(0, MAX_INPUT_CHARS));

  let raw;
  try {
    raw = await converse(MODEL_ID, prompt);
  } catch (e) {
    console.warn("primary model failed, trying fallback", e?.name);
    raw = await converse(FALLBACK_MODEL_ID, prompt);
  }

  try {
    return reply(200, parseModelJson(raw, step));
  } catch (e) {
    console.error("model json parse failed", e);
    return reply(502, { error: "bad-model-output" });
  }
}

/* ── Router ─────────────────────────────────────────────── */

exports.handler = async (event) => {
  const method = event.requestContext?.http?.method || "GET";
  const path = event.rawPath || "/";

  if (method === "OPTIONS") return { statusCode: 204, headers: CORS, body: "" };

  let body = {};
  if (event.body) {
    try {
      body = JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, "base64").toString() : event.body);
    } catch {
      return reply(400, { error: "invalid json" });
    }
  }

  try {
    if (method === "POST" && path === "/responses") return await recordResponse(body);
    if (method === "GET" && path === "/responses/summary") return await responsesSummary();
    if (method === "POST" && path === "/analyze") return await analyze(body);
    return reply(404, { error: "not found" });
  } catch (e) {
    console.error("handler error", e);
    return reply(500, { error: "internal" });
  }
};
