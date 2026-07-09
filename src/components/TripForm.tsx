'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Trip, TripSpot } from '@/lib/types';
import { saveTrip, uid, CURRENT_USER } from '@/lib/store';
import { photoPut, photoGetMany } from '@/lib/idb';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import type { RoutePoint } from '@/components/JapanMap';

const JapanMap = dynamic(() => import('@/components/JapanMap'), { ssr: false });

interface Props {
  initial?: Trip; // 編集時に渡す
}

export default function TripForm({ initial }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startDate, setStartDate] = useState(
    initial?.startDate ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [status, setStatus] = useState<'plan' | 'done'>(initial?.status ?? 'plan');
  const [spots, setSpots] = useState<TripSpot[]>(initial?.spots ?? []);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const ids = (initial?.spots ?? [])
      .map((s) => s.photoId)
      .filter((x): x is string => !!x);
    if (ids.length) photoGetMany(ids).then(setPhotos);
  }, [initial]);

  const updateSpot = (id: string, patch: Partial<TripSpot>) =>
    setSpots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSpot = () => {
    const s: TripSpot = { id: uid(), name: '', memo: '', lat: null, lng: null, photoId: null };
    setSpots((ss) => [...ss, s]);
    setPickTarget(s.id);
  };

  const removeSpot = (id: string) => {
    setSpots((ss) => ss.filter((s) => s.id !== id));
    if (pickTarget === id) setPickTarget(null);
  };

  const move = (i: number, dir: -1 | 1) => {
    setSpots((ss) => {
      const j = i + dir;
      if (j < 0 || j >= ss.length) return ss;
      const next = [...ss];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const onSpotPhoto = async (spotId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const spot = spots.find((s) => s.id === spotId);
    const gps = await extractGps(file);
    const dataUrl = await fileToDataUrl(file);
    const photoId = uid();
    await photoPut(photoId, dataUrl);
    setPhotos((m) => new Map(m).set(photoId, dataUrl));
    updateSpot(spotId, {
      photoId,
      // スポットに位置が未設定なら写真のGPSを流用
      ...(gps && spot && spot.lat === null ? { lat: gps.lat, lng: gps.lng } : {}),
    });
  };

  const onMapPick = (lat: number, lng: number) => {
    if (!pickTarget) return;
    updateSpot(pickTarget, { lat, lng });
  };

  const route: RoutePoint[] = spots
    .filter((s) => s.lat !== null && s.lng !== null)
    .map((s, i) => ({ lat: s.lat!, lng: s.lng!, label: s.name || `スポット${i + 1}` }));

  const valid = title.trim() && spots.length >= 1 && spots.every((s) => s.name.trim());

  const submit = () => {
    if (!valid || saving) return;
    setSaving(true);
    const trip: Trip = {
      id: initial?.id ?? uid(),
      userId: initial?.userId ?? CURRENT_USER.id,
      userName: initial?.userName ?? CURRENT_USER.name,
      title: title.trim(),
      startDate,
      endDate: endDate || startDate,
      status,
      spots,
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    saveTrip(trip);
    router.push(`/trips/view?id=${trip.id}`);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              旅行タイトル <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：東京1泊2日 下町めぐり"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">状態</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as 'plan' | 'done')}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              >
                <option value="plan">予定（旅行前）</option>
                <option value="done">旅行記（旅行後）</option>
              </select>
            </div>
          </div>
        </div>

        {/* スポット一覧 */}
        <div className="space-y-3">
          {spots.map((s, i) => (
            <div
              key={s.id}
              className={`rounded-xl border bg-white p-3 ${
                pickTarget === s.id ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <input
                  value={s.name}
                  onChange={(e) => updateSpot(s.id, { name: e.target.value })}
                  placeholder="スポット名（例：東京駅）*"
                  className="w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                />
                <button onClick={() => move(i, -1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50" title="上へ">↑</button>
                <button onClick={() => move(i, 1)} className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-500 hover:bg-gray-50" title="下へ">↓</button>
                <button onClick={() => removeSpot(s.id)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50" title="削除">✕</button>
              </div>
              <textarea
                value={s.memo}
                onChange={(e) => updateSpot(s.id, { memo: e.target.value })}
                rows={2}
                placeholder="メモ（予定・感想など）"
                className="mt-2 w-full rounded-lg border border-gray-200 px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => setPickTarget(pickTarget === s.id ? null : s.id)}
                  className={`rounded-lg px-2.5 py-1 font-semibold ${
                    pickTarget === s.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-blue-300 text-blue-600 hover:bg-blue-50'
                  }`}
                >
                  {pickTarget === s.id ? '地図をクリックして位置指定中…' : '地図で位置を指定'}
                </button>
                <span className="text-gray-400">
                  {s.lat !== null ? `位置設定済み (${s.lat!.toFixed(3)}, ${s.lng!.toFixed(3)})` : '位置未設定'}
                </span>
                <label className="cursor-pointer rounded-lg border border-gray-300 px-2.5 py-1 font-semibold text-gray-600 hover:bg-gray-50">
                  📷 写真を追加
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onSpotPhoto(s.id, e)} />
                </label>
              </div>
              {s.photoId && photos.get(s.photoId) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photos.get(s.photoId)!}
                  alt={s.name}
                  className="mt-2 h-28 w-full rounded-lg object-cover"
                />
              )}
            </div>
          ))}
          <button
            onClick={addSpot}
            className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-blue-50/50 py-3 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            ＋ スポットを追加
          </button>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={submit}
            disabled={!valid || saving}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
          >
            {saving ? '保存中…' : initial ? '更新する' : '旅行ルートを保存'}
          </button>
          {!valid && (
            <span className="text-xs text-gray-400">タイトルと、各スポットの名前を入力してください</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
          {pickTarget
            ? '地図をクリックすると、選択中のスポットに位置が設定されます。'
            : 'スポットの「地図で位置を指定」を押してから地図をクリックしてください。写真のGPS情報からも自動設定されます。'}
        </div>
        <JapanMap route={route} onPick={onMapPick} height="520px" />
      </div>
    </div>
  );
}
