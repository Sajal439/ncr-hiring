/**
 * Pulls "we're hiring" text posts off LinkedIn — the ones a person writes in
 * their feed, which never become a LinkedIn job listing and so never reach the
 * board any other way.
 *
 *   APIFY_TOKEN=xxx node scripts/fetch-hr-posts.mjs
 *   APIFY_TOKEN=xxx node scripts/fetch-hr-posts.mjs --budget=0.30 --since=week
 *   APIFY_TOKEN=xxx node scripts/fetch-hr-posts.mjs --dry-run   # cost estimate only
 *
 * ── Why this searches the whole city, not a list of companies ──────────────
 * The first version filtered by `authorsCompanies`, built from the companies
 * already on the map. It was cheap and it was pointless: a company that is not
 * on the map cannot be in the filter, so the pass could only ever refresh
 * companies the LinkedIn job scraper already covers. The one post that started
 * this — a Scaleup.io role someone saw in their feed — could never have been
 * found that way, because Scaleup.io is not on the map. That is the entire
 * reason to read hiring posts.
 *
 * So the search is now the city itself, and the filtering happens in
 * screenHrPost after the posts arrive. That costs more per useful post — a
 * broad query pays $0.002 for agency noise it then throws away — and it is the
 * only shape that can find a company nobody has mapped yet.
 *
 * `--mode=map` still exists for a cheap targeted refresh of known companies,
 * but it is no longer the default and no longer the scheduled job.
 *
 * ── What comes out ────────────────────────────────────────────────────────
 * Two things. Roles, merged into the board by build-jobs. And, more valuable,
 * `candidates.json`: employers that appear in a kept post and are not on the
 * map — companies hiring in NCR that the pipeline has never seen. Nothing else
 * in this repo grows the map.
 */
import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { screenHrPost, rolesIn } = await import(join(root, "lib/hrpost.ts"));

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || "").split("=")[1] ?? d;
const DRY = process.argv.includes("--dry-run");
const MAX_COMPANIES = Number(arg("companies", 200));
const BUDGET = Number(arg("budget", 0.4));
const SINCE = arg("since", "week");
const MODE = arg("mode", "discover"); // "discover" = the whole city, "map" = mapped companies only
/** Each search page holds 100 posts. Page 1 only is how a post four hours old
 *  gets pushed out of reach on a busy query. */
const PAGES = Number(arg("pages", 2));
const INDUSTRIES = (arg("industries", "") || "").split(",").filter(Boolean).map(Number);

/**
 * Headline signals for someone hiring into their own company. Deliberately not
 * "talent acquisition" or "recruiter" — those are the headlines this is trying
 * to avoid.
 */
/** The actor rejects more than 20 names in authorsCompanies, so the mapped
 *  pass runs in batches and the budget is divided between them. */
const COMPANIES_PER_RUN = 20;

/**
 * An empty query costs $0.001 and a post costs $0.002, so extra queries are
 * nearly free next to the posts they surface. People write the city a dozen
 * ways and the actor matches text, not geography — "Gurgaon" and "Gurugram"
 * return different posts from the same offices.
 */
const NCR_QUERIES = [
  "hiring Gurgaon",
  "hiring Gurugram",
  "hiring Noida",
  "hiring Delhi NCR",
  "we are hiring Delhi",
  "we're hiring Gurugram",
  "job opening Noida",
  "urgently hiring Gurgaon",
];

/**
 * Opt-in via --authors=inhouse. It was on by default and it was cutting off
 * the search's best source: most hiring posts are written by the company's own
 * HR, not its founder, and "Talent Acquisition" is not in this list. With
 * screenHrPost now separating in-house recruiters from agency ones by their
 * apply route, narrowing the author up front costs more coverage than it saves
 * in noise.
 */
const IN_HOUSE_KEYWORDS = "founder, co-founder, ceo, cto, hiring manager, people ops, head of people";
const NARROW_AUTHORS = arg("authors", "") === "inhouse";

const TOKEN = (process.env.APIFY_TOKEN ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN && !DRY) {
  console.error("Missing APIFY_TOKEN. Run with --dry-run to see the cost estimate without it.");
  process.exit(1);
}

/**
 * Companies whose employees are worth listening to: startup-tier, and already
 * known to be hiring. A company with no open roles is unlikely to have someone
 * posting about one, and every name added is a name that can bill.
 */
const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"));
const names = companies
  .filter((c) => c.tier !== "company" && c.hiring)
  .sort((a, b) => (b.openJobs ?? 0) - (a.openJobs ?? 0))
  .slice(0, MAX_COMPANIES)
  .map((c) => c.name);

/** Everything already mapped, for deciding what counts as a new employer. */
const known = new Set(companies.map((c) => c.name.toLowerCase().replace(/[^a-z0-9]/g, "")));

console.log(
  MODE === "discover"
    ? `discovery pass: ${NCR_QUERIES.length} city queries${NARROW_AUTHORS ? ", in-house authors only" : ""}, window: last ${SINCE}`
    : `${names.length} mapped companies (startup-tier, hiring), window: last ${SINCE}`,
);

if (DRY) {
  // The actor bills $0.002 a post and $0.001 for a query that returns nothing.
  // The second number is the one that surprises people: most companies will
  // have no hiring post in any given week.
  // In map mode each company name is a query that can come back empty; in
  // discovery mode there are only the three city queries.
  const queries = MODE === "discover" ? NCR_QUERIES.length : names.length;
  const floor = queries * 0.001;
  console.log(`\nposts cost $0.002 each; a query with no results still costs $0.001`);
  console.log(`queries this run: ${queries}`);
  console.log(`empty-query floor if none of them return a post: $${floor.toFixed(2)}`);
  console.log(`spend cap sent to Apify: $${BUDGET.toFixed(2)}`);
  console.log(`\nworst case this run: ~$${Math.min(floor + BUDGET, BUDGET).toFixed(2)}`);
  console.log("dry run: nothing fetched");
  process.exit(0);
}

const ACTOR = "harvestapi~linkedin-post-search";

const api = (path, init) =>
  fetch(`https://api.apify.com/v2/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json", ...init?.headers },
  });

/** One actor run, start to dataset. Returns the items it produced. */
async function runOnce(input, budget, label) {
  const start = await api(`acts/${ACTOR}/runs?maxTotalChargeUsd=${budget}`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!start.ok) {
    console.error(`${label}: failed to start — HTTP ${start.status} ${await start.text()}`);
    if (start.status === 401) console.error("Run `node scripts/check-apify.mjs` for a full diagnosis.");
    return { items: [], spent: 0 };
  }
  const { data: run } = await start.json();

  let info = run;
  const deadline = Date.now() + 12 * 60_000;
  while (!["SUCCEEDED", "FAILED", "ABORTED", "TIMED-OUT"].includes(info.status)) {
    if (Date.now() > deadline) {
      console.error(`${label}: still running after 12 minutes; moving on`);
      break;
    }
    await new Promise((r) => setTimeout(r, 10_000));
    const res = await api(`actor-runs/${run.id}`);
    if (!res.ok) continue;
    ({ data: info } = await res.json());
  }

  if (!info.defaultDatasetId) return { items: [], spent: info.usageTotalUsd ?? 0 };
  const res = await api(`datasets/${info.defaultDatasetId}/items?clean=true&format=json`);
  const items = res.ok ? await res.json() : [];
  const spent = info.usageTotalUsd ?? 0;
  console.log(`  ${label}: ${items.length} posts, $${spent.toFixed(4)}`);
  return { items, spent };
}


const batches =
  MODE === "discover"
    ? [null]
    : Array.from({ length: Math.ceil(names.length / COMPANIES_PER_RUN) }, (_, i) =>
        names.slice(i * COMPANIES_PER_RUN, (i + 1) * COMPANIES_PER_RUN),
      );

const perRun = BUDGET / batches.length;
console.log(`${batches.length} run(s), $${perRun.toFixed(3)} each\n`);

const items = [];
let spent = 0;
for (const [i, batch] of batches.entries()) {
  const input = {
    // Measured: with a bare "hiring" query, 25 of 50 returned posts were
    // rejected as not-NCR. authorsCompanies filters on where the *author*
    // works, not where the role is, so an NCR company's Bangalore opening
    // comes back and is paid for. The city goes in the query for both modes.
    searchQueries: NCR_QUERIES,
    ...(MODE === "discover"
      ? {
          ...(NARROW_AUTHORS ? { authorKeywords: IN_HOUSE_KEYWORDS } : {}),
          ...(INDUSTRIES.length ? { authorsIndustryId: INDUSTRIES } : {}),
        }
      : { authorsCompanies: batch }),
    postedLimit: SINCE,
    sortBy: "date",
    // Per the actor's schema this is per *search query*, not per run. It was
    // being set to the whole run's post budget, which let the first query eat
    // everything and leave "hiring Gurugram" — the query that would have found
    // the Scalup.io post — never executed. Divide by the query count so every
    // city gets a share.
    maxPosts: Math.max(1, Math.floor(perRun / 0.002 / NCR_QUERIES.length)),
    scrapePages: PAGES,
    // 82% of posts in the sample carried an email, phone or link in the body.
    // Comments cost the same $0.002 each to recover the rest.
    scrapeComments: false,
    scrapeReactions: false,
  };
  const label = MODE === "discover" ? "discovery" : `batch ${i + 1}/${batches.length}`;
  const out = await runOnce(input, perRun, label);
  items.push(...out.items);
  spent += out.spent;
}

console.log(`\nfetched ${items.length} posts, spent $${spent.toFixed(4)}`);

/**
 * The actor's post item has no company field — only the author's name and
 * headline. Asking for one means `profileScraperMode: "main"`, billed as a
 * second $0.002 event per post, which doubles the cost of the whole pass.
 *
 * So the employer is recovered from what the post already contains, free.
 * Measured on the 120-post sample:
 *
 *   headline "… at Tensech"           23 / 120  (19%)
 *   corporate email domain            61 / 120  (51%)
 *
 * The headline was the only signal used at first, and it is the weaker one by
 * a wide margin — Indian LinkedIn headlines are keyword walls ("HR Recruiter |
 * Talent Acquisition | Screening & Hiring") far more often than "Role at
 * Company". The apply email is the better source precisely because a hiring
 * post has to carry a way to apply, and that address is usually at the
 * employer's own domain.
 *
 * This matters more than a percentage: a post with no employer can neither
 * match a mapped company nor become a candidate, so it is dropped entirely
 * downstream. Before this, every post in the pool had a blank company and the
 * whole pass was contributing nothing to the site.
 */

/** Mail hosts, not employers. An address here says nothing about who is hiring. */
const MAILBOX_DOMAIN =
  /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton(mail)?|zoho(mail)?|rediff(mail)?|mail|email|inbox|yandex)\./i;

/** Link shorteners and form hosts — the destination, never the employer. */
const NOT_AN_EMPLOYER_HOST =
  /(lnkd\.in|linkedin\.com|bit\.ly|tinyurl|forms?\.gle|docs\.google|typeform|lever\.co|greenhouse\.io|ashbyhq|workable|keka|darwinbox|smartrecruiters|naukri|indeed|internshala|wellfound|angel\.co|notion\.(so|site)|airtable)/i;

/** "hr-hyre.com" -> "Hyre"; "tensech.com" -> "Tensech". */
function nameFromDomain(domain) {
  const base = domain
    .replace(/^(www|mail|careers?|jobs?|apply|hr|recruit(ing|ment)?)[-.]/i, "")
    .split(".")[0]
    .replace(/[-_]+/g, " ")
    .trim();
  if (base.length < 3 || base.length > 30) return "";
  return base.replace(/\b[a-z]/g, (m) => m.toUpperCase());
}

function companyFromHeadline(headline = "") {
  const m =
    headline.match(/\bat\s+([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/) ??
    headline.match(/@\s*([A-Z][\w&.'-]*(?:\s+[A-Z][\w&.'-]*){0,3})/);
  return m ? m[1].trim().replace(/\s+(Pvt|Ltd|Inc)\.?$/i, "").replace(/[.,;:'"-]+$/, "") : "";
}

/**
 * Best guess at who is actually hiring, cheapest reliable signal first.
 * Returns "" when nothing in the post identifies an employer, which is an
 * honest answer — inventing a name from a keyword-wall headline would put a
 * company on the map that never said it was hiring.
 */
/**
 * LinkedIn builds a post's URL from whoever posted it:
 *
 *   /posts/bharat-batuk-private-limited_hiring-activity-7501952326493143040-VN1L
 *   /posts/ayush-saxena-8947771a7_were-hiring-activity-...
 *
 * When a company page posts, that slug is the company — and a company page is
 * exactly the author whose headline field comes back empty, so it is the one
 * case with no other signal. Personal profiles are excluded by their trailing
 * id hash, which company slugs do not carry.
 */
function companyFromPostUrl(url = "") {
  const slug = url.match(/\/posts\/([^_?/]+)_/)?.[1];
  if (!slug) return "";
  if (/-[0-9a-f]{6,}$/i.test(slug) || /\d{4,}$/.test(slug)) return ""; // a person
  const words = slug.split("-").filter((w) => !/^(pvt|private|limited|ltd|inc|llp)$/i.test(w));
  if (!words.length || words.length > 5) return "";
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function employerOf(headline, parsed, postUrl = "") {
  const fromHeadline = companyFromHeadline(headline);
  if (fromHeadline) return fromHeadline;

  const domain = (parsed.email ?? "").split("@")[1];
  if (domain && !MAILBOX_DOMAIN.test(domain) && !NOT_AN_EMPLOYER_HOST.test(domain)) {
    const name = nameFromDomain(domain);
    if (name) return name;
  }

  const fromUrl = companyFromPostUrl(postUrl);
  if (fromUrl) return fromUrl;

  if (parsed.applyUrl && !NOT_AN_EMPLOYER_HOST.test(parsed.applyUrl)) {
    try {
      const name = nameFromDomain(new URL(parsed.applyUrl).hostname);
      if (name) return name;
    } catch {
      /* not a parseable URL; no employer from it */
    }
  }
  return "";
}

const outDirEarly = join(root, "scripts/raw/posts");
mkdirSync(outDirEarly, { recursive: true });

/**
 * The actor returns the author either flattened ("author.name") or nested
 * ({author: {name}}), and which one varies between runs. Reading only the flat
 * key silently produced a diagnostic log with no authors at all — and, worse,
 * verdicts computed from an empty headline, so the agency check never fired.
 * One accessor, used everywhere.
 */
const authorName = (p) => p["author.name"] ?? p.author?.name ?? "";
const authorHeadline = (p) => p["author.info"] ?? p.author?.info ?? "";

/**
 * When the post was actually written.
 *
 * Same flat-or-nested split as the author fields, and it was missed when those
 * were fixed — so every post fell through to `new Date()` and 336 of them were
 * stamped with the day we happened to fetch them. A hiring post written last
 * Tuesday then showed up on the board as posted today, which is the one thing
 * this board is not supposed to do.
 */
const postedDate = (p) => {
  const ts = p["postedAt.timestamp"] ?? p.postedAt?.timestamp;
  return ts ? new Date(ts).toISOString().slice(0, 10) : undefined;
};

/** Stable per-role suffix for the pool key. */
const slugRole = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);

/* ---------- screen ---------- */
const reasons = {};
const kept = [];
for (const p of items) {
  const text = p.content ?? p.text ?? "";
  const author = authorHeadline(p);
  const verdict = screenHrPost(text, author, "");
  if (!verdict.keep) {
    reasons[verdict.reason] = (reasons[verdict.reason] ?? 0) + 1;
    continue;
  }
  const base = {
    ...verdict.parsed,
    company: employerOf(author, verdict.parsed, p.linkedinUrl ?? p.url ?? ""),
    author: authorName(p),
    postUrl: p.linkedinUrl ?? p.url,
    // No date rather than today's date: build-jobs falls back to when we first
    // saw the row, which is at least honest about being an approximation.
    postedAt: postedDate(p),
  };

  // One post often advertises four openings. Emit each as its own listing,
  // suffixing the key so the pool's postUrl dedupe does not collapse them.
  const roles = rolesIn(text);
  if (roles.length) {
    for (const title of roles) kept.push({ ...base, title, postUrl: `${base.postUrl}#${slugRole(title)}` });
  } else {
    kept.push(base);
  }
}
/**
 * Every post this run touched, with the verdict. Without it "why is X not on
 * the board?" is unanswerable — the pool holds only what survived, so a miss
 * looks identical whether the post was never fetched or was fetched and
 * rejected. Small enough to keep in git, and it is the only record of what the
 * spend actually bought.
 */
writeFileSync(
  join(outDirEarly, "last-run.json"),
  JSON.stringify(
    items.map((p) => {
      const text = p.content ?? p.text ?? "";
      const v = screenHrPost(text, authorHeadline(p), "");
      return {
        postUrl: p.linkedinUrl ?? p.url,
        author: authorName(p),
        headline: authorHeadline(p).slice(0, 90),
        verdict: v.keep ? "kept" : v.reason,
        text: text.replace(/\s+/g, " ").slice(0, 180),
      };
    }),
    null,
    2,
  ) + "\n",
);

console.log(`kept ${kept.length} listings from ${items.length - Object.values(reasons).reduce((a, b) => a + b, 0)} posts, rejected ${Object.values(reasons).reduce((a, b) => a + b, 0)}`);
for (const [r, n] of Object.entries(reasons).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)} ${r}`);
}

/* ---------- merge into a rolling pool, keyed by post URL ---------- */
const outDir = join(root, "scripts/raw/posts");
mkdirSync(outDir, { recursive: true });
const poolPath = join(outDir, "hr-posts.json");
const pool = new Map(
  (existsSync(poolPath) ? JSON.parse(readFileSync(poolPath, "utf8")) : []).map((p) => [p.postUrl, p]),
);
const before = pool.size;
for (const k of kept) if (k.postUrl) pool.set(k.postUrl, k);

// A hiring post goes stale like any other listing; 30 days matches what
// validate-jobs.mjs enforces for the rest of the board.
const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
const fresh = [...pool.values()].filter((p) => (p.postedAt ?? "") >= cutoff);

writeFileSync(poolPath, JSON.stringify(fresh, null, 2) + "\n");
console.log(`\npool: ${fresh.length} posts (${pool.size - before} new, ${pool.size - fresh.length} aged out)`);

/* ---------- employers nobody has mapped yet ---------- */
const candPath = join(outDir, "candidates.json");
const cand = new Map(
  (existsSync(candPath) ? JSON.parse(readFileSync(candPath, "utf8")) : []).map((c) => [c.key, c]),
);
let newNames = 0;
for (const k of kept) {
  const name = (k.company ?? "").trim();
  if (!name) continue;
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!key || known.has(key)) continue;
  const prev = cand.get(key);
  cand.set(key, {
    key,
    name,
    seen: (prev?.seen ?? 0) + 1,
    lastSeen: k.postedAt,
    example: prev?.example ?? k.postUrl,
  });
  if (!prev) newNames++;
}
writeFileSync(candPath, JSON.stringify([...cand.values()].sort((a, b) => b.seen - a.seen), null, 2) + "\n");
console.log(`unmapped employers: ${cand.size} known (${newNames} first seen this run) -> ${candPath.replace(root + "/", "")}`);
console.log(`spent: $${spent.toFixed(4)}`);
