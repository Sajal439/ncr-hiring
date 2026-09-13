/**
 * Five-second preflight for APIFY_TOKEN. Costs nothing — it only reads.
 *
 *   APIFY_TOKEN=xxx node scripts/check-apify.mjs
 *
 * Exists because the daily refresh spent a week failing on a bare
 * `HTTP 401 user-or-token-not-found`, which says nothing about *why*. The
 * usual cause is invisible: a trailing newline picked up when the secret was
 * pasted. This reports the token's shape (never the token) before it reports
 * the API's answer, so a mis-paste is distinguishable from a dead token.
 */
const RAW = process.env.APIFY_TOKEN;
if (!RAW) {
  console.error("APIFY_TOKEN is not set in this environment.");
  process.exit(1);
}

const TOKEN = RAW.trim().replace(/^["']|["']$/g, "");
const ACTOR = "cheap_scraper~linkedin-job-scraper";

/* ---------- shape: what we hold, before asking Apify about it ---------- */
console.log("token shape");
console.log(`  length          ${RAW.length}${RAW.length === TOKEN.length ? "" : ` -> ${TOKEN.length} after trim`}`);
if (RAW !== TOKEN) {
  const junk = [
    RAW !== RAW.trim() && "surrounding whitespace",
    /^["']|["']$/.test(RAW.trim()) && "wrapping quotes",
    RAW.includes("\n") && "a newline",
  ].filter(Boolean);
  console.log(`  ⚠ stripped      ${junk.join(", ")} — the stored secret is malformed`);
}
console.log(`  prefix          ${TOKEN.startsWith("apify_api_") ? "apify_api_ ✓" : `${JSON.stringify(TOKEN.slice(0, 6))} — expected "apify_api_"`}`);
if (!/^[\w-]+$/.test(TOKEN)) console.log("  ⚠ characters    contains something outside [A-Za-z0-9_-]");

const api = (path) =>
  fetch(`https://api.apify.com/v2/${path}`, { headers: { Authorization: `Bearer ${TOKEN}` } });

/* ---------- identity ---------- */
const me = await api("users/me");
if (!me.ok) {
  console.error(`\n✗ Apify rejected the token: HTTP ${me.status}`);
  console.error(await me.text());
  console.error(
    "\nThe token is not valid for any account. Mint a fresh one at\n" +
      "console.apify.com -> Settings -> API & Integrations, then store it\n" +
      "without a trailing newline:\n" +
      '  printf %s "apify_api_..." | gh secret set APIFY_TOKEN',
  );
  process.exit(1);
}
const { data: user } = await me.json();
console.log(`\n✓ authenticated as ${user.username} (${user.plan?.id ?? "plan unknown"})`);

/* ---------- credit: a valid token still cannot run a drained account ---------- */
const limits = await api("users/me/limits");
if (limits.ok) {
  const { data } = await limits.json();
  const used = data.current?.monthlyUsageUsd;
  const cap = data.limits?.maxMonthlyUsageUsd;
  if (used != null) console.log(`  monthly usage   $${used.toFixed(2)}${cap != null ? ` of $${cap.toFixed(2)}` : ""}`);
}

/* ---------- the actor this pipeline actually needs ---------- */
const actor = await api(`acts/${ACTOR}`);
if (!actor.ok) {
  console.error(`\n✗ cannot reach ${ACTOR}: HTTP ${actor.status}`);
  process.exit(1);
}
const { data: act } = await actor.json();
console.log(`✓ actor reachable: ${act.username}/${act.name}${act.isDeprecated ? " (DEPRECATED)" : ""}`);
console.log("\nall good — fetch-linkedin.mjs should run.");
