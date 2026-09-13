/**
 * Turns the LinkedIn jobs pull into map-ready company records and merges them
 * into data/companies.json alongside the hand-curated, Maps-verified entries.
 *
 * These records are LOCATION-APPROXIMATE: LinkedIn gives us the job's city, not
 * the office address, so we pin to a city anchor with a deterministic offset and
 * mark the record `approx: true`. The UI renders those differently and the
 * detail page says so — we never present a guessed pin as a verified one.
 *
 *   node scripts/build-from-linkedin.mjs
 */
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) =>
  existsSync(join(root, p)) ? JSON.parse(readFileSync(join(root, p), "utf8")) : [];

const curated = read("data/companies.json").filter((c) => !c.approx);

/**
 * Raw pulls accumulate as scripts/raw/linkedin/companies*.json — one per LinkedIn
 * run, since each run slices the search space differently. Later files win on
 * conflicts, and job counts are summed across runs for the same company.
 */
const rawDir = join(root, "scripts/raw/linkedin");
const byName = new Map();
for (const f of readdirSync(rawDir).filter((f) => /^companies.*\.json$/.test(f)).sort()) {
  for (const r of JSON.parse(readFileSync(join(rawDir, f), "utf8"))) {
    const prev = byName.get(r.companyName);
    byName.set(r.companyName, prev ? { ...prev, ...r, jobs: prev.jobs + r.jobs } : r);
  }
}
const raw = [...byName.values()];

/** Organisation type and follower count, used by the quality tier below. */
const orgs = new Map();
for (const f of readdirSync(rawDir).filter((f) => /^orgtypes.*\.json$/.test(f)).sort()) {
  for (const o of JSON.parse(readFileSync(join(rawDir, f), "utf8"))) orgs.set(o.name, o);
}

const descs = new Map();
for (const f of readdirSync(rawDir).filter((f) => /^descriptions.*\.json$/.test(f)).sort()) {
  for (const d of JSON.parse(readFileSync(join(rawDir, f), "utf8"))) {
    if (d.d && !descs.has(d.name)) descs.set(d.name, d);
  }
}
console.log(`raw companies across all pulls: ${raw.length}`);

/* ---------- city anchors, averaged from the Maps-verified curated set ---------- */

const CITY_OF = (s = "") =>
  /gurugram|gurgaon/i.test(s) ? "Gurugram"
  : /greater noida/i.test(s) ? "Greater Noida"
  : /noida/i.test(s) ? "Noida"
  : /faridabad/i.test(s) ? "Faridabad"
  : /ghaziabad|vaishali/i.test(s) ? "Ghaziabad"
  : /delhi/i.test(s) ? "Delhi"
  : null;

const anchors = {};
for (const c of curated) {
  const city = CITY_OF(c.address);
  if (!city) continue;
  (anchors[city] ??= []).push([c.lat, c.lng]);
}
for (const [city, pts] of Object.entries(anchors)) {
  anchors[city] = [
    pts.reduce((a, p) => a + p[0], 0) / pts.length,
    pts.reduce((a, p) => a + p[1], 0) / pts.length,
  ];
}

/** Stable pseudo-random offset so a company always lands on the same spot. */
function scatter(seed, [lat, lng]) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const a = (Math.abs(h) % 3600) / 3600 * Math.PI * 2;
  const r = 0.012 + (Math.abs(h >> 8) % 1000) / 1000 * 0.035; // ~1.5-5 km
  return [lat + Math.sin(a) * r, lng + Math.cos(a) * r];
}

/* ---------- mapping LinkedIn industry onto our sector taxonomy ---------- */

const SECTOR_RULES = [
  ["AI", /artificial intelligence|machine learning/i],
  ["Fintech", /financial serv|banking|insurance|capital markets|investment|lending|payments/i],
  ["Healthtech", /hospital|health|pharmaceutical|medical|biotech|wellness/i],
  ["Edtech", /e-learning|education|training|higher education/i],
  ["Gaming", /computer games|gambling|casinos|entertainment provider/i],
  ["Logistics", /transportation|logistics|supply chain|freight|warehousing|airlines|maritime/i],
  ["D2C", /retail apparel|cosmetics|personal care|consumer goods|food and beverage|beverage manufacturing|apparel manufacturing/i],
  ["Deeptech", /semiconductor|manufacturing|renewable|energy|robotics|aviation|defense|electronics|automation|motor vehicle|telecommunication|environmental serv|utilities/i],
  ["SaaS", /software|it services|it system|computer|information technology|internet publishing|data infrastructure|it consulting|information services/i],
  ["Consumer", /technology, information and internet|travel|hospitality|restaurants|media|advertising|marketing|real estate|internet marketplace|retail|consumer serv/i],
];
const sectorFor = (industry = "") =>
  SECTOR_RULES.find(([, re]) => re.test(industry))?.[0] ?? "Other";

const TEAM_BAND = (n) =>
  n == null ? undefined
  : n < 11 ? "1-10"
  : n < 51 ? "11-50"
  : n < 201 ? "51-200"
  : n < 501 ? "201-500"
  : n < 1001 ? "501-1000"
  : n < 5001 ? "1001-5000"
  : "5000+";

/** LinkedIn "About" text is marketing prose; take the first usable sentence. */
function taglineFrom(name, description = "", specialties = "") {
  const clean = description.replace(/\s+/g, " ").trim();
  const first = clean.split(/(?<=[.!?])\s/)[0] ?? "";
  if (first.length >= 25 && first.length <= 130) return first.replace(/\.$/, "");
  if (first.length > 130) {
    const cut = first.slice(0, 120);
    return cut.slice(0, cut.lastIndexOf(" ")) + "…";
  }
  const spec = String(specialties).split(",")[0]?.trim();
  return spec ? `${spec} company` : `${name} — hiring in Delhi NCR`;
}

const slugify = (s) =>
  s.toLowerCase().replace(/&/g, " and ").replace(/['’.]/g, "")
   .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const domainOf = (url = "") =>
  url.replace(/^https?:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0] || undefined;

/* ---------- quality tier ---------- */

/**
 * Hiring is a good liveness signal but a poor startup signal — hair clinics,
 * animation studios and audit firms all post jobs. This separates companies
 * that look like startups from everything else that happens to be hiring.
 * Nothing is discarded; the UI just defaults to the startup tier.
 */
/**
 * Company names that describe an agency or services shop rather than a product
 * company. This is deliberately conservative — it only fires on words that are
 * almost never in a product startup's registered name.
 */
const SERVICES_NAME =
  /\bconsult(?:ing|ants?|ancy)\b|\bservices\b|\bagency\b|infosolutions|\binfotech\b|\bsoftech\b|\bstudios\b|\boverseas\b|\bexports?\b|\btraders\b|\bindustries\b|\bclinics?\b|\bhospitals?\b|\bsalon\b|\bacademy\b|\binstitute\b|\bcollege\b|\buniversity\b|\bcaterers?\b|\bbuilders?\b|\brealty\b|\bproperties\b/i;

const NOT_STARTUP_INDUSTRY =
  /staffing|recruit|human resources services|outsourcing|accounting|legal serv|law practice|higher education|education admin|non-?profit|civic|government|religious|political|events serv|facilities serv|security and invest|architecture and planning|construction|farming|mining|oil and gas|hospitality|restaurants|hotels|wholesale|import and export|trucking|book and periodical|newspaper|broadcast|business consulting|professional serv|design serv|printing serv|public relations|interior design|engineering serv|research serv|translation|photography|writing and editing/i;

function tierOf(r) {
  const org = orgs.get(r.companyName)?.org ?? "";
  const emp = r.companyEmployeeCount ?? 0;
  const founded = /^\d{4}$/.test(r.companyFoundedDate || "") ? Number(r.companyFoundedDate) : null;

  // A non-English org type means the LinkedIn page is registered in another
  // locale — almost always a foreign company with an incidental NCR posting.
  if (org && !/^(Privately Held|Public Company|Partnership|Self-Owned|Nonprofit|Educational|Government Agency|Self-Employed)$/.test(org))
    return "company";
  if (org && org !== "Privately Held") return "company";
  if (emp < 20 || emp > 5000) return "company";
  if (founded !== null && founded < 2005) return "company";
  if (!r.companyWebsite) return "company";
  if (NOT_STARTUP_INDUSTRY.test(r.companyIndustry || "")) return "company";
  if (SERVICES_NAME.test(r.companyName)) return "company";
  return "startup";
}

/** Hand corrections, because no rule catches every consultancy. */
const overrides = JSON.parse(readFileSync(join(root, "scripts/overrides.json"), "utf8"));
const demoted = new Set(overrides.demote ?? []);
const promoted = new Set(overrides.promote ?? []);

/* ---------- filter ---------- */

const AGENCY = /staffing|recruit|human resources services|outsourcing/i;
const seen = new Set(curated.map((c) => slugify(c.name)));
const nameKeys = curated.map((c) => slugify(c.name).replace(/-/g, ""));

const out = [];
for (const r of raw) {
  const city = CITY_OF(r.location);
  if (!city) continue;                                   // outside NCR
  if (r.dynamicFilterMatch === false) continue;          // flagged agency
  if (AGENCY.test(r.companyIndustry || "")) continue;    // agency by industry
  const emp = r.companyEmployeeCount ?? 0;
  if (emp < 10 || emp > 20000) continue;                 // shells and mega-corps

  const slug = slugify(r.companyName);
  const key = slug.replace(/-/g, "");
  if (seen.has(slug)) continue;
  if (nameKeys.some((k) => k.length > 6 && (k.includes(key) || key.includes(k)))) continue;
  seen.add(slug);

  const d = descs.get(r.companyName);
  const [lat, lng] = scatter(slug, anchors[city] ?? anchors.Gurugram);

  // VC firms show up in the jobs data too; they belong in the VC filter, not
  // as startups.
  const isVC = /venture capital|private equity/i.test(r.companyIndustry || "");

  out.push({
    slug,
    name: r.companyName,
    type: isVC ? "vc" : "startup",
    tier: promoted.has(slug) ? "startup" : demoted.has(slug) ? "company" : tierOf(r),
    tagline: taglineFrom(r.companyName, d?.d, d?.s),
    sector: sectorFor(r.companyIndustry),
    stage: isVC ? "VC" : "Unknown",
    tags: String(d?.s || "").split(",").map((t) => t.trim()).filter(Boolean).slice(0, 4),
    area: city,
    address: `${city}, Delhi NCR`,
    lat,
    lng,
    approx: true,
    hiring: true,
    openJobs: r.jobs,
    domain: domainOf(r.companyWebsite),
    founded: /^\d{4}$/.test(r.companyFoundedDate || "") ? Number(r.companyFoundedDate) : undefined,
    teamSize: TEAM_BAND(r.companyEmployeeCount),
  });
}

/**
 * Companies people submitted and a human approved. They live in their own file
 * because this script rewrites companies.json from scratch every morning —
 * anything written directly into it survives until 07:30 and no longer.
 *
 * approx: true, so they draw as hollow pins. A form cannot give an exact
 * address, and the map is careful to say which locations are guesses.
 */
const submitted = read("data/submitted.json")
  .filter((s) => s.kind === "company")
  .map((s) => ({
    slug: s.slug,
    name: s.name,
    type: "startup",
    tier: "startup",
    tagline: s.tagline,
    sector: s.sector,
    stage: s.stage,
    tags: [],
    area: s.area,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    approx: true,
    hiring: false,
    domain: s.website ? s.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] : undefined,
    founded: s.founded,
    careersUrl: s.careersUrl,
    source: "submitted",
  }));

const submittedSlugs = new Set(submitted.map((s) => s.slug));

// Curated entries were vetted by hand, so they are startup-tier by definition.
const merged = [
  ...submitted,
  ...curated.filter((c) => !submittedSlugs.has(c.slug)).map((c) => ({ ...c, tier: c.tier ?? "startup" })),
  ...out.filter((c) => !submittedSlugs.has(c.slug)),
].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, "data/companies.json"), JSON.stringify(merged, null, 2) + "\n");

console.log(`curated (verified pins): ${curated.length}`);
console.log(`added from LinkedIn (approx pins): ${out.length}`);
console.log(`  of which startup-tier: ${out.filter((c) => c.tier === "startup").length}`);
console.log(`  of which other-company-tier: ${out.filter((c) => c.tier === "company").length}`);
console.log(`total: ${merged.length}`);
console.log(`city anchors: ${Object.keys(anchors).join(", ")}`);
