import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // 画面はブラウザ側で保存データを読んでから描くため、瞬時表示の検証は明示した区画だけにする
  experimental: {
    instantInsights: { validationLevel: "manual-warning" },
  },
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
