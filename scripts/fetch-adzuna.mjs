/**
 * Pulls NCR jobs from Adzuna's public API. Free tier — register at
 * https://developer.adzuna.com to get an app id and key, then:
 *
 *   ADZUNA_APP_ID=xxx ADZUNA_APP_KEY=yyy node scripts/fetch-adzuna.mjs
 *
 * Adzuna aggregates from many Indian job boards, so it reaches postings that
 * never appear on LinkedIn. It also returns a salary range on a good share of
 * listings, which LinkedIn's board almost never does.
 *
 * Free tier is ~250 calls/day; each call returns up to 50 results, so a full
 * NCR sweep costs a handful of calls. Writes scripts/raw/adzuna.json.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "scripts/raw/adzuna.json");

const APP_ID = process.env.ADZUNA_APP_ID;
const APP_KEY = process.env.ADZUNA_APP_KEY;

if (!APP_ID || !APP_KEY) {
  console.error(
    "Missing ADZUNA_APP_ID / ADZUNA_APP_KEY.\n" +
      "Register free at https://developer.adzuna.com, then re-run:\n" +
      "  ADZUNA_APP_ID=xxx ADZUNA_APP_KEY=yyy node scripts/fetch-adzuna.mjs",
  );
  process.exit(1);
}

const CITIES = ["Gurgaon", "Noida", "Delhi", "Faridabad", "Ghaziabad"];
const PAGES = Number((process.argv.find((a) => a.startsWith("--pages=")) || "").split("=")[1] || 5);
const MAX_AGE_DAYS = 7;

const get = async (url) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (r.status === 429) {
        await new Promise((res) => setTimeout(res, 3000 * (i + 1)));
        continue;
      }
      if (!r.ok) {
        console.warn(`  HTTP ${r.status} on ${url.replace(APP_KEY, "***")}`);
        return null;
      }
      return await r.json();
    } catch {
      await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
    }
  }
  return null;
};

/** Adzuna gives min/max as numbers; render the range the way Indians read it. */
function salaryOf(j) {
  const fmt = (n) =>
    n >= 1e5 ? `${(n / 1e5).toFixed(1).replace(/\.0$/, "")} LPA` : `₹${Math.round(n / 1000)}k`;
  if (j.salary_min && j.salary_max && j.salary_min !== j.salary_max)
    return `${fmt(j.salary_min)} – ${fmt(j.salary_max)}`;
  const one = j.salary_max ?? j.salary_min;
  return one ? fmt(one) : undefined;
}

const all = new Map(
  existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).map((r) => [r.url, r]) : [],
);
const before = all.size;

for (const city of CITIES) {
  for (let p = 1; p <= PAGES; p++) {
    const url =
      `https://api.adzuna.com/v1/api/jobs/in/search/${p}` +
      `?app_id=${APP_ID}&app_key=${APP_KEY}` +
      `&results_per_page=50&where=${encodeURIComponent(city)}` +
      `&max_days_old=${MAX_AGE_DAYS}&content-type=application/json`;
    const d = await get(url);
    const results = d?.results ?? [];
    if (!results.length) break;

    for (const j of results) {
      all.set(j.redirect_url, {
        title: j.title?.replace(/<\/?[^>]+>/g, "").trim(),
        company: j.company?.display_name,
        location: j.location?.display_name,
        salary: salaryOf(j),
        contract: j.contract_time ?? j.contract_type ?? undefined,
        category: j.category?.label,
        postedAt: (j.created ?? "").slice(0, 10),
        url: j.redirect_url,
        source: "adzuna",
      });
    }
    console.log(`  ${city} p${p}: ${results.length} (total ${all.size})`);
    await new Promise((r) => setTimeout(r, 400));
  }
}

const rows = [...all.values()];
writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");
console.log(`\nwrote ${rows.length} listings (${rows.length - before} new)`);
console.log(`  with salary: ${rows.filter((r) => r.salary).length}`);
