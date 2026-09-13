"use client";

import { useSyncExternalStore, type ReactNode } from "react";

const subscribe = () => () => {};

/**
 * Renders its children only after hydration.
 *
 * Some state can only come from the browser — here, the filters and view that
 * Explorer restores from the query string so that pressing back returns you to
 * where you were. Reading `window.location` while rendering on the server is
 * impossible, and reading it in a lazy `useState` initialiser produces markup
 * that disagrees with the prerender, which is the hydration failure that once
 * silently killed every filter on /jobs.
 *
 * `useSyncExternalStore` is the sanctioned way to express "this value differs
 * between server and client": React renders the server snapshot during
 * hydration and re-renders with the client one immediately after, with no
 * mismatch and no setState inside an effect.
 *
 * The cost is one frame of the fallback. On this page that is invisible — the
 * map is already a client-only dynamic import behind its own loader.
 */
export function ClientOnly({ children, fallback = null }: { children: ReactNode; fallback?: ReactNode }) {
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return <>{mounted ? children : fallback}</>;
}
