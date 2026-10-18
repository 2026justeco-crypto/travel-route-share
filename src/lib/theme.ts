// 見た目の切替（A＝ポップ／B＝地球儀）。見比べ用の仮の切替。
// <html data-theme="a|b"> を CSS 変数で切り替える。値は localStorage に覚える（読めなければ A）。

export type ThemeId = 'a' | 'b';

export const THEME_STORAGE_KEY = 'trs-theme';
export const DEFAULT_THEME: ThemeId = 'a';

/** layout の <head> で描画前に実行する小さなスクリプト（ちらつき防止）。 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t==="a"||t==="b")document.documentElement.setAttribute("data-theme",t)}catch(e){}})()`;

export function readTheme(): ThemeId {
  if (typeof document !== 'undefined') {
    const t = document.documentElement.getAttribute('data-theme');
    if (t === 'a' || t === 'b') return t;
  }
  return DEFAULT_THEME;
}

export function applyTheme(t: ThemeId) {
  document.documentElement.setAttribute('data-theme', t);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, t);
  } catch {
    // 保存できない環境（プライベートモード等）でも表示の切替だけは効かせる
  }
}
