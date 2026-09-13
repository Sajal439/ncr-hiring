/**
 * Visits each company's own website to find (a) its real careers page and
 * (b) which applicant-tracking system it uses, if any. Both are free — just
 * HTTP fetches, no API keys, no Apify credits.
 *
 *   node scripts/discover-careers.mjs
 *
 * Writes scripts/raw/careers.json. The ATS hit lets fetch-ats-jobs.mjs pull
 * structured roles straight from the company's own board; the careers URL is
 * the fallback, so a company page links to the real thing instead of a Google
 * search.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "scripts/raw/careers.json");

/**
 * Board slugs appear in raw HTML but often escaped — \u002F inside JSON blobs,
 * %2F inside query strings — so the page text is normalised before matching.
 * Patterns that end in a path segment (greenhouse embed, workable apply) must
 * capture the segment, not the generic host label.
 */
const ATS = [
  ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/embed\/job_board\?for=([a-z0-9_-]+)/i],
  ["greenhouse", /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([a-z0-9_-]+)/i],
  ["lever", /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_-]+)/i],
  ["ashby", /jobs\.ashbyhq\.com\/([a-z0-9_-]+)/i],
  ["workable", /apply\.workable\.com\/([a-z0-9_-]+)/i],
  ["workable", /([a-z0-9_-]+)\.workable\.com/i],
  ["recruitee", /([a-z0-9_-]+)\.recruitee\.com/i],
  ["smartrecruiters", /careers\.smartrecruiters\.com\/([a-zA-Z0-9_-]+)/i],
  ["keka", /([a-z0-9_-]+)\.keka\.com\/careers/i],
  ["darwinbox", /([a-z0-9_-]+)\.darwinbox\.(?:in|com)/i],
  ["zohorecruit", /([a-z0-9_-]+)\.zohorecruit\.(?:in|com)/i],
  ["freshteam", /([a-z0-9_-]+)\.freshteam\.com/i],
  ["teamtailor", /([a-z0-9_-]+)\.teamtailor\.com/i],
];

/** Generic hosts and path prefixes that are never a company's board slug. */
const NOT_A_SLUG = /^(embed|apply|www|cdn|static|assets|jobs|careers?|job_board|api|app|my|in|us|eu|help|support|blog|docs|media|images?)$/i;

const CAREER_LINK = /href=["']([^"']*(?:careers?|jobs|join-us|work-with-us|we-are-hiring|life-at)[^"']*)["']/gi;

const get = async (url) => {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(9000),
      redirect: "follow",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

async function discover(c) {
  const base = `https://${c.domain}`;
  let ats = null;
  let careers = null;

  for (const path of ["", "/careers", "/jobs", "/career", "/careers/"]) {
    const raw = await get(base + path);
    if (!raw) continue;
    // Unescape JSON (\u002F) and URL (%2F) encoded slashes so board URLs
    // embedded in inline scripts match the same patterns as plain hrefs.
    const html = raw.replace(/\\u002[fF]/g, "/").replace(/%2[fF]/g, "/");

    for (const [name, re] of ATS) {
      const m = html.match(re);
      if (!m) continue;
      const slug = m[1];
      // Skip generic hosts, and a slug that is just the company's own domain.
      if (NOT_A_SLUG.test(slug)) continue;
      if (c.domain.startsWith(slug)) continue;
      ats = { provider: name, slug };
      break;
    }

    if (!careers) {
      if (path === "") {
        const link = [...html.matchAll(CAREER_LINK)][0]?.[1];
        if (link) {
          try {
            careers = new URL(link, base).href;
          } catch {}
        }
      } else {
        careers = base + path;
      }
    }
    if (ats) break;
  }
  return { slug: c.slug, domain: c.domain, ats, careers };
}

/**
 * Worker pool over many different hosts, so 20 at once is fine.
 *
 * Each task is raced against a hard deadline: without it a single socket that
 * never settles leaves the top-level await pending and Node exits with code 13
 * *before* the results are written, losing the entire crawl.
 */
async function pool(items, n, fn, onTick) {
  const out = [];
  let i = 0;
  const guard = (p, ms) =>
    Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);

  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        try {
          out[idx] = await guard(fn(items[idx]), 60000);
        } catch {
          out[idx] = null;
        }
        onTick?.(idx);
      }
    }),
  );
  return out;
}

const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"))
  .filter((c) => c.domain);

// Resume support: this takes a while, so don't redo work on a re-run.
const existing = existsSync(outPath)
  ? new Map(JSON.parse(readFileSync(outPath, "utf8")).map((r) => [r.slug, r]))
  : new Map();
const todo = companies.filter((c) => !existing.has(c.slug));

console.log(`${companies.length} with a domain, ${todo.length} still to check`);

// Checkpoint as we go, so an interrupted crawl keeps its progress and the
// next run skips what is already saved.
const collected = new Map(existing);
const save = () => writeFileSync(outPath, JSON.stringify([...collected.values()], null, 2) + "\n");

let done = 0;
const results = await pool(todo, 20, async (c) => {
  const r = await discover(c);
  if (r) collected.set(r.slug, r);
  return r;
}, () => {
  if (++done % 50 === 0) {
    console.log(`  ...${done}/${todo.length}`);
    save();
  }
});

for (const r of results.filter(Boolean)) collected.set(r.slug, r);
save();
const all = [...collected.values()];

const withAts = all.filter((r) => r.ats).length;
const withCareers = all.filter((r) => r.careers).length;
console.log(`\nATS boards found:   ${withAts}/${all.length}`);
console.log(`careers pages found: ${withCareers}/${all.length}`);
const byProvider = all.filter((r) => r.ats).reduce((a, r) => ((a[r.ats.provider] = (a[r.ats.provider] ?? 0) + 1), a), {});
console.log(`by provider: ${JSON.stringify(byProvider)}`);
