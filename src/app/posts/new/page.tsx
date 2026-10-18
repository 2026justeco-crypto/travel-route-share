'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import { nearestPrefecture } from '@/lib/regions';
import { savePost, uid, CURRENT_USER, loadDraft, saveDraft, clearDraft } from '@/lib/store';
import { photoGet, photoPut } from '@/lib/idb';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';
import { CameraIcon, PinIcon, SearchIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

const MAP_HEIGHT = 'min(48vh, 360px)';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading" style={{ height: MAP_HEIGHT }} />,
});

const DRAFT_KEY = 'post_new';
// 下書きの写真はこの id で IndexedDB に置いておく（リロードしても消えないように）
const DRAFT_PHOTO_ID = 'draft-post-photo';

interface PostDraft {
  title: string;
  comment: string;
  placeName: string;
  date: string;
  pos: { lat: number; lng: number } | null;
  hasPhoto: boolean;
}

const FIELD =
  'w-full min-h-11 rounded-xl border border-line-soft bg-surface px-3 py-2 text-base text-ink outline-none focus:border-blue-400';

function PostForm() {
  const router = useRouter();
  // ブラウザで描画するときだけ呼ばれる（親で useMounted を待つ）ので、下書きをここで直接読む
  const [draft] = useState(() => loadDraft<PostDraft>(DRAFT_KEY));
  const [title, setTitle] = useState(draft?.title ?? '');
  const [comment, setComment] = useState(draft?.comment ?? '');
  const [placeName, setPlaceName] = useState(draft?.placeName ?? '');
  const [date, setDate] = useState(() => draft?.date ?? new Date().toISOString().slice(0, 10));
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(draft?.pos ?? null);
  const [message, setMessage] = useState(
    draft ? '前回の入力の続きです。' : '写真に位置が入っていれば、場所は自動で入ります。',
  );
  const [saving, setSaving] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [hits, setHits] = useState<PlaceHit[] | null>(null);

  // 下書きの写真を戻す
  useEffect(() => {
    if (draft?.hasPhoto) photoGet(DRAFT_PHOTO_ID).then((v) => v && setPhotoDataUrl(v));
  }, [draft]);

  // 入力のたびに下書きを保存（何も書いていない間は保存しない）
  useEffect(() => {
    const empty = !title.trim() && !comment.trim() && !placeName.trim() && !pos && !photoDataUrl;
    if (empty) clearDraft(DRAFT_KEY);
    else saveDraft(DRAFT_KEY, { title, comment, placeName, date, pos, hasPhoto: !!photoDataUrl } satisfies PostDraft);
  }, [title, comment, placeName, date, pos, photoDataUrl]);

  const doSearch = async () => {
    const q = (placeName || title).trim();
    if (!q || searchBusy) return;
    setSearchBusy(true);
    setHits(null);
    try {
      const found = await searchPlaces(q);
      setHits(found);
      if (found.length === 0) setMessage('見つかりませんでした。地名を足してみてください（例：雷門 浅草）。');
    } catch {
      setMessage('探せませんでした。少し待ってからもう一度どうぞ。');
    }
    setSearchBusy(false);
  };

  const pickHit = (h: PlaceHit) => {
    setPos({ lat: h.lat, lng: h.lng });
    setHits(null);
    setMessage('場所を入れました。地図を押すと直せます。');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const gps = await extractGps(file);
    if (gps) {
      setPos(gps);
      setMessage('写真から場所を入れました。地図を押すと直せます。');
    } else {
      setMessage('この写真には場所が入っていません。名前で探すか、地図を押してください。');
    }
    const url = await fileToDataUrl(file);
    setPhotoDataUrl(url);
    photoPut(DRAFT_PHOTO_ID, url).catch(() => {});
  };

  const canSave = !!title.trim() && !!pos;

  const submit = async () => {
    if (!canSave || !pos || saving) return;
    setSaving(true);
    let photoId: string | null = null;
    if (photoDataUrl) {
      photoId = uid();
      await photoPut(photoId, photoDataUrl);
    }
    const pref = nearestPrefecture(pos.lat, pos.lng);
    savePost({
      id: uid(),
      userId: CURRENT_USER.id,
      userName: CURRENT_USER.name,
      title: title.trim(),
      comment: comment.trim(),
      date,
      lat: pos.lat,
      lng: pos.lng,
      placeName: placeName.trim(),
      prefecture: pref.name,
      region: pref.region,
      photoId,
      createdAt: new Date().toISOString(),
    });
    clearDraft(DRAFT_KEY);
    router.push('/');
  };

  return (
    <>
      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-line-soft bg-surface p-4">
          <div>
            <label className="inline-flex min-h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-blue-600 px-4 text-base font-bold text-white hover:bg-blue-700">
              <CameraIcon className="h-6 w-6" />
              {photoDataUrl ? '写真を選び直す' : '写真を選ぶ'}
              <input type="file" accept="image/*" onChange={onFile} className="sr-only" />
            </label>
            <p className="mt-1 text-xs text-muted">保存する写真からは、撮った場所などの記録を消します。</p>
            {photoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} alt="選んだ写真" className="mt-2 h-40 w-full rounded-lg object-cover" />
            )}
          </div>
          <div>
            <label htmlFor="post-title" className="mb-1 block text-sm font-semibold text-ink-soft">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              id="post-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：浅草・雷門"
              className={FIELD}
            />
          </div>
          <div>
            <label htmlFor="post-comment" className="mb-1 block text-sm font-semibold text-ink-soft">
              ひとこと
            </label>
            <textarea
              id="post-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="どんな体験でしたか？"
              className={FIELD}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="post-place" className="mb-1 block text-sm font-semibold text-ink-soft">
                場所の名前
              </label>
              <input
                id="post-place"
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    doSearch();
                  }
                }}
                enterKeyHint="search"
                placeholder="例：雷門"
                className={FIELD}
              />
            </div>
            <div>
              <label htmlFor="post-date" className="mb-1 block text-sm font-semibold text-ink-soft">
                日付
              </label>
              <input
                id="post-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={`${FIELD} px-2`}
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg bg-tint px-3 py-2 text-sm text-link">{message}</div>
          <button
            type="button"
            onClick={doSearch}
            disabled={searchBusy || !(placeName || title).trim()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-blue-300 px-3 text-sm font-bold text-link hover:bg-tint disabled:cursor-not-allowed disabled:border-dashed disabled:border-line-soft disabled:text-muted"
          >
            <SearchIcon className="h-5 w-5" />
            {searchBusy ? '探しています…' : '場所の名前で探す'}
          </button>
          {hits && hits.length > 0 && (
            <div className="space-y-1 rounded-xl bg-tint p-2 text-sm">
              {hits.map((h, i) => (
                <button
                  type="button"
                  key={i}
                  onClick={() => pickHit(h)}
                  className="flex min-h-11 w-full items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-left text-ink-soft shadow-sm hover:bg-tint"
                >
                  <PinIcon className="h-4 w-4 shrink-0 text-link" />
                  {shortLabel(h.label)}
                </button>
              ))}
              <div className="text-right text-[10px] text-muted">検索: OpenStreetMap Nominatim</div>
            </div>
          )}
          <JapanMap
            onPick={(lat, lng) => {
              setPos({ lat, lng });
              setMessage('地図で場所を選びました。');
            }}
            picked={pos}
            height={MAP_HEIGHT}
          />
          {pos && (
            <div className="text-sm text-muted">場所：{nearestPrefecture(pos.lat, pos.lng).name}のあたり</div>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-line-soft bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur md:static md:mx-0 md:border-0 md:bg-transparent md:p-0">
        <button
          type="button"
          onClick={submit}
          disabled={!canSave || saving}
          className="min-h-12 w-full rounded-full bg-blue-600 px-6 text-base font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:border-2 disabled:border-dashed disabled:border-line-soft disabled:bg-surface disabled:text-muted md:w-auto"
        >
          {saving ? '投稿しています…' : '投稿する'}
        </button>
        {!canSave && (
          <p className="mt-1.5 text-center text-sm text-muted md:text-left">
            {!title.trim() && !pos
              ? 'タイトルと場所を入れると投稿できます。'
              : !title.trim()
                ? 'タイトルを入れると投稿できます。'
                : '場所を入れると投稿できます（写真・名前で探す・地図）。'}
          </p>
        )}
      </div>
    </>
  );
}

export default function NewPostPage() {
  // 下書き（localStorage）を初期値に使うので、ブラウザで描画するまで骨組みを出す
  const mounted = useMounted();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <h1 className="text-xl font-bold">写真を投稿</h1>
      {mounted ? <PostForm /> : <PageSkeleton />}
    </div>
  );
}
