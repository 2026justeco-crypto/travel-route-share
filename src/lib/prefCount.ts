import type { Post, Trip } from './types';
import { nearestPrefecture } from './regions';
import type { PrefName } from './tileMap';

// タイル地図に出す「県ごとの件数」と「行った県」を数える（依頼6）。
//   件数＝その県の投稿の数＋その県を通る旅行の数
//   - 投稿は prefecture をそのまま使う
//   - 旅行はスポットの位置から nearestPrefecture で県を出す。同じ県を何度通っても1つの旅行は1と数える
//   - 位置の入っていないスポットは数えない

/** 1つの旅行が通る県（重なりなし） */
export function tripPrefectures(trip: Trip): Set<PrefName> {
  const s = new Set<PrefName>();
  for (const sp of trip.spots) {
    if (sp.lat == null || sp.lng == null) continue;
    s.add(nearestPrefecture(sp.lat, sp.lng).name);
  }
  return s;
}

/** 県ごとの件数（0 の県は入れない） */
export function countByPrefecture(posts: Post[], trips: Trip[]): Record<PrefName, number> {
  const out: Record<PrefName, number> = {};
  for (const p of posts) {
    if (!p.prefecture) continue;
    out[p.prefecture] = (out[p.prefecture] ?? 0) + 1;
  }
  for (const t of trips) {
    for (const name of tripPrefectures(t)) out[name] = (out[name] ?? 0) + 1;
  }
  return out;
}

/** 行った県＝その人の旅行のうち「思い出」（status=done）のスポットがある県 */
export function visitedPrefectures(trips: Trip[], userId: string): Set<PrefName> {
  const s = new Set<PrefName>();
  for (const t of trips) {
    if (t.userId !== userId || t.status !== 'done') continue;
    for (const name of tripPrefectures(t)) s.add(name);
  }
  return s;
}
