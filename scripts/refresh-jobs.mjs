/**
 * Refreshes live job counts using free, public applicant-tracking-system APIs.
 * No key, no auth, no Apify credits — these endpoints are open by design because
 * companies want their job boards indexed.
 *
 *   node scripts/refresh-jobs.mjs           # update data/companies.json
 *   node scripts/refresh-jobs.mjs --dry     # report only, write nothing
 *
 * Coverage is partial. Measured hit rate on this dataset is ~6% (4 of 70
 * sampled): AlphaSense, Anaplan, Atlys and Attentive.ai. Most Indian startups
 * run careers on Naukri, Keka, Darwinbox or a bespoke page rather than a
 * US-style ATS, so this is a supplement, not the main refresh path.
 *
 * A miss means "we couldn't check", not "not hiring", so a company's existing
 * count is left alone rather than zeroed.
 *
 * To refresh ALL counts, re-run the LinkedIn pull instead (~$0.40 for 600 jobs,
 * which fits inside Apify's $5/month free allowance).
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");
const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"));

const NCR = /gurugram|gurgaon|noida|delhi|faridabad|ghaziabad|ncr/i;

/** Candidate board slugs to try for a company, best guess first. */
function slugsFor(c) {
  const fromName = c.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const fromDomain = c.domain?.split(".")[0]?.replace(/[^a-z0-9]/g, "");
  return [...new Set([fromDomain, fromName, c.slug.replace(/-/g, "")].filter(Boolean))];
}

const get = async (url) => {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "delhi-ncr-startup-map (+https://github.com/)" },
      signal: AbortSignal.timeout(12000),
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/** Each provider returns { total, ncr } or null when the board doesn't exist. */
const PROVIDERS = [
  {
    name: "greenhouse",
    async check(slug) {
      const j = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
      if (!j?.jobs) return null;
      return {
        total: j.jobs.length,
        ncr: j.jobs.filter((x) => NCR.test(x.location?.name ?? "")).length,
      };
    },
  },
  {
    name: "ashby",
    async check(slug) {
      const j = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
      if (!j?.jobs) return null;
      return {
        total: j.jobs.length,
        ncr: j.jobs.filter((x) => NCR.test(`${x.location ?? ""} ${x.address ?? ""}`)).length,
      };
    },
  },
  {
    name: "lever",
    async check(slug) {
      const j = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
      if (!Array.isArray(j)) return null;
      return {
        total: j.length,
        ncr: j.filter((x) => NCR.test(x.categories?.location ?? "")).length,
      };
    },
  },
];

let checked = 0, found = 0, updated = 0;
const hits = [];

for (const c of companies) {
  checked++;
  let best = null;
  outer: for (const slug of slugsFor(c)) {
    for (const p of PROVIDERS) {
      const r = await p.check(slug);
      if (r && r.total > 0) {
        best = { ...r, provider: p.name, slug };
        break outer;
      }
    }
  }
  if (!best) continue;

  found++;
  hits.push(`${c.name}: ${best.ncr} NCR / ${best.total} total (${best.provider}/${best.slug})`);
  // Only NCR roles count for this map; a board with none means not hiring here.
  if (best.ncr !== (c.openJobs ?? 0)) updated++;
  c.openJobs = best.ncr;
  c.hiring = best.ncr > 0;

  if (checked % 25 === 0) console.log(`  ...${checked}/${companies.length} checked, ${found} boards found`);
}

console.log(`\nchecked ${checked} companies, found ${found} live job boards, ${updated} counts changed`);
console.log(hits.slice(0, 40).join("\n"));

if (dry) {
  console.log("\n--dry: nothing written");
} else {
  writeFileSync(join(root, "data/companies.json"), JSON.stringify(companies, null, 2) + "\n");
  console.log("\nwrote data/companies.json");
}
