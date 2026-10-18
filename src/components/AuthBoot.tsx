'use client';

// サイトを開いたときの裏方（依頼10）。
//   1) まだなら黙って匿名ログインする（成功したら何も出さない）
//   2) つながらなければ「いまオフラインです」を小さく出す（見るだけはできる）
//   3) この端末に今までの旅行・写真があれば、1回だけ「サーバーに移しますか？」を出す（移す／あとで）
//   4) 自分の写真のうち、どの旅行・投稿にも付いていないもの（消し損ね）を、開いたときに1回だけ掃除する（依頼11）
//   ★確認は window.confirm を使わず、小さなカードで出す（トップのスマホでは入口のボタンに重ならないよう上に出す）。
import { useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { ensureSession, retrySession, useAuth } from '@/lib/supabase';
import { chooseLater, laterChosen, migrateAll, pendingLocal } from '@/lib/migrate';
import { INPUT_PAGES } from '@/lib/navTrail';
import { sweepOrphanPhotos } from '@/lib/photos';

// 下部タブ（スマホ）の上に出す。入力画面ではタブが無いので保存ボタンの上に出さない＝入力画面では出さない
const WRAP_BASE = 'fixed inset-x-0 z-[1001] mx-auto w-full max-w-md px-4';
const WRAP_BOTTOM = `${WRAP_BASE} bottom-[calc(4rem+env(safe-area-inset-bottom))] sm:bottom-4`;
// トップ（入口）のスマホでは、下に「ルートを作る」「思い出をつくる」があるので、上（テーマ切替の下）に出す
const WRAP_HOME = `${WRAP_BASE} top-[calc(3.5rem+env(safe-area-inset-top))] sm:top-auto sm:bottom-4`;
/** 写真の掃除をこのタブで済ませた印 */
const SWEPT_KEY = 'trs_photo_swept';
/** 依頼10の仮の作り（投稿id↔端末の写真id）。サーバー版に置き換えたので消す */
const OLD_POST_PHOTO_KEY = 'trs_post_photo_v1';

export default function AuthBoot() {
  const auth = useAuth();
  const pathname = usePathname().replace(/\/$/, '') || '/';
  const onInput = INPUT_PAGES.includes(pathname);
  const WRAP = pathname === '/' ? WRAP_HOME : WRAP_BOTTOM;
  // 閉じた（移した・あとで）
  const [closed, setClosed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    void ensureSession();
    try {
      localStorage.removeItem(OLD_POST_PHOTO_KEY);
    } catch {
      // 読めない環境では何もしない
    }
  }, []);

  // 写真の消し損ねの掃除（タブを開いて1回だけ・画面には何も出さない）
  useEffect(() => {
    if (auth.status !== 'ready') return;
    try {
      if (sessionStorage.getItem(SWEPT_KEY)) return;
      sessionStorage.setItem(SWEPT_KEY, '1');
    } catch {
      return;
    }
    void sweepOrphanPhotos();
  }, [auth.status]);

  // ログインできたら、引っ越すものがあるかを見る（ブラウザでログインした後だけ＝サーバー描画では読まない）
  const counts = useMemo(() => {
    if (auth.status !== 'ready' || laterChosen()) return null;
    const p = pendingLocal();
    return p.trips.length + p.posts.length > 0 ? { trips: p.trips.length, posts: p.posts.length } : null;
  }, [auth.status]);

  const move = async () => {
    setBusy(true);
    const r = await migrateAll();
    setBusy(false);
    setClosed(true);
    setResult(
      r.failed > 0
        ? `${r.trips + r.posts}件を移しました。${r.failed}件は移せませんでした（次に開いたときにもう一度聞きます）。`
        : `${r.trips + r.posts}件をサーバーに移しました（見せる先：自分だけ）。`,
    );
    // 移したものを一覧に出すため、今の画面を読み直す
    window.dispatchEvent(new Event('trs:data-changed'));
  };

  if (auth.status === 'offline')
    return (
      <div className={WRAP} role="status">
        <div className="t-card flex items-center justify-between gap-2 px-3 py-2 text-sm text-ink">
          <span>いまオフラインです。見るだけできます。</span>
          <button
            type="button"
            onClick={() => void retrySession()}
            className="min-h-11 shrink-0 px-2 font-bold text-link underline"
          >
            つなぎ直す
          </button>
        </div>
      </div>
    );

  if (onInput) return null;

  if (result)
    return (
      <div className={WRAP} role="status">
        <div className="t-card flex items-center justify-between gap-2 px-3 py-2 text-sm text-ink">
          <span>{result}</span>
          <button type="button" onClick={() => setResult(null)} className="min-h-11 shrink-0 px-2 font-bold text-link underline">
            閉じる
          </button>
        </div>
      </div>
    );

  if (!counts || closed) return null;

  const parts = [counts.trips ? `旅行が${counts.trips}件` : '', counts.posts ? `写真が${counts.posts}件` : '']
    .filter(Boolean)
    .join('・');

  return (
    <div className={WRAP}>
      <section aria-label="この端末のデータの引っ越し" className="t-card space-y-2 p-4">
        <p className="text-sm font-bold text-ink">この端末で作った{parts}あります。サーバーに移しますか？</p>
        <p className="text-xs text-muted">見せる先は「自分だけ」で移します。この端末のデータは消しません。</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={move}
            disabled={busy}
            className="min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:opacity-60"
          >
            {busy ? '移しています…' : '移す'}
          </button>
          <button
            type="button"
            onClick={() => {
              chooseLater();
              setClosed(true);
            }}
            disabled={busy}
            className="min-h-11 flex-1 rounded-full border-2 border-line-soft px-4 text-sm font-bold text-ink"
          >
            あとで
          </button>
        </div>
      </section>
    </div>
  );
}
