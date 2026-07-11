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
    const now = Date.now();
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
  }, [posts, filters, favs, q]);

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
    <div className="space-y-6">
      {/* 検索バー */}
      <div className="flex items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔍 地名・都道府県・タイトル・投稿者で検索"
          className="w-full rounded-full border-2 border-sky-100 bg-white px-5 py-2.5 text-sm shadow-sm outline-none focus:border-sky-400"
        />
      </div>

      {/* フィルター */}
      <FilterPanel filters={filters} onChange={setFilters} />

      {/* 地図 */}
      <section>
        <JapanMap pins={pins} onToggleFavorite={onToggleFavorite} height="480px" />
        <p className="mt-1.5 text-xs text-gray-400">
          ピンは投稿者のアイコン（名前の頭文字）。青いピンが自分の投稿です。クリックすると写真と詳細が見られます。
        </p>
      </section>

      {/* 新着旅行 */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-extrabold">🧳 新着旅行</h2>
          <Link
            href="/trips/new"
            className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-600 transition hover:bg-sky-200"
          >
            ＋ 旅行ルートを作る
          </Link>
        </div>
        {visibleTrips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
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
                  className="group overflow-hidden rounded-2xl border-2 border-sky-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg"
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
                      <span className="text-xs text-gray-400">
                        {t.startDate}
                        {t.endDate && t.endDate !== t.startDate ? ` 〜 ${t.endDate}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-gray-900 group-hover:text-blue-600">
                      {t.title}
                    </div>
                    <div className="mt-1 truncate text-xs text-gray-500">
                      {t.spots.map((s) => s.name).join(' → ')}
                    </div>
                    <div className="mt-2 text-xs text-gray-400">{t.userName}</div>
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
          <h2 className="text-lg font-extrabold">📸 新着投稿</h2>
          <Link
            href="/posts/new"
            className="rounded-full bg-sky-100 px-3 py-1 text-sm font-bold text-sky-600 transition hover:bg-sky-200"
          >
            ＋ 写真を投稿する
          </Link>
        </div>
        {loaded && visiblePosts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-400">
            表示できる投稿がありません（フィルターを確認してください）。
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {visiblePosts.map((p) => {
              const photo = p.photoId ? photos.get(p.photoId) : null;
              return (
                <div
                  key={p.id}
                  className="overflow-hidden rounded-2xl border-2 border-sky-100 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-sky-300 hover:shadow-lg"
                >
                  <div className="h-28 w-full bg-gray-100">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={p.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="text-sm font-bold leading-tight">{p.title}</div>
                      <button
                        onClick={() => onToggleFavorite(p.id)}
                        className={`text-base leading-none ${favs.has(p.id) ? 'text-amber-400' : 'text-gray-300'}`}
                        title="お気に入り"
                      >
                        ★
                      </button>
                    </div>
                    <div className="mt-0.5 text-xs text-gray-500">
                      {p.prefecture} ・ {p.userName}
                    </div>
                    <div className="text-xs text-gray-400">{p.date}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
