'use client';

import TripForm from '@/components/TripForm';

export default function NewTripPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold">旅行ルートを作成</h1>
        <p className="mt-1 text-sm text-gray-500">
          行きたいスポットを順番に登録して、旅行全体のルートを作りましょう。旅行後は各スポットに写真を追加して「旅行記」として公開できます。
        </p>
      </div>
      <TripForm />
    </div>
  );
}
