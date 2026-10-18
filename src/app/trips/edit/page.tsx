'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { getTrip } from '@/lib/store';
import TripForm from '@/components/TripForm';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

function EditTrip({ id }: { id: string }) {
  // ブラウザで描画するときだけ呼ばれる（親で useMounted を待つ）ので、ここで直接読む
  const [trip] = useState(() => getTrip(id) ?? null);

  if (trip === null)
    return (
      <div className="text-sm text-muted">
        旅行が見つかりません。<Link href="/" className="text-link underline">トップへ戻る</Link>
      </div>
    );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">旅行ルートを編集</h1>
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
