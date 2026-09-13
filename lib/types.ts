export type CompanyType = "startup" | "vc";

export type Company = {
  slug: string;
  name: string;
  type: CompanyType;
  /** One-line pitch shown on cards and as the meta description. */
  tagline: string;
  /** Longer paragraph shown on the detail page. */
  about?: string;
  sector: string;
  stage: string;
  tags: string[];
  /** Coarse NCR area used by the Area filter, derived from `address`. */
  area: string;
  /** Human-readable street address as returned by Google Maps. */
  address: string;
  lat: number;
  lng: number;
  /** Bare domain, e.g. "zomato.com". Used for the site link and the logo. */
  domain?: string;
  founded?: number;
  teamSize?: string;
  /**
   * True when the pin is a city-level approximation rather than a verified
   * office address. Sourced from job postings, which give a city but no street.
   */
  approx?: boolean;
  /**
   * "startup" = looks like a startup (privately held, 20-5000 people, founded
   * 2005+, has a site, not a services/agency industry). "company" = hiring in
   * NCR but not startup-shaped: consultancies, hotels, MNC arms, local firms.
   * The UI shows the startup tier by default.
   */
  tier?: "startup" | "company";
  /** Currently has open roles (from the jobs pull). */
  hiring?: boolean;
  /** Number of open roles seen in the last pull. */
  openJobs?: number;
  /** The company's own careers page, found by crawling their site. */
  careersUrl?: string;
};

export const SECTORS = [
  "AI",
  "Consumer",
  "D2C",
  "Deeptech",
  "Edtech",
  "Fintech",
  "Gaming",
  "Healthtech",
  "Logistics",
  "SaaS",
  "Other",
] as const;

export const STAGES = [
  "Pre-seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C+",
  "Public",
  "Bootstrapped",
  "Acquired",
  "Closed",
  "VC",
  "Unknown",
] as const;
