'use client';

import { applyTheme, type ThemeId } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';

// 見比べ用の仮の切替（目立たせない）。
// compact=true のときスマホ幅では「A / B」だけにする（ヘッダー用）
export default function ThemeSwitch({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const theme = useTheme();

  const item = (t: ThemeId, letter: string, label: string) => (
    <button
      type="button"
      onClick={() => applyTheme(t)}
      aria-pressed={theme === t}
      aria-label={`${letter} ${label}`}
      // 見た目は小さいまま、押せる範囲だけ上下に広げる（44px）
      className={`relative rounded-full px-2 py-1 transition before:absolute before:-inset-x-0.5 before:-inset-y-3 before:content-[''] ${
        theme === t
          ? 'bg-[var(--switch-on-bg)] text-[var(--switch-on-text)]'
          : 'opacity-70 hover:opacity-100'
      }`}
    >
      {letter}
      <span className={compact ? 'hidden sm:inline' : ''}> {label}</span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label="見た目の切替（見比べ用）"
      className={`flex items-center gap-0.5 rounded-full border border-[var(--switch-border)] bg-[var(--switch-bg)] p-0.5 text-[11px] font-bold leading-none whitespace-nowrap text-[var(--switch-text)] backdrop-blur ${className}`}
    >
      {item('a', 'A', 'ポップ')}
      {item('b', 'B', '地球')}
    </div>
  );
}
