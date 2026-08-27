/* ─────────────────────────────────────────────────────────
   Scale My AI — deterministic assessment engine

   Rules first. This module decides everything the report shows:
   what breaks first, what to fix next, the roadmap stage, and the
   AWS architecture at any given scale. No network, no model — so the
   demo always works, exactly as the spec requires.

   The optional LLM layer only rephrases these findings; it never
   changes them.
   ───────────────────────────────────────────────────────── */

export const SCALES = [10, 100, 1000, 10000];

export const SCALE_LABEL = {
  10: "Personal · 1–10",
  100: "Small team · 10–100",
  1000: "Department · 100–1,000",
  10000: "Organisation · 1,000–10,000+",
};

// AWS service metadata for architecture nodes.
export const SVC = {
  frontend: { label: "Frontend", aws: "S3 + CloudFront / Amplify" },
  auth: { label: "Auth", aws: "Amazon Cognito" },
  api: { label: "API", aws: "API Gateway + Lambda" },
  ai: { label: "AI", aws: "Amazon Bedrock" },
  aiWorker: { label: "AI Worker", aws: "Lambda + Bedrock" },
  queue: { label: "Queue", aws: "Amazon SQS" },
  workflow: { label: "Workflow", aws: "Step Functions" },
  db: { label: "Database", aws: "Amazon DynamoDB" },
  storage: { label: "File Storage", aws: "Amazon S3" },
  secrets: { label: "Secrets", aws: "Secrets Manager" },
  monitoring: { label: "Monitoring", aws: "Amazon CloudWatch" },
  audit: { label: "Audit", aws: "AWS CloudTrail" },
  cost: { label: "Cost Control", aws: "AWS Budgets" },
  review: { label: "Human Review", aws: "Step Functions approval" },
  waf: { label: "Protection", aws: "AWS WAF" },
};

/* ── Assessment questions ───────────────────────────────── */

export const QUESTIONS = [
  {
    id: "aiCalls",
    q: "Does the app call an AI model?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "secretsInClient",
    q: "Is an API key or secret stored in the browser / client code?",
    opts: [
      { label: "Yes", value: true },
      { label: "Not sure", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "aiSync",
    q: "Are AI requests handled synchronously (the user waits for the response)?",
    opts: [
      { label: "Yes, the user waits", value: true },
      { label: "No, it's queued / async", value: false },
    ],
    dependsOn: (a) => a.aiCalls === true,
  },
  {
    id: "hasAuth",
    q: "Is there user login / authentication?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "dataStore",
    q: "Where is data stored today?",
    opts: [
      { label: "Only in the browser (localStorage)", value: "browser" },
      { label: "A server database", value: "db" },
      { label: "Files on a server", value: "files" },
      { label: "Nowhere / not sure", value: "none" },
    ],
  },
  {
    id: "hasBackend",
    q: "Is there a backend server (something beyond the static page)?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "fileUploads",
    q: "Do users upload files?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "hasLogging",
    q: "Is there any logging or monitoring?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "humanReview",
    q: "Is there a human approval step for AI output?",
    opts: [
      { label: "Yes", value: true },
      { label: "No", value: false },
    ],
  },
  {
    id: "workload",
    q: "What does usage look like?",
    opts: [
      { label: "Occasional", value: "occasional" },
      { label: "Daily", value: "daily" },
      { label: "Bursty / spikes", value: "bursty" },
      { label: "Many at once", value: "concurrent" },
    ],
  },
];

export function visibleQuestions(answers) {
  return QUESTIONS.filter((q) => !q.dependsOn || q.dependsOn(answers));
}

/* ── Risk rules: "what breaks first" ────────────────────── */

// Each rule returns a risk when its condition holds. Ordered by severity.
export function assessRisks(a, target) {
  const risks = [];
  const big = target >= 100;
  const huge = target >= 1000;
  const massive = target >= 10000;
  const spiky = a.workload === "bursty" || a.workload === "concurrent";

  if (a.secretsInClient) {
    risks.push({
      id: "secrets",
      sev: "high",
      title: "API key exposed in the frontend",
      why: "Anyone can open dev tools, read the key, and run up your bill or abuse the model.",
      fix: "Move the key to a backend and store it in Secrets Manager. The browser should never see it.",
    });
  }

  if (a.aiCalls && a.aiSync && (huge || spiky)) {
    risks.push({
      id: "sync-ai",
      sev: "high",
      title: "AI requests processed synchronously",
      why: "At this scale, users waiting on live model calls means timeouts, retries, and runaway cost during spikes.",
      fix: "Introduce an async queue (SQS) with workers, plus retries and rate limiting.",
    });
  }

  if (!a.hasAuth && big) {
    risks.push({
      id: "no-auth",
      sev: "high",
      title: "No user authentication",
      why: "With 100+ users you can't tell people apart, protect data, or stop abuse.",
      fix: "Add authentication (Cognito) before opening it up.",
    });
  }

  if (a.dataStore === "browser" && big) {
    risks.push({
      id: "browser-data",
      sev: "high",
      title: "Data stored only in the browser",
      why: "localStorage is per-device and easily lost. It can't back a multi-user app.",
      fix: "Add a persistent database (DynamoDB) behind your API.",
    });
  }

  if (!a.hasBackend && (a.aiCalls || big)) {
    risks.push({
      id: "no-backend",
      sev: "high",
      title: "No backend to enforce anything",
      why: "Without a server you can't hold secrets, authenticate, validate input, or control cost.",
      fix: "Stand up API Gateway + Lambda as the trusted layer between the browser and your data/model.",
    });
  }

  if (a.fileUploads && a.dataStore !== "files" && big) {
    risks.push({
      id: "uploads",
      sev: "medium",
      title: "File uploads with no object storage",
      why: "Uploads need durable, scalable storage with lifecycle and access controls.",
      fix: "Store uploads in S3 with size limits and automatic expiry.",
    });
  }

  if (!a.hasLogging && huge) {
    risks.push({
      id: "no-logs",
      sev: "medium",
      title: "No logging or monitoring",
      why: "At scale you can't debug failures or spot abuse you can't see.",
      fix: "Add CloudWatch logs, metrics, and alarms.",
    });
  }

  if (a.aiCalls && !a.humanReview && massive) {
    risks.push({
      id: "no-governance",
      sev: "medium",
      title: "No human review or governance on AI output",
      why: "At organisation scale, unreviewed AI decisions become a compliance and trust risk.",
      fix: "Add an approval step, audit trail, and cost controls.",
    });
  }

  const order = { high: 0, medium: 1, low: 2 };
  return risks.sort((x, y) => order[x.sev] - order[y.sev]);
}

/* ── "What to fix next" — prioritised, de-duped from risks ── */

export function nextFixes(risks) {
  const priority = [
    "secrets",
    "no-backend",
    "no-auth",
    "browser-data",
    "uploads",
    "sync-ai",
    "no-logs",
    "no-governance",
  ];
  return risks
    .slice()
    .sort((a, b) => priority.indexOf(a.id) - priority.indexOf(b.id))
    .map((r) => r.fix);
}

/* ── Roadmap ────────────────────────────────────────────── */

export const ROADMAP = [
  { stage: "Prototype", detail: "Frontend + direct AI call" },
  { stage: "Shared App", detail: "Frontend + Backend + Secrets Management" },
  { stage: "Multi-user", detail: "Authentication + Database + Storage" },
  { stage: "Scalable AI", detail: "Queue + Worker + Retry + Rate Limit" },
  { stage: "Governed AI", detail: "Audit + Monitoring + Human Review + Cost Control" },
];

export function roadmapIndexForScale(scale) {
  if (scale >= 10000) return 4;
  if (scale >= 1000) return 3;
  if (scale >= 100) return 2;
  return 1; // a shared app is the first real step up from a prototype
}

/* ── Architecture at a given scale ──────────────────────── */

// Returns { pipeline: [svcKey...], governance: [svcKey...] }
export function architectureForScale(scale, a = {}) {
  const pipeline = ["frontend"];
  const governance = [];

  if (scale >= 100) pipeline.push("auth");
  pipeline.push("api");

  if (scale >= 1000) {
    pipeline.push("queue");
    if (scale >= 10000) pipeline.push("workflow");
    pipeline.push("aiWorker");
  } else if (a.aiCalls !== false) {
    pipeline.push("ai");
  }

  if (scale >= 100) pipeline.push("db");
  if (a.fileUploads || scale >= 1000) pipeline.push("storage");

  // Secrets Manager appears as soon as there's a backend holding a key.
  if (a.aiCalls !== false || scale >= 100) governance.push("secrets");

  if (scale >= 1000) governance.push("monitoring");
  if (scale >= 10000) {
    governance.push("audit", "cost", "review", "waf");
  }

  return { pipeline, governance };
}

/* ── Report → Markdown ──────────────────────────────────── */

export function reportToMarkdown({ appType, description, target, scale, risks, fixes }) {
  const L = [];
  L.push(`# Scale My AI — Scaling Assessment`);
  L.push("");
  L.push(`- **Target scale:** ${target.toLocaleString()} users (${SCALE_LABEL[target]})`);
  L.push(`- **App type:** ${appType || "prototype"}`);
  if (description) L.push(`- **Description:** ${description}`);
  L.push(`- **Generated:** ${new Date().toISOString().slice(0, 10)}`);
  L.push("");

  L.push(`## What will break first`);
  if (!risks.length) {
    L.push(`No blocking risks detected for this scale.`);
  } else {
    for (const r of risks) {
      L.push(`### [${r.sev.toUpperCase()}] ${r.title}`);
      L.push(`- **Why it matters:** ${r.why}`);
      L.push(`- **Fix:** ${r.fix}`);
      L.push("");
    }
  }
  L.push("");

  if (fixes.length) {
    L.push(`## What to fix next`);
    fixes.forEach((f, i) => L.push(`${i + 1}. ${f}`));
    L.push("");
  }

  const { pipeline, governance } = architectureForScale(scale, {});
  L.push(`## Architecture at ${scale.toLocaleString()} users`);
  L.push(`**Flow:** ${pipeline.map((k) => SVC[k].label).join(" → ")}`);
  L.push("");
  for (const k of pipeline) L.push(`- **${SVC[k].label}** — ${SVC[k].aws}`);
  if (governance.length) {
    L.push("");
    L.push(`**Cross-cutting:**`);
    for (const k of governance) L.push(`- **${SVC[k].label}** — ${SVC[k].aws}`);
  }
  L.push("");

  const idx = roadmapIndexForScale(scale);
  L.push(`## Scaling roadmap`);
  ROADMAP.forEach((r, i) => {
    const mark = i < idx ? "x" : i === idx ? ">" : " ";
    L.push(`- [${mark}] **${r.stage}** — ${r.detail}${i === idx ? "  _(you're here)_" : ""}`);
  });
  L.push("");
  L.push(`---`);
  L.push(`_Generated by Scale My AI._`);
  return L.join("\n");
}

/* ── Demo scenario: AI Assignment Grader ────────────────── */

export const DEMO = {
  name: "AI Assignment Grader",
  blurb:
    "A single HTML page that calls an AI API directly from the browser to grade essays. No login. Results kept in localStorage. Teachers upload a rubric and assignments.",
  target: 10000,
  answers: {
    aiCalls: true,
    secretsInClient: true,
    aiSync: true,
    hasAuth: false,
    dataStore: "browser",
    hasBackend: false,
    fileUploads: true,
    hasLogging: false,
    humanReview: false,
    workload: "concurrent",
  },
};
