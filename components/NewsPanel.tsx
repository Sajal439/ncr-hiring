"use client";

import Link from "next/link";
import { useState } from "react";
import type { NewsItem } from "@/lib/data";

/** Relative age from an RSS pubDate, e.g. "3h", "2d". */
function ago(date: string) {
  const t = new Date(date).getTime();
  if (!t) return "";
  const h = Math.floor((Date.now() - t) / 36e5);
  if (h < 1) return "now";
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NewsPanel({ items }: { items: NewsItem[] }) {
  // Closed by default — the map is what people came for. News is opt-in.
  const [open, setOpen] = useState(false);
  const [page, setPage] = useState(0);
  const perPage = 5;
  const pages = Math.ceil(items.length / perPage);

  if (!items.length) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="absolute right-3 top-3 z-[500] flex items-center gap-1.5 rounded-lg bg-white px-3 py-2 text-xs font-medium text-neutral-700 shadow ring-1 ring-black/5 transition hover:bg-neutral-50"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        Latest news
        <span className="text-neutral-400">({items.length})</span>
      </button>
    );
  }

  const shown = items.slice(page * perPage, page * perPage + perPage);

  return (
    <aside className="absolute right-3 top-3 z-[500] w-[330px] max-w-[calc(100vw-1.5rem)] rounded-xl bg-white shadow-lg ring-1 ring-black/5">
      <header className="flex items-center justify-between border-b border-neutral-100 px-3.5 py-2.5">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
          Latest news
        </h2>
        <button
          onClick={() => setOpen(false)}
          aria-label="Hide news"
          className="text-neutral-400 transition hover:text-neutral-900"
        >
          ✕
        </button>
      </header>

      <ul className="divide-y divide-neutral-100">
        {shown.map((n) => (
          <li key={n.url} className="px-3.5 py-2.5">
            <a
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="line-clamp-2 text-[13px] leading-snug text-neutral-800 hover:underline"
            >
              {n.title}
            </a>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-neutral-400">
              <span>{n.source}</span>
              <span>·</span>
              <span>{ago(n.date)}</span>
              {n.company ? (
                <Link
                  href={`/company/${n.company}`}
                  className="ml-auto rounded bg-neutral-100 px-1.5 py-0.5 font-medium text-neutral-600 hover:bg-neutral-200"
                >
                  on the map ↗
                </Link>
              ) : null}
            </div>
          </li>
        ))}
      </ul>

      <footer className="flex items-center justify-between px-3.5 py-2 text-[11px] text-neutral-400">
        <span>
          {page * perPage + 1}–{Math.min((page + 1) * perPage, items.length)} of {items.length}
        </span>
        <span className="flex gap-1">
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded px-2 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
          >
            Prev
          </button>
          <button
            onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
            disabled={page >= pages - 1}
            className="rounded px-2 py-1 font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-30"
          >
            Next
          </button>
        </span>
      </footer>
    </aside>
  );
}
