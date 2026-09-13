import type { Metadata } from "next";
import Link from "next/link";
import QRCode from "qrcode";
import { SITE, upiLink } from "@/lib/site";
import { stats } from "@/lib/data";
import { CoffeePicker, type CoffeeOption } from "./CoffeePicker";

export const metadata: Metadata = {
  title: "Buy me a cold coffee",
  description:
    `${SITE.name} is free and always will be. If it found you a job, a cold coffee is a reasonable finder's fee.`,
  alternates: { canonical: "/coffee" },
};

export default async function CoffeePage() {
  const options: CoffeeOption[] = await Promise.all(
    SITE.coffee.map(async (c) => ({
      ...c,
      deepLink: upiLink(c.amount, `Cold coffee - ${SITE.name}`),
      qrSvg: await QRCode.toString(upiLink(c.amount, `Cold coffee - ${SITE.name}`), {
        type: "svg",
        margin: 1,
        width: 220,
        color: { dark: "#171717", light: "#ffffff" },
      }),
    })),
  );

  return (
    <div className="mx-auto max-w-xl px-5 py-10">
      <Link href="/" className="text-sm text-neutral-500 transition hover:text-neutral-900">
        ← Back to the map
      </Link>

      <h1 className="mt-6 flex items-center gap-2 text-2xl font-bold tracking-tight">
        <span aria-hidden>🥤</span> Buy me a cold coffee
      </h1>
      <p className="mt-2 leading-relaxed text-neutral-600">
        The map is free. The jobs board is free. The 8am digest is free. That is not changing,
        because charging job seekers money feels like charging someone for the ladder while
        they&apos;re in the well.
      </p>
      <p className="mt-3 leading-relaxed text-neutral-600">
        It is not free for me, though. The scraper alone runs about{" "}
        <span className="font-medium text-neutral-900">₹100 a day</span>, which is a genuinely
        annoying amount to be paying so that strangers can find work — and yes, that is more than
        the cold coffee. So if this board put a job in front of you that you would never have
        found by scrolling, this is the tip jar. No login, no subscription, no email begging you
        to come back.
      </p>

      {/* Concrete beats grateful. Someone deciding whether to pay ₹129 wants to
          know what ₹129 does, and this project happens to be metered finely
          enough to answer that honestly — so it says so, instead of thanking
          them vaguely for their "support". */}
      <section className="mt-7 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Where it actually goes (no yacht)
        </h2>
        <ul className="mt-2.5 space-y-1.5 text-sm text-neutral-600">
          <li>
            • <span className="font-medium text-neutral-900">The LinkedIn pull.</span> Billed per
            job, every single morning. It is what keeps{" "}
            {stats.hiring.toLocaleString("en-IN")} companies&apos; roles fresh instead of quietly
            rotting like every other job list you have opened this month.
          </li>
          <li>
            • <span className="font-medium text-neutral-900">Verified pins.</span> Most pins are
            city-level guesses, drawn hollow because a guess should not cosplay as a fact.
            Geocoding upgrades them from &ldquo;somewhere in Noida&rdquo; to an actual building.
          </li>
          <li>
            • <span className="font-medium text-neutral-900">The domain.</span> ncrhiring.in,
            renewed every year whether or not anyone chips in.
          </li>
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-neutral-900">
          Pick your size
        </h2>
        <CoffeePicker options={options} upiId={SITE.upi.id} payeeName={SITE.upi.payeeName} />
      </section>

      <p className="mt-8 border-t border-neutral-100 pt-5 text-sm leading-relaxed text-neutral-500">
        Broke? Been there, that is roughly why this site exists. Send it to a friend who is job
        hunting instead, or{" "}
        <Link href="/submit" className="underline hover:text-neutral-900">
          tell me about a startup
        </Link>{" "}
        the map is missing — honestly that helps more than ₹59 does.
      </p>

      <p className="mt-4 text-xs text-neutral-400">
        Payments go to {SITE.upi.payeeName} over UPI. This is one person and a laptop, not a
        company — no invoice, no GST, nothing tax-deductible, and no refunds because the coffee
        will already be gone.
      </p>
    </div>
  );
}
