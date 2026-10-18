'use client';

// お気に入り（下部タブ）。旅行と写真の★をつけたものだけを並べる。
// お気に入りはサーバーに置く（本人だけが読める・RLS）。見られなくなった旅行・写真は出さない（サーバーが返さない）。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Post, Trip } from '@/lib/types';
import { favoriteIds, listPosts, listTrips, toggleFavorite, type FavKind } from '@/lib/store';
import { photoUrls } from '@/lib/photos';
import PhotoImg from '@/components/PhotoImg';
import { StarIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

function Favorites() {
  const [favs, setFavs] = useState<Set<string>>(new Set());
  // 外したものも、この画面にいる間は残して ☆ に戻す（押し直せるように）
  const [trips, setTrips] = useState<Trip[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [photosLoading, setPhotosLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [fv, ts, ps] = await Promise.all([favoriteIds(), listTrips(), listPosts()]);
        if (!alive) return;
        const t = ts.filter((x) => fv.has(x.id));
        const p = ps.filter((x) => fv.has(x.id));
        setFavs(fv);
        setTrips(t);
        setPosts(p);
        const ids = [...p.map((x) => x.photoId), ...t.flatMap((x) => x.spots.map((s) => s.photoId))].filter(
          (x): x is string => !!x,
        );
        if (ids.length) {
          const ph = await photoUrls(ids).catch(() => new Map<string, string>());
          if (alive) setPhotos(ph);
        }
      } catch {
        if (alive) setLoadError(true);
      }
      if (alive) {
        setLoaded(true);
        setPhotosLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const unfav = async (id: string, kind: FavKind) => {
    const flip = (cur: Set<string>) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    };
    setFavs(flip);
    try {
      await toggleFavorite(id, kind);
    } catch {
      setFavs(flip);
    }
  };

  if (!loaded) return <PageSkeleton />;

  if (loadError)
    return (
      <div className="rounded-xl border border-dashed border-line-soft bg-surface p-8 text-center text-sm text-muted">
        お気に入りを読み込めませんでした。通信のよいところで開き直してください。
      </div>
    );

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
              const on = favs.has(t.id);
              return (
                <li key={t.id} className="t-card flex items-center gap-3 overflow-hidden p-2">
                  <Link href={`/trips/view?id=${t.id}`} className="flex min-h-14 min-w-0 flex-1 items-center gap-3">
                    <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-surface-2">
                      <PhotoImg photoId={thumbId} urls={photos} loading={photosLoading} alt="" className="h-full w-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-bold text-ink">{t.title}</div>
                      <div className="truncate text-sm text-muted">{t.spots.map((s) => s.name).join(' → ')}</div>
                    </div>
                  </Link>
                  <button
                    type="button"
                    onClick={() => unfav(t.id, 'trip')}
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
              const on = favs.has(p.id);
              return (
                <div key={p.id} className="t-card overflow-hidden">
                  <div className="h-28 w-full bg-surface-2">
                    <PhotoImg
                      photoId={p.photoId}
                      urls={photos}
                      loading={photosLoading}
                      alt={p.title}
                      className="h-full w-full object-cover"
                    />
                  </div>
                  <div className="flex items-start justify-between gap-1 p-2.5">
                    <div className="min-w-0">
                      <div className="text-sm font-bold leading-tight text-ink">{p.title}</div>
                      <div className="mt-0.5 text-xs text-muted">{p.prefecture}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => unfav(p.id, 'post')}
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
