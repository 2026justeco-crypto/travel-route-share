'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitch from '@/components/ThemeSwitch';
import { BackButton, ScreenTitle } from '@/components/BackButton';
import { CameraIcon, LogoIcon, RouteIcon } from '@/components/icons';
import { INPUT_PAGES } from '@/lib/navTrail';

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';
  // 入力画面（作成・編集・投稿）：下部タブが無いので、左端に「戻る」と今の画面名を出す
  const inputPath = pathname.replace(/\/$/, '') || '/';
  const isInput = INPUT_PAGES.includes(inputPath);
  // トップでは入口の間は出さず、入口を過ぎて下へスクロールしたら出す
  const [pastHero, setPastHero] = useState(false);

  useEffect(() => {
    if (!isHome) return;
    const onScroll = () => setPastHero(window.scrollY > window.innerHeight * 0.85);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isHome]);

  const hidden = isHome && !pastHero;

  return (
    <header
      aria-hidden={hidden || undefined}
      inert={hidden || undefined}
      className={`top-0 z-[1000] w-full border-b-2 border-[var(--header-line)] bg-[var(--header-bg)] backdrop-blur transition-transform duration-200 ${
        isHome ? 'fixed left-0 right-0' : 'sticky'
      } ${hidden ? '-translate-y-full' : 'translate-y-0'}`}
    >
      {isInput ? (
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2">
          <BackButton pathname={inputPath} />
          <ScreenTitle pathname={inputPath} />
          <ThemeSwitch compact className="shrink-0" />
        </div>
      ) : (
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2">
          <LogoIcon className="h-6 w-6 shrink-0 text-primary" />
          <span className="whitespace-nowrap text-base font-extrabold tracking-tight text-ink sm:text-lg">
            Travel Route Share
          </span>
          <span className="ml-2 hidden rounded-full bg-[var(--switch-bg)] px-2.5 py-0.5 text-xs font-bold text-muted lg:inline">
            旅行全体を共有するSNS（デモ）
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-2">
          {/* スマホでは下部のタブに任せる（ロゴが切れないように） */}
          <Link
            href="/posts/new"
            className="hidden min-h-11 items-center gap-1.5 rounded-full border-2 border-[var(--line)] px-4 text-sm font-bold text-ink transition hover:opacity-80 sm:inline-flex"
          >
            <CameraIcon className="h-5 w-5" />
            写真を投稿
          </Link>
          <Link
            href="/trips/new"
            className="hidden min-h-11 items-center gap-1.5 rounded-full bg-primary px-4 text-sm font-bold text-on-primary transition hover:opacity-90 sm:inline-flex"
          >
            <RouteIcon className="h-5 w-5" />
            ルートを作る
          </Link>
          <ThemeSwitch compact />
        </nav>
      </div>
      )}
    </header>
  );
}
