/* ─────────────────────────────────────────────────────────
   Backend layer.

   The core assessment is fully deterministic and runs in the browser,
   so the app works with NO backend at all. The only backend call is an
   OPTIONAL plain-language explanation of the findings, produced by
   Amazon Bedrock via your API. If VITE_API_BASE is unset (or the call
   fails), the report is still complete — the explanation just doesn't
   appear.

   There are never any provider keys or cloud account details in the
   frontend. Everything sensitive lives behind VITE_API_BASE.
   ───────────────────────────────────────────────────────── */

const API_BASE = (import.meta.env.VITE_API_BASE || "").replace(/\/+$/, "");

export const hasBackend = Boolean(API_BASE);

// Fire-and-forget anonymous stats. Never blocks the UI; never sends
// repo content or URLs — only aggregate signals.
export async function recordStats(payload) {
  if (!hasBackend) return;
  try {
    await fetch(`${API_BASE}/stats`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    /* stats are best-effort */
  }
}

// Server-side scan for PRIVATE repos (uses the backend's GitHub token).
// Returns the same shape as the client-side scanner, or throws with a
// .code so the UI can explain ("not-configured", "auth", "not-found", …).
export async function scanRepoBackend(url) {
  if (!hasBackend) {
    const e = new Error("no-backend");
    e.code = "no-backend";
    throw e;
  }
  const res = await fetch(`${API_BASE}/scan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (res.status === 501) {
    const e = new Error("scan-not-configured");
    e.code = "not-configured";
    throw e;
  }
  if (!res.ok) {
    const e = new Error(`scan ${res.status}`);
    e.code = res.status === 404 ? "not-found" : res.status === 502 ? "auth" : "error";
    throw e;
  }
  return res.json();
}

export async function loadStats() {
  if (!hasBackend) throw new Error("no-backend");
  const res = await fetch(`${API_BASE}/stats/summary`);
  if (!res.ok) throw new Error(`stats ${res.status}`);
  return res.json();
}

export async function explainFindings({ app_type, description, target_users, findings, cloud }) {
  if (!hasBackend) throw new Error("no-backend");
  const res = await fetch(`${API_BASE}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_type, description, target_users, findings, cloud }),
  });
  if (!res.ok) throw new Error(`analyze ${res.status}`);
  return res.json();
}
