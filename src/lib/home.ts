'use client';

// 自宅のあたり（依頼13）。本人だけが読める profiles_private に置く（RLS）。
//   登録すると、自宅から半径の内側の場所は、ほかの人には位置そのものを出さない（サーバーの trigger が自動で隠す）。
//   半径・ぼかしの幅は SQL（0006_bokashi.sql の private.home_radius_m / blur_cell_m）の1か所で決める。
//   画面は保存の前に near_home で「自宅の近くか」を聞くだけ（ここでは距離を計算しない）。
import { ensureSession, supabase } from './supabase';

export interface HomeState {
  /** 登録した点（無ければ null） */
  home: { lat: number; lng: number } | null;
  /** 「自宅を登録すると…」の案内を出したか（1回だけ） */
  hintDone: boolean;
  /** 利用規約に同意したか（初めて全体に見せる保存のとき1回だけ聞く＝依頼14） */
  termsAgreed: boolean;
}

interface Row {
  home_lat: number | null;
  home_lng: number | null;
  home_hint_done: boolean;
  terms_agreed_at: string | null;
}

export async function getHome(): Promise<HomeState> {
  const me = await ensureSession();
  if (!me) throw new Error('offline');
  const { data, error } = await supabase()
    .from('profiles_private')
    .select('home_lat, home_lng, home_hint_done, terms_agreed_at')
    .eq('id', me)
    .maybeSingle();
  if (error) throw error;
  const r = data as Row | null;
  return {
    home: r && r.home_lat !== null && r.home_lng !== null ? { lat: r.home_lat, lng: r.home_lng } : null,
    hintDone: !!r?.home_hint_done,
    termsAgreed: !!r?.terms_agreed_at,
  };
}

async function upsertMine(fields: Partial<Row>) {
  const me = await ensureSession();
  if (!me) throw new Error('offline');
  const { error } = await supabase().from('profiles_private').upsert({ id: me, ...fields });
  if (error) throw error;
}

/** 自宅を登録する（変える）。サーバーが自分の旅行・投稿のぼかしを作り直す */
export function setHome(lat: number, lng: number) {
  return upsertMine({ home_lat: lat, home_lng: lng });
}

/** 自宅の登録を消す。自宅の近くとして隠していた場所は、ぼかした位置で出るようになる */
export function clearHome() {
  return upsertMine({ home_lat: null, home_lng: null });
}

/** 「自宅を登録すると…」の案内を出した印（もう出さない） */
export function markHomeHintDone() {
  return upsertMine({ home_hint_done: true });
}

/** 利用規約に同意した印（「投稿すると利用規約に同意したものとします」を見て保存した） */
export function markTermsAgreed() {
  return upsertMine({ terms_agreed_at: new Date().toISOString() });
}

/** それぞれの点が自宅の近くか（自宅が無い・読めないときは全部 false） */
export async function nearHome(points: { lat: number; lng: number }[]): Promise<boolean[]> {
  if (!points.length) return [];
  const me = await ensureSession();
  if (!me) return points.map(() => false);
  const { data, error } = await supabase().rpc('near_home', { p_points: points });
  if (error) throw error;
  return Array.isArray(data) ? points.map((_, i) => data[i] === true) : points.map(() => false);
}

export interface SaveCheck {
  /** 自宅の近くの点（入力の順の添字） */
  near: number[];
  /** 「自宅を登録すると、近くの場所を自動で隠せます」を出すか */
  hint: boolean;
  /** 「投稿すると利用規約に同意したものとします」を出すか（初めて全体に見せるときだけ） */
  terms: boolean;
}

/**
 * 保存の前の確かめ。自分だけに見せるときは何も出さない（ほかの人に位置が届かない）。
 * 全体に見せるときは、まだ同意していなければ利用規約の一言も出す（依頼14）。
 * 調べられなかったときは何も出さずに保存へ進む（隠すのはサーバーの trigger なので、守りは変わらない）
 */
export async function checkBeforeSave(
  points: ({ lat: number; lng: number } | null)[],
  visibility: 'public' | 'groups' | 'private',
): Promise<SaveCheck> {
  if (visibility === 'private') return { near: [], hint: false, terms: false };
  try {
    const st = await getHome();
    const terms = visibility === 'public' && !st.termsAgreed;
    if (!st.home) return { near: [], hint: visibility === 'public' && !st.hintDone, terms };
    const idx = points.flatMap((p, i) => (p ? [i] : []));
    const flags = await nearHome(idx.map((i) => points[i] as { lat: number; lng: number }));
    return { near: idx.filter((_, k) => flags[k]), hint: false, terms };
  } catch {
    // 同意したか分からないときは、全体に見せるなら規約の一言を出しておく
    return { near: [], hint: false, terms: visibility === 'public' };
  }
}
