'use client';

// 入口の全画面背景。A＝日本全体のポップな地図／B＝ゆっくり自転する地球儀（どちらも操作できない飾り）。
// 地図の読み込み前は背景色（A は水玉）だけを先に出す。出典は右下に小さく。
import dynamic from 'next/dynamic';
import { ATTRIBUTION_TEXT } from '@/lib/mapStyles';
import { useTheme } from '@/lib/useTheme';

const HeroMap = dynamic(() => import('@/components/HeroMap'), { ssr: false });

export default function HeroBackdrop() {
  const theme = useTheme();
  return (
    <>
      <div aria-hidden className="hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
        <HeroMap />
        {/* 文字とボタンを読みやすくする薄い覆い */}
        <div className="hero-veil absolute inset-0" />
      </div>
      <div className="hero-attribution absolute bottom-1 right-2 z-[1] text-[9px] leading-tight">
        地図：{ATTRIBUTION_TEXT[theme]}
      </div>
    </>
  );
}
