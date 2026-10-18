'use client';

import { useSyncExternalStore } from 'react';
import { applyTheme, DEFAULT_THEME, readTheme, type ThemeId } from '@/lib/theme';

// <html data-theme> の変化を購読する（どの ThemeSwitch で切り替えても全部が追従する）
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

// 見比べ用の仮の切替（目立たせない）。
// compact=true のときスマホ幅では「A / B」だけにする（ヘッダー用）
export default function ThemeSwitch({
  className = '',
  compact = false,
}: {
  className?: string;
  compact?: boolean;
}) {
  const theme = useSyncExternalStore<ThemeId>(subscribe, readTheme, () => DEFAULT_THEME);

  const item = (t: ThemeId, letter: string, label: string) => (
    <button
      type="button"
      onClick={() => applyTheme(t)}
      aria-pressed={theme === t}
      aria-label={`${letter} ${label}`}
      className={`rounded-full px-2 py-1 transition ${
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
