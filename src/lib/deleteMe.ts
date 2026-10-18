'use client';

// すべてのデータを消す（依頼14）。設定の「すべてのデータを消す」（2回押し）から呼ぶ。
//   1) 写真：自分のフォルダ（photos/{uid}/）を Storage API で空にする（SQL からは消せない。RLS＝自分のフォルダだけ消せる）
//   2) サーバーの残り：rpc delete_my_data（0007_delete_me.sql）。旅行・投稿（正確な座標・グループへの共有ごと）・お気に入り・
//      グループの参加・自宅・規約の同意・匿名ユーザーそのものを消す。自分が作ったグループは、ほかにメンバーがいればその人に渡す
//      （写真が残っていたら何も消さずにエラー＝1からやり直せる）
//   3) この端末：セッションを捨て（ログアウト）、下書き・引っ越し前のデータ・端末の写真を消す（見た目の好み A/B・地図の切替は残す）
import { ensureSession, signOutAfterDelete, supabase } from './supabase';
import { PHOTO_BUCKET } from './photos';

export interface DeleteResult {
  photos: number;
  trips: number;
  posts: number;
  favorites: number;
  groupMembers: number;
  groupsDeleted: number;
  groupsHandedOver: number;
}

/** 自分のフォルダの写真をすべて消す。消した枚数を返す（消せなければ投げる） */
async function removeAllMyPhotos(me: string): Promise<number> {
  const bucket = supabase().storage.from(PHOTO_BUCKET);
  let removed = 0;
  // 消すと一覧が詰まるので、毎回先頭から取り直す（空になるまで）
  for (let round = 0; round < 50; round++) {
    const { data, error } = await bucket.list(me, { limit: 1000 });
    if (error) throw error;
    const paths = (data ?? []).filter((f) => f.id).map((f) => `${me}/${f.name}`);
    if (!paths.length) return removed;
    const { data: gone, error: rmErr } = await bucket.remove(paths);
    if (rmErr) throw rmErr;
    if (!gone?.length) throw new Error('photos not removed');
    removed += gone.length;
  }
  throw new Error('too many photos');
}

/** この端末に残したこのサービスのデータ（下書き・引っ越し前の旅行と写真・端末の写真）を消す */
async function forgetThisDevice() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      // trs_ ＝データ。trs-theme（A/B）・trs-top-map（地図の切替）は好みなので残す
      if (k && k.startsWith('trs_')) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch {
    // 読めない環境では何もしない
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      // 道なりの線の控え（trs-osrm-…）には自分のスポットの位置が入るので消す。画面の行き来の道のりは残す
      if (k && (k.startsWith('trs_') || k.startsWith('trs-osrm')) && k !== 'trs_nav_trail' && k !== 'trs_nav_replace') keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    // 読めない環境では何もしない
  }
  await new Promise<void>((resolve) => {
    try {
      const req = indexedDB.deleteDatabase('trs-db');
      req.onsuccess = req.onerror = req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

/** すべて消す。途中で失敗したら投げる（もう一度押せば続きから消える） */
export async function deleteAllMyData(): Promise<DeleteResult> {
  const me = await ensureSession();
  if (!me) throw new Error('offline');
  const photos = await removeAllMyPhotos(me);
  const { data, error } = await supabase().rpc('delete_my_data');
  if (error) throw error;
  const r = (data ?? {}) as Record<string, number>;
  await signOutAfterDelete();
  await forgetThisDevice();
  return {
    photos,
    trips: r.trips ?? 0,
    posts: r.posts ?? 0,
    favorites: r.favorites ?? 0,
    groupMembers: r.group_members ?? 0,
    groupsDeleted: r.groups_deleted ?? 0,
    groupsHandedOver: r.groups_handed_over ?? 0,
  };
}
