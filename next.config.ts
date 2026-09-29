import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // `postgres` and `bcryptjs` are server-only; keep them out of any client bundle.
  serverExternalPackages: ["postgres", "bcryptjs"],
  typedRoutes: false,
  poweredByHeader: false,
  experimental: {
    // Contact imports are posted to a server action, which Next.js caps at 1 MB
    // unless told otherwise — well below the import limit in src/server/config.ts.
    // This leaves room for the multipart envelope around a 4 MiB file while
    // staying inside Vercel's 4.5 MB request limit.
    serverActions: { bodySizeLimit: "4.5mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
