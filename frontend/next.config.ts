import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Required by frontend/Dockerfile. Emits .next/standalone with a self-contained
  // server.js and only the node_modules actually reached, which is what keeps the
  // runtime image small. Harmless during `next dev`.
  output: "standalone",
};

export default nextConfig;
