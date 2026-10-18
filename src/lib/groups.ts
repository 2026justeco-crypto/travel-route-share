// グループ（依頼9）。★試作：グループはこの端末（このブラウザ）の中だけ。ほかの人の端末には届かない。
//   β版では Supabase の groups / group_members / group_shares に置き換える（設計：logs/docs/travel-route-share/group-sekkei.md）。
//
// 見える範囲のルール（試作でも同じ考え方で作る）
//   - グループの中身（旅行・写真）はメンバーだけが見られる
//   - 入れるのは招待リンク（合言葉）を知っている人だけ。合言葉を作り直すと古いリンクは使えない
//   - 抜けたら、その人がそのグループに見せていた旅行・写真はグループから外れる（本人の手元には残る）
//   - 消せるのは作った人だけ。作った人は抜けられない（消すか、β版で「作った人を渡す」）

import type { Group, Post, Trip, TripSpot } from './types';
import {
  CURRENT_USER,
  getTrip,
  listPosts,
  seedIfNeeded,
  listTrips,
  placeholderSvg,
  savePost,
  saveTrip,
  uid,
} from './store';
import { photoPut } from './idb';
import { nearestPrefecture } from './regions';

const GROUPS_KEY = 'trs_groups';
const SEED_GROUPS_KEY = 'trs_seeded_groups_v1';

/** 目印の色（A のポップな色。B でも見分けやすい明るさ） */
export const GROUP_COLORS = ['#0f8fdc', '#ff5c8a', '#ffb020', '#1fb57a', '#8b5cf6', '#ef4444'] as const;

function read(): Group[] {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as Group[]) : [];
  } catch {
    return [];
  }
}

function write(groups: Group[]) {
  localStorage.setItem(GROUPS_KEY, JSON.stringify(groups));
}

/** 推測されにくい合言葉（試作。β版はサーバーで作る） */
function newCode(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

export function listGroups(): Group[] {
  return read().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getGroup(id: string): Group | undefined {
  return read().find((g) => g.id === id);
}

export function isMember(g: Group, userId = CURRENT_USER.id): boolean {
  return g.members.some((m) => m.id === userId);
}

export function isOwner(g: Group, userId = CURRENT_USER.id): boolean {
  return g.ownerId === userId;
}

/** 自分が入っているグループ */
export function myGroups(): Group[] {
  return listGroups().filter((g) => isMember(g));
}

export function findGroupByCode(code: string): Group | undefined {
  const c = code.trim();
  if (!c) return undefined;
  return read().find((g) => g.inviteCode === c);
}

function update(id: string, fn: (g: Group) => Group | null) {
  const groups = read();
  const i = groups.findIndex((g) => g.id === id);
  if (i < 0) return;
  const next = fn(groups[i]);
  if (next) groups[i] = next;
  else groups.splice(i, 1);
  write(groups);
}

export function createGroup(name: string, color: string): Group {
  const now = new Date().toISOString();
  const g: Group = {
    id: uid(),
    name: name.trim(),
    color,
    ownerId: CURRENT_USER.id,
    inviteCode: newCode(),
    members: [{ id: CURRENT_USER.id, name: CURRENT_USER.name, joinedAt: now }],
    createdAt: now,
  };
  write([...read(), g]);
  return g;
}

export function joinGroup(id: string) {
  update(id, (g) =>
    isMember(g)
      ? g
      : { ...g, members: [...g.members, { id: CURRENT_USER.id, name: CURRENT_USER.name, joinedAt: new Date().toISOString() }] },
  );
}

/** 抜ける（作った人は抜けられない）。自分がこのグループに見せていた旅行・写真からグループを外す */
export function leaveGroup(id: string) {
  const g = getGroup(id);
  if (!g || isOwner(g)) return;
  update(id, (x) => ({ ...x, members: x.members.filter((m) => m.id !== CURRENT_USER.id) }));
  stripGroup(id, (item) => item.userId === CURRENT_USER.id);
}

/** 消す（作った人だけ）。どの旅行・写真からもこのグループを外す（旅行・写真そのものは消さない） */
export function deleteGroup(id: string) {
  const g = getGroup(id);
  if (!g || !isOwner(g)) return;
  update(id, () => null);
  stripGroup(id, () => true);
}

/** 招待リンクを作り直す（作った人だけ）。古いリンクはもう使えない */
export function regenerateInvite(id: string): string | undefined {
  const g = getGroup(id);
  if (!g || !isOwner(g)) return undefined;
  const code = newCode();
  update(id, (x) => ({ ...x, inviteCode: code }));
  return code;
}

/** 招待リンク（この端末で開くための URL） */
export function inviteUrl(code: string): string {
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return `${window.location.origin}${base}/groups/join/?code=${encodeURIComponent(code)}`;
}

function stripGroup(id: string, which: (item: { userId: string }) => boolean) {
  for (const t of listTrips()) {
    if (which(t) && t.groupIds?.includes(id)) saveTrip({ ...t, groupIds: t.groupIds.filter((x) => x !== id) });
  }
  for (const p of listPosts()) {
    if (which(p) && p.groupIds?.includes(id)) savePost({ ...p, groupIds: p.groupIds.filter((x) => x !== id) });
  }
}

// ---------- 見える範囲 ----------

/**
 * この旅行・写真を今の人が見られるか。
 *   自分のもの → 見られる／見せる先のグループが無い（古いデータ・見本）→ 今までどおり見られる／
 *   グループに見せたもの → そのどれかのメンバーなら見られる
 */
export function canView(item: { userId: string; groupIds?: string[] }, groups: Group[] = read()): boolean {
  if (item.userId === CURRENT_USER.id) return true;
  if (!item.groupIds || item.groupIds.length === 0) return true;
  return item.groupIds.some((id) => {
    const g = groups.find((x) => x.id === id);
    return !!g && isMember(g);
  });
}

/** トップ（みんなの旅）に出すか：ほかの人がグループにだけ見せたものはトップに出さない（グループのページで見る） */
export function showOnTop(item: { userId: string; groupIds?: string[] }): boolean {
  if (item.userId === CURRENT_USER.id) return true;
  return !item.groupIds || item.groupIds.length === 0;
}

export function groupTrips(id: string): Trip[] {
  return listTrips().filter((t) => t.groupIds?.includes(id));
}

export function groupPosts(id: string): Post[] {
  return listPosts().filter((p) => p.groupIds?.includes(id));
}

/** 見せる先の id のうち、今も自分が入っているグループだけ残す（抜けた・消えたグループを外す） */
export function keepMyGroupIds(ids: string[] | undefined): string[] {
  const mine = new Set(myGroups().map((g) => g.id));
  return (ids ?? []).filter((id) => mine.has(id));
}

// ---------- 見本データ（グループ2つ・それぞれに旅行。既存の見本は消さない。1回だけ足す） ----------

const CIRCLE_ID = 'demo-group-circle';
const FAMILY_ID = 'demo-group-family';

/** 今までの見本＋グループの見本をまとめて入れる（どの画面から開いても同じものが入る） */
export async function seedAll(): Promise<void> {
  await seedIfNeeded();
  await seedGroupsIfNeeded();
}

async function seedGroupsIfNeeded(): Promise<void> {
  if (localStorage.getItem(SEED_GROUPS_KEY)) return;
  const day = 86400000;
  const now = Date.now();
  const iso = (d: number) => new Date(now - d * day).toISOString();
  const groups = read();
  // 大学の旅サークル：ほかの人が作ったグループ（自分はまだ入っていない＝招待リンクで入る流れを試せる）
  if (!groups.some((g) => g.id === CIRCLE_ID)) {
    groups.push({
      id: CIRCLE_ID,
      name: '大学の旅サークル',
      color: GROUP_COLORS[0],
      ownerId: 'demo-circle-1',
      inviteCode: 'circle-demo-7k2m',
      members: [
        { id: 'demo-circle-1', name: 'ぶちょう', joinedAt: iso(40) },
        { id: 'demo-circle-2', name: 'みさき', joinedAt: iso(39) },
        { id: 'demo-circle-3', name: 'けんた', joinedAt: iso(30) },
      ],
      createdAt: iso(40),
    });
  }
  // 家族：自分が作ったグループ
  if (!groups.some((g) => g.id === FAMILY_ID)) {
    groups.push({
      id: FAMILY_ID,
      name: '家族',
      color: GROUP_COLORS[1],
      ownerId: CURRENT_USER.id,
      inviteCode: 'kazoku-demo-3p9x',
      members: [
        { id: CURRENT_USER.id, name: CURRENT_USER.name, joinedAt: iso(20) },
        { id: 'demo-family-1', name: 'お母さん', joinedAt: iso(19) },
        { id: 'demo-family-2', name: 'お父さん', joinedAt: iso(19) },
      ],
      createdAt: iso(20),
    });
  }
  write(groups);

  const spot = (name: string, lat: number, lng: number, memo: string, moveTo?: TripSpot['moveTo']): TripSpot => ({
    id: uid(),
    name,
    memo,
    lat,
    lng,
    photoId: null,
    ...(moveTo ? { moveTo } : {}),
  });
  const trips: Trip[] = [
    {
      id: 'demo-group-trip-gasshuku',
      userId: 'demo-circle-1',
      userName: 'ぶちょう',
      title: '夏合宿 松本・上高地',
      startDate: '2026-08-21',
      endDate: '2026-08-23',
      status: 'done',
      spots: [
        spot('新宿駅', 35.6896, 139.7006, '特急あずさで松本へ。', 'train'),
        spot('松本城', 36.2381, 137.9691, '黒い天守がかっこいい。バスで上高地へ。', 'bus'),
        spot('上高地 河童橋', 36.2513, 137.6378, '朝の霧がきれいだった。'),
      ],
      createdAt: iso(25),
      groupIds: [CIRCLE_ID],
    },
    {
      id: 'demo-group-trip-sotsugyo',
      userId: 'demo-circle-2',
      userName: 'みさき',
      title: '卒業旅行 金沢（計画中）',
      startDate: '2027-02-20',
      endDate: '2027-02-21',
      status: 'plan',
      spots: [
        spot('東京駅', 35.6812, 139.7671, '北陸新幹線で。', 'train'),
        spot('金沢駅', 36.578, 136.6475, 'バスでひがし茶屋街へ。', 'bus'),
        spot('ひがし茶屋街', 36.5725, 136.6667, '金箔ソフトを食べたい。', 'walk'),
        spot('兼六園', 36.5621, 136.6626, ''),
      ],
      createdAt: iso(5),
      groupIds: [CIRCLE_ID],
    },
    {
      id: 'demo-group-trip-hakone',
      userId: 'demo-family-1',
      userName: 'お母さん',
      title: '家族で箱根 1泊2日',
      startDate: '2026-05-03',
      endDate: '2026-05-04',
      status: 'done',
      spots: [
        spot('小田原駅', 35.2564, 139.1551, '箱根登山鉄道に乗りかえ。', 'train'),
        spot('箱根湯本', 35.2327, 139.1056, 'バスで大涌谷へ。', 'bus'),
        spot('大涌谷', 35.2441, 139.0197, '黒たまごを家族で1つずつ。ロープウェイで湖へ。'),
        spot('芦ノ湖 桃源台港', 35.2392, 139.0003, '海賊船に乗る。', 'ship'),
        spot('芦ノ湖 箱根町港', 35.1925, 139.0247, '湖の上は風が気持ちよかった。'),
      ],
      createdAt: iso(15),
      groupIds: [FAMILY_ID],
    },
  ];
  for (const t of trips) if (!getTrip(t.id)) saveTrip(t);

  // 家族に見せた写真1枚
  const POST_ID = 'demo-group-post-owakudani';
  if (!listPosts().some((p) => p.id === POST_ID)) {
    const photoId = 'demo-group-photo-owakudani';
    await photoPut(photoId, placeholderSvg('大涌谷の黒たまご', '#64748b', '#f59e0b'));
    const pref = nearestPrefecture(35.2441, 139.0197);
    savePost({
      id: POST_ID,
      userId: 'demo-family-2',
      userName: 'お父さん',
      title: '大涌谷の黒たまご',
      comment: '1つ食べると7年長生きするらしい。',
      date: '2026-05-03',
      lat: 35.2441,
      lng: 139.0197,
      placeName: '大涌谷',
      prefecture: pref.name,
      region: pref.region,
      photoId,
      createdAt: iso(14),
      groupIds: [FAMILY_ID],
    });
  }
  localStorage.setItem(SEED_GROUPS_KEY, '1');
}
