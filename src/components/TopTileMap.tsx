'use client';

// トップ（A のとき）の地図：タイル地図＋県を押すと下からせり上がる一覧パネル（依頼6）。
//   - 県ごとの件数＝投稿の数＋その県を通る旅行の数（数え方は lib/prefCount.ts）
//   - 「行った県」＝自分の「思い出」の旅行のスポットがある県（別の色）
//   - 右上の切替で「くわしい地図」（本物の地図＝JapanMap）にもできる。選んだ方は localStorage に覚える
//   - スマホ幅（〜640px）では画面幅いっぱい・県名なし（件数と色だけ）。押した県の名前を地図の上に大きく出す

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import type { Post, Trip } from '@/lib/types';
import TileJapanMap from '@/components/TileJapanMap';
import { PREFECTURES } from '@/lib/regions';
import { countByPrefecture, tripPrefectures, visitedPrefectures } from '@/lib/prefCount';
import { useAuth } from '@/lib/supabase';
import { setTopMapMode, useTopMapMode } from '@/lib/topMapMode';
import type { PrefName } from '@/lib/tileMap';
import { RouteIcon } from '@/components/icons';

const WIDE_QUERY = '(min-width: 640px)';

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** 640px 以上か（サーバー描画と最初の hydration ではスマホ扱い） */
function useWide(): boolean {
  return useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_QUERY).matches,
    () => false,
  );
}

export interface TopTileMapProps {
  /** 絞り込み後の投稿・旅行（一覧と同じ条件） */
  posts: Post[];
  trips: Trip[];
  /** 自分の旅行すべて（行った県を数える。絞り込みに関係なく数える） */
  allTrips: Trip[];
  photos: Map<string, string>;
  /** 写真を押したとき（新着の写真のカードへ移る） */
  onOpenPost: (postId: string) => void;
  /** 「くわしい地図」を選んだときに出す本物の地図 */
  detailMap: ReactNode;
}

export default function TopTileMap({ posts, trips, allTrips, photos, onOpenPost, detailMap }: TopTileMapProps) {
  const mode = useTopMapMode();
  const wide = useWide();
  const [selected, setSelected] = useState<PrefName | null>(null);
  // パネルに出している県（閉じる動きの間も中身を残すため、selected とは別に持つ）
  const [sheetPref, setSheetPref] = useState<PrefName | null>(null);
  const mapRef = useRef<HTMLDivElement>(null);

  const values = useMemo(() => countByPrefecture(posts, trips), [posts, trips]);
  const me = useAuth().userId;
  const visited = useMemo(() => (me ? visitedPrefectures(allTrips, me) : new Set<PrefName>()), [allTrips, me]);

  const sheetTrips = useMemo(
    () => (sheetPref ? trips.filter((t) => tripPrefectures(t).has(sheetPref)) : []),
    [trips, sheetPref],
  );
  const sheetPosts = useMemo(
    () => (sheetPref ? posts.filter((p) => p.prefecture === sheetPref) : []),
    [posts, sheetPref],
  );

  const open = selected !== null && mode === 'tile';

  const select = (name: PrefName) => {
    setSelected(name);
    setSheetPref(name);
    // 地図がパネルに隠れないよう、地図の上端を画面の上（ヘッダーの下）へ寄せる
    const el = mapRef.current;
    if (el) {
      const r = el.getBoundingClientRect();
      const sheetTop = window.innerHeight * (wide ? 0.6 : 0.5);
      if (r.top < 64 || (r.bottom > sheetTop && r.height < sheetTop - 64)) {
        window.scrollBy({ top: r.top - 72, behavior: 'smooth' });
      }
    }
  };
  const close = () => setSelected(null);

  // Esc で閉じる
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelected(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const modeBtn = (m: 'tile' | 'detail', label: string) => (
    <button
      type="button"
      onClick={() => {
        setTopMapMode(m);
        if (m === 'detail') setSelected(null);
      }}
      aria-pressed={mode === m}
      className={`relative rounded-full px-2.5 py-1 transition before:absolute before:-inset-x-0.5 before:-inset-y-3 before:content-[''] ${
        mode === m ? 'bg-[var(--switch-on-bg)] text-[var(--switch-on-text)]' : 'opacity-70 hover:opacity-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <section aria-label="地図">
      {/* 上の帯：行った県（左）・切替（右） */}
      <div className="mb-2 flex items-center justify-between gap-2 sm:max-w-[640px]">
        {mode === 'tile' ? (
          <div className="text-sm font-bold text-ink">
            <span className="mr-1 inline-block h-3 w-3 rounded-[3px] border-2 border-[var(--tile-line)] bg-[var(--tile-visited)] align-[-1px]" aria-hidden />
            行った県 {visited.size}／{PREFECTURES.length}
          </div>
        ) : (
          <div />
        )}
        <div
          role="group"
          aria-label="地図の切替"
          className="flex shrink-0 items-center gap-0.5 rounded-full border border-[var(--switch-border)] bg-[var(--switch-bg)] p-0.5 text-xs font-bold leading-none whitespace-nowrap text-[var(--switch-text)]"
        >
          {modeBtn('tile', 'タイル')}
          {modeBtn('detail', 'くわしい地図')}
        </div>
      </div>

      {mode === 'detail' ? (
        detailMap
      ) : (
        <>
          {/* スマホ幅では左右の余白をなくして画面幅いっぱいに（1マス約23px） */}
          <div ref={mapRef} className="relative -mx-4 scroll-mt-20 sm:mx-0 sm:max-w-[640px]">
            {selected && (
              // 押した県の名前を、地図の左上の海の上に大きく出す
              <div
                aria-live="polite"
                className="pointer-events-none absolute left-4 top-3 text-[1.75rem] font-extrabold leading-none text-ink sm:left-5 sm:top-4 sm:text-4xl"
              >
                {selected}
                <div className="mt-1.5 text-sm font-bold text-muted">
                  {values[selected] ? `${values[selected]}件` : 'まだありません'}
                </div>
              </div>
            )}
            <div className="overflow-hidden sm:rounded-[var(--radius)] sm:border-[length:var(--line-w)] sm:border-[var(--line)] sm:shadow-[var(--shadow)]">
              <TileJapanMap
                values={values}
                highlight={visited}
                selected={selected}
                onSelect={select}
                showLabels={wide}
                ariaLabel="都道府県のタイル地図（押すとその県の旅行と写真）"
              />
            </div>
          </div>
          <p className="mt-1.5 text-xs text-muted">
            県を押すと、その県の旅行と写真が見られます。数字は旅行と写真の数です。
          </p>
        </>
      )}

      {/* 下からせり上がる一覧パネル（スマホは画面幅いっぱい、PC は右下） */}
      <div
        role="dialog"
        aria-modal="false"
        aria-label={sheetPref ? `${sheetPref}の旅行と写真` : '県の旅行と写真'}
        aria-hidden={!open || undefined}
        inert={!open || undefined}
        className={`trs-prefsheet fixed inset-x-0 bottom-0 z-[1001] flex max-h-[50dvh] flex-col sm:left-auto sm:right-4 sm:w-[420px] sm:max-h-[60dvh] ${
          open ? 'translate-y-0' : 'translate-y-[calc(100%+1rem)]'
        }`}
        onTransitionEnd={() => {
          if (!open) setSheetPref(null);
        }}
      >
        <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-3">
          <div className="min-w-0">
            <div className="truncate text-xl font-extrabold text-ink">{sheetPref}</div>
            <div className="text-xs font-bold text-muted">
              旅行 {sheetTrips.length}・写真 {sheetPosts.length}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="閉じる"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-2xl font-bold text-muted hover:text-ink"
          >
            ×
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {sheetTrips.length === 0 && sheetPosts.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted">まだありません。</p>
              <Link href="/trips/new" className="t-btn t-btn-primary mx-auto mt-3 w-full max-w-xs">
                <RouteIcon className="t-btn-icon h-6 w-6" />
                この県でルートを作る
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {sheetTrips.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-sm font-extrabold text-ink">旅行</h3>
                  <ul className="space-y-2">
                    {sheetTrips.map((t) => (
                      <li key={t.id}>
                        <Link
                          href={`/trips/view?id=${t.id}`}
                          className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-line-soft bg-surface px-3 py-2 hover:border-primary"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-bold text-ink">{t.title}</span>
                            <span className="block text-xs text-muted">
                              {t.startDate}
                              {t.endDate && t.endDate !== t.startDate ? ` 〜 ${t.endDate}` : ''}
                            </span>
                          </span>
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
                              t.status === 'plan'
                                ? 'bg-amber-500/15 text-amber-600'
                                : 'bg-emerald-500/15 text-emerald-600'
                            }`}
                          >
                            {t.status === 'plan' ? 'これから行く' : '思い出'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {sheetPosts.length > 0 && (
                <div>
                  <h3 className="mb-1.5 text-sm font-extrabold text-ink">写真</h3>
                  <div className="grid grid-cols-2 gap-2">
                    {sheetPosts.map((p) => {
                      const photo = p.photoId ? photos.get(p.photoId) : null;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => {
                            close();
                            onOpenPost(p.id);
                          }}
                          className="overflow-hidden rounded-xl border-2 border-line-soft bg-surface text-left hover:border-primary"
                        >
                          <div className="h-20 w-full bg-surface-2">
                            {photo && (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={photo} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <div className="truncate px-2 py-1.5 text-sm font-bold text-ink">{p.title}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
