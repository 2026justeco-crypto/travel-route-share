import exifr from 'exifr';
import { shrinkPhoto } from './photos';

// 写真からGPS座標を取り出す。無ければ null（地図クリックで指定してもらう）。
export async function extractGps(
  file: File,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      return { lat: gps.latitude, lng: gps.longitude };
    }
  } catch {
    // EXIFが読めない形式は位置なし扱い
  }
  return null;
}

// 保存用に縮小して dataURL にする（依頼11：長い辺 1600px・JPEG・目安 300KB 以下。lib/photos.ts の shrinkPhoto）。
// canvas で描き直すので、GPS 等の EXIF は残らない＝プライバシー対策（位置は上の extractGps で先に読む）。
export async function fileToDataUrl(file: File): Promise<string> {
  return (await shrinkPhoto(file)).dataUrl;
}

// 写真を撮った日（YYYY-MM-DD）。無ければ null。
export async function extractDate(file: File): Promise<string | null> {
  try {
    const d = (await exifr.parse(file, ['DateTimeOriginal'])) as { DateTimeOriginal?: Date } | undefined;
    const t = d?.DateTimeOriginal;
    if (t instanceof Date && !Number.isNaN(t.getTime())) {
      const p = (n: number) => String(n).padStart(2, '0');
      return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`;
    }
  } catch {
    // 読めない形式は日付なし
  }
  return null;
}
