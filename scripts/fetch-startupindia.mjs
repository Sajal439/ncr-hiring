/**
 * Pulls the DPIIT / Startup India registry from the public search API.
 *
 * The API host (api.startupindiahub.org.in) appears to be reachable only from
 * Indian IPs — it times out from cloud/CI runners abroad. Run this on your own
 * machine, on an Indian connection.
 *
 *   node scripts/fetch-startupindia.mjs                     # Delhi, all pages
 *   node scripts/fetch-startupindia.mjs --state=<id>        # another state
 *   node scripts/fetch-startupindia.mjs --pages=5           # just a sample
 *   node scripts/fetch-startupindia.mjs --probe             # one page, print field names
 *
 * If the default request body is rejected, capture the real one:
 *   1. Open the search page in Chrome with DevTools > Network.
 *   2. Tick a filter so it re-queries; find the `profile` XHR.
 *   3. Right-click > Copy > Copy as cURL, take the --data-raw JSON,
 *      and save it as scripts/si-payload.json. This script will use it.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "scripts/raw/startupindia");

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith(`--${k}=`));
  return hit ? hit.split("=")[1] : d;
};
const has = (k) => process.argv.includes(`--${k}`);

// State ids come from the search URL. Delhi is the one in the linked page.
const STATES = {
  delhi: "5f48ce592a9bb065cdf9fb26",
};

const state = arg("state", STATES.delhi);
const maxPages = Number(arg("pages", has("probe") ? 1 : 400));

const HOSTS = [
  "https://api.startupindiahub.org.in/sih/api/noauth/search/profile",
  "http://api.startupindiahub.org.in/sih/api/noauth/search/profile",
];

const payloadFile = join(root, "scripts/si-payload.json");
const basePayload = existsSync(payloadFile)
  ? JSON.parse(readFileSync(payloadFile, "utf8"))
  : {
      query: "",
      focusSector: false,
      industries: [],
      sectors: [],
      states: [state],
      cities: [],
      stages: [],
      badges: [],
      roles: ["Startup"],
      page: 0,
    };

const HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/plain, */*",
  Origin: "https://www.startupindia.gov.in",
  Referer: "https://www.startupindia.gov.in/content/sih/en/search.html",
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
};

/** Finds whichever host actually answers, so we only probe once. */
let liveHost = null;
async function post(page) {
  const body = JSON.stringify({ ...basePayload, page });
  for (const url of liveHost ? [liveHost] : HOSTS) {
    try {
      const res = await fetch(url, { method: "POST", headers: HEADERS, body });
      const text = await res.text();
      if (!res.ok) {
        console.error(`  ${url} -> HTTP ${res.status}: ${text.slice(0, 200)}`);
        continue;
      }
      liveHost = url;
      return JSON.parse(text);
    } catch (e) {
      console.error(`  ${url} -> ${e.cause?.code ?? e.message}`);
    }
  }
  return null;
}

/** The API has changed response shapes before; find the array wherever it is. */
function rowsFrom(json) {
  if (Array.isArray(json)) return json;
  for (const k of ["content", "data", "results", "profiles", "items"]) {
    if (Array.isArray(json?.[k])) return json[k];
    if (Array.isArray(json?.[k]?.content)) return json[k].content;
  }
  return [];
}

mkdirSync(outDir, { recursive: true });

const first = await post(0);
if (!first) {
  console.error(
    "\nNo response from either host.\n" +
      "If you are on an Indian connection and the website itself works in your\n" +
      "browser, the request body is probably wrong — capture the real one into\n" +
      "scripts/si-payload.json (see the header comment) and re-run.",
  );
  process.exit(1);
}

const sample = rowsFrom(first);
console.log(`connected: ${liveHost}`);
console.log(`page 0: ${sample.length} rows`);
if (sample[0]) {
  console.log("\nfields on the first record:");
  console.log(Object.keys(sample[0]).sort().join(", "));
  const addressish = Object.keys(sample[0]).filter((k) =>
    /address|street|pin|lat|lng|long|location|city|district/i.test(k),
  );
  console.log(`\nlocation-ish fields: ${addressish.join(", ") || "NONE"}`);
  console.log("\nfirst record:");
  console.log(JSON.stringify(sample[0], null, 2).slice(0, 2000));
}

if (has("probe")) {
  writeFileSync(join(outDir, "probe.json"), JSON.stringify(first, null, 2));
  console.log(`\nwrote ${join(outDir, "probe.json")} — send me this file.`);
  process.exit(0);
}

const all = [...sample];
for (let p = 1; p < maxPages; p++) {
  const json = await post(p);
  const rows = rowsFrom(json);
  if (!rows.length) break;
  all.push(...rows);
  if (p % 10 === 0) console.log(`page ${p}: ${all.length} rows so far`);
  await new Promise((r) => setTimeout(r, 400)); // be polite to a .gov.in host
}

const out = join(outDir, `${state}.json`);
writeFileSync(out, JSON.stringify(all, null, 2));
console.log(`\nwrote ${all.length} records to ${out}`);
