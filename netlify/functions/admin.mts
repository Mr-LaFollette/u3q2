import type { Config, Context } from "@netlify/functions";
import { getStore } from "@netlify/blobs";
import { createHash, timingSafeEqual } from "node:crypto";

// Teacher-only: lists and deletes session records. Protected by the ADMIN_PASSWORD environment variable.

const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
const noStore = { "Cache-Control": "no-store" };

function checkPassword(req: Request): "unset" | boolean {
  const expected = Netlify.env.get("ADMIN_PASSWORD");
  if (!expected) return "unset";
  const header = req.headers.get("authorization") || "";
  const given = header.startsWith("Bearer ") ? header.slice(7) : "";
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async (req: Request, _context: Context) => {
  const auth = checkPassword(req);
  if (auth === "unset") {
    return Response.json({ error: "ADMIN_PASSWORD is not set. Add it in Netlify > Site configuration > Environment variables, then redeploy." }, { status: 500, headers: noStore });
  }
  if (!auth) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return Response.json({ error: "Wrong password." }, { status: 401, headers: noStore });
  }

  const store = getStore({ name: "complex-sessions", consistency: "strong" });

  if (req.method === "GET") {
    const { blobs } = await store.list({ prefix: "session/" });
    const sessions: unknown[] = [];
    for (let i = 0; i < blobs.length; i += 25) {
      const chunk = await Promise.all(blobs.slice(i, i + 25).map((b) => store.get(b.key, { type: "json" })));
      chunk.forEach((s) => { if (s) sessions.push(s); });
    }
    return Response.json({ sessions, generatedAt: new Date().toISOString() }, { headers: noStore });
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    if (url.searchParams.get("all") === "true") {
      const r = await store.deleteAll();
      return Response.json({ deleted: r.deletedBlobs }, { headers: noStore });
    }
    const id = url.searchParams.get("id") || "";
    if (!ID_RE.test(id)) return Response.json({ error: "Bad id" }, { status: 400, headers: noStore });
    await store.delete(`session/${id}`);
    return Response.json({ deleted: 1 }, { headers: noStore });
  }

  return new Response("Method not allowed", { status: 405 });
};

export const config: Config = { path: "/api/admin", method: ["GET", "DELETE"] };
