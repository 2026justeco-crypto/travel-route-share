'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TripForm from '@/components/TripForm';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

function NewTrip() {
  const searchParams = useSearchParams();
  const omoide = searchParams.get('mode') === 'omoide';
  // 下書き（localStorage）を初期値に使うので、ブラウザで描画するまで骨組みを出す
  const mounted = useMounted();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold">{omoide ? '思い出をつくる' : '旅行ルートを作る'}</h1>
        <p className="mt-1 text-sm text-muted">
          {omoide
            ? '写真を選ぶと、撮った場所と日付が入ります。'
            : '行きたい場所を順番に入れます。'}
        </p>
      </div>
      {mounted ? <TripForm initialStatus={omoide ? 'done' : 'plan'} /> : <PageSkeleton />}
    </div>
  );
}

export default function NewTripPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <NewTrip />
    </Suspense>
  );
}
