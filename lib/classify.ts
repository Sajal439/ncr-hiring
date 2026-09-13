/**
 * Derives a role and a seniority from a raw job title.
 *
 * Job boards give us free-text titles ("Sr. Assoc, Enterprise Partnerships"),
 * which are unusable as facets. These rules turn them into two short labels so
 * roles read consistently across LinkedIn and company career pages.
 *
 * ── Why these are roles, not functions ────────────────────────────────────
 * The first version of this filter listed business functions: Product,
 * Content, People, Finance, Strategy. That is how a company org chart is
 * drawn, and it is not how anyone looks for a job. A final-year student types
 * "data analyst", "SDE", "consultant" — the name of the job they want, not the
 * department it reports into. Filters named after departments made them scan a
 * list of words they would never have searched, and the three biggest ones
 * ("Engineering, 492") were far too coarse to shop in anyway.
 *
 * So the facet is now the role itself. Measured over the 2,458 live listings,
 * this also classifies more of the board than the function scheme did:
 * unclassified fell from 15.9% to 13.6%. What is left in Other is genuinely
 * ambiguous — bare "Manager", "Executive", "Officer", "Specialist" with no
 * domain word anywhere in the title — and inventing a bucket for those would
 * be guessing, not classifying.
 *
 * Order matters: the first matching rule wins, so narrow patterns go above
 * broad ones. "Security Engineer" is Cybersecurity, not Software Engineer;
 * "Product Designer" is design, not product.
 *
 * Patterns anchor with a leading \b only. A trailing \b would break prefix
 * matches — "engineer" must still match "Engineering", "data scien" must match
 * "Data Scientist".
 */

export const FUNCTIONS = [
  "Software Engineer",
  "Business Development & Sales",
  "UI/UX & Graphic Design",
  "Consultant",
  "IT Support & Admin",
  "Operations & Supply Chain",
  "Digital Marketing",
  "Finance & Accounts",
  "Cloud & DevOps",
  "Content Writer",
  "Cybersecurity",
  "Customer Support",
  "Admin & Legal",
  "Data Analyst",
  "Teaching & Training",
  "HR & Recruiter",
  "Data Scientist & AI/ML",
  "QA & Testing",
  "Healthcare",
  "Founder's Office & Strategy",
  "Product Manager",
  "Other",
] as const;

export type JobFunction = (typeof FUNCTIONS)[number];

const FUNCTION_RULES: Array<[JobFunction, RegExp]> = [
  // The specific data roles first: "Data Scientist" must not be caught by the
  // generic \banalyst\b rule that runs near the bottom.
  ["Data Scientist & AI/ML", /\b(data scien|machine learning|ml engineer|ai engineer|deep learning|nlp\b|computer vision|research scien|generative ai|llm\b)/i],
  ["Data Analyst", /\b(data analy|business analyst|bi analyst|business intelligence|power bi|tableau|reporting analyst|mis\b|analytics|systems analyst|research analyst)/i],

  // Ahead of Software Engineer, which owns the bare word "engineer" — these
  // are the engineering roles a student searches for by name.
  ["Cybersecurity", /\b(security|cyber|soc analyst|penetration|vapt|waf\b|firewall|iam\b|infosec)/i],
  ["Cloud & DevOps", /\b(devops|sre\b|site reliability|cloud|aws\b|azure|gcp\b|kubernetes|docker|terraform|platform engineer|infrastructur)/i],
  ["QA & Testing", /\b(qa\b|quality assurance|tester|testing|test (engineer|analyst|automation)|sdet|automation engineer)/i],
  ["IT Support & Admin", /\b(it support|help ?desk|service desk|desktop support|system admin|network (admin|engineer|routing)|technician|storage\b|netapp|vmware|citrix|sharepoint|intune|active directory|windows( server| \d)|linux|itsm|database (admin|manag)|dba\b|sql server|server admin|administrator|middleware|mainframe|kofax|hardware support)/i],

  // Consultant before Software Engineer: an "SAP ABAP Consultant" is hired,
  // paid and searched for as a consultant, and this board is full of them.
  ["Consultant", /\b(consultant|consulting|functional lead|solution (architect|consultant)|implementation (lead|consultant)|sap\b|oracle (apps|fusion|ebs)|salesforce|workday|servicenow|dynamics 365|peoplesoft)/i],

  ["Software Engineer", /\b(software engineer|engineering\b|swe\b|sde\b|developer|programmer|full[- ]?stack|backend|back[- ]end|frontend|front[- ]end|android|ios\b|react|angular|node\.?js|java\b|python|\.net\b|golang|engineer\b|architect|mobile dev|app(lication)?s? development)/i],
  ["Product Manager", /\b(product manag|product owner|associate product|group product|technical product|product analy|product ops)/i],
  ["UI/UX & Graphic Design", /\b(designer|design\b|ux\b|ui\b|graphic|motion|illustrat|creative|visualiser|animator|artist|3d\b|photograph)/i],
  ["Content Writer", /\b(copy ?writer|copy ?writing|content\b|writer\b|editor\b|video edit|videograph|youtube|podcast|journalist|script writ)/i],

  // Marketing above Sales: a "Social Media Marketing Executive" is a marketing
  // job, and the sales rule below is broad enough to swallow it otherwise.
  ["Digital Marketing", /\b(digital market|seo\b|search engine optimi|performance market|paid media|social media|smm\b|ppc\b|google ads|meta ads|growth market|demand gen|brand|public relation|marketing|market(er|ers)\b|orm\b)/i],
  // Counselling and admissions sit here on purpose: at an edtech an
  // "Admissions Counselor" is an inside sales job, and there are enough of
  // them on this board to matter.
  ["Business Development & Sales", /\b(sales|business development|bd\b|bdr\b|account manag|account executive|account develop|key account|inside sales|telecall|pre-?sales|partnership|alliance|channel|relationship (manag|officer)|counsel(or|lor|ling)|admission|field officer|leasing|revenue|category manag|e-?commerce)/i],

  ["HR & Recruiter", /\b(recruit|talent acquisition|talent\b|human resource|hr\b|people ops|people partner|payroll executive|learning and development|l&d\b|training manag)/i],
  ["Finance & Accounts", /\b(financ|accountant|accounts|audit|tax\b|treasury|controller|payroll|billing|invest(?:ment)? bank|cost analyst|valuation|reconcil|settlement|fraud|dispute|underwrit|credit (analyst|manag|officer)|collections|claims)/i],
  ["Customer Support", /\b(customer (support|success|service|experience|care)|technical support|client servic|client success|retention|renewals|chat (support|process)|voice process|bpo\b|call cent|tele ?support|back ?office|front desk|receptionist|guest servic|grievance)/i],
  ["Teaching & Training", /\b(professor|faculty|lecturer|teacher|tutor|trainer|principal|librarian|prt\b|tgt\b|pgt\b|academic|curriculum|instructor)/i],
  ["Healthcare", /\b(doctor|physician|dermatolog|dentist|nurse|therapist|physio|clinical|pharmac|radiolog|patholog|medical officer|surgeon|nutritionist|dietician)/i],
  ["Founder's Office & Strategy", /\b(founder.?s office|entrepreneur in residence|chief of staff|strateg(y|ist|ic)|corporate development)/i],
  ["Operations & Supply Chain", /\b(operation|ops\b|supply chain|logistic|warehouse|procurement|purchasing|sourcing|inventory|vendor|dispatch|fleet|store manag|facilit|process (executive|associate|specialist)|program (manag|control)|project (manag|lead|direct|engineer|control)|pmo\b|coordinator|quality (control|engineer|inspect|assur)|production|manufactur|maintenance|planning|supervisor|team lead|shift incharge|site engineer|field (supervisor|service|engineer)|installation|commissioning|chef|kitchen|housekeep)/i],
  ["Admin & Legal", /\b(executive assistant|virtual assistant|personal assistant|office (admin|manag|boy)|admin\b|legal|lawyer|advocate|complian|company secretary|risk\b|clerk|documentation|secretary)/i],

  // Deliberately last. "Analyst" alone is a real thing students search, but it
  // must not outrank a title that says which kind of analyst it is.
  ["Data Analyst", /\banalyst\b/i],
];

/**
 * A second level, for the one role broad enough to need it.
 *
 * "Software Engineer, 227 roles" is still a category you cannot shop in, and
 * the split a candidate cares about — frontend or backend — is not visible
 * from the top-level name. The other roles are already specific enough that a
 * second level would be inventing distinctions the titles do not make.
 *
 * The old Sales & Marketing specialties are gone: sales, marketing and
 * partnerships are separate roles at the top level now, so the sub-menu would
 * only repeat what the main filter already says.
 *
 * Roughly half of engineering titles stay unclassified here — "Software
 * Engineer" genuinely does not say more than that, and guessing would be worse
 * than leaving it blank.
 */
export const SPECIALTIES: Partial<Record<JobFunction, readonly string[]>> = {
  "Software Engineer": ["Frontend", "Backend", "Full-stack", "Mobile", "Enterprise & ERP", "Embedded & hardware"],
};

const SPECIALTY_RULES: Partial<Record<JobFunction, Array<[string, RegExp]>>> = {
  "Software Engineer": [
    // Full-stack first: a "full stack react developer" is not a frontend role.
    ["Full-stack", /\bfull[- ]?stack/i],
    ["Mobile", /\b(android|ios\b|flutter|react native|mobile (app|develop)|kotlin|swift\b)/i],
    ["Enterprise & ERP", /\b(erp\b|netsuite|abap|hana)/i],
    ["Embedded & hardware", /\b(embedded|firmware|vlsi|pcb\b|hardware|iot\b|electronics|mechanical|electrical)/i],
    ["Frontend", /\b(frontend|front[- ]end|react|angular|vue|ui develop|javascript|typescript|web develop)/i],
    ["Backend", /\b(backend|back[- ]end|api develop|node\.?js|django|spring|micro ?services|golang)/i],
  ],
};

/** The narrower label under `fn`, or undefined when the title does not say. */
export function specialtyOf(title: string, fn: JobFunction): string | undefined {
  for (const [name, re] of SPECIALTY_RULES[fn] ?? []) if (re.test(title)) return name;
  return undefined;
}

export function functionOf(title: string): JobFunction {
  for (const [fn, re] of FUNCTION_RULES) if (re.test(title)) return fn;
  return "Other";
}

/**
 * Whether the listing says it is remote.
 *
 * "Says" is doing real work in that sentence. None of the four sources carries
 * a workplace-type field — LinkedIn's `workType` is the job function, not the
 * arrangement — so the only evidence is the words in the title, and 22 of 5,228
 * listings volunteer them. A false here means "not stated", never "on-site",
 * which is why the filter shows its count: 22 is the honest size of what we
 * know, not a claim about the rest of the board.
 */
export function isRemote(title = "", location = ""): boolean {
  return /\b(remote|work from home|wfh)\b/i.test(`${title} ${location}`);
}

export const SENIORITIES = ["Intern", "Junior", "Mid", "Senior", "Lead", "Exec"] as const;
export type Seniority = (typeof SENIORITIES)[number];

const SENIORITY_RULES: Array<[Seniority, RegExp]> = [
  // `\bintern` with no closing boundary — this file's usual convention — also
  // matched "Internal Communications Manager", "International Sales" and "For
  // Internal Use Only". 38 roles on the board were filed as internships on the
  // strength of a word that has nothing to do with one, and they were showing
  // up under the Intern filter to people looking for their first job. The
  // closing \b is required here; the optional ship/s keeps internship(s).
  ["Intern", /\bintern(ship)?s?\b|\b(trainee|apprentice|campus)/i],
  ["Exec", /\b(chief|cxo|ceo\b|cto\b|cfo\b|coo\b|cmo\b|vp\b|vice president|president|founder)/i],
  ["Lead", /\b(head of|head[, -]|director|lead\b|principal|staff engineer|general manag)/i],
  ["Senior", /\b(senior|sr\.?\b|manager|specialist)/i],
  ["Junior", /\b(junior|jr\.?\b|associate|analyst|executive|entry|fresher|assistant)/i],
];

export function seniorityOf(title: string, levelHint?: string): Seniority {
  for (const [s, re] of SENIORITY_RULES) if (re.test(title)) return s;
  // Fall back to the board's own level field when the title says nothing.
  if (levelHint) {
    if (/intern/i.test(levelHint)) return "Intern";
    if (/entry|associate/i.test(levelHint)) return "Junior";
    if (/mid|senior/i.test(levelHint)) return "Senior";
    if (/director|executive/i.test(levelHint)) return "Lead";
  }
  return "Mid";
}
