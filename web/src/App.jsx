import { useState, useMemo } from "react";
import {
  SCALES,
  SCALE_LABEL,
  SVC,
  QUESTIONS,
  visibleQuestions,
  assessRisks,
  nextFixes,
  ROADMAP,
  roadmapIndexForScale,
  architectureForScale,
  DEMO,
} from "./engine";
import { explainFindings, hasBackend } from "./api";

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

const SEV = { high: C.red, medium: C.amber, low: C.cyan };

/* ── atoms ──────────────────────────────────────────────── */

function Eyebrow({ children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
      <span style={{ color: C.accent, fontWeight: 800, fontSize: 12 }}>◆</span>
      <span style={{ color: C.mut, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 700 }}>
        {children}
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
        padding: small ? "8px 14px" : "12px 20px",
        borderRadius: 10,
        width: full ? "100%" : "auto",
      }}
    >
      {children}
    </button>
  );
}

/* ── architecture diagram ───────────────────────────────── */

function Node({ svcKey, dim }) {
  const s = SVC[svcKey];
  return (
    <div
      style={{
        background: dim ? C.card : "linear-gradient(135deg, rgba(124,92,255,0.18), rgba(124,92,255,0.04))",
        border: `1px solid ${dim ? C.line : C.accent}`,
        borderRadius: 12,
        padding: "10px 13px",
        minWidth: 92,
        textAlign: "center",
      }}
    >
      <div style={{ fontWeight: 800, fontSize: 13, color: C.text }}>{s.label}</div>
      <div style={{ fontSize: 10.5, color: C.mut, marginTop: 3, lineHeight: 1.3 }}>{s.aws}</div>
    </div>
  );
}

function Architecture({ scale, answers }) {
  const { pipeline, governance } = useMemo(() => architectureForScale(scale, answers), [scale, answers]);
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
        {pipeline.map((k, i) => (
          <div key={k} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Node svcKey={k} />
            {i < pipeline.length - 1 && <span style={{ color: C.accent, fontWeight: 800 }}>→</span>}
          </div>
        ))}
      </div>
      {governance.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 11, color: C.faint, textTransform: "uppercase", letterSpacing: "0.16em", marginBottom: 8, fontWeight: 700 }}>
            Cross-cutting at this scale
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {governance.map((k) => (
              <Node key={k} svcKey={k} dim />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── screens ────────────────────────────────────────────── */

export default function App() {
  const [view, setView] = useState("home"); // home | input | assess | report
  const [path, setPath] = useState(null); // repo | noRepo | demo
  const [meta, setMeta] = useState({ url: "", description: "" });
  const [target, setTarget] = useState(1000);
  const [answers, setAnswers] = useState({});

  const startDemo = () => {
    setPath("demo");
    setMeta({ url: "", description: DEMO.blurb });
    setTarget(DEMO.target);
    setAnswers(DEMO.answers);
    setView("report");
  };

  const reset = () => {
    setPath(null);
    setMeta({ url: "", description: "" });
    setTarget(1000);
    setAnswers({});
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: `radial-gradient(1100px 480px at 50% -10%, rgba(124,92,255,0.10), transparent), ${C.bg}`,
        color: C.text,
        fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif",
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
              style={{ background: "transparent", border: `1px solid ${C.line}`, color: C.mut, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
            >
              Start over
            </button>
          )}
        </div>

        {view === "home" && (
          <Home
            onPick={(p) => { setPath(p); setView("input"); }}
            onDemo={startDemo}
          />
        )}
        {view === "input" && (
          <InputScreen
            path={path}
            meta={meta}
            setMeta={setMeta}
            target={target}
            setTarget={setTarget}
            onNext={() => setView("assess")}
          />
        )}
        {view === "assess" && (
          <Assess
            answers={answers}
            setAnswers={setAnswers}
            onDone={() => setView("report")}
            onBack={() => setView("input")}
          />
        )}
        {view === "report" && (
          <Report
            path={path}
            meta={meta}
            answers={answers}
            target={target}
            onAgain={() => { setView("home"); reset(); }}
          />
        )}
      </div>
    </div>
  );
}

function Home({ onPick, onDemo }) {
  return (
    <div>
      <Eyebrow>Scaling readiness for AI prototypes</Eyebrow>
      <h1 style={{ fontSize: 34, lineHeight: 1.12, fontWeight: 800, margin: "0 0 10px", letterSpacing: "-0.02em" }}>
        You built an AI app.<br />Now scale it.
      </h1>
      <p style={{ color: C.mut, fontSize: 15, lineHeight: 1.55, margin: "0 0 28px" }}>
        Find out what breaks first, what to fix next, and the AWS architecture you need — as your users go from 10 to 10,000.
      </p>

      <div style={{ display: "grid", gap: 12 }}>
        <DoorCard title="I have a repo" sub="Point us at a GitHub URL and describe your app" onClick={() => onPick("repo")} primary />
        <DoorCard title="I just have something that works" sub="An HTML page, a prototype, or a description" onClick={() => onPick("noRepo")} />
      </div>

      <button
        onClick={onDemo}
        style={{ marginTop: 18, background: "none", border: "none", color: C.accent, fontSize: 13.5, cursor: "pointer", fontWeight: 700 }}
      >
        ▶ Try the demo — “AI Assignment Grader” at 10,000 students
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
        background: primary ? "linear-gradient(135deg, rgba(124,92,255,0.15), rgba(124,92,255,0.03))" : C.card,
        border: `1px solid ${primary ? C.accent : C.line}`,
        borderRadius: 14,
        padding: "18px",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{title}</div>
          <div style={{ color: C.mut, fontSize: 12.5, marginTop: 4 }}>{sub}</div>
        </div>
        <span style={{ color: primary ? C.accent : C.faint, fontSize: 20, fontWeight: 700 }}>→</span>
      </div>
    </button>
  );
}

function InputScreen({ path, meta, setMeta, target, setTarget, onNext }) {
  const isRepo = path === "repo";
  return (
    <div>
      <Eyebrow>{isRepo ? "Your repository" : "Your prototype"}</Eyebrow>
      <h2 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 18px" }}>Tell us about your app</h2>

      {isRepo && (
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", color: C.faint, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>GitHub URL</label>
          <input
            value={meta.url}
            onChange={(e) => setMeta({ ...meta, url: e.target.value })}
            placeholder="https://github.com/you/your-app"
            style={inputStyle}
          />
        </div>
      )}

      <div style={{ marginBottom: 18 }}>
        <label style={{ display: "block", color: C.faint, fontSize: 12, fontWeight: 700, marginBottom: 6 }}>
          {isRepo ? "Short description (optional)" : "Describe what you built"}
        </label>
        <textarea
          value={meta.description}
          onChange={(e) => setMeta({ ...meta, description: e.target.value })}
          rows={4}
          placeholder="e.g. A single HTML page that calls an AI API to summarise documents. No login yet."
          style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
        />
      </div>

      <label style={{ display: "block", color: C.faint, fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
        How many people should it support?
      </label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 24 }}>
        {SCALES.map((s) => (
          <button
            key={s}
            onClick={() => setTarget(s)}
            style={{
              textAlign: "left",
              background: target === s ? "rgba(124,92,255,0.14)" : C.card,
              border: `1px solid ${target === s ? C.accent : C.line}`,
              borderRadius: 12,
              padding: "12px 14px",
              cursor: "pointer",
              color: C.text,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 15 }}>{s.toLocaleString()}</div>
            <div style={{ color: C.mut, fontSize: 11.5 }}>{SCALE_LABEL[s]}</div>
          </button>
        ))}
      </div>

      <Btn full onClick={onNext}>Continue to assessment →</Btn>
    </div>
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
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
        <span style={{ color: C.mut, fontSize: 12, fontWeight: 700, letterSpacing: "0.08em" }}>
          Question {i + 1} of {total}
        </span>
      </div>
      <div style={{ height: 4, background: C.line, borderRadius: 3, marginBottom: 24, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${((i + 1) / total) * 100}%`, background: C.accent, transition: "width .3s" }} />
      </div>

      <h2 style={{ fontSize: 21, fontWeight: 800, lineHeight: 1.35, margin: "0 0 20px" }}>{q.q}</h2>

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
              padding: "14px 16px",
              cursor: "pointer",
              color: C.text,
              fontSize: 14.5,
              fontWeight: 600,
            }}
          >
            {o.label}
          </button>
        ))}
      </div>

      <div style={{ marginTop: 22 }}>
        <Btn ghost onClick={() => (i > 0 ? setI(i - 1) : onBack())}>← Back</Btn>
      </div>
    </div>
  );
}

function Report({ path, meta, answers, target, onAgain }) {
  const [scale, setScale] = useState(target);
  const risks = useMemo(() => assessRisks(answers, target), [answers, target]);
  const fixes = useMemo(() => nextFixes(risks), [risks]);
  const roadmapIdx = roadmapIndexForScale(scale);

  const [aiState, setAiState] = useState("idle"); // idle | busy | done | error
  const [aiText, setAiText] = useState("");

  const explain = async () => {
    setAiState("busy");
    try {
      const findings = risks.map((r) => r.title);
      const { explanation } = await explainFindings({
        app_type: path === "repo" ? "repository" : "prototype",
        description: meta.description,
        target_users: target,
        findings,
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
      <Eyebrow>Your scaling assessment</Eyebrow>
      <h2 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 6px" }}>
        Ready for {target.toLocaleString()} users?
      </h2>
      <p style={{ color: C.mut, fontSize: 13.5, margin: "0 0 22px" }}>
        {risks.length === 0
          ? "No blocking risks detected for this scale. Nice."
          : `${risks.length} thing${risks.length > 1 ? "s" : ""} to address before you get there.`}
      </p>

      {/* A — what breaks first */}
      <Eyebrow>What will break first</Eyebrow>
      <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
        {risks.length === 0 && (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px", color: C.mut, fontSize: 14 }}>
            Your current setup already covers the basics for this scale.
          </div>
        )}
        {risks.map((r) => (
          <div key={r.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: "14px 15px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 6 }}>
              <span style={{ background: SEV[r.sev], color: "#0B0B0D", fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 6, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {r.sev}
              </span>
              <span style={{ fontWeight: 800, fontSize: 14.5 }}>{r.title}</span>
            </div>
            <div style={{ color: C.mut, fontSize: 13, lineHeight: 1.5 }}>{r.why}</div>
          </div>
        ))}
      </div>

      {/* B — what to fix next */}
      {fixes.length > 0 && (
        <>
          <Eyebrow>What to fix next</Eyebrow>
          <div style={{ display: "grid", gap: 10, marginBottom: 26 }}>
            {fixes.map((f, i) => (
              <div key={i} style={{ background: C.cardUp, border: `1px solid ${C.line}`, borderRadius: 12, padding: "13px 15px", display: "flex", gap: 12 }}>
                <span style={{ color: C.accent, fontWeight: 900, fontSize: 15 }}>{i + 1}</span>
                <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{f}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* C — architecture at your scale (the interactive slider) */}
      <Eyebrow>Architecture at your scale</Eyebrow>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 14, padding: "16px", marginBottom: 26 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <span style={{ fontSize: 26, fontWeight: 900, color: C.accent }}>{scale.toLocaleString()}</span>
          <span style={{ fontSize: 12.5, color: C.mut }}>{SCALE_LABEL[scale]}</span>
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
        <Architecture scale={scale} answers={answers} />
        <p style={{ color: C.faint, fontSize: 12, marginTop: 14, marginBottom: 0 }}>
          Drag the slider — the architecture evolves as your user count grows.
        </p>
      </div>

      {/* D — roadmap */}
      <Eyebrow>Scaling roadmap</Eyebrow>
      <div style={{ display: "grid", gap: 8, marginBottom: 26 }}>
        {ROADMAP.map((r, i) => {
          const active = i === roadmapIdx;
          const passed = i < roadmapIdx;
          return (
            <div
              key={r.stage}
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
                <div style={{ fontWeight: 700, fontSize: 14, color: active ? C.text : C.mut }}>{r.stage}</div>
                <div style={{ fontSize: 11.5, color: C.faint }}>{r.detail}</div>
              </div>
              {active && (
                <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 800, color: "#0B0B0D", background: C.accent, padding: "3px 8px", borderRadius: 6 }}>
                  YOU'RE HERE
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
            <Btn small ghost onClick={explain} disabled={aiState === "busy"}>
              {aiState === "busy" ? "Thinking…" : "✨ Explain this in plain language"}
            </Btn>
          )}
          {aiState === "error" && (
            <p style={{ color: C.faint, fontSize: 12, marginTop: 10 }}>
              The AI explainer isn't available right now — your report above is complete without it.
            </p>
          )}
          {aiState === "done" && (
            <div style={{ background: C.cardUp, border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "14px 16px", marginTop: 4 }}>
              <Eyebrow>In plain language</Eyebrow>
              <p style={{ fontSize: 14, lineHeight: 1.6, margin: 0, whiteSpace: "pre-wrap" }}>{aiText}</p>
            </div>
          )}
        </div>
      )}

      {BRAND.ctaUrl && (
        <div style={{ background: "rgba(124,92,255,0.07)", border: `1px solid ${C.accentDim}`, borderRadius: 12, padding: "13px 15px", marginBottom: 20 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700 }}>Your AI prototype works. Now make it ready for everyone.</div>
          <div style={{ fontSize: 12.5, color: C.accent, marginTop: 3 }}>{BRAND.ctaUrl}</div>
        </div>
      )}

      <Btn ghost onClick={onAgain}>Run another assessment</Btn>
    </div>
  );
}
