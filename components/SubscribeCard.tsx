"use client";

import { useEffect, useState } from "react";
import { INTERESTS, isEmail } from "@/lib/subscribe";

const DISMISSED_KEY = "ncr-digest-dismissed";
const SUBSCRIBED_KEY = "ncr-digest-subscribed";

/**
 * Corner signup for the 8am digest.
 *
 * Renders nothing until after mount. Two reasons: it reads localStorage, which
 * does not exist on the server, and a component whose first paint differs
 * between the static build and the browser triggers the hydration error that
 * silently killed every filter on /jobs once already.
 *
 * `enabled` is passed from the server, true only when the subscriber sheet is
 * actually configured. Without that gate the form would still accept signups
 * and drop them into a server log — collecting an address and then never
 * writing to anyone is worse than not asking.
 */
export function SubscribeCard({ enabled }: { enabled: boolean }) {
  const [mounted, setMounted] = useState(false);
  /** Separate from `mounted` so the card can be in the DOM for one frame at
   *  its off-screen start position before it is told to slide in. */
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!enabled) return;
    try {
      if (localStorage.getItem(DISMISSED_KEY) || localStorage.getItem(SUBSCRIBED_KEY)) return;
    } catch {
      // Private browsing throws on access. A blocked read is not a reason to
      // hide the form, only a reason not to remember the answer.
    }
    /**
     * Wait for the visitor to scroll before asking for their address.
     *
     * A six-second timer used to do this, which meant the card arrived while
     * people were still reading the first screen — an interruption, and the
     * kind that gets dismissed reflexively. Scrolling is the cheapest evidence
     * that someone is actually looking through the roles, and someone looking
     * through the roles is exactly who wants them mailed to them.
     *
     * Capture-phase, on window: the jobs list scrolls inside `main`, not the
     * document, so a plain window scroll listener never fires on the homepage.
     * Capture sees the event on its way down from any scroller on the page.
     */
    const show = () => {
      setMounted(true);
      window.removeEventListener("scroll", onScroll, true);
    };
    const onScroll = (e: Event) => {
      const el = e.target;
      const y =
        el instanceof HTMLElement ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
      if (y > 500) show();
    };
    window.addEventListener("scroll", onScroll, true);

    // A fallback for anyone who reads without scrolling — a short list on a
    // tall screen, or a phone in landscape. Long enough not to interrupt.
    const t = setTimeout(show, 25_000);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      clearTimeout(t);
    };
  }, [enabled]);

  /**
   * One frame between mounting and sliding in. Without it the browser has no
   * "before" to animate from and the card simply appears, which is the thing
   * that reads as an ad.
   *
   * The timer is not belt-and-braces: requestAnimationFrame does not fire
   * while the page is not being rendered, and a card that mounted at
   * opacity-0 waiting for a frame that never comes is invisible rather than
   * merely un-animated. Whichever fires first wins; the other is cancelled.
   */
  useEffect(() => {
    if (!mounted) return;
    const frame = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
    const timer = setTimeout(() => setShown(true), 80);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [mounted]);

  /** Closing resets both, so a later re-open slides in again rather than
   *  appearing already in place. */
  const hide = () => {
    setShown(false);
    setMounted(false);
  };

  /**
   * The header's "Daily digest" button. It has to bypass the localStorage
   * check above: someone clicking it is asking for the form, and refusing
   * because they once closed the popup would be absurd.
   */
  useEffect(() => {
    if (!enabled) return;
    const open = () => setMounted(true);
    window.addEventListener("ncr-open-digest", open);
    return () => window.removeEventListener("ncr-open-digest", open);
  }, [enabled]);

  if (!mounted) return null;

  const toggle = (i: string) =>
    setInterests((prev) => (prev.includes(i) ? prev.filter((x) => x !== i) : [...prev, i]));

  const remember = (key: string) => {
    try {
      localStorage.setItem(key, "1");
    } catch {
      /* nothing to do — the visitor sees the form again next time */
    }
  };

  const close = () => {
    remember(DISMISSED_KEY);
    hide();
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isEmail(email)) {
      setError("That email doesn't look right");
      return;
    }
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, interests }),
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(out.error || "Could not sign you up");
      remember(SUBSCRIBED_KEY);
      setState("done");
    } catch (err) {
      setState("error");
      setError(err instanceof Error ? err.message : "Could not sign you up");
    }
  }

  /**
   * Full width on a phone, a card on the right on anything bigger. The old
   * shell was a 330px box pinned bottom-right at every size, which on a 375px
   * screen left a 21px margin and read as something that had escaped its
   * container.
   *
   * The slide comes from the right on desktop and from the bottom on mobile,
   * because that is the edge each one is attached to. motion-reduce drops the
   * movement and keeps the fade.
   */
  const shell = [
    "fixed z-[600] rounded-xl bg-white shadow-lg ring-1 ring-black/5",
    "inset-x-3 bottom-3 sm:inset-x-auto sm:right-3 sm:w-[330px]",
    "transition duration-500 ease-out motion-reduce:transition-opacity",
    shown
      ? "translate-y-0 opacity-100 sm:translate-x-0"
      : "translate-y-6 opacity-0 sm:translate-y-0 sm:translate-x-8",
  ].join(" ");

  if (state === "done") {
    return (
      <aside className={`${shell} p-4`}>
        <p className="text-sm font-semibold text-neutral-900">You&rsquo;re in.</p>
        <p className="mt-1 text-xs leading-relaxed text-neutral-600">
          Tomorrow at 8am you&rsquo;ll get the roles posted across Delhi NCR in the previous 24
          hours{interests.length ? ", filtered to what you picked" : ""}. Every email has a
          one-click unsubscribe.
        </p>
        <button
          onClick={hide}
          className="mt-3 text-xs font-medium text-neutral-500 transition hover:text-neutral-900"
        >
          Close
        </button>
      </aside>
    );
  }

  if (!open) {
    return (
      <div
        className={`fixed bottom-3 right-3 z-[600] flex items-center gap-1 transition duration-500 ease-out motion-reduce:transition-opacity ${
          shown ? "translate-x-0 opacity-100" : "translate-x-8 opacity-0"
        }`}
      >
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow ring-1 ring-black/5 transition hover:bg-neutral-50"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          Fresh NCR jobs, 8am daily
        </button>
        <button
          onClick={close}
          aria-label="No thanks"
          className="rounded-lg bg-white px-2 py-2 text-xs text-neutral-400 shadow ring-1 ring-black/5 transition hover:text-neutral-900"
        >
          ✕
        </button>
      </div>
    );
  }

  return (
    <aside className={shell}>
      <header className="flex items-start justify-between border-b border-neutral-100 px-3.5 py-2.5">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Daily job digest
          </h2>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Yesterday&rsquo;s new NCR roles, in your inbox at 8am.
          </p>
        </div>
        <button
          onClick={close}
          aria-label="Close"
          className="pl-2 text-neutral-400 transition hover:text-neutral-900"
        >
          ✕
        </button>
      </header>

      <form onSubmit={submit} className="px-3.5 py-3">
        <div className="flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            autoComplete="name"
            className="w-1/3 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs outline-none transition focus:border-neutral-400"
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            type="email"
            autoComplete="email"
            required
            className="w-2/3 rounded-lg border border-neutral-200 px-2.5 py-1.5 text-xs outline-none transition focus:border-neutral-400"
          />
        </div>

        <p className="mt-3 text-[11px] font-medium text-neutral-500">
          What should we send? <span className="font-normal">Leave blank for everything.</span>
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {INTERESTS.map((i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={`rounded-full px-2 py-0.5 text-[11px] transition ${
                interests.includes(i)
                  ? "bg-neutral-900 text-white"
                  : "bg-neutral-100 text-neutral-600 hover:bg-neutral-200"
              }`}
            >
              {i}
            </button>
          ))}
        </div>

        {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={state === "sending"}
          className="mt-3 w-full rounded-lg bg-neutral-900 py-2 text-xs font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50"
        >
          {state === "sending" ? "Signing you up…" : "Send me the daily digest"}
        </button>
        <p className="mt-2 text-[10px] leading-relaxed text-neutral-400">
          One email a day, only when there are new roles. Unsubscribe in one click.
        </p>
      </form>
    </aside>
  );
}
