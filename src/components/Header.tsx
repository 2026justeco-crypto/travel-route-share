'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitch from '@/components/ThemeSwitch';

export default function Header() {
  const pathname = usePathname();
  const isHome = pathname === '/';
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
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <span className="text-2xl">🗾</span>
          <span className="truncate text-base font-extrabold tracking-tight text-ink sm:text-lg">
            Travel Route Share
          </span>
          <span className="ml-2 hidden rounded-full bg-[var(--switch-bg)] px-2.5 py-0.5 text-xs font-bold text-muted lg:inline">
            旅行全体を共有するSNS（MVP・デモモード）
          </span>
        </Link>
        <nav className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/posts/new"
            className="rounded-full border-2 border-[var(--line)] px-2.5 py-1.5 text-xs font-bold text-ink transition hover:opacity-80 sm:px-4 sm:text-sm"
          >
            📷 <span className="hidden sm:inline">写真を</span>投稿
          </Link>
          <Link
            href="/trips/new"
            className="rounded-full bg-primary px-2.5 py-1.5 text-xs font-bold text-on-primary transition hover:opacity-90 sm:px-4 sm:text-sm"
          >
            🧭 <span className="hidden sm:inline">旅行</span>ルート作成
          </Link>
          <ThemeSwitch compact />
        </nav>
      </div>
    </header>
  );
}
