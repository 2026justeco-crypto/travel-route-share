'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Post, Trip } from '@/lib/types';
import { listPosts, listTrips, favoriteIds, toggleFavorite, hasDraft } from '@/lib/store';
import { useAuth } from '@/lib/supabase';
import { photoUrls } from '@/lib/photos';
import PhotoImg from '@/components/PhotoImg';
import FilterPanel, { defaultFilters, type Filters } from '@/components/FilterPanel';
import HeroBackdrop from '@/components/HeroBackdrop';
import ThemeSwitch from '@/components/ThemeSwitch';
import { RouteIcon, BookIcon, ArrowDownIcon, StarIcon } from '@/components/icons';
import { SkeletonBlock } from '@/components/Skeleton';
import type { MapPin } from '@/components/JapanMap';
import TopTileMap from '@/components/TopTileMap';
import { useTheme } from '@/lib/useTheme';
import { useMounted } from '@/lib/useMounted';
import { takeArrivedByBack } from '@/lib/navTrail';

// トップのスクロール位置（戻ってきたときに元の位置へ戻す）。
// 一覧は読み込んでから伸びるので、ブラウザ任せだと途中で止まる。読み込み後にこちらで戻す
const SCROLL_KEY = 'trs_home_scroll';

// 書きかけ（下書き）のお知らせ。入力画面の「戻る」で抜けても続きから書けることを入口で一言だけ知らせる
const DRAFTS = [
  { key: 'trip_new_plan', label: 'ルート', href: '/trips/new' },
  { key: 'trip_new_done', label: '思い出', href: '/trips/new?mode=omoide' },
  { key: 'post_new', label: '写真', href: '/posts/new' },
];

function DraftNotice() {
  const mounted = useMounted();
  if (!mounted) return null;
  const items = DRAFTS.filter((d) => hasDraft(d.key));
  if (items.length === 0) return null;
  const link = 'inline-flex min-h-11 items-center px-1 font-bold text-link underline underline-offset-2';
  return (
    <p className="mt-1.5 flex flex-wrap items-center justify-center gap-x-1 text-sm text-muted">
      {items.length === 1 ? (
        <Link href={items[0].href} className={link}>
          書きかけの{items[0].label}があります（続きを書く）
        </Link>
      ) : (
        <>
          書きかけ：
          {items.map((d) => (
            <Link key={d.key} href={d.href} className={link}>
              {d.label}の続き
            </Link>
          ))}
        </>
      )}
    </p>
  );
}

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  // 読み込み中は地図の背景色だけ先に出す（白い箱やちらつきを出さない）
  loading: () => <div className="trs-map trs-map-loading h-[480px]" />,
});

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [photosLoading, setPhotosLoading] = useState(true);
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const me = useAuth().userId;
  const [showFilters, setShowFilters] = useState(false);
  // 「最近◯日」の基準時刻（描画のたびに変わらないよう、開いた時点で固定）
  const [now] = useState(() => Date.now());
  const theme = useTheme();
  // タイル地図のパネルから写真を選んだとき、新着の写真のそのカードを一瞬目立たせる
  const [flashId, setFlashId] = useState<string | null>(null);
  // 前にトップを見ていたときのスクロール位置（開いた瞬間の値。この後のスクロールで上書きされる前に取る）
  const [savedY] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const y = Number(sessionStorage.getItem(SCROLL_KEY));
      return Number.isFinite(y) && y > 0 ? y : null;
    } catch {
      return null;
    }
  });
  // 戻ってきたときだけ元の位置へ戻す（入力画面の「戻る」か、ブラウザの戻る/進む）
  const [restore, setRestore] = useState(() => typeof window !== 'undefined' && takeArrivedByBack());

  useEffect(() => {
    // ブラウザの戻る/進むは、画面が出た少し後に popstate が来ることがある（実測）
    const t0 = Date.now();
    const onPop = () => {
      if (Date.now() - t0 < 1500) setRestore(true);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    const save = () => {
      // 次の画面へ移る途中のスクロール（画面が短くなって詰まる・上へ戻す）は覚えない。
      // そのときはトップの中身がもう外れている
      if (!document.getElementById('explore')) return;
      try {
        sessionStorage.setItem(SCROLL_KEY, String(Math.round(window.scrollY)));
      } catch {}
    };
    // 開いた時点の位置で上書きしておく（前に見たときの古い位置で、先頭から開いた入口が飛ばないように）
    save();
    window.addEventListener('scroll', save, { passive: true });
    return () => window.removeEventListener('scroll', save);
  }, []);

  useEffect(() => {
    if (!loaded || !restore || savedY === null) return;
    // 写真・地図が後から伸びて届かないことがあるので、届くまで（最大1.5秒）毎フレーム合わせる。
    // 途中で自分でスクロールし始めたらやめる
    const t0 = performance.now();
    let id = 0;
    let stopped = false;
    const stop = () => {
      stopped = true;
    };
    const tick = () => {
      if (stopped) return;
      window.scrollTo({ top: savedY, behavior: 'instant' });
      if (Math.abs(window.scrollY - savedY) < 2 || performance.now() - t0 > 1500) return;
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    window.addEventListener('wheel', stop, { passive: true });
    window.addEventListener('touchstart', stop, { passive: true });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('wheel', stop);
      window.removeEventListener('touchstart', stop);
    };
  }, [loaded, restore, savedY]);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        // サーバーから：全体に見せたもの＋自分のもの（それ以外は RLS で返ってこない）
        const [ps, ts, fv] = await Promise.all([listPosts(), listTrips(), favoriteIds().catch(() => new Set<string>())]);
        if (!alive) return;
        setPosts(ps);
        setTrips(ts);
        setFavs(fv);
        setLoadError(false);
        const ids = [
          ...ps.map((p) => p.photoId),
          ...ts.flatMap((t) => t.spots.map((s) => s.photoId)),
        ].filter((x): x is string => !!x);
        // 写真はまとめて署名付きURLにする（見てはいけない写真は返ってこない＝RLS）
        const ph = await photoUrls(ids).catch(() => new Map<string, string>());
        if (alive) setPhotos(ph);
      } catch {
        if (alive) setLoadError(true);
      }
      if (alive) {
        setLoaded(true);
        setPhotosLoading(false);
      }
    };
    void load();
    // 引っ越し（components/AuthBoot）が終わったら読み直す
    const onChanged = () => void load();
    window.addEventListener('trs:data-changed', onChanged);
    return () => {
      alive = false;
      window.removeEventListener('trs:data-changed', onChanged);
    };
  }, []);

  const q = query.trim().toLowerCase();

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      const mine = p.userId === me;
      if (mine && !filters.showMine) return false;
      if (!mine && !filters.showOthers) return false;
      if (!filters.regions.has(p.region)) return false;
      if (filters.favoritesOnly && !favs.has(p.id)) return false;
      if (filters.recent !== 'all') {
        const days = Number(filters.recent);
        if (now - new Date(p.createdAt).getTime() > days * 86400000) return false;
      }
      if (q) {
        const hay =
          `${p.title} ${p.comment} ${p.placeName} ${p.prefecture} ${p.userName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [posts, filters, favs, q, now, me]);

  const visibleTrips = useMemo(() => {
    if (!q) return trips;
    return trips.filter((t) =>
      `${t.title} ${t.userName} ${t.spots.map((s) => s.name).join(' ')}`
        .toLowerCase()
        .includes(q),
    );
  }, [trips, q]);

  const pins: MapPin[] = visiblePosts.map((p) => ({
    id: p.id,
    lat: p.lat,
    lng: p.lng,
    title: p.title,
    comment: p.comment,
    userName: p.userName,
    photoUrl: p.photoId ? (photos.get(p.photoId) ?? null) : null,
    date: p.date,
    isMine: p.userId === me,
    isFavorite: favs.has(p.id),
  }));

  const onToggleFavorite = (postId: string) => {
    // 先に画面を変えて、サーバーの結果で合わせる（失敗したら元に戻る）
    setFavs((cur) => {
      const n = new Set(cur);
      if (n.has(postId)) n.delete(postId);
      else n.add(postId);
      return n;
    });
    toggleFavorite(postId, 'post')
      .then(() => favoriteIds())
      .then(setFavs)
      .catch(() => favoriteIds().then(setFavs).catch(() => {}));
  };

  // 写真には単独の閲覧ページが無いので、新着の写真のカードへ移って目立たせる
  const openPost = (postId: string) => {
    document.getElementById(`post-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(postId);
    window.setTimeout(() => setFlashId((cur) => (cur === postId ? null : cur)), 1600);
  };

  return (
    <>
      {/* 入口：最初の1画面まるごと。データの読み込みを待たずにすぐ押せる */}
      {/* スマホでは下部タブの分だけ低くする（大きなボタンがタブに隠れないように） */}
      <section className="relative isolate flex h-[calc(100dvh-3.5rem-env(safe-area-inset-bottom))] flex-col overflow-hidden sm:h-[100dvh]">
        <HeroBackdrop />
        <ThemeSwitch className="absolute right-4 top-4 z-10" />

        <div className="relative px-4 pt-5">
          <div className="flex items-center gap-2 text-sm font-bold text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
            Travel Route Share
          </div>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h1 className="hero-title text-[1.75rem] font-extrabold leading-snug text-ink sm:text-4xl">
            旅行のぜんぶを、
            <br className="sm:hidden" />
            地図にのこそう
          </h1>
        </div>

        <div className="relative mx-auto w-full max-w-md px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-col gap-3.5">
            <Link href="/trips/new" className="t-btn t-btn-primary w-full">
              <RouteIcon className="t-btn-icon h-6 w-6" />
              ルートを作る
            </Link>
            <Link href="/trips/new?mode=omoide" className="t-btn t-btn-secondary w-full">
              <BookIcon className="t-btn-icon h-6 w-6" />
              思い出をつくる
            </Link>
          </div>
          <DraftNotice />
          <a
            href="#explore"
            // 素の #explore への移動は Next が扱えない履歴（state なし）を作り、入力画面から戻っても
            // 画面が切り替わらなくなる（実測）。履歴を足さずにその場でスクロールだけする
            onClick={(e) => {
              e.preventDefault();
              const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
              document
                .getElementById('explore')
                ?.scrollIntoView({ behavior: reduce ? 'instant' : 'smooth', block: 'start' });
            }}
            className="mx-auto mt-3 flex min-h-11 w-fit items-center gap-1 rounded-full px-4 text-base font-bold text-muted hover:text-ink"
          >
            みんなの旅を見る
            <ArrowDownIcon className="h-4 w-4" />
          </a>
        </div>
      </section>

      {/* 2画面目以降：検索・絞り込み・地図・新着（機能は今までどおり） */}
      <div id="explore" className="mx-auto w-full max-w-6xl scroll-mt-16 space-y-6 px-4 pb-8 pt-20">
      {/* 検索バー＋絞り込み（フィルターは折りたたみ） */}
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          type="search"
          enterKeyHint="search"
          aria-label="さがす"
          placeholder="地名・旅行の名前でさがす"
          className="min-h-11 w-full min-w-0 rounded-full border-2 border-line bg-surface px-5 py-2 text-base text-ink shadow-sm outline-none placeholder:text-muted focus:border-primary"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="min-h-11 shrink-0 rounded-full border-2 border-line bg-surface px-4 text-sm font-bold text-ink hover:opacity-80"
        >
          絞り込み {showFilters ? '▲' : '▼'}
        </button>
      </div>

      {/* フィルター（デフォルト非表示） */}
      {showFilters && <FilterPanel filters={filters} onChange={setFilters} />}

      {/* 新着旅行 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">新着の旅行</h2>
          <Link
            href="/trips/new"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-surface px-4 text-sm font-bold text-ink transition hover:opacity-80"
          >
            ＋ ルートを作る
          </Link>
        </div>
        {!loaded ? (
          // 読み込み中は形だけ先に出す（「まだありません」を一瞬出さない）
          <div role="status" aria-label="読み込み中" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1].map((k) => (
              <SkeletonBlock key={k} className="h-60 w-full" />
            ))}
          </div>
        ) : loadError ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            旅行を読み込めませんでした。通信のよいところで開き直してください。
          </div>
        ) : visibleTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            {q ? '見つかりませんでした。ほかの言葉でさがしてください。' : 'まだ旅行がありません。「ルートを作る」から始めましょう。'}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTrips.map((t) => {
              const thumbId = t.spots.find((s) => s.photoId)?.photoId;
              return (
                <Link
                  key={t.id}
                  href={`/trips/view?id=${t.id}`}
                  className="t-card group overflow-hidden transition hover:-translate-y-0.5"
                >
                  <div className="h-36 w-full bg-surface-2">
                    <PhotoImg
                      photoId={thumbId}
                      urls={photos}
                      loading={photosLoading}
                      alt={t.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.status === 'plan'
                            ? 'bg-amber-500/15 text-amber-600'
                            : 'bg-emerald-500/15 text-emerald-600'
                        }`}
                      >
                        {t.status === 'plan' ? 'これから行く' : '思い出'}
                      </span>
                      <span className="text-xs text-muted">
                        {t.startDate}
                        {t.endDate && t.endDate !== t.startDate ? ` 〜 ${t.endDate}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-ink group-hover:text-primary">
                      {t.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-muted">
                      {t.spots.map((s) => s.name).join(' → ')}
                    </div>
                    <div className="mt-2 text-xs text-muted">{t.userName}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 地図：A＝タイル地図（くわしい地図に切替可）／B＝今までどおりの地球儀の地図 */}
      {theme === 'a' ? (
        <TopTileMap
          posts={visiblePosts}
          trips={visibleTrips}
          allTrips={trips}
          photos={photos}
          onOpenPost={openPost}
          detailMap={
            <>
              <JapanMap pins={pins} onToggleFavorite={onToggleFavorite} height="480px" />
              <p className="mt-1.5 text-xs text-muted">
                ピンを押すと写真が見られます。青いピンはあなたの投稿です。
              </p>
            </>
          }
        />
      ) : (
        <section>
          <JapanMap pins={pins} onToggleFavorite={onToggleFavorite} height="480px" />
          <p className="mt-1.5 text-xs text-muted">
            ピンを押すと写真が見られます。青いピンはあなたの投稿です。
          </p>
        </section>
      )}

      {/* 新着投稿 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">新着の写真</h2>
          <Link
            href="/posts/new"
            className="inline-flex min-h-11 items-center rounded-full border-2 border-line bg-surface px-4 text-sm font-bold text-ink transition hover:opacity-80"
          >
            ＋ 写真を投稿
          </Link>
        </div>
        {loaded && visiblePosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            出せる写真がありません（絞り込みを確かめてください）。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visiblePosts.map((p) => {
              return (
                <div
                  key={p.id}
                  id={`post-${p.id}`}
                  className={`t-card scroll-mt-20 overflow-hidden transition hover:-translate-y-0.5 ${
                    flashId === p.id ? 'ring-4 ring-[var(--accent)]' : ''
                  }`}
                >
                  <div className="h-28 w-full bg-surface-2">
                    <PhotoImg
                      photoId={p.photoId}
                      urls={photos}
                      loading={photosLoading}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-bold leading-tight text-ink">{p.title}</div>
                      <button
                        type="button"
                        onClick={() => onToggleFavorite(p.id)}
                        className={`-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center ${favs.has(p.id) ? 'text-amber-500' : 'text-muted'}`}
                        aria-label={favs.has(p.id) ? 'お気に入りを外す' : 'お気に入りに追加'}
                        aria-pressed={favs.has(p.id)}
                      >
                        <StarIcon filled={favs.has(p.id)} className="h-5 w-5" />
                      </button>
                    </div>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.prefecture} ・ {p.userName}
                    </div>
                    <div className="text-xs text-muted">{p.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </div>
    </>
  );
}
