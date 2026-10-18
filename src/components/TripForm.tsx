'use client';

// 旅行ルートの作成・編集フォーム。
// ★ localStorage の下書きを初期値に使うので、呼び出し側はブラウザでだけ描画する（useMounted で待つ）。

import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import type { TransportMode, Trip, TripSpot } from '@/lib/types';
import { saveTrip, uid, ME_NAME, loadDraft, saveDraft, clearDraft } from '@/lib/store';
import { photoPut, photoGetMany } from '@/lib/idb';
import { extractDate, extractGps, fileToDataUrl } from '@/lib/exif';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';
import { nearestPrefecture } from '@/lib/regions';
import { MODE_COLOR, TRANSPORT_LABEL, TRANSPORT_MODES, routeFromSpots } from '@/lib/transport';
import { useTheme } from '@/lib/useTheme';
import {
  CameraIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CloseIcon,
  GlobeIcon,
  LockIcon,
  ModeIcon,
  ModeUnsetIcon,
  PinIcon,
  SearchIcon,
} from '@/components/icons';
import type { RoutePoint } from '@/components/JapanMap';
import ShareToPicker, { type PickVisibility } from '@/components/ShareToPicker';

interface SpotSearch {
  spotId: string;
  busy: boolean;
  hits: PlaceHit[] | null;
  error: string;
}

interface Draft {
  title: string;
  startDate: string;
  endDate: string;
  status: 'plan' | 'done';
  spots: TripSpot[];
  visibility?: PickVisibility; // 見せる先（依頼10）。古い下書きには無い（依頼9の groupIds は読まない）
}

// スマホでは地図を画面の半分ほどに（PCは今までどおり）
const MAP_HEIGHT = 'min(56vh, 520px)';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading" style={{ height: MAP_HEIGHT }} />,
});

interface Props {
  initial?: Trip; // 編集時に渡す
  initialStatus?: 'plan' | 'done'; // 新規作成時の初期状態（「思い出をつくる」入口用）
  initialGroupIds?: string[]; // グループのページの「このグループに足す」から来たとき（グループは依頼12。今は既定を「自分だけ」にするだけ）
}

const emptySpot = (): TripSpot => ({ id: uid(), name: '', memo: '', lat: null, lng: null, photoId: null });
const today = () => new Date().toISOString().slice(0, 10);
const isEmptySpot = (s: TripSpot) => !s.name.trim() && !s.memo.trim() && s.lat === null && !s.photoId;

/** 入力欄の共通の見た目（文字は16px＝iPhoneで入力時に勝手に拡大されない） */
const FIELD =
  'w-full min-h-11 rounded-xl border border-line-soft bg-surface px-3 py-2 text-base text-ink outline-none focus:border-blue-400';
/** 小さめの操作ボタン（タップ領域44px） */
const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm font-bold';

export default function TripForm({ initial, initialStatus, initialGroupIds }: Props) {
  const router = useRouter();
  const draftKey = initial ? `trip_edit_${initial.id}` : `trip_new_${initialStatus ?? 'plan'}`;
  // 下書きがあればそこから再開（リロード・ブラウザの戻るで入力が消えないように）
  const [draft] = useState(() => loadDraft<Draft>(draftKey));
  const [restored, setRestored] = useState(() => !!draft);

  const [title, setTitle] = useState(draft?.title ?? initial?.title ?? '');
  const [startDate, setStartDate] = useState(draft?.startDate ?? initial?.startDate ?? today());
  const [endDate, setEndDate] = useState(draft?.endDate ?? initial?.endDate ?? '');
  const [showEnd, setShowEnd] = useState(() => !!endDate && endDate !== startDate);
  const [status, setStatus] = useState<'plan' | 'done'>(
    draft?.status ?? initial?.status ?? initialStatus ?? 'plan',
  );
  // 新規は最初から1つ空のスポットを出しておく（「＋スポットを追加」を押さなくても書き始められる）
  const [spots, setSpots] = useState<TripSpot[]>(
    () => draft?.spots ?? initial?.spots ?? [emptySpot()],
  );
  // 見せる先：新規の既定は「全体」（シアン判断）。グループのページから来たときだけ、グループ機能ができるまで「自分だけ」
  const initialVisibility = (): PickVisibility =>
    initial ? (initial.visibility === 'public' ? 'public' : 'private') : initialGroupIds?.length ? 'private' : 'public';
  const [visibility, setVisibility] = useState<PickVisibility>(() => draft?.visibility ?? initialVisibility());
  const [saveError, setSaveError] = useState('');
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [pickTarget, setPickTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState<SpotSearch | null>(null);
  // 移動手段の選択肢を開いている区間（その区間の出発スポットの id）
  const [moveOpen, setMoveOpen] = useState<string | null>(null);
  const theme = useTheme();
  const mapRef = useRef<HTMLDivElement>(null);
  const omoide = status === 'done' && !initial;

  // 写真（下書き・編集中の旅行に付いているもの）を読み込む
  const [firstPhotoIds] = useState(() =>
    spots.map((s) => s.photoId).filter((x): x is string => !!x),
  );
  useEffect(() => {
    if (firstPhotoIds.length) photoGetMany(firstPhotoIds).then(setPhotos);
  }, [firstPhotoIds]);

  // 入力のたびに下書きを保存（何も書いていない間は保存しない）
  useEffect(() => {
    const pristine = initial
      ? title === initial.title &&
        startDate === initial.startDate &&
        endDate === initial.endDate &&
        status === initial.status &&
        JSON.stringify(spots) === JSON.stringify(initial.spots) &&
        visibility === (initial.visibility === 'public' ? 'public' : 'private')
      : !title.trim() && !endDate && spots.every(isEmptySpot);
    if (pristine) clearDraft(draftKey);
    else saveDraft(draftKey, { title, startDate, endDate, status, spots, visibility } satisfies Draft);
  }, [draftKey, initial, title, startDate, endDate, status, spots, visibility]);

  const startOver = () => {
    clearDraft(draftKey);
    setTitle(initial?.title ?? '');
    setStartDate(initial?.startDate ?? today());
    setEndDate(initial?.endDate ?? '');
    setShowEnd(!!initial?.endDate && initial.endDate !== initial.startDate);
    setStatus(initial?.status ?? initialStatus ?? 'plan');
    setSpots(initial?.spots ?? [emptySpot()]);
    setVisibility(initialVisibility());
    setSearch(null);
    setPickTarget(null);
    setRestored(false);
  };

  const updateSpot = (id: string, patch: Partial<TripSpot>) =>
    setSpots((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addSpot = () => {
    const s = emptySpot();
    setSpots((ss) => {
      // 新しくできる区間（今の最後 → 新しいスポット）は、直前の区間と同じ手段を初期値にする（未設定なら未設定のまま）
      const n = ss.length;
      if (n >= 2 && ss[n - 2].moveTo && !ss[n - 1].moveTo) {
        const prev = ss[n - 2].moveTo;
        return [...ss.slice(0, n - 1), { ...ss[n - 1], moveTo: prev }, s];
      }
      return [...ss, s];
    });
    setPickTarget(null);
    // 追加したスポットの名前欄へ（キーボードを出す）
    requestAnimationFrame(() => document.getElementById(`spot-name-${s.id}`)?.focus());
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
    const hadPhoto = spots.some((s) => s.photoId);
    const [gps, shotOn, dataUrl] = await Promise.all([extractGps(file), extractDate(file), fileToDataUrl(file)]);
    const photoId = uid();
    await photoPut(photoId, dataUrl);
    setPhotos((m) => new Map(m).set(photoId, dataUrl));
    updateSpot(spotId, {
      photoId,
      // スポットに位置が未設定なら写真の位置を使う
      ...(gps && spot && spot.lat === null ? { lat: gps.lat, lng: gps.lng } : {}),
    });
    // 新しい思い出で最初の写真なら、撮った日を旅行の日付にする
    if (omoide && !hadPhoto && shotOn) setStartDate(shotOn);
  };

  const onMapPick = (lat: number, lng: number) => {
    if (!pickTarget) return;
    updateSpot(pickTarget, { lat, lng });
    setPickTarget(null);
  };

  const startMapPick = (spotId: string) => {
    if (pickTarget === spotId) {
      setPickTarget(null);
      return;
    }
    setPickTarget(spotId);
    // スマホでは地図がフォームの下にあるので、地図まで連れて行く
    mapRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
        error: hits.length === 0 ? '見つかりませんでした。地名を足してみてください（例：横浜中華街 神奈川）。' : '',
      });
    } catch {
      setSearch({ spotId, busy: false, hits: null, error: '探せませんでした。少し待ってからもう一度どうぞ。' });
    }
  };

  const pickHit = (spotId: string, hit: PlaceHit) => {
    updateSpot(spotId, { lat: hit.lat, lng: hit.lng });
    setSearch(null);
  };

  const route: RoutePoint[] = routeFromSpots(spots);

  // 空のスポットは保存しない。名前・位置・写真のどれかがあるスポットが1つあれば保存できる
  const filled = spots.filter((s) => !isEmptySpot(s));
  const valid = filled.length >= 1;

  const submit = async () => {
    if (!valid || saving) return;
    setSaving(true);
    setSaveError('');
    // 名前が空のスポットは、位置があれば「◯◯県のあたり」、無ければ番号で呼ぶ
    const named = filled.map((s, i) => ({
      ...s,
      name:
        s.name.trim() ||
        (s.lat !== null && s.lng !== null ? `${nearestPrefecture(s.lat, s.lng).name}のあたり` : `スポット${i + 1}`),
    }));
    const firstTyped = filled.find((s) => s.name.trim())?.name.trim();
    const trip: Trip = {
      id: initial?.id ?? uid(),
      userId: initial?.userId ?? '',
      userName: initial?.userName ?? ME_NAME,
      // 名前が空なら、入力したスポット名か日付から自動で付ける
      title:
        title.trim() ||
        (firstTyped ? `${firstTyped}の旅` : `${startDate.replaceAll('-', '/')}の${status === 'done' ? '思い出' : '旅'}`),
      startDate,
      endDate: endDate || startDate,
      status,
      // 最後のスポットには「次への移動手段」は要らないので外して保存する
      spots: named.map((s, i) => {
        if (i < named.length - 1 || !s.moveTo) return s;
        const rest = { ...s };
        delete rest.moveTo;
        return rest;
      }),
      createdAt: initial?.createdAt ?? new Date().toISOString(),
      visibility,
    };
    try {
      // サーバーに保存（持ち主はサーバーがログイン中の人に決める。新しい旅行の id もここで決まる）
      const saved = await saveTrip(trip);
      clearDraft(draftKey);
      router.push(`/trips/view?id=${saved.id}`);
    } catch {
      // 下書きは残っているので、入力は消えない
      setSaving(false);
      setSaveError('保存できませんでした。通信のよいところで、もう一度「保存」を押してください（入力は消えません）。');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <div className="space-y-4">
        {restored && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-tint px-3 py-1.5 text-sm text-link">
            <span>前回の入力の続きです。</span>
            <button type="button" onClick={startOver} className="min-h-11 px-2 font-bold underline">
              最初からやり直す
            </button>
          </div>
        )}

        <div className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
          <div>
            <label htmlFor="trip-title" className="mb-1 block text-sm font-semibold text-ink-soft">
              旅行の名前 <span className="font-normal text-muted">（空欄なら自動で付けます）</span>
            </label>
            <input
              id="trip-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：東京1泊2日 下町めぐり"
              enterKeyHint="next"
              className={FIELD}
            />
          </div>
          {/* 日付：帰る日は日帰りなら要らないので、押したときだけ出す */}
          <div className="grid grid-cols-2 gap-3">
            <div className={showEnd ? '' : 'col-span-2'}>
              <label htmlFor="trip-start" className="mb-1 block text-sm font-semibold text-ink-soft">
                {showEnd ? '出発日' : '日付'}
              </label>
              <input
                id="trip-start"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className={`${FIELD} px-2`}
              />
            </div>
            {showEnd ? (
              <div>
                <label htmlFor="trip-end" className="mb-1 block text-sm font-semibold text-ink-soft">
                  帰る日
                </label>
                <input
                  id="trip-end"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className={`${FIELD} px-2`}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowEnd(true)}
                className="col-span-2 -mt-1 min-h-11 justify-self-start px-1 text-sm font-bold text-link underline"
              >
                泊まりの旅行なら：帰る日を入れる
              </button>
            )}
          </div>
          {/* 予定か思い出か：新規は入口で選んだ方に固定。編集では「これから行く」旅行にだけ「思い出にする」を出す */}
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-bold ${
                status === 'plan' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
              }`}
            >
              {status === 'plan' ? 'これから行く旅行' : '行ってきた旅行（思い出）'}
            </span>
            {initial?.status === 'plan' && status === 'plan' && (
              <button
                type="button"
                onClick={() => setStatus('done')}
                className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
              >
                旅行が終わったら：思い出にする
              </button>
            )}
            {initial?.status === 'plan' && status === 'done' && (
              <span className="text-sm text-muted">
                「更新する」で思い出になります。
                <button type="button" onClick={() => setStatus('plan')} className="ml-1 min-h-11 font-bold text-link underline">
                  取り消す
                </button>
              </span>
            )}
          </div>
        </div>

        {/* スポット一覧 */}
        <div className="space-y-3">
          {spots.map((s, i) => {
            const photoBtn = (
              <label
                className={`${CHIP} cursor-pointer ${
                  omoide ? 'border-transparent bg-blue-600 text-white' : 'border-blue-300 text-link hover:bg-tint'
                }`}
              >
                <CameraIcon className="h-5 w-5" />
                {omoide ? '写真を選ぶ' : '写真'}
                <input type="file" accept="image/*" className="sr-only" onChange={(e) => onSpotPhoto(s.id, e)} />
              </label>
            );
            return (
              <div key={s.id}>
                <div
                  className={`rounded-xl border bg-surface p-3 ${
                    pickTarget === s.id ? 'border-blue-400 ring-2 ring-tint' : 'border-line-soft'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                      {i + 1}
                    </span>
                    <input
                      id={`spot-name-${s.id}`}
                      value={s.name}
                      onChange={(e) => updateSpot(s.id, { name: e.target.value })}
                      onKeyDown={(e) => {
                        // キーボードの「検索」で、そのまま場所の候補を出す
                        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          searchSpot(s.id);
                        }
                      }}
                      enterKeyHint="search"
                      aria-label={`${i + 1}番目のスポット名`}
                      placeholder="スポット名（例：東京駅）"
                      className={`${FIELD} min-w-0`}
                    />
                    {spots.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={() => move(i, -1)}
                          disabled={i === 0}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                          aria-label="上へ"
                        >
                          <ChevronUpIcon className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(i, 1)}
                          disabled={i === spots.length - 1}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-surface-2 disabled:opacity-30"
                          aria-label="下へ"
                        >
                          <ChevronDownIcon className="h-5 w-5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSpot(s.id)}
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-red-500 hover:bg-red-500/10"
                          aria-label="このスポットを消す"
                        >
                          <CloseIcon className="h-5 w-5" />
                        </button>
                      </>
                    )}
                  </div>
                  <textarea
                    value={s.memo}
                    onChange={(e) => updateSpot(s.id, { memo: e.target.value })}
                    rows={2}
                    aria-label="メモ"
                    placeholder="メモ（予定・感想など）"
                    className={`${FIELD} mt-2`}
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {omoide && photoBtn}
                    <button
                      type="button"
                      onClick={() => searchSpot(s.id)}
                      disabled={!s.name.trim() || (search?.busy && search.spotId === s.id)}
                      className={`${CHIP} border-blue-300 text-link hover:bg-tint disabled:border-dashed disabled:border-line-soft disabled:text-muted`}
                    >
                      <SearchIcon className="h-5 w-5" />
                      {search?.busy && search.spotId === s.id ? '探しています…' : '名前で探す'}
                    </button>
                    {!omoide && photoBtn}
                    <button
                      type="button"
                      onClick={() => startMapPick(s.id)}
                      className={`${CHIP} ${
                        pickTarget === s.id
                          ? 'border-transparent bg-blue-600 text-white'
                          : 'border-line-soft text-muted hover:bg-surface-2'
                      }`}
                    >
                      <PinIcon className="h-5 w-5" />
                      {pickTarget === s.id ? '地図を押してください' : '地図で選ぶ'}
                    </button>
                    <span
                      className={`text-sm font-bold ${s.lat !== null ? 'text-emerald-600' : 'text-muted'}`}
                    >
                      {s.lat !== null ? '位置OK' : '位置はまだ'}
                    </span>
                  </div>
                  {search && search.spotId === s.id && (search.hits?.length || search.error) ? (
                    <div className="mt-2 space-y-1 rounded-xl bg-tint p-2 text-sm">
                      {search.error && <div className="text-red-500">{search.error}</div>}
                      {search.hits?.map((h, hi) => (
                        <button
                          type="button"
                          key={hi}
                          onClick={() => pickHit(s.id, h)}
                          className="flex min-h-11 w-full items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-left text-ink-soft shadow-sm hover:bg-tint"
                        >
                          <PinIcon className="h-4 w-4 shrink-0 text-link" />
                          {shortLabel(h.label)}
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
            );
          })}
          <button
            type="button"
            onClick={addSpot}
            className="min-h-12 w-full rounded-xl border-2 border-dashed border-blue-300 bg-tint/50 py-3 text-base font-semibold text-link hover:bg-tint"
          >
            ＋ スポットを追加
          </button>
        </div>

        {/* 見せる先（依頼10）：全体／自分だけ */}
        <div id="trip-visibility">
          <ShareToPicker value={visibility} onChange={setVisibility} />
        </div>

        {/* 保存ボタン：スマホでは画面の下に貼りつけて、いつでも押せるように */}
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-line-soft bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur lg:static lg:mx-0 lg:border-0 lg:bg-transparent lg:p-0">
          <button
            type="button"
            onClick={submit}
            disabled={!valid || saving}
            className="min-h-12 w-full rounded-full bg-sky-600 px-6 text-base font-bold text-white shadow-md hover:bg-sky-700 disabled:cursor-not-allowed disabled:border-2 disabled:border-dashed disabled:border-line-soft disabled:bg-surface disabled:text-muted disabled:shadow-none lg:w-auto"
          >
            {saving ? '保存しています…' : initial ? '更新する' : omoide ? '思い出を保存' : '旅行ルートを保存'}
          </button>
          {/* 見せる先は保存ボタンのそばにいつも出す（押すと選ぶ所へ） */}
          <a
            href="#trip-visibility"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById('trip-visibility')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }}
            className="mt-1 flex min-h-9 items-center justify-center gap-1 text-sm font-bold text-ink-soft lg:justify-start"
          >
            {visibility === 'public' ? <GlobeIcon className="h-4 w-4" /> : <LockIcon className="h-4 w-4" />}
            見せる先：{visibility === 'public' ? '全体' : '自分だけ'}
            <span className="text-link underline">変える</span>
          </a>
          {saveError && (
            <p role="alert" className="mt-1 text-center text-sm font-bold text-red-500 lg:text-left">
              {saveError}
            </p>
          )}
          {!valid && (
            <p className="mt-1.5 text-center text-sm text-muted lg:text-left">
              スポットの名前か写真を1つ入れると保存できます。
            </p>
          )}
        </div>
      </div>

      <div ref={mapRef} className="space-y-2">
        <div className="rounded-lg bg-tint px-3 py-2 text-sm text-link">
          {pickTarget
            ? '地図を押すと、その場所が選んだスポットの位置になります。'
            : '位置は「名前で探す」か「写真」で入ります。写真に位置が入っていれば自動です。'}
        </div>
        <JapanMap route={route} onPick={onMapPick} height={MAP_HEIGHT} fitRoute="grow" fitButton />
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
                className={`flex min-h-[52px] min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border-2 px-0.5 text-[11px] font-bold leading-tight ${
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
              className="mt-1 min-h-11 w-full rounded-lg text-sm font-bold text-muted hover:bg-surface-2"
            >
              未設定に戻す
            </button>
          )}
        </div>
      )}
    </div>
  );
}
