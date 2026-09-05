import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output is for the Docker image: it emits .next/standalone with a
  // self-contained server.js and only the node_modules actually reached, which
  // is what keeps the runtime image small. See frontend/Dockerfile.
  //
  // It must NOT be set when Vercel builds. Vercel runs its own output file
  // tracing, and standalone mode moves the trace manifests, so the build fails
  // with:
  //
  //   ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
  //
  // `VERCEL` is set to "1" in Vercel's build environment and nowhere else, so
  // Docker builds and local `next build` keep the standalone output.
  ...(process.env.VERCEL ? {} : { output: "standalone" as const }),
};

export default nextConfig;
