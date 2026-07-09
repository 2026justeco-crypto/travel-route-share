import exifr from 'exifr';

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

// ブラウザ内保存用に縮小してdataURL化（保存容量とEXIF除去を兼ねる。
// canvas経由の再エンコードでGPS等のEXIFは自動的に落ちる＝プライバシー対策）。
export function fileToDataUrl(file: File, maxDim = 1400): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('canvas not supported'));
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}
