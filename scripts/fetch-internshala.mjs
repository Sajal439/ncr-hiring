/**
 * Scrapes Internshala for NCR internships and jobs. Free — plain HTTP, no key,
 * no Apify credit.
 *
 *   node scripts/fetch-internshala.mjs
 *   node scripts/fetch-internshala.mjs --pages=8
 *
 * Worth having because Internshala is where Indian internships actually get
 * posted, and unlike LinkedIn's jobs board it publishes the **stipend** — which
 * is the single most useful field for the student audience and one neither the
 * Bangalore map nor LinkedIn gives us.
 *
 * Writes scripts/raw/internshala.json.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "scripts/raw/internshala.json");
const pages = Number((process.argv.find((a) => a.startsWith("--pages=")) || "").split("=")[1] || 5);

// Internshala paginates per city+type. These cover the NCR footprint.
const FEEDS = [
  ["internship", "internship-in-delhi"],
  ["internship", "internship-in-gurgaon"],
  ["internship", "internship-in-noida"],
  ["job", "jobs-in-delhi"],
  ["job", "jobs-in-gurgaon"],
  ["job", "jobs-in-noida"],
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const get = async (url) => {
  for (let i = 0; i < 3; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": UA } });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 1500 * (i + 1)));
        continue;
      }
      if (!r.ok) return null;
      return await r.text();
    } catch {
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
  return null;
};

const text = (s = "") =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

const grab = (html, re) => {
  const m = html.match(re);
  return m ? text(m[1]) : undefined;
};

/**
 * Each listing is one `individual_internship` div. Splitting on the opening tag
 * keeps every field of a listing inside its own chunk.
 */
function parseCards(html, kind) {
  return html
    .split(/<div class="container-fluid individual_internship/)
    .slice(1)
    .map((c) => {
      const href = grab(c, /data-href='([^']+)'/);
      if (!href) return null;
      const stipend = grab(c, /class='stipend'>([^<]+)</);
      return {
        kind,
        title: grab(c, /class="job-title-href"[^>]*>([^<]+)</),
        company: grab(c, /class="company-name">\s*([^<]+)</),
        // The wrapper class differs between internships and jobs, but both put
        // the city links right after a map-pin icon — anchor on that instead.
        location: (() => {
          const i = c.indexOf("ic-16-map-pin");
          if (i < 0) return undefined;
          const names = [...c.slice(i, i + 500).matchAll(/<a[^>]*>([^<]{2,40})<\/a>/g)]
            .map((m) => text(m[1]))
            .filter((x) => x && !/^\d/.test(x));
          return names.length ? [...new Set(names)].join(", ") : undefined;
        })(),
        // "₹ 5,000 - 8,000 /month" — keep as written, it is already readable.
        stipend: stipend && /\d/.test(stipend) ? stipend : undefined,
        duration: grab(c, /(\d+\s+Month[s]?)/),
        posted: grab(c, /class="status-[a-z-]*"[^>]*>([^<]+)</),
        url: "https://internshala.com" + href,
        actively_hiring: /actively-hiring-badge/.test(c),
      };
    })
    .filter(Boolean);
}

const NCR = /delhi|gurgaon|gurugram|noida|faridabad|ghaziabad/i;

const all = new Map(
  existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")).map((r) => [r.url, r]) : [],
);
const before = all.size;

for (const [kind, path] of FEEDS) {
  for (let p = 1; p <= pages; p++) {
    const url = p === 1
      ? `https://internshala.com/${kind}s/${path}/`
      : `https://internshala.com/${kind}s/${path}/page-${p}/`;
    const html = await get(url);
    if (!html) break;
    const cards = parseCards(html, kind);
    if (!cards.length) break;
    for (const c of cards) {
      // Listings tagged "multiple locations" often include cities far outside NCR.
      if (c.location && !NCR.test(c.location)) continue;
      all.set(c.url, c);
    }
    console.log(`  ${path} p${p}: ${cards.length} cards (total ${all.size})`);
    await new Promise((r) => setTimeout(r, 700)); // be polite
  }
}

const rows = [...all.values()];
writeFileSync(outPath, JSON.stringify(rows, null, 2) + "\n");
console.log(`\nwrote ${rows.length} listings (${rows.length - before} new) to scripts/raw/internshala.json`);
console.log(`  with stipend: ${rows.filter((r) => r.stipend).length}`);
console.log(`  internships: ${rows.filter((r) => r.kind === "internship").length}, jobs: ${rows.filter((r) => r.kind === "job").length}`);
