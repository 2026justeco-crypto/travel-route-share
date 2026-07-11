import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";

// ポップな丸ゴシック。日本語はunicode-range分割で必要チャンクのみ実行時ロードされるため preload:false
const rounded = M_PLUS_Rounded_1c({
  weight: ["400", "700", "800"],
  preload: false,
  display: "swap",
});

export const metadata: Metadata = {
  title: "Travel Route Share - 旅行全体を共有するSNS",
  description:
    "写真1枚ではなく、旅行全体（ルート・順番・体験）を共有できる旅行SNS。地図に写真をピンして、旅行ルートを計画から思い出まで一つのストーリーに。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja" className={`h-full antialiased ${rounded.className}`}>
      <body className="min-h-full flex flex-col bg-sky-50 text-gray-900">
        <Header />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
          Travel Route Share（MVP・デモモード：データはこのブラウザ内にのみ保存されます）
        </footer>
      </body>
    </html>
  );
}
