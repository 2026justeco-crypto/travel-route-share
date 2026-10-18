// この端末（localStorage）に置いた旅行・投稿（MVP〜依頼9の形）。
//   β版（依頼10）で本体のデータはサーバー（Supabase・lib/store.ts）へ移った。ここに残るのは
//   ①サーバーへ引っ越す前の古いデータの読み出し（lib/migrate.ts）
//   ②グループの試作（lib/groups.ts・依頼12でサーバー版にする）の見本データ
//   だけ。新しく作る旅行・投稿はここには書かない。

import type { Post, Trip } from './types';

const POSTS_KEY = 'trs_posts';
const TRIPS_KEY = 'trs_trips';

/** 試作のときの「自分」（この端末の中だけの id）。サーバーの利用者 id とは別物 */
export const LOCAL_USER = { id: 'me', name: 'あなた' };

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

export function listLocalPosts(): Post[] {
  const v = readJson<Post[]>(POSTS_KEY, []);
  return (Array.isArray(v) ? v : []).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export function listLocalTrips(): Trip[] {
  const v = readJson<Trip[]>(TRIPS_KEY, []);
  return (Array.isArray(v) ? v : []).sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

export function getLocalTrip(id: string): Trip | undefined {
  return listLocalTrips().find((t) => t.id === id);
}

export function saveLocalPost(post: Post) {
  const posts = readJson<Post[]>(POSTS_KEY, []);
  const i = posts.findIndex((p) => p.id === post.id);
  if (i >= 0) posts[i] = post;
  else posts.push(post);
  writeJson(POSTS_KEY, posts);
}

export function saveLocalTrip(trip: Trip) {
  const trips = readJson<Trip[]>(TRIPS_KEY, []);
  const i = trips.findIndex((t) => t.id === trip.id);
  if (i >= 0) trips[i] = trip;
  else trips.push(trip);
  writeJson(TRIPS_KEY, trips);
}

export function placeholderSvg(label: string, c1: string, c2: string): string {
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
