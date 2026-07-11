'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import type { Trip } from '@/lib/types';
import { getTrip } from '@/lib/store';
import TripForm from '@/components/TripForm';

function EditTrip() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? '';
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);

  useEffect(() => {
    setTrip(getTrip(id) ?? null);
  }, [id]);

  if (trip === undefined) return <div className="text-sm text-gray-400">読み込み中…</div>;
  if (trip === null)
    return (
      <div className="text-sm text-gray-500">
        旅行が見つかりません。<Link href="/" className="text-blue-600 underline">トップへ戻る</Link>
      </div>
    );

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold">旅行ルートを編集</h1>
      <p className="text-sm text-gray-500">
        旅行が終わったら、各スポットに実際の写真を追加して「行ってきた」に切り替えましょう。旅の記録がそのまま思い出ページになります。
      </p>
      <TripForm initial={trip} />
    </div>
  );
}

export default function EditTripPage() {
  return (
    <Suspense fallback={<div className="text-sm text-gray-400">読み込み中…</div>}>
      <EditTrip />
    </Suspense>
  );
}
