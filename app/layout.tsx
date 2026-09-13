import type { Metadata, Viewport } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { SITE } from "@/lib/site";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./globals.css";

const url = SITE.url;

export const metadata: Metadata = {
  metadataBase: new URL(url),
  title: {
    default: `${SITE.name} — Jobs at startups in Gurugram, Noida & Delhi`,
    template: `%s — ${SITE.name}`,
  },
  description:
    "Every open role at companies hiring across Delhi NCR, rebuilt every morning. Filter by field, level and pay, or browse them on a map.",
  openGraph: {
    title: SITE.name,
    description:
      "Every open role at companies hiring across Delhi NCR, rebuilt every morning.",
    url,
    siteName: SITE.name,
    type: "website",
  },
  twitter: { card: "summary_large_image" },
};

/** Paints the mobile browser chrome to match. Single value, not a
 *  prefers-color-scheme pair, because the page no longer follows the OS. */
export const viewport: Viewport = { themeColor: "#131316" };

/**
 * Runs before the first paint, so nobody sees a white flash before the dark
 * page arrives.
 *
 * Dark is the default rather than the OS preference: this is a board people
 * open at night and scroll, and the owner wants it to open dark for everyone
 * who has not said otherwise. Only an explicit choice, stored under
 * "ncr-theme", overrides it — the OS is not consulted at all, because a
 * light-OS visitor following their system would be exactly the case this is
 * meant to prevent.
 * It has to be inline and blocking: any bundle would load after the browser
 * has already painted the light page, and the flash is exactly what makes a
 * dark mode feel bolted on.
 *
 * Deliberately tiny and dependency-free — it is parsed on every page load.
 */
const setTheme = `try{document.documentElement.dataset.theme=localStorage.getItem("ncr-theme")||"dark"}catch(e){document.documentElement.dataset.theme="dark"}`;

/**
 * Analytics, and only when there is somewhere to send it.
 *
 * Reading the id at render rather than hardcoding it keeps preview deploys and
 * local development out of the numbers: the variable is set on production
 * only, so everywhere else this renders nothing at all rather than quietly
 * logging every hot reload as a visit.
 *
 * The component is Next's own wrapper, which loads gtag after hydration
 * instead of blocking first paint — this is a page people open on a phone on
 * mobile data, and a job board that loads slowly is a job board nobody uses.
 */
const gaId = process.env.NEXT_PUBLIC_GA_ID;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: setTheme }} />
      </head>
      <body className="bg-white text-neutral-900 antialiased">{children}</body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
