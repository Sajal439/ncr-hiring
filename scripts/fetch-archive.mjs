/**
 * Crawls the archives of Entrackr and Inc42 to build funding history for the
 * companies on the map. Free — no keys, no credits.
 *
 *   node scripts/fetch-archive.mjs --days=900
 *
 * Entrackr publishes one sitemap per day (3,000+ of them) listing that day's
 * article URLs; the headline is recoverable from the slug, which is enough to
 * extract the company, amount and round without fetching every article.
 * Inc42 leaves the WordPress REST API open, so its posts paginate directly.
 *
 * Writes scripts/raw/archive.json — a flat list of {title, url, date, source}.
 */
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "scripts/raw/archive.json");
const days = Number((process.argv.find((a) => a.startsWith("--days=")) || "").split("=")[1] || 900);

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Both sites rate-limit, so a single failure is usually transient. */
const get = async (url, json = false, tries = 3) => {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(20000), headers: { "User-Agent": UA } });
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 1200 * (i + 1)));
        continue;
      }
      if (!r.ok) return null;
      return json ? await r.json() : await r.text();
    } catch {
      await new Promise((res) => setTimeout(res, 800 * (i + 1)));
    }
  }
  return null;
};

async function pool(items, n, fn, onTick) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
        onTick?.();
      }
    }),
  );
  return out.flat().filter(Boolean);
}

/** "startup-x-raises-rs-50-cr-in-series-a" -> "Startup X Raises Rs 50 Cr In Series A" */
const titleFromSlug = (url) => {
  const slug = url.replace(/\/$/, "").split("/").pop() ?? "";
  return slug
    .replace(/-\d{6,}$/, "")           // trailing article id
    .split("-")
    .map((w) => (w.length > 2 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
};

console.log("fetching Entrackr sitemap index...");
const index = await get("https://entrackr.com/sitemap.xml");
const dayMaps = [...(index ?? "").matchAll(/<loc>(https:\/\/entrackr\.com\/sitemap_[\d-]+\.xml)<\/loc>/g)]
  .map((m) => m[1])
  .slice(0, days);
console.log(`  ${dayMaps.length} daily sitemaps to crawl`);

/**
 * Checkpoint as we go. A long crawl that only writes at the end loses
 * everything if the process is killed, and a resumable one can be re-run
 * safely after an interruption.
 */
const done = new Map(
  existsSync(outPath)
    ? JSON.parse(readFileSync(outPath, "utf8")).map((a) => [a.url, a])
    : [],
);
const crawledDays = new Set([...done.values()].map((a) => a.date).filter(Boolean));
const remaining = dayMaps.filter((u) => !crawledDays.has((u.match(/(\d{4}-\d{2}-\d{2})/) || [])[1]));
console.log(`  ${done.size} already saved, ${remaining.length} sitemaps left`);

const save = () => {
  writeFileSync(outPath, JSON.stringify([...done.values()], null, 2) + "\n");
};

let ticks = 0;
const entrackr = await pool(remaining, 6, async (u) => {
  const xml = await get(u);
  if (!xml) return [];
  const date = (u.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] ?? "";
  return [...xml.matchAll(/<loc>(https:\/\/entrackr\.com\/[^<]+)<\/loc>/g)]
    .map((m) => m[1])
    .filter((link) => !/\/sitemap|\/category\/|\/tag\/|\/author\//.test(link))
    .map((link) => ({ title: titleFromSlug(link), url: link, date, source: "Entrackr" }));
}, () => {
  if (++ticks % 100 === 0) {
    console.log(`  ...${ticks}/${remaining.length} sitemaps`);
    save();
  }
});
for (const a of entrackr) done.set(a.url, a);
save();

console.log(`  Entrackr: ${entrackr.length} articles`);

console.log("fetching Inc42 via WordPress API...");
// No shared stop flag: a transient failure on one page must not abort the rest.
// WordPress 400s past the last page, which `get` turns into null harmlessly.
const pages = Array.from({ length: 120 }, (_, i) => i + 1);
const inc42 = await pool(pages, 4, async (p) => {
  const d = await get(`https://inc42.com/wp-json/wp/v2/posts?per_page=100&page=${p}&_fields=title,link,date`, true);
  if (!Array.isArray(d) || !d.length) return [];
  return d.map((x) => ({
    title: String(x.title?.rendered ?? "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&"),
    url: x.link,
    date: (x.date ?? "").slice(0, 10),
    source: "Inc42",
  }));
});
console.log(`  Inc42: ${inc42.length} articles`);

for (const a of inc42) done.set(a.url, a);
save();
console.log(`\nwrote ${done.size} unique articles to scripts/raw/archive.json`);
