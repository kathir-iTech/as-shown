import type { NextConfig } from "next";
const config: NextConfig = {
  poweredByHeader: false,
  // This studio has static metadata. Send it with the route rather than a
  // deferred stream, avoiding an empty document title during navigation.
  htmlLimitedBots: /.*/,
  serverExternalPackages: ["sharp"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};
export default config;
