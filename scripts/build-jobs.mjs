/**
 * Turns the raw LinkedIn job rows into data/jobs.json — a slug -> roles index
 * the company pages render directly, so a visitor sees the actual open roles
 * instead of being punted to a Google search.
 *
 *   node scripts/build-jobs.mjs
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// The classifier is TypeScript; run this script with `npx tsx` so it loads.
const { functionOf, seniorityOf, specialtyOf, isRemote } = await import(join(root, "lib/classify.ts"));
const jobs = JSON.parse(readFileSync(join(root, "scripts/raw/linkedin/jobs.json"), "utf8"));
const companies = JSON.parse(readFileSync(join(root, "data/companies.json"), "utf8"));

/**
 * Career-page roles come from two collectors: REST boards (fetch-ats-jobs.mjs)
 * and the JS-only boards that need a browser (fetch-spa-jobs.mjs).
 */
const atsJobs = {};
for (const f of ["scripts/raw/ats-jobs.json", "scripts/raw/spa-jobs.json"]) {
  const p = join(root, f);
  if (!existsSync(p)) continue;
  for (const [slug, list] of Object.entries(JSON.parse(readFileSync(p, "utf8")))) {
    atsJobs[slug] = [...(atsJobs[slug] ?? []), ...list];
  }
}

/**
 * Internshala listings split two ways. Where the employer is already a company
 * on the map, the role joins that company's page. The rest are overwhelmingly
 * tiny consultancies and one-person agencies — adding them as companies would
 * undo the tiering work, so they are kept aside for the standalone jobs board.
 */
const internshalaPath = join(root, "scripts/raw/internshala.json");
const internshala = existsSync(internshalaPath)
  ? JSON.parse(readFileSync(internshalaPath, "utf8"))
  : [];

const adzunaPath = join(root, "scripts/raw/adzuna.json");
const adzuna = existsSync(adzunaPath) ? JSON.parse(readFileSync(adzunaPath, "utf8")) : [];

const hrPostsPath = join(root, "scripts/raw/posts/hr-posts.json");
const hrPosts = existsSync(hrPostsPath) ? JSON.parse(readFileSync(hrPostsPath, "utf8")) : [];

/**
 * Roles people submitted and a human approved. Merged like any other source
 * rather than written into open-jobs.json directly, because that file is
 * rebuilt from scratch every morning and a direct write would last until 07:30.
 */
const submittedPath = join(root, "data/submitted.json");
const submitted = existsSync(submittedPath)
  ? JSON.parse(readFileSync(submittedPath, "utf8")).filter((s) => s.kind === "job")
  : [];

const careersPath = join(root, "scripts/raw/careers.json");
const careers = existsSync(careersPath)
  ? new Map(JSON.parse(readFileSync(careersPath, "utf8")).map((r) => [r.slug, r]))
  : new Map();

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

// Match on slug, since that's how the LinkedIn company name became a page.
const bySlug = new Map(companies.map((c) => [c.slug, c]));

/** "2 weeks ago" -> hours old. Used for sorting and for dating the posting. */
const ageRank = (s = "") => {
  const n = parseInt(s, 10) || 0;
  if (/hour|minute/i.test(s)) return n;
  if (/day/i.test(s)) return n * 24;
  if (/week/i.test(s)) return n * 24 * 7;
  if (/month/i.test(s)) return n * 24 * 30;
  return 1e6;
};

/**
 * The posting date, resolved on the day the row arrived.
 *
 * This used to convert the relative string here, at build time, and the
 * comment above it claimed that happened "once". It did not: the pool is
 * rolling and the build runs daily, so a row that said "3 hours ago" when
 * scraped was re-dated to three hours before *today*, every morning, forever.
 * A SITA apprenticeship scraped three days ago and since closed was still
 * being shown as posted today.
 *
 * fetch-linkedin now stamps postedAt when it first sees a row. This falls back
 * to the old behaviour only for rows stamped before that change, which is a
 * one-time migration: they get today's reading of their frozen string, the
 * same date the board is already showing, and age correctly from then on.
 */
const scrapedAt = Date.now();
const postedDate = (rel) => {
  const hours = ageRank(rel);
  if (hours >= 1e6) return undefined;
  return new Date(scrapedAt - hours * 36e5).toISOString().slice(0, 10);
};

/**
 * When each dateless role was first seen, so it can age.
 *
 * Career pages and Internshala carry no posting date, and the code stamped
 * both with `new Date()` — recomputed on every build, so 474 roles were
 * permanently "posted today" no matter how long they had been up. A visitor
 * filtering to the last 3 days saw roles from three weeks ago, all wearing a
 * NEW badge, which makes the whole date column untrustworthy.
 *
 * A role's URL is its identity here. Recorded once, kept across rebuilds, and
 * pruned to whatever is still on the board so the file cannot grow forever.
 */
const seenPath = join(root, "data/first-seen.json");
const firstSeen = existsSync(seenPath) ? JSON.parse(readFileSync(seenPath, "utf8")) : {};
const todayStamp = new Date().toISOString().slice(0, 10);
const seenToday = new Set();

/**
 * When we first saw a role, recorded for every source rather than only the
 * dateless ones.
 *
 * postedAt answers "when was this advertised". This answers "when did it show
 * up here", and they are different by design: the morning pull covers the last
 * 24 hours, so most of what arrives was posted yesterday. Counting the board's
 * freshness by postedAt made a run that added 694 roles report 57.
 */
/**
 * The `hint` is the source's own posting date, and it exists to stop the very
 * first run of this code claiming the entire board arrived today. A role
 * advertised three days ago was on the board three days ago; recording it now
 * for the first time does not make it new. So a role already older than today
 * is dated from when it was posted, and only something posted today can
 * legitimately be first seen today.
 *
 * After that first run the stored value wins and this never applies again.
 */
const seenOn = (url, hint) => {
  if (!url) return todayStamp;
  seenToday.add(url);
  return (firstSeen[url] ??= hint && hint < todayStamp ? hint : todayStamp);
};

/** The source's own date if it has one, else the day we first saw the role. */
const dateFor = (url, sourceDate) => sourceDate || seenOn(url, sourceDate);

const index = {};
let matched = 0;
for (const j of jobs) {
  const slug = slugify(j.companyName);
  if (!bySlug.has(slug)) continue;
  matched++;
  (index[slug] ??= []).push({
    title: j.jobTitle,
    url: j.jobUrl,
    location: (j.location || "").replace(/, India$/, ""),
    posted: j.postedTime || "",
    postedAt: j.postedAt ?? postedDate(j.postedTime),
    // Both are computed upstream and were being dropped here, which is how a
    // pipeline ends up knowing things its own pages cannot say. firstSeen is
    // when the role reached this board — the number a returning visitor
    // actually wants. checkedAt is when we last confirmed it was still open.
    firstSeen: j.firstSeen ?? seenOn(j.jobUrl, j.postedAt),
    checkedAt: j.checkedAt,
    type: j.contractType && j.contractType !== "Not Applicable" ? j.contractType : undefined,
    level: j.experienceLevel && j.experienceLevel !== "Not Applicable" ? j.experienceLevel : undefined,
    source: "linkedin",
  });
}

// Roles straight from the company's own board. These are more authoritative
// than LinkedIn, so they are added first and win the dedupe below.
let fromCareers = 0;
for (const [slug, list] of Object.entries(atsJobs)) {
  if (!bySlug.has(slug)) continue;
  fromCareers += list.length;
  // Career-page roles carry no date, so they age from when we first saw them.
  index[slug] = [
    ...list.map((j) => ({ ...j, posted: "", postedAt: dateFor(j.url, undefined), firstSeen: seenOn(j.url, undefined) })),
    ...(index[slug] ?? []),
  ];
}

/** Employer name -> company slug, ignoring the Pvt/Ltd/LLP noise. */
const stripSuffix = (n = "") =>
  n.replace(/\s*(pvt\.?|private|ltd\.?|limited|llp|inc\.?|technologies|solutions|india)\s*/gi, " ").trim();
const employerIndex = new Map(companies.map((c) => [slugify(stripSuffix(c.name)), c.slug]));

const standalone = [];

let adzunaMatched = 0;
for (const r of adzuna) {
  const role = {
    title: r.title,
    url: r.url,
    location: (r.location ?? "").replace(/, (Haryana|Uttar Pradesh|Delhi|India)$/, "") || "Delhi NCR",
    posted: "",
    postedAt: r.postedAt,
    firstSeen: seenOn(r.url, r.postedAt),
    salary: r.salary,
    type: r.contract === "full_time" ? "Full-time" : r.contract === "part_time" ? "Part-time" : undefined,
    source: "adzuna",
  };
  const slug = employerIndex.get(slugify(stripSuffix(r.company ?? "")));
  if (slug) {
    adzunaMatched++;
    (index[slug] ??= []).push(role);
  } else {
    standalone.push({ ...role, company: r.company });
  }
}

/**
 * Hiring posts written by people at companies on the map.
 *
 * The post itself is the destination, always. It used to prefer whatever
 * apply link the post contained, which sent people to a bare lnkd.in redirect
 * or a Google Form with no context — no company name, no salary, no idea what
 * they had clicked. The post has all of that plus the person who wrote it, and
 * it is the only page that can be trusted to still say what the role was.
 *
 * The apply route is still parsed and kept on the listing; it is just not the
 * link, because "read the post, then apply the way it asks" is the actual flow
 * for these.
 */
/**
 * The pool keys several roles from one post as postUrl#role-slug, so they do
 * not collapse into each other. That suffix is a private key and has no
 * business in a link someone clicks — strip it for the destination and keep
 * the full string as the listing's id.
 */
const withoutRoleKey = (u = "") => u.split("#")[0];

/**
 * When a hiring post was written, decoded from its own URL.
 *
 * A LinkedIn activity id is snowflake-shaped: the top 41 bits are milliseconds
 * since the epoch, so the post's creation time is sitting inside every
 * permalink. It resolves for 340 of 342 posts, costs nothing, and needs no
 * network call.
 *
 * It is preferred over the date the fetcher stored because that field has been
 * unreliable in exactly the way this replaces: when the actor nested its
 * timestamp, every post silently fell back to the day we happened to fetch it.
 * Checked against the pool, the id disagrees with the stored value by as much
 * as five days — and the id is the one that cannot be wrong, because the post
 * could not exist before its own identifier.
 */
const postDate = (url = "") => {
  const m = url.match(/activity-(\d+)/);
  if (!m) return undefined;
  const d = new Date(Number(BigInt(m[1]) >> 22n));
  const y = d.getUTCFullYear();
  return y >= 2024 && y <= 2030 ? d.toISOString().slice(0, 10) : undefined;
};

let hrMatched = 0;
for (const r of hrPosts) {
  if (!r.title) continue; // a post with no parseable role is not a listing
  const role = {
    id: r.postUrl,
    title: r.title,
    url: withoutRoleKey(r.postUrl) || r.applyUrl,
    location: r.location ?? "Delhi NCR",
    posted: "",
    // The permalink's own timestamp first, then whatever the fetcher stored,
    // then when we first saw it — never simply "today".
    postedAt: dateFor(r.postUrl, postDate(r.postUrl) ?? r.postedAt),
    firstSeen: seenOn(r.postUrl, postDate(r.postUrl)),
    salary: r.salary,
    applyUrl: r.applyUrl,
    applyEmail: r.email,
    source: "linkedin-post",
  };
  const slug = employerIndex.get(slugify(stripSuffix(r.company ?? "")));
  if (slug) {
    hrMatched++;
    (index[slug] ??= []).push(role);
  } else if (r.company) {
    standalone.push({ ...role, company: r.company });
  }
}

let submittedMatched = 0;
for (const r of submitted) {
  const role = {
    title: r.title,
    url: r.url,
    location: r.location,
    posted: "",
    // Stamped once when it was published; never recomputed here.
    postedAt: r.postedAt,
    salary: r.salary,
    source: "submitted",
  };
  const slug = employerIndex.get(slugify(stripSuffix(r.company ?? "")));
  if (slug) {
    submittedMatched++;
    (index[slug] ??= []).push(role);
  } else {
    standalone.push({ ...role, company: r.company });
  }
}

/**
 * Internshala's posting date, which it hides in plain sight.
 *
 * The listing carries no date field, so these roles were falling through to
 * "first seen today" — 375 of them, all wearing the same date, which is what
 * made a week-old board look like it was published this morning.
 *
 * The detail URL ends in the posting's Unix timestamp:
 *
 *   .../telecalling-internship-in-delhi-at-krishvanta-digi-private-limited1788019662
 *
 * It resolves for all 375, and the dates it gives span a month rather than
 * landing on today. Range-checked so a URL that happens to end in ten digits
 * for another reason cannot stamp a role with 1970 or 2087.
 */
const internshalaDate = (url = "") => {
  const m = url.match(/(\d{10})$/);
  if (!m) return undefined;
  const d = new Date(Number(m[1]) * 1000);
  const y = d.getUTCFullYear();
  return y >= 2024 && y <= 2030 ? d.toISOString().slice(0, 10) : undefined;
};

let internshalaMatched = 0;
for (const r of internshala) {
  const role = {
    title: r.title,
    url: r.url,
    location: r.location ?? "Delhi NCR",
    posted: r.posted ?? "",
    postedAt: dateFor(r.url, internshalaDate(r.url)),
    firstSeen: seenOn(r.url, internshalaDate(r.url)),
    salary: r.stipend,
    type: r.kind === "internship" ? "Internship" : "Full-time",
    source: "internshala",
  };
  const slug = employerIndex.get(slugify(stripSuffix(r.company ?? "")));
  if (slug) {
    internshalaMatched++;
    (index[slug] ??= []).push(role);
  } else {
    standalone.push({ ...role, company: r.company });
  }
}

for (const slug of Object.keys(index)) {
  // LinkedIn reposts the same role under several ids; collapse by title+location.
  const uniq = new Map();
  for (const j of index[slug]) {
    // Same role posted to both sources: keep the company's own listing.
    const k = j.title.toLowerCase().replace(/[^a-z0-9]/g, "");
    const prev = uniq.get(k);
    if (!prev) uniq.set(k, j);
    else if (prev.source === "linkedin" && j.source === "careers") uniq.set(k, j);
    else if (prev.source === j.source && ageRank(j.posted) < ageRank(prev.posted)) uniq.set(k, j);
  }
  index[slug] = [...uniq.values()]
    .map((j) => {
      const fn = functionOf(j.title);
      const remote = isRemote(j.title, j.location) || undefined;
      return { ...j, fn, specialty: specialtyOf(j.title, fn), level: seniorityOf(j.title, j.level), remote };
    })
    .sort(
      (a, b) =>
        (a.source === "careers" ? 0 : 1) - (b.source === "careers" ? 0 : 1) ||
        ageRank(a.posted) - ageRank(b.posted),
    );
}

// Keep openJobs honest: it should equal what the page actually lists.
for (const c of companies) {
  const n = index[c.slug]?.length ?? 0;
  c.openJobs = n || undefined;
  c.hiring = n > 0;
  const found = careers.get(c.slug);
  if (found?.careers) c.careersUrl = found.careers;
}
writeFileSync(join(root, "data/companies.json"), JSON.stringify(companies, null, 2) + "\n");
writeFileSync(join(root, "data/jobs.json"), JSON.stringify(index, null, 2) + "\n");
/**
 * Standalone roles get classified too.
 *
 * They were written straight through, so 1,919 of the board's 4,125 roles --
 * every listing whose employer is not on the map -- carried no function and no
 * seniority. The field and level filters could not reach them, and each one
 * rendered as "Other". They are half the board; they were invisible to every
 * filter on it.
 */
const classifiedStandalone = standalone.map((j) => {
  const fn = functionOf(j.title);
  const remote = isRemote(j.title, j.location) || undefined;
      return { ...j, fn, specialty: specialtyOf(j.title, fn), level: seniorityOf(j.title, j.level), remote };
});
writeFileSync(join(root, "data/open-jobs.json"), JSON.stringify(classifiedStandalone, null, 2) + "\n");

// Keep only what is still listed, so this does not accumulate every URL the
// board has ever carried.
writeFileSync(
  seenPath,
  JSON.stringify(
    Object.fromEntries(Object.entries(firstSeen).filter(([url]) => seenToday.has(url))),
    null,
    2,
  ) + "\n",
);

const roles = Object.values(index).flat();
console.log(`LinkedIn jobs matched: ${matched} of ${jobs.length}`);
console.log(`careers-page roles added: ${fromCareers}`);
if (hrPosts.length) console.log(`hiring posts: ${hrPosts.length} in pool, ${hrMatched} matched to a company`);
if (submitted.length)
  console.log(`submitted roles: ${submitted.length} (${submittedMatched} matched to a company)`);
console.log(`after dedupe: ${roles.length} roles across ${Object.keys(index).length} companies`);
console.log(`  from company careers pages: ${roles.filter((r) => r.source === "careers").length}`);
console.log(`  from LinkedIn: ${roles.filter((r) => r.source === "linkedin").length}`);
console.log(`companies with a real careers link: ${companies.filter((c) => c.careersUrl).length}`);
console.log(`adzuna: ${adzunaMatched} matched to a company`);
console.log(`internshala: ${internshalaMatched} matched to a company`);
console.log(`standalone (no company page): ${standalone.length}`);
console.log(`  with a stipend/salary: ${[...roles, ...standalone].filter((r) => r.salary).length}`);
const fnCounts = roles.reduce((a, r) => ((a[r.fn] = (a[r.fn] ?? 0) + 1), a), {});
console.log(`roles by function: ${JSON.stringify(fnCounts)}`);
