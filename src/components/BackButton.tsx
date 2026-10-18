'use client';

// 入力画面のヘッダー左端の「＜ 戻る」。
// サイトの中から来たとき＝ブラウザの戻ると同じ（元の画面・元のスクロール位置へ）。
// URL を直接開いた・外から来たとき＝新規作成と写真投稿は入口（/）、編集はその旅行の閲覧ページへ、
// グループの作成・参加はグループの一覧（/groups）へ。
// 入力の途中でも確認は出さない（下書きは自動で残っている）。
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { canGoBackInSite, markBack, markReplace } from '@/lib/navTrail';
import { ChevronLeftIcon } from '@/components/icons';

export function BackButton({ pathname }: { pathname: string }) {
  const router = useRouter();

  const onClick = () => {
    if (canGoBackInSite()) {
      markBack();
      router.back();
      return;
    }
    let to = '/';
    if (pathname.startsWith('/groups')) to = '/groups';
    if (pathname === '/trips/edit') {
      const id = new URLSearchParams(window.location.search).get('id');
      if (id) to = `/trips/view?id=${encodeURIComponent(id)}`;
    }
    markReplace();
    router.replace(to);
  };

  return (
    <button type="button" onClick={onClick} className="trs-back">
      <ChevronLeftIcon className="h-5 w-5 shrink-0" />
      戻る
    </button>
  );
}

const TITLES: Record<string, string> = {
  '/trips/edit': '旅行ルートを編集',
  '/posts/new': '写真を投稿',
  '/groups/new': 'グループをつくる',
  '/groups/join': 'グループに参加',
  '/settings': '設定',
};

function TitleInner({ pathname }: { pathname: string }) {
  const omoide = useSearchParams().get('mode') === 'omoide';
  const title =
    pathname === '/trips/new' ? (omoide ? '思い出をつくる' : '旅行ルートを作る') : TITLES[pathname];
  return <span className="truncate">{title}</span>;
}

/** ヘッダーに出す今の画面名（ページ内の大見出しの代わり） */
export function ScreenTitle({ pathname }: { pathname: string }) {
  return (
    <div className="min-w-0 flex-1 text-base font-extrabold text-ink sm:text-lg">
      <Suspense fallback={<span className="truncate">{pathname === '/trips/new' ? '' : TITLES[pathname]}</span>}>
        <TitleInner pathname={pathname} />
      </Suspense>
    </div>
  );
}
