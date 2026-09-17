import type { NextConfig } from "next";

const allowedOrigins = [
  ...new Set(
    [
      ...(process.env.ALLOWED_ORIGINS ?? "").split(","),
      process.env.NEXT_PUBLIC_APP_URL,
      process.env.BETTER_AUTH_URL,
      process.env.APP_URL,
    ]
      .map((o) => o?.trim())
      .filter((o): o is string => Boolean(o)),
  ),
];

function toHost(origin: string): string | null {
  try {
    if (/^https?:\/\//i.test(origin)) return new URL(origin).host;
    return origin.replace(/\/$/, "") || null;
  } catch {
    return null;
  }
}

const allowedActionOrigins = allowedOrigins
  .map(toHost)
  .filter((host): host is string => Boolean(host));

const corsHeaders = (origin: string) => [
  { key: "Access-Control-Allow-Origin", value: origin },
  { key: "Access-Control-Allow-Methods", value: "GET,POST,PUT,PATCH,DELETE,OPTIONS" },
  { key: "Access-Control-Allow-Headers", value: "Content-Type, Authorization" },
  { key: "Access-Control-Allow-Credentials", value: "true" },
];

const nextConfig: NextConfig = {
  // Ensure Prisma's generated client (WASM + supporting files) is included in the server build output
  outputFileTracingIncludes: {
    "**": ["./lib/generated/prisma/**"],
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
      // Cloudflare / reverse-proxy hosts must be listed or Next.js rejects
      // server-action POSTs with a 500 ("Server Components render" digest).
      allowedOrigins: allowedActionOrigins,
    },
  },
  serverExternalPackages: ["@prisma/client", "@prisma/adapter-pg", "pg"],
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "wsrv.nl" },
      { protocol: "https", hostname: "*.cdninstagram.com" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      { protocol: "https", hostname: "*.tiktokcdn.com" },
      { protocol: "https", hostname: "*.tiktokcdn-us.com" },
      { protocol: "https", hostname: "*.instagram.com" },
    ],
  },
  async headers() {
    return allowedOrigins.flatMap((origin) => [
      {
        source: "/:path*",
        has: [{ type: "header" as const, key: "origin", value: origin }],
        headers: corsHeaders(origin),
      },
    ]);
  },
  async redirects() {
    return [];
  },
  webpack(config) {
    // Required for Prisma v7's WASM-based query compiler to work in Next.js
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };

    // Allow mp4 and other media assets to be imported as URLs
    config.module?.rules?.push({
      test: /\.(mp4|webm|ogg|mp3|wav|flac|aac)(\?.*)?$/,
      type: "asset/resource",
      generator: {
        filename: "static/media/[name].[hash][ext]",
      },
    });

    return config;
  },
};

export default nextConfig;
