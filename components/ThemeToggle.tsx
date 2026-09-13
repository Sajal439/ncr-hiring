"use client";

import { useSyncExternalStore } from "react";

export const THEME_KEY = "ncr-theme";

type Theme = "light" | "dark";

/**
 * The theme lives on <html data-theme>, written by the inline script in the
 * document head before first paint. This component reads that attribute rather
 * than keeping its own copy: two sources of truth would let the button
 * disagree with the page it is sitting on.
 *
 * useSyncExternalStore, not useState in an effect — the DOM attribute *is* the
 * external store, and the server has no way to know its value.
 */
const EVENT = "ncr-theme-change";

// No prefers-color-scheme listener: the page opens dark for everyone and only
// an explicit press changes that, so there is nothing for the OS to say.
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

const read = (): Theme =>
  document.documentElement.dataset.theme === "dark" ? "dark" : "light";

/** The server cannot know; dark is what the pre-paint script defaults to. */
const readOnServer = (): Theme => "dark";

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, readOnServer);
  const dark = theme === "dark";

  const toggle = () => {
    document.documentElement.dataset.theme = dark ? "light" : "dark";
    try {
      localStorage.setItem(THEME_KEY, dark ? "light" : "dark");
    } catch {
      // Private browsing throws. The page still flips, it just will not
      // remember — better than refusing to flip.
    }
    window.dispatchEvent(new Event(EVENT));
  };

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-white text-neutral-500 transition hover:bg-neutral-50 hover:text-neutral-900"
    >
      {dark ? (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      )}
    </button>
  );
}
