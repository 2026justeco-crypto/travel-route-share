'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import TripForm from '@/components/TripForm';

function NewTrip() {
  const searchParams = useSearchParams();
  const omoide = searchParams.get('mode') === 'omoide';

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold">{omoide ? '📖 思い出をつくる' : '🧭 旅行ルートを作成'}</h1>
        <p className="mt-1 text-sm text-muted">
          {omoide
            ? '行った場所を順番に登録して、写真を貼っていきましょう。旅のルートがそのまま思い出ページになります。'
            : '行きたいスポットを順番に登録して、旅行全体のルートを作りましょう。旅行後は各スポットに写真を追加して「思い出」として公開できます。'}
        </p>
      </div>
      <TripForm initialStatus={omoide ? 'done' : 'plan'} />
    </div>
  );
}

export default function NewTripPage() {
  return (
    <Suspense fallback={<div className="text-sm text-muted">読み込み中…</div>}>
      <NewTrip />
    </Suspense>
  );
}
