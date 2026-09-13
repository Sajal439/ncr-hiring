/**
 * Sends the 8am digest: yesterday's new NCR roles, filtered to each
 * subscriber's chosen functions.
 *
 *   npx tsx scripts/send-digest.mjs --dry-run     # render, print, send nothing
 *   npx tsx scripts/send-digest.mjs --to=me@x.com --interests=Engineering
 *   npx tsx scripts/send-digest.mjs               # the real thing
 *
 * Needs SUBSCRIBERS_URL and SUBSCRIBERS_TOKEN to know who to write to, plus
 * one transport: SMTP_USER + SMTP_PASS (a Gmail app password), or
 * RESEND_API_KEY + DIGEST_FROM once a domain is verified with Resend.
 * Runs under tsx rather than plain node so it can share lib/subscribe.ts with
 * the site — the interest list and the matching rule must not drift.
 *
 * ── The window ─────────────────────────────────────────────────────────────
 * Postings carry a date, not a timestamp, so "the last 24 hours" has to be
 * expressed in whole days. The default window is exactly *yesterday*: every
 * role is sent once, on the morning after it appeared, with no gaps and no
 * repeats between consecutive runs. Widening it with --days would re-send
 * anything already covered, so that flag is for filling a gap after a failed
 * run, not for everyday use.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { matchesInterests } from "../lib/subscribe.ts";
import { AGENCY, BULK, DOMESTIC } from "../lib/hrpost.ts";
import { SITE } from "../lib/site.ts";

const BRAND = SITE.name;

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (f) => JSON.parse(readFileSync(join(root, "data", f), "utf8"));

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] ?? d;
const has = (k) => process.argv.includes(`--${k}`);

const DRY = has("dry-run");
const ONLY = arg("to", "");
const DAYS = Math.max(1, Number(arg("days", 1)));
const MAX_ROLES = Number(arg("max", 20));
const SITE_URL = process.env.SITE_URL || SITE.url;

/* ---------- the window ---------- */
const day = (offset) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - offset);
  return d.toISOString().slice(0, 10);
};
const from = day(DAYS);
const to = day(1);
const label = from === to ? from : `${from} to ${to}`;

/* ---------- the roles ---------- */
const companies = read("companies.json");
const funded = new Set(Object.keys(read("funding.json")));
const bySlug = new Map(companies.map((c) => [c.slug, c]));

/**
 * The board is not the digest.
 *
 * A first draft sent whatever was newest, and the top of the email was Office
 * Boy, Delivery Boy, Picker & Packer and car Driver — twelve roles from one
 * staffing agency. That is a defensible jobs *board*, since someone searching
 * "delivery" wants them; it is an indefensible *digest* from something called a
 * startup map, and it is the kind of first email that earns an unsubscribe.
 *
 * So the digest is curated where the board is inclusive:
 *
 *   - Mapped companies only. Standalone listings are mostly micro-agencies —
 *     that is precisely why they were kept off the map in the first place.
 *   - The agency, bulk-hiring and domestic-staffing patterns already written
 *     for LinkedIn HR posts, applied to the employer name and the job title.
 *   - Funded and address-verified companies rank above the rest, because the
 *     tier rules cannot tell a product startup from a digital-marketing shop.
 *   - At most two roles per company, so one employer with fourteen openings
 *     cannot become the whole email.
 */
const MAX_PER_COMPANY = 2;

const board = Object.entries(read("jobs.json")).flatMap(([slug, list]) =>
  list.map((j) => ({ ...j, company: bySlug.get(slug)?.name ?? slug, companySlug: slug })),
);
const standalone = read("open-jobs.json");

const inWindow = (j) => j.postedAt && j.postedAt >= from && j.postedAt <= to;
const isNoise = (j) =>
  AGENCY.test(j.company ?? "") || BULK.test(j.title ?? "") || DOMESTIC.test(j.title ?? "");

/** Lower sorts first. */
function rank(j) {
  const c = bySlug.get(j.companySlug);
  if (!c) return 4;
  if (c.tier === "company") return 3;
  if (funded.has(j.companySlug)) return 0;
  if (!c.approx) return 1;
  return 2;
}

const pool = (has("include-standalone") ? [...board, ...standalone] : board)
  .filter(inWindow)
  .filter((j) => !isNoise(j))
  .sort(
    (a, b) =>
      rank(a) - rank(b) ||
      (b.salary ? 1 : 0) - (a.salary ? 1 : 0) ||
      (b.postedAt ?? "").localeCompare(a.postedAt ?? ""),
  );

const perCompany = new Map();
const fresh = pool.filter((j) => {
  const key = j.companySlug ?? j.company;
  const n = perCompany.get(key) ?? 0;
  if (n >= MAX_PER_COMPANY) return false;
  perCompany.set(key, n + 1);
  return true;
});

const dropped = pool.length - fresh.length;
console.log(
  `window ${label} — ${fresh.length} roles selected ` +
    `(from ${board.length + standalone.length} on the board; ` +
    `${dropped} trimmed by the ${MAX_PER_COMPANY}-per-company cap)`,
);
if (!fresh.length) {
  console.log("nothing new; no digest today");
  process.exit(0);
}

/* ---------- the subscribers ---------- */
const SUB_URL = process.env.SUBSCRIBERS_URL;
const SUB_TOKEN = process.env.SUBSCRIBERS_TOKEN;
let subscribers = [];

if (ONLY) {
  const interests = arg("interests", "").split(",").map((x) => x.trim()).filter(Boolean);
  subscribers = [{ id: "test", name: "", email: ONLY, interests }];
  console.log(`--to given: sending only to ${ONLY}${interests.length ? ` (${interests.join(", ")})` : ""}`);
} else if (!SUB_URL || !SUB_TOKEN) {
  console.error("Missing SUBSCRIBERS_URL / SUBSCRIBERS_TOKEN — cannot read the subscriber sheet.");
  process.exit(1);
} else {
  // Apps Script answers an occasional request with a 404 for no reason and
  // serves the next one fine. This runs once a day, so one unlucky response
  // would otherwise cost everybody that day's digest.
  let out, status;
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${SUB_URL}?token=${encodeURIComponent(SUB_TOKEN)}`, { redirect: "follow" });
    status = res.status;
    out = await res.json().catch(() => ({}));
    if (res.ok && out.subscribers) break;
    console.warn(`  subscriber sheet returned HTTP ${status} (attempt ${attempt}/4)`);
    out = null;
    if (attempt < 4) await new Promise((r) => setTimeout(r, attempt * 3000));
  }
  if (!out?.subscribers) {
    console.error(`subscriber sheet unreadable after 4 attempts; last status ${status}`);
    process.exit(1);
  }
  subscribers = out.subscribers;
  console.log(`${subscribers.length} active subscribers`);
}

/* ---------- rendering ---------- */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** "Gurugram, Haryana" -> "Gurugram". The state adds nothing inside NCR. */
const place = (loc) => String(loc || "Delhi NCR").split(",")[0].trim();

/**
 * Roles grouped for display. Someone who picked Engineering and Design wants
 * to see them as two lists, not one shuffled column. Internships cut across
 * every function, so they get their own group when that is what was asked for.
 */
function group(roles, interests) {
  const wantsInterns = interests?.includes("Internships");
  const buckets = new Map();
  for (const j of roles) {
    const key = wantsInterns && j.level === "Intern" ? "Internships" : j.fn || "Other";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(j);
  }
  return [...buckets.entries()].sort((a, b) => b[1].length - a[1].length);
}

const chip = (text, bg, fg) =>
  `<span style="display:inline-block;padding:2px 7px;margin:0 4px 0 0;border-radius:10px;background:${bg};color:${fg};font-size:11px;line-height:16px;white-space:nowrap">${esc(text)}</span>`;

function renderHtml(sub, roles, extra) {
  const total = roles.length + extra;
  const companies = new Set(roles.map((j) => j.company)).size;
  const paid = roles.filter((j) => j.salary).length;

  const sections = group(roles, sub.interests)
    .map(([name, list]) => {
      const rows = list
        .map(
          (j) => `
      <tr><td style="padding:14px 0 13px;border-bottom:1px solid #f1f1ef">
        <a href="${esc(j.url)}" style="display:block;color:#171717;font-size:15px;line-height:21px;font-weight:600;text-decoration:none">${esc(j.title)}</a>
        <div style="margin-top:4px;font-size:13px;line-height:18px;color:#525252">
          <span style="font-weight:500">${esc(j.company)}</span>
          <span style="color:#c4c4c2">&nbsp;·&nbsp;</span>${esc(place(j.location))}
        </div>
        <div style="margin-top:7px">
          ${j.level ? chip(j.level, "#f4f4f2", "#737373") : ""}${
            j.salary ? chip(j.salary, "#e9f7f0", "#047857") : ""
          }
        </div>
      </td></tr>`,
        )
        .join("");

      return `
      <tr><td style="padding:22px 0 0">
        <div style="font-size:11px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:#a3a3a3">
          ${esc(name)} <span style="color:#c4c4c2">${list.length}</span>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
      </td></tr>`;
    })
    .join("");

  const stats = [
    `${total} role${total === 1 ? "" : "s"}`,
    `${companies} compan${companies === 1 ? "y" : "ies"}`,
    paid ? `${paid} with pay` : null,
  ]
    .filter(Boolean)
    .join("&nbsp;&nbsp;·&nbsp;&nbsp;");

  // Sits at the top of the source so inbox previews show this, not the header.
  const preheader = `${total} new role${total === 1 ? "" : "s"} at ${roles
    .slice(0, 3)
    .map((j) => j.company)
    .join(", ")} and more`;

  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only"></head>
<body style="margin:0;padding:0;background:#f2f2ef;-webkit-font-smoothing:antialiased">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0">${esc(preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f2f2ef;padding:28px 12px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background:#ffffff;border-radius:14px;overflow:hidden">

        <tr><td style="background:#171717;padding:16px 30px">
          <span style="color:#ffffff;font-size:14px;font-weight:600;letter-spacing:-.01em">${BRAND}</span>
          <span style="float:right;color:#8a8a86;font-size:12px;line-height:21px">${esc(label)}</span>
        </td></tr>

        <tr><td style="padding:26px 30px 0">
          <h1 style="margin:0;font-size:23px;line-height:29px;font-weight:700;color:#171717;letter-spacing:-.02em">
            ${total} new role${total === 1 ? "" : "s"}${sub.name ? `, ${esc(String(sub.name).split(" ")[0])}` : ""}
          </h1>
          <p style="margin:7px 0 0;font-size:13px;line-height:19px;color:#737373">
            ${stats}
          </p>
          <p style="margin:10px 0 0;font-size:13px;line-height:19px;color:#8a8a86">
            Posted across Gurugram, Noida and Delhi yesterday${
              sub.interests?.length ? `, filtered to ${esc(sub.interests.join(", "))}` : ""
            }.${extra > 0 ? ` Showing the top ${roles.length}.` : ""}
          </p>
        </td></tr>

        <tr><td style="padding:0 30px">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${sections}</table>
        </td></tr>

        <tr><td style="padding:24px 30px 30px" align="center">
          <a href="${SITE_URL}/jobs" style="display:inline-block;background:#171717;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:11px 22px;border-radius:9px">
            ${extra > 0 ? `See ${extra} more on the board` : "Browse the full board"}
          </a>
        </td></tr>

      </table>

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px">
        <tr><td align="center" style="padding:18px 20px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:11px;line-height:18px;color:#a3a3a3">
          You signed up for this at <a href="${SITE_URL}" style="color:#8a8a86">delhi-ncr-startup-map</a>.
          Free to read, and it costs about ₹100 a day to put together —
          <a href="${SITE_URL}/coffee" style="color:#8a8a86;text-decoration:underline">buy me a cold coffee</a> if it helped.<br>
          <a href="${SITE_URL}/unsubscribe?id=${encodeURIComponent(sub.id)}" style="color:#8a8a86;text-decoration:underline">Unsubscribe</a>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body></html>`;
}

const renderText = (sub, roles, extra) => {
  const total = roles.length + extra;
  const lines = [
    `${total} new role${total === 1 ? "" : "s"} across Delhi NCR - ${label}`,
    sub.interests?.length ? `Filtered to ${sub.interests.join(", ")}.` : "",
    extra > 0 ? `Showing the top ${roles.length}.` : "",
  ].filter(Boolean);

  for (const [name, list] of group(roles, sub.interests)) {
    lines.push("", `${name.toUpperCase()} (${list.length})`, "");
    for (const j of list) {
      lines.push(
        `  ${j.title}`,
        `  ${j.company} - ${place(j.location)}${j.level ? ` - ${j.level}` : ""}${j.salary ? ` - ${j.salary}` : ""}`,
        `  ${j.url}`,
        "",
      );
    }
  }

  lines.push(
    extra > 0 ? `${extra} more at ${SITE_URL}/jobs` : `Full board: ${SITE_URL}/jobs`,
    "",
    `Free to read, ~Rs 25/day to put together: ${SITE_URL}/coffee`,
    `Unsubscribe: ${SITE_URL}/unsubscribe?id=${sub.id}`,
  );
  return lines.join("\n");
};

/**
 * Two company names, because one reads like an ad and three overflow the
 * preview on a phone. Names the employers rather than counting roles, since
 * recognising "Zomato" is what makes someone open it.
 */
function subjectFor(all, shown) {
  const names = [...new Set(shown.map((j) => j.company))];
  const lead = names.slice(0, 2).join(", ");
  const rest = all.length - (names.length >= 2 ? 2 : 1);
  return `${lead}${rest > 0 ? ` + ${rest} more` : ""} hiring in NCR`;
}

/* ---------- build one email per subscriber ---------- */
const FROM = process.env.DIGEST_FROM || `${BRAND} <jobs@resend.dev>`;
const FROM_SMTP = `${BRAND} <${process.env.SMTP_USER ?? ""}>`;
const emails = [];
let skipped = 0;

for (const sub of subscribers) {
  const mine = fresh.filter((j) => matchesInterests(j, sub.interests ?? []));
  if (!mine.length) {
    skipped++;
    continue;
  }
  const shown = mine.slice(0, MAX_ROLES);
  emails.push({
    id: sub.id,
    payload: {
      from: FROM,
      to: [sub.email],
      subject: subjectFor(mine, shown),
      html: renderHtml(sub, shown, mine.length - shown.length),
      text: renderText(sub, shown, mine.length - shown.length),
      headers: {
        // Gmail and Outlook surface a native unsubscribe control from these,
        // which keeps the digest out of spam far better than a footer link.
        "List-Unsubscribe": `<${SITE_URL}/unsubscribe?id=${sub.id}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
  });
}

console.log(`${emails.length} to send, ${skipped} skipped (nothing matched their interests)`);

if (DRY) {
  const sample = emails[0];
  if (sample) {
    console.log(`\n--- dry run, first email ---\nto: ${sample.payload.to}\nsubject: ${sample.payload.subject}\n`);
    console.log(sample.payload.text);
    // --html-out writes the rendered email to a file. Email HTML cannot be
    // judged from source, and sending yourself twenty drafts to look at it is
    // a poor way to iterate on the layout.
    const out = arg("html-out", "");
    if (out) {
      writeFileSync(out, sample.payload.html);
      console.log(`\nHTML written to ${out}`);
    }
  }
  console.log("\ndry run: nothing sent");
  process.exit(0);
}
if (!emails.length) process.exit(0);

/* ---------- send ---------- */
/**
 * Two transports, chosen by which credentials exist.
 *
 * Gmail SMTP is the one that works without a domain. Resend — the better
 * long-term answer, with proper bounce handling and analytics — will only
 * deliver to the account's own address until a domain is verified with them,
 * which makes it useless for actual subscribers until that domain is bought.
 * So SMTP wins when both are set, and the switch later is two env vars.
 *
 * Gmail's free limit is about 500 recipients a day. That is far above what
 * this list needs now and far below what it should reach before moving to
 * Resend; SEND_CAP below refuses to start a run that would blow through it,
 * because a half-sent digest is worse than a late one.
 */
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const KEY = process.env.RESEND_API_KEY;
const SEND_CAP = Number(arg("cap", 450));

if (!SMTP_USER && !KEY) {
  console.error(
    "No way to send: set SMTP_USER + SMTP_PASS (Gmail app password), or\n" +
      "RESEND_API_KEY. Run with --dry-run to preview without sending.",
  );
  process.exit(1);
}
if (emails.length > SEND_CAP) {
  console.error(
    `refusing to send: ${emails.length} emails exceeds the ${SEND_CAP} daily cap.\n` +
      "Raise it with --cap once the transport can take it, or move to Resend.",
  );
  process.exit(1);
}

const sent = [];

if (SMTP_USER) {
  if (!SMTP_PASS) {
    console.error("SMTP_USER is set but SMTP_PASS is not. Use a Google app password, not the account password.");
    process.exit(1);
  }
  const { default: nodemailer } = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: true,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Fail loudly here rather than one message at a time: a wrong app password
  // should not look like 40 individual delivery failures.
  try {
    await transport.verify();
  } catch (err) {
    console.error("SMTP login failed:", err.message);
    console.error("Gmail needs 2-Step Verification on, and an app password — not the account password.");
    process.exit(1);
  }
  console.log(`sending over SMTP as ${SMTP_USER}`);

  for (const e of emails) {
    try {
      // Gmail rewrites From to the authenticated account anyway, so send as
      // that address with a display name rather than pretending otherwise.
      await transport.sendMail({ ...e.payload, from: FROM_SMTP, to: e.payload.to[0] });
      sent.push(e.id);
      if (sent.length % 10 === 0) console.log(`  sent ${sent.length}/${emails.length}`);
    } catch (err) {
      console.error(`  failed for one recipient: ${err.message}`);
    }
    // Gentle enough that Gmail never sees a burst.
    await new Promise((r) => setTimeout(r, 400));
  }
  transport.close();
} else {
  for (let i = 0; i < emails.length; i += 100) {
    const chunk = emails.slice(i, i + 100);
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map((e) => e.payload)),
    });
    if (!res.ok) {
      console.error(`batch ${i / 100 + 1} failed: HTTP ${res.status} ${await res.text()}`);
      // Keep going: one rejected batch should not cost every later subscriber
      // their digest, and the ones already sent are recorded below.
      continue;
    }
    sent.push(...chunk.map((e) => e.id));
    console.log(`  sent ${sent.length}/${emails.length}`);
    if (i + 100 < emails.length) await new Promise((r) => setTimeout(r, 1000));
  }
}

/* ---------- record it, so a partial send is visible rather than guessed at ---------- */
if (SUB_URL && SUB_TOKEN && sent.length && !ONLY) {
  await fetch(SUB_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    redirect: "follow",
    body: JSON.stringify({ token: SUB_TOKEN, action: "mark-sent", ids: sent }),
  }).catch((e) => console.error("could not record the send:", e.message));
}

console.log(`\ndone: ${sent.length} sent, ${emails.length - sent.length} failed`);
if (sent.length < emails.length) process.exit(1);
