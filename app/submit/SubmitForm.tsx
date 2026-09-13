"use client";

import { useState } from "react";

type Kind = "startup" | "job";

const COMMON = [
  { name: "contact", label: "Your email", required: true, placeholder: "so I can come back to you" },
  { name: "notes", label: "Anything else", placeholder: "optional" },
];

const BY_KIND: Record<Kind, { name: string; label: string; required?: boolean; placeholder?: string }[]> = {
  startup: [
    { name: "company", label: "Startup name", required: true },
    { name: "website", label: "Website", required: true, placeholder: "https://" },
    { name: "oneLiner", label: "What it does, in one line", required: true },
    { name: "location", label: "NCR office address", required: true, placeholder: "street address, not just the city" },
    { name: "sector", label: "Sector", placeholder: "Fintech, SaaS, D2C…" },
    { name: "stage", label: "Stage", placeholder: "Seed, Series A…" },
    { name: "founded", label: "Founded", placeholder: "year" },
  ],
  job: [
    { name: "company", label: "Company name", required: true },
    { name: "roleTitle", label: "Role title", required: true },
    { name: "applyUrl", label: "Apply link", required: true, placeholder: "https://" },
    { name: "location", label: "Where", required: true, placeholder: "Gurugram, Noida…" },
    { name: "salary", label: "Salary or stipend", placeholder: "optional, but it doubles applications" },
    { name: "website", label: "Company website", placeholder: "https://" },
  ],
};

export function SubmitForm() {
  const [kind, setKind] = useState<Kind>("startup");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  if (state === "done") {
    return (
      <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <p className="font-semibold text-emerald-900">Got it.</p>
        <p className="mt-1.5 text-sm leading-relaxed text-emerald-800">
          I check these by hand before anything goes on the board, usually within a day. If
          something doesn&apos;t add up I&apos;ll email you rather than quietly drop it.
        </p>
        <button
          onClick={() => setState("idle")}
          className="mt-3 text-sm font-medium text-emerald-900 underline"
        >
          Submit another
        </button>
      </div>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(e.currentTarget).entries());
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...data, type: kind }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Could not send that");
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not send that");
    }
  }

  return (
    <>
      <div className="mt-6 grid grid-cols-2 gap-2">
        {(["startup", "job"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            aria-pressed={kind === k}
            className={`rounded-xl border px-4 py-3 text-left transition ${
              kind === k
                ? "border-indigo-300 bg-indigo-50"
                : "border-neutral-200 bg-white hover:bg-neutral-50"
            }`}
          >
            <span className={`block font-semibold ${kind === k ? "text-indigo-800" : "text-neutral-900"}`}>
              {k === "startup" ? "A startup" : "A job"}
            </span>
            <span className={`mt-0.5 block text-xs ${kind === k ? "text-indigo-600" : "text-neutral-500"}`}>
              {k === "startup" ? "Add it to the map" : "Put a role on the board"}
            </span>
          </button>
        ))}
      </div>

      {/* Keyed on kind so switching clears the other form's answers rather than
          carrying a stale website field across into a job posting. */}
      <form key={kind} onSubmit={submit} className="mt-6 grid gap-4">
        {[...BY_KIND[kind], ...COMMON].map((f) => (
          <label key={f.name} className="grid gap-1.5">
            <span className="text-sm font-medium text-neutral-700">
              {f.label}
              {f.required ? <span className="text-orange-500"> *</span> : null}
            </span>
            <input
              name={f.name}
              required={f.required}
              placeholder={f.placeholder}
              className="h-10 rounded-lg border border-neutral-200 px-3 text-sm outline-none transition focus:border-neutral-400"
            />
          </label>
        ))}

        {error ? <p className="text-sm text-red-600">{error}</p> : null}

        <button
          type="submit"
          disabled={state === "sending"}
          className="mt-2 h-11 rounded-xl bg-neutral-900 font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {state === "sending" ? "Sending…" : kind === "startup" ? "Submit this startup" : "Submit this job"}
        </button>
      </form>
    </>
  );
}
