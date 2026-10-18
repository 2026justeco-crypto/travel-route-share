import type { Metadata } from "next";
import { M_PLUS_Rounded_1c } from "next/font/google";
import "./globals.css";
import Link from "next/link";
import Header from "@/components/Header";
import MainShell from "@/components/MainShell";
import TabBar from "@/components/TabBar";
import NavTracker from "@/components/NavTracker";
import AuthBoot from "@/components/AuthBoot";
import { DEFAULT_THEME, THEME_INIT_SCRIPT } from "@/lib/theme";
import { CONTACT_URL, OPERATOR } from "@/lib/legal";

const FOOT_LINK = "inline-block min-h-11 px-1.5 leading-[2.75rem] text-link underline";

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
        <footer className="border-t border-line bg-surface px-4 py-4 text-center text-xs text-muted">
          <p>
            Travel Route Share（β版：旅行・投稿・写真はサーバーに保存されます。ほかの人には位置を少しぼかして見せます）
          </p>
          {/* 規約・プライバシー・お問い合わせ（依頼14）。お問い合わせは共用の Googleフォーム（新しいタブ） */}
          <nav aria-label="このサイトについて" className="mt-1 flex flex-wrap items-center justify-center gap-x-1">
            <Link href="/terms" className={FOOT_LINK}>
              利用規約
            </Link>
            <Link href="/privacy" className={FOOT_LINK}>
              プライバシー
            </Link>
            <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className={FOOT_LINK}>
              お問い合わせ
            </a>
            <Link href="/settings" className={FOOT_LINK}>
              設定（自宅のあたり・データを消す）
            </Link>
          </nav>
          <p className="mt-1">運営：{OPERATOR}</p>
        </footer>
        <TabBar />
        <NavTracker />
        <AuthBoot />
      </body>
    </html>
  );
}
