import { NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * One-click unsubscribe, reached from the link in every digest.
 *
 * The link carries an opaque per-subscriber id, never the email address —
 * putting an address in a URL leaks it to every referrer, proxy and log along
 * the way, and these links get forwarded.
 */
export async function POST(req: Request) {
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const url = process.env.SUBSCRIBERS_URL;
  const token = process.env.SUBSCRIBERS_TOKEN;
  if (!url || !token) {
    console.log("[unsubscribe] no SUBSCRIBERS_URL/TOKEN set; would remove:", id);
    return NextResponse.json({ ok: true });
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ token, action: "unsubscribe", id }),
  }).catch(() => null);

  const out = await res?.json().catch(() => ({}) as { ok?: boolean });
  if (!res?.ok || !out?.ok) {
    console.error("[unsubscribe] failed for", id, res?.status, out);
    return NextResponse.json({ error: "Could not unsubscribe you" }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}
