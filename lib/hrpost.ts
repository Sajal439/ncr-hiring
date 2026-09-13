/**
 * Turns a free-text LinkedIn hiring post into a structured role, or rejects it.
 *
 * Indian HR posts follow a near-standard template ("📍 Location:", "💰 Salary:",
 * "📩 share CV at…"), which makes them parseable. The hard part is not parsing —
 * it is that most such posts are noise: recruitment agencies, domestic staffing,
 * BPO/manufacturing bulk hiring, and engagement-farming posts that promise a
 * link "in 7 days" and never deliver one.
 *
 * Anything rejected here is dropped entirely rather than shown with a warning:
 * a jobs board is judged by its worst listing, not its average one.
 */

export type ParsedPost = {
  title?: string;
  location?: string;
  salary?: string;
  experience?: string;
  email?: string;
  phone?: string;
  applyUrl?: string;
};

export type Rejection =
  | "not-hiring"
  | "agency"
  | "engagement-farming"
  | "domestic-staffing"
  | "bulk-hiring"
  | "no-apply-route"
  | "not-ncr";

/** Posts that exist to farm comments, not to hire. No real apply route. */
const ENGAGEMENT_FARMING =
  /type your .{0,12}in the comment|comment .{0,15}(and|to) (get|receive|i.?ll)|links? will be sent|dm .{0,10}for (the )?link|tag your friends|like (this|the) post ?(&|and)|repost (this|for)/i;

/**
 * Staffing and consultancy shops posting on behalf of unnamed clients.
 *
 * Every word here has to be a word an in-house HR person would *not* put in
 * their headline. The bare word "recruitment" used to be on this list and it
 * was the single most damaging entry in the file: "Talent Acquisition |
 * End-to-End Recruitment" is how half the in-house recruiters in India
 * describe themselves, and it was throwing out Jagran New Media, Delhivery and
 * Diksha Tech along with the actual agencies. It now has to be "recruitment
 * agency/services/firm/solutions" — a shop, not a skill.
 */
export const AGENCY =
  /\brecruitment (agency|agencies|services|firm|solutions|consultancy|consultants)\b|\b(staffing|manpower|placement services|hr solutions|hiring solutions|talent solutions|recruitment consultancy)\b|\b(placement|consultancy)\b(?=[^\n]{0,20}\b(services|solutions|pvt|ltd|firm)\b)|recruitbyte|hiringwings|outpace consulting|socialrecruit|naukripay/i;

/**
 * A recruiter-shaped headline. On its own this proves nothing — an in-house
 * recruiter and an agency recruiter write the identical headline, and both
 * write "Technical Recruiter". Measured on 120 posts, 26 were rejected on this
 * signal alone and 14 of those turned out to be posting from their employer's
 * own domain (natobotics.com, heptley.com, jagrannewmedia.com). Throwing those
 * away is the exact opposite of what this pass is for.
 *
 * So it is now only half a test. See recruiterIsAgency below for the other half.
 */
const AGENCY_AUTHOR =
  /\brecruiter\b|\brecruitment\b|\btalent acquisition\b|\bstaffing\b|\bheadhunter\b|\bplacement\b/i;

/** Household and personal-staff roles — not company hiring. */
export const DOMESTIC =
  /\b(lifestyle manager|residence manager|household (manager|staff)|domestic help|nanny|caretaker|driver cum|personal attendant|elderly)/i;

/** High-volume non-startup hiring that would swamp the board. */
export const BULK =
  /\b(bpo|voice process|(non.?)?voice (&|and) non.?voice|international voice|customer care (executive|roles)|blended (support|process)|tele.?call|field sales executive|delivery boy|security guard|housekeeping|fabrication|welder|fitter|machine operator|production operator|real estate sales|loan sales|insurance agent|walk.?in interview)/i;

const HIRING = /\b(hiring|we.?re hiring|job opening|open (role|position)|now hiring|urgent(ly)? (hiring|required)|looking for a)\b/i;

const NCR = /\b(gurugram|gurgaon|noida|greater noida|new delhi|delhi|ncr|faridabad|ghaziabad)\b/i;

/** Free mail hosts. An address here identifies a person, not an employer. */
const MAILBOX_DOMAIN =
  /^(gmail|googlemail|yahoo|ymail|outlook|hotmail|live|msn|icloud|me|aol|proton(mail)?|zoho(mail)?|rediff(mail)?|mail|email|inbox|yandex)\./i;

/**
 * Given a recruiter-shaped headline, decide whether they are recruiting for
 * their own employer or for clients — using the one thing a hiring post must
 * carry, the apply route.
 *
 * An in-house recruiter says "send your CV to priya@natobotics.com". An agency
 * recruiter has no company address to offer and falls back to a personal
 * Gmail, or to a domain that says what it is: gallantplacement.in,
 * makoto.co.in ("HR Solutions"), tekinspirations.com ("US Staffing").
 *
 * A post with no email at all also lands here. That is the right call: if
 * nothing in a recruiter's post names an employer, the board cannot say who is
 * hiring, and a listing that cannot name the company is not worth showing.
 */
/**
 * A domain is one unspaced token, so the word-boundary anchors in AGENCY never
 * fire on "skillbridgestaffing.co". Match the tokens as substrings instead,
 * which is safe here precisely because a domain is a name someone chose for a
 * business — nobody registers `staffing` by accident.
 */
const AGENCY_DOMAIN =
  /staffing|placement|manpower|recruit|consultanc|hrsolutions|talentsolutions|jobseeker|naukri|hiringwings/i;

/** Does the headline name an employer, as in "Technical Recruiter at Natobotics"? */
const NAMES_AN_EMPLOYER = /\bat\s+[A-Z]|@\s*[A-Z]/;

/**
 * Given a recruiter-shaped headline, decide whether they are recruiting for
 * their own employer or for clients — using the one thing a hiring post must
 * carry, the apply route.
 *
 * An in-house recruiter says "send your CV to priya@natobotics.com". An agency
 * recruiter has no company address to offer and falls back to a personal
 * Gmail, or to a domain that says what it is: gallantplacement.in,
 * skillbridgestaffing.co, socialrecruit.in.
 *
 * When neither the email nor the headline names anybody, the post is dropped.
 * That is the right call rather than a harsh one: if nothing in a recruiter's
 * post identifies who is hiring, the board cannot name the company, and a
 * listing that cannot name the company is not worth showing.
 */
function recruiterIsAgency(author: string, email?: string): boolean {
  const domain = email?.split("@")[1] ?? "";
  if (domain && AGENCY_DOMAIN.test(domain)) return true;
  const inHouseAddress = domain && !MAILBOX_DOMAIN.test(domain);
  return !inHouseAddress && !NAMES_AN_EMPLOYER.test(author);
}

/** Pull the first http(s) link that looks like an application destination. */
function applyUrlIn(text: string): string | undefined {
  const urls = text.match(/https?:\/\/[^\s)>\]]+/gi) ?? [];
  const good = urls.find((u) =>
    /lever|greenhouse|ashby|workable|keka|darwinbox|zoho|smartrecruiters|careers?|jobs?|apply|forms\.gle|docs\.google|typeform|linkedin\.com\/jobs/i.test(u),
  );
  return (good ?? urls[0])?.replace(/[.,;]$/, "");
}

/**
 * Lines that introduce a role in a numbered or bulleted list.
 *
 * A single post routinely advertises four openings — "1. BFSI Writer", "2. HR
 * Intern", "3. SEO Intern" — and parseHrPost returns one title, so three of
 * them were being thrown away. Worse, when the headline is a summary rather
 * than a role ("We're expanding our team"), no title parses at all and
 * build-jobs drops the post entirely: four real jobs, zero listings.
 */
const ROLE_LINE = /^[\t ]*(?:\d{1,2}[.)]|[•▪‣*]|[-–—](?=\s))[\t ]*([A-Za-z][^\n:]{3,60})$/gm;

/** Field labels and boilerplate that share the list's shape but name no job. */
const NOT_A_ROLE =
  /^(experience|exp|location|salary|ctc|stipend|qualification|eligibility|skills?|notice|shift|timing|refer|apply|send|email|contact|requirements?|responsibilit|who|what|why|note|budget|joining|immediate|graduate|freshers?)\b/i;

/**
 * Every distinct role a post advertises, in the order written.
 * Empty when the post is about a single role — the caller should fall back to
 * `parsed.title` then.
 */
export function rolesIn(text: string): string[] {
  const out: string[] = [];
  for (const m of text.matchAll(ROLE_LINE)) {
    const role = m[1].trim().replace(/\s*[—–-]\s*(freelancer|full.?time|part.?time|intern(ship)?|remote|contract|wfh|hybrid)\s*$/i, "").trim();
    if (role.length < 4 || NOT_A_ROLE.test(role)) continue;
    if (!/[a-z]/.test(role)) continue; // ALL-CAPS hashtag dumps
    if (!out.includes(role)) out.push(role);
  }
  return out.length > 1 ? out : [];
}

export function parseHrPost(text: string): ParsedPost {
  const line = (re: RegExp) => text.match(re)?.[1]?.trim().replace(/\s+/g, " ");
  return {
    // "WE'RE HIRING | Government Business Manager" / "Position: Production"
    title:
      line(/(?:we.?re |now )?hiring\s*[:|–—-]\s*([^\n|]{4,70})/i) ??
      line(/(?:position|role|job title|designation|opening)\s*[:|–—-]+\s*([^\n|]{4,70})/i) ??
      line(/hiring (?:for |a |an )?([A-Z][^\n|.!]{4,60})/) ??
      line(/^([A-Z][^\n]{4,60})\s*\|\s*(?:hiring|noida|gurgaon|gurugram|delhi)/im),
    location: line(/(?:location|based (?:in|at))\s*[:\-]?\s*([^\n]{3,50})/i),
    // Separators vary wildly: "Salary:", "Salary:-", "Salary –", "💰 Salary "
    salary:
      line(
        /(?:salary|ctc|stipend|package|compensation)\s*[:\-–—]*\s*((?:₹|rs\.?|inr)?\s?[\d][^\n]{0,34})/i,
      ) ??
      // Or an inline amount with no label at all: "₹25,000–₹30,000 + Incentives"
      line(/((?:₹|rs\.?\s?|inr\s?)[\d][\d.,]*\s*(?:k|lpa|lakh|lacs?|cr)?(?:\s*[-–—to]+\s*(?:₹|rs\.?)?[\d][\d.,]*\s*(?:k|lpa|lakh|lacs?|cr)?)?)/i) ??
      line(/\b(\d{2,3}\s?k\s*(?:[-–—]|to)\s*\d{2,3}\s?k)\b/i) ??
      line(/\b(\d{1,3}(?:\.\d)?\s*(?:-|–|to)?\s*\d{0,3}(?:\.\d)?\s*lpa)\b/i),
    // \b on both sides: without the trailing one, "We're expanding our team"
    // parsed as exp -> "anding our team and looking for".
    experience: line(/\b(?:experience|exp\.?)\b\s*[:\-]?\s*([^\n]{2,32})/i),
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.]{2,}/)?.[0],
    phone: text.match(/(?:\+?91[-\s]?)?\b[6-9]\d{9}\b/)?.[0],
    applyUrl: applyUrlIn(text),
  };
}

/**
 * @param text     the post body
 * @param author   the poster's headline, e.g. "HR Recruiter at RecruitByte"
 * @param comments comment text, since many posts put the apply link there
 */
export function screenHrPost(
  text: string,
  author = "",
  comments = "",
): { keep: false; reason: Rejection } | { keep: true; parsed: ParsedPost } {
  if (!HIRING.test(text)) return { keep: false, reason: "not-hiring" };
  if (ENGAGEMENT_FARMING.test(text)) return { keep: false, reason: "engagement-farming" };
  if (DOMESTIC.test(text)) return { keep: false, reason: "domestic-staffing" };
  if (BULK.test(text)) return { keep: false, reason: "bulk-hiring" };
  if (AGENCY.test(`${text} ${author}`)) return { keep: false, reason: "agency" };
  if (!NCR.test(text)) return { keep: false, reason: "not-ncr" };

  // The apply route may be in the comments ("link in comments" is common).
  const parsed = parseHrPost(text);
  parsed.applyUrl ??= applyUrlIn(comments);
  if (!parsed.applyUrl && !parsed.email && !parsed.phone)
    return { keep: false, reason: "no-apply-route" };

  // Deliberately last: a recruiter headline is only damning once the apply
  // route has been read, because the apply route is what separates the two
  // kinds of recruiter.
  // An agency's own domain is proof on its own, whatever the headline says.
  const domain = parsed.email?.split("@")[1];
  if (domain && AGENCY_DOMAIN.test(domain)) return { keep: false, reason: "agency" };

  if (AGENCY_AUTHOR.test(author) && recruiterIsAgency(author, parsed.email))
    return { keep: false, reason: "agency" };

  return { keep: true, parsed };
}
