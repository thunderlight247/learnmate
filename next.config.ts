import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // This app lives one level below the workspace root, where the Prisma
    // client is installed. Without this, Turbopack treats this directory
    // (the git root) as the workspace root and cannot resolve
    // `@prisma/client` from the parent node_modules.
    root: path.join(__dirname, ".."),
  },
  experimental: {
    // Large textbook PDF uploads (up to 200 MB, see src/lib/upload-limits.ts).
    // Route handlers read the body through the proxy, which buffers it in
    // memory; this must stay >= MAX_FILE_SIZE or uploads get truncated.
    proxyClientMaxBodySize: "200mb",
    // Server Actions body limit, raised alongside the route-handler limit
    // so both upload paths accept the same payload sizes.
    serverActions: {
      bodySizeLimit: "200mb",
    },
  },
};

export default nextConfig;
