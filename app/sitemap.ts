import { SITE } from "@/lib/site";
import type { MetadataRoute } from "next";
import { companies } from "@/lib/data";

const base = SITE.url;

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: base, priority: 1 },
    { url: `${base}/jobs`, priority: 0.9 },
    { url: `${base}/submit`, priority: 0.5 },
    ...companies.map((c) => ({ url: `${base}/company/${c.slug}`, priority: 0.8 })),
  ];
}
