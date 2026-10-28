import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "pub-3c50933ab0874557a59c47029d18d696.r2.dev" },
      // Older uploads that still live on Catbox
      { protocol: "https", hostname: "files.catbox.moe" },
    ],
  },
};

export default nextConfig;
