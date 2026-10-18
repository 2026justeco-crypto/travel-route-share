'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * ブラウザで描画しているときだけ true（サーバー描画と最初の hydration では false）。
 * localStorage を初期値に使う画面を、hydration のずれなしに出すために使う。
 */
export function useMounted(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
