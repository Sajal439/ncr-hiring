/**
 * Scrapes the job boards that have no usable HTTP API and render entirely in
 * JavaScript — Darwinbox and Keka, which is what most Indian companies use.
 * A plain fetch of a Darwinbox board returns "Please enable Javascript!", so
 * these need a real browser.
 *
 *   node scripts/fetch-spa-jobs.mjs
 *
 * Free: headless Chromium via playwright-core, no API keys. Slower than the
 * REST adapters in fetch-ats-jobs.mjs, so it only runs for the SPA providers.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const careers = JSON.parse(readFileSync(join(root, "scripts/raw/careers.json"), "utf8"));
const outPath = join(root, "scripts/raw/spa-jobs.json");

const BOARD_URL = {
  darwinbox: (s) => `https://${s}.darwinbox.in/ms/candidate/careers`,
  keka: (s) => `https://${s}.keka.com/careers/`,
};

const NCR = /gurugram|gurgaon|noida|delhi|faridabad|ghaziabad|ncr/i;

/**
 * Both boards render a list of anchors pointing at a per-job URL. Rather than
 * guess at each product's DOM, collect every link that looks like a job and
 * take its text as the title plus the nearest location-ish text in its row.
 */
const EXTRACT = () => {
  const isJobHref = (h) => /job|opening|position|vacanc/i.test(h || "");
  const seen = new Set();
  const out = [];
  for (const a of document.querySelectorAll("a[href]")) {
    const href = a.getAttribute("href") || "";
    if (!isJobHref(href)) continue;
    const title = (a.innerText || "").trim().split("\n")[0];
    if (!title || title.length < 3 || title.length > 120) continue;
    const url = new URL(href, location.href).href;
    if (seen.has(url)) continue;
    seen.add(url);
    // Walk up a few levels to find the row that also carries the location.
    let row = a, text = "";
    for (let i = 0; i < 4 && row; i++) {
      row = row.parentElement;
      const t = (row?.innerText || "").trim();
      if (t.length > text.length && t.length < 400) text = t;
    }
    out.push({ title, url, rowText: text });
  }
  return out;
};

const targets = careers.filter((c) => c.ats && BOARD_URL[c.ats.provider]);
console.log(`${targets.length} SPA boards to render`);

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
});

const out = existsSync(outPath) ? JSON.parse(readFileSync(outPath, "utf8")) : {};
let ok = 0, roles = 0;

for (const c of targets) {
  if (out[c.slug]) continue;
  const url = BOARD_URL[c.ats.provider](c.ats.slug);
  const page = await ctx.newPage();
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2500); // boards fetch their list after first paint
    const found = await page.evaluate(EXTRACT);
    const ncr = found
      .filter((j) => NCR.test(j.rowText))
      .map((j) => ({
        title: j.title,
        url: j.url,
        location: (j.rowText.match(/(Gurugram|Gurgaon|Noida|New Delhi|Delhi|Faridabad|Ghaziabad)/i) || [""])[0],
        source: "careers",
      }));
    if (ncr.length) {
      out[c.slug] = ncr;
      ok++;
      roles += ncr.length;
      console.log(`  ${c.slug} (${c.ats.provider}): ${ncr.length} NCR roles of ${found.length}`);
    }
  } catch (e) {
    console.log(`  ${c.slug}: ${String(e.message).slice(0, 70)}`);
  } finally {
    await page.close();
  }
}

await browser.close();
writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n");
console.log(`\n${ok} boards returned NCR roles, ${roles} roles total`);
