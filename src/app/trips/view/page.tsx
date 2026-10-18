'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Trip } from '@/lib/types';
import { getTrip, saveTrip, deleteTrip, isFavorite, toggleFavorite, CURRENT_USER } from '@/lib/store';
import { photoGetMany } from '@/lib/idb';
import type { RoutePoint } from '@/components/JapanMap';
import { ModeIcon, StarIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { MODE_COLOR, TRANSPORT_LABEL, routeFromSpots } from '@/lib/transport';
import { useTheme } from '@/lib/useTheme';
import { useMounted } from '@/lib/useMounted';

// スマホでは地図を先に・画面の半分ほどで出す（ルートをすぐ確かめられるように）
const MAP_HEIGHT = 'min(52vh, 560px)';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading" style={{ height: MAP_HEIGHT }} />,
});

function TripDetail({ id }: { id: string }) {
  const router = useRouter();
  // ブラウザで描画するときだけ呼ばれる（親で useMounted を待つ）ので、ここで直接読む
  const [trip, setTrip] = useState<Trip | null>(() => getTrip(id) ?? null);
  const [fav, setFav] = useState(() => isFavorite(id));
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const theme = useTheme();

  const photoKey = (trip?.spots ?? []).map((s) => s.photoId ?? '').join(',');
  useEffect(() => {
    const ids = photoKey.split(',').filter(Boolean);
    if (ids.length) photoGetMany(ids).then(setPhotos);
  }, [photoKey]);

  if (trip === null)
    return (
      <div className="text-sm text-muted">
        旅行が見つかりません。<Link href="/" className="text-link underline">トップへ戻る</Link>
      </div>
    );

  const route: RoutePoint[] = routeFromSpots(trip.spots);

  const center: [number, number] =
    route.length > 0
      ? [
          route.reduce((a, r) => a + r.lat, 0) / route.length,
          route.reduce((a, r) => a + r.lng, 0) / route.length,
        ]
      : [37.5, 137.0];

  const isMine = trip.userId === CURRENT_USER.id;

  const markDone = () => {
    const next = { ...trip, status: 'done' as const };
    saveTrip(next);
    setTrip(next);
  };

  const remove = () => {
    if (!confirm('この旅行ルートを削除しますか？')) return;
    deleteTrip(trip.id);
    router.push('/');
  };

  const onFav = () => setFav(toggleFavorite(trip.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                trip.status === 'plan' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
              }`}
            >
              {trip.status === 'plan' ? 'これから行く' : '思い出'}
            </span>
            <span className="text-sm text-muted">
              {trip.startDate}
              {trip.endDate && trip.endDate !== trip.startDate ? ` 〜 ${trip.endDate}` : ''}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{trip.title}</h1>
          <div className="mt-1 text-sm text-muted">作った人：{trip.userName}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onFav}
            aria-pressed={fav}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold ${
              fav ? 'border-amber-400 bg-amber-400/15 text-amber-600' : 'border-line-soft text-ink-soft hover:bg-surface-2'
            }`}
          >
            <StarIcon filled={fav} className={`h-5 w-5 ${fav ? 'text-amber-500' : ''}`} />
            {fav ? 'お気に入り済み' : 'お気に入り'}
          </button>
          {isMine && trip.status === 'plan' && (
            <button
              type="button"
              onClick={markDone}
              className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
            >
              行ってきた：思い出にする
            </button>
          )}
          {isMine && (
            <>
              <Link
                href={`/trips/edit?id=${trip.id}`}
                className="inline-flex min-h-11 items-center rounded-full border-2 border-blue-600 px-4 text-sm font-bold text-link hover:bg-tint"
              >
                編集
              </Link>
              <button
                type="button"
                onClick={remove}
                className="min-h-11 rounded-full border-2 border-red-300 px-4 text-sm font-bold text-red-500 hover:bg-red-500/10"
              >
                削除
              </button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* 地図（スマホでは先に・PCでは右） */}
        <div className="order-first lg:order-none lg:col-span-3 lg:col-start-3 lg:row-start-1">
          <JapanMap
            route={route}
            center={center}
            zoom={route.length ? 11 : 5}
            height={MAP_HEIGHT}
            fitRoute
            roadRoute
            fitButton
          />
          {route.length < trip.spots.length && (
            <p className="mt-1.5 text-sm text-muted">
              位置が入っていないスポットは地図に出ません（「編集」で入れられます）。
            </p>
          )}
        </div>

        {/* ルート（左） */}
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <ol className="space-y-0">
            {trip.spots.map((s, i) => {
              const photo = s.photoId ? photos.get(s.photoId) : null;
              return (
                <li key={s.id}>
                  <div className="rounded-xl border border-line-soft bg-surface p-3">
                    <div className="flex items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="font-bold">{s.name}</span>
                      {s.lat === null && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">位置なし</span>
                      )}
                    </div>
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={s.name} className="mt-2 h-36 w-full rounded-lg object-cover" />
                    )}
                    {s.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{s.memo}</p>}
                  </div>
                  {i < trip.spots.length - 1 &&
                    (s.moveTo ? (
                      <div
                        className="flex items-center justify-center gap-1.5 py-1.5 text-sm font-bold"
                        style={{ color: MODE_COLOR[theme][s.moveTo] }}
                      >
                        <span className="text-lg leading-none">↓</span>
                        <ModeIcon mode={s.moveTo} className="h-5 w-5" />
                        <span className="text-ink-soft">{TRANSPORT_LABEL[s.moveTo]}</span>
                      </div>
                    ) : (
                      <div className="py-1 text-center text-lg leading-none text-blue-400">↓</div>
                    ))}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

function TripDetailGate() {
  const id = useSearchParams().get('id') ?? '';
  const mounted = useMounted();
  if (!mounted) return <PageSkeleton />;
  return <TripDetail key={id} id={id} />;
}

export default function TripDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TripDetailGate />
    </Suspense>
  );
}
