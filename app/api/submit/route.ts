import { NextResponse } from "next/server";

export const runtime = "nodejs";

const FIELDS = [
  "type", "company", "website", "roleTitle", "oneLiner", "location",
  "sector", "stage", "founded", "applyUrl", "salary", "contact", "notes",
] as const;

/**
 * A startup or job someone wants listed.
 *
 * Rows land in the `submissions` tab as `pending` and reach the site only
 * after a human check. A board whose entire claim is that its data is real
 * cannot publish an open form straight through.
 *
 * This used to post to SUBMIT_WEBHOOK_URL, or log and return ok when that was
 * unset — which it always was in production. Every submission since the page
 * shipped was thrown away while the form said thank you.
 */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the form" }, { status: 400 });
  }

  const fields = Object.fromEntries(
    FIELDS.map((k) => [k, String(body[k] ?? "").trim().slice(0, 500)]),
  );
  if (!fields.company || !fields.contact) {
    return NextResponse.json({ error: "Name and your email are both required" }, { status: 400 });
  }

  const url = process.env.SUBSCRIBERS_URL;
  const token = process.env.SUBSCRIBERS_TOKEN;
  if (url && token) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        redirect: "follow",
        body: JSON.stringify({ token, action: "submission", fields }),
      });
      const out = (await res.json().catch(() => ({}))) as { ok?: boolean };
      if (res.ok && out.ok) return NextResponse.json({ ok: true });
      console.error("[submit] store rejected the write:", res.status, out);
    } catch (err) {
      console.error("[submit] store unreachable:", err);
    }
    return NextResponse.json({ error: "Could not save that. Try again shortly." }, { status: 502 });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log("[submit] no store configured; submission:", fields);
    return NextResponse.json({ ok: true });
  }
  console.error("[submit] no store configured in production — submission dropped");
  return NextResponse.json({ error: "Could not save that. Try again shortly." }, { status: 503 });
}
