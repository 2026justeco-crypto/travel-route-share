'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { TransportMode, Trip, TripSpot } from '@/lib/types';
import { saveTrip, uid, CURRENT_USER } from '@/lib/store';
import { photoPut, photoGetMany } from '@/lib/idb';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';
import { MODE_COLOR, TRANSPORT_LABEL, TRANSPORT_MODES, routeFromSpots } from '@/lib/transport';
import { useTheme } from '@/lib/useTheme';
import { ModeIcon, ModeUnsetIcon } from '@/components/icons';
import type { RoutePoint } from '@/components/JapanMap';

interface SpotSearch {
  spotId: string;
  busy: boolean;
  hits: PlaceHit[] | null;
  error: string;
}

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading h-[520px]" />,
});

interface Props {
  initial?: Trip; // 編集時に渡す
  initialStatus?: 'plan' | 'done'; // 新規作成時の初期状態（「思い出をつくる」入口用）
}

export default function TripForm({ initial, initialStatus }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [startDate, setStartDate] = useState(
    initial?.startDate ?? new Date().toISOString().slice(0, 10),
  );
  const [endDate, setEndDate] = useState(initial?.endDate ?? '');
  const [status, setStatus] = useState<'plan' | 'done'>(initial?.status ?? initialStatus ?? 'plan');
  const [spots, setSpots] = useState<TripSpot[]>(initial?.spots ?? []);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState<SpotSearch | null>(null);
  // 移動手段の選択肢を開いている区間（その区間の出発スポットの id）
  const [moveOpen, setMoveOpen] = useState<string | null>(null);
  const theme = useTheme();

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
    setSpots((ss) => {
      // 新しくできる区間（今の最後 → 新しいスポット）は、直前の区間と同じ手段を初期値にする（未設定なら未設定のまま）
      const n = ss.length;
      if (n >= 2 && ss[n - 2].moveTo && !ss[n - 1].moveTo) {
        const prev = ss[n - 2].moveTo;
        return [...ss.slice(0, n - 1), { ...ss[n - 1], moveTo: prev }, s];
      }
      return [...ss, s];
    });
    setPickTarget(s.id);
  };

  const setMove = (spotId: string, mode: TransportMode | undefined) => {
    setSpots((ss) =>
      ss.map((x) => {
        if (x.id !== spotId) return x;
        const next = { ...x };
        if (mode) next.moveTo = mode;
        else delete next.moveTo;
        return next;
      }),
    );
    setMoveOpen(null);
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

  const route: RoutePoint[] = routeFromSpots(spots);

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
      // 最後のスポットには「次への移動手段」は要らないので外して保存する
      spots: spots.map((s, i) => {
        if (i < spots.length - 1 || !s.moveTo) return s;
        const rest = { ...s };
        delete rest.moveTo;
        return rest;
      }),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
    };
    saveTrip(trip);
    router.push(`/trips/view?id=${trip.id}`);
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        <div className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-soft">
              旅行タイトル <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：東京1泊2日 下町めぐり"
              className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-soft">開始日</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-soft">終了日</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>
          {/* 予定か思い出か：新規は入口で選んだ方に固定。編集では「これから行く」旅行にだけ「思い出にする」を出す */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                status === 'plan' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
              }`}
            >
              {status === 'plan' ? '🗓 これから行く旅行' : '📖 行ってきた旅行（思い出）'}
            </span>
            {initial?.status === 'plan' && status === 'plan' && (
              <button
                type="button"
                onClick={() => setStatus('done')}
                className="min-h-11 rounded-full bg-emerald-500 px-4 text-sm font-bold text-white shadow-md hover:bg-emerald-600"
              >
                旅行が終わったら → 📖 思い出にする
              </button>
            )}
            {initial?.status === 'plan' && status === 'done' && (
              <span className="text-xs text-muted">
                「更新する」で思い出になります。
                <button type="button" onClick={() => setStatus('plan')} className="ml-1 font-bold text-link underline">
                  取り消す
                </button>
              </span>
            )}
          </div>
        </div>

        {/* スポット一覧 */}
        <div className="space-y-3">
          {spots.map((s, i) => (
            <div key={s.id}>
            <div
              className={`rounded-xl border bg-surface p-3 ${
                pickTarget === s.id ? 'border-blue-400 ring-2 ring-tint' : 'border-line-soft'
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
                  className="w-full rounded-lg border border-line-soft px-3 py-1.5 text-sm outline-none focus:border-blue-400"
                />
                <button onClick={() => move(i, -1)} className="rounded border border-line-soft px-2 py-1 text-xs text-muted hover:bg-surface-2" title="上へ">↑</button>
                <button onClick={() => move(i, 1)} className="rounded border border-line-soft px-2 py-1 text-xs text-muted hover:bg-surface-2" title="下へ">↓</button>
                <button onClick={() => removeSpot(s.id)} className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-500/10" title="削除">✕</button>
              </div>
              <textarea
                value={s.memo}
                onChange={(e) => updateSpot(s.id, { memo: e.target.value })}
                rows={2}
                placeholder="メモ（予定・感想など）"
                className="mt-2 w-full rounded-lg border border-line-soft px-3 py-1.5 text-sm outline-none focus:border-blue-400"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                <button
                  onClick={() => searchSpot(s.id)}
                  disabled={!s.name.trim() || (search?.busy && search.spotId === s.id)}
                  className="rounded-full border border-blue-300 px-3 py-1 font-bold text-link hover:bg-tint disabled:cursor-not-allowed disabled:border-line-soft disabled:text-muted/50"
                >
                  {search?.busy && search.spotId === s.id ? '検索中…' : '🔍 名前から位置を探す'}
                </button>
                <label className="cursor-pointer rounded-full border border-blue-300 px-3 py-1 font-bold text-link hover:bg-tint">
                  📷 写真を追加（位置も自動設定）
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => onSpotPhoto(s.id, e)} />
                </label>
                <button
                  onClick={() => setPickTarget(pickTarget === s.id ? null : s.id)}
                  className={`rounded-full px-3 py-1 font-bold ${
                    pickTarget === s.id
                      ? 'bg-blue-600 text-white'
                      : 'border border-line-soft text-muted hover:bg-surface-2'
                  }`}
                >
                  {pickTarget === s.id ? '地図をクリックして位置指定中…' : '📍 地図で指定'}
                </button>
                <span className="text-muted">
                  {s.lat !== null ? `位置設定済み (${s.lat!.toFixed(3)}, ${s.lng!.toFixed(3)})` : '位置未設定'}
                </span>
              </div>
              {search && search.spotId === s.id && (search.hits?.length || search.error) ? (
                <div className="mt-2 space-y-1 rounded-xl bg-tint p-2 text-xs">
                  {search.error && <div className="text-red-500">{search.error}</div>}
                  {search.hits?.map((h, hi) => (
                    <button
                      key={hi}
                      onClick={() => pickHit(s.id, h)}
                      className="block w-full rounded-lg bg-surface px-2.5 py-1.5 text-left text-ink-soft shadow-sm hover:bg-tint"
                    >
                      📍 {shortLabel(h.label)}
                    </button>
                  ))}
                  <div className="text-right text-[10px] text-muted">検索: OpenStreetMap Nominatim</div>
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
            {i < spots.length - 1 && (
              <MovePicker
                mode={s.moveTo}
                open={moveOpen === s.id}
                color={s.moveTo ? MODE_COLOR[theme][s.moveTo] : undefined}
                colors={MODE_COLOR[theme]}
                onToggle={() => setMoveOpen(moveOpen === s.id ? null : s.id)}
                onPick={(m) => setMove(s.id, m)}
              />
            )}
            </div>
          ))}
          <button
            onClick={addSpot}
            className="w-full rounded-xl border-2 border-dashed border-blue-300 bg-tint/50 py-3 text-sm font-semibold text-link hover:bg-tint"
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
            <span className="text-xs text-muted">タイトルと、各スポットの名前を入力してください</span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg bg-tint px-3 py-2 text-xs text-link">
          {pickTarget
            ? '地図をクリックすると、選択中のスポットに位置が設定されます。'
            : 'スポット名を入れて「🔍 名前から位置を探す」→候補を選ぶだけで位置が入ります。スマホ写真なら「📷 写真を追加」でGPSから自動設定。手動派は「📍 地図で指定」→地図をクリック。'}
        </div>
        <JapanMap route={route} onPick={onMapPick} height="520px" fitButton />
      </div>
    </div>
  );
}

/** スポットとスポットの間：移動手段を選ぶ小さなボタン。押すと7つのアイコンが横に並ぶ（1タップで選んで閉じる） */
function MovePicker({
  mode,
  open,
  color,
  colors,
  onToggle,
  onPick,
}: {
  mode: TransportMode | undefined;
  open: boolean;
  color: string | undefined;
  colors: Record<TransportMode, string>;
  onToggle: () => void;
  onPick: (m: TransportMode | undefined) => void;
}) {
  return (
    <div className="flex flex-col items-center py-1.5">
      <div className="h-2 w-0.5 rounded bg-line-soft" aria-hidden />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={`次のスポットへの移動手段：${mode ? TRANSPORT_LABEL[mode] : '未設定'}（押して選ぶ）`}
        className={`flex min-h-11 items-center gap-1.5 rounded-full border-2 bg-surface px-4 text-sm font-bold ${
          mode ? '' : 'border-dashed border-line-soft text-muted'
        }`}
        style={mode && color ? { borderColor: color, color } : undefined}
      >
        {mode ? <ModeIcon mode={mode} className="h-5 w-5" /> : <ModeUnsetIcon className="h-5 w-5" />}
        <span className={mode ? 'text-ink' : ''}>{mode ? TRANSPORT_LABEL[mode] : '移動手段'}</span>
        <span className="text-[10px] text-muted" aria-hidden>
          {open ? '▲' : '▼'}
        </span>
      </button>
      {open && (
        <div className="mt-2 w-full rounded-xl border border-line-soft bg-surface p-1.5 shadow-sm">
          <div role="group" aria-label="移動手段を選ぶ" className="grid grid-cols-7 gap-1">
            {TRANSPORT_MODES.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onPick(m)}
                aria-pressed={mode === m}
                className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-0.5 text-[10px] font-bold leading-tight ${
                  mode === m ? 'bg-tint' : 'border-transparent hover:bg-surface-2'
                }`}
                style={{ color: colors[m], ...(mode === m ? { borderColor: colors[m] } : {}) }}
              >
                <ModeIcon mode={m} className="h-6 w-6" />
                <span className="whitespace-nowrap text-ink-soft">{TRANSPORT_LABEL[m]}</span>
              </button>
            ))}
          </div>
          {mode && (
            <button
              type="button"
              onClick={() => onPick(undefined)}
              className="mt-1 min-h-11 w-full rounded-lg text-xs font-bold text-muted hover:bg-surface-2"
            >
              未設定に戻す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
