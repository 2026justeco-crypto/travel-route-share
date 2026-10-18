'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import { nearestPrefecture } from '@/lib/regions';
import { savePost, uid, CURRENT_USER } from '@/lib/store';
import { photoPut } from '@/lib/idb';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading h-[360px]" />,
});

export default function NewPostPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsMessage, setGpsMessage] = useState('写真を選ぶとGPS情報（Exif）から自動で位置を取得します。場所名の検索でもOK。');
  const [saving, setSaving] = useState(false);
  const [searchBusy, setSearchBusy] = useState(false);
  const [hits, setHits] = useState<PlaceHit[] | null>(null);

  const doSearch = async () => {
    const q = (placeName || title).trim();
    if (!q || searchBusy) return;
    setSearchBusy(true);
    setHits(null);
    try {
      const found = await searchPlaces(q);
      setHits(found);
      if (found.length === 0) setGpsMessage('見つかりませんでした。地名を足してみてください（例：雷門 浅草）。');
    } catch {
      setGpsMessage('検索に失敗しました。少し待ってからもう一度どうぞ。');
    }
    setSearchBusy(false);
  };

  const pickHit = (h: PlaceHit) => {
    setPos({ lat: h.lat, lng: h.lng });
    setHits(null);
    setGpsMessage('検索結果から位置を設定しました（地図クリックで微調整もできます）。');
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const gps = await extractGps(file);
    if (gps) {
      setPos(gps);
      setGpsMessage('写真のGPS情報から位置を自動取得しました（地図クリックで修正もできます）。');
    } else {
      setGpsMessage('この写真にはGPS情報がありません。地図をクリックして位置を指定してください。');
    }
    setPhotoDataUrl(await fileToDataUrl(file));
  };

  const submit = async () => {
    if (!title.trim() || !pos || saving) return;
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
    router.push('/');
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="text-xl font-bold">写真を投稿</h1>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-line-soft bg-surface p-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-soft">写真</label>
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-tint file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-link hover:file:bg-tint"
            />
            <p className="mt-1 text-xs text-muted">
              保存時に縮小・再エンコードするため、GPS等のExif情報は保存データから取り除かれます。
            </p>
            {photoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} alt="preview" className="mt-2 h-40 w-full rounded-lg object-cover" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-soft">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：浅草・雷門"
              className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-ink-soft">コメント</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="どんな体験だった？"
              className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-soft">場所の名前</label>
              <input
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="例：雷門"
                className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-ink-soft">投稿日</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-line-soft px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg bg-tint px-3 py-2 text-xs text-link">{gpsMessage}</div>
          <button
            onClick={doSearch}
            disabled={searchBusy || !(placeName || title).trim()}
            className="w-full rounded-full border border-blue-300 px-3 py-1.5 text-xs font-bold text-link hover:bg-tint disabled:cursor-not-allowed disabled:border-line-soft disabled:text-muted/50"
          >
            {searchBusy ? '検索中…' : '🔍 場所の名前（またはタイトル）で位置を検索'}
          </button>
          {hits && hits.length > 0 && (
            <div className="space-y-1 rounded-xl bg-tint p-2 text-xs">
              {hits.map((h, i) => (
                <button
                  key={i}
                  onClick={() => pickHit(h)}
                  className="block w-full rounded-lg bg-surface px-2.5 py-1.5 text-left text-ink-soft shadow-sm hover:bg-tint"
                >
                  📍 {shortLabel(h.label)}
                </button>
              ))}
              <div className="text-right text-[10px] text-muted">検索: OpenStreetMap Nominatim</div>
            </div>
          )}
          <JapanMap
            onPick={(lat, lng) => {
              setPos({ lat, lng });
              setGpsMessage('地図クリックで位置を設定しました。');
            }}
            picked={pos}
            height="360px"
          />
          {pos && (
            <div className="text-xs text-muted">
              位置：{pos.lat.toFixed(4)}, {pos.lng.toFixed(4)}（{nearestPrefecture(pos.lat, pos.lng).name} 付近）
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={submit}
          disabled={!title.trim() || !pos || saving}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
        >
          {saving ? '保存中…' : '投稿する'}
        </button>
        {!pos && <span className="text-xs text-muted">位置が未設定です（写真のGPS or 地図クリック）</span>}
      </div>
    </div>
  );
}
