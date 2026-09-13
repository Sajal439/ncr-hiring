import { Fragment, type ReactNode } from "react";
import { CompanyCard } from "./CompanyCard";
import type { Company } from "@/lib/types";

/**
 * Anything passed as `interleave` is dropped in after the sixth card — two
 * full rows on desktop. Above that it is the first thing on the page; much
 * below it and nobody scrolls to it.
 */
const AFTER = 6;

export function CardGrid({
  companies,
  funding,
  interleave,
}: {
  companies: Company[];
  funding: Record<string, string>;
  interleave?: ReactNode;
}) {
  if (companies.length === 0) {
    return (
      <p className="px-4 py-24 text-center text-sm text-neutral-500">
        No companies match these filters.
      </p>
    );
  }

  return (
    <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
      {companies.map((c, i) => (
        <Fragment key={c.slug}>
          {i === AFTER && interleave ? interleave : null}
          <CompanyCard company={c} funding={funding[c.slug]} />
        </Fragment>
      ))}
      {companies.length <= AFTER && interleave ? interleave : null}
    </div>
  );
}
