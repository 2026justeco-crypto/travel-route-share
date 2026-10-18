'use client';

import { useSyncExternalStore } from 'react';

// トップの地図の切替（タイル／くわしい地図）。選んだ方を localStorage に覚える（読めなければタイル）。

export type TopMapMode = 'tile' | 'detail';

const KEY = 'trs-top-map';
const EVENT = 'trs-top-map-change';

// localStorage が使えない環境用の控え（その画面を開いている間だけ効く）
let fallback: TopMapMode = 'tile';

function read(): TopMapMode {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'detail' || v === 'tile') return v;
    return fallback;
  } catch {
    return fallback;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useTopMapMode(): TopMapMode {
  return useSyncExternalStore<TopMapMode>(subscribe, read, () => 'tile');
}

export function setTopMapMode(m: TopMapMode) {
  fallback = m;
  try {
    localStorage.setItem(KEY, m);
  } catch {
    // 保存できなくても、この画面の中では切り替える
  }
  window.dispatchEvent(new Event(EVENT));
}
