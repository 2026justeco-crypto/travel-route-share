import type { Metadata } from 'next';
import TileMapDemo from './TileMapDemo';

// タイル地図の確認用ページ（開発用）。本番のナビゲーションからはリンクしない。
export const metadata: Metadata = {
  title: 'タイル地図の見本（開発用）',
  robots: { index: false, follow: false },
};

export default function TileMapDevPage() {
  return <TileMapDemo />;
}
