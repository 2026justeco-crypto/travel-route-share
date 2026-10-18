'use client';

// 「通報する」（依頼14）：ほかの人の旅行・写真・グループに、目立たない文字のリンクで出す。
//   押すと、対象のURLを本文に入れた「Justeco お問い合わせ」フォームを新しいタブで開く（送るのは本人がフォームで）。
//   自分のもの・見本には出さない（出さないのは見た目の都合。フォームは誰でも開ける）。
import { reportUrl, type ReportKind } from '@/lib/legal';

/** 対象のURL：旅行・グループは閲覧ページ、写真は単独のページが無いのでトップの新着の写真のカード */
export function targetUrl(kind: ReportKind, id: string): string {
  const base = `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}`;
  const enc = encodeURIComponent(id);
  if (kind === 'trip') return `${base}/trips/view/?id=${enc}`;
  if (kind === 'group') return `${base}/groups/view/?id=${enc}`;
  return `${base}/#post-${enc}`;
}

export default function ReportLink({
  kind,
  id,
  title,
  className = '',
}: {
  kind: ReportKind;
  id: string;
  title: string;
  className?: string;
}) {
  return (
    <a
      // 一覧・閲覧ページはデータを読んでから（ブラウザで）描くので、ここで window を使える
      href={typeof window === 'undefined' ? undefined : reportUrl(kind, targetUrl(kind, id), title)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex min-h-8 items-center px-1 text-xs text-muted underline underline-offset-2 hover:text-ink ${className}`}
    >
      通報する
    </a>
  );
}
