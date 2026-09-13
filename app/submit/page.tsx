import type { Metadata } from "next";
import Link from "next/link";
import { SubmitForm } from "./SubmitForm";

export const metadata: Metadata = {
  title: "List your startup or a job",
  description:
    "Add a Delhi NCR startup to the map, or put an open role on the jobs board. Free, checked by hand.",
  alternates: { canonical: "/submit" },
};

export default function SubmitPage() {
  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Link href="/" className="text-sm text-neutral-500 transition hover:text-neutral-900">
        ← Back to the board
      </Link>

      <h1 className="mt-6 text-2xl font-bold tracking-tight">
        Want your startup or a job on here?
      </h1>
      <p className="mt-2 leading-relaxed text-neutral-600">
        Free, and it stays free. Everything else on this board is scraped, so this is the one way
        in for a company the crawlers missed or a role that was never posted publicly.
      </p>

      <p className="mt-3 rounded-lg bg-neutral-50 px-3.5 py-2.5 text-sm leading-relaxed text-neutral-600">
        Every submission is read by hand before it appears — usually within a day. Approved ones
        go up with the next morning&apos;s rebuild. The whole point of the board is that
        what&apos;s on it is real, so nothing publishes straight through. If something
        doesn&apos;t check out I&apos;ll email you rather than quietly drop it.
      </p>

      <SubmitForm />
    </div>
  );
}
