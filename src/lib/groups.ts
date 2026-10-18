'use client';

// グループ（依頼9で試作 → 依頼12でサーバー版）。Supabase の groups / group_members / group_invites / trip_groups / post_groups。
//   守りは DB の RLS と関数（supabase/migrations/0005_groups.sql）。ここで「出さない」のは見た目の都合だけ。
//
// 見える範囲のルール
//   - グループの中身（旅行・写真・メンバー一覧・招待リンク）はメンバーだけ
//   - 入れるのは招待リンク（24文字の乱数）を知っている人だけ。作り直すと古いリンクは使えない
//   - 抜けた人が見せていたものはグループに残る（抜けた人自身はもう中を見られない。自分の旅行を「自分だけ」にする・消すのは自由）
//   - 消せるのは作った人だけ。作った人は抜けられない。消すとグループへの共有だけが消える（旅行・投稿は残る）

import type { Group, GroupMember, Visibility } from './types';
import { ensureSession, myUserId, supabase } from './supabase';
import { isServerId } from './store';
import { LIMITS, clip } from './limits';

/** 目印の色（A のポップな色。B でも見分けやすい明るさ） */
export const GROUP_COLORS = ['#0f8fdc', '#ff5c8a', '#ffb020', '#1fb57a', '#8b5cf6', '#ef4444'] as const;

/** 一覧・見せる先の選択に出す短い形 */
export interface GroupBrief {
  id: string;
  name: string;
  color: string;
  ownerId: string;
  memberCount: number;
  createdAt: string;
}

async function needUser(): Promise<string> {
  const id = await ensureSession();
  if (!id) throw new Error('offline');
  return id;
}

interface GroupRow {
  id: string;
  name: string;
  color: string;
  owner: string;
  created_at: string;
  group_members?: { count: number }[];
}

function toBrief(r: GroupRow): GroupBrief {
  return {
    id: r.id,
    name: r.name,
    color: r.color,
    ownerId: r.owner,
    memberCount: r.group_members?.[0]?.count ?? 0,
    createdAt: r.created_at,
  };
}

/** 自分が入っているグループ（RLS：メンバーのグループしか返らない）。新しい順 */
export async function myGroups(): Promise<GroupBrief[]> {
  const me = await ensureSession();
  if (!me) return [];
  const { data, error } = await supabase()
    .from('groups')
    .select('id, name, color, owner, created_at, group_members(count)')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data as unknown as GroupRow[]).map(toBrief);
}

/** グループごとの旅行・写真の数（見られるものだけ数える） */
export async function groupCounts(ids: string[]): Promise<Map<string, { trips: number; posts: number }>> {
  const out = new Map<string, { trips: number; posts: number }>();
  ids.forEach((id) => out.set(id, { trips: 0, posts: 0 }));
  if (!ids.length) return out;
  const sb = supabase();
  const [t, p] = await Promise.all([
    sb.from('trip_groups').select('group_id, trips!inner(visibility)').in('group_id', ids).eq('trips.visibility', 'groups'),
    sb.from('post_groups').select('group_id, posts!inner(visibility)').in('group_id', ids).eq('posts.visibility', 'groups'),
  ]);
  if (t.error) throw t.error;
  if (p.error) throw p.error;
  for (const r of t.data as { group_id: string }[]) {
    const c = out.get(r.group_id);
    if (c) c.trips++;
  }
  for (const r of p.data as { group_id: string }[]) {
    const c = out.get(r.group_id);
    if (c) c.posts++;
  }
  return out;
}

/** グループ1つ（メンバー一覧・招待コードつき）。メンバーでない・無いときは null（RLS で返らない） */
export async function getGroup(id: string): Promise<Group | null> {
  if (!isServerId(id)) return null;
  await needUser();
  const sb = supabase();
  const { data: g, error } = await sb
    .from('groups')
    .select('id, name, color, owner, created_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!g) return null;
  const [m, i] = await Promise.all([
    sb
      .from('group_members')
      .select('user_id, role, joined_at, profiles(display_name)')
      .eq('group_id', id)
      .order('joined_at', { ascending: true }),
    sb.from('group_invites').select('code').eq('group_id', id).maybeSingle(),
  ]);
  if (m.error) throw m.error;
  if (i.error) throw i.error;
  type MemberRow = {
    user_id: string;
    role: 'owner' | 'member';
    joined_at: string;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const members: GroupMember[] = (m.data as unknown as MemberRow[]).map((r) => {
    const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    return { id: r.user_id, name: prof?.display_name || '旅人', joinedAt: r.joined_at, role: r.role };
  });
  const row = g as GroupRow;
  return {
    id: row.id,
    name: row.name,
    color: row.color,
    ownerId: row.owner,
    inviteCode: (i.data as { code: string } | null)?.code ?? '',
    members,
    createdAt: row.created_at,
  };
}

export function isOwner(g: { ownerId: string }): boolean {
  return !!myUserId() && g.ownerId === myUserId();
}

// ---------- 表示名（グループに参加・作成するとき1回だけ聞く） ----------

/** 表示名をまだ聞いていなければ、初期値（旅人＋4桁）を返す。聞いたことがあれば null */
export async function displayNameToAsk(): Promise<string | null> {
  const me = await ensureSession();
  if (!me) return null;
  // profiles の表から読めるのは id と表示名だけ（依頼16・列の権限）。自分の name_asked は my_profile() で読む
  const { data, error } = await supabase().rpc('my_profile');
  const row = (data as { display_name: string; name_asked: boolean }[] | null)?.[0];
  if (error || !row) return null;
  if (row.name_asked) return null;
  const n = new Uint16Array(1);
  crypto.getRandomValues(n);
  return `旅人${String(n[0] % 10000).padStart(4, '0')}`;
}

// ---------- つくる・入る・抜ける・消す ----------

/** つくる（作った人＝自分。招待コードもサーバーが作る）。グループの id を返す */
export async function createGroup(name: string, color: string, displayName?: string | null): Promise<string> {
  await needUser();
  const { data, error } = await supabase().rpc('create_group', {
    p_name: clip(name.trim(), LIMITS.groupName),
    p_color: color,
    p_display_name: displayName ?? null,
  });
  if (error) throw error;
  return data as string;
}

export interface InvitePeek {
  groupId: string;
  name: string;
  color: string;
  memberCount: number;
  ownerName: string;
  already: boolean;
}

/** 招待コードからグループを引く（参加する前の確認用）。合わなければ null */
export async function peekInvite(code: string): Promise<InvitePeek | null> {
  const c = code.trim();
  if (!c) return null;
  await needUser();
  const { data, error } = await supabase().rpc('peek_invite', { p_code: c });
  if (error) throw error;
  const r = (data as { group_id: string; name: string; color: string; member_count: number; owner_name: string | null; already: boolean }[])[0];
  if (!r) return null;
  return {
    groupId: r.group_id,
    name: r.name,
    color: r.color,
    memberCount: r.member_count,
    ownerName: r.owner_name || '旅人',
    already: r.already,
  };
}

/** 参加する。グループの id を返す（コードが合わなければ null） */
export async function joinGroup(code: string, displayName?: string | null): Promise<string | null> {
  await needUser();
  const { data, error } = await supabase().rpc('join_group', { p_code: code.trim(), p_display_name: displayName ?? null });
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** 抜ける（作った人は抜けられない＝RLS）。自分が見せていたものはグループに残る。抜けられたら true */
export async function leaveGroup(id: string): Promise<boolean> {
  const me = await needUser();
  const { data, error } = await supabase()
    .from('group_members')
    .delete()
    .eq('group_id', id)
    .eq('user_id', me)
    .select('user_id');
  if (error) throw error;
  return data.length > 0;
}

/** 消す（作った人だけ＝RLS）。グループへの共有だけが消える（旅行・投稿そのものは残る）。消せたら true */
export async function deleteGroup(id: string): Promise<boolean> {
  await needUser();
  const { error, count } = await supabase().from('groups').delete({ count: 'exact' }).eq('id', id);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** 招待リンクを作り直す（作った人だけ）。新しいコードを返す */
export async function regenerateInvite(id: string): Promise<string> {
  await needUser();
  const { data, error } = await supabase().rpc('regenerate_invite', { p_group: id });
  if (error) throw error;
  return data as string;
}

/** 招待リンク（開くと参加の確認画面） */
export function inviteUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${window.location.origin}${base}/groups/join/?code=${encodeURIComponent(code)}`;
}

// ---------- 見せる先（旅行・投稿 ⇔ グループ） ----------

export type ShareKind = 'trip' | 'post';

function shareTable(kind: ShareKind) {
  return kind === 'trip' ? { table: 'trip_groups', col: 'trip_id' } : { table: 'post_groups', col: 'post_id' };
}

export interface ShareState {
  /** 自分が入っているグループのうち、見せているもの */
  mine: string[];
  /** 抜けた（もう入っていない）グループに見せたままの数（持ち主だけが分かる） */
  leftCount: number;
}

/** 自分の旅行・投稿を、どのグループに見せているか */
export async function getShares(kind: ShareKind, id: string, myGroupIds: string[]): Promise<ShareState> {
  if (!isServerId(id)) return { mine: [], leftCount: 0 };
  await needUser();
  const { table, col } = shareTable(kind);
  const { data, error } = await supabase().from(table).select('group_id').eq(col, id);
  if (error) throw error;
  const ids = (data as { group_id: string }[]).map((r) => r.group_id);
  const mine = new Set(myGroupIds);
  return { mine: ids.filter((g) => mine.has(g)), leftCount: ids.filter((g) => !mine.has(g)).length };
}

/**
 * 保存のあと、見せる先のグループを合わせる。
 *   visibility が groups 以外 → グループへの共有をすべて外す
 *   groups → 入っているグループは選んだとおりに付け外し。抜けたグループに見せたままのものは dropLeft のときだけ外す
 */
export async function syncShares(
  kind: ShareKind,
  id: string,
  visibility: Visibility,
  selected: string[],
  dropLeft = false,
): Promise<void> {
  await needUser();
  const { table, col } = shareTable(kind);
  const sb = supabase();
  const [{ data: cur, error: e1 }, groups] = await Promise.all([
    sb.from(table).select('group_id').eq(col, id),
    myGroups(),
  ]);
  if (e1) throw e1;
  const now = (cur as { group_id: string }[]).map((r) => r.group_id);
  const mine = new Set(groups.map((g) => g.id));
  const want = visibility === 'groups' ? Array.from(new Set(selected)).filter((g) => mine.has(g)) : [];
  const drop = now.filter((g) => !want.includes(g) && (visibility !== 'groups' || mine.has(g) || dropLeft));
  const add = want.filter((g) => !now.includes(g));
  if (drop.length) {
    const { error } = await sb.from(table).delete().eq(col, id).in('group_id', drop);
    if (error) throw error;
  }
  if (add.length) {
    const { error } = await sb.from(table).insert(add.map((g) => ({ [col]: id, group_id: g })));
    if (error) throw error;
  }
}

/** 旅行・投稿を見せているグループのうち、自分が入っているもの（名前と色。メンバーでないグループは RLS で返らない） */
export async function sharedGroupsVisible(kind: ShareKind, id: string): Promise<GroupBrief[]> {
  if (!isServerId(id)) return [];
  const me = await ensureSession();
  if (!me) return [];
  const { table, col } = shareTable(kind);
  const { data, error } = await supabase()
    .from(table)
    .select('groups(id, name, color, owner, created_at)')
    .eq(col, id);
  if (error) throw error;
  return (data as unknown as { groups: GroupRow | GroupRow[] | null }[])
    .map((r) => (Array.isArray(r.groups) ? r.groups[0] : r.groups))
    .filter((g): g is GroupRow => !!g)
    .map(toBrief);
}

// ---------- この端末に残った試作（依頼9）の片付け ----------

const OLD_KEYS = ['trs_groups', 'trs_seeded_groups_v1'];

/** 試作のグループ（localStorage）と見本（旅行・写真）を端末から消す。サーバーのデータには触らない */
export function forgetGroupPrototype(): string[] {
  const photoIds: string[] = [];
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
    for (const key of ['trs_trips', 'trs_posts']) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const v = JSON.parse(raw) as { id?: string; photoId?: string | null }[];
      if (!Array.isArray(v)) continue;
      const keep = v.filter((x) => !(typeof x?.id === 'string' && x.id.startsWith('demo-group-')));
      if (keep.length !== v.length) {
        v.filter((x) => !keep.includes(x)).forEach((x) => x.photoId && photoIds.push(x.photoId));
        localStorage.setItem(key, JSON.stringify(keep));
      }
    }
  } catch {
    // 読めない環境では何もしない
  }
  return photoIds;
}
