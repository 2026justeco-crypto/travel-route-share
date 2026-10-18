'use client';

// お気に入り（下部タブの3つ目）。旅行と写真の★をつけたものだけを並べる。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Post, Trip } from '@/lib/types';
import { favoriteIds, listPosts, listTrips, toggleFavorite } from '@/lib/store';
import { photoGetMany } from '@/lib/idb';
import { StarIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';
import { canView } from '@/lib/groups';

function Favorites() {
  // ブラウザで描画するときだけ呼ばれる（親で useMounted を待つ）ので、ここで直接読む
  const [favs, setFavs] = useState(() => favoriteIds());
  const [trips] = useState<Trip[]>(() => listTrips().filter((t) => favs.has(t.id) && canView(t)));
  const [posts] = useState<Post[]>(() => listPosts().filter((p) => favs.has(p.id) && canView(p)));
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const ids = [
      ...posts.map((p) => p.photoId),
      ...trips.flatMap((t) => t.spots.map((s) => s.photoId)),
    ].filter((x): x is string => !!x);
    if (ids.length) photoGetMany(ids).then(setPhotos);
  }, [posts, trips]);

  const unfav = (id: string) => {
    toggleFavorite(id);
    setFavs(favoriteIds());
  };

  if (trips.length === 0 && posts.length === 0)
    return (
      <div className="rounded-xl border border-dashed border-line-soft bg-surface p-8 text-center text-sm text-muted">
        まだお気に入りはありません。旅行や写真の ★ を押すと、ここに集まります。
        <div className="mt-4">
          <Link href="/#explore" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-on-primary">
            みんなの旅をさがす
          </Link>
        </div>
      </div>
    );

  return (
    <div className="space-y-6">
      {trips.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">旅行</h2>
          <ul className="space-y-3">
            {trips.map((t) => {
              const thumbId = t.spots.find((s) => s.photoId)?.photoId;
              const thumb = thumbId ? photos.get(thumbId) : null;
              const on = favs.has(t.id);
              return (
                <li key={t.id} className="t-card flex items-center gap-3 overflow-hidden p-2">
                  <Link href={`/trips/view?id=${t.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      {thumb && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumb} alt="" className="h-full w-full object-cover" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-ink">{t.title}</div>
                      <div className="truncate text-sm text-muted">{t.spots.map((s) => s.name).join(' → ')}</div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => unfav(t.id)}
                    aria-pressed={on}
                    aria-label={on ? 'お気に入りを外す' : 'お気に入りに追加'}
                    className={`flex h-11 w-11 shrink-0 items-center justify-center ${on ? 'text-amber-500' : 'text-muted'}`}
                  >
                    <StarIcon filled={on} className="h-6 w-6" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {posts.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">写真</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {posts.map((p) => {
              const photo = p.photoId ? photos.get(p.photoId) : null;
              const on = favs.has(p.id);
              return (
                <div key={p.id} className="t-card overflow-hidden">
                  <div className="h-28 w-full bg-surface-2">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={p.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="flex items-start justify-between gap-1 p-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-bold leading-tight text-ink">{p.title}</div>
                      <div className="mt-0.5 text-xs text-muted">{p.prefecture}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => unfav(p.id)}
                      aria-pressed={on}
                      aria-label={on ? 'お気に入りを外す' : 'お気に入りに追加'}
                      className={`-m-2.5 flex h-11 w-11 shrink-0 items-center justify-center ${on ? 'text-amber-500' : 'text-muted'}`}
                    >
                      <StarIcon filled={on} className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  const mounted = useMounted();
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-extrabold">お気に入り</h1>
      {mounted ? <Favorites /> : <PageSkeleton />}
    </div>
  );
}
