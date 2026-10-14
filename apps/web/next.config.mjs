const apiUrl = process.env.API_INTERNAL_URL || "http://localhost:4000";

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  // SSE responses must not be buffered by compression.
  compress: false,
  transpilePackages: ["@scamshield/shared"],
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
