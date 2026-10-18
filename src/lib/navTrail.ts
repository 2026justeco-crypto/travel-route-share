// 「サイトの中から来たか」を覚えておく（入力画面の「戻る」ボタン用）。
//
// このタブでサイト内を移った道のり（URL の並び）を sessionStorage に持つ。
// - ページを丸ごと読み込んだとき（URL を直接開いた・外から来た）は道のりを今の画面だけにし直す
// - サイトの中で画面を移るたびに足す。ブラウザの戻るなら1つ減らす
// 「戻る」は道のりの1つ前がある＝サイトの中から来たときだけ、ブラウザの戻ると同じ動きをする。
// document.referrer には頼らない（同じサイトからでも空のことがあり、再読み込みで古い値が残る）。

const TRAIL_KEY = 'trs_nav_trail';
const REPLACE_KEY = 'trs_nav_replace';
const MAX = 50;

/** 今の画面の URL（basePath 込み・末尾の / は外す・# は見ない） */
export function currentUrl(): string {
  const path = window.location.pathname.replace(/\/$/, '') || '/';
  return path + window.location.search;
}

function read(): string[] {
  try {
    const v = JSON.parse(sessionStorage.getItem(TRAIL_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function write(trail: string[]) {
  try {
    sessionStorage.setItem(TRAIL_KEY, JSON.stringify(trail.slice(-MAX)));
  } catch {
    // 使えない環境では「戻る」は決まった戻り先へ行くだけ
  }
}

/** ページを丸ごと読み込んだとき（最初の1回）に呼ぶ */
export function trailOnLoad() {
  const url = currentUrl();
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const type = nav?.type ?? 'navigate';
  const trail = read();
  if (type === 'reload' && trail[trail.length - 1] === url) return; // 再読み込みは道のりをそのまま使う
  if (type === 'back_forward') {
    const i = trail.lastIndexOf(url);
    if (i >= 0) return write(trail.slice(0, i + 1));
  }
  write([url]);
}

/** サイトの中で画面を移ったあとに呼ぶ */
export function trailOnChange() {
  const url = currentUrl();
  const trail = read();
  let replaced = false;
  try {
    replaced = sessionStorage.getItem(REPLACE_KEY) === '1';
    sessionStorage.removeItem(REPLACE_KEY);
  } catch {}
  if (trail[trail.length - 1] === url) return;
  if (replaced) {
    trail[Math.max(trail.length - 1, 0)] = url;
  } else {
    trail.push(url);
  }
  write(trail);
}

/** 1つ前の画面がこのサイトの中にあるか */
export function canGoBackInSite(): boolean {
  const trail = read();
  return trail.length >= 2 && trail[trail.length - 1] === currentUrl();
}

/** 次の画面移動を「置き換え」として数える（router.replace の直前に呼ぶ） */
export function markReplace() {
  try {
    sessionStorage.setItem(REPLACE_KEY, '1');
  } catch {}
}

// ブラウザの戻る/進む。Next 16 では popstate が画面の描き替え（NavTracker の更新）より
// 後に来ることがある（実測）ので、どちらの順でも道のりが合うように、ここで直す。
if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    const url = currentUrl();
    const trail = read();
    const n = trail.length;
    if (n >= 3 && trail[n - 1] === url && trail[n - 3] === url) {
      // 先に「進んだ」と数えてしまっていた → 2つ外して「戻った」にする
      write(trail.slice(0, n - 2));
    } else if (n >= 2 && trail[n - 2] === url) {
      // まだ数えていない → ここで「戻った」にする（後の更新は同じ URL なので何もしない）
      write(trail.slice(0, n - 1));
    }
  });
}

// 「戻る」ボタンで戻った直後か（トップのスクロール位置を戻すのに使う。1回読んだら消える）
let backPending = false;

export function markBack() {
  backPending = true;
}

export function takeArrivedByBack(): boolean {
  const hit = backPending;
  backPending = false;
  return hit;
}

/** 入力画面（下部タブを隠し、ヘッダーに「戻る」を出す画面）。パスは末尾の / なし */
export const INPUT_PAGES = ['/trips/new', '/trips/edit', '/posts/new', '/groups/new', '/groups/join', '/settings'];
