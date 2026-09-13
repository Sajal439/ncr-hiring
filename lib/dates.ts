/**
 * Ages measured in Delhi's calendar, not the machine's.
 *
 * Dates on the board are stored as bare YYYY-MM-DD, which JavaScript parses as
 * midnight UTC. Comparing that against Date.now() and dividing by a day gives
 * the number of *elapsed* days, which is not the same as the number of
 * calendar days — and the two disagree for five and a half hours every night,
 * because IST is UTC+5:30.
 *
 * A role posted on 5 September, read at 03:11 on the 6th in Delhi, is 21.7
 * hours old. Floor that and you get 0, so the card says "today" while the
 * reader's phone says the 6th and LinkedIn says "23 hours ago". Every listing
 * on the board looked a day fresher than it was, to anyone browsing between
 * midnight and 05:30 — which on a jobs board is a real slice of the audience.
 *
 * Everyone this is built for is in one timezone, so the honest thing is to use
 * it: convert both sides to an IST day number and subtract.
 */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Day number in IST. Two timestamps on the same Delhi date share one. */
export const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / 86_400_000);

/** Whole calendar days between a stored date and now, as Delhi counts them. */
export function daysAgo(date: string, now: number): number {
  return istDay(now) - istDay(Date.parse(date));
}

/** Today's date in Delhi, as the same YYYY-MM-DD the data is stored in. */
export const istToday = (now: number) =>
  new Date(now + IST_OFFSET_MS).toISOString().slice(0, 10);
