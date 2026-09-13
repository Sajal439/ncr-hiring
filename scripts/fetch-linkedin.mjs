/**
 * Pulls the last 24 hours of NCR job postings from LinkedIn via the Apify API.
 *
 *   APIFY_TOKEN=xxx node scripts/fetch-linkedin.mjs
 *   APIFY_TOKEN=xxx node scripts/fetch-linkedin.mjs --days=30 --budget=2.00
 *
 * This is the only paid step in the pipeline. A 24-hour delta is ~700 jobs at
 * $0.0007 each — roughly $0.49/day — versus $1.82 to re-scrape the full 30 days,
 * which would just re-download listings we already hold.
 *
 * A hard spend cap is always sent, so a bad run can never quietly drain credit.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "scripts/raw/linkedin");

// Trimmed, because a secret pasted with a trailing newline is indistinguishable
// from a dead one in the API's reply — both come back as a bare 401.
const TOKEN = (process.env.APIFY_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) {
  console.error(
    "Missing APIFY_TOKEN.\n" +
      "Get it at console.apify.com → Settings → API tokens, then:\n" +
      "  APIFY_TOKEN=xxx node scripts/fetch-linkedin.mjs",
  );
  process.exit(1);
}

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] ?? d;
const days = Number(arg("days", 1));
const budget = Number(arg("budget", 0.9));

const ACTOR = "cheap_scraper~linkedin-job-scraper";
const PERIOD = days <= 1 ? "r86400" : days <= 7 ? "r604800" : "r2592000";

const input = {
  // Broad enough to reach most functions without paying for heavy overlap.
  keyword: ["Engineer", "Manager", "Analyst", "Designer", "Sales", "Intern", "Developer", "Executive"],
  locations: [
    "Gurugram, Haryana, India",
    "Noida, Uttar Pradesh, India",
    "New Delhi, Delhi, India",
  ],
  publishedAt: PERIOD,
  maxItems: Math.floor(budget / 0.0007),
  enrichCompanyData: true,
  excludeRecruitingAgencies: true,
  saveOnlyUniqueItems: true,
};

const api = (path, init) =>
  fetch(`https://api.apify.com/v2/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init?.headers },
  });

console.log(`starting run: last ${days}d, spend cap $${budget.toFixed(2)}, max ${input.maxItems} items`);

const start = await api(
  `acts/${ACTOR}/runs?maxTotalChargeUsd=${budget}`,
  { method: "POST", body: JSON.stringify(input) },
);
if (!start.ok) {
  console.error(`failed to start run: HTTP ${start.status} ${await start.text()}`);
  if (start.status === 401) {
    console.error(
      `\nThe token Apify saw was ${TOKEN.length} chars and ` +
        `${TOKEN.startsWith("apify_api_") ? "had" : "did NOT have"} the expected apify_api_ prefix.\n` +
        "Run `node scripts/check-apify.mjs` with the same environment for a full diagnosis.",
    );
  }
  process.exit(1);
}
const { data: run } = await start.json();
console.log(`run ${run.id} started`);

// Poll rather than using waitForFinish, so progress is visible in CI logs.
let status = run.status;
let info = run;
const deadline = Date.now() + 25 * 60_000;
while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(status)) {
  if (Date.now() > deadline) {
    console.error("run exceeded 25 minutes; aborting wait (the run itself continues)");
    break;
  }
  await new Promise((r) => setTimeout(r, 15_000));
  const res = await api(`actor-runs/${run.id}`);
  if (!res.ok) continue;
  ({ data: info } = await res.json());
  status = info.status;
  console.log(`  ${status} — ${info.stats?.computeUnits?.toFixed(3) ?? "?"} CU`);
}

const datasetId = info.defaultDatasetId;
if (!datasetId) {
  console.error("no dataset produced");
  process.exit(1);
}

const res = await api(`datasets/${datasetId}/items?clean=true&format=json`);
const items = await res.json();
console.log(`\nfetched ${items.length} job rows`);

mkdirSync(outDir, { recursive: true });

/* ---------- jobs: append to the rolling job pool ---------- */

/**
 * "2 weeks ago" -> an absolute date, resolved once, on the day we first see
 * the row.
 *
 * This has to happen here rather than at build time, and that distinction was
 * silently costing the board its central promise. LinkedIn's age string is
 * relative to the scrape, and the pool is rolling — so a row scraped in July
 * still says "2 weeks ago" in September. Resolving it during the daily build
 * meant every old row was re-dated to two weeks before *today*, every morning,
 * forever. Nothing could age: the oldest date on a 4,551-row pool was 28 days,
 * not because old roles were dropped but because none was allowed to get old.
 *
 * Resolved on arrival and never touched again, the date is what it claims to
 * be, and the 30-day expiry downstream starts working for the first time.
 */
const hoursOld = (s = "") => {
  const n = parseInt(s, 10) || 0;
  if (/hour|minute/i.test(s)) return n;
  if (/day/i.test(s)) return n * 24;
  if (/week/i.test(s)) return n * 24 * 7;
  if (/month/i.test(s)) return n * 24 * 30;
  return null;
};
const today = new Date().toISOString().slice(0, 10);
const absoluteDate = (rel) => {
  const h = hoursOld(rel);
  return h === null ? undefined : new Date(Date.now() - h * 36e5).toISOString().slice(0, 10);
};

const jobsPath = join(outDir, "jobs.json");
const jobs = new Map(
  (existsSync(jobsPath) ? JSON.parse(readFileSync(jobsPath, "utf8")) : []).map((j) => [j.jobUrl, j]),
);
const beforeJobs = jobs.size;
for (const r of items) {
  if (!r.jobUrl) continue;
  const prev = jobs.get(r.jobUrl);
  jobs.set(r.jobUrl, {
    companyName: r.companyName,
    jobTitle: r.jobTitle,
    jobUrl: r.jobUrl,
    location: r.location,
    postedTime: r.postedTime,
    contractType: r.contractType,
    experienceLevel: r.experienceLevel,
    // Both stamped on first sight only. A role we have seen before keeps the
    // date it had; re-stamping is exactly the bug this replaces.
    postedAt: prev?.postedAt ?? absoluteDate(r.postedTime),
    firstSeen: prev?.firstSeen ?? today,
    // Carried through so validate-jobs' work is not thrown away by the next
    // rebuild, which is what happened while it lived on the built file.
    ...(prev?.checkedAt ? { checkedAt: prev.checkedAt } : {}),
  });
}
writeFileSync(jobsPath, JSON.stringify([...jobs.values()], null, 2) + "\n");
console.log(`jobs: ${jobs.size} total (${jobs.size - beforeJobs} new)`);

/* ---------- companies: newly seen employers join the map ---------- */
const stamp = new Date().toISOString().slice(0, 10);
const compPath = join(outDir, `companies-${stamp}.json`);
const byName = new Map(
  (existsSync(compPath) ? JSON.parse(readFileSync(compPath, "utf8")) : []).map((c) => [c.companyName, c]),
);
for (const r of items) {
  if (!r.companyName) continue;
  const prev = byName.get(r.companyName);
  byName.set(r.companyName, {
    companyName: r.companyName,
    location: r.location,
    companyWebsite: r.companyWebsite,
    companyIndustry: r.companyIndustry,
    companyEmployeeCount: r.companyEmployeeCount,
    companyFoundedDate: r.companyFoundedDate,
    dynamicFilterMatch: r.dynamicFilterMatch,
    jobs: (prev?.jobs ?? 0) + 1,
  });
}
writeFileSync(compPath, JSON.stringify([...byName.values()], null, 2) + "\n");

const descPath = join(outDir, `descriptions-${stamp}.json`);
const descs = new Map();
for (const r of items) {
  if (r.companyDescription && !descs.has(r.companyName))
    descs.set(r.companyName, { name: r.companyName, d: r.companyDescription, s: r.companySpecialties ?? "" });
}
writeFileSync(descPath, JSON.stringify([...descs.values()], null, 2) + "\n");

console.log(`companies: ${byName.size} seen, ${descs.size} with descriptions`);
console.log(`\nnext: node scripts/build-from-linkedin.mjs && npx tsx scripts/build-jobs.mjs`);
