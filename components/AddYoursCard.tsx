import Link from "next/link";

/**
 * The way in for anything the crawlers missed.
 *
 * This lived in the header as an orange "Submit" button, next to the view
 * toggle and the coffee link, where it had room for one word and competed with
 * the only other coloured control on the page. A button that says "Submit"
 * describes what you do; it never says what it is for or what it costs, and
 * those are the two things stopping someone from clicking.
 */
export function AddYoursCard() {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white p-4">
      <p className="text-sm font-semibold text-neutral-900">Not on the board?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-neutral-500">
        Everything here is scraped, so this is the way in for a company the crawlers missed — or a
        role that was never posted publicly.
      </p>
      <Link
        href="/submit"
        className="mt-3 block rounded-xl bg-neutral-900 py-2 text-center text-[13px] font-semibold text-white transition hover:bg-neutral-700"
      >
        Add your startup or job
      </Link>
      <p className="mt-2 text-center text-[11px] text-neutral-400">
        Free · checked by hand · usually live within a day
      </p>
    </div>
  );
}
