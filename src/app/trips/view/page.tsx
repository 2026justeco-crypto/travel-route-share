'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Trip } from '@/lib/types';
import { getTrip, saveTrip, deleteTrip, CURRENT_USER } from '@/lib/store';
import { photoGetMany } from '@/lib/idb';
import type { RoutePoint } from '@/components/JapanMap';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading h-[560px]" />,
});

function TripDetail() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    const t = getTrip(id) ?? null;
    setTrip(t);
    if (t) {
      const ids = t.spots.map((s) => s.photoId).filter((x): x is string => !!x);
      photoGetMany(ids).then(setPhotos);
    }
  }, [id]);

  if (trip === undefined) return <div className="text-sm text-muted">読み込み中…</div>;
  if (trip === null)
    return (
      <div className="text-sm text-muted">
        旅行が見つかりません。<Link href="/" className="text-link underline">トップへ戻る</Link>
      </div>
    );

  const route: RoutePoint[] = trip.spots
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s, i) => ({ lat: s.lat!, lng: s.lng!, label: s.name || `スポット${i + 1}` }));

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

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                trip.status === 'plan' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {trip.status === 'plan' ? '🗓 これから行く' : '📖 思い出'}
            </span>
            <span className="text-sm text-muted">
              {trip.startDate}
              {trip.endDate && trip.endDate !== trip.startDate ? ` 〜 ${trip.endDate}` : ''}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{trip.title}</h1>
          <div className="mt-1 text-sm text-muted">作成：{trip.userName}</div>
        </div>
        {isMine && (
          <div className="flex items-center gap-2">
            {trip.status === 'plan' && (
              <button
                onClick={markDone}
                className="rounded-full bg-emerald-500 px-4 py-1.5 text-sm font-bold text-white shadow-md shadow-emerald-200 hover:bg-emerald-600"
              >
                📖 行ってきた！思い出にする
              </button>
            )}
            <Link
              href={`/trips/edit?id=${trip.id}`}
              className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-link hover:bg-tint"
            >
              編集
            </Link>
            <button
              onClick={remove}
              className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-500 hover:bg-red-500/10"
            >
              削除
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* ルート（左） */}
        <div className="lg:col-span-2">
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
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">位置未設定</span>
                      )}
                    </div>
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={s.name} className="mt-2 h-36 w-full rounded-lg object-cover" />
                    )}
                    {s.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{s.memo}</p>}
                  </div>
                  {i < trip.spots.length - 1 && (
                    <div className="py-1 text-center text-lg leading-none text-blue-400">↓</div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>

        {/* 地図（右） */}
        <div className="lg:col-span-3">
          <JapanMap route={route} center={center} zoom={route.length ? 11 : 5} height="560px" fitRoute roadRoute fitButton />
          {route.length < trip.spots.length && (
            <p className="mt-1.5 text-xs text-muted">
              位置未設定のスポットは地図に表示されません（編集画面で設定できます）。
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TripDetailPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">読み込み中…</div>}>
      <TripDetail />
    </Suspense>
  );
}
