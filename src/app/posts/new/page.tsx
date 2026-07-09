'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { extractGps, fileToDataUrl } from '@/lib/exif';
import { nearestPrefecture } from '@/lib/regions';
import { savePost, uid, CURRENT_USER } from '@/lib/store';
import { photoPut } from '@/lib/idb';

const JapanMap = dynamic(() => import('@/components/JapanMap'), { ssr: false });

export default function NewPostPage() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [placeName, setPlaceName] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsMessage, setGpsMessage] = useState('写真を選ぶとGPS情報（Exif）から自動で位置を取得します。');
  const [saving, setSaving] = useState(false);

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
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">写真</label>
            <input
              type="file"
              accept="image/*"
              onChange={onFile}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-600 hover:file:bg-blue-100"
            />
            <p className="mt-1 text-xs text-gray-400">
              保存時に縮小・再エンコードするため、GPS等のExif情報は保存データから取り除かれます。
            </p>
            {photoDataUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoDataUrl} alt="preview" className="mt-2 h-40 w-full rounded-lg object-cover" />
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例：浅草・雷門"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-gray-700">コメント</label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="どんな体験だった？"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">場所の名前</label>
              <input
                value={placeName}
                onChange={(e) => setPlaceName(e.target.value)}
                placeholder="例：雷門"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-gray-700">投稿日</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">{gpsMessage}</div>
          <JapanMap
            onPick={(lat, lng) => {
              setPos({ lat, lng });
              setGpsMessage('地図クリックで位置を設定しました。');
            }}
            picked={pos}
            height="360px"
          />
          {pos && (
            <div className="text-xs text-gray-500">
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
        {!pos && <span className="text-xs text-gray-400">位置が未設定です（写真のGPS or 地図クリック）</span>}
      </div>
    </div>
  );
}
