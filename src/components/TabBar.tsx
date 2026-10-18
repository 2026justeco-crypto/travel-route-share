'use client';

// スマホ用の下部タブ（Radio Garden の下部タブのイメージ）。さがす／つくる／お気に入り の3つだけ。
// 入力中の画面（作成・編集・投稿）では出さない（保存ボタンと重ねない・迷わせない）。PC幅では出さない（ヘッダーにある）。
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PlusIcon, SearchIcon, StarIcon } from '@/components/icons';
import { INPUT_PAGES as HIDE_ON } from '@/lib/navTrail';

export default function TabBar() {
  const pathname = usePathname().replace(/\/$/, '') || '/';
  if (HIDE_ON.includes(pathname)) return null;

  const tab = (href: string, label: string, icon: React.ReactNode, active: boolean) => (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-bold ${
        active ? 'text-primary' : 'text-muted'
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <>
      {/* 下に固定するタブの分だけ、ページの最後に余白を作る */}
      <div aria-hidden className="h-[calc(3.5rem+env(safe-area-inset-bottom))] sm:hidden" />
      <nav
        aria-label="メニュー"
        className="trs-tabbar fixed inset-x-0 bottom-0 z-[1000] flex border-t-2 border-[var(--header-line)] bg-[var(--header-bg)] pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        {tab('/#explore', 'さがす', <SearchIcon className="h-6 w-6" />, pathname === '/')}
        {tab('/trips/new', 'つくる', <PlusIcon className="h-6 w-6" />, false)}
        {tab('/favorites', 'お気に入り', <StarIcon className="h-6 w-6" />, pathname === '/favorites')}
      </nav>
    </>
  );
}
