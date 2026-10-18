// 道路沿いルート取得：OSRM デモサーバーを利用
// https://router.project-osrm.org （無料・キー不要。デモ用途のため軽い利用に留める＝
// ルート閲覧ページを開いたときだけ呼ぶ。編集中のプレビューでは呼ばない）

// ---- 区間ごとの道路沿いルート（移動手段つき） ----
// 道路に沿わせる区間（徒歩・自転車・車・バス・未設定）が続くところを「ひと続き」にまとめ、
// ひと続きごとに1回だけ OSRM を呼ぶ（区間ごとには呼ばない）。返ってきた1本の線を、
// OSRM が返す経由点（waypoints）の位置で区間ごとに切り分ける。
// 同じタブで同じルートを開き直したときは sessionStorage の控えを使い、呼び直さない。

const CACHE_PREFIX = 'trs-osrm-v1:';

function cacheGet(key: string): LatLng[][] | null | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + key);
    if (raw === null) return undefined;
    return JSON.parse(raw) as LatLng[][] | null;
  } catch {
    return undefined;
  }
}

function cacheSet(key: string, v: LatLng[][] | null) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + key, JSON.stringify(v));
  } catch {
    // 保存できなくても表示には関係ない
  }
}

type LatLng = [number, number];

function pointsKey(points: { lat: number; lng: number }[]): string {
  return points.map((p) => `${p.lng.toFixed(6)},${p.lat.toFixed(6)}`).join(';');
}

/** このタブで同じ点の並びを取得済みか（取得済みなら OSRM を呼ばない） */
export function isRoadLegsCached(points: { lat: number; lng: number }[]): boolean {
  return cacheGet(pointsKey(points)) !== undefined;
}

/**
 * points（2〜12点）を道路沿いで結び、区間ごと（points.length - 1 本）の線を返す。各線は [lat, lng] の並び。
 * 失敗したら null（呼び出し側は直線で描く）。
 */
// 取得中の問い合わせ（同じ点の並びを同時に2回呼ばない。開発時の React の二重実行対策も兼ねる）
const inflight = new Map<string, Promise<LatLng[][] | null>>();

export function fetchRoadLegs(points: { lat: number; lng: number }[]): Promise<LatLng[][] | null> {
  if (points.length < 2 || points.length > 12) return Promise.resolve(null);
  const coords = pointsKey(points);
  const cached = cacheGet(coords);
  if (cached !== undefined) return Promise.resolve(cached);
  let p = inflight.get(coords);
  if (!p) {
    p = requestRoadLegs(coords).finally(() => inflight.delete(coords));
    inflight.set(coords, p);
  }
  return p;
}

async function requestRoadLegs(coords: string): Promise<LatLng[][] | null> {
  const n = coords.split(';').length;
  const url = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson`;
  let legs: LatLng[][] | null = null;
  try {
    const res = await fetch(url);
    if (res.ok) {
      const data = await res.json();
      const geom: unknown = data?.routes?.[0]?.geometry?.coordinates;
      const wps: unknown = data?.waypoints;
      if (Array.isArray(geom) && geom.length >= 2 && Array.isArray(wps) && wps.length === n) {
        legs = splitAtWaypoints(
          geom as [number, number][],
          (wps as { location: [number, number] }[]).map((w) => w.location),
        );
      }
    } else if (res.status >= 500 || res.status === 429) {
      // 混雑・一時的な失敗は控えに残さない（次に開いたときにもう一度だけ試す）
      return null;
    }
  } catch {
    return null; // 通信できないときも控えに残さない
  }
  cacheSet(coords, legs);
  return legs;
}

/** 1本の線（[lng,lat]）を、経由点（[lng,lat]）の位置で切り分けて [lat,lng] の区間の並びにする */
function splitAtWaypoints(line: [number, number][], wps: [number, number][]): LatLng[][] | null {
  const cut: number[] = [0];
  let from = 0;
  for (let k = 1; k < wps.length - 1; k++) {
    let best = from;
    let bestD = Infinity;
    for (let j = from; j < line.length; j++) {
      const d = (line[j][0] - wps[k][0]) ** 2 + (line[j][1] - wps[k][1]) ** 2;
      if (d < bestD) {
        bestD = d;
        best = j;
        if (d === 0) break; // 経由点は線の上にそのまま載っている（先に来た方を採る）
      }
    }
    cut.push(best);
    from = best;
  }
  cut.push(line.length - 1);
  const legs: LatLng[][] = [];
  for (let k = 0; k < cut.length - 1; k++) {
    const part = line.slice(cut[k], cut[k + 1] + 1);
    // 2つのスポットが同じ道路上の点に寄せられたとき（ほぼ同じ場所）は長さ0の区間にする
    const pts = part.length >= 2 ? part : [line[cut[k]], line[cut[k]]];
    legs.push(pts.map((c) => [c[1], c[0]]));
  }
  return legs;
}
