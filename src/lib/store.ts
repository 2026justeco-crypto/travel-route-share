'use client';

// データ層（β版・依頼10）：旅行・投稿・お気に入りは Supabase に置く。
//   関数の名前と引数は MVP（localStorage 版）にそろえた。読み書きはサーバーなので非同期（Promise）になった。
//   守りは DB の RLS（supabase/migrations/0001_init.sql）。ここで「出さない」のは見た目の都合だけ。
//   下書きは今までどおりこの端末（localStorage）に置く。
//   写真はサーバーの Storage（依頼11・lib/photos.ts）。旅行・投稿を消したら、付いていた写真も消す。

import type { Post, Region, Trip, TripSpot, Visibility } from './types';
import { ensureSession, myUserId, supabase } from './supabase';
import { isStoragePath, removePhotos } from './photos';

export { uid } from './localStore';

/** 自分を表す名前（自分の旅行・投稿の「作った人」に出す） */
export const ME_NAME = 'あなた';

/** 今の自分の id（ログイン前・オフラインは null） */
export function currentUserId(): string | null {
  return myUserId();
}

/** サーバーの id（uuid）か。uuid でない id で問い合わせると DB がエラーを返すので先に見分ける */
export function isServerId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function newId(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // randomUUID が無い古いブラウザ向け（v4 の形）
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- 行 ⇔ 画面の型 ----------

interface ProfileRef {
  display_name: string | null;
}

interface TripRow {
  id: string;
  owner: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  status: 'plan' | 'done';
  spots: TripSpot[];
  visibility: Visibility;
  is_sample: boolean;
  created_at: string;
  profiles?: ProfileRef | ProfileRef[] | null;
}

interface PostRow {
  id: string;
  owner: string;
  title: string;
  comment: string;
  place: string;
  lat: number;
  lng: number;
  prefecture: string;
  region: string;
  date: string | null;
  visibility: Visibility;
  photo_path: string | null;
  is_sample: boolean;
  created_at: string;
  profiles?: ProfileRef | ProfileRef[] | null;
}

const TRIP_COLS =
  'id, owner, title, start_date, end_date, status, spots, visibility, is_sample, created_at, profiles(display_name)';
const POST_COLS =
  'id, owner, title, comment, place, lat, lng, prefecture, region, date, visibility, photo_path, is_sample, created_at, profiles(display_name)';

function ownerName(owner: string, p: TripRow['profiles']): string {
  if (owner === myUserId()) return ME_NAME;
  const prof = Array.isArray(p) ? p[0] : p;
  return prof?.display_name || '旅人';
}

function toTrip(r: TripRow): Trip {
  return {
    id: r.id,
    userId: r.owner,
    userName: ownerName(r.owner, r.profiles),
    title: r.title,
    startDate: r.start_date ?? '',
    endDate: r.end_date ?? r.start_date ?? '',
    status: r.status,
    spots: Array.isArray(r.spots) ? r.spots : [],
    createdAt: r.created_at,
    visibility: r.visibility,
    isSample: r.is_sample,
  };
}

function toPost(r: PostRow): Post {
  return {
    id: r.id,
    userId: r.owner,
    userName: ownerName(r.owner, r.profiles),
    title: r.title,
    comment: r.comment,
    date: r.date ?? '',
    lat: r.lat,
    lng: r.lng,
    placeName: r.place,
    prefecture: r.prefecture,
    region: r.region as Region,
    photoId: r.photo_path ?? null,
    createdAt: r.created_at,
    visibility: r.visibility,
    isSample: r.is_sample,
  };
}

/** 書き込みの前に必ずログインを済ませる（できなければエラー） */
async function needUser(): Promise<string> {
  const id = await ensureSession();
  if (!id) throw new Error('offline');
  return id;
}

/** 読み込みの前にログインを待つ（できなくても、全体に見せたものは読めるので続ける） */
async function beforeRead() {
  await ensureSession();
}

// ---------- Posts ----------

/** 見られる投稿すべて（全体に見せたもの＋自分のもの。RLS が絞る）。新しい順 */
export async function listPosts(): Promise<Post[]> {
  await beforeRead();
  const { data, error } = await supabase()
    .from('posts')
    .select(POST_COLS)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as unknown as PostRow[]).map(toPost);
}

export async function savePost(post: Post): Promise<Post> {
  const me = await needUser();
  const row = {
    id: isServerId(post.id) ? post.id : newId(),
    owner: me,
    title: post.title,
    comment: post.comment,
    place: post.placeName,
    lat: post.lat,
    lng: post.lng,
    prefecture: post.prefecture,
    region: post.region,
    date: post.date || null,
    visibility: post.visibility ?? 'public',
    // 写真はアップロードしてからパスを渡す（lib/photos.ts の uploadPhoto）。端末の id は保存しない
    photo_path: isStoragePath(post.photoId) ? post.photoId : null,
    created_at: post.createdAt,
  };
  const { data, error } = await supabase().from('posts').upsert(row).select(POST_COLS).single();
  if (error) throw error;
  return toPost(data as unknown as PostRow);
}

/** 消せたら true（他人の投稿・無い投稿は false）。付いていた写真も消す */
export async function deletePost(id: string): Promise<boolean> {
  await needUser();
  if (!isServerId(id)) return false;
  const { data, error } = await supabase().from('posts').delete().eq('id', id).select('id, photo_path');
  if (error) throw error;
  if (!data.length) return false;
  await removePhotos((data as { photo_path: string | null }[]).map((r) => r.photo_path));
  return true;
}

// ---------- Trips ----------

/** 見られる旅行すべて（全体に見せたもの＋自分のもの。RLS が絞る）。新しい順 */
export async function listTrips(): Promise<Trip[]> {
  await beforeRead();
  const { data, error } = await supabase()
    .from('trips')
    .select(TRIP_COLS)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data as unknown as TripRow[]).map(toTrip);
}

/** 見られない（自分だけ・他人のもの）か無いときは undefined */
export async function getTrip(id: string): Promise<Trip | undefined> {
  if (!isServerId(id)) return undefined;
  await beforeRead();
  const { data, error } = await supabase().from('trips').select(TRIP_COLS).eq('id', id).maybeSingle();
  if (error) throw error;
  return data ? toTrip(data as unknown as TripRow) : undefined;
}

export async function saveTrip(trip: Trip): Promise<Trip> {
  const me = await needUser();
  const row = {
    id: isServerId(trip.id) ? trip.id : newId(),
    owner: me,
    title: trip.title,
    start_date: trip.startDate || null,
    end_date: trip.endDate || trip.startDate || null,
    status: trip.status,
    spots: trip.spots,
    visibility: trip.visibility ?? 'public',
    created_at: trip.createdAt,
  };
  const { data, error } = await supabase().from('trips').upsert(row).select(TRIP_COLS).single();
  if (error) throw error;
  return toTrip(data as unknown as TripRow);
}

/** 消せたら true（他人の旅行・無い旅行は false）。スポットに付いていた写真も消す */
export async function deleteTrip(id: string): Promise<boolean> {
  await needUser();
  if (!isServerId(id)) return false;
  // 消した行を返してもらい、その行に付いていた写真を消す（消し損ねは lib/photos.ts の sweepOrphanPhotos が後で拾う）
  const { data, error } = await supabase().from('trips').delete().eq('id', id).select('id, spots');
  if (error) throw error;
  if (!data.length) return false;
  const rows = data as { spots: TripSpot[] | null }[];
  await removePhotos(rows.flatMap((r) => (Array.isArray(r.spots) ? r.spots.map((s) => s.photoId) : [])));
  return true;
}

// ---------- Favorites（本人だけ・RLS） ----------

export type FavKind = 'trip' | 'post';

/** 自分のお気に入り（旅行・投稿の id。id は重ならない） */
export async function favoriteIds(): Promise<Set<string>> {
  const me = await ensureSession();
  if (!me) return new Set();
  const { data, error } = await supabase().from('favorites').select('trip_id, post_id');
  if (error) throw error;
  return new Set(
    (data as { trip_id: string | null; post_id: string | null }[]).map((r) => (r.trip_id ?? r.post_id) as string),
  );
}

export async function isFavorite(id: string): Promise<boolean> {
  return (await favoriteIds()).has(id);
}

/** 付け外しする。戻り値＝付いた後の状態（true＝お気に入り） */
export async function toggleFavorite(id: string, kind: FavKind): Promise<boolean> {
  const me = await needUser();
  const col = kind === 'trip' ? 'trip_id' : 'post_id';
  const { data: removed, error: delErr } = await supabase()
    .from('favorites')
    .delete()
    .eq('user_id', me)
    .eq(col, id)
    .select('id');
  if (delErr) throw delErr;
  if (removed.length > 0) return false;
  const { error } = await supabase().from('favorites').insert({ user_id: me, [col]: id });
  if (error) throw error;
  return true;
}

// ---------- 下書き（入力の途中をこのブラウザに自動保存。保存・投稿したら消す） ----------

const DRAFT_PREFIX = 'trs_draft_';

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function saveDraft(key: string, value: unknown) {
  try {
    localStorage.setItem(DRAFT_PREFIX + key, JSON.stringify(value));
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
