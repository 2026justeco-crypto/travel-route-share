'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { Post, Trip } from '@/lib/types';
import {
  listPosts,
  listTrips,
  seedIfNeeded,
  favoriteIds,
  toggleFavorite,
  CURRENT_USER,
} from '@/lib/store';
import { photoGetMany } from '@/lib/idb';
import FilterPanel, { defaultFilters, type Filters } from '@/components/FilterPanel';
import HeroBackdrop from '@/components/HeroBackdrop';
import ThemeSwitch from '@/components/ThemeSwitch';
import { RouteIcon, BookIcon, ArrowDownIcon } from '@/components/icons';
import type { MapPin } from '@/components/JapanMap';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-[480px] items-center justify-center rounded-xl border border-gray-200 bg-gray-100 text-gray-400">
      地図を読み込み中…
    </div>
  ),
});

export default function Home() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [favs, setFavs] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<Filters>(defaultFilters());
  const [query, setQuery] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  // 「最近◯日」の基準時刻（描画のたびに変わらないよう、開いた時点で固定）
  const [now] = useState(() => Date.now());

  useEffect(() => {
    (async () => {
      await seedIfNeeded();
      const ps = listPosts();
      const ts = listTrips();
      setPosts(ps);
      setTrips(ts);
      setFavs(favoriteIds());
      const ids = [
        ...ps.map((p) => p.photoId),
        ...ts.flatMap((t) => t.spots.map((s) => s.photoId)),
      ].filter((x): x is string => !!x);
      setPhotos(await photoGetMany(ids));
      setLoaded(true);
    })();
  }, []);

  const q = query.trim().toLowerCase();

  const visiblePosts = useMemo(() => {
    return posts.filter((p) => {
      const mine = p.userId === CURRENT_USER.id;
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
  }, [posts, filters, favs, q, now]);

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
    isMine: p.userId === CURRENT_USER.id,
    isFavorite: favs.has(p.id),
  }));

  const onToggleFavorite = (postId: string) => {
    toggleFavorite(postId);
    setFavs(favoriteIds());
  };

  return (
    <>
      {/* 入口：最初の1画面まるごと。データの読み込みを待たずにすぐ押せる */}
      <section className="relative isolate flex h-[100dvh] flex-col overflow-hidden">
        <HeroBackdrop />
        <ThemeSwitch className="absolute right-4 top-4 z-10" />

        <div className="relative px-4 pt-5">
          <div className="flex items-center gap-2 text-sm font-bold text-muted">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-accent shadow-[0_0_10px_var(--accent)]" />
            Travel Route Share
          </div>
        </div>

        <div className="relative flex flex-1 flex-col items-center justify-center px-4 text-center">
          <h1 className="text-[1.75rem] font-extrabold leading-snug text-ink sm:text-4xl">
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
          <a
            href="#explore"
            className="mx-auto mt-4 flex w-fit items-center gap-1 rounded-full px-3 py-2 text-sm font-bold text-muted hover:text-ink"
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
          placeholder="🔍 地名・都道府県・タイトル・投稿者で検索"
          className="w-full rounded-full border-2 border-line bg-surface px-5 py-2.5 text-sm text-ink shadow-sm outline-none placeholder:text-muted focus:border-primary"
        />
        <button
          onClick={() => setShowFilters((v) => !v)}
          className="shrink-0 rounded-full border-2 border-line bg-surface px-4 py-2 text-sm font-bold text-ink hover:opacity-80"
        >
          絞り込み {showFilters ? '▲' : '▼'}
        </button>
      </div>

      {/* フィルター（デフォルト非表示） */}
      {showFilters && <FilterPanel filters={filters} onChange={setFilters} />}

      {/* 地図 */}
      <section>
        <JapanMap pins={pins} onToggleFavorite={onToggleFavorite} height="480px" />
        <p className="mt-1.5 text-xs text-muted">
          ピンは投稿者のアイコン（名前の頭文字）。青いピンが自分の投稿です。クリックすると写真と詳細が見られます。
        </p>
      </section>

      {/* 新着旅行 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">🧳 新着旅行</h2>
          <Link
            href="/trips/new"
            className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink transition hover:opacity-80"
          >
            ＋ 旅行ルートを作る
          </Link>
        </div>
        {visibleTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            まだ旅行ルートがありません。「旅行ルート作成」から最初の旅を計画してみましょう。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {visibleTrips.map((t) => {
              const thumbId = t.spots.find((s) => s.photoId)?.photoId;
              const thumb = thumbId ? photos.get(thumbId) : null;
              return (
                <Link
                  key={t.id}
                  href={`/trips/view?id=${t.id}`}
                  className="t-card group overflow-hidden transition hover:-translate-y-0.5"
                >
                  <div className="h-36 w-full bg-gradient-to-br from-blue-100 to-sky-50">
                    {thumb && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={t.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.status === 'plan'
                            ? 'bg-amber-50 text-amber-600'
                            : 'bg-emerald-50 text-emerald-600'
                        }`}
                      >
                        {t.status === 'plan' ? '🗓 これから行く' : '📖 思い出'}
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

      {/* 新着投稿 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold text-ink">📸 新着投稿</h2>
          <Link
            href="/posts/new"
            className="rounded-full border-2 border-line bg-surface px-3 py-1 text-sm font-bold text-ink transition hover:opacity-80"
          >
            ＋ 写真を投稿する
          </Link>
        </div>
        {loaded && visiblePosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-muted">
            表示できる投稿がありません（フィルターを確認してください）。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visiblePosts.map((p) => {
              const photo = p.photoId ? photos.get(p.photoId) : null;
              return (
                <div
                  key={p.id}
                  className="t-card overflow-hidden transition hover:-translate-y-0.5"
                >
                  <div className="h-28 w-full bg-gray-100">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={p.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-bold leading-tight text-ink">{p.title}</div>
                      <button
                        onClick={() => onToggleFavorite(p.id)}
                        className={`text-base leading-none ${favs.has(p.id) ? 'text-amber-400' : 'text-gray-300'}`}
                        title="お気に入り"
                      >
                        ★
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
