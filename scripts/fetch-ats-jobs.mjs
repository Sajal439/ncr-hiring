/**
 * Pulls structured job listings from the ATS boards discovered by
 * discover-careers.mjs. Free — these endpoints are public because companies
 * want their boards indexed.
 *
 *   node scripts/fetch-ats-jobs.mjs
 *
 * Writes scripts/raw/ats-jobs.json, which build-jobs.mjs merges with the
 * LinkedIn rows. Each role carries a `source` so the page can label where it
 * came from.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const careers = JSON.parse(readFileSync(join(root, "scripts/raw/careers.json"), "utf8"));

const get = async (url) => {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(12000),
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/131.0 Safari/537.36" },
    });
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
};

/** Each adapter returns a normalised [{ title, url, location }]. */
const ADAPTERS = {
  async greenhouse(slug) {
    const d = await get(`https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`);
    return d?.jobs?.map((j) => ({ title: j.title, url: j.absolute_url, location: j.location?.name ?? "" }));
  },
  async ashby(slug) {
    const d = await get(`https://api.ashbyhq.com/posting-api/job-board/${slug}`);
    return d?.jobs?.map((j) => ({ title: j.title, url: j.jobUrl, location: j.location ?? "" }));
  },
  async lever(slug) {
    const d = await get(`https://api.lever.co/v0/postings/${slug}?mode=json`);
    return Array.isArray(d)
      ? d.map((j) => ({ title: j.text, url: j.hostedUrl, location: j.categories?.location ?? "" }))
      : null;
  },
  async workable(slug) {
    const d = await get(`https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`);
    return d?.jobs?.map((j) => ({ title: j.title, url: j.url ?? j.shortlink, location: [j.city, j.country].filter(Boolean).join(", ") }));
  },
  async recruitee(slug) {
    const d = await get(`https://${slug}.recruitee.com/api/offers/`);
    return d?.offers?.map((j) => ({ title: j.title, url: j.careers_url, location: j.location ?? "" }));
  },
  async smartrecruiters(slug) {
    const d = await get(`https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=100`);
    return d?.content?.map((j) => ({
      title: j.name,
      url: `https://careers.smartrecruiters.com/${slug}/${j.id}`,
      location: [j.location?.city, j.location?.country].filter(Boolean).join(", "),
    }));
  },
  async teamtailor(slug) {
    const d = await get(`https://${slug}.teamtailor.com/jobs.json`);
    return d?.jobs?.map((j) => ({ title: j.title, url: j.careersite_job_url, location: j.location?.city ?? "" }));
  },
};

const NCR = /gurugram|gurgaon|noida|delhi|faridabad|ghaziabad|ncr/i;

const targets = careers.filter((c) => c.ats && ADAPTERS[c.ats.provider]);
console.log(`${targets.length} companies with a supported ATS board`);

const out = {};
let ok = 0, roles = 0;

await Promise.all(
  Array.from({ length: 10 }, async () => {
    while (targets.length) {
      const c = targets.pop();
      if (!c) return;
      const list = await ADAPTERS[c.ats.provider](c.ats.slug);
      if (!list?.length) continue;
      // Only NCR roles belong on this map; a global board is mostly noise here.
      const ncr = list.filter((j) => NCR.test(j.location));
      if (!ncr.length) continue;
      ok++;
      roles += ncr.length;
      out[c.slug] = ncr.map((j) => ({ ...j, source: "careers" }));
    }
  }),
);

writeFileSync(join(root, "scripts/raw/ats-jobs.json"), JSON.stringify(out, null, 2) + "\n");
console.log(`${ok} companies returned NCR roles, ${roles} roles total`);
