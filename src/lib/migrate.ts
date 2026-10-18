'use client';

// この端末のデータの引っ越し（依頼10）。
//   今までこの端末（localStorage）で作った旅行・写真の投稿（見本以外＝作った人が「me」のもの）を、
//   見せる先「自分だけ」でサーバーへ移す。端末側は消さず、移したものに印を付ける（二重に移さない）。
//   写真そのものは端末の IndexedDB に残したまま（依頼11でサーバーへ）。

import type { Post, Trip } from './types';
import { LOCAL_USER, listLocalPosts, listLocalTrips } from './localStore';
import { newId, savePost, saveTrip } from './store';

/** 移した印：端末の id → サーバーの id */
const DONE_KEY = 'trs_migrated_v1';
/** 「あとで」を押した（このタブを開いている間は聞かない） */
const LATER_KEY = 'trs_migrate_later';

function doneMap(): Record<string, string> {
  try {
    const v = JSON.parse(localStorage.getItem(DONE_KEY) ?? '{}');
    return v && typeof v === 'object' ? (v as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function markDone(localId: string, serverId: string) {
  const m = doneMap();
  m[localId] = serverId;
  localStorage.setItem(DONE_KEY, JSON.stringify(m));
}

export interface Pending {
  trips: Trip[];
  posts: Post[];
}

/** まだ移していない、この端末で作った旅行・投稿 */
export function pendingLocal(): Pending {
  try {
    const done = doneMap();
    return {
      trips: listLocalTrips().filter((t) => t.userId === LOCAL_USER.id && !done[t.id]),
      posts: listLocalPosts().filter((p) => p.userId === LOCAL_USER.id && !done[p.id]),
    };
  } catch {
    return { trips: [], posts: [] };
  }
}

export function laterChosen(): boolean {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1';
  } catch {
    return false;
  }
}

export function chooseLater() {
  try {
    sessionStorage.setItem(LATER_KEY, '1');
  } catch {
    // 覚えられなくても、閉じるだけ
  }
}

/** 移す。1件ずつ移して印を付ける（途中で失敗しても、移せた分は二重にならない）。移した件数を返す */
export async function migrateAll(): Promise<{ trips: number; posts: number; failed: number }> {
  const { trips, posts } = pendingLocal();
  let t = 0;
  let p = 0;
  let failed = 0;
  for (const trip of trips) {
    try {
      const saved = await saveTrip({
        ...trip,
        id: newId(),
        title: trip.title?.trim() || 'この端末の旅行',
        spots: Array.isArray(trip.spots) ? trip.spots : [],
        visibility: 'private',
        createdAt: trip.createdAt || new Date().toISOString(),
      });
      markDone(trip.id, saved.id);
      t++;
    } catch {
      failed++;
    }
  }
  for (const post of posts) {
    try {
      const saved = await savePost({
        ...post,
        id: newId(),
        title: post.title?.trim() || 'この端末の写真',
        visibility: 'private',
        createdAt: post.createdAt || new Date().toISOString(),
      });
      markDone(post.id, saved.id);
      p++;
    } catch {
      failed++;
    }
  }
  return { trips: t, posts: p, failed };
}
