import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import MainShell from "@/components/MainShell";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";

// 丸ゴシックの予備（A＝ポップ）。Hiragino Maru Gothic / BIZ UDPGothic が無い環境向け。
// 日本語はunicode-range分割で必要チャンクのみ実行時ロードされるため preload:false
const rounded = M_PLUS_Rounded_1c({
  weight: ["400", "700", "800"],
  preload: false,
  display: "swap",
  variable: "--font-rounded",
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
    <html
      lang="ja"
      data-theme={DEFAULT_THEME}
      suppressHydrationWarning
      className={`h-full antialiased ${rounded.variable}`}
    >
      <head>
        {/* 描画前に保存済みの見た目（A/B）を入れて、ちらつきを防ぐ */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-bg text-ink">
        <Header />
        <MainShell>{children}</MainShell>
        <footer className="border-t border-line bg-surface py-4 text-center text-xs text-muted">
          Travel Route Share（MVP・デモモード：データはこのブラウザ内にのみ保存されます）
        </footer>
      </body>
    </html>
  );
}
