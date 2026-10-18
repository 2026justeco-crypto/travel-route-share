// 読み込み中の骨組み（形だけ先に出して、待たされている感じを減らす）
export function SkeletonBlock({ className = '' }: { className?: string }) {
  return <div aria-hidden className={`trs-skeleton rounded-xl ${className}`} />;
}

/** フォーム・詳細ページ用：見出し＋カード数枚＋地図の形 */
export function PageSkeleton({ label = '読み込み中' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-4">
      <SkeletonBlock className="h-7 w-2/3" />
      <SkeletonBlock className="h-4 w-1/2" />
      <SkeletonBlock className="h-28 w-full" />
      <SkeletonBlock className="h-20 w-full" />
      <SkeletonBlock className="h-64 w-full" />
    </div>
  );
}
