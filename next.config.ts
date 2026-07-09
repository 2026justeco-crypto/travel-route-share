import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 静的書き出し（GitHub Pages等の静的ホスティング用）
  output: "export",
  trailingSlash: true,
  // GitHub Pagesのプロジェクトサイト（https://<user>.github.io/<repo>/）用。
  // ローカル開発では未設定（= ルート直下）のまま動く。
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};

export default nextConfig;
