/* ─────────────────────────────────────────────────────────
   Public GitHub repo scanner (client-side).

   Reads a PUBLIC repo directly from the browser (GitHub API for the
   file list, raw.githubusercontent for contents) and runs deterministic
   detectors to figure out the app's real shape. It then pre-fills the
   assessment answers so the report reflects the code, not a guess.

   PRIVACY: nothing here is persisted. File contents live only in memory
   for the duration of the scan and are discarded. We never send code or
   the repo URL anywhere. (Anonymous component stats are recorded
   separately, and only after the user consents.)

   Detectors err toward "not detected" rather than asserting the worst —
   e.g. no key found in the frontend ⇒ secretsInClient = false, not true.
   ───────────────────────────────────────────────────────── */

export class RepoAccessError extends Error {
  constructor(kind) {
    super(kind);
    this.kind = kind; // "invalid" | "private_or_missing" | "ratelimited" | "empty" | "error"
  }
}

export function parseRepoUrl(input) {
  if (!input) return null;
  let s = String(input).trim();
  // allow "owner/repo" shorthand
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
const MAX_FILES = 40;
const MAX_BYTES = 200 * 1024;

async function getTree(owner, repo) {
  for (const branch of ["main", "master"]) {
    let res;
    try {
      res = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, {
        headers: { Accept: "application/vnd.github+json" },
      });
    } catch {
      throw new RepoAccessError("error");
    }
    if (res.status === 200) {
      const j = await res.json();
      return { branch, tree: Array.isArray(j.tree) ? j.tree : [] };
    }
    if (res.status === 403) throw new RepoAccessError("ratelimited");
    // 404 → try the next branch name
  }
  throw new RepoAccessError("private_or_missing");
}

function pickFiles(tree) {
  const blobs = tree.filter(
    (n) => n.type === "blob" && TEXT_EXT.test(n.path) && !SKIP_PATH.test(n.path) && !/\.min\./i.test(n.path) && (n.size || 0) < MAX_BYTES
  );
  // Prioritise the files most telling for scaling readiness.
  const score = (p) => {
    if (/package\.json$|requirements\.txt$|dockerfile|serverless\.|\.env/i.test(p)) return 0;
    if (CLIENT_EXT.test(p)) return 1;
    return 2;
  };
  return blobs.sort((a, b) => score(a.path) - score(b.path)).slice(0, MAX_FILES);
}

async function fetchRaw(owner, repo, branch, path) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${encodeURI(path)}`);
    if (!res.ok) return "";
    return await res.text();
  } catch {
    return "";
  }
}

/* ── detectors ──────────────────────────────────────────── */

const RE = {
  secret:
    /(sk-[A-Za-z0-9]{16,})|(AKIA[0-9A-Z]{16})|(AIza[0-9A-Za-z_\-]{20,})|(['"]?(?:api[_-]?key|apikey|secret|access[_-]?token|auth[_-]?token)['"]?\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"])|(Bearer\s+[A-Za-z0-9._\-]{20,})/,
  ai: /openai|anthropic|api\.anthropic|claude|gpt-[0-9]|chat\/completions|generativelanguage|googleapis.*generative|vertexai|aiplatform|bedrock|cohere|huggingface|api\.x\.ai|deepseek|mistral\.ai/i,
  backendDep:
    /"(express|fastify|koa|@hapi\/hapi|next|nuxt|nestjs|@nestjs\/core|flask|django|fastapi|aws-lambda|serverless)"/i,
  backendFile: /(^|\/)(server|app|main|index)\.(js|ts|py|go|rb|php)$|(^|\/)api\/|lambda|serverless\.ya?ml|dockerfile/i,
  dbLib: /"(pg|mysql2?|mongoose|mongodb|@prisma\/client|sequelize|typeorm|sqlite3|better-sqlite3|@supabase\/supabase-js|firebase-admin|@aws-sdk\/client-dynamodb)"|psycopg2|sqlalchemy|boto3.*dynamodb/i,
  browserStore: /localStorage|sessionStorage|indexedDB/,
  fileWrite: /fs\.(promises\.)?writeFile|fs\.createWriteStream|multer|formidable|busboy/i,
  uploadUI: /<input[^>]*type=["']file["']|multipart\/form-data|new FormData\(/i,
  logging: /winston|pino|bunyan|morgan|@sentry\/|cloudwatch|createLogger|loguru|structlog/i,
};

// Returns { answers, evidence } where answers use true/false (and omit
// fields we genuinely can't determine, leaving them for the user).
function analyze(files) {
  const evidence = [];
  const note = (signal, path, line) => evidence.push({ signal, path, line });

  let secretsInClient = false;
  let aiCalls = false;
  let hasBackend = false;
  let dataStore = "none";
  let sawBrowserStore = false;
  let sawDbLib = false;
  let sawFileWrite = false;
  let fileUploads = false;
  let hasLogging = false;

  for (const f of files) {
    const isClient = CLIENT_EXT.test(f.path);
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (isClient && !secretsInClient && RE.secret.test(ln)) {
        secretsInClient = true;
        note("secret", f.path, i + 1);
      }
      if (!aiCalls && RE.ai.test(ln)) {
        aiCalls = true;
        note("ai", f.path, i + 1);
      }
    }
    const c = f.content;
    if (!hasBackend && (RE.backendDep.test(c) || RE.backendFile.test(f.path))) {
      hasBackend = true;
      note("backend", f.path);
    }
    if (RE.dbLib.test(c)) sawDbLib = true;
    if (RE.browserStore.test(c)) sawBrowserStore = true;
    if (RE.fileWrite.test(c)) sawFileWrite = true;
    if (!fileUploads && RE.uploadUI.test(c)) {
      fileUploads = true;
      note("uploads", f.path);
    }
    if (!hasLogging && RE.logging.test(c)) {
      hasLogging = true;
      note("logging", f.path);
    }
  }

  if (sawDbLib) dataStore = "db";
  else if (sawFileWrite) dataStore = "files";
  else if (sawBrowserStore) dataStore = "browser";
  else dataStore = "none";

  const answers = { aiCalls, secretsInClient, hasBackend, dataStore, fileUploads, hasLogging };
  return { answers, evidence };
}

/* ── public entry point ─────────────────────────────────── */

export async function scanRepo(url) {
  const ref = parseRepoUrl(url);
  if (!ref) throw new RepoAccessError("invalid");

  const { branch, tree } = await getTree(ref.owner, ref.repo);
  const picked = pickFiles(tree);
  if (picked.length === 0) throw new RepoAccessError("empty");

  const files = [];
  for (const f of picked) {
    const content = await fetchRaw(ref.owner, ref.repo, branch, f.path);
    if (content) files.push({ path: f.path, content });
  }
  if (files.length === 0) throw new RepoAccessError("empty");

  const { answers, evidence } = analyze(files);
  // Contents are dropped here — only detected signals leave this function.
  return {
    repo: `${ref.owner}/${ref.repo}`,
    branch,
    filesScanned: files.length,
    answers,
    evidence,
  };
}
