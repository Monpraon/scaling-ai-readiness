import { useState, useMemo, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import {
  SCALES,
  SCALE_LABEL,
  SVC,
  CLOUDS,
  svcName,
  visibleQuestions,
  assessRisks,
  nextFixes,
  isReady,
  scanWarnings,
  ROADMAP,
  roadmapIndexForScale,
  architectureForScale,
  reportToMarkdown,
  DEMO,
} from "./engine";
import { scanRepo, RepoAccessError } from "./scan";
import { explainFindings, recordStats, loadStats, scanRepoBackend, hasBackend } from "./api";

const BRAND = {
  name: import.meta.env.VITE_BRAND_NAME ?? "Scale My AI",
  ctaUrl: import.meta.env.VITE_CTA_URL ?? "",
};

const C = {
  bg: "#0B0B0D",
  card: "#151518",
  cardUp: "#1C1C20",
  line: "#26262B",
  accent: "#7C5CFF",
  accentDim: "#4B3AA6",
  cyan: "#38E1C6",
  green: "#4ADE80",
  amber: "#F5A623",
  red: "#FF4D5E",
  text: "#F4F4F6",
  mut: "#9C9CA6",
  faint: "#5C5C66",
};

const SEV = { high: C.red, medium: C.amber, low: C.cyan, warn: C.cyan };

/* bilingual UI strings */
const UI = {
  eyebrowHome: { en: "Scaling readiness for AI prototypes", th: "ความพร้อมในการสเกลสำหรับต้นแบบ AI" },
  homeLede: {
    en: "Find out what breaks first, what to fix next, and the AWS architecture you need — as your users go from 10 to 10,000.",
    th: "ดูว่าอะไรจะพังก่อน ต้องแก้อะไรต่อ และสถาปัตยกรรม AWS ที่คุณต้องใช้ เมื่อผู้ใช้เพิ่มจาก 10 เป็น 10,000",
  },
  doorRepoT: { en: "I have a repo", th: "ฉันมี repo" },
  doorRepoS: { en: "Point us at a GitHub URL and describe your app", th: "ใส่ลิงก์ GitHub แล้วอธิบายแอปของคุณ" },
  doorNoRepoT: { en: "I just have something that works", th: "ฉันมีแค่บางอย่างที่ใช้งานได้" },
  doorNoRepoS: { en: "An HTML page, a prototype, or a description", th: "หน้า HTML ต้นแบบ หรือคำอธิบาย" },
  demoBtn: { en: '▶ Try the demo — "AI Assignment Grader" at 10,000 students', th: '▶ ลองเดโม — "ระบบ AI ตรวจงานนักเรียน" ที่ 10,000 คน' },
  qrLink: { en: "Show QR code to share →", th: "แสดง QR เพื่อแชร์ →" },
  startOver: { en: "Start over", th: "เริ่มใหม่" },
  scanOpen: { en: "Scan to open", th: "สแกนเพื่อเปิด" },
  shareThis: { en: "Share this assessment", th: "แชร์แบบประเมินนี้" },
  back: { en: "← Back", th: "ย้อนกลับ" },
  yourRepo: { en: "Your repository", th: "repo ของคุณ" },
  yourProto: { en: "Your prototype", th: "ต้นแบบของคุณ" },
  tellUs: { en: "Tell us about your app", th: "เล่าเกี่ยวกับแอปของคุณ" },
  ghUrl: { en: "GitHub URL", th: "ลิงก์ GitHub" },
  descOpt: { en: "Short description (optional)", th: "คำอธิบายสั้น ๆ (ไม่บังคับ)" },
  descReq: { en: "Describe what you built", th: "อธิบายสิ่งที่คุณสร้าง" },
  descPh: {
    en: "e.g. A single HTML page that calls an AI API to summarise documents. No login yet.",
    th: "เช่น หน้า HTML หน้าเดียวที่เรียก AI API เพื่อสรุปเอกสาร ยังไม่มีล็อกอิน",
  },
  howMany: { en: "How many people should it support?", th: "ต้องรองรับกี่คน" },
  continue: { en: "Continue to assessment →", th: "ไปต่อที่แบบประเมิน →" },
  reportEyebrow: { en: "Your scaling assessment", th: "ผลประเมินการสเกลของคุณ" },
  breakFirst: { en: "What will break first", th: "อะไรจะพังก่อน" },
  fixNext: { en: "What to fix next", th: "ต้องแก้อะไรต่อ" },
  archScale: { en: "Architecture at your scale", th: "สถาปัตยกรรมตามสเกลของคุณ" },
  cloudLabel: { en: "Cloud provider", th: "ผู้ให้บริการคลาวด์" },
  cloudNote: { en: "AWS is the reference; equivalents shown for other clouds.", th: "ใช้ AWS เป็นหลัก และแสดงบริการเทียบเท่าของคลาวด์อื่น" },
  roadmap: { en: "Scaling roadmap", th: "แผนการสเกล" },
  crosscut: { en: "Cross-cutting at this scale", th: "องค์ประกอบร่วมที่สเกลนี้" },
  sliderNote: {
    en: "Drag the slider — the architecture evolves as your user count grows.",
    th: "ลากแถบเลื่อน — สถาปัตยกรรมจะเปลี่ยนตามจำนวนผู้ใช้",
  },
  youreHere: { en: "YOU'RE HERE", th: "คุณอยู่ที่นี่" },
  okBasics: {
    en: "Your current setup already covers the basics for this scale.",
    th: "ระบบปัจจุบันของคุณครอบคลุมพื้นฐานสำหรับสเกลนี้แล้ว",
  },
  explain: { en: "✨ Explain this in plain language", th: "✨ อธิบายแบบเข้าใจง่าย" },
  thinking: { en: "Thinking…", th: "กำลังคิด…" },
  aiUnavail: {
    en: "The AI explainer isn't available right now — your report above is complete without it.",
    th: "ตัวช่วยอธิบายด้วย AI ยังใช้ไม่ได้ตอนนี้ — รายงานด้านบนสมบูรณ์อยู่แล้ว",
  },
  plainLang: { en: "In plain language", th: "อธิบายแบบเข้าใจง่าย" },
  ctaLine: {
    en: "Your AI prototype works. Now make it ready for everyone.",
    th: "ต้นแบบ AI ของคุณใช้งานได้แล้ว ทีนี้ทำให้พร้อมสำหรับทุกคน",
  },
  download: { en: "↓ Download report (.md)", th: "↓ ดาวน์โหลดรายงาน (.md)" },
  again: { en: "Run another assessment", th: "ประเมินใหม่อีกครั้ง" },
  consentTitle: { en: "Permission to read your repo", th: "ขออนุญาตอ่าน repo ของคุณ" },
  consentBody: {
    en: "To analyze your app we read your repository's code (public repos in your browser; private repos via our server using a read-only token). We do NOT store your code or the repo URL. We keep only anonymous statistics about the components we detect (e.g. how many apps have auth).",
    th: "เพื่อวิเคราะห์แอป เราจะอ่านโค้ดใน repo ของคุณ (repo สาธารณะผ่านเบราว์เซอร์ ส่วน repo ส่วนตัวผ่านเซิร์ฟเวอร์ด้วยโทเคนแบบอ่านอย่างเดียว) เราไม่เก็บโค้ดหรือ URL เราเก็บเพียงสถิติแบบไม่ระบุตัวตนเกี่ยวกับองค์ประกอบที่ตรวจพบ (เช่น มีกี่แอปที่มีระบบล็อกอิน)",
  },
  consentAgree: { en: "I agree — scan my repo", th: "ฉันยินยอม — สแกน repo" },
  scanning: { en: "Reading your repo…", th: "กำลังอ่าน repo…" },
  scanned: { en: "Here's what we found", th: "นี่คือสิ่งที่เราตรวจพบ" },
  scanReview: { en: "Review & adjust on the next step.", th: "ตรวจสอบและปรับได้ในขั้นตอนถัดไป" },
  filesScanned: { en: "files scanned", th: "ไฟล์ที่สแกน" },
  errPrivate: {
    en: "We couldn't read this repo — it may be private or not exist. The public tool only reads public repos. You can make it public, or continue with the questionnaire.",
    th: "อ่าน repo นี้ไม่ได้ — อาจเป็นแบบส่วนตัวหรือไม่มีอยู่ เครื่องมือสาธารณะอ่านได้เฉพาะ repo สาธารณะ คุณอาจตั้งเป็นสาธารณะ หรือทำแบบสอบถามต่อ",
  },
  errRate: { en: "GitHub rate limit reached. Try again shortly, or continue with the questionnaire.", th: "ถึงขีดจำกัดการเรียก GitHub ลองใหม่อีกครั้ง หรือทำแบบสอบถามต่อ" },
  errInvalid: { en: "That doesn't look like a GitHub URL.", th: "ลิงก์นี้ไม่เหมือน URL ของ GitHub" },
  errScan: { en: "Couldn't scan that repo. You can continue with the questionnaire.", th: "สแกน repo ไม่สำเร็จ คุณทำแบบสอบถามต่อได้" },
  continueManual: { en: "Continue with the questionnaire →", th: "ทำแบบสอบถามต่อ →" },
  seeReport: { en: "See my report →", th: "ดูรายงานของฉัน →" },
  notDetected: { en: "Not detected — worth checking", th: "ไม่พบ — ควรตรวจสอบ" },
  fromRepo: { en: "Read from your repo", th: "อ่านจาก repo ของคุณ" },
  scannedNote: { en: "based on the files we could read; components may exist elsewhere.", th: "อ้างอิงจากไฟล์ที่อ่านได้ องค์ประกอบอาจมีอยู่ที่อื่น" },
  editManual: { en: "Something off? Answer manually", th: "ไม่ตรง? ตอบเอง" },
  statsLink: { en: "See community stats", th: "ดูสถิติรวม" },
  statsTitle: { en: "What we're seeing", th: "ภาพรวมที่เราเห็น" },
  statsSub: { en: "Anonymous, aggregate — no code or URLs stored.", th: "ไม่ระบุตัวตนและเป็นภาพรวม — ไม่เก็บโค้ดหรือ URL" },
  statAnalyzed: { en: "apps analysed", th: "แอปที่วิเคราะห์" },
  statReady: { en: "Ready to scale", th: "พร้อมสเกล" },
  statNotReady: { en: "Not yet ready", th: "ยังไม่พร้อม" },
  statTopGaps: { en: "Most common gaps", th: "ช่องว่างที่พบบ่อย" },
  statByScale: { en: "By target scale", th: "ตามสเกลเป้าหมาย" },
  statNone: { en: "No data yet — be the first to run an assessment.", th: "ยังไม่มีข้อมูล — เป็นคนแรกที่ประเมินได้เลย" },
};

const RISK_LABEL = {
  secrets: { en: "Exposed API key", th: "คีย์ API ถูกเปิดเผย" },
  "verify-secrets": { en: "Unverified key location", th: "ไม่ยืนยันที่เก็บคีย์" },
  "no-backend": { en: "No backend", th: "ไม่มีหลังบ้าน" },
  "no-auth": { en: "No authentication", th: "ไม่มีระบบล็อกอิน" },
  "browser-data": { en: "Browser-only data", th: "ข้อมูลอยู่ในเบราว์เซอร์" },
  "sync-ai": { en: "Synchronous AI", th: "AI แบบซิงโครนัส" },
  uploads: { en: "Uploads, no storage", th: "อัปโหลดไม่มีที่เก็บ" },
  "no-logs": { en: "No monitoring", th: "ไม่มีการเฝ้าระวัง" },
  "no-governance": { en: "No AI governance", th: "ไม่มีการกำกับ AI" },
};

function downloadMarkdown(filename, text) {
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const shareUrl = () =>
  typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";

/* ── atoms ──────────────────────────────────────────────── */

// Bilingual block: English primary, Thai beneath (muted, smaller).
function Bi({ en, th, style, thStyle }) {
  return (
    <span style={{ display: "block", ...style }}>
      <span style={{ display: "block" }}>{en}</span>
      <span style={{ display: "block", color: C.mut, fontSize: "0.82em", fontWeight: 400, marginTop: 2, ...thStyle }}>
        {th}
      </span>
    </span>
  );
}

function Eyebrow({ en, th }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ color: C.accent, fontWeight: 800, fontSize: 12 }}>◆</span>
      <span style={{ color: C.mut, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", fontWeight: 700 }}>
        {en} · {th}
      </span>
    </div>
  );
}

function Btn({ children, onClick, ghost, disabled, full, small }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        border: ghost ? `1px solid ${C.line}` : "none",
        background: ghost ? "transparent" : `linear-gradient(135deg, ${C.accent}, ${C.accentDim})`,
        color: ghost ? C.mut : "#fff",
        fontWeight: 700,
        fontSize: small ? 13 : 14,
        padding: small ? "8px 14px" : "11px 18px",
        borderRadius: 10,
        width: full ? "100%" : "auto",
        lineHeight: 1.3,
      }}
    >
      {children}
    </button>
  );
}

// A button whose label is bilingual (EN over TH).
function BiBtn({ label, ...rest }) {
  return (
    <Btn {...rest}>
      <span style={{ display: "block" }}>{label.en}</span>
      <span style={{ display: "block", fontSize: "0.8em", opacity: 0.85, fontWeight: 500 }}>{label.th}</span>
    </Btn>
  );
}

/* ── architecture diagram ───────────────────────────────── */

function Node({ svcKey, dim, cloud }) {
  const s = SVC[svcKey];
  return (
    <div
      style={{
        background: dim ? C.card : "linear-gradient(135deg, rgba(124,92,255,0.18), rgba(124,92,255,0.04))",
        border: `1px solid ${dim ? C.line : C.accent}`,
        borderRadius: 12,
        padding: "9px 12px",
        minWidth: 96,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 12.5, color: C.text }}>{s.en}</div>
      <div style={{ fontSize: 10, color: C.faint }}>{s.th}</div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 3, lineHeight: 1.3 }}>{svcName(svcKey, cloud)}</div>
    </div>
  );
}

function Architecture({ scale, answers, cloud }) {
  const { pipeline, governance } = useMemo(() => architectureForScale(scale, answers), [scale, answers]);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {pipeline.map((k, i) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Node svcKey={k} cloud={cloud} />
            {i < pipeline.length - 1 && <span style={{ color: C.accent, fontWeight: 800 }}>→</span>}
          </div>
        ))}
      </div>
      {governance.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 8, fontWeight: 700 }}>
            {UI.crosscut.en} · {UI.crosscut.th}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {governance.map((k) => (
              <Node key={k} svcKey={k} dim cloud={cloud} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── screens ────────────────────────────────────────────── */

export default function App() {
  const [view, setView] = useState("home");
  const [path, setPath] = useState(null);
  const [meta, setMeta] = useState({ url: "", description: "" });
  const [target, setTarget] = useState(1000);
  const [answers, setAnswers] = useState({});
  const [scanMeta, setScanMeta] = useState(null); // { repo, filesScanned } when repo-sourced

  const startDemo = () => {
    setPath("demo");
    setMeta({ url: "", description: `${DEMO.blurb.en} / ${DEMO.blurb.th}` });
    setTarget(DEMO.target);
    setAnswers(DEMO.answers);
    setScanMeta(null);
    setView("report");
  };

  const reset = () => {
    setPath(null);
    setMeta({ url: "", description: "" });
    setTarget(1000);
    setAnswers({});
    setScanMeta(null);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1100px 480px at 50% -10%, rgba(124,92,255,0.10), transparent), ${C.bg}`,
        color: C.text,
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans Thai', 'Helvetica Neue', sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "0 0 56px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 680, padding: "22px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 26 }}>
          <button
            onClick={() => { setView("home"); reset(); }}
            style={{ display: "flex", alignItems: "center", gap: 9, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            <span style={{ fontSize: 18 }}>⚡</span>
            <span style={{ fontWeight: 800, fontSize: 15, color: C.text }}>{BRAND.name}</span>
          </button>
          {view !== "home" && (
            <button
              onClick={() => { setView("home"); reset(); }}
              style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 8, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer", lineHeight: 1.25 }}
            >
              {UI.startOver.en}<br />{UI.startOver.th}
            </button>
          )}
        </div>

        {view === "home" && (
          <Home
            onPick={(p) => { setPath(p); setView("input"); }}
            onDemo={startDemo}
            onQR={() => setView("qr")}
            onStats={() => setView("stats")}
          />
        )}
        {view === "qr" && <ShareQR onBack={() => setView("home")} />}
        {view === "stats" && <StatsView onBack={() => setView("home")} />}
        {view === "input" && (
          <InputScreen
            path={path}
            meta={meta}
            setMeta={setMeta}
            target={target}
            setTarget={setTarget}
            onNext={() => { setScanMeta(null); setView("assess"); }}
            onScanned={(result) => {
              setAnswers(result.answers);
              setScanMeta({ repo: result.repo, filesScanned: result.filesScanned });
              setView("report");
            }}
          />
        )}
        {view === "assess" && (
          <Assess answers={answers} setAnswers={setAnswers} onDone={() => setView("report")} onBack={() => setView("input")} />
        )}
        {view === "report" && (
          <Report
            path={path}
            meta={meta}
            answers={answers}
            target={target}
            scanMeta={scanMeta}
            onEditManually={() => setView("assess")}
            onAgain={() => { setView("home"); reset(); }}
          />
        )}
      </div>
    </div>
  );
}

function ShareQR({ onBack }) {
  const url = shareUrl();
  return (
    <div>
      <Eyebrow en={UI.scanOpen.en} th={UI.scanOpen.th} />
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 4px" }}>{UI.shareThis.en}</h2>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 18px" }}>{UI.shareThis.th}</p>
      <div style={{ display: "flex", justifyContent: "center", marginBottom: 18 }}>
        <div style={{ background: "#fff", padding: 18, borderRadius: 16 }}>
          <QRCodeSVG value={url} size={220} level="M" />
        </div>
      </div>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 13, color: C.mut, wordBreak: "break-all", marginBottom: 18 }}>
        {url}
      </div>
      <BiBtn ghost label={UI.back} onClick={onBack} />
    </div>
  );
}

function StatsView({ onBack }) {
  const [state, setState] = useState("busy"); // busy | done | error
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        setData(await loadStats());
        setState("done");
      } catch {
        setState("error");
      }
    })();
  }, []);

  const total = data?.total || 0;
  const readyPct = total ? Math.round((data.ready / total) * 100) : 0;
  const riskEntries = data
    ? Object.entries(data.risks).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1])
    : [];
  const maxRisk = riskEntries.reduce((m, [, n]) => Math.max(m, n), 1);
  const maxScale = data ? Math.max(...SCALES.map((s) => data.targets[s] || 0), 1) : 1;

  return (
    <div>
      <Eyebrow en={UI.statsTitle.en} th={UI.statsTitle.th} />
      <h2 style={{ fontSize: 23, fontWeight: 800, margin: "0 0 2px" }}>{UI.statAnalyzed.en}</h2>
      <p style={{ color: C.faint, fontSize: 12.5, margin: "0 0 18px" }}>{UI.statsSub.en} · {UI.statsSub.th}</p>

      {state === "busy" && <p style={{ color: C.mut, fontSize: 13 }}>…</p>}
      {state === "error" && <p style={{ color: C.amber, fontSize: 13 }}>—</p>}

      {state === "done" && total === 0 && (
        <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: "28px 18px", textAlign: "center", color: C.faint, fontSize: 13.5 }}>
          {UI.statNone.en}<br />{UI.statNone.th}
        </div>
      )}

      {state === "done" && total > 0 && (
        <div style={{ display: "grid", gap: 20 }}>
          <div style={{ display: "flex", gap: 10 }}>
            <Stat big value={total} label={UI.statAnalyzed} />
            <Stat value={`${readyPct}%`} label={UI.statReady} color={C.green} />
            <Stat value={total - data.ready} label={UI.statNotReady} color={C.amber} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.mut, fontWeight: 700, marginBottom: 10 }}>{UI.statTopGaps.en} · {UI.statTopGaps.th}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {riskEntries.map(([id, n]) => (
                <div key={id}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{(RISK_LABEL[id] || { en: id }).en} · {(RISK_LABEL[id] || { th: id }).th}</span>
                    <span style={{ fontWeight: 800, color: C.mut }}>{n}</span>
                  </div>
                  <Bar pct={(n / maxRisk) * 100} />
                </div>
              ))}
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: C.mut, fontWeight: 700, marginBottom: 10 }}>{UI.statByScale.en} · {UI.statByScale.th}</div>
            <div style={{ display: "grid", gap: 8 }}>
              {SCALES.map((s) => (
                <div key={s}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{s.toLocaleString()} · {SCALE_LABEL[s].th}</span>
                    <span style={{ fontWeight: 800, color: C.mut }}>{data.targets[s] || 0}</span>
                  </div>
                  <Bar pct={((data.targets[s] || 0) / maxScale) * 100} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div style={{ marginTop: 22 }}>
        <BiBtn ghost label={UI.back} onClick={onBack} />
      </div>
    </div>
  );
}

function Stat({ value, label, color, big }) {
  return (
    <div style={{ flex: 1, background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 12px", textAlign: "center" }}>
      <div style={{ fontSize: big ? 30 : 24, fontWeight: 900, color: color || C.accent }}>{value}</div>
      <div style={{ fontSize: 11, color: C.mut, marginTop: 2 }}>{label.en}</div>
      <div style={{ fontSize: 10.5, color: C.faint }}>{label.th}</div>
    </div>
  );
}

function Bar({ pct }) {
  return (
    <div style={{ height: 8, background: C.line, borderRadius: 5, overflow: "hidden" }}>
      <div style={{ height: "100%", width: `${pct}%`, background: `linear-gradient(90deg, ${C.accentDim}, ${C.accent})`, borderRadius: 5 }} />
    </div>
  );
}

function Home({ onPick, onDemo, onQR, onStats }) {
  return (
    <div>
      <Eyebrow en={UI.eyebrowHome.en} th={UI.eyebrowHome.th} />
      <h1 style={{ fontSize: 33, lineHeight: 1.12, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        You built an AI app.<br />Now scale it.
      </h1>
      <p style={{ color: C.mut, fontSize: 15, fontWeight: 600, margin: "0 0 14px" }}>
        คุณสร้างแอป AI แล้ว — ตอนนี้มาสเกลกันเถอะ
      </p>
      <p style={{ color: C.mut, fontSize: 14.5, lineHeight: 1.55, margin: "0 0 6px" }}>{UI.homeLede.en}</p>
      <p style={{ color: C.faint, fontSize: 13, lineHeight: 1.55, margin: "0 0 26px" }}>{UI.homeLede.th}</p>

      <div style={{ display: "grid", gap: 12 }}>
        <DoorCard title={UI.doorRepoT} sub={UI.doorRepoS} onClick={() => onPick("repo")} primary />
        <DoorCard title={UI.doorNoRepoT} sub={UI.doorNoRepoS} onClick={() => onPick("noRepo")} />
      </div>

      <button
        onClick={onDemo}
        style={{ marginTop: 18, background: "none", border: "none", color: C.accent, fontSize: 13.5, cursor: "pointer", fontWeight: 700, textAlign: "left", padding: 0, lineHeight: 1.4 }}
      >
        {UI.demoBtn.en}<br />
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{UI.demoBtn.th}</span>
      </button>

      <div>
        <button
          onClick={onQR}
          style={{ marginTop: 16, background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
        >
          {UI.qrLink.en} · {UI.qrLink.th}
        </button>
        {hasBackend && (
          <button
            onClick={onStats}
            style={{ display: "block", marginTop: 10, background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
          >
            {UI.statsLink.en} · {UI.statsLink.th}
          </button>
        )}
      </div>
    </div>
  );
}

function DoorCard({ title, sub, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: primary ? "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(124,92,255,0.03))" : C.card,
        border: `1px solid ${primary ? C.accent : C.line}`,
        borderRadius: 14,
        padding: "16px 18px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 16.5 }}>{title.en}</div>
          <div style={{ fontSize: 13, color: C.mut, fontWeight: 600 }}>{title.th}</div>
          <div style={{ color: C.mut, fontSize: 12, marginTop: 6 }}>{sub.en}</div>
          <div style={{ color: C.faint, fontSize: 11.5 }}>{sub.th}</div>
        </div>
        <span style={{ color: primary ? C.accent : C.faint, fontSize: 20, fontWeight: 700 }}>→</span>
      </div>
    </button>
  );
}

const DET_LABEL = {
  aiCalls: { en: "Calls an AI model", th: "เรียกโมเดล AI" },
  secretsInClient: { en: "Key in frontend", th: "คีย์อยู่ฝั่งหน้าเว็บ" },
  hasBackend: { en: "Has a backend", th: "มีหลังบ้าน" },
  fileUploads: { en: "File uploads", th: "อัปโหลดไฟล์" },
  hasLogging: { en: "Logging/monitoring", th: "มีการเฝ้าระวัง" },
};
const yn = (v) => (v === true ? { en: "Yes", th: "ใช่" } : v === false ? { en: "No", th: "ไม่" } : { en: "—", th: "—" });

function InputScreen({ path, meta, setMeta, target, setTarget, onNext, onScanned }) {
  const isRepo = path === "repo";
  const head = isRepo ? UI.yourRepo : UI.yourProto;
  const descLabel = isRepo ? UI.descOpt : UI.descReq;

  const [consent, setConsent] = useState(false);
  const [scanState, setScanState] = useState("idle"); // idle | busy | done | error
  const [scanErr, setScanErr] = useState(null);
  const [result, setResult] = useState(null);

  const runScan = async () => {
    setScanState("busy");
    setScanErr(null);
    setResult(null);
    try {
      const r = await scanRepo(meta.url);
      setResult(r);
      setScanState("done");
    } catch (e) {
      const kind = e instanceof RepoAccessError ? e.kind : "error";
      // Public scan failed because the repo is private/missing — if a
      // backend token is configured, try the server-side scan.
      if (kind === "private_or_missing" && hasBackend) {
        try {
          const r = await scanRepoBackend(meta.url);
          setResult(r);
          setScanState("done");
          return;
        } catch (be) {
          setScanErr(be.code === "not-configured" ? UI.errPrivate : be.code === "auth" ? UI.errPrivate : be.code === "not-found" ? UI.errPrivate : UI.errScan);
          setScanState("error");
          return;
        }
      }
      setScanErr(
        kind === "invalid" ? UI.errInvalid : kind === "ratelimited" ? UI.errRate : kind === "private_or_missing" ? UI.errPrivate : UI.errScan
      );
      setScanState("error");
    }
  };

  return (
    <div>
      <Eyebrow en={head.en} th={head.th} />
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 2px" }}>{UI.tellUs.en}</h2>
      <p style={{ color: C.mut, fontSize: 13.5, margin: "0 0 18px" }}>{UI.tellUs.th}</p>

      {isRepo && (
        <>
          <div style={{ marginBottom: 14 }}>
            <Label bi={UI.ghUrl} />
            <input value={meta.url} onChange={(e) => setMeta({ ...meta, url: e.target.value })} placeholder="https://github.com/you/your-app" style={inputStyle} />
          </div>

          {/* consent */}
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", marginBottom: 12 }}>
            <div style={{ fontWeight: 800, fontSize: 13.5 }}>{UI.consentTitle.en}</div>
            <div style={{ fontWeight: 700, fontSize: 12.5, color: C.mut, marginBottom: 8 }}>{UI.consentTitle.th}</div>
            <p style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.5, margin: "0 0 4px" }}>{UI.consentBody.en}</p>
            <p style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: "0 0 10px" }}>{UI.consentBody.th}</p>
            <label style={{ display: "flex", alignItems: "flex-start", gap: 9, cursor: "pointer" }}>
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3, accentColor: C.accent }} />
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {UI.consentAgree.en}
                <span style={{ display: "block", color: C.mut, fontSize: 11.5, fontWeight: 500 }}>{UI.consentAgree.th}</span>
              </span>
            </label>
          </div>

          {scanState !== "done" && (
            <div style={{ marginBottom: 14 }}>
              <BiBtn label={UI.consentAgree} onClick={runScan} disabled={!consent || !meta.url.trim() || scanState === "busy"} />
              {scanState === "busy" && <p style={{ color: C.mut, fontSize: 12.5, marginTop: 8 }}>{UI.scanning.en} · {UI.scanning.th}</p>}
              {scanState === "error" && scanErr && (
                <p style={{ color: C.amber, fontSize: 12.5, marginTop: 8, lineHeight: 1.5 }}>{scanErr.en}<br /><span style={{ color: C.faint }}>{scanErr.th}</span></p>
              )}
            </div>
          )}

          {scanState === "done" && result && (
            <div style={{ background: C.cardUp, border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "13px 15px", marginBottom: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5 }}>{UI.scanned.en}</div>
              <div style={{ fontWeight: 700, fontSize: 12, color: C.mut, marginBottom: 4 }}>{UI.scanned.th}</div>
              <div style={{ fontSize: 11.5, color: C.faint, marginBottom: 10 }}>
                {result.repo} · {result.filesScanned} {UI.filesScanned.en}
              </div>
              <div style={{ display: "grid", gap: 6 }}>
                {Object.keys(DET_LABEL).map((k) => (
                  <div key={k} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                    <span style={{ color: C.mut }}>{DET_LABEL[k].en} · {DET_LABEL[k].th}</span>
                    <span style={{ fontWeight: 700, color: result.answers[k] === true ? C.amber : C.green }}>
                      {yn(result.answers[k]).en}
                    </span>
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11.5, color: C.faint, marginTop: 10, marginBottom: 0 }}>{UI.scanReview.en} · {UI.scanReview.th}</p>
            </div>
          )}
        </>
      )}

      <div style={{ marginBottom: 18 }}>
        <Label bi={descLabel} />
        <textarea
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          rows={3}
          placeholder={`${UI.descPh.en}\n${UI.descPh.th}`}
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <Label bi={UI.howMany} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 22 }}>
        {SCALES.map((s) => (
          <button
            key={s}
            onClick={() => setTarget(s)}
            style={{
              textAlign: "left",
              background: target === s ? "rgba(124,92,255,0.14)" : C.card,
              border: `1px solid ${target === s ? C.accent : C.line}`,
              borderRadius: 12,
              padding: "11px 13px",
              cursor: "pointer",
              color: C.text,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15 }}>{s.toLocaleString()}</div>
            <div style={{ color: C.mut, fontSize: 11 }}>{SCALE_LABEL[s].en}</div>
            <div style={{ color: C.faint, fontSize: 10.5 }}>{SCALE_LABEL[s].th}</div>
          </button>
        ))}
      </div>

      {isRepo && scanState === "done" && result ? (
        <BiBtn full label={UI.seeReport} onClick={() => onScanned(result)} />
      ) : (
        <BiBtn full label={isRepo ? UI.continueManual : UI.continue} onClick={onNext} ghost={isRepo} />
      )}
    </div>
  );
}

function Label({ bi }) {
  return (
    <label style={{ display: "block", marginBottom: 6 }}>
      <span style={{ display: "block", color: C.mut, fontSize: 12, fontWeight: 700 }}>{bi.en}</span>
      <span style={{ display: "block", color: C.faint, fontSize: 11 }}>{bi.th}</span>
    </label>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  background: C.card,
  border: `1px solid ${C.line}`,
  borderRadius: 10,
  color: C.text,
  fontSize: 14,
  padding: "11px 13px",
  outline: "none",
};

function Assess({ answers, setAnswers, onDone, onBack }) {
  const qs = visibleQuestions(answers);
  const [i, setI] = useState(0);
  const q = qs[i];
  const total = qs.length;

  const pick = (value) => {
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    const nextQs = visibleQuestions(next);
    if (i < nextQs.length - 1) setI(i + 1);
    else onDone();
  };

  return (
    <div>
      <div style={{ marginBottom: 10 }}>
        <span style={{ color: C.mut, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em" }}>
          Question {i + 1} of {total} · คำถามที่ {i + 1} จาก {total}
        </span>
      </div>
      <div style={{ height: 4, background: C.line, borderRadius: 3, marginBottom: 22, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((i + 1) / total) * 100}%`, background: C.accent, transition: "width .3s" }} />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, margin: "0 0 2px" }}>{q.en}</h2>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 20px" }}>{q.th}</p>

      <div style={{ display: "grid", gap: 10 }}>
        {q.opts.map((o, idx) => (
          <button
            key={idx}
            onClick={() => pick(o.value)}
            style={{
              textAlign: "left",
              background: answers[q.id] === o.value ? "rgba(124,92,255,0.14)" : C.card,
              border: `1px solid ${answers[q.id] === o.value ? C.accent : C.line}`,
              borderRadius: 12,
              padding: "13px 16px",
              cursor: "pointer",
              color: C.text,
            }}
          >
            <div style={{ fontSize: 14.5, fontWeight: 600 }}>{o.en}</div>
            <div style={{ fontSize: 12, color: C.mut }}>{o.th}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <BiBtn ghost label={UI.back} onClick={() => (i > 0 ? setI(i - 1) : onBack())} />
      </div>
    </div>
  );
}

function Report({ path, meta, answers, target, scanMeta, onEditManually, onAgain }) {
  const [scale, setScale] = useState(target);
  const [cloud, setCloud] = useState("aws");
  const risks = useMemo(() => assessRisks(answers, target), [answers, target]);
  const fixes = useMemo(() => nextFixes(risks), [risks]);
  const warnings = useMemo(() => (scanMeta ? scanWarnings(answers, target) : []), [answers, target, scanMeta]);
  const roadmapIdx = roadmapIndexForScale(scale);

  const [aiState, setAiState] = useState("idle");
  const [aiText, setAiText] = useState("");

  // Record one anonymous, content-free stat when the report is produced.
  useEffect(() => {
    recordStats({
      ready: isReady(risks) && warnings.length === 0,
      riskIds: risks.map((r) => r.id),
      target,
      cloud,
      source: path === "repo" ? "repo" : path === "demo" ? "demo" : "prototype",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const explain = async () => {
    setAiState("busy");
    try {
      const findings = risks.map((r) => r.title.en);
      const { explanation } = await explainFindings({
        app_type: path === "repo" ? "repository" : "prototype",
        description: meta.description,
        target_users: target,
        findings,
        cloud,
      });
      setAiText(explanation);
      setAiState("done");
    } catch {
      setAiState("error");
    }
  };

  const scaleIdx = SCALES.indexOf(scale) === -1 ? 2 : SCALES.indexOf(scale);

  return (
    <div>
      <Eyebrow en={UI.reportEyebrow.en} th={UI.reportEyebrow.th} />
      <h2 style={{ fontSize: 23, fontWeight: 800, margin: "0 0 2px" }}>
        Ready for {target.toLocaleString()} users?
      </h2>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 6px" }}>พร้อมสำหรับ {target.toLocaleString()} คนหรือยัง</p>
      <p style={{ color: C.faint, fontSize: 13, margin: "0 0 16px" }}>
        {risks.length === 0
          ? "No blocking risks detected. · ไม่พบความเสี่ยงที่ปิดกั้น"
          : `${risks.length} to address before you get there. · มี ${risks.length} เรื่องที่ต้องจัดการก่อน`}
      </p>

      {/* provenance: this report came from reading the repo */}
      {scanMeta && (
        <div style={{ background: "rgba(56,225,198,0.06)", border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "11px 14px", marginBottom: 22 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: C.cyan }}>
            {UI.fromRepo.en} · {UI.fromRepo.th}
          </div>
          <div style={{ fontSize: 12, color: C.mut, marginTop: 2 }}>
            {scanMeta.repo} · {scanMeta.filesScanned} {UI.filesScanned.en} — {UI.scannedNote.en}
          </div>
          <button
            onClick={onEditManually}
            style={{ marginTop: 6, background: "none", border: "none", color: C.faint, fontSize: 11.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3, padding: 0 }}
          >
            {UI.editManual.en} · {UI.editManual.th}
          </button>
        </div>
      )}

      {/* A — what breaks first */}
      <Eyebrow en={UI.breakFirst.en} th={UI.breakFirst.th} />
      <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
        {risks.length === 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px", color: C.mut, fontSize: 13.5 }}>
            <div>{UI.okBasics.en}</div>
            <div style={{ color: C.faint, fontSize: 12.5 }}>{UI.okBasics.th}</div>
          </div>
        )}
        {risks.map((r) => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 6 }}>
              <span style={{ background: SEV[r.sev], color: "#0B0B0D", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.06em", marginTop: 2 }}>
                {r.sev}
              </span>
              <div>
                <div style={{ fontWeight: 800, fontSize: 14.5 }}>{r.title.en}</div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.mut }}>{r.title.th}</div>
              </div>
            </div>
            <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.5 }}>{r.why.en}</div>
            <div style={{ color: C.faint, fontSize: 12.5, lineHeight: 1.5, marginTop: 2 }}>{r.why.th}</div>
          </div>
        ))}
      </div>

      {/* B — what to fix next */}
      {fixes.length > 0 && (
        <>
          <Eyebrow en={UI.fixNext.en} th={UI.fixNext.th} />
          <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
            {fixes.map((f, i) => (
              <div key={i} style={{ background: C.cardUp, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", display: "flex", gap: 12 }}>
                <span style={{ color: C.accent, fontWeight: 900, fontSize: 15 }}>{i + 1}</span>
                <div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f.en}</div>
                  <div style={{ fontSize: 12.5, color: C.mut, lineHeight: 1.5 }}>{f.th}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Not detected — worth checking (repo scans only) */}
      {warnings.length > 0 && (
        <>
          <Eyebrow en={UI.notDetected.en} th={UI.notDetected.th} />
          <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
            {warnings.map((wn) => (
              <div key={wn.id} style={{ background: C.card, border: `1px dashed ${C.cyan}`, borderRadius: 12, padding: "13px 15px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 9, marginBottom: 5 }}>
                  <span style={{ color: C.cyan, fontWeight: 800, fontSize: 14, marginTop: 1 }}>?</span>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 14 }}>{wn.title.en}</div>
                    <div style={{ fontWeight: 700, fontSize: 12.5, color: C.mut }}>{wn.title.th}</div>
                  </div>
                </div>
                <div style={{ color: C.mut, fontSize: 12.5, lineHeight: 1.5 }}>{wn.why.en}</div>
                <div style={{ color: C.faint, fontSize: 12, lineHeight: 1.5, marginTop: 2 }}>{wn.why.th}</div>
                <div style={{ color: C.cyan, fontSize: 12.5, marginTop: 6 }}>→ {wn.fix.en} · {wn.fix.th}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* C — architecture at your scale */}
      <Eyebrow en={UI.archScale.en} th={UI.archScale.th} />
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px", marginBottom: 26 }}>
        {/* cloud provider selector — AWS default, others show equivalents */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: C.mut, fontSize: 11.5, fontWeight: 700, marginBottom: 6 }}>
            {UI.cloudLabel.en} · {UI.cloudLabel.th}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
            {CLOUDS.map((c) => (
              <button
                key={c.id}
                onClick={() => setCloud(c.id)}
                style={{
                  background: cloud === c.id ? "rgba(124,92,255,0.16)" : C.cardUp,
                  border: `1px solid ${cloud === c.id ? C.accent : C.line}`,
                  color: cloud === c.id ? C.text : C.mut,
                  borderRadius: 20,
                  padding: "5px 12px",
                  fontSize: 12.5,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {c.label}
                {c.note && <span style={{ color: C.accent, fontSize: 10, marginLeft: 5 }}>{c.note.en}</span>}
              </button>
            ))}
          </div>
          <div style={{ color: C.faint, fontSize: 11, marginTop: 6 }}>{UI.cloudNote.en} · {UI.cloudNote.th}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: C.accent }}>{scale.toLocaleString()}</span>
          <span style={{ fontSize: 12, color: C.mut, textAlign: "right" }}>
            {SCALE_LABEL[scale].en}
            <br />
            <span style={{ color: C.faint }}>{SCALE_LABEL[scale].th}</span>
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={3}
          step={1}
          value={scaleIdx}
          onChange={(e) => setScale(SCALES[Number(e.target.value)])}
          style={{ width: "100%", accentColor: C.accent, marginBottom: 6 }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: C.faint, marginBottom: 18 }}>
          {SCALES.map((s) => (
            <span key={s} style={{ fontWeight: scale === s ? 800 : 400, color: scale === s ? C.accent : C.faint }}>
              {s.toLocaleString()}
            </span>
          ))}
        </div>
        <Architecture scale={scale} answers={answers} cloud={cloud} />
        <p style={{ color: C.mut, fontSize: 12, marginTop: 14, marginBottom: 0 }}>{UI.sliderNote.en}</p>
        <p style={{ color: C.faint, fontSize: 11.5, margin: "2px 0 0" }}>{UI.sliderNote.th}</p>
      </div>

      {/* D — roadmap */}
      <Eyebrow en={UI.roadmap.en} th={UI.roadmap.th} />
      <div style={{ display: "grid", gap: 8, marginBottom: 26 }}>
        {ROADMAP.map((r, i) => {
          const active = i === roadmapIdx;
          const passed = i < roadmapIdx;
          return (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                background: active ? "linear-gradient(90deg, rgba(124,92,255,0.16), rgba(124,92,255,0.03))" : C.card,
                border: `1px solid ${active ? C.accent : C.line}`,
                borderRadius: 12,
                padding: "12px 14px",
              }}
            >
              <span style={{ fontWeight: 900, color: active ? C.accent : passed ? C.accentDim : C.faint, minWidth: 18 }}>{i}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? C.text : C.mut }}>
                  {r.stage.en} · {r.stage.th}
                </div>
                <div style={{ fontSize: 11.5, color: C.faint }}>{r.detail.en} · {r.detail.th}</div>
              </div>
              {active && (
                <span style={{ marginLeft: "auto", fontSize: 9.5, fontWeight: 800, color: "#0B0B0D", background: C.accent, padding: "3px 7px", borderRadius: 6, textAlign: "center", lineHeight: 1.25 }}>
                  {UI.youreHere.en}<br />{UI.youreHere.th}
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* optional AI explanation */}
      {hasBackend && (
        <div style={{ marginBottom: 24 }}>
          {aiState !== "done" && (
            <BiBtn small ghost label={aiState === "busy" ? UI.thinking : UI.explain} onClick={explain} disabled={aiState === "busy"} />
          )}
          {aiState === "error" && (
            <p style={{ color: C.faint, fontSize: 12, marginTop: 10 }}>
              {UI.aiUnavail.en}
              <br />
              {UI.aiUnavail.th}
            </p>
          )}
          {aiState === "done" && (
            <div style={{ background: C.cardUp, border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
              <Eyebrow en={UI.plainLang.en} th={UI.plainLang.th} />
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{aiText}</p>
            </div>
          )}
        </div>
      )}

      {BRAND.ctaUrl && (
        <div style={{ background: "rgba(124,92,255,0.07)", border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "13px 15px", marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>{UI.ctaLine.en}</div>
          <div style={{ fontSize: 12.5, color: C.mut, fontWeight: 600 }}>{UI.ctaLine.th}</div>
          <div style={{ fontSize: 12.5, color: C.accent, marginTop: 4 }}>{BRAND.ctaUrl}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <BiBtn
          label={UI.download}
          onClick={() =>
            downloadMarkdown(
              "scale-my-ai-assessment.md",
              reportToMarkdown({
                appType: path === "repo" ? "repository" : "prototype",
                description: meta.description,
                target,
                scale,
                risks,
                fixes,
                cloud,
              })
            )
          }
        />
        <BiBtn ghost label={UI.again} onClick={onAgain} />
      </div>
    </div>
  );
}
