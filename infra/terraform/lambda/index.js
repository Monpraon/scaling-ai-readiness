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
const { DynamoDBDocumentClient, UpdateCommand, GetCommand } = require("@aws-sdk/lib-dynamodb");
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
const { SSMClient, GetParameterCommand } = require("@aws-sdk/client-ssm");

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
const ssm = new SSMClient({ region: REGION });

const GITHUB_TOKEN_PARAM = process.env.GITHUB_TOKEN_PARAM || "";

const CORS = {
  "Access-Control-Allow-Origin": CORS_ORIGIN,
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
};

// Risk/component ids we track in aggregate (must match the frontend engine).
const RISK_IDS = [
  "secrets",
  "verify-secrets",
  "no-backend",
  "no-auth",
  "browser-data",
  "sync-ai",
  "uploads",
  "no-logs",
  "no-governance",
];

function reply(statusCode, body) {
  return { statusCode, headers: { "Content-Type": "application/json", ...CORS }, body: JSON.stringify(body) };
}

const today = () => new Date().toISOString().slice(0, 10);

// Atomic +1 on a counter item (no TTL — stats are cumulative).
async function bumpKey(pk) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk },
      UpdateExpression: "ADD #n :one",
      ExpressionAttributeNames: { "#n": "n" },
      ExpressionAttributeValues: { ":one": 1 },
    })
  );
}

async function readKey(pk) {
  const out = await ddb.send(new GetCommand({ TableName: TABLE, Key: { pk } }));
  return out.Item && typeof out.Item.n === "number" ? out.Item.n : 0;
}

/* ── Anonymous aggregate stats ──────────────────────────────
   We store ONLY counters — never repo content, URLs, or anything
   identifying. Each completed assessment bumps a handful of tallies. */

async function recordStats(p) {
  const ready = p && p.ready === true;
  const target = [10, 100, 1000, 10000].includes(p && p.target) ? p.target : 0;
  const cloud = ["aws", "gcp", "azure", "huawei"].includes(p && p.cloud) ? p.cloud : "aws";
  const source = ["repo", "prototype", "demo"].includes(p && p.source) ? p.source : "prototype";
  const ids = Array.isArray(p && p.riskIds) ? p.riskIds.filter((id) => RISK_IDS.includes(id)) : [];

  const ops = [bumpKey("stat#total"), bumpKey(ready ? "stat#ready" : "stat#notready"), bumpKey(`stat#cloud#${cloud}`), bumpKey(`stat#source#${source}`)];
  if (target) ops.push(bumpKey(`stat#target#${target}`));
  for (const id of ids) ops.push(bumpKey(`stat#risk#${id}`));
  await Promise.all(ops);
  return reply(200, { ok: true });
}

async function statsSummary() {
  const targets = [10, 100, 1000, 10000];
  const clouds = ["aws", "gcp", "azure", "huawei"];
  const sources = ["repo", "prototype", "demo"];
  const keys = [
    "stat#total",
    "stat#ready",
    "stat#notready",
    ...targets.map((t) => `stat#target#${t}`),
    ...clouds.map((c) => `stat#cloud#${c}`),
    ...sources.map((s) => `stat#source#${s}`),
    ...RISK_IDS.map((id) => `stat#risk#${id}`),
  ];
  const vals = await Promise.all(keys.map(readKey));
  const m = {};
  keys.forEach((k, i) => (m[k] = vals[i]));

  return reply(200, {
    total: m["stat#total"],
    ready: m["stat#ready"],
    notReady: m["stat#notready"],
    targets: Object.fromEntries(targets.map((t) => [t, m[`stat#target#${t}`]])),
    clouds: Object.fromEntries(clouds.map((c) => [c, m[`stat#cloud#${c}`]])),
    sources: Object.fromEntries(sources.map((s) => [s, m[`stat#source#${s}`]])),
    risks: Object.fromEntries(RISK_IDS.map((id) => [id, m[`stat#risk#${id}`]])),
  });
}

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

/* ── Private-repo scan (server-side, token from SSM) ─────────
   Mirrors the client-side detectors in web/src/scan.js. Reads a GitHub
   token from SSM SecureString so it never touches the browser or the
   repo. Repo contents are held only in memory and discarded. */

let cachedToken = "";
async function githubToken() {
  if (cachedToken) return cachedToken; // cache only successful reads
  if (!GITHUB_TOKEN_PARAM) return "";
  try {
    const out = await ssm.send(new GetParameterCommand({ Name: GITHUB_TOKEN_PARAM, WithDecryption: true }));
    cachedToken = out.Parameter?.Value || "";
  } catch (e) {
    console.warn("could not read github token param:", e?.name);
    // don't cache failure — lets it work as soon as the param is created
  }
  return cachedToken;
}

function parseRepoUrl(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[\w.-]+\/[\w.-]+$/.test(s)) {
    const [owner, repo] = s.split("/");
    return { owner, repo: repo.replace(/\.git$/, "") };
  }
  try {
    const u = new URL(s);
    if (!/(^|\.)github\.com$/.test(u.hostname)) return null;
    const parts = u.pathname.replace(/^\/+/, "").split("/");
    if (parts.length < 2) return null;
    return { owner: parts[0], repo: parts[1].replace(/\.git$/, "") };
  } catch {
    return null;
  }
}

const TEXT_EXT = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|html?|py|rb|go|php|java|json|ya?ml|toml|env|sh)$/i;
const CLIENT_EXT = /\.(jsx?|tsx?|mjs|cjs|vue|svelte|html?)$/i;
const SKIP_PATH = /(^|\/)(node_modules|dist|build|out|vendor|\.git|\.next|coverage|public\/assets)\//i;
const SCAN_MAX_FILES = 40;
const SCAN_MAX_BYTES = 200 * 1024;

const SRE = {
  secret:
    /(sk-[A-Za-z0-9]{16,})|(AKIA[0-9A-Z]{16})|(AIza[0-9A-Za-z_\-]{20,})|(['"]?(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"])|(Bearer\s+[A-Za-z0-9._\-]{20,})/,
  ai: /openai|anthropic|api\.anthropic|claude|gpt-[0-9]|chat\/completions|generativelanguage|vertexai|aiplatform|bedrock|cohere|huggingface|api\.x\.ai|deepseek|mistral\.ai/i,
  backendDep: /"(express|fastify|koa|@hapi\/hapi|next|nuxt|nestjs|@nestjs\/core|flask|django|fastapi|aws-lambda|serverless)"/i,
  backendFile: /(^|\/)(server|app|main|index)\.(js|ts|py|go|rb|php)$|(^|\/)api\/|lambda|serverless\.ya?ml|dockerfile/i,
  dbLib: /"(pg|mysql2?|mongoose|mongodb|@prisma\/client|sequelize|typeorm|sqlite3|better-sqlite3|@supabase\/supabase-js|firebase-admin|@aws-sdk\/client-dynamodb)"|psycopg2|sqlalchemy/i,
  browserStore: /localStorage|sessionStorage|indexedDB/,
  fileWrite: /fs\.(promises\.)?writeFile|fs\.createWriteStream|multer|formidable|busboy/i,
  uploadUI: /<input[^>]*type=["']file["']|multipart\/form-data|new FormData\(/i,
  logging: /winston|pino|bunyan|morgan|@sentry\/|cloudwatch|createLogger|loguru|structlog/i,
  auth: /cognito|next-auth|passport|firebaseui|firebase[^\n]{0,40}auth|@clerk|auth0|jsonwebtoken|\bjwt\b|express-session|oauth|@supabase[^\n]{0,20}auth|lucia-auth|@auth\//i,
};

// Mirrors web/src/scan.js: detected ⇒ true; not seen ⇒ null (unknown) for
// components that may live elsewhere; false only where absence is telling.
function detect(files) {
  const evidence = [];
  let sawSecret = false, sawAi = false, sawBackend = false, sawAuth = false;
  let sawDb = false, sawBrowser = false, sawFileWrite = false, sawUpload = false, sawLogging = false;

  for (const f of files) {
    const isClient = CLIENT_EXT.test(f.path);
    const c = f.content;
    if (isClient && !sawSecret && SRE.secret.test(c)) { sawSecret = true; evidence.push({ signal: "secret", path: f.path }); }
    if (!sawAi && SRE.ai.test(c)) { sawAi = true; evidence.push({ signal: "ai", path: f.path }); }
    if (!sawBackend && (SRE.backendDep.test(c) || SRE.backendFile.test(f.path))) { sawBackend = true; evidence.push({ signal: "backend", path: f.path }); }
    if (!sawAuth && SRE.auth.test(c)) { sawAuth = true; evidence.push({ signal: "auth", path: f.path }); }
    if (SRE.dbLib.test(c)) sawDb = true;
    if (SRE.browserStore.test(c)) sawBrowser = true;
    if (SRE.fileWrite.test(c)) sawFileWrite = true;
    if (!sawUpload && SRE.uploadUI.test(c)) { sawUpload = true; evidence.push({ signal: "uploads", path: f.path }); }
    if (!sawLogging && SRE.logging.test(c)) { sawLogging = true; evidence.push({ signal: "logging", path: f.path }); }
  }
  const dataStore = sawDb ? "db" : sawFileWrite ? "files" : sawBrowser ? "browser" : "unknown";
  return {
    answers: {
      aiCalls: sawAi,
      secretsInClient: sawSecret,
      fileUploads: sawUpload,
      hasBackend: sawBackend ? true : null,
      hasAuth: sawAuth ? true : null,
      hasLogging: sawLogging ? true : null,
      dataStore,
    },
    evidence,
  };
}

async function gh(path, token, accept) {
  return fetch(`https://api.github.com${path}`, {
    headers: {
      Accept: accept || "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "User-Agent": "scale-my-ai",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
}

async function scan(payload) {
  const token = await githubToken();
  if (!token) return reply(501, { error: "scan-not-configured" });

  const ref = parseRepoUrl(payload && payload.url);
  if (!ref) return reply(400, { error: "invalid" });

  let branch = null;
  let tree = null;
  for (const b of ["main", "master"]) {
    const res = await gh(`/repos/${ref.owner}/${ref.repo}/git/trees/${b}?recursive=1`, token);
    if (res.status === 200) { branch = b; tree = (await res.json()).tree || []; break; }
    if (res.status === 401 || res.status === 403) return reply(502, { error: "github-auth" });
  }
  if (!tree) return reply(404, { error: "not-found" });

  const picked = tree
    .filter((n) => n.type === "blob" && TEXT_EXT.test(n.path) && !SKIP_PATH.test(n.path) && !/\.min\./i.test(n.path) && (n.size || 0) < SCAN_MAX_BYTES)
    .sort((a, b2) => {
      const s = (p) => (/package\.json$|requirements\.txt$|dockerfile|serverless\.|\.env/i.test(p) ? 0 : CLIENT_EXT.test(p) ? 1 : 2);
      return s(a.path) - s(b2.path);
    })
    .slice(0, SCAN_MAX_FILES);

  const files = [];
  for (const f of picked) {
    const res = await gh(`/repos/${ref.owner}/${ref.repo}/contents/${encodeURI(f.path)}?ref=${branch}`, token, "application/vnd.github.raw");
    if (res.ok) {
      const text = await res.text();
      if (text) files.push({ path: f.path, content: text });
    }
  }
  if (files.length === 0) return reply(404, { error: "empty" });

  const { answers, evidence } = detect(files);
  // Contents discarded here — only detected signals are returned.
  return reply(200, { repo: `${ref.owner}/${ref.repo}`, branch, filesScanned: files.length, answers, evidence });
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
    if (method === "POST" && path === "/scan") return await scan(body);
    if (method === "POST" && path === "/stats") return await recordStats(body);
    if (method === "GET" && path === "/stats/summary") return await statsSummary();
    return reply(404, { error: "not found" });
  } catch (e) {
    console.error("handler error", e);
    return reply(503, { error: "ai-unavailable" });
  }
};
