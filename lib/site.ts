/** Single place for the maker credit and other site-level identity. */
export const SITE = {
  /**
   * The name lives here and nowhere else.
   *
   * It was "Delhi NCR Startup Map", which stopped being true twice over: the
   * map is the third tab now, and only 1,050 of the board's 4,125 roles are at
   * startup-tier companies. Hiding the other three quarters to justify a word
   * would have been the wrong trade — so the word went instead, and "Startups
   * only" became a filter on both tabs.
   */
  name: "NCR Hiring",
  /** For the header on narrow screens. */
  shortName: "NCR Hiring",
  tagline: "Who's hiring across Delhi NCR, refreshed every morning",

  /**
   * The canonical origin, and the only place it is written.
   *
   * It used to be hardcoded in four files — and three of them named
   * delhincrstartupmap.com, a domain nobody ever registered. So the sitemap,
   * the canonical tags and robots.txt were all pointing search engines at a
   * hostname that does not resolve, while the site itself lived on a
   * vercel.app subdomain. Moving to a real domain means changing this line and
   * nothing else.
   *
   * No trailing slash: everything downstream appends its own path.
   */
  url: "https://ncrhiring.in",

  author: "Anmol Sethi",
  authorUrl: "https://www.linkedin.com/in/anmol-sethi-79ba03228/",
  contactEmail: "anmolas999@gmail.com",

  /**
   * UPI collection details for ad payments. Deliberately manual: a static UPI
   * intent plus a screenshot check needs no gateway, no KYC and no PCI scope,
   * which is the right trade at this volume. Swap for Razorpay once ads are
   * frequent enough that reconciling by hand hurts.
   */
  upi: {
    id: "anmolsethi374@okhdfcbank",
    payeeName: "Anmol Sethi",
  },

  /**
   * Launch pricing. `listPrice` is what the slot is meant to cost and what the
   * strikethrough shows; `price` is what is actually charged today and what
   * every UPI link and QR is built from. Keeping both here rather than in
   * sponsors.json means the strip, the /advertise page and the payment can
   * never quote three different numbers.
   */
  ads: {
    tilePrice: 1999,
    tileListPrice: 5000,
    tileDays: 7,
    flashPrice: 999,
    flashListPrice: 2500,
    flashHours: 24,
    reviewHours: 12,
  },

  /**
   * Support tiers, priced against what the site actually costs to run rather
   * than picked to look nice.
   *
   * The notes are the thank-you, because there is nowhere else to put one: UPI
   * takes people out to their bank app and never sends them back, so the page
   * never learns that anyone paid. The gratitude has to be spent before the
   * money arrives. Underneath the jokes the numbers are still real — a day's
   * pull is a measured ~400 roles, and the pins really are guesses, which is
   * why they render hollow on the map.
   */
  coffee: [
    {
      amount: 59,
      label: "One cold coffee",
      note: "Standard cold coffee, no ice cream. Buys half a day of a robot reading LinkedIn so you don't have to. Thank you, genuinely.",
    },
    {
      amount: 129,
      label: "The one with ice cream",
      note: "You went for the upgrade. Now a hundred map pins stop saying 'somewhere in Gurugram, probably' and start giving actual addresses.",
    },
    {
      amount: 299,
      label: "A round for the whole floor",
      note: "Three whole days of this thing staying alive, paid for by one person who did not have to. If you ever want a job posting looked at by a human, that human is now me.",
    },
  ],
} as const;

/** UPI deep link — every Indian UPI app understands this scheme. */
export function upiLink(amount: number, note: string) {
  const p = new URLSearchParams({
    pa: SITE.upi.id,
    pn: SITE.upi.payeeName,
    am: String(amount),
    cu: "INR",
    tn: note,
  });
  return `upi://pay?${p}`;
}
