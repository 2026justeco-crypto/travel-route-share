'use client';

import { useSyncExternalStore } from 'react';
import { DEFAULT_THEME, readTheme, type ThemeId } from '@/lib/theme';

// <html data-theme> の変化を購読する（どこで切り替えても、使っている全部が追従する）
function subscribe(onChange: () => void) {
  const mo = new MutationObserver(onChange);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  return () => mo.disconnect();
}

export function useTheme(): ThemeId {
  return useSyncExternalStore<ThemeId>(subscribe, readTheme, () => DEFAULT_THEME);
}
