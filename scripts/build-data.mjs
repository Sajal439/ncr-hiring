/**
 * Merges the Google-Maps-verified place rows (scripts/raw/p*.tsv) with the
 * hand-maintained metadata in scripts/candidates.json and scripts/profiles.tsv,
 * and writes data/companies.json — the single source of truth the app reads.
 *
 *   node scripts/build-data.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Keep in sync with lib/areas.ts — duplicated so the build script stays
// dependency-free and runnable without a TS toolchain.
const AREA_RULES = [
  ["Cyber City", /cyber\s?city|cyber greens|cyberpark|dlf phase [23]|sector 24, gurugram|dlf downtown/i],
  ["Udyog Vihar", /udyog vihar|sector (18|19|20|21), gurugram/i],
  ["Golf Course Road", /golf course rd|sector (4[23]|53|54), gurugram/i],
  ["Golf Course Ext", /golf course ext|sector (5[5-9]|6[0-9]|7[0-3]), gurugram|badshahpur/i],
  ["Sohna Road", /sohna|sector (4[4-9]|5[0-2]), gurugram/i],
  ["MG Road Gurugram", /mehrauli-gurgaon|mg road|sushant lok|dlf phase 1|sector (2[5-9]|3[0-9]|1[0-7]), gurugram|millennium city/i],
  ["Manesar", /manesar/i],
  ["Gurugram", /gurugram|gurgaon/i],
  ["Greater Noida", /greater noida/i],
  ["Noida Sector 62", /sector 6[2-4], noida|noida one|candor techspace/i],
  ["Noida Expressway", /sector 1[23][0-9], noida|noida expressway|sector 14[0-9], noida|sector (8[0-9]|9[0-9]|7[0-9]), noida/i],
  ["Film City Noida", /film city|sector 16a, noida/i],
  ["Noida", /noida/i],
  ["Connaught Place", /connaught place|barakhamba|kg marg|janpath|110001/i],
  ["Nehru Place", /nehru place|kalkaji|110019/i],
  ["Okhla", /okhla|mohan cooperative|jasola|sarita vihar|110020|110025|110044|110076/i],
  ["Saket", /saket|malviya nagar|hauz khas|lado sarai|110017|110030/i],
  ["South Delhi", /lajpat nagar|greater kailash|east of kailash|defence colony|south extension|vasant kunj|vasant vihar|aerocity|jangpura|maharani bagh|ghitorni|sultanpur|110014|110024|110037|110048|110049|110065|110070/i],
  ["West Delhi", /kirti nagar|moti nagar|najafgarh|rama rd|naraina|janakpuri|dwarka|mansarover|110015|110058|110077|110028/i],
  ["North Delhi", /pitampura|keshav puram|mukherjee nagar|kamla nagar|rohini|shakurpur|jhandewalan|karol bagh|110034|110035|110055|110009|110007/i],
  ["East Delhi", /patparganj|shahdara|laxmi nagar|110092/i],
  ["Delhi", /delhi/i],
  ["Faridabad", /faridabad/i],
  ["Ghaziabad", /ghaziabad|vaishali/i],
];

const areaFor = (addr) => AREA_RULES.find(([, re]) => re.test(addr))?.[0] ?? "Other";
const inNCR = (lat, lng) => lat > 28.1 && lat < 29.0 && lng > 76.7 && lng < 77.8;

const slugify = (s) =>
  s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

// Normalised token set, used to match a scraped row back to its candidate entry.
const norm = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
const STOP = new Set([
  "head", "office", "corporate", "hq", "india", "pvt", "private", "limited",
  "ltd", "the", "technologies", "solutions", "services", "gurugram", "gurgaon",
  "noida", "delhi", "new", "inc", "co", "company", "group", "labs", "tech",
]);

const candidates = JSON.parse(readFileSync(join(root, "scripts/candidates.json"), "utf8"));

/** profiles.tsv: name \t sector \t stage \t founded \t teamSize \t tags \t tagline */
const profiles = new Map();
for (const line of readFileSync(join(root, "scripts/profiles.tsv"), "utf8").split("\n")) {
  if (!line.trim() || line.startsWith("#")) continue;
  const [name, sector, stage, founded, teamSize, tags, tagline] = line.split("\t");
  profiles.set(slugify(name), { sector, stage, founded, teamSize, tags, tagline });
}

const rows = [];
for (const f of readdirSync(join(root, "scripts/raw")).filter((f) => /^p\d+\.tsv$/.test(f)).sort()) {
  for (const line of readFileSync(join(root, "scripts/raw", f), "utf8").split("\n")) {
    if (!line.trim()) continue;
    const [name, placeName, address, lat, lng, domain] = line.split("\t");
    rows.push({ name, placeName, address, lat: +lat, lng: +lng, domain });
  }
}

const bySlug = new Map();
const unprofiled = [];

for (const r of rows) {
  if (!inNCR(r.lat, r.lng)) {
    console.warn(`skip (outside NCR): ${r.name}`);
    continue;
  }
  const slug = slugify(r.name);
  if (bySlug.has(slug)) continue; // first row wins

  const p = profiles.get(slug);
  if (!p) unprofiled.push(r.name);

  // Fall back to the candidate list for sector/stage when the profile is missing.
  const cand = candidates.find((c) => {
    const a = norm(c.name), b = norm(r.name);
    return a.some((w) => b.includes(w)) && b.some((w) => a.includes(w));
  });

  bySlug.set(slug, {
    slug,
    name: r.name,
    type: (p?.stage ?? cand?.stage) === "VC" ? "vc" : "startup",
    tagline: p?.tagline || "",
    sector: p?.sector || cand?.sector || "Other",
    stage: p?.stage || cand?.stage || "Series C+",
    tags: p?.tags ? p.tags.split(",").map((t) => t.trim()).filter(Boolean) : [],
    area: areaFor(r.address),
    address: r.address,
    lat: r.lat,
    lng: r.lng,
    domain: r.domain || undefined,
    founded: p?.founded ? Number(p.founded) : undefined,
    teamSize: p?.teamSize || undefined,
  });
}

const out = [...bySlug.values()].sort((a, b) => a.name.localeCompare(b.name));
writeFileSync(join(root, "data/companies.json"), JSON.stringify(out, null, 2) + "\n");

console.log(`wrote ${out.length} companies (${out.filter((c) => c.type === "vc").length} VCs)`);
if (unprofiled.length) console.warn(`no profile row for ${unprofiled.length}: ${unprofiled.join(", ")}`);
