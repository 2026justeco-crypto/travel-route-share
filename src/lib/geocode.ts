// 地名検索（ジオコーディング）：OpenStreetMap Nominatim を利用
// 利用ポリシー: https://operations.osmfoundation.org/policies/nominatim/
//   - リクエストはユーザー操作（ボタン押下）ごとに1回だけ発行する（自動連発しない）

export interface PlaceHit {
  lat: number;
  lng: number;
  label: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
}

export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const q = query.trim();
  if (!q) return [];
  const url =
    'https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=jp&accept-language=ja&limit=5&q=' +
    encodeURIComponent(q);
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`geocode failed: ${res.status}`);
  const data = (await res.json()) as NominatimResult[];
  return data.map((r) => ({
    lat: Number(r.lat),
    lng: Number(r.lon),
    label: r.display_name,
  }));
}

// 表示用に住所を短くする（「施設名, 町名, 市区町村, 県」あたりまで）
export function shortLabel(label: string): string {
  return label.split(',').slice(0, 4).join('・').replace(/\s+/g, '');
}
