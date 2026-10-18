import type { Post, Trip, TripSpot } from './types';
import { nearestPrefecture } from './regions';
import { photoPut } from './idb';

// ============================================================
// デモモードのデータ層（MVP）
//   メタデータ: localStorage / 画像: IndexedDB
//   β版で同じ関数シグネチャのまま Supabase 実装に差し替える。
// ============================================================

const POSTS_KEY = 'trs_posts';
const TRIPS_KEY = 'trs_trips';
const FAVS_KEY = 'trs_favs';
const SEED_KEY = 'trs_seeded_v1';

export const CURRENT_USER = { id: 'me', name: 'あなた' };

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}

// ---------- Posts ----------

export function listPosts(): Post[] {
  return readJson<Post[]>(POSTS_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getPost(id: string): Post | undefined {
  return listPosts().find((p) => p.id === id);
}

export function savePost(post: Post) {
  const posts = readJson<Post[]>(POSTS_KEY, []);
  const i = posts.findIndex((p) => p.id === post.id);
  if (i >= 0) posts[i] = post;
  else posts.push(post);
  writeJson(POSTS_KEY, posts);
}

export function deletePost(id: string) {
  writeJson(
    POSTS_KEY,
    readJson<Post[]>(POSTS_KEY, []).filter((p) => p.id !== id),
  );
}

// ---------- Trips ----------

export function listTrips(): Trip[] {
  return readJson<Trip[]>(TRIPS_KEY, []).sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

export function getTrip(id: string): Trip | undefined {
  return listTrips().find((t) => t.id === id);
}

export function saveTrip(trip: Trip) {
  const trips = readJson<Trip[]>(TRIPS_KEY, []);
  const i = trips.findIndex((t) => t.id === trip.id);
  if (i >= 0) trips[i] = trip;
  else trips.push(trip);
  writeJson(TRIPS_KEY, trips);
}

export function deleteTrip(id: string) {
  writeJson(
    TRIPS_KEY,
    readJson<Trip[]>(TRIPS_KEY, []).filter((t) => t.id !== id),
  );
}

// ---------- Favorites ----------

export function favoriteIds(): Set<string> {
  return new Set(readJson<string[]>(FAVS_KEY, []));
}

/** 投稿・旅行どちらの id でもよい（id は重ならない） */
export function toggleFavorite(postId: string): boolean {
  const favs = favoriteIds();
  const nowFav = !favs.has(postId);
  if (nowFav) favs.add(postId);
  else favs.delete(postId);
  writeJson(FAVS_KEY, Array.from(favs));
  return nowFav;
}

// ---------- デモデータ ----------

function placeholderSvg(label: string, c1: string, c2: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/>
  </linearGradient></defs>
  <rect width="800" height="500" fill="url(#g)"/>
  <circle cx="640" cy="110" r="55" fill="#ffffff" opacity="0.85"/>
  <path d="M0 380 L180 240 L320 350 L470 210 L640 340 L800 260 L800 500 L0 500 Z" fill="#ffffff" opacity="0.25"/>
  <text x="40" y="450" font-family="sans-serif" font-size="40" fill="#ffffff" font-weight="bold">${label}</text>
</svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

interface SeedDef {
  title: string;
  comment: string;
  lat: number;
  lng: number;
  placeName: string;
  date: string;
  colors: [string, string];
}

const DEMO_POSTS: SeedDef[] = [
  {
    title: '札幌時計台',
    comment: '思ったより街中にあってびっくり。夜のライトアップがきれいでした。',
    lat: 43.0626,
    lng: 141.3536,
    placeName: '札幌市時計台',
    date: '2026-06-14',
    colors: ['#3b82f6', '#0ea5e9'],
  },
  {
    title: '浅草・雷門',
    comment: '朝8時前なら人が少なくて写真が撮りやすい！仲見世で人形焼も。',
    lat: 35.7112,
    lng: 139.7965,
    placeName: '浅草 雷門',
    date: '2026-06-28',
    colors: ['#ef4444', '#f97316'],
  },
  {
    title: '大阪城公園',
    comment: '天守閣までの散歩が気持ちいい。梅林側から回るのがおすすめ。',
    lat: 34.6873,
    lng: 135.5262,
    placeName: '大阪城',
    date: '2026-07-02',
    colors: ['#10b981', '#14b8a6'],
  },
  {
    title: '厳島神社の大鳥居',
    comment: '干潮の時間を調べてから行くと鳥居まで歩けます。',
    lat: 34.2959,
    lng: 132.3197,
    placeName: '厳島神社',
    date: '2026-05-18',
    colors: ['#f59e0b', '#ef4444'],
  },
  {
    title: '博多ラーメン',
    comment: '替え玉2回。駅ナカでも十分おいしいお店が多い。',
    lat: 33.5902,
    lng: 130.4207,
    placeName: '博多駅周辺',
    date: '2026-07-06',
    colors: ['#8b5cf6', '#6366f1'],
  },
];

// 7つの移動手段をすべて使った見本の旅行（依頼3）。既存の旅行には触らず、別の目印で1回だけ足す
const SEED_TRIP_KEY = 'trs_seeded_trip_transport_v1';
const DEMO_TRIP_ID = 'demo-trip-transport';

function seedTransportTripIfNeeded() {
  if (localStorage.getItem(SEED_TRIP_KEY)) return;
  if (!getTrip(DEMO_TRIP_ID)) {
    const spot = (
      name: string,
      lat: number,
      lng: number,
      memo: string,
      moveTo?: TripSpot['moveTo'],
    ): TripSpot => ({ id: uid(), name, memo, lat, lng, photoId: null, ...(moveTo ? { moveTo } : {}) });
    saveTrip({
      id: DEMO_TRIP_ID,
      userId: 'demo',
      userName: 'デモユーザー',
      title: '東京から座間味まで 乗りもの全部のせ旅',
      startDate: '2026-09-20',
      endDate: '2026-09-24',
      status: 'done',
      spots: [
        spot('東京駅', 35.6812, 139.7671, '新幹線で京都へ。', 'train'),
        spot('京都駅', 34.9858, 135.7588, '駅から歩いて東山へ。', 'walk'),
        spot('清水寺', 34.9949, 135.785, '舞台からの眺めが最高。市バスで金閣寺へ。', 'bus'),
        spot('金閣寺', 35.0394, 135.7292, 'ここからレンタカーで空港へ。', 'car'),
        spot('大阪国際空港（伊丹）', 34.7855, 135.4382, '飛行機で那覇へ。', 'plane'),
        spot('那覇空港', 26.2058, 127.646, '自転車を借りて港まで。', 'bike'),
        spot('泊港（とまりん）', 26.2263, 127.6806, 'フェリーで座間味島へ。', 'ship'),
        spot('座間味港', 26.229, 127.303, '海の青さにびっくり。'),
      ],
      createdAt: new Date(Date.now() - 60000).toISOString(),
    });
  }
  localStorage.setItem(SEED_TRIP_KEY, '1');
}

export async function seedIfNeeded(): Promise<void> {
  seedTransportTripIfNeeded();
  if (localStorage.getItem(SEED_KEY)) return;
  const now = Date.now();
  for (let i = 0; i < DEMO_POSTS.length; i++) {
    const d = DEMO_POSTS[i];
    const photoId = uid();
    await photoPut(photoId, placeholderSvg(d.title, d.colors[0], d.colors[1]));
    const pref = nearestPrefecture(d.lat, d.lng);
    savePost({
      id: uid(),
      userId: 'demo',
      userName: 'デモユーザー',
      title: d.title,
      comment: d.comment,
      date: d.date,
      lat: d.lat,
      lng: d.lng,
      placeName: d.placeName,
      prefecture: pref.name,
      region: pref.region,
      photoId,
      createdAt: new Date(now - (DEMO_POSTS.length - i) * 86400000).toISOString(),
    });
  }
  localStorage.setItem(SEED_KEY, '1');
}

export function isFavorite(id: string): boolean {
  return favoriteIds().has(id);
}

// ---------- 下書き（入力の途中をこのブラウザに自動保存。保存・投稿したら消す） ----------

const DRAFT_PREFIX = 'trs_draft_';

export function loadDraft<T>(key: string): T | null {
  return readJson<T | null>(DRAFT_PREFIX + key, null);
}

export function saveDraft(key: string, value: unknown) {
  try {
    writeJson(DRAFT_PREFIX + key, value);
  } catch {
    // 容量いっぱい等で保存できなくても入力は続けられるようにする
  }
}

export function hasDraft(key: string): boolean {
  try {
    return localStorage.getItem(DRAFT_PREFIX + key) !== null;
  } catch {
    return false;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + key);
  } catch {
    // 読めない環境では何もしない
  }
}
