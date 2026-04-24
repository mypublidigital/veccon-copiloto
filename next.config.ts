import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "veccon.com.br",
      },
    ],
  },
};

export default nextConfig;
