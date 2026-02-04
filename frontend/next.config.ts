import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  serverExternalPackages: ["@coinbase/onchainkit", "@coinbase/cdp-sdk"],
};

export default nextConfig;
