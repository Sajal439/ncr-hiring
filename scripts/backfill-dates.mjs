/**
 * Recovers the true posting date of every LinkedIn row, from git history.
 *
 *   node scripts/backfill-dates.mjs --dry
 *
 * ── Why this is possible at all ───────────────────────────────────────────
 * LinkedIn's listing feed gives a relative age — "2 weeks ago" — and the job
 * pool is rolling, so that string sits in the file long after it stopped being
 * true. Every attempt to fix the dates so far has been an attempt to read that
 * string against the right day, and each one guessed at which day that was.
 *
 * The right day is not a guess. The pool is committed on every refresh, so the
 * first commit containing a given jobUrl is the day we scraped it, and the
 * string was accurate on that day. scrapeDate − relativeAge is the real
 * posting date, exactly, computed offline and for free.
 *
 * ── It defers to anything better ──────────────────────────────────────────
 * validate-jobs reads `datePosted` straight out of LinkedIn's JobPosting
 * schema, which is the employer's own number rather than a reconstruction.
 * Rows it has confirmed carry a `checkedAt`, and this script leaves those
 * alone. It fills the gap for everything LinkedIn rate-limited — which, at
 * roughly half of every run, is most of the pool for days.
 */
import { writeFileSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");
const POOL = "scripts/raw/linkedin/jobs.json";

const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });

/** Oldest commit first, so the first sighting of a URL wins. */
const commits = git("log", "--format=%H %ad", "--date=short", "--reverse", "--", POOL)
  .trim().split("\n").filter(Boolean)
  .map((l) => { const [hash, date] = l.split(" "); return { hash, date }; });

console.log(`${commits.length} commits of the pool, ${commits[0]?.date} to ${commits.at(-1)?.date}`);

/** jobUrl -> the date we first saw it. */
const firstSeen = new Map();
for (const { hash, date } of commits) {
  let rows;
  try {
    rows = JSON.parse(git("show", `${hash}:${POOL}`));
  } catch {
    continue; // file did not exist at that commit
  }
  for (const r of rows) if (r.jobUrl && !firstSeen.has(r.jobUrl)) firstSeen.set(r.jobUrl, date);
}
console.log(`${firstSeen.size} distinct roles across that history`);

/** "2 weeks ago" -> hours. Null when the string says nothing usable. */
const hoursOld = (s = "") => {
  const n = parseInt(s, 10) || 0;
  if (/hour|minute/i.test(s)) return n;
  if (/day/i.test(s)) return n * 24;
  if (/week/i.test(s)) return n * 24 * 7;
  if (/month/i.test(s)) return n * 24 * 30;
  return null;
};

const pool = JSON.parse(readFileSync(join(root, POOL), "utf8"));
let fixed = 0, verified = 0, unknown = 0, unchanged = 0;
const examples = [];

for (const j of pool) {
  // A date read from the job page itself always wins.
  if (j.checkedAt) { verified++; continue; }

  const seen = firstSeen.get(j.jobUrl);
  const hours = hoursOld(j.postedTime);
  if (!seen || hours === null) { unknown++; continue; }

  const real = new Date(`${seen}T12:00:00Z`);
  real.setUTCHours(real.getUTCHours() - hours);
  const stamp = real.toISOString().slice(0, 10);

  if (stamp === j.postedAt) { unchanged++; continue; }
  if (examples.length < 6)
    examples.push(`  ${j.postedAt} -> ${stamp}  (${j.postedTime}, seen ${seen})  ${String(j.jobTitle).slice(0, 34)}`);
  j.postedAt = stamp;
  fixed++;
}

console.log(`\ncorrected ${fixed}`);
console.log(`left alone ${verified} already verified against the job page`);
console.log(`already right ${unchanged}, no usable age string ${unknown}`);
if (examples.length) console.log(`\n${examples.join("\n")}`);

if (DRY) {
  console.log("\n--dry: nothing written");
} else {
  writeFileSync(join(root, POOL), JSON.stringify(pool, null, 2) + "\n");
  console.log(`\nwrote ${POOL}`);
}
