/**
 * Subscriber store for the Delhi NCR Startup Map daily digest.
 *
 * The site has no database on purpose — data/*.json is committed and read at
 * build time. Subscriber emails cannot live there: they are personal data, and
 * the daily refresh rewrites that directory. So they live in a Google Sheet,
 * and this script is the only thing that touches it.
 *
 * ── Setup (about three minutes) ────────────────────────────────────────────
 * 1. Create a Google Sheet. Name the first tab `subscribers`.
 * 2. Extensions -> Apps Script. Delete the placeholder, paste this file.
 * 3. Replace SHARED_TOKEN below with a long random string. Generate one with:
 *      node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
 * 4. Deploy -> New deployment -> Web app.
 *      Execute as:        Me
 *      Who has access:    Anyone
 *    "Anyone" is required — Vercel and GitHub Actions call this unauthenticated.
 *    The URL is unguessable and every request must carry the token, so the URL
 *    plus the token together are the credential.
 * 5. Copy the deployment URL. Set it as SUBSCRIBERS_URL and the token as
 *    SUBSCRIBERS_TOKEN, in both Vercel and GitHub Actions secrets.
 *
 * Re-deploy after any edit: Deploy -> Manage deployments -> pencil -> Version:
 * New version. Editing the code alone changes nothing that is live.
 *
 * Do NOT test doPost with curl. Apps Script answers a POST with a 302 to
 * script.googleusercontent.com, and curl mishandles that redirect: it returns
 * Google's "Sorry, unable to open the file at present" HTML page *even though
 * the write succeeded*. An hour went into chasing a bug that was not there.
 * Node's fetch follows the same redirect correctly and returns the JSON, which
 * is what the site and the digest script both use:
 *
 *   node -e "fetch(URL,{method:'POST',headers:{'content-type':'application/json'},
 *     body:JSON.stringify({token:T,action:'subscribe',email:'x@y.com'})})
 *     .then(r=>r.json()).then(console.log)"
 *
 * GET is fine from curl.
 */

const SHARED_TOKEN = "6f1e994fd751515e950797b53988a74d0bdf36955ecf9d16";
const SHEET_NAME = "subscribers";
const ADS_SHEET = "ads";
const SUBS_SHEET = "submissions";
const SUBS_HEADERS = [
  "receivedAt", "type", "company", "website", "roleTitle", "oneLiner", "location",
  "sector", "stage", "founded", "applyUrl", "salary", "contact", "notes", "status",
];
const ADS_HEADERS = [
  "receivedAt", "company", "website", "cta", "poc", "email", "phone",
  "slot", "amount", "notes", "bannerUrl", "proofUrl", "status",
];
const HEADERS = ["id", "name", "email", "interests", "status", "createdAt", "lastSentAt"];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

/**
 * Run this once from the editor after adding Drive access.
 *
 * Adding DriveApp to the script adds a scope, and a scope is not granted by
 * deploying — the owner has to approve it. Until then the web app answers ad
 * submissions that carry an image with Google's HTML error page, while ones
 * without an image succeed, which reads like a bug in the upload rather than a
 * missing permission.
 */
function authorizeDrive() {
  const folder = adsFolder_();
  Logger.log("ok: " + folder.getName() + " " + folder.getUrl());
}

/** Where ad creatives and payment screenshots land. Created on first use. */
function adsFolder_() {
  const name = "NCR Startup Map - ad uploads";
  const found = DriveApp.getFoldersByName(name);
  return found.hasNext() ? found.next() : DriveApp.createFolder(name);
}

function saveUpload_(file, prefix) {
  if (!file || !file.data) return "";
  const blob = Utilities.newBlob(
    Utilities.base64Decode(file.data),
    file.type || "application/octet-stream",
    prefix + "-" + new Date().toISOString().slice(0, 19) + "-" + (file.name || "upload"),
  );
  return adsFolder_().createFile(blob).getUrl();
}

function rows_(sh) {
  const values = sh.getDataRange().getValues();
  return values.slice(1).map((r, i) => {
    const o = { _row: i + 2 };
    HEADERS.forEach((h, c) => (o[h] = r[c]));
    return o;
  });
}

const json_ = (obj) =>
  ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);

/** Apps Script has no crypto.randomUUID; Utilities.getUuid is the equivalent. */
const newId_ = () => Utilities.getUuid().replace(/-/g, "").slice(0, 20);

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ error: "bad json" });
  }
  if (body.token !== SHARED_TOKEN) return json_({ error: "unauthorised" });

  const sh = sheet_();
  const lock = LockService.getScriptLock();
  // Two people subscribing in the same second would otherwise write the same
  // row twice, or clobber each other's append.
  lock.waitLock(20000);
  try {
    if (body.action === "subscribe") {
      const email = String(body.email || "").trim().toLowerCase();
      if (!email) return json_({ error: "email required" });
      const interests = Array.isArray(body.interests) ? body.interests.join("|") : "";
      const existing = rows_(sh).find((r) => String(r.email).toLowerCase() === email);
      if (existing) {
        // Re-subscribing is how someone comes back after unsubscribing, and how
        // they change their interests. Never create a second row for one email.
        sh.getRange(existing._row, 2).setValue(body.name || existing.name);
        sh.getRange(existing._row, 4).setValue(interests);
        sh.getRange(existing._row, 5).setValue("active");
        return json_({ ok: true, id: existing.id, existing: true });
      }
      const id = newId_();
      sh.appendRow([id, body.name || "", email, interests, "active", new Date().toISOString(), ""]);
      return json_({ ok: true, id: id, existing: false });
    }

    if (body.action === "unsubscribe") {
      const row = rows_(sh).find((r) => r.id === body.id);
      if (!row) return json_({ error: "not found" });
      sh.getRange(row._row, 5).setValue("unsubscribed");
      return json_({ ok: true });
    }

    /**
     * Ad submissions. They used to be console.logged on the server and lost,
     * while the form told the advertiser it had worked -- which is the worst
     * possible failure for a page that has just taken someone's money.
     *
     * The creative and the payment screenshot go to Drive rather than into a
     * cell: a sheet cannot hold an image, and a link that opens the actual
     * file is what you need when you are checking a payment.
     */
    if (body.action === "ad") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let ash = ss.getSheetByName(ADS_SHEET);
      if (!ash) {
        ash = ss.insertSheet(ADS_SHEET);
        ash.appendRow(ADS_HEADERS);
        ash.setFrozenRows(1);
      }
      const f = body.fields || {};
      ash.appendRow([
        new Date().toISOString(),
        f.company || "", f.website || "", f.cta || "", f.poc || "",
        f.email || "", f.phone || "", f.slot || "", f.amount || "", f.notes || "",
        saveUpload_(body.banner, "banner"),
        saveUpload_(body.proof, "proof"),
        "new",
      ]);
      return json_({ ok: true });
    }

    /**
     * A startup or a job someone wants listed. Same failure as the ad form had:
     * these were posted to a webhook that was never configured and then logged
     * to a server nobody reads, so anyone who filled the form was told "thanks"
     * and heard nothing again.
     *
     * Everything lands as `pending`. Nothing here reaches the site until it is
     * checked by hand -- an open form on a board whose whole claim is that the
     * data is real cannot publish straight through.
     */
    if (body.action === "submission") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      let ssh = ss.getSheetByName(SUBS_SHEET);
      if (!ssh) {
        ssh = ss.insertSheet(SUBS_SHEET);
        ssh.appendRow(SUBS_HEADERS);
        ssh.setFrozenRows(1);
      }
      const f = body.fields || {};
      ssh.appendRow([
        new Date().toISOString(),
        f.type || "startup", f.company || "", f.website || "", f.roleTitle || "",
        f.oneLiner || "", f.location || "", f.sector || "", f.stage || "",
        f.founded || "", f.applyUrl || "", f.salary || "", f.contact || "",
        f.notes || "", "pending",
      ]);
      return json_({ ok: true });
    }

    /**
     * Stamps rows as published once they are on the board, so the next run
     * does not re-add them. Sent after the data is committed, not before —
     * a crash between the two should leave a row to retry, not lose it.
     */
    if (body.action === "mark-published") {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const ssh = ss.getSheetByName(SUBS_SHEET);
      if (!ssh) return json_({ ok: true, marked: 0 });
      const statusCol = SUBS_HEADERS.indexOf("status") + 1;
      const rowsToMark = body.rows || [];
      for (const n of rowsToMark) {
        if (n > 1 && n <= ssh.getLastRow()) ssh.getRange(n, statusCol).setValue("published");
      }
      return json_({ ok: true, marked: rowsToMark.length });
    }

    if (body.action === "mark-sent") {
      // Recorded after a digest goes out, so a half-failed send is visible in
      // the sheet rather than guessed at.
      const when = new Date().toISOString();
      const byId = {};
      rows_(sh).forEach((r) => (byId[r.id] = r._row));
      (body.ids || []).forEach((id) => {
        if (byId[id]) sh.getRange(byId[id], 7).setValue(when);
      });
      return json_({ ok: true });
    }

    return json_({ error: "unknown action" });
  } finally {
    lock.releaseLock();
  }
}

/**
 * Reads. Two of them now, chosen with ?want=.
 *
 * The submissions read is what makes the "usually live within a day" promise
 * on the site true. Before it, a submission landed in this sheet and stopped
 * there: the form said someone would check it and put it up, and nothing could
 * — there was no way to get a row back out.
 */
function doGet(e) {
  if (e.parameter.token !== SHARED_TOKEN) return json_({ error: "unauthorised" });

  if (e.parameter.want === "submissions") {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const ssh = ss.getSheetByName(SUBS_SHEET);
    if (!ssh || ssh.getLastRow() < 2) return json_({ submissions: [] });

    const values = ssh.getDataRange().getValues();
    const head = values[0].map(String);
    // Only "approved". A row is pending until a human types that word, which
    // is the entire point — this is a board whose claim is that its data is
    // real, so nothing publishes itself.
    const out = [];
    for (let i = 1; i < values.length; i++) {
      const row = {};
      head.forEach((h, k) => (row[h] = String(values[i][k] == null ? "" : values[i][k]).trim()));
      row.rowNumber = i + 1;
      if (row.status.toLowerCase() === "approved") out.push(row);
    }
    return json_({ submissions: out });
  }

  const active = rows_(sheet_())
    .filter((r) => r.status === "active" && r.email)
    .map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      interests: String(r.interests || "").split("|").filter(Boolean),
    }));
  return json_({ subscribers: active });
}
