import { useState, useEffect, useRef } from "react";
import { saveResult, loadSummary, analyzeWork, hasBackend, BackendUnavailableError } from "./api";

/* ─────────────────────────────────────────────────────────
   Scaling AI Readiness
   Two doors: Quick Assessment (everyone) · Analyze My Work (paste code/artifact)
   Bilingual TH/EN. Brand + CTA are configurable via env so anyone can rehost.
   ───────────────────────────────────────────────────────── */

const BRAND = {
  primary: import.meta.env.VITE_BRAND_PRIMARY ?? "Black",
  accent: import.meta.env.VITE_BRAND_ACCENT ?? "Cherry",
  ctaUrl: import.meta.env.VITE_CTA_URL ?? "blackcherry.wisdomfive.com",
  eventLabel: import.meta.env.VITE_EVENT_LABEL ?? "AI for Everyone · 2026",
};

const C = {
  bg: "#0B0B0D",
  card: "#151518",
  cardUp: "#1C1C20",
  line: "#26262B",
  cherry: "#FF3355",
  cherryDim: "#B01F3B",
  green: "#4ADE80",
  amber: "#F5A623",
  text: "#F4F4F6",
  mut: "#9C9CA6",
  faint: "#5C5C66",
};

const T = {
  th: {
    brand: "Scaling AI Readiness",
    tag: "องค์กรของคุณอยู่ขั้นไหนของบันได AI",
    tagSub: "Where is your institution on the AI ladder?",
    doorQuiz: "แบบประเมินด่วน",
    doorQuizSub: "8 คำถาม · 2 นาที · ทุกคนทำได้",
    doorPaste: "วิเคราะห์ผลงานของฉัน",
    doorPasteSub: "วางโค้ด / artifact / README แล้วให้ AI ประเมิน",
    doorRoom: "ดูผลรวมของห้อง",
    start: "เริ่มเลย",
    next: "ต่อไป",
    back: "ย้อนกลับ",
    seeResult: "ดูผลของฉัน",
    q: "ข้อ",
    of: "จาก",
    yourStep: "ผลของคุณ",
    gaps: "ช่องว่างทั้งสามของคุณ",
    moves: "สองก้าวถัดไปของคุณ",
    shareNote: "ผลถูกนับรวมแบบไม่ระบุตัวตนในหน้าจอรวมของห้อง",
    again: "ทำใหม่",
    home: "หน้าแรก",
    cta: "สแกนรับ Safe Enablement Checklist ที่",
    pasteTitle: "วิเคราะห์ผลงานของฉัน",
    pasteHint:
      "วางอะไรก็ได้ที่คุณสร้างด้วย AI — โค้ดจาก artifact, README ของ repo, รายชื่อไฟล์, หรือ prompt ที่ใช้สร้างงาน แล้ว AI จะประเมินความพร้อมต่อการ scale",
    pastePh: "วางโค้ด / README / คำอธิบายผลงานที่นี่…",
    ctxLabel: "งานชิ้นนี้คืออะไร",
    analyze: "วิเคราะห์",
    analyzing: "กำลังวิเคราะห์…",
    verdict: "บทวิเคราะห์",
    risks: "ความเสี่ยงต่อการ scale",
    recs: "ข้อเสนอแนะ",
    errAnalyze: "วิเคราะห์ไม่สำเร็จ ลองอีกครั้ง หรือวางข้อความให้สั้นลง",
    errEmpty: "กรุณาวางเนื้อหาก่อนวิเคราะห์",
    errNoBackend:
      "โหมดวิเคราะห์ด้วย AI ต้องเชื่อมต่อ backend ก่อน (ตั้งค่า VITE_API_BASE) — ดูวิธีติดตั้งใน README",
    errQuota: "โควตาวิเคราะห์ฟรีของวันนี้เต็มแล้ว กรุณาลองใหม่พรุ่งนี้",
    roomTitle: "ผลรวมของห้องนี้",
    roomSub: "อัปเดตสด · ไม่ระบุตัวตน",
    responses: "คำตอบ",
    refresh: "รีเฟรช",
    noData: "ยังไม่มีคำตอบ — สแกน QR แล้วเริ่มประเมินได้เลย",
    lang: "EN",
  },
  en: {
    brand: "Scaling AI Readiness",
    tag: "Where is your institution on the AI ladder?",
    tagSub: "องค์กรของคุณอยู่ขั้นไหนของบันได AI",
    doorQuiz: "Quick Assessment",
    doorQuizSub: "8 questions · 2 minutes · for everyone",
    doorPaste: "Analyze My Work",
    doorPasteSub: "Paste code / artifact / README for AI review",
    doorRoom: "View room results",
    start: "Start",
    next: "Next",
    back: "Back",
    seeResult: "See my result",
    q: "Question",
    of: "of",
    yourStep: "Your result",
    gaps: "Your three gaps",
    moves: "Your next two moves",
    shareNote: "Results are counted anonymously on the room screen",
    again: "Retake",
    home: "Home",
    cta: "Scan for the Safe Enablement Checklist at",
    pasteTitle: "Analyze My Work",
    pasteHint:
      "Paste anything you built with AI — artifact code, a repo README, a file listing, or the prompt that created it. The AI will assess how ready it is to scale.",
    pastePh: "Paste code / README / a description of your work here…",
    ctxLabel: "What is this work?",
    analyze: "Analyze",
    analyzing: "Analyzing…",
    verdict: "Verdict",
    risks: "Scaling risks",
    recs: "Recommendations",
    errAnalyze: "Analysis failed. Try again, or paste a shorter excerpt.",
    errEmpty: "Please paste something to analyze first.",
    errNoBackend:
      "AI analysis needs a backend (set VITE_API_BASE). See the README for install steps.",
    errQuota: "Today's free analysis quota has been reached. Please try again tomorrow.",
    roomTitle: "This room, live",
    roomSub: "Live · anonymous",
    responses: "responses",
    refresh: "Refresh",
    noData: "No responses yet — scan the QR and start the assessment.",
    lang: "ไทย",
  },
};

const STEPS = [
  { n: 1, th: "ทักษะส่วนตัว", en: "Personal Skill" },
  { n: 2, th: "แนวปฏิบัติร่วม", en: "Shared Practice" },
  { n: 3, th: "ขีดความสามารถองค์กร", en: "Institutional Capability" },
];

/* gap: 0 shadow · 1 hero · 2 purgatory */
const GAPS = [
  { th: "Shadow AI · AI เงา", en: "Shadow AI" },
  { th: "พึ่งพาฮีโร่", en: "Hero Dependency" },
  { th: "ติดหล่มนำร่อง", en: "Pilot Purgatory" },
];

const QUESTIONS = [
  {
    gap: 0,
    th: "คุณใช้เครื่องมือ AI ในการทำงานผ่านบัญชีแบบไหนเป็นหลัก",
    en: "How do you mainly access AI tools for work?",
    opts: [
      { th: "บัญชีขององค์กร มองเห็นและดูแลโดยสถาบัน", en: "Institutional account, managed by my institution", s: 2 },
      { th: "บัญชีส่วนตัวแบบเสียเงิน", en: "My own paid personal account", s: 1 },
      { th: "บัญชีส่วนตัวแบบฟรี", en: "My own free personal account", s: 0 },
    ],
  },
  {
    gap: 1,
    th: "Workflow AI ที่ดีที่สุดของคุณ ตอนนี้อยู่ที่ไหน",
    en: "Your best AI workflow — where does it live today?",
    opts: [
      { th: "เขียนไว้และแชร์ให้เพื่อนร่วมงานใช้ได้", en: "Written down and shared with colleagues", s: 2 },
      { th: "จดไว้ใช้เอง คนอื่นไม่เห็น", en: "Written down, but only for myself", s: 1 },
      { th: "อยู่ในหัวและในประวัติแชท", en: "In my head and my chat history", s: 0 },
    ],
  },
  {
    gap: 1,
    th: "ถ้าคนที่เก่ง AI ที่สุดในหน่วยงานลาออกพรุ่งนี้ จะเหลืออะไร",
    en: "If your most AI-capable colleague left tomorrow, what remains?",
    opts: [
      { th: "Workflow และเทมเพลตที่เขียนไว้ ใช้ต่อได้ทันที", en: "Documented workflows anyone can continue", s: 2 },
      { th: "สไลด์อบรมเก่า ๆ บางส่วน", en: "Some old workshop slides", s: 1 },
      { th: "แทบไม่เหลืออะไร", en: "Almost nothing", s: 0 },
    ],
  },
  {
    gap: 1,
    th: "งานที่คุณเคยสร้างด้วย AI (แอป เอกสาร บทวิเคราะห์) ตัวชิ้นงานอยู่ที่ไหน",
    en: "Something useful you built with AI — where does the artifact live?",
    opts: [
      { th: "พื้นที่กลางของหน่วยงาน เพื่อนร่วมงานเข้าถึงได้", en: "A shared institutional space colleagues can access", s: 2 },
      { th: "ไฟล์ของฉันเอง", en: "My own files", s: 1 },
      { th: "อยู่ในประวัติแชทสักที่ ต้องค้นหาดู", en: "Somewhere in a chat history — I'd have to search", s: 0 },
    ],
  },
  {
    gap: 2,
    th: "หน่วยงานของคุณมีคลัง prompt / workflow กลางหรือไม่",
    en: "Does your department have a shared prompt & workflow library?",
    opts: [
      { th: "มี และมีคนใช้จริง", en: "Yes, and people actually use it", s: 2 },
      { th: "มี แต่แทบไม่มีใครใช้", en: "It exists, but barely used", s: 1 },
      { th: "ไม่มี", en: "No", s: 0 },
    ],
  },
  {
    gap: 0,
    th: "มีข้อกำหนดเป็นลายลักษณ์อักษรไหมว่า ข้อมูลแบบใดห้ามเข้า AI สาธารณะ",
    en: "Is there a written rule on which data must never enter public AI tools?",
    opts: [
      { th: "มี เป็นนโยบายชัดเจนหนึ่งหน้า", en: "Yes — a clear one-page policy", s: 2 },
      { th: "มีคำแนะนำกว้าง ๆ ไม่ชัดเจน", en: "Vague guidance only", s: 1 },
      { th: "ไม่มีเลย", en: "Nothing written", s: 0 },
    ],
  },
  {
    gap: 2,
    th: "โครงการนำร่อง AI ในหน่วยงานของคุณ มีเจ้าของและวันตัดสินใจไหม",
    en: "Do AI pilots in your unit have an owner and a decision date?",
    opts: [
      { th: "มี ทุกโครงการรู้ว่าใครตัดสิน เมื่อไหร่", en: "Yes — every pilot has a decider and a date", s: 2 },
      { th: "บางโครงการ", en: "Sometimes", s: 1 },
      { th: "โครงการมักเงียบหายไปเอง", en: "Pilots just quietly fade away", s: 0 },
    ],
  },
  {
    gap: 2,
    th: "ถ้าผู้บริหารถามว่า 'AI ให้ผลตอบแทนอะไรกับเราแล้วบ้าง' องค์กรตอบได้ไหม",
    en: "If leadership asked \"what has AI returned for us?\" — could your institution answer?",
    opts: [
      { th: "ตอบได้ด้วยตัวเลขจริง", en: "Yes, with real numbers", s: 2 },
      { th: "ตอบได้ด้วยเรื่องเล่า ไม่มีตัวเลข", en: "With anecdotes, not numbers", s: 1 },
      { th: "ตอบไม่ได้", en: "No one could answer", s: 0 },
    ],
  },
];

const MOVES = {
  0: [
    { th: "เสนอให้หน่วยงานเปิดบัญชี AI ขององค์กร เพื่อให้มีเส้นทางที่ปลอดภัยและมองเห็นได้", en: "Propose institutional AI accounts — a sanctioned path beats a shadow path" },
    { th: "ร่างนโยบายหนึ่งหน้า: ข้อมูลแบบไหนห้ามเข้า AI สาธารณะ", en: "Draft the one-page data boundary policy: what never enters public AI" },
  ],
  1: [
    { th: "เขียน workflow ที่ดีที่สุดของคุณลงกระดาษหนึ่งหน้า ให้เพื่อนร่วมงานทำตามได้โดยไม่ต้องถามคุณ", en: "Write your best workflow on one page — so a colleague can run it without you" },
    { th: "สร้างคลัง prompt / workflow กลางของภาควิชา เริ่มจากโฟลเดอร์แชร์ก็พอ", en: "Start a department workflow library — a shared folder is enough" },
  ],
  2: [
    { th: "ให้ทุก pilot มีประโยคเดียว: วันนี้ คนนี้ จะตัดสินว่าไปต่อหรือหยุด", en: "Give every pilot one sentence: on this date, this person decides continue-or-stop" },
    { th: "เลือกตัวชี้วัดหนึ่งตัว (เวลาเตรียมสอน, รอบรีวิว) แล้ววัดก่อน-หลังใช้ AI", en: "Pick one metric (prep time, review cycles) and measure before/after AI" },
  ],
};

function stepFromScore(total) {
  if (total <= 6) return 1;
  if (total <= 11) return 2;
  return 3;
}

/* ── tiny UI atoms ─────────────────────────────────────── */

function Eyebrow({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ color: C.cherry, fontWeight: 800, fontSize: 12, letterSpacing: "0.14em" }}>●</span>
      <span style={{ color: C.mut, fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", fontWeight: 600 }}>
        {children}
      </span>
    </div>
  );
}

function Cherry({ size = 22 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M13 3c-1 3-4 5.4-6.5 6.5" stroke={C.cherry} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M13 3c1.8.4 3.6 1.8 4.2 3.6" stroke={C.cherry} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="7.6" cy="14.6" r="4.6" fill="#1a090d" stroke={C.cherry} strokeWidth="1.6" />
      <circle cx="15.8" cy="16.4" r="3.8" fill="#1a090d" stroke={C.cherry} strokeWidth="1.6" />
      <circle cx="6.2" cy="13.2" r="1" fill={C.cherry} opacity="0.9" />
    </svg>
  );
}

function Ladder({ step, lang, compact }) {
  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", gap: 8 }}>
      {STEPS.map((s) => {
        const active = s.n === step;
        const passed = s.n < step;
        return (
          <div
            key={s.n}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: compact ? "10px 14px" : "14px 16px",
              borderRadius: 12,
              background: active ? "linear-gradient(90deg, rgba(255,51,85,0.16), rgba(255,51,85,0.04))" : C.card,
              border: `1px solid ${active ? C.cherry : passed ? C.cherryDim : C.line}`,
              boxShadow: active ? `0 0 24px rgba(255,51,85,0.18)` : "none",
              transition: "all .3s ease",
            }}
          >
            <span
              style={{
                fontWeight: 800,
                fontSize: compact ? 15 : 18,
                color: active ? C.cherry : passed ? C.cherryDim : C.faint,
                minWidth: 22,
              }}
            >
              {s.n}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: compact ? 13.5 : 15, color: active ? C.text : passed ? C.mut : C.faint }}>
                {lang === "th" ? s.th : s.en}
              </div>
              <div style={{ fontSize: 11, color: active ? C.mut : C.faint }}>{lang === "th" ? s.en : s.th}</div>
            </div>
            {active && (
              <span
                style={{
                  marginLeft: "auto",
                  fontSize: 10,
                  fontWeight: 800,
                  letterSpacing: "0.12em",
                  color: C.bg,
                  background: C.cherry,
                  padding: "3px 8px",
                  borderRadius: 6,
                }}
              >
                {lang === "th" ? "คุณอยู่ตรงนี้" : "YOU ARE HERE"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Btn({ children, onClick, ghost, disabled, full }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        appearance: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        border: ghost ? `1px solid ${C.line}` : "none",
        background: ghost ? "transparent" : C.cherry,
        color: ghost ? C.mut : "#fff",
        fontWeight: 700,
        fontSize: 14,
        padding: "12px 20px",
        borderRadius: 10,
        width: full ? "100%" : "auto",
        transition: "transform .12s ease, background .2s ease",
      }}
      onMouseDown={(e) => !disabled && (e.currentTarget.style.transform = "scale(0.98)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      {children}
    </button>
  );
}

/* ── screens ───────────────────────────────────────────── */

export default function App() {
  const [lang, setLang] = useState("th");
  const [view, setView] = useState("home"); // home | quiz | result | paste | room
  const [qi, setQi] = useState(0);
  const [answers, setAnswers] = useState([]);
  const [saved, setSaved] = useState(false);
  const t = T[lang];

  const totals = answers.reduce(
    (acc, a, i) => {
      acc.total += a;
      acc.gap[QUESTIONS[i].gap] += a;
      acc.gapMax[QUESTIONS[i].gap] += 2;
      return acc;
    },
    { total: 0, gap: [0, 0, 0], gapMax: [0, 0, 0] }
  );
  const myStep = stepFromScore(totals.total);

  useEffect(() => {
    if (view !== "result" || saved) return;
    (async () => {
      try {
        await saveResult({ step: myStep, total: totals.total });
        setSaved(true);
      } catch (e) {
        console.error("save failed", e);
      }
    })();
  }, [view]); // eslint-disable-line

  const restart = () => {
    setQi(0);
    setAnswers([]);
    setSaved(false);
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1200px 500px at 50% -10%, rgba(255,51,85,0.07), transparent), ${C.bg}`,
        color: C.text,
        fontFamily:
          "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Noto Sans Thai', 'Helvetica Neue', sans-serif",
        display: "flex",
        justifyContent: "center",
        padding: "0 0 48px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 560, padding: "20px 18px" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <button
            onClick={() => { setView("home"); restart(); }}
            style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", padding: 0 }}
            aria-label={t.home}
          >
            <Cherry />
            <span style={{ fontWeight: 800, fontSize: 15, letterSpacing: "-0.01em" }}>
              <span style={{ color: C.text }}>{BRAND.primary}</span>
              <span style={{ color: C.cherry }}>{BRAND.accent}</span>
            </span>
          </button>
          <button
            onClick={() => setLang(lang === "th" ? "en" : "th")}
            style={{
              background: "transparent",
              border: `1px solid ${C.line}`,
              color: C.mut,
              borderRadius: 8,
              padding: "5px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {t.lang}
          </button>
        </div>

        {view === "home" && <Home t={t} lang={lang} go={setView} />}
        {view === "quiz" && (
          <Quiz
            t={t}
            lang={lang}
            qi={qi}
            answers={answers}
            onAnswer={(s) => {
              const next = [...answers];
              next[qi] = s;
              setAnswers(next);
              if (qi < QUESTIONS.length - 1) setQi(qi + 1);
              else setView("result");
            }}
            onBack={() => (qi > 0 ? setQi(qi - 1) : setView("home"))}
          />
        )}
        {view === "result" && (
          <Result t={t} lang={lang} step={myStep} totals={totals} onAgain={() => { restart(); setView("quiz"); }} />
        )}
        {view === "paste" && <Analyze t={t} lang={lang} />}
        {view === "room" && <Room t={t} lang={lang} />}
      </div>
    </div>
  );
}

function Home({ t, lang, go }) {
  return (
    <div>
      <Eyebrow>{BRAND.eventLabel}</Eyebrow>
      <h1 style={{ fontSize: 30, lineHeight: 1.15, fontWeight: 800, margin: "0 0 6px", letterSpacing: "-0.02em" }}>
        {t.brand}
      </h1>
      <p style={{ color: C.text, fontSize: 16, margin: "0 0 2px", fontWeight: 600 }}>{t.tag}</p>
      <p style={{ color: C.faint, fontSize: 13, margin: "0 0 24px" }}>{t.tagSub}</p>

      <div style={{ marginBottom: 24 }}>
        <Ladder step={0} lang={lang} compact />
      </div>

      <div style={{ display: "grid", gap: 12 }}>
        <DoorCard title={t.doorQuiz} sub={t.doorQuizSub} onClick={() => go("quiz")} primary />
        <DoorCard title={t.doorPaste} sub={t.doorPasteSub} onClick={() => go("paste")} />
      </div>

      <button
        onClick={() => go("room")}
        style={{ marginTop: 18, background: "none", border: "none", color: C.faint, fontSize: 12.5, cursor: "pointer", textDecoration: "underline", textUnderlineOffset: 3 }}
      >
        {t.doorRoom} →
      </button>
    </div>
  );
}

function DoorCard({ title, sub, onClick, primary }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left",
        background: primary ? "linear-gradient(135deg, rgba(255,51,85,0.14), rgba(255,51,85,0.03))" : C.card,
        border: `1px solid ${primary ? C.cherry : C.line}`,
        borderRadius: 14,
        padding: "18px 18px",
        cursor: "pointer",
        transition: "transform .12s ease",
      }}
      onMouseDown={(e) => (e.currentTarget.style.transform = "scale(0.99)")}
      onMouseUp={(e) => (e.currentTarget.style.transform = "scale(1)")}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17, color: C.text }}>{title}</div>
          <div style={{ color: C.mut, fontSize: 12.5, marginTop: 4 }}>{sub}</div>
        </div>
        <span style={{ color: primary ? C.cherry : C.faint, fontSize: 20, fontWeight: 700 }}>→</span>
      </div>
    </button>
  );
}

function Quiz({ t, lang, qi, answers, onAnswer, onBack }) {
  const q = QUESTIONS[qi];
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ color: C.mut, fontSize: 12, fontWeight: 700, letterSpacing: "0.1em" }}>
          {t.q} {qi + 1} {t.of} {QUESTIONS.length}
        </span>
        <span style={{ color: C.faint, fontSize: 11 }}>{GAPS[q.gap][lang]}</span>
      </div>
      <div style={{ height: 4, background: C.line, borderRadius: 3, marginBottom: 22, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${((qi + 1) / QUESTIONS.length) * 100}%`,
            background: C.cherry,
            borderRadius: 3,
            transition: "width .3s ease",
          }}
        />
      </div>

      <h2 style={{ fontSize: 20, fontWeight: 800, lineHeight: 1.35, margin: "0 0 4px" }}>
        {lang === "th" ? q.th : q.en}
      </h2>
      <p style={{ color: C.faint, fontSize: 12.5, margin: "0 0 20px" }}>{lang === "th" ? q.en : q.th}</p>

      <div style={{ display: "grid", gap: 10 }}>
        {q.opts.map((o, i) => (
          <button
            key={i}
            onClick={() => onAnswer(o.s)}
            style={{
              textAlign: "left",
              background: answers[qi] === o.s ? "rgba(255,51,85,0.12)" : C.card,
              border: `1px solid ${answers[qi] === o.s ? C.cherry : C.line}`,
              borderRadius: 12,
              padding: "14px 16px",
              cursor: "pointer",
              color: C.text,
              fontSize: 14.5,
              lineHeight: 1.4,
              transition: "border-color .15s ease, background .15s ease",
            }}
          >
            <div style={{ fontWeight: 600 }}>{lang === "th" ? o.th : o.en}</div>
            <div style={{ color: C.faint, fontSize: 11.5, marginTop: 3 }}>{lang === "th" ? o.en : o.th}</div>
          </button>
        ))}
      </div>

      <div style={{ marginTop: 20 }}>
        <Btn ghost onClick={onBack}>← {t.back}</Btn>
      </div>
    </div>
  );
}

function Result({ t, lang, step, totals, onAgain }) {
  const worstGap = totals.gap
    .map((v, i) => ({ i, pct: v / totals.gapMax[i] }))
    .sort((a, b) => a.pct - b.pct)[0].i;
  const moves = MOVES[worstGap];

  return (
    <div>
      <Eyebrow>{t.yourStep}</Eyebrow>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 4 }}>
        <span style={{ fontSize: 64, fontWeight: 900, color: C.cherry, lineHeight: 1 }}>{step}</span>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{lang === "th" ? STEPS[step - 1].th : STEPS[step - 1].en}</div>
          <div style={{ color: C.faint, fontSize: 12 }}>{lang === "th" ? STEPS[step - 1].en : STEPS[step - 1].th}</div>
        </div>
      </div>

      <div style={{ margin: "18px 0 24px" }}>
        <Ladder step={step} lang={lang} />
      </div>

      <Eyebrow>{t.gaps}</Eyebrow>
      <div style={{ display: "grid", gap: 10, marginBottom: 24 }}>
        {GAPS.map((g, i) => {
          const pct = Math.round((totals.gap[i] / totals.gapMax[i]) * 100);
          const color = pct >= 67 ? C.green : pct >= 34 ? C.amber : C.cherry;
          return (
            <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700 }}>{lang === "th" ? g.th : g.en}</span>
                <span style={{ fontSize: 13, fontWeight: 800, color }}>{pct}%</span>
              </div>
              <div style={{ height: 6, background: C.line, borderRadius: 4, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 4, transition: "width .6s ease" }} />
              </div>
            </div>
          );
        })}
      </div>

      <Eyebrow>{t.moves}</Eyebrow>
      <div style={{ display: "grid", gap: 10, marginBottom: 22 }}>
        {moves.map((m, i) => (
          <div key={i} style={{ background: C.cardUp, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", display: "flex", gap: 12 }}>
            <span style={{ color: C.cherry, fontWeight: 900, fontSize: 15 }}>{i + 1}</span>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, lineHeight: 1.45 }}>{lang === "th" ? m.th : m.en}</div>
              <div style={{ color: C.faint, fontSize: 11.5, marginTop: 3 }}>{lang === "th" ? m.en : m.th}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ background: "rgba(255,51,85,0.07)", border: `1px solid ${C.cherryDim}`, borderRadius: 12, padding: "13px 15px", marginBottom: 20 }}>
        <div style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>
          {t.cta} <span style={{ color: C.cherry }}>{BRAND.ctaUrl}</span>
        </div>
      </div>

      <p style={{ color: C.faint, fontSize: 11.5, marginBottom: 18 }}>{t.shareNote}</p>

      <div style={{ display: "flex", gap: 10 }}>
        <Btn ghost onClick={onAgain}>{t.again}</Btn>
      </div>
    </div>
  );
}

function Analyze({ t, lang }) {
  const [text, setText] = useState("");
  const [ctx, setCtx] = useState("teaching");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [res, setRes] = useState(null);

  const CTX = {
    teaching: { th: "สื่อการสอน / เครื่องมือสำหรับผู้เรียน", en: "Teaching tool / learning material" },
    research: { th: "งานวิจัย / วิเคราะห์ข้อมูล", en: "Research / data analysis" },
    admin: { th: "งานบริหาร / เอกสารภายใน", en: "Admin / internal workflow" },
    other: { th: "อื่น ๆ", en: "Other" },
  };

  const run = async () => {
    if (!text.trim()) { setErr(t.errEmpty); return; }
    setBusy(true); setErr(""); setRes(null);
    try {
      const parsed = await analyzeWork({ text: text.slice(0, 8000), context: ctx });
      setRes(parsed);
    } catch (e) {
      console.error(e);
      if (e instanceof BackendUnavailableError) setErr(t.errNoBackend);
      else if (e.code === "quota") setErr(t.errQuota);
      else setErr(t.errAnalyze);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Eyebrow>{t.pasteTitle}</Eyebrow>
      <p style={{ color: C.mut, fontSize: 13.5, lineHeight: 1.55, margin: "0 0 16px" }}>{t.pasteHint}</p>

      {!hasBackend && (
        <div style={{ background: "rgba(245,166,35,0.08)", border: `1px solid ${C.amber}`, borderRadius: 10, padding: "10px 13px", marginBottom: 14, color: C.amber, fontSize: 12.5, lineHeight: 1.5 }}>
          {t.errNoBackend}
        </div>
      )}

      <label style={{ display: "block", color: C.faint, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
        {t.ctxLabel}
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
        {Object.entries(CTX).map(([k, v]) => (
          <button
            key={k}
            onClick={() => setCtx(k)}
            style={{
              background: ctx === k ? "rgba(255,51,85,0.13)" : C.card,
              border: `1px solid ${ctx === k ? C.cherry : C.line}`,
              color: ctx === k ? C.text : C.mut,
              borderRadius: 20,
              padding: "6px 13px",
              fontSize: 12.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {lang === "th" ? v.th : v.en}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={t.pastePh}
        rows={9}
        style={{
          width: "100%",
          boxSizing: "border-box",
          background: C.card,
          border: `1px solid ${C.line}`,
          borderRadius: 12,
          color: C.text,
          fontSize: 13,
          fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
          padding: 14,
          resize: "vertical",
          outline: "none",
        }}
        onFocus={(e) => (e.target.style.borderColor = C.cherry)}
        onBlur={(e) => (e.target.style.borderColor = C.line)}
      />

      {err && <p style={{ color: C.amber, fontSize: 13, marginTop: 10 }}>{err}</p>}

      <div style={{ marginTop: 14 }}>
        <Btn full onClick={run} disabled={busy || !hasBackend}>
          {busy ? t.analyzing : t.analyze}
        </Btn>
      </div>

      {busy && (
        <div style={{ marginTop: 18, color: C.faint, fontSize: 13, textAlign: "center" }}>
          <span style={{ display: "inline-block", animation: "pulse 1.2s infinite" }}>● ● ●</span>
          <style>{`@keyframes pulse { 0%,100% {opacity:.3} 50% {opacity:1} } @media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }`}</style>
        </div>
      )}

      {res && (
        <div style={{ marginTop: 26 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 14 }}>
            <span style={{ fontSize: 52, fontWeight: 900, color: C.cherry, lineHeight: 1 }}>{res.step}</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>
                {lang === "th" ? STEPS[res.step - 1]?.th : STEPS[res.step - 1]?.en}
              </div>
            </div>
          </div>

          <Ladder step={res.step} lang={lang} compact />

          <div style={{ marginTop: 20 }}>
            <Eyebrow>{t.verdict}</Eyebrow>
            <p style={{ fontSize: 14.5, lineHeight: 1.6, margin: 0 }}>
              {lang === "th" ? res.verdict_th : res.verdict_en}
            </p>
          </div>

          <div style={{ marginTop: 18 }}>
            <Eyebrow>{t.risks}</Eyebrow>
            <div style={{ display: "grid", gap: 8 }}>
              {(res.risks || []).map((r, i) => (
                <div key={i} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.5 }}>
                  <span style={{ color: C.amber, fontWeight: 800, marginRight: 8 }}>!</span>
                  {lang === "th" ? r.th : r.en}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <Eyebrow>{t.recs}</Eyebrow>
            <div style={{ display: "grid", gap: 8 }}>
              {(res.recs || []).map((r, i) => (
                <div key={i} style={{ background: C.cardUp, border: `1px solid ${C.line}`, borderRadius: 10, padding: "11px 13px", fontSize: 13.5, lineHeight: 1.5 }}>
                  <span style={{ color: C.green, fontWeight: 800, marginRight: 8 }}>→</span>
                  {lang === "th" ? r.th : r.en}
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 20, background: "rgba(255,51,85,0.07)", border: `1px solid ${C.cherryDim}`, borderRadius: 12, padding: "13px 15px" }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {t.cta} <span style={{ color: C.cherry }}>{BRAND.ctaUrl}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Room({ t, lang }) {
  const [counts, setCounts] = useState([0, 0, 0]);
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(false);
  const timer = useRef(null);

  const load = async () => {
    setBusy(true);
    try {
      const { counts: c, total: tot } = await loadSummary();
      setCounts(c);
      setTotal(tot);
    } catch (e) {
      console.error(e);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 12000);
    return () => clearInterval(timer.current);
  }, []); // eslint-disable-line

  const max = Math.max(...counts, 1);

  return (
    <div>
      <Eyebrow>{t.roomSub}</Eyebrow>
      <h2 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 4px" }}>{t.roomTitle}</h2>
      <p style={{ color: C.mut, fontSize: 14, margin: "0 0 26px" }}>
        {total} {t.responses}
      </p>

      {total === 0 ? (
        <div style={{ background: C.card, border: `1px dashed ${C.line}`, borderRadius: 14, padding: "34px 20px", textAlign: "center", color: C.faint, fontSize: 14 }}>
          {t.noData}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {STEPS.map((s, i) => {
            const pct = total ? Math.round((counts[i] / total) * 100) : 0;
            return (
              <div key={s.n}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 7 }}>
                  <span style={{ fontSize: 15, fontWeight: 700 }}>
                    <span style={{ color: C.cherry, marginRight: 8 }}>{s.n}</span>
                    {lang === "th" ? s.th : s.en}
                  </span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: C.mut }}>
                    {counts[i]} · {pct}%
                  </span>
                </div>
                <div style={{ height: 26, background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, overflow: "hidden" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${(counts[i] / max) * 100}%`,
                      background: `linear-gradient(90deg, ${C.cherryDim}, ${C.cherry})`,
                      borderRadius: 7,
                      transition: "width .7s ease",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Btn ghost onClick={load} disabled={busy}>
          {busy ? "…" : `↻ ${t.refresh}`}
        </Btn>
      </div>
    </div>
  );
}
