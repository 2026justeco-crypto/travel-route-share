'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { Trip, TripSpot } from '@/lib/types';
import { saveTrip, uid, CURRENT_USER } from '@/lib/store';
import { photoPut, photoGetMany } from '@/lib/idb';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';
import type { RoutePoint } from '@/components/JapanMap';

interface SpotSearch {
  spotId: string;
  busy: boolean;
  hits: PlaceHit[] | null;
  error: string;
}

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
  const [search, setSearch] = useState<SpotSearch | null>(null);

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

  const searchSpot = async (spotId: string) => {
    const spot = spots.find((s) => s.id === spotId);
    const q = spot?.name.trim();
    if (!q || search?.busy) return;
    setSearch({ spotId, busy: true, hits: null, error: '' });
    try {
      const hits = await searchPlaces(q);
      setSearch({
        spotId,
        busy: false,
        hits,
        error: hits.length === 0 ? '見つかりませんでした。地名を足してみてください（例：横浜中華街 神奈川）' : '',
      });
    } catch {
      setSearch({ spotId, busy: false, hits: null, error: '検索に失敗しました。少し待ってからもう一度どうぞ。' });
    }
  };

  const pickHit = (spotId: string, hit: PlaceHit) => {
    updateSpot(spotId, { lat: hit.lat, lng: hit.lng });
    setSearch(null);
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
              <label className="mb-1 block text-sm font-semibold text-gray-700">この旅行は？</label>
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button
                  type="button"
                  onClick={() => setStatus('plan')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                    status === 'plan' ? 'bg-amber-500 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  🗓 これから行く
                </button>
                <button
                  type="button"
                  onClick={() => setStatus('done')}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold ${
                    status === 'done' ? 'bg-emerald-500 text-white shadow' : 'text-gray-500 hover:bg-gray-100'
                  }`}
                >
                  📖 行ってきた
                </button>
              </div>
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
                  onClick={() => searchSpot(s.id)}
                  disabled={!s.name.trim() || (search?.busy && search.spotId === s.id)}
                  className="rounded-full border border-blue-300 px-3 py-1 font-bold text-blue-600 hover:bg-blue-50 disabled:cursor-not-allowed disabled:border-gray-200 disabled:text-gray-300"
                >
                  {search?.busy && search.spotId === s.id ? '検索中…' : '🔍 名前から位置を探す'}
                </button>
                <label className="cursor-pointer rounded-full border border-blue-300 px-3 py-1 font-bold text-blue-600 hover:bg-blue-50">
                  📷 写真を追加（位置も自動設定）
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onSpotPhoto(s.id, e)} />
                </label>
                <button
                  onClick={() => setPickTarget(pickTarget === s.id ? null : s.id)}
                  className={`rounded-full px-3 py-1 font-bold ${
                    pickTarget === s.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {pickTarget === s.id ? '地図をクリックして位置指定中…' : '📍 地図で指定'}
                </button>
                <span className="text-gray-400">
                  {s.lat !== null ? `位置設定済み (${s.lat!.toFixed(3)}, ${s.lng!.toFixed(3)})` : '位置未設定'}
                </span>
              </div>
              {search && search.spotId === s.id && (search.hits?.length || search.error) ? (
                <div className="mt-2 space-y-1 rounded-xl bg-blue-50 p-2 text-xs">
                  {search.error && <div className="text-red-500">{search.error}</div>}
                  {search.hits?.map((h, hi) => (
                    <button
                      key={hi}
                      onClick={() => pickHit(s.id, h)}
                      className="block w-full rounded-lg bg-white px-2.5 py-1.5 text-left text-gray-700 shadow-sm hover:bg-blue-100"
                    >
                      📍 {shortLabel(h.label)}
                    </button>
                  ))}
                  <div className="text-right text-[10px] text-gray-400">検索: OpenStreetMap Nominatim</div>
                </div>
              ) : null}
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
            className="rounded-full bg-sky-500 px-6 py-2 text-sm font-bold text-white shadow-md shadow-sky-200 hover:bg-sky-600 disabled:cursor-not-allowed disabled:bg-gray-300 disabled:shadow-none"
          >
            {saving ? '保存中…' : initial ? '更新する' : '🧳 旅行ルートを保存'}
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
            : 'スポット名を入れて「🔍 名前から位置を探す」→候補を選ぶだけで位置が入ります。スマホ写真なら「📷 写真を追加」でGPSから自動設定。手動派は「📍 地図で指定」→地図をクリック。'}
        </div>
        <JapanMap route={route} onPick={onMapPick} height="520px" />
      </div>
    </div>
  );
}
