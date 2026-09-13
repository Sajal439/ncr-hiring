/**
 * Verifies every listed role is still open, and drops the ones that aren't.
 *
 *   node scripts/validate-jobs.mjs          # check + prune
 *   node scripts/validate-jobs.mjs --dry    # report only
 *
 * This is what makes the board worth returning to. Without it, filled roles sit
 * on the site forever and a visitor who clicks two dead links stops coming back.
 *
 * ── It prunes the pool, not the built file ────────────────────────────────
 * This used to edit data/jobs.json. In the daily workflow that file is
 * regenerated from scripts/raw/linkedin/jobs.json four steps later, so every
 * closed role this script removed was put straight back the same morning, and
 * every checkedAt stamp was discarded — which also meant the "least recently
 * verified first" ordering always started from scratch and the same rows were
 * re-checked every day.
 *
 * The rolling pool is the durable store, so that is what gets pruned. A role
 * removed here stays removed.
 *
 * Free: LinkedIn's public job pages say "no longer accepting applications" once
 * a role closes, and 404 once it is removed. Career-page roles are re-fetched
 * from the company's own board each run, so they self-correct and are skipped.
 *
 * Also expires anything older than MAX_AGE_DAYS regardless — LinkedIn keeps
 * stale postings up, and a four-month-old listing is noise even if the page
 * still loads.
 *
 * Only a slice is checked per run. Verifying all 1,900 roles daily took 11
 * minutes and LinkedIn rate-limited 57% of them into "unknown"; checking the
 * least-recently-verified BATCH_SIZE instead finishes in minutes, gets a much
 * better hit rate at the gentler pace, and still covers everything every few
 * days. Override with --all for a full sweep.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dry = process.argv.includes("--dry");
const all = process.argv.includes("--all");
const MAX_AGE_DAYS = 45;
const BATCH_SIZE = Number(
  (process.argv.find((a) => a.startsWith("--batch=")) || "").split("=")[1] || 400,
);

const poolPath = join(root, "scripts/raw/linkedin/jobs.json");
const pool = JSON.parse(readFileSync(poolPath, "utf8"));

const CLOSED =
  /no longer accepting applications|this job is no longer available|job is closed|position has been filled/i;

/**
 * LinkedIn embeds JobPosting structured data on a live posting and stops
 * emitting it once the role closes. That is the signal that actually works.
 *
 * The text above was the only test before, and it was checked against the
 * logged-out page — where it never appears. "No longer accepting applications"
 * is rendered for signed-in visitors only. A SITA apprenticeship that had been
 * closed for days returned 200, showed no such text, and was recorded as open;
 * across a nine-page sample the phrase matched nothing at all, including the
 * one role that was definitely shut.
 *
 * Absence of the schema is a structural fact about the page rather than a
 * string in it, so it survives copy changes — and on that sample it separated
 * the closed role from the eight open ones cleanly.
 */
const LIVE_SCHEMA = /"JobPosting"/;

/**
 * The real posting date, which LinkedIn has been publishing all along.
 *
 * Every date on this board was an inference before this: LinkedIn's listing
 * feed gives a relative string ("2 weeks ago") frozen at scrape time, and two
 * rounds of fixes here were about stopping that string being re-read against
 * the wrong day. All of it was working around a number the job page states
 * outright in its JobPosting schema — and this script already downloads that
 * page to check whether the role is open, so the date costs nothing.
 *
 * Measured on one row: the pool had inferred 2026-08-22, the page said
 * 2026-08-18. Four days, on a board that sells freshness and offers a
 * three-day filter.
 *
 * validThrough is the same gift: an expiry the employer set, rather than our
 * blanket 45 days.
 */
const DATE_POSTED = /"datePosted"\s*:\s*"(\d{4}-\d{2}-\d{2})/;
const VALID_THROUGH = /"validThrough"\s*:\s*"(\d{4}-\d{2}-\d{2})/;

const check = async (url) => {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetch(url, {
        redirect: "follow",
        signal: AbortSignal.timeout(15000),
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        },
      });
      if (r.status === 404 || r.status === 410) return { status: "gone" };
      if (r.status === 429 || r.status >= 500) {
        await new Promise((res) => setTimeout(res, 2000 * (i + 1)));
        continue;
      }
      if (!r.ok) return { status: "unknown" };
      const html = await r.text();
      if (CLOSED.test(html)) return { status: "closed" };
      if (!LIVE_SCHEMA.test(html)) return { status: "closed" };

      const postedAt = html.match(DATE_POSTED)?.[1];
      const validThrough = html.match(VALID_THROUGH)?.[1];
      // An expiry the employer set beats our blanket 45 days.
      if (validThrough && validThrough < new Date().toISOString().slice(0, 10))
        return { status: "closed", postedAt };
      return { status: "open", postedAt, validThrough };
    } catch {
      await new Promise((res) => setTimeout(res, 1000 * (i + 1)));
    }
  }
  // A network failure is not evidence a role is gone — keep it.
  return { status: "unknown" };
};

async function pool_(items, n, fn, onTick) {
  const out = [];
  let i = 0;
  const guard = (p, ms) =>
    Promise.race([p, new Promise((r) => setTimeout(() => r({ status: "unknown" }), ms))]);
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await guard(fn(items[idx]), 40000);
        onTick?.();
      }
    }),
  );
  return out;
}

/**
 * Freeze the posting date on any row that predates fetch-linkedin doing it.
 *
 * fetch-linkedin only stamps rows it touches, and it only touches what comes
 * back from that morning's scrape — so a row already in the pool and no longer
 * being returned would never get a date, and would keep being re-dated to look
 * fresh forever. That is the whole bug, surviving in the rows most likely to
 * be stale.
 *
 * This runs daily and costs nothing, and it sees every row. The date it writes
 * is today's reading of the row's frozen relative string, which is the date the
 * board is already showing — so nothing jumps, and from tomorrow it ages.
 */
const hoursOld = (str = "") => {
  const n = parseInt(str, 10) || 0;
  if (/hour|minute/i.test(str)) return n;
  if (/day/i.test(str)) return n * 24;
  if (/week/i.test(str)) return n * 24 * 7;
  if (/month/i.test(str)) return n * 24 * 30;
  return null;
};
let backfilled = 0;
for (const j of pool) {
  if (j.postedAt) continue;
  const h = hoursOld(j.postedTime);
  if (h === null) continue;
  j.postedAt = new Date(Date.now() - h * 36e5).toISOString().slice(0, 10);
  backfilled++;
}
if (backfilled) console.log(`froze a posting date on ${backfilled} rows that had none`);

const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
const candidates = [];
let expired = 0;
let undated = 0;

for (const j of pool) {
  if (j.postedAt && new Date(j.postedAt).getTime() < cutoff) {
    j._drop = "expired";
    expired++;
  } else if (!j.postedAt) {
    // Stamped before fetch-linkedin froze the date. It will get one on the
    // next build; until then it cannot be aged, only checked.
    undated++;
    candidates.push(j);
  } else {
    candidates.push(j);
  }
}

// Never-checked roles first, then whichever was verified longest ago.
candidates.sort(
  (a, b) => (a.checkedAt ? Date.parse(a.checkedAt) : 0) - (b.checkedAt ? Date.parse(b.checkedAt) : 0),
);
const toCheck = all ? candidates : candidates.slice(0, BATCH_SIZE);

console.log(`pool: ${pool.length} rows, ${undated} without a posting date yet`);
console.log(`${expired} past ${MAX_AGE_DAYS} days — expiring`);
console.log(
  `${toCheck.length} of ${candidates.length} to verify this run` +
    (all ? " (--all)" : ` (batch ${BATCH_SIZE})`),
);

let done = 0;
const results = await pool_(toCheck, 10, (j) => check(j.jobUrl), () => {
  if (++done % 100 === 0) console.log(`  ...${done}/${toCheck.length}`);
});

const tally = { open: 0, closed: 0, gone: 0, unknown: 0 };
const now = new Date().toISOString();
let corrected = 0;
toCheck.forEach((j, i) => {
  const { status = "unknown", postedAt } = results[i] ?? {};
  tally[status]++;
  if (status === "closed" || status === "gone") j._drop = status;

  // The page's own date replaces whatever we inferred. This is the only place
  // in the pipeline that knows the truth rather than a guess.
  if (postedAt && postedAt !== j.postedAt) {
    j.postedAt = postedAt;
    corrected++;
  }

  // Only a definitive answer counts as "checked", so a rate-limited role gets
  // retried on the next run instead of waiting for its turn to come round again.
  if (status !== "unknown") j.checkedAt = now;
});

console.log(`\nverified: ${JSON.stringify(tally)}`);
if (corrected) console.log(`corrected the posting date on ${corrected} rows`);

const live = pool.filter((j) => !j._drop).map(({ _drop, ...rest }) => rest);
const kept = live.length;
const dropped = pool.length - kept;

if (!dry) writeFileSync(poolPath, JSON.stringify(live, null, 2) + "\n");

console.log(`kept ${kept}, dropped ${dropped} (${expired} expired, ${tally.closed} closed, ${tally.gone} removed)`);

if (dry) {
  console.log("\n--dry: nothing written");
} else {
  // Only the pool is written. companies.json and data/jobs.json are outputs of
  // build-jobs, which runs after this and will reflect the pruning on its own —
  // writing them here is what made the removals look like they had happened
  // when they had not.
  console.log(`\nwrote ${poolPath.replace(root + "/", "")}`);
}
