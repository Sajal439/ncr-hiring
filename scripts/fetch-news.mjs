/**
 * Pulls startup news from public RSS feeds and attaches funding facts to the
 * companies on the map. Free — plain RSS, no keys.
 *
 *   node scripts/fetch-news.mjs
 *
 * Two outputs:
 *   data/news.json     the headline feed for the homepage panel
 *   data/funding.json  slug -> most recent funding fact, shown on company pages
 *
 * This gives *recent rounds*, not lifetime totals. Crunchbase and Tracxn both
 * block scraping and Wikipedia covers only ~4% of these companies, so a live
 * feed of what actually just happened is the honest thing we can offer.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"));

const FEEDS = [
  { name: "Entrackr", url: "https://entrackr.com/rss" },
  { name: "Inc42", url: "https://inc42.com/feed/" },
];

/**
 * The RSS feeds only carry ~2 weeks. scripts/raw/archive.json holds the crawled
 * back-catalogue (see fetch-archive.mjs) and is folded in when present, which is
 * what turns a snapshot into actual funding history.
 */
const archivePath = join(root, "scripts/raw/archive.json");
const archive = existsSync(archivePath) ? JSON.parse(readFileSync(archivePath, "utf8")) : [];

const get = async (url) => {
  try {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" },
    });
    return r.ok ? await r.text() : null;
  } catch {
    return null;
  }
};

const unescape = (s) =>
  s.replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
   .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
   .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").trim();

function parseFeed(xml, source) {
  return [...xml.matchAll(/<item>(.*?)<\/item>/gs)].map((m) => {
    const item = m[1];
    const pick = (tag) => unescape((item.match(new RegExp(`<${tag}[^>]*>(.*?)</${tag}>`, "s")) || [])[1] ?? "");
    return { title: pick("title"), url: pick("link"), date: pick("pubDate"), source };
  }).filter((i) => i.title && i.url);
}

/** "Rs 99 Cr", "$60 Mn", "$2.5 Mn" -> a normalised display string. */
function amountIn(title) {
  const m =
    title.match(/(?:Rs\.?|INR|₹)\s?([\d,]+(?:\.\d+)?)\s?(Cr|crore|Lakh|Bn|Mn)/i) ||
    title.match(/\$\s?([\d,]+(?:\.\d+)?)\s?(Bn|Mn|M\b|B\b)/i);
  if (!m) return undefined;
  const currency = /\$/.test(m[0]) ? "$" : "₹";
  // Slug-derived headlines lose case ("rs 727 cr"), so normalise the unit.
  const unit = m[2].replace(/^M$/i, "Mn").replace(/^B$/i, "Bn").replace(/^crore$/i, "Cr");
  const cased = unit.charAt(0).toUpperCase() + unit.slice(1).toLowerCase();
  return `${currency}${m[1]} ${cased}`;
}

const ROUND = /(pre[- ]?seed|seed|pre[- ]?Series\s?[A-J]|Series\s?[A-J]\+?|bridge|angel|IPO|debt)/i;

const items = [];
for (const f of FEEDS) {
  const xml = await get(f.url);
  if (!xml) {
    console.warn(`  ${f.name}: unreachable`);
    continue;
  }
  const parsed = parseFeed(xml, f.name);
  console.log(`  ${f.name}: ${parsed.length} items`);
  items.push(...parsed);
}

// Match headlines to companies by name. Longest names first so "Pine Labs"
// wins over a company literally called "Labs".
const named = companies
  .filter((c) => c.name.length >= 4)
  .sort((a, b) => b.name.length - a.name.length);

const funding = {};
const news = [];

/**
 * Names that are also ordinary English words produce false matches ("ahead"
 * matching a headline that merely uses the word). Require those to be capitalised
 * exactly as the company writes them.
 */
const AMBIGUOUS = /^(ahead|broadway|helium|octave|spice|circle|atlas|apex|bold|plum|loop|even|noon|tide|disco|prime|core|edge|arc|bee|dot|one|now|hike|mint|open|scale)$/i;

/** The company that raised is the subject; "led by X" names the investor. */
function subjectOf(title, name) {
  const i = title.toLowerCase().indexOf(name.toLowerCase());
  if (i < 0) return false;
  const before = title.slice(Math.max(0, i - 28), i).toLowerCase();
  if (/(led by|leads|backed by|from|investor|participation)/.test(before)) return false;
  // "Info Edge Ventures leads Rs 20 Cr round in X" — subject is the investor.
  const after = title.slice(i + name.length, i + name.length + 24).toLowerCase();
  if (/^\s*(leads|led|backs|invests|participates|to lead|joins)/.test(after)) return false;
  return true;
}

// Newest first, so the first funding hit for a company is its latest round and
// everything after it becomes that company's history.
const dated = (x) => new Date(x.date || 0).getTime();
const liveSet = new Set(items);
const corpus = [...items, ...archive].sort((a, b) => dated(b) - dated(a));

for (const it of corpus) {
  const hit = named.find((c) => {
    const n = c.name.replace(/\s*(pvt|private|ltd|limited|inc|llp|technologies|india)\.?\s*$/i, "").trim();
    if (n.length < 4) return false;
    const re = new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, AMBIGUOUS.test(n) ? "" : "i");
    return re.test(it.title) && subjectOf(it.title, n);
  });
  // Only the live feeds populate the homepage panel; the archive is history.
  // Only the live feeds fill the homepage panel; the archive is history.
  if (liveSet.has(it)) news.push({ ...it, company: hit?.slug });

  if (!hit) continue;
  const amount = amountIn(it.title);
  const round = (it.title.match(ROUND) || [])[1];
  const isFunding = /rais|funding|round|secures|bags|invest|led by/i.test(it.title);
  if (!isFunding || (!amount && !round)) continue;
  // Round labels also come through lowercase from slugs: "series a" -> "Series A".
  const label = round
    ? round.replace(/\b\w/g, (ch) => ch.toUpperCase()).replace(/\bIpo\b/, "IPO").replace(/Series ([a-j])/i, (_, l) => `Series ${l.toUpperCase()}`)
    : undefined;
  const entry = { amount, round: label, title: it.title, url: it.url, date: it.date, source: it.source };
  funding[hit.slug] ??= { ...entry, history: [] };
  const rec = funding[hit.slug];
  // Entrackr and Inc42 cover the same round, so collapse on amount+month
  // rather than URL — otherwise every round is listed twice.
  const key = (e) => `${(e.amount ?? "").replace(/[^\d]/g, "")}|${(e.date ?? "").slice(0, 7)}|${e.round ?? ""}`;
  const seenRounds = new Set([key(rec), ...rec.history.map(key)]);
  if (!seenRounds.has(key(entry)) && rec.history.length < 6) rec.history.push(entry);
}

writeFileSync(join(root, "data/news.json"), JSON.stringify(news.slice(0, 60), null, 2) + "\n");
writeFileSync(join(root, "data/funding.json"), JSON.stringify(funding, null, 2) + "\n");

console.log(`\ncorpus: ${items.length} live headlines + ${archive.length} archived articles`);
console.log(`${news.filter((n) => n.company).length} live headlines matched to a company`);
console.log(`${Object.keys(funding).length} companies got funding data`);
const withHistory = Object.values(funding).filter((f) => f.history.length).length;
console.log(`${withHistory} of those have more than one round on record`);
for (const [slug, f] of Object.entries(funding).slice(0, 25))
  console.log(`  ${slug}: ${[f.amount, f.round].filter(Boolean).join(" ")} (+${f.history.length} earlier)`);
