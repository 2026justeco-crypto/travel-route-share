'use client';

// 入口の全画面背景（どちらも操作できない飾り）。
//   A＝タイル地図（四角だけの日本地図・依頼6）。見出しとボタンが読めるよう少し薄く・上寄せ
//   B＝ゆっくり自転する地球儀（本物の地図。出典は右下に小さく）
// 地図の読み込み前は背景色（A は水玉）だけを先に出す。
import dynamic from 'next/dynamic';
import { ATTRIBUTION_TEXT } from '@/lib/mapStyles';
import { useTheme } from '@/lib/useTheme';
import TileJapanMap from '@/components/TileJapanMap';
import { TILE_COLS, TILE_ROWS } from '@/lib/tileMap';

const HeroMap = dynamic(() => import('@/components/HeroMap'), { ssr: false });

// タイル地図の縦横比（周りの海の余白 0.5マス×2 を含む）
const TILE_ASPECT = (TILE_COLS + 1) / (TILE_ROWS + 1);

export default function HeroBackdrop() {
  const theme = useTheme();
  return (
    <>
      <div aria-hidden className="hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
        {theme === 'b' ? (
          <>
            <HeroMap />
            {/* 文字とボタンを読みやすくする薄い覆い */}
            <div className="hero-veil absolute inset-0" />
          </>
        ) : (
          // 高さの 62% まで（下は見出しと大きなボタンの場所）。幅はそれに合わせて決め、画面幅は超えない
          <div
            className="hero-tilemap mx-auto pt-12 sm:pt-16"
            style={{ width: `min(100%, calc(62dvh * ${TILE_ASPECT.toFixed(4)}))` }}
          >
            <TileJapanMap interactive={false} />
          </div>
        )}
      </div>
      {theme === 'b' && (
        <div className="hero-attribution absolute bottom-1 right-2 z-[1] text-[9px] leading-tight">
          地図：{ATTRIBUTION_TEXT[theme]}
        </div>
      )}
    </>
  );
}
