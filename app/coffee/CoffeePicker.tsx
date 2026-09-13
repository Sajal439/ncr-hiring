"use client";

import { SITE } from "@/lib/site";
import { useEffect, useState } from "react";
import { UpiCard } from "@/components/UpiCard";

export type CoffeeOption = {
  amount: number;
  label: string;
  note: string;
  qrSvg: string;
  deepLink: string;
};

const MIN = 1;
const MAX = 100000;

/**
 * Amount picker over the shared UPI card.
 *
 * The three presets are rendered at build time — the amounts are fixed, so
 * there is nothing to compute per visitor, and a payment QR that appears after
 * a JavaScript round-trip is the kind of thing people are right not to trust.
 *
 * "Other" is the exception: that amount cannot be known ahead of time, so its
 * QR is generated in the browser. `qrcode` is imported dynamically so the
 * library only loads for the people who actually pick a custom amount.
 */
export function CoffeePicker({
  options,
  upiId,
  payeeName,
}: {
  options: CoffeeOption[];
  upiId: string;
  payeeName: string;
}) {
  const [i, setI] = useState(1);
  const custom = i === options.length;

  const [raw, setRaw] = useState("");
  // Keyed by the amount it was built for, so switching amounts never shows a
  // QR belonging to the previous one — and nothing has to be cleared in an
  // effect, which is what makes the states below derivable rather than stored.
  const [qr, setQr] = useState<{ amount: number; svg: string } | null>(null);
  const [failedFor, setFailedFor] = useState<number | null>(null);

  const parsed = Number(raw);
  const validCustom = Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= MIN && parsed <= MAX;

  const link = (amount: number) =>
    `upi://pay?${new URLSearchParams({
      pa: upiId,
      pn: payeeName,
      am: String(amount),
      cu: "INR",
      tn: `Cold coffee - ${SITE.name}`,
    })}`;

  const customQr = qr && qr.amount === parsed ? qr.svg : "";
  const failed = failedFor === parsed;
  const building = custom && validCustom && !customQr && !failed;

  useEffect(() => {
    if (!custom || !validCustom) return;
    let cancelled = false;
    // Debounced: typing "1000" would otherwise render four throwaway QRs.
    const t = setTimeout(async () => {
      try {
        const { default: QRCode } = await import("qrcode");
        const svg = await QRCode.toString(link(parsed), {
          type: "svg",
          margin: 1,
          width: 220,
          color: { dark: "#171717", light: "#ffffff" },
        });
        if (!cancelled) setQr({ amount: parsed, svg });
      } catch {
        if (!cancelled) setFailedFor(parsed);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [custom, validCustom, parsed]);

  const picked = custom ? null : options[i];

  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {options.map((o, idx) => {
          const on = idx === i;
          return (
            <button
              key={o.amount}
              onClick={() => setI(idx)}
              aria-pressed={on}
              className={`rounded-xl border px-3 py-3 text-left transition ${
                on
                  ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
                  : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
              }`}
            >
              <span className="block text-lg font-bold">₹{o.amount}</span>
              <span
                className={`mt-0.5 block text-[11px] leading-tight ${on ? "text-indigo-700/75" : "text-neutral-500"}`}
              >
                {o.label}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => setI(options.length)}
          aria-pressed={custom}
          className={`rounded-xl border px-3 py-3 text-left transition ${
            custom
              ? "border-indigo-300 bg-indigo-50 font-medium text-indigo-700"
              : "border-neutral-200 bg-white hover:border-neutral-300 hover:bg-neutral-50"
          }`}
        >
          <span className="block text-lg font-bold">Other</span>
          <span
            className={`mt-0.5 block text-[11px] leading-tight ${custom ? "text-indigo-700/75" : "text-neutral-500"}`}
          >
            Go on then
          </span>
        </button>
      </div>

      {custom ? (
        <div className="mt-4">
          <label htmlFor="coffee-amount" className="block text-sm font-medium text-neutral-700">
            How much?
          </label>
          <div className="mt-1.5 flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-3 py-2.5 focus-within:border-neutral-400">
            <span className="text-lg font-semibold text-neutral-400">₹</span>
            <input
              id="coffee-amount"
              value={raw}
              onChange={(e) => setRaw(e.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              autoComplete="off"
              placeholder="500"
              className="w-full bg-transparent text-lg font-semibold text-neutral-900 outline-none"
            />
          </div>

          {raw && !validCustom ? (
            <p className="mt-2 text-xs text-red-600">
              Enter a whole number between ₹{MIN} and ₹{MAX.toLocaleString("en-IN")}.
            </p>
          ) : null}

          {validCustom ? (
            customQr ? (
              <UpiCard qrSvg={customQr} upiId={upiId} amount={parsed} deepLink={link(parsed)} />
            ) : (
              <p className="mt-4 text-sm text-neutral-400">
                {building ? "Building the QR…" : "Couldn't build a QR — pay the UPI ID directly."}
              </p>
            )
          ) : (
            <p className="mt-3 text-sm text-neutral-500">
              Type an amount and a QR will appear.
            </p>
          )}
        </div>
      ) : (
        <>
          <p className="mt-3 text-sm text-neutral-600">{picked!.note}</p>
          <UpiCard
            qrSvg={picked!.qrSvg}
            upiId={upiId}
            amount={picked!.amount}
            deepLink={picked!.deepLink}
          />
        </>
      )}

      <p className="mt-3 text-xs leading-relaxed text-neutral-400">
        There&apos;s no account, no receipt and nothing to cancel — it&apos;s a one-off UPI
        transfer.
      </p>
    </>
  );
}
