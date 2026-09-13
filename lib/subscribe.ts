/**
 * Shared vocabulary for the daily digest, used by the signup form, the API
 * route and the send script, so the three can never drift apart.
 */
import type { BoardJob } from "./data";

/**
 * What a subscriber can ask for. Nine of these are job functions the classifier
 * already assigns; "Internships" is a seniority rather than a function, because
 * students pick a stage of career before they pick a department.
 */
export const INTERESTS = [
  "Engineering",
  "Product",
  "Design",
  "Data",
  "Content",
  "Strategy",
  "Sales & Marketing",
  "Operations",
  "Finance",
  "People",
  "Support",
  "Internships",
] as const;

export type Interest = (typeof INTERESTS)[number];

export type Subscriber = {
  id: string;
  name: string;
  email: string;
  interests: string[];
};

/**
 * Whether a role belongs in this subscriber's digest. No interests selected
 * means everything — a blank preference is a request for the whole board, not
 * for silence.
 */
export function matchesInterests(job: Pick<BoardJob, "fn" | "level">, interests: string[]) {
  if (!interests.length) return true;
  if (interests.includes("Internships") && job.level === "Intern") return true;
  return !!job.fn && interests.includes(job.fn);
}

/**
 * Deliberately loose. The only email worth rejecting at the form is one that
 * cannot possibly deliver; anything stricter turns into a support burden over
 * valid addresses that happen to look unusual.
 */
export function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
