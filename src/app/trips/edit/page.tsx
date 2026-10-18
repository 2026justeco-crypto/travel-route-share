'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Trip } from '@/lib/types';
import { getTrip } from '@/lib/store';
import { useAuth } from '@/lib/supabase';
import TripForm from '@/components/TripForm';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

function EditTrip({ id }: { id: string }) {
  // undefined＝読み込み中／null＝無い・見られない
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  const [loadError, setLoadError] = useState(false);
  const auth = useAuth();

  useEffect(() => {
    let alive = true;
    getTrip(id)
      .then((t) => alive && setTrip(t ?? null))
      .catch(() => {
        if (!alive) return;
        setLoadError(true);
        setTrip(null);
      });
    return () => {
      alive = false;
    };
  }, [id]);

  if (trip === undefined || (trip && auth.status === 'loading')) return <PageSkeleton />;

  if (trip === null)
    return (
      <div className="text-sm text-muted">
        {loadError ? '旅行を読み込めませんでした。通信のよいところで開き直してください。' : '旅行が見つかりません。'}
        <Link href="/" className="text-link underline">トップへ戻る</Link>
      </div>
    );

  // 自分の旅行でなければ編集画面を出さない（出さないのは見た目の都合。守りは RLS）
  if (trip.userId !== auth.userId)
    return (
      <div className="text-sm text-muted">
        この旅行は作った人だけが編集できます。
        <Link href={`/trips/view?id=${trip.id}`} className="text-link underline">
          旅行を見る
        </Link>
      </div>
    );

  return (
    <div className="space-y-4">
      {/* 画面名はヘッダーに出しているので、見出しは読み上げ用だけにする */}
      <h1 className="sr-only">旅行ルートを編集</h1>
      <p className="text-sm text-muted">
        {trip.status === 'plan'
          ? '旅行が終わったら写真を足して「思い出にする」を押してください。'
          : '写真やメモ、移動手段を足して、思い出を仕上げましょう。'}
      </p>
      <TripForm initial={trip} />
    </div>
  );
}

function EditTripGate() {
  const id = useSearchParams().get('id') ?? '';
  const mounted = useMounted();
  if (!mounted) return <PageSkeleton />;
  return <EditTrip key={id} id={id} />;
}

export default function EditTripPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EditTripGate />
    </Suspense>
  );
}
