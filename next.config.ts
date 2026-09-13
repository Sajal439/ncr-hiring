import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The floating dev badge sits exactly where the byline goes, so it obscures
  // it while working locally. It never ships to production anyway.
  devIndicators: false,
  /* config options here */
};

export default nextConfig;
