/**
 * Puts approved submissions on the board.
 *
 *   SUBSCRIBERS_URL=... SUBSCRIBERS_TOKEN=... node scripts/publish-submissions.mjs
 *   node scripts/publish-submissions.mjs --dry     # show what would publish
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 * The submit form has always promised "checked by hand · usually live within a
 * day". Nothing could keep that promise: a submission reached the `submissions`
 * sheet and stopped there, because the Apps Script had no way to read a row
 * back out and no script here looked for one. Every person who filled that form
 * was told a human would put their listing up, and nobody could.
 *
 * ── Approved means a human typed the word ─────────────────────────────────
 * Rows arrive as `pending`. This publishes only the ones whose status has been
 * changed to `approved` in the sheet, then marks them `published` so the next
 * run skips them. A board whose entire claim is that its listings are real
 * cannot let an open form write to itself.
 *
 * ── Why a separate file ───────────────────────────────────────────────────
 * Output goes to data/submitted.json rather than straight into companies.json
 * or open-jobs.json, both of which are rebuilt from scratch every morning —
 * anything written directly into them survives until 07:30 and no longer.
 * build-from-linkedin and build-jobs merge this file back in, the same way
 * they merge every other source.
 */
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

const URL_BASE = process.env.SUBSCRIBERS_URL;
const TOKEN = process.env.SUBSCRIBERS_TOKEN;
if (!URL_BASE || !TOKEN) {
  console.error("Missing SUBSCRIBERS_URL / SUBSCRIBERS_TOKEN — nothing to read.");
  process.exit(1);
}

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** Same city buckets the scraped pipeline uses, so pins land consistently. */
const CITY_OF = (s = "") =>
  /gurugram|gurgaon/i.test(s) ? "Gurugram"
  : /greater noida/i.test(s) ? "Greater Noida"
  : /noida/i.test(s) ? "Noida"
  : /faridabad/i.test(s) ? "Faridabad"
  : /ghaziabad|vaishali/i.test(s) ? "Ghaziabad"
  : /delhi/i.test(s) ? "Delhi"
  : "Gurugram";

/**
 * City-level coordinates, averaged from the companies whose addresses were
 * verified by hand. A submitted company gets `approx: true` and so draws as a
 * hollow pin — the map already says out loud which locations are guesses, and
 * a form cannot make one exact.
 */
const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"));
const anchors = {};
for (const c of companies) {
  if (c.approx || !c.lat) continue;
  const city = CITY_OF(c.address);
  (anchors[city] ??= []).push([c.lat, c.lng]);
}
for (const [city, pts] of Object.entries(anchors)) {
  anchors[city] = [
    pts.reduce((a, p) => a + p[0], 0) / pts.length,
    pts.reduce((a, p) => a + p[1], 0) / pts.length,
  ];
}

const get = async (params) => {
  const res = await fetch(`${URL_BASE}?${new URLSearchParams({ token: TOKEN, ...params })}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`read failed: HTTP ${res.status}`);
  return res.json();
};

const { submissions = [] } = await get({ want: "submissions" });
console.log(`${submissions.length} approved submission(s) waiting`);
if (!submissions.length) process.exit(0);

const outPath = join(root, "data/submitted.json");
const existing = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : [];
const seen = new Set(existing.map((e) => e.key));

const added = [];
const published = [];
const skipped = [];

for (const s of submissions) {
  const company = (s.company || "").trim();
  if (!company) {
    skipped.push(`row ${s.rowNumber}: no company name`);
    continue;
  }

  const isJob = (s.type || "").toLowerCase() === "job";
  const key = isJob ? `job:${slugify(company)}:${slugify(s.roleTitle || "")}` : `co:${slugify(company)}`;
  if (seen.has(key)) {
    // Already on the board. Still mark it, or it is re-read every single run.
    published.push(s.rowNumber);
    skipped.push(`row ${s.rowNumber}: already published`);
    continue;
  }

  const city = CITY_OF(`${s.location} ${company}`);
  const [lat, lng] = anchors[city] ?? anchors.Gurugram ?? [28.4595, 77.0266];

  if (isJob) {
    const applyUrl = (s.applyUrl || s.website || "").trim();
    if (!applyUrl) {
      skipped.push(`row ${s.rowNumber}: a job with no way to apply`);
      continue;
    }
    added.push({
      key,
      kind: "job",
      title: (s.roleTitle || "").trim() || `Open role at ${company}`,
      company,
      url: applyUrl,
      location: (s.location || "Delhi NCR").trim(),
      salary: (s.salary || "").trim() || undefined,
      // Recorded once. The board's dates are only worth anything because
      // nothing re-stamps them on the next build.
      postedAt: new Date().toISOString().slice(0, 10),
    });
  } else {
    added.push({
      key,
      kind: "company",
      slug: slugify(company),
      name: company,
      tagline: (s.oneLiner || "").trim() || `${company} — submitted by its team`,
      sector: (s.sector || "").trim() || "Other",
      stage: (s.stage || "").trim() || "Unknown",
      area: city,
      address: `${city}, Delhi NCR`,
      lat,
      lng,
      website: (s.website || "").trim() || undefined,
      careersUrl: (s.applyUrl || "").trim() || undefined,
      founded: /^\d{4}$/.test(s.founded || "") ? Number(s.founded) : undefined,
    });
  }
  published.push(s.rowNumber);
}

for (const line of skipped) console.log(`  skipped ${line}`);
console.log(`\n${added.length} to add:`);
for (const a of added) console.log(`  ${a.kind.padEnd(8)} ${a.name ?? a.company} — ${a.title ?? a.tagline}`);

if (DRY) {
  console.log("\n--dry: nothing written, nothing marked");
  process.exit(0);
}

writeFileSync(outPath, JSON.stringify([...existing, ...added], null, 2) + "\n");
console.log(`\nwrote data/submitted.json (${existing.length + added.length} total)`);

/**
 * Marked last, on purpose. If this run dies after writing the file but before
 * marking, the next run sees the rows again and the dedupe above catches them.
 * Marking first would lose a submission on any crash, and losing one is the
 * failure this whole script exists to fix.
 */
const res = await fetch(URL_BASE, {
  method: "POST",
  headers: { "content-type": "application/json" },
  redirect: "follow",
  body: JSON.stringify({ token: TOKEN, action: "mark-published", rows: published }),
});
const out = await res.json().catch(() => ({}));
console.log(out.ok ? `marked ${published.length} row(s) published` : `WARNING: could not mark rows — ${JSON.stringify(out)}`);
