'use client';

// 量・回数の上限（依頼16）。画面の数字はここ1か所。サーバーの数字は supabase/migrations/0008_seigen.sql の private.lim()。
//   ★両方を同じにしておく（サーバーが本当の守り。画面は先に知らせるだけ）
//   文字数：画面の maxLength は UTF-16 の数え方（絵文字は2）、サーバーは文字（コードポイント）の数え方なので、画面の方が少しきつい＝画面で通ればサーバーでも通る

import { supabase } from './supabase';

export const LIMITS = {
  tripTitle: 100,
  tripSpots: 60,
  spotName: 100,
  spotMemo: 1000,
  /** 旅行のスポット全体（JSON にして UTF-8 のバイト数）＝100KB */
  tripSpotsBytes: 102400,
  postTitle: 100,
  postComment: 2000,
  postPlace: 200,
  displayName: 30,
  groupName: 30,
} as const;

/** 文字列を上限で切る（自動で付ける題名などが上限を超えないように） */
export function clip(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('');
}

/** JSON にしたときの UTF-8 のバイト数 */
export function jsonBytes(v: unknown): number {
  return new TextEncoder().encode(JSON.stringify(v)).length;
}

type Kind = 'trip' | 'post' | 'group' | 'photo';
const NOUN: Record<Kind, string> = { trip: '旅行', post: '投稿', group: 'グループ', photo: '写真' };

/** サーバーの「上限を超えた」エラーか。超えていれば { win, kind } */
export function rateLimitOf(e: unknown): { win: 'minute' | 'day' | 'total'; kind: Kind } | null {
  const msg = typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : '';
  const m = /trs_rate_limit:(minute|day|total):(trip|post|group|photo)/.exec(msg);
  return m ? { win: m[1] as 'minute' | 'day' | 'total', kind: m[2] as Kind } : null;
}

/** 上限の言葉 */
export function limitMessage(win: 'minute' | 'day' | 'total', kind: Kind): string {
  const n = NOUN[kind];
  if (win === 'minute') return `短い時間に${n}をたくさん保存しました。少し時間をおいてから保存してください（入力は消えません）。`;
  if (win === 'day') return `今日はこれ以上${n}を保存できません（1日の上限）。明日また保存してください（入力は消えません）。`;
  return `保存できる${n}の数の上限に達しました。使わない${n}を消すと保存できます。`;
}

/** 長すぎる（check 制約）エラーか */
export function isTooLong(e: unknown): boolean {
  return typeof e === 'object' && !!e && 'code' in e && (e as { code: unknown }).code === '23514';
}

/** 写真を置けなかったとき：上限に当たっているかをサーバーに聞く（Storage は「権限がない」としか返さないため） */
export async function photoLimitHit(): Promise<'minute' | 'day' | 'total' | null> {
  try {
    const { data, error } = await supabase().rpc('my_photo_limit');
    if (error) return null;
    return data === 'minute' || data === 'day' || data === 'total' ? data : null;
  } catch {
    return null;
  }
}

/** 写真の上限に当たったときに uploadPhoto が投げるエラー */
export class LimitError extends Error {
  constructor(
    public win: 'minute' | 'day' | 'total',
    public kind: Kind,
  ) {
    super(`trs_rate_limit:${win}:${kind}`);
  }
}

/** 保存できなかったときの言葉。上限・長すぎなら分かる言葉、それ以外は fallback（通信など） */
export function saveErrorMessage(e: unknown, fallback: string): string {
  const r = rateLimitOf(e);
  if (r) return limitMessage(r.win, r.kind);
  if (isTooLong(e)) return '入力が長すぎます。文字数を減らしてから、もう一度保存してください（入力は消えません）。';
  return fallback;
}
