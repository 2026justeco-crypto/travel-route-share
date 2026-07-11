// 道路沿いルート取得：OSRM デモサーバーを利用
// https://router.project-osrm.org （無料・キー不要。デモ用途のため軽い利用に留める＝
// ルート閲覧ページ表示時に1回だけ呼ぶ。編集中のプレビューでは呼ばない）

export async function fetchRoadRoute(
  points: { lat: number; lng: number }[],
): Promise<[number, number][] | null> {
  // デモサーバー負荷への配慮と誤爆防止（スポット12個まで）
  if (points.length < 2 || points.length > 12) return null;
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const geom: unknown = data?.routes?.[0]?.geometry?.coordinates;
    if (!Array.isArray(geom) || geom.length < 2) return null;
    // GeoJSONは [lng, lat] 順なので Leaflet 用に [lat, lng] へ変換
    return (geom as [number, number][]).map((c) => [c[1], c[0]]);
  } catch {
    return null;
  }
}
