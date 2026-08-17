import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const apiUrl =
  process.env.ANATOLE_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "https://anatole-api.onrender.com";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  turbopack: {
    root: fileURLToPath(new URL("../..", import.meta.url)),
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=()",
          },
        ],
      },
    ];
  },

  async rewrites() {
    return [
      {
        source: "/api/anatole/:path*",
        destination: `${apiUrl.replace(/\/$/, "")}/:path*`,
      },
    ];
  },
};

export default nextConfig;
