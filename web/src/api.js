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
