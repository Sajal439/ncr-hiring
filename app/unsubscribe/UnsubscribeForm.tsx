"use client";

import { useState } from "react";

/**
 * Deliberately a button rather than an automatic unsubscribe on page load:
 * mail clients and security scanners pre-fetch links, and a GET that mutates
 * would unsubscribe people who never clicked anything.
 */
export function UnsubscribeForm({ id }: { id: string }) {
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");

  if (state === "done") {
    return (
      <p className="mt-2 text-sm text-neutral-600">
        Done — you won&rsquo;t get the digest again. The board stays open at{" "}
        <a href="/jobs" className="underline">
          /jobs
        </a>
        .
      </p>
    );
  }

  return (
    <>
      <p className="mt-2 text-sm text-neutral-600">
        Stop receiving the daily Delhi NCR jobs digest?
      </p>
      {state === "error" && (
        <p className="mt-2 text-sm text-red-600">
          That didn&rsquo;t work. Reply to any digest and we&rsquo;ll remove you by hand.
        </p>
      )}
      <button
        onClick={async () => {
          setState("sending");
          const res = await fetch("/api/unsubscribe", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ id }),
          }).catch(() => null);
          setState(res?.ok ? "done" : "error");
        }}
        disabled={state === "sending"}
        className="mt-4 w-full rounded-lg bg-neutral-900 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
      >
        {state === "sending" ? "Removing you…" : "Yes, unsubscribe me"}
      </button>
    </>
  );
}
