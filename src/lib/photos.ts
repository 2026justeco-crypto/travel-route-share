'use client';

// 写真（依頼11）：サーバー（Supabase Storage・バケット photos・非公開）に置く。
//   - パス：{自分の uid}/{uuid}.jpg（運営の見本だけ sample/〜.jpg）。旅行のスポットの photoId・投稿の photo_path にこのパスを入れる
//   - 置く前に縮小（長い辺 1600px・JPEG。300KB を超えたら質を少しずつ下げる）。canvas で描き直すので EXIF（撮った場所など）は残らない
//   - 出すときは署名付きURL（有効期限つき）。一覧はまとめて取る（createSignedUrls）
//   - 守りは storage.objects の RLS（supabase/migrations/0002_photos.sql）。ここで「出さない」のは見た目の都合だけ
//   - 入力中（下書き）の写真はまだこの端末の IndexedDB（保存した時にアップロード）
//   - グループに見せた写真も同じバケット・同じ判定（依頼12：private.can_read_photo がグループのメンバーも見られるようにした）

import { photoDelete, photoGetMany } from './idb';
import { ensureSession, supabase } from './supabase';
import { LimitError, photoLimitHit } from './limits';

export const PHOTO_BUCKET = 'photos';
/** 長い辺の上限 */
export const MAX_DIM = 1600;
/** 1枚の目安（これを超えたら質を下げてやり直す） */
export const TARGET_BYTES = 300 * 1024;
const QUALITIES = [0.8, 0.72, 0.64, 0.56];
/** 署名付きURLの有効期限（秒） */
const SIGN_SECONDS = 60 * 60;

/** サーバーの写真のパスか（端末の IndexedDB の id と見分ける） */
export function isStoragePath(id: string | null | undefined): id is string {
  return !!id && /^(sample|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/[A-Za-z0-9._-]+\.jpg$/i.test(id);
}

function newUuid(): string {
  const c: Crypto = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = new Uint8Array(16);
  c.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

// ---------- 縮小 ----------

export interface Shrunk {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  quality: number;
}

function loadImage(src: Blob | string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = typeof src === 'string' ? src : URL.createObjectURL(src);
    const img = new Image();
    img.onload = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      if (typeof src !== 'string') URL.revokeObjectURL(url);
      reject(new Error('image load failed'));
    };
    img.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', quality),
  );
}

function blobToDataUrl(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(b);
  });
}

/** 写真（ファイル・dataURL）を長い辺 1600px の JPEG に描き直す。EXIF は描き直しで落ちる */
export async function shrinkPhoto(src: Blob | string, maxDim = MAX_DIM): Promise<Shrunk> {
  const img = await loadImage(src);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const scale = Math.min(1, maxDim / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas not supported');
  // 透明な画像（PNG・SVG）は JPEG にすると黒くなるので白を敷く
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  let blob: Blob | null = null;
  let quality = QUALITIES[0];
  for (const q of QUALITIES) {
    quality = q;
    blob = await toBlob(canvas, q);
    if (blob.size <= TARGET_BYTES) break;
  }
  if (!blob) throw new Error('encode failed');
  return { blob, dataUrl: await blobToDataUrl(blob), width: w, height: h, quality };
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  return (await fetch(dataUrl)).blob();
}

// ---------- 置く・消す ----------

/**
 * 写真を自分のフォルダに置き、パスを返す。
 * shrunk＝shrinkPhoto で縮小ずみの JPEG の dataURL（入力画面で選んだ写真）。それ以外（引っ越しの古い写真など）は縮小してから置く
 */
export async function uploadPhoto(src: Blob | string, opts: { shrunk?: boolean } = {}): Promise<string> {
  const me = await ensureSession();
  if (!me) throw new Error('offline');
  const ready = opts.shrunk && typeof src === 'string' && src.startsWith('data:image/jpeg');
  const blob = ready ? await dataUrlToBlob(src) : (await shrinkPhoto(src)).blob;
  const path = `${me}/${newUuid()}.jpg`;
  const { error } = await supabase()
    .storage.from(PHOTO_BUCKET)
    .upload(path, blob, { contentType: 'image/jpeg', upsert: false, cacheControl: '3600' });
  if (error) {
    // 枚数の上限（依頼16）に当たると Storage は「権限がない」としか返さないので、理由をサーバーに聞いて分かる言葉にする
    const hit = await photoLimitHit();
    if (hit) throw new LimitError(hit, 'photo');
    throw error;
  }
  return path;
}

/** 自分の写真を消す（他人・見本のパスは混ぜても消えない＝RLS）。失敗しても投げない（後で掃除する） */
export async function removePhotos(paths: (string | null | undefined)[]): Promise<number> {
  const me = await ensureSession();
  if (!me) return 0;
  const mine = Array.from(new Set(paths.filter(isStoragePath))).filter((p) => p.startsWith(`${me}/`));
  if (!mine.length) return 0;
  try {
    const { data, error } = await supabase().storage.from(PHOTO_BUCKET).remove(mine);
    if (error) return 0;
    mine.forEach((p) => urlCache.delete(p));
    return data?.length ?? 0;
  } catch {
    return 0;
  }
}

/**
 * スポットの写真のうち、まだ端末の中（IndexedDB）にあるものをアップロードしてパスに置き換えた写しを返す。
 * uploaded＝今回置いたパス（保存に失敗したら消す）、localIds＝置き換えた端末の id（保存できたら端末から消してよい）
 */
export async function uploadSpotPhotos<T extends { photoId: string | null }>(
  spots: T[],
  opts: { shrunk?: boolean } = {},
): Promise<{ spots: T[]; uploaded: string[]; localIds: string[] }> {
  const local = spots.map((s) => s.photoId).filter((x): x is string => !!x && !isStoragePath(x));
  if (!local.length) return { spots, uploaded: [], localIds: [] };
  const data = await photoGetMany(local);
  const map = new Map<string, string>();
  const uploaded: string[] = [];
  try {
    for (const id of Array.from(new Set(local))) {
      const v = data.get(id);
      if (!v) continue; // 端末に無い（消えた）写真は付けない
      const path = await uploadPhoto(v, opts);
      uploaded.push(path);
      map.set(id, path);
    }
  } catch (e) {
    await removePhotos(uploaded);
    throw e;
  }
  return {
    spots: spots.map((s) =>
      s.photoId && !isStoragePath(s.photoId) ? { ...s, photoId: map.get(s.photoId) ?? null } : s,
    ),
    uploaded,
    localIds: Array.from(map.keys()),
  };
}

/** 端末の写真（下書きの写真）を消す。失敗しても投げない */
export async function forgetLocalPhotos(ids: string[]) {
  await Promise.all(ids.map((id) => photoDelete(id).catch(() => {})));
}

// ---------- 出す ----------

const urlCache = new Map<string, { url: string; exp: number }>();

/**
 * 写真の id（サーバーのパス／端末の id）→ 画面に出せる URL。
 * サーバーの写真は署名付きURLをまとめて作る（見てはいけない写真は返ってこない＝RLS）。端末の写真は dataURL。
 */
export async function photoUrls(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const uniq = Array.from(new Set(ids.filter((x): x is string => !!x)));
  const remote = uniq.filter(isStoragePath);
  const local = uniq.filter((x) => !isStoragePath(x));
  const now = Date.now();
  const need: string[] = [];
  for (const p of remote) {
    const c = urlCache.get(p);
    // 期限の5分前までは使い回す
    if (c && c.exp - now > 5 * 60 * 1000) out.set(p, c.url);
    else need.push(p);
  }
  const jobs: Promise<void>[] = [];
  if (need.length) {
    jobs.push(
      (async () => {
        await ensureSession();
        // 1回に送る数を抑える（URL が長くなりすぎないように）
        for (let i = 0; i < need.length; i += 100) {
          const chunk = need.slice(i, i + 100);
          const { data, error } = await supabase().storage.from(PHOTO_BUCKET).createSignedUrls(chunk, SIGN_SECONDS);
          if (error || !data) continue;
          for (const r of data) {
            if (r.path && r.signedUrl && !r.error) {
              out.set(r.path, r.signedUrl);
              urlCache.set(r.path, { url: r.signedUrl, exp: now + SIGN_SECONDS * 1000 });
            }
          }
        }
      })().catch(() => {}),
    );
  }
  if (local.length) {
    jobs.push(
      photoGetMany(local)
        .then((m) => m.forEach((v, k) => out.set(k, v)))
        .catch(() => {}),
    );
  }
  await Promise.all(jobs);
  return out;
}

// ---------- 掃除（消し忘れを残さない） ----------

/**
 * 自分のフォルダの写真のうち、どの旅行・投稿にも付いていないものを消す。
 * 保存の途中（置いた直後・まだ旅行に付けていない）を消さないよう、1時間より古いものだけ。消した枚数を返す。
 */
export async function sweepOrphanPhotos(): Promise<number> {
  try {
    const me = await ensureSession();
    if (!me) return 0;
    const sb = supabase();
    const files: { name: string; created_at: string | null }[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await sb.storage.from(PHOTO_BUCKET).list(me, { limit: 1000, offset });
      if (error || !data) return 0;
      files.push(...data.map((f) => ({ name: f.name, created_at: f.created_at ?? null })));
      if (data.length < 1000) break;
    }
    if (!files.length) return 0;
    const [{ data: trips, error: e1 }, { data: posts, error: e2 }] = await Promise.all([
      sb.from('trips').select('spots').eq('owner', me),
      sb.from('posts').select('photo_path').eq('owner', me),
    ]);
    if (e1 || e2 || !trips || !posts) return 0;
    const used = new Set<string>();
    for (const t of trips as { spots: { photoId?: string | null }[] }[])
      for (const s of t.spots ?? []) if (s.photoId) used.add(s.photoId);
    for (const p of posts as { photo_path: string | null }[]) if (p.photo_path) used.add(p.photo_path);
    const hourAgo = Date.now() - 60 * 60 * 1000;
    const orphans = files
      .filter((f) => f.created_at && new Date(f.created_at).getTime() < hourAgo)
      .map((f) => `${me}/${f.name}`)
      .filter((p) => !used.has(p));
    return orphans.length ? removePhotos(orphans) : 0;
  } catch {
    return 0;
  }
}
