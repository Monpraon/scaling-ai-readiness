/* ─────────────────────────────────────────────────────────
   API / storage layer.

   This module is the ONLY place that talks to the outside world.
   It is fully environment-driven so the same code runs:

   1. Fully offline / static  (no backend configured)
        - Room results are kept per-device in localStorage
        - "Analyze My Work" is unavailable (needs a backend that can
          reach an LLM — we never put model keys in the browser)

   2. With a backend            (VITE_API_BASE points at your API)
        - Room results are shared via the backend
        - "Analyze My Work" calls the backend, which calls the model

   There are NEVER any provider API keys or cloud account details in
   the frontend. Everything sensitive lives behind VITE_API_BASE.
   ───────────────────────────────────────────────────────── */

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

export const hasBackend = Boolean(API_BASE);

const LS_PREFIX = "sar:resp:";

/* ── Results (the "room" aggregate) ─────────────────────── */

export async function saveResult({ step, total }) {
  if (hasBackend) {
    await fetch(`${API_BASE}/responses`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, total }),
    });
    return;
  }
  // Local-only fallback: keep recent results on this device.
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
  localStorage.setItem(`${LS_PREFIX}${id}`, JSON.stringify({ step, total }));
}

export async function loadSummary() {
  if (hasBackend) {
    const res = await fetch(`${API_BASE}/responses/summary`);
    if (!res.ok) throw new Error(`summary ${res.status}`);
    const data = await res.json();
    const counts = Array.isArray(data.counts) ? data.counts : [0, 0, 0];
    const total = typeof data.total === "number" ? data.total : counts.reduce((a, b) => a + b, 0);
    return { counts, total };
  }
  // Local-only fallback.
  const counts = [0, 0, 0];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (!key || !key.startsWith(LS_PREFIX)) continue;
    try {
      const v = JSON.parse(localStorage.getItem(key));
      if (v && v.step >= 1 && v.step <= 3) counts[v.step - 1] += 1;
    } catch {
      /* skip broken */
    }
  }
  return { counts, total: counts[0] + counts[1] + counts[2] };
}

/* ── Analyze My Work ────────────────────────────────────── */

export class BackendUnavailableError extends Error {}

export async function analyzeWork({ text, context }) {
  if (!hasBackend) {
    throw new BackendUnavailableError("no-backend");
  }
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, context }),
  });
  if (res.status === 429) {
    const e = new Error("quota");
    e.code = "quota";
    throw e;
  }
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  return res.json();
}
