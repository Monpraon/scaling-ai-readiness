/* ─────────────────────────────────────────────────────────
   Scale My AI — deterministic assessment engine (bilingual TH/EN)

   Rules first. This module decides everything the report shows:
   what breaks first, what to fix next, the roadmap stage, and the
   AWS architecture at any given scale. No network, no model — so the
   demo always works, exactly as the spec requires.

   Every human-facing string carries both English (en) and Thai (th).
   The UI shows both at once.
   ───────────────────────────────────────────────────────── */

export const SCALES = [10, 100, 1000, 10000];

export const SCALE_LABEL = {
  10: { en: "Personal · 1–10", th: "ส่วนตัว · 1–10" },
  100: { en: "Small team · 10–100", th: "ทีมเล็ก · 10–100" },
  1000: { en: "Department · 100–1,000", th: "ระดับหน่วยงาน · 100–1,000" },
  10000: { en: "Organisation · 1,000–10,000+", th: "ระดับองค์กร · 1,000–10,000+" },
};

// Cloud providers. AWS is the default / recommended; the others let the
// architecture map to an equivalent stack so the tool doesn't look rigid.
export const CLOUDS = [
  { id: "aws", label: "AWS", note: { en: "recommended", th: "แนะนำ" } },
  { id: "gcp", label: "Google Cloud" },
  { id: "azure", label: "Azure" },
  { id: "huawei", label: "Huawei Cloud" },
];

// Service metadata. Role label (en/th) is cloud-agnostic; `svc` maps the
// role to each provider's closest product. Cross-cloud equivalents are
// approximate by nature.
export const SVC = {
  frontend: { en: "Frontend", th: "หน้าเว็บ", svc: { aws: "S3 + CloudFront / Amplify", gcp: "Cloud Storage + Cloud CDN", azure: "Static Web Apps + CDN", huawei: "OBS + CDN" } },
  auth: { en: "Auth", th: "ระบบล็อกอิน", svc: { aws: "Amazon Cognito", gcp: "Identity Platform", azure: "Entra ID (AD B2C)", huawei: "IAM / AppAuth" } },
  api: { en: "API", th: "API", svc: { aws: "API Gateway + Lambda", gcp: "API Gateway + Cloud Run", azure: "API Management + Functions", huawei: "API Gateway + FunctionGraph" } },
  ai: { en: "AI", th: "AI", svc: { aws: "Amazon Bedrock", gcp: "Vertex AI", azure: "Azure OpenAI", huawei: "ModelArts (Pangu)" } },
  aiWorker: { en: "AI Worker", th: "ตัวประมวลผล AI", svc: { aws: "Lambda + Bedrock", gcp: "Cloud Run + Vertex AI", azure: "Functions + Azure OpenAI", huawei: "FunctionGraph + ModelArts" } },
  queue: { en: "Queue", th: "คิวงาน", svc: { aws: "Amazon SQS", gcp: "Pub/Sub", azure: "Service Bus", huawei: "DMS (Kafka)" } },
  workflow: { en: "Workflow", th: "เวิร์กโฟลว์", svc: { aws: "Step Functions", gcp: "Workflows", azure: "Logic Apps", huawei: "FunctionGraph Flows" } },
  db: { en: "Database", th: "ฐานข้อมูล", svc: { aws: "Amazon DynamoDB", gcp: "Firestore", azure: "Cosmos DB", huawei: "GaussDB NoSQL" } },
  storage: { en: "File Storage", th: "ที่เก็บไฟล์", svc: { aws: "Amazon S3", gcp: "Cloud Storage", azure: "Blob Storage", huawei: "OBS" } },
  secrets: { en: "Secrets", th: "การเก็บความลับ", svc: { aws: "Secrets Manager", gcp: "Secret Manager", azure: "Key Vault", huawei: "CSMS" } },
  monitoring: { en: "Monitoring", th: "การเฝ้าระวัง", svc: { aws: "Amazon CloudWatch", gcp: "Cloud Monitoring", azure: "Azure Monitor", huawei: "Cloud Eye" } },
  audit: { en: "Audit", th: "บันทึกตรวจสอบ", svc: { aws: "AWS CloudTrail", gcp: "Cloud Audit Logs", azure: "Monitor Activity Log", huawei: "Cloud Trace (CTS)" } },
  cost: { en: "Cost Control", th: "ควบคุมค่าใช้จ่าย", svc: { aws: "AWS Budgets", gcp: "Billing Budgets", azure: "Cost Management", huawei: "Cost Center" } },
  review: { en: "Human Review", th: "การตรวจโดยมนุษย์", svc: { aws: "Step Functions approval", gcp: "Workflows approval", azure: "Logic Apps approval", huawei: "FunctionGraph approval" } },
  waf: { en: "Protection", th: "การป้องกัน", svc: { aws: "AWS WAF", gcp: "Cloud Armor", azure: "Azure WAF", huawei: "WAF" } },
};

// Resolve a service's product name for the chosen cloud (falls back to AWS).
export function svcName(key, cloud) {
  const s = SVC[key];
  if (!s) return "";
  return (s.svc && (s.svc[cloud] || s.svc.aws)) || "";
}

/* ── Assessment questions ───────────────────────────────── */

export const QUESTIONS = [
  {
    id: "aiCalls",
    en: "Does the app call an AI model?",
    th: "แอปของคุณเรียกใช้โมเดล AI หรือไม่",
    opts: [
      { en: "Yes", th: "ใช่", value: true },
      { en: "No", th: "ไม่", value: false },
    ],
  },
  {
    id: "secretsInClient",
    en: "Is an API key or secret stored in the browser / client code?",
    th: "มี API key หรือความลับเก็บอยู่ในเบราว์เซอร์ / โค้ดฝั่งผู้ใช้หรือไม่",
    opts: [
      { en: "Yes", th: "ใช่", value: true },
      { en: "Not sure", th: "ไม่แน่ใจ", value: true },
      { en: "No", th: "ไม่มี", value: false },
    ],
  },
  {
    id: "aiSync",
    en: "Are AI requests handled synchronously (the user waits for the response)?",
    th: "คำขอ AI ทำงานแบบซิงโครนัส (ผู้ใช้ต้องรอผล) หรือไม่",
    opts: [
      { en: "Yes, the user waits", th: "ใช่ ผู้ใช้ต้องรอ", value: true },
      { en: "No, it's queued / async", th: "ไม่ ใช้คิว / async", value: false },
    ],
    dependsOn: (a) => a.aiCalls === true,
  },
  {
    id: "hasAuth",
    en: "Is there user login / authentication?",
    th: "มีระบบล็อกอิน / ยืนยันตัวตนผู้ใช้หรือไม่",
    opts: [
      { en: "Yes", th: "มี", value: true },
      { en: "No", th: "ไม่มี", value: false },
    ],
  },
  {
    id: "dataStore",
    en: "Where is data stored today?",
    th: "ตอนนี้เก็บข้อมูลไว้ที่ไหน",
    opts: [
      { en: "Only in the browser (localStorage)", th: "ในเบราว์เซอร์เท่านั้น (localStorage)", value: "browser" },
      { en: "A server database", th: "ฐานข้อมูลบนเซิร์ฟเวอร์", value: "db" },
      { en: "Files on a server", th: "ไฟล์บนเซิร์ฟเวอร์", value: "files" },
      { en: "Nowhere / not sure", th: "ไม่ได้เก็บ / ไม่แน่ใจ", value: "none" },
    ],
  },
  {
    id: "hasBackend",
    en: "Is there a backend server (something beyond the static page)?",
    th: "มีเซิร์ฟเวอร์ฝั่งหลังบ้าน (นอกเหนือจากหน้าเว็บสแตติก) หรือไม่",
    opts: [
      { en: "Yes", th: "มี", value: true },
      { en: "No", th: "ไม่มี", value: false },
    ],
  },
  {
    id: "fileUploads",
    en: "Do users upload files?",
    th: "ผู้ใช้อัปโหลดไฟล์หรือไม่",
    opts: [
      { en: "Yes", th: "ใช่", value: true },
      { en: "No", th: "ไม่", value: false },
    ],
  },
  {
    id: "hasLogging",
    en: "Is there any logging or monitoring?",
    th: "มีการเก็บ log หรือเฝ้าระวังระบบหรือไม่",
    opts: [
      { en: "Yes", th: "มี", value: true },
      { en: "No", th: "ไม่มี", value: false },
    ],
  },
  {
    id: "humanReview",
    en: "Is there a human approval step for AI output?",
    th: "มีขั้นตอนให้คนตรวจอนุมัติผลลัพธ์ของ AI หรือไม่",
    opts: [
      { en: "Yes", th: "มี", value: true },
      { en: "No", th: "ไม่มี", value: false },
    ],
  },
  {
    id: "workload",
    en: "What does usage look like?",
    th: "ลักษณะการใช้งานเป็นอย่างไร",
    opts: [
      { en: "Occasional", th: "นาน ๆ ครั้ง", value: "occasional" },
      { en: "Daily", th: "ทุกวัน", value: "daily" },
      { en: "Bursty / spikes", th: "เป็นช่วงพุ่งสูง", value: "bursty" },
      { en: "Many at once", th: "จำนวนมากพร้อมกัน", value: "concurrent" },
    ],
  },
];

export function visibleQuestions(answers) {
  return QUESTIONS.filter((q) => !q.dependsOn || q.dependsOn(answers));
}

/* ── Risk rules: "what breaks first" ────────────────────── */

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
      title: { en: "API key exposed in the frontend", th: "API key ถูกเปิดเผยในฝั่งหน้าเว็บ" },
      why: {
        en: "Anyone can open dev tools, read the key, and run up your bill or abuse the model.",
        th: "ใครก็เปิด dev tools อ่านคีย์ได้ แล้วนำไปใช้จนค่าใช้จ่ายบานปลายหรือใช้โมเดลในทางที่ผิด",
      },
      fix: {
        en: "Move the key to a backend and store it in Secrets Manager. The browser should never see it.",
        th: "ย้ายคีย์ไปฝั่งหลังบ้านและเก็บใน Secrets Manager เบราว์เซอร์ไม่ควรเห็นคีย์เลย",
      },
    });
  }

  if (a.aiCalls && a.aiSync && (huge || spiky)) {
    risks.push({
      id: "sync-ai",
      sev: "high",
      title: { en: "AI requests processed synchronously", th: "คำขอ AI ถูกประมวลผลแบบซิงโครนัส" },
      why: {
        en: "At this scale, users waiting on live model calls means timeouts, retries, and runaway cost during spikes.",
        th: "ที่สเกลนี้ การให้ผู้ใช้รอผลโมเดลแบบสด ทำให้เกิด timeout การ retry และค่าใช้จ่ายพุ่งช่วงคนใช้เยอะ",
      },
      fix: {
        en: "Introduce an async queue (SQS) with workers, plus retries and rate limiting.",
        th: "เพิ่มคิวแบบ async (SQS) พร้อมตัวประมวลผล มีการ retry และจำกัดอัตราการเรียก",
      },
    });
  }

  if (!a.hasAuth && big) {
    risks.push({
      id: "no-auth",
      sev: "high",
      title: { en: "No user authentication", th: "ยังไม่มีระบบยืนยันตัวตนผู้ใช้" },
      why: {
        en: "With 100+ users you can't tell people apart, protect data, or stop abuse.",
        th: "เมื่อมีผู้ใช้ 100+ คน คุณจะแยกผู้ใช้ไม่ออก ปกป้องข้อมูลไม่ได้ และกันการใช้ผิดไม่ได้",
      },
      fix: {
        en: "Add authentication (Cognito) before opening it up.",
        th: "เพิ่มระบบล็อกอิน (Cognito) ก่อนเปิดให้คนใช้ทั่วไป",
      },
    });
  }

  if (a.dataStore === "browser" && big) {
    risks.push({
      id: "browser-data",
      sev: "high",
      title: { en: "Data stored only in the browser", th: "เก็บข้อมูลไว้ในเบราว์เซอร์เท่านั้น" },
      why: {
        en: "localStorage is per-device and easily lost. It can't back a multi-user app.",
        th: "localStorage ผูกกับเครื่องแต่ละเครื่องและหายง่าย ใช้รองรับแอปหลายผู้ใช้ไม่ได้",
      },
      fix: {
        en: "Add a persistent database (DynamoDB) behind your API.",
        th: "เพิ่มฐานข้อมูลถาวร (DynamoDB) ไว้หลัง API",
      },
    });
  }

  if (!a.hasBackend && (a.aiCalls || big)) {
    risks.push({
      id: "no-backend",
      sev: "high",
      title: { en: "No backend to enforce anything", th: "ไม่มีหลังบ้านไว้บังคับใช้กฎ" },
      why: {
        en: "Without a server you can't hold secrets, authenticate, validate input, or control cost.",
        th: "ถ้าไม่มีเซิร์ฟเวอร์ คุณจะเก็บความลับ ยืนยันตัวตน ตรวจสอบข้อมูล หรือคุมค่าใช้จ่ายไม่ได้",
      },
      fix: {
        en: "Stand up API Gateway + Lambda as the trusted layer between the browser and your data/model.",
        th: "ตั้ง API Gateway + Lambda เป็นชั้นที่เชื่อถือได้ระหว่างเบราว์เซอร์กับข้อมูล/โมเดล",
      },
    });
  }

  if (a.fileUploads && a.dataStore !== "files" && big) {
    risks.push({
      id: "uploads",
      sev: "medium",
      title: { en: "File uploads with no object storage", th: "มีการอัปโหลดไฟล์แต่ไม่มีที่เก็บอ็อบเจกต์" },
      why: {
        en: "Uploads need durable, scalable storage with lifecycle and access controls.",
        th: "ไฟล์อัปโหลดต้องการที่เก็บที่ทนทาน ขยายได้ และควบคุมสิทธิ์เข้าถึง",
      },
      fix: {
        en: "Store uploads in S3 with size limits and automatic expiry.",
        th: "เก็บไฟล์ใน S3 พร้อมจำกัดขนาดและตั้งเวลาให้หมดอายุอัตโนมัติ",
      },
    });
  }

  if (!a.hasLogging && huge) {
    risks.push({
      id: "no-logs",
      sev: "medium",
      title: { en: "No logging or monitoring", th: "ไม่มีการเก็บ log หรือเฝ้าระวัง" },
      why: {
        en: "At scale you can't debug failures or spot abuse you can't see.",
        th: "เมื่อสเกลใหญ่ขึ้น คุณจะดีบักปัญหาไม่ได้ และมองไม่เห็นการใช้ผิด",
      },
      fix: {
        en: "Add CloudWatch logs, metrics, and alarms.",
        th: "เพิ่ม CloudWatch สำหรับ log เมตริก และการแจ้งเตือน",
      },
    });
  }

  if (a.aiCalls && !a.humanReview && massive) {
    risks.push({
      id: "no-governance",
      sev: "medium",
      title: { en: "No human review or governance on AI output", th: "ไม่มีการตรวจโดยมนุษย์หรือการกำกับผลลัพธ์ AI" },
      why: {
        en: "At organisation scale, unreviewed AI decisions become a compliance and trust risk.",
        th: "ที่ระดับองค์กร การตัดสินของ AI ที่ไม่มีคนตรวจกลายเป็นความเสี่ยงด้านการปฏิบัติตามกฎและความน่าเชื่อถือ",
      },
      fix: {
        en: "Add an approval step, audit trail, and cost controls.",
        th: "เพิ่มขั้นตอนอนุมัติ บันทึกตรวจสอบ (audit trail) และการควบคุมค่าใช้จ่าย",
      },
    });
  }

  return risks.sort((x, y) => riskRank(x) - riskRank(y));
}

// One ordering used everywhere: severity first, then a single importance
// list. This guarantees "what breaks first" and "what to fix next" agree.
const SEV_ORDER = { high: 0, medium: 1, low: 2 };
const RISK_PRIORITY = [
  "secrets",
  "no-backend",
  "no-auth",
  "browser-data",
  "sync-ai",
  "uploads",
  "no-logs",
  "no-governance",
];

function riskRank(r) {
  const p = RISK_PRIORITY.indexOf(r.id);
  return SEV_ORDER[r.sev] * 100 + (p === -1 ? 99 : p);
}

/* ── "What to fix next" — same order as the risks above ─── */

export function nextFixes(risks) {
  // risks are already in final priority order; mirror them exactly.
  return risks.map((r) => r.fix);
}

/* ── Roadmap ────────────────────────────────────────────── */

export const ROADMAP = [
  { stage: { en: "Prototype", th: "ต้นแบบ" }, detail: { en: "Frontend + direct AI call", th: "หน้าเว็บ + เรียก AI ตรง" } },
  { stage: { en: "Shared App", th: "แอปที่แชร์ได้" }, detail: { en: "Frontend + Backend + Secrets Management", th: "หน้าเว็บ + หลังบ้าน + จัดการความลับ" } },
  { stage: { en: "Multi-user", th: "หลายผู้ใช้" }, detail: { en: "Authentication + Database + Storage", th: "ล็อกอิน + ฐานข้อมูล + ที่เก็บไฟล์" } },
  { stage: { en: "Scalable AI", th: "AI ที่ขยายได้" }, detail: { en: "Queue + Worker + Retry + Rate Limit", th: "คิว + ตัวประมวลผล + retry + จำกัดอัตรา" } },
  { stage: { en: "Governed AI", th: "AI ที่กำกับดูแล" }, detail: { en: "Audit + Monitoring + Human Review + Cost Control", th: "บันทึกตรวจสอบ + เฝ้าระวัง + คนตรวจ + คุมค่าใช้จ่าย" } },
];

export function roadmapIndexForScale(scale) {
  if (scale >= 10000) return 4;
  if (scale >= 1000) return 3;
  if (scale >= 100) return 2;
  return 1;
}

/* ── Architecture at a given scale ──────────────────────── */

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

  if (a.aiCalls !== false || scale >= 100) governance.push("secrets");
  if (scale >= 1000) governance.push("monitoring");
  if (scale >= 10000) governance.push("audit", "cost", "review", "waf");

  return { pipeline, governance };
}

/* ── Report → Markdown (bilingual) ──────────────────────── */

export function reportToMarkdown({ appType, description, target, scale, risks, fixes, cloud = "aws" }) {
  const cloudLabel = (CLOUDS.find((c) => c.id === cloud) || CLOUDS[0]).label;
  const L = [];
  L.push(`# Scale My AI — Scaling Assessment / ผลประเมินการสเกล`);
  L.push("");
  L.push(`- **Target scale / สเกลเป้าหมาย:** ${target.toLocaleString()} — ${SCALE_LABEL[target].en} · ${SCALE_LABEL[target].th}`);
  L.push(`- **App type / ประเภทแอป:** ${appType || "prototype"}`);
  if (description) L.push(`- **Description / คำอธิบาย:** ${description}`);
  L.push(`- **Generated / สร้างเมื่อ:** ${new Date().toISOString().slice(0, 10)}`);
  L.push("");

  L.push(`## What will break first / อะไรจะพังก่อน`);
  if (!risks.length) {
    L.push(`No blocking risks detected for this scale. / ไม่พบความเสี่ยงที่ปิดกั้นสำหรับสเกลนี้`);
  } else {
    for (const r of risks) {
      L.push(`### [${r.sev.toUpperCase()}] ${r.title.en} / ${r.title.th}`);
      L.push(`- **Why / ทำไม:** ${r.why.en} — ${r.why.th}`);
      L.push(`- **Fix / วิธีแก้:** ${r.fix.en} — ${r.fix.th}`);
      L.push("");
    }
  }
  L.push("");

  if (fixes.length) {
    L.push(`## What to fix next / ต้องแก้อะไรต่อ`);
    fixes.forEach((f, i) => L.push(`${i + 1}. ${f.en} / ${f.th}`));
    L.push("");
  }

  const { pipeline, governance } = architectureForScale(scale, {});
  L.push(`## Architecture at ${scale.toLocaleString()} users / สถาปัตยกรรมที่ ${scale.toLocaleString()} ผู้ใช้`);
  L.push(`**Cloud / คลาวด์:** ${cloudLabel}`);
  L.push(`**Flow / ลำดับ:** ${pipeline.map((k) => SVC[k].en).join(" → ")}`);
  L.push("");
  for (const k of pipeline) L.push(`- **${SVC[k].en} / ${SVC[k].th}** — ${svcName(k, cloud)}`);
  if (governance.length) {
    L.push("");
    L.push(`**Cross-cutting / องค์ประกอบร่วม:**`);
    for (const k of governance) L.push(`- **${SVC[k].en} / ${SVC[k].th}** — ${svcName(k, cloud)}`);
  }
  L.push("");

  const idx = roadmapIndexForScale(scale);
  L.push(`## Scaling roadmap / แผนการสเกล`);
  ROADMAP.forEach((r, i) => {
    const mark = i < idx ? "x" : i === idx ? ">" : " ";
    const here = i === idx ? "  _(you're here / คุณอยู่ที่นี่)_" : "";
    L.push(`- [${mark}] **${r.stage.en} / ${r.stage.th}** — ${r.detail.en} · ${r.detail.th}${here}`);
  });
  L.push("");
  L.push(`---`);
  L.push(`_Generated by Scale My AI / สร้างโดย Scale My AI_`);
  return L.join("\n");
}

/* ── Demo scenario: AI Assignment Grader ────────────────── */

export const DEMO = {
  name: { en: "AI Assignment Grader", th: "ระบบ AI ตรวจงานนักเรียน" },
  blurb: {
    en: "A single HTML page that calls an AI API directly from the browser to grade essays. No login. Results kept in localStorage. Teachers upload a rubric and assignments.",
    th: "หน้า HTML หน้าเดียวที่เรียก AI API ตรงจากเบราว์เซอร์เพื่อให้คะแนนเรียงความ ไม่มีล็อกอิน เก็บผลไว้ใน localStorage ครูอัปโหลดเกณฑ์และงานของนักเรียน",
  },
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
