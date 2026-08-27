"use strict";

/* ─────────────────────────────────────────────────────────
   Scale My AI — backend

   One Lambda behind an HTTP API. A single route:
     POST /analyze   turn deterministic findings into a friendly,
                     plain-language explanation via Amazon Bedrock.

   The frontend's assessment is fully deterministic; this endpoint is
   OPTIONAL polish. The model only EXPLAINS findings the rule engine
   already produced — it never decides the verdict. Cheap + stable.

   A per-day budget counter caps model spend. When exceeded we return
   429 and the frontend simply omits the explanation.

   No secrets in code. Config comes from environment variables set by
   Terraform. Uses the AWS SDK v3 bundled in the Node.js runtime.
   ───────────────────────────────────────────────────────── */

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");

const REGION = process.env.AWS_REGION;
const TABLE = process.env.TABLE_NAME;
const MODEL_ID = process.env.BEDROCK_MODEL_ID || "amazon.nova-micro-v1:0";
const FALLBACK_MODEL_ID = process.env.BEDROCK_FALLBACK_MODEL_ID || "amazon.nova-lite-v1:0";
const MAX_AI_PER_DAY = parseInt(process.env.MAX_AI_REQUESTS_PER_DAY || "2000", 10);
const MAX_OUTPUT_TOKENS = parseInt(process.env.MAX_OUTPUT_TOKENS || "800", 10);
const MAX_INPUT_CHARS = parseInt(process.env.MAX_INPUT_CHARS || "8000", 10);
const CORS_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const BUDGET_TTL_DAYS = 2;

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: REGION }));
const bedrock = new BedrockRuntimeClient({ region: REGION });

const CORS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", ...CORS }, body: JSON.stringify(body) };
}

const today = () => new Date().toISOString().slice(0, 10);

async function bumpBudget() {
  const ttl = Math.floor(Date.now() / 1000) + BUDGET_TTL_DAYS * 86400;
  const out = await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: `budget#${today()}` },
      UpdateExpression: "ADD #n :one SET #ttl = :ttl",
      ExpressionAttributeNames: { "#n": "n", "#ttl": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl },
      ReturnValues: "UPDATED_NEW",
    })
  );
  return out.Attributes ? out.Attributes.n : 0;
}

const CLOUD_NAME = { aws: "AWS", gcp: "Google Cloud", azure: "Microsoft Azure", huawei: "Huawei Cloud" };

function buildPrompt({ app_type, description, target_users, findings, cloud }) {
  const list = (findings || []).slice(0, 12).map((f) => `- ${String(f).slice(0, 160)}`).join("\n") || "- (no blocking risks detected)";
  const desc = String(description || "").slice(0, MAX_INPUT_CHARS);
  const cloudName = CLOUD_NAME[cloud] || "AWS";
  return `You are a friendly cloud architect helping a non-expert scale an AI prototype on ${cloudName}.

A deterministic rule engine has already assessed their app. Do NOT invent new problems or change its conclusions — only explain them in warm, plain language a teacher or hobbyist would understand. No jargon dumps.

App type: ${app_type || "prototype"}
Target users: ${target_users}
Their description: ${desc || "(none provided)"}
Findings from the rule engine (these are the facts):
${list}

Write a short, encouraging explanation covering (a) what will break first and why it matters at their scale, in everyday terms, and (b) the single most important next step. End on an encouraging note. Never reveal or repeat any secret/API key value.

Respond in BOTH English and Thai, in this exact layout (plain text only, no markdown, no bullet lists):
EN: <2-3 sentences in English>

TH: <the same, in natural Thai>`;
}

async function converse(modelId, prompt) {
  const out = await bedrock.send(
    new ConverseCommand({
      modelId,
      messages: [{ role: "user", content: [{ text: prompt }] }],
      inferenceConfig: { maxTokens: MAX_OUTPUT_TOKENS, temperature: 0.4 },
    })
  );
  const parts = out.output?.message?.content || [];
  return parts.map((p) => p.text || "").join("\n").trim();
}

async function analyze(payload) {
  const used = await bumpBudget();
  if (used > MAX_AI_PER_DAY) return reply(429, { error: "quota" });

  const prompt = buildPrompt(payload || {});
  let explanation;
  try {
    explanation = await converse(MODEL_ID, prompt);
  } catch (e) {
    console.warn("primary model failed, trying fallback:", e?.name);
    explanation = await converse(FALLBACK_MODEL_ID, prompt);
  }
  return reply(200, { explanation });
}

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
    if (method === "POST" && path === "/analyze") return await analyze(body);
    return reply(404, { error: "not found" });
  } catch (e) {
    console.error("handler error", e);
    return reply(503, { error: "ai-unavailable" });
  }
};
