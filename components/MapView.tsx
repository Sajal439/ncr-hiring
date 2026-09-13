"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import L from "leaflet";
import "leaflet.markercluster";
import type { Company } from "@/lib/types";

const SECTOR_COLOR: Record<string, string> = {
  AI: "#7c3aed",
  Consumer: "#e11d48",
  D2C: "#db2777",
  Deeptech: "#0891b2",
  Edtech: "#ea580c",
  Fintech: "#2563eb",
  Gaming: "#9333ea",
  Healthtech: "#059669",
  Logistics: "#65a30d",
  SaaS: "#0d9488",
  Other: "#64748b",
};

/** Cluster bubble sized and shaded by how many companies it holds. */
function clusterIcon(count: number) {
  const size = count < 10 ? 32 : count < 50 ? 40 : count < 200 ? 48 : 56;
  const bg = count < 10 ? "#86efac" : count < 50 ? "#fcd34d" : count < 200 ? "#fb923c" : "#f87171";
  return L.divIcon({
    html: `<div style="width:${size}px;height:${size}px;background:${bg}"
      class="flex items-center justify-center rounded-full border-2 border-white text-[13px] font-semibold text-neutral-900 shadow-md">${count}</div>`,
    className: "",
    iconSize: [size, size],
  });
}

export default function MapView({ companies }: { companies: Company[] }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const cluster = useRef<L.MarkerClusterGroup | null>(null);
  const router = useRouter();

  // Create the map once; StrictMode double-invokes effects, hence the guard.
  useEffect(() => {
    if (!el.current || map.current) return;
    const m = L.map(el.current, { zoomControl: false }).setView([28.52, 77.15], 11);
    // CARTO stamps "API KEY REQUIRED" across keyless tiles in the browser, so
    // the default has to be OpenStreetMap. For the muted grey basemap, get a
    // free MapTiler key (100k loads/month) and set NEXT_PUBLIC_TILE_URL to
    // https://api.maptiler.com/maps/dataviz-light/{z}/{x}/{y}.png?key=YOUR_KEY
    L.tileLayer(
      process.env.NEXT_PUBLIC_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    ).addTo(m);
    L.control.zoom({ position: "bottomright" }).addTo(m);
    map.current = m;
    return () => {
      m.remove();
      map.current = null;
      cluster.current = null;
    };
  }, []);

  // Re-render markers whenever the filtered set changes.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    cluster.current?.remove();

    const group = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 45,
      iconCreateFunction: (c) => clusterIcon(c.getChildCount()),
    });

    for (const c of companies) {
      const color = SECTOR_COLOR[c.sector] ?? SECTOR_COLOR.Other;
      // Approximate pins are drawn hollow so they never read as verified.
      const dot = c.approx
        ? `<div style="border-color:${color}" class="h-3.5 w-3.5 rounded-full border-2 bg-white/80 shadow"></div>`
        : `<div style="background:${color}" class="h-3.5 w-3.5 rounded-full border-2 border-white shadow"></div>`;
      const marker = L.marker([c.lat, c.lng], {
        title: c.name,
        icon: L.divIcon({ className: "", iconSize: [14, 14], html: dot }),
      });
      marker.bindTooltip(
        `<span class="font-medium">${c.name}</span><br><span class="text-neutral-500">${c.area}${c.approx ? " (approx)" : ""}</span>` +
          (c.openJobs ? `<br><span class="text-emerald-600">${c.openJobs} open role${c.openJobs > 1 ? "s" : ""}</span>` : ""),
        { direction: "top", offset: [0, -8] },
      );
      marker.on("click", () => router.push(`/company/${c.slug}`));
      group.addLayer(marker);
    }

    group.addTo(m);
    cluster.current = group;
  }, [companies, router]);

  return <div ref={el} className="h-full w-full" />;
}
