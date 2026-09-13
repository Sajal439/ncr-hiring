import { NextResponse } from "next/server";
import { INTERESTS, isEmail } from "@/lib/subscribe";

export const runtime = "nodejs";

/**
 * Adds someone to the daily digest.
 *
 * Subscribers live in a Google Sheet behind an Apps Script web app — see
 * google-apps-script/subscribers.gs. They cannot live in data/*.json: that is
 * committed to the repo and rewritten by the daily refresh, and these are
 * personal data.
 *
 * Without SUBSCRIBERS_URL the signup is logged and accepted, so the form still
 * works in development — the same shape as /api/submit and /api/advertise.
 */
export async function POST(req: Request) {
  let body: { name?: string; email?: string; interests?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Could not read the form" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim().slice(0, 80);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!isEmail(email)) {
    return NextResponse.json({ error: "That email doesn't look right" }, { status: 400 });
  }

  // Whitelist rather than trust: interests end up in a spreadsheet cell and are
  // read back by the send script, so only known values may pass.
  const interests = Array.isArray(body.interests)
    ? [...new Set(body.interests.map(String))].filter((i) =>
        (INTERESTS as readonly string[]).includes(i),
      )
    : [];

  const url = process.env.SUBSCRIBERS_URL;
  const token = process.env.SUBSCRIBERS_TOKEN;
  if (!url || !token) {
    console.log("[subscribe] no SUBSCRIBERS_URL/TOKEN set; signup:", { name, email, interests });
    return NextResponse.json({ ok: true });
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // Apps Script answers a POST with a 302 to its own storage host.
      redirect: "follow",
      body: JSON.stringify({ token, action: "subscribe", name, email, interests }),
    });
  } catch (err) {
    console.error("[subscribe] sheet unreachable:", err);
    return NextResponse.json({ error: "Could not save that. Try again shortly." }, { status: 502 });
  }

  const out = await res.json().catch(() => ({}) as { ok?: boolean; error?: string });
  if (!res.ok || !out.ok) {
    console.error("[subscribe] sheet rejected the write:", res.status, out);
    return NextResponse.json({ error: "Could not save that. Try again shortly." }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
