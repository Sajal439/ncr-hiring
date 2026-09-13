"use client";

import { useState } from "react";

/**
 * QR plus a copyable VPA. Both matter: desktop users scan with their phone,
 * mobile users would rather paste the ID into an app they already have open.
 */
export function UpiCard({
  qrSvg,
  upiId,
  amount,
  deepLink,
}: {
  qrSvg: string;
  upiId: string;
  amount: number;
  deepLink: string;
}) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);

  async function copy() {
    // navigator.clipboard needs a secure context and can be blocked by
    // permissions policy, so fall back to the old selection trick rather than
    // leaving the button silently doing nothing.
    let ok = false;
    try {
      await navigator.clipboard.writeText(upiId);
      ok = true;
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = upiId;
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.append(el);
        el.select();
        ok = document.execCommand("copy");
        el.remove();
      } catch {
        ok = false;
      }
    }
    setCopied(ok);
    if (ok) setTimeout(() => setCopied(false), 1800);
    else setFailed(true);
  }

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-neutral-200">
      <div className="flex flex-col items-center gap-3 bg-white px-5 py-6">
        <div
          className="rounded-xl bg-white p-2 ring-1 ring-neutral-100 [&>svg]:h-[200px] [&>svg]:w-[200px]"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />

        <p className="text-sm text-neutral-500">
          Scan to pay{" "}
          <span className="font-semibold text-neutral-900">₹{amount.toLocaleString("en-IN")}</span>{" "}
          with any UPI app
        </p>

        <button
          onClick={copy}
          className="group flex w-full max-w-xs items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-2.5 text-left transition hover:border-neutral-300 hover:bg-neutral-100"
        >
          <span className="min-w-0">
            <span className="block text-[10px] font-medium uppercase tracking-wide text-neutral-400">
              UPI ID
            </span>
            <span className="block select-all truncate font-mono text-sm font-semibold text-neutral-900">
              {upiId}
            </span>
          </span>
          <span
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition ${
              copied ? "bg-emerald-600 text-white" : "bg-neutral-900 text-white group-hover:bg-neutral-700"
            }`}
          >
            {copied ? "Copied ✓" : "Copy"}
          </span>
        </button>

        {failed ? (
          <p className="text-xs text-neutral-400">
            Copy blocked by your browser — tap the ID above to select it.
          </p>
        ) : null}

        <a
          href={deepLink}
          className="w-full max-w-xs rounded-xl bg-orange-500 py-2.5 text-center text-sm font-medium text-white transition hover:bg-orange-600 sm:hidden"
        >
          Pay ₹{amount.toLocaleString("en-IN")} in UPI app
        </a>
      </div>
    </div>
  );
}
