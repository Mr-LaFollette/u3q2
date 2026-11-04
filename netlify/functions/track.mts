import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Receives a student's session from the browser and saves it.
// Each session is stored under its own key, so students never overwrite each other.

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const clean = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max) : "";
const num = (v: unknown, max: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(max, v)) : 0;

export default async (req: Request, _context: Context) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  // Only accept saves that come from this site's own pages.
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new Response("Forbidden", { status: 403 });

  const text = await req.text();
  if (text.length > 150_000) return new Response("Too large", { status: 413 });

  let body: any;
  try { body = JSON.parse(text); } catch { return new Response("Bad JSON", { status: 400 }); }
  if (!body || typeof body.id !== "string" || !ID_RE.test(body.id)) return new Response("Bad id", { status: 400 });

  const status = ["opened", "practicing", "finished"].includes(body.status) ? body.status : "opened";
  const log = Array.isArray(body.log)
    ? body.log.slice(0, 500).map((e: any) => ({
        topic: clean(e?.topic, 40),
        std: clean(e?.std, 20),
        correct: !!e?.correct,
        firstTry: !!e?.firstTry,
        attempts: num(e?.attempts, 99),
        hint: !!e?.hint,
        solution: !!e?.solution,
        skipped: !!e?.skipped,
        seconds: num(e?.seconds, 36000),
        at: num(e?.at, 9e12),
      }))
    : [];

  const record = {
    id: body.id,
    name: clean(body.name, 40),
    period: clean(body.period, 10),
    startedAt: clean(body.startedAt, 40),
    practiceStartedAt: clean(body.practiceStartedAt, 40),
    lastActiveAt: clean(body.lastActiveAt, 40),
    receivedAt: new Date().toISOString(),
    activeSeconds: num(body.activeSeconds, 86400),
    status,
    topics: Array.isArray(body.topics) ? body.topics.slice(0, 12).map((t: unknown) => clean(t, 40)) : [],
    log,
  };

  const store = getStore({ name: "complex-sessions", consistency: "strong" });
  await store.setJSON(`session/${record.id}`, record);
  return new Response(null, { status: 204 });
};

export const config: Config = { path: "/api/track", method: "POST" };
