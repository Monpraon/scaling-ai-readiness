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
  // Resolve the real default branch first (handles repos not on main/master).
  let defaultBranch = null;
  try {
    const meta = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (meta.status === 200) {
      defaultBranch = (await meta.json()).default_branch || null;
    } else if (meta.status === 404) {
      throw new RepoAccessError("private_or_missing");
    } else if (meta.status === 403) {
      throw new RepoAccessError("ratelimited");
    }
  } catch (e) {
    if (e instanceof RepoAccessError) throw e;
    // network error resolving meta — fall through to branch guesses
  }

  const branches = [defaultBranch, "main", "master"].filter(Boolean);
  for (const branch of [...new Set(branches)]) {
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
    // 404 → try the next branch
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
  // Library-like usage only — avoids matching the plain English word
  // "passport" or "author"/"jwt" appearing in prose.
  auth: /cognito|next-auth|@auth\/|@clerk|\bclerk\b|auth0|firebase[^\n]{0,40}\.auth|express-session|lucia-auth|@?supabase[^\n]{0,20}auth|jsonwebtoken|jwt\.(sign|verify)|passport\.(authenticate|use)|["'`]passport["'`]|oauth2/i,
};

// Returns { answers, evidence }.
// Detected ⇒ true. NOT detected ⇒ null ("unknown"), never a false "No" —
// because absence of evidence in a scan is not evidence of absence.
// Exceptions: aiCalls / secretsInClient / fileUploads default to false when
// not found, since not finding them is meaningful good news.
function analyze(files) {
  const evidence = [];
  const note = (signal, path, line) => evidence.push({ signal, path, line });

  let sawSecret = false, sawAi = false, sawBackend = false, sawAuth = false;
  let sawDbLib = false, sawBrowserStore = false, sawFileWrite = false, sawUpload = false, sawLogging = false;

  for (const f of files) {
    const isClient = CLIENT_EXT.test(f.path);
    const lines = f.content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const ln = lines[i];
      if (isClient && !sawSecret && RE.secret.test(ln)) { sawSecret = true; note("secret", f.path, i + 1); }
      if (!sawAi && RE.ai.test(ln)) { sawAi = true; note("ai", f.path, i + 1); }
    }
    const c = f.content;
    if (!sawBackend && (RE.backendDep.test(c) || RE.backendFile.test(f.path))) { sawBackend = true; note("backend", f.path); }
    if (!sawAuth && RE.auth.test(c)) { sawAuth = true; note("auth", f.path); }
    if (RE.dbLib.test(c)) sawDbLib = true;
    if (RE.browserStore.test(c)) sawBrowserStore = true;
    if (RE.fileWrite.test(c)) sawFileWrite = true;
    if (!sawUpload && RE.uploadUI.test(c)) { sawUpload = true; note("uploads", f.path); }
    if (!sawLogging && RE.logging.test(c)) { sawLogging = true; note("logging", f.path); }
  }

  const dataStore = sawDbLib ? "db" : sawFileWrite ? "files" : sawBrowserStore ? "browser" : "unknown";

  const answers = {
    aiCalls: sawAi,                       // false = no AI refs found (meaningful)
    secretsInClient: sawSecret,           // false = no key found in frontend (good)
    fileUploads: sawUpload,               // false = no upload UI found
    hasBackend: sawBackend ? true : null, // null = not seen (may exist elsewhere)
    hasAuth: sawAuth ? true : null,
    hasLogging: sawLogging ? true : null,
    dataStore,                            // "unknown" = couldn't tell
  };
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
