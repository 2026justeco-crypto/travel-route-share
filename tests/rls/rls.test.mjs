// 権限のテスト（依頼15）：他人のデータが見えない・変えられない
//   攻める側の点検。公開キー（publishable）だけを使い、画面を通さず supabase-js で直接叩く。
//   ★secret / service_role キーは使わない。DB の SQL も使わない（このテストは利用者と同じ入口だけ）。
//
//   登場人物：A＝持ち主／B＝A と同じグループ／C＝無関係／anon＝ログインしていない人（公開キーだけ）
//   後片付け：各ユーザー自身が Storage API で自分の写真を消し、public.delete_my_data を呼ぶ（after の中）。
//   結果は最後に「番号・項目・期待・結果」の表で出す。期待どおりでない項目は失敗として数える（直さない）。
//
//   回し方：npm run test:rls（匿名ログインを4回使う。Supabase の匿名ログインには IP ごとの回数制限がある）
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

// 接続先は画面と同じ定数（src/lib/supabaseConfig.ts）から読む。公開キーだけが入っている
const cfg = readFileSync(new URL('../../src/lib/supabaseConfig.ts', import.meta.url), 'utf8');
const SUPABASE_URL = /SUPABASE_URL\s*=\s*'([^']+)'/.exec(cfg)?.[1];
const SUPABASE_KEY = /SUPABASE_PUBLISHABLE_KEY\s*=\s*'([^']+)'/.exec(cfg)?.[1];
if (!SUPABASE_URL || !SUPABASE_KEY || !SUPABASE_KEY.startsWith('sb_publishable_')) {
  throw new Error('supabaseConfig.ts から公開キーを読めない');
}

// ---------- 正確な座標（A のもの）。ほかの人に届く応答の中にこの文字列が1つでも出たら漏れ ----------
const HOME = { lat: 35.712123, lng: 139.701234 }; // A の自宅
const NEAR = { lat: 35.714567, lng: 139.703456 }; // 自宅から約330m（ほかの人には null で出るはず）
const T_PUB_FAR = { lat: 35.658581, lng: 139.745433 };
const T_GRP_PT = { lat: 35.001234, lng: 135.001234 };
const T_PRIV_PT = { lat: 36.123456, lng: 138.123456 };
const P_PUB_PT = { lat: 34.987654, lng: 135.759876 };
const P_GRP_PT = { lat: 33.591234, lng: 130.421987 };
const P_PRIV_PT = { lat: 43.062345, lng: 141.353678 };
const EXACT_STRINGS = [HOME, NEAR, T_PUB_FAR, T_GRP_PT, T_PRIV_PT, P_PUB_PT, P_GRP_PT, P_PRIV_PT].flatMap((p) => [
  String(p.lat),
  String(p.lng),
]);

// 小さな JPEG（中身は確かめられない前提。バケットは宣言された Content-Type で受け付ける）
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xd9]);
const jpeg = () => new Blob([JPEG], { type: 'image/jpeg' });

// ---------- 人ごとのクライアント。届いた応答の本文を全部とっておく（漏れの検索用） ----------
const seen = { A: [], B: [], C: [], D: [], anon: [] };
function client(who) {
  return createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        const res = await fetch(input, init);
        try {
          seen[who].push(await res.clone().text());
        } catch {
          // 本文が読めない応答（バイナリ等）は数えない
        }
        return res;
      },
    },
  });
}

const U = { A: null, B: null, C: null, D: null };
const anon = client('anon');
let A, B, C, D; // { c, id }（D＝依頼16の上限の確認だけに使う）
const ids = {}; // 作った行の id

async function signIn(who) {
  const c = client(who);
  const { data, error } = await c.auth.signInAnonymously();
  if (error) throw new Error(`${who} の匿名ログインに失敗: ${error.message}`);
  return { c, id: data.user.id };
}

function must({ data, error }, what) {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
}

// ---------- 結果の表 ----------
const rows = [];
function check(no, name, expected, fn) {
  test(`${no} ${name}`, async () => {
    try {
      const note = await fn();
      rows.push({ no, name, expected, result: 'OK' + (note ? `（${note}）` : '') });
    } catch (e) {
      rows.push({ no, name, expected, result: 'NG: ' + (e?.message ?? String(e)).split('\n')[0] });
      throw e;
    }
  });
}
// 止まるはず：error が返る、または対象が0行
async function denied(p, label = '') {
  const { data, error } = await p;
  if (error) return `止まった: ${error.code ?? ''} ${error.message}`.trim();
  if (Array.isArray(data) && data.length === 0) return '0行';
  if (data === null) return 'null';
  throw new Error(`${label}通ってしまった: ${JSON.stringify(data).slice(0, 200)}`);
}
async function mustError(p, label = '') {
  const { data, error } = await p;
  if (error) return `止まった: ${error.code ?? error.statusCode ?? ''} ${error.message}`.trim();
  throw new Error(`${label}エラーにならなかった: ${JSON.stringify(data).slice(0, 200)}`);
}
const idsOf = (data) => new Set((data ?? []).map((r) => r.id));

// ======================================================================
// 準備
// ======================================================================
before(async () => {
  A = await signIn('A');
  B = await signIn('B');
  C = await signIn('C');
  D = await signIn('D');
  U.A = A.id;
  U.B = B.id;
  U.C = C.id;
  U.D = D.id;

  // A：自宅
  must(await A.c.from('profiles_private').insert({ id: A.id, home_lat: HOME.lat, home_lng: HOME.lng }), 'A 自宅');

  // A：写真4枚（全体の投稿／グループの投稿／自分だけの投稿／全体の旅行のスポット）
  for (const n of ['p-pub', 'p-grp', 'p-priv', 't-pub']) {
    must(await A.c.storage.from('photos').upload(`${A.id}/${n}.jpg`, jpeg(), { contentType: 'image/jpeg' }), `A 写真 ${n}`);
  }

  // A：グループ G を作る → B が招待コードで入る
  ids.G = must(await A.c.rpc('create_group', { p_name: 'RLSテスト', p_color: '#336699', p_display_name: 'Aさん' }), 'create_group');
  const inv = must(await A.c.from('group_invites').select('code').eq('group_id', ids.G).single(), '招待コード');
  ids.code1 = inv.code;
  const joined = must(await B.c.rpc('join_group', { p_code: ids.code1, p_display_name: 'Bさん' }), 'join_group');
  assert.equal(joined, ids.G);

  // A：旅行4件
  const trip = async (title, visibility, spots) =>
    must(await A.c.from('trips').insert({ title, visibility, spots }).select('id').single(), `trip ${title}`).id;
  ids.T_pub = await trip('A全体', 'public', [
    { id: 's1', name: '遠い所', memo: '', lat: T_PUB_FAR.lat, lng: T_PUB_FAR.lng, photoId: `${A.id}/t-pub.jpg`, moveTo: 'walk' },
    { id: 's2', name: '家の近く', memo: '', lat: NEAR.lat, lng: NEAR.lng, photoId: null },
  ]);
  ids.T_grp = await trip('Aグループ', 'groups', [{ id: 's1', name: 'g', memo: '', lat: T_GRP_PT.lat, lng: T_GRP_PT.lng, photoId: null }]);
  ids.T_priv = await trip('A自分だけ', 'private', [{ id: 's1', name: 'p', memo: '', lat: T_PRIV_PT.lat, lng: T_PRIV_PT.lng, photoId: null }]);
  must(await A.c.from('trip_groups').insert({ trip_id: ids.T_grp, group_id: ids.G }), 'trip_groups T_grp');
  // 自分だけの旅行をグループに付けても、見せる先が「自分だけ」なら B には見えないはず
  must(await A.c.from('trip_groups').insert({ trip_id: ids.T_priv, group_id: ids.G }), 'trip_groups T_priv');

  // A：投稿3件
  const post = async (title, visibility, pt, photo) =>
    must(
      await A.c
        .from('posts')
        .insert({ title, visibility, lat: pt.lat, lng: pt.lng, photo_path: `${A.id}/${photo}.jpg` })
        .select('id')
        .single(),
      `post ${title}`,
    ).id;
  ids.P_pub = await post('A全体投稿', 'public', P_PUB_PT, 'p-pub');
  ids.P_grp = await post('Aグループ投稿', 'groups', P_GRP_PT, 'p-grp');
  ids.P_priv = await post('A自分だけ投稿', 'private', P_PRIV_PT, 'p-priv');
  must(await A.c.from('post_groups').insert({ post_id: ids.P_grp, group_id: ids.G }), 'post_groups P_grp');

  // B：グループに見せる投稿1件（B が抜けた後も残るか）・自分だけの旅行1件
  ids.P_B = must(
    await B.c.from('posts').insert({ title: 'Bグループ投稿', visibility: 'groups', lat: 35.1, lng: 135.1 }).select('id').single(),
    'post B',
  ).id;
  must(await B.c.from('post_groups').insert({ post_id: ids.P_B, group_id: ids.G }), 'post_groups P_B');
  ids.T_B = must(await B.c.from('trips').insert({ title: 'B自分だけ', visibility: 'private' }).select('id').single(), 'trip B').id;

  // C：全体の旅行1件・自分のグループ GC・自分の写真1枚
  ids.T_C = must(await C.c.from('trips').insert({ title: 'C全体', visibility: 'public' }).select('id').single(), 'trip C').id;
  ids.GC = must(await C.c.rpc('create_group', { p_name: 'Cの会', p_color: '#aa0000' }), 'create_group C');
  must(await C.c.storage.from('photos').upload(`${C.id}/c.jpg`, jpeg(), { contentType: 'image/jpeg' }), 'C 写真');
});

// ======================================================================
// 1. 読む（trips / posts）
// ======================================================================
check('R01', 'trips：anon は全体だけ読める', '全体○・グループ×・自分だけ×', async () => {
  const s = idsOf(must(await anon.from('trips').select('id').in('id', [ids.T_pub, ids.T_grp, ids.T_priv]), 'select'));
  assert.ok(s.has(ids.T_pub), '全体が見えない');
  assert.ok(!s.has(ids.T_grp), 'グループが見える');
  assert.ok(!s.has(ids.T_priv), '自分だけが見える');
});
check('R02', 'trips：C（無関係）は全体だけ', '全体○・グループ×・自分だけ×', async () => {
  const s = idsOf(must(await C.c.from('trips').select('id').in('id', [ids.T_pub, ids.T_grp, ids.T_priv]), 'select'));
  assert.deepEqual([s.has(ids.T_pub), s.has(ids.T_grp), s.has(ids.T_priv)], [true, false, false]);
});
check('R03', 'trips：B（同じグループ）は全体＋グループ', '全体○・グループ○・自分だけ×（グループに付けてあっても）', async () => {
  const s = idsOf(must(await B.c.from('trips').select('id').in('id', [ids.T_pub, ids.T_grp, ids.T_priv]), 'select'));
  assert.deepEqual([s.has(ids.T_pub), s.has(ids.T_grp), s.has(ids.T_priv)], [true, true, false]);
});
check('R04', 'trips：A（持ち主）は全部', '3件とも○', async () => {
  const s = idsOf(must(await A.c.from('trips').select('id').in('id', [ids.T_pub, ids.T_grp, ids.T_priv]), 'select'));
  assert.equal(s.size, 3);
});
check('R05', 'posts：anon / C / B / A の見え方', 'anon・C＝全体のみ／B＝全体＋グループ／A＝全部', async () => {
  const q = (c) => c.from('posts').select('id').in('id', [ids.P_pub, ids.P_grp, ids.P_priv]);
  const v = async (c) => {
    const s = idsOf(must(await q(c), 'select'));
    return [s.has(ids.P_pub), s.has(ids.P_grp), s.has(ids.P_priv)];
  };
  assert.deepEqual(await v(anon), [true, false, false], 'anon');
  assert.deepEqual(await v(C.c), [true, false, false], 'C');
  assert.deepEqual(await v(B.c), [true, true, false], 'B');
  assert.deepEqual(await v(A.c), [true, true, true], 'A');
});
check('R06', 'posts：絞り込みなしの一覧でも C に自分だけ・グループが混ざらない', 'A の行は全体の1件だけ', async () => {
  const d = must(await C.c.from('posts').select('id,owner').eq('owner', A.id), 'select');
  assert.deepEqual(d.map((r) => r.id), [ids.P_pub]);
});
check('R07', 'favorites：他人のお気に入りは読めない', 'B から C のお気に入り0行・anon は権限なし', async () => {
  must(await C.c.from('favorites').insert({ trip_id: ids.T_pub }), 'C お気に入り');
  const d = must(await B.c.from('favorites').select('*').eq('user_id', C.id), 'select');
  assert.equal(d.length, 0, 'B に見えた');
  const r = await anon.from('favorites').select('*');
  assert.ok(r.error || r.data.length === 0, 'anon に見えた');
  return `anon: ${r.error ? r.error.code : r.data.length + '行'}`;
});
check('R08', 'profiles：読めるのは id と display_name だけ（依頼16で列の権限に変えた）', 'id・表示名は読める／created_at・name_asked・is_sample・* は止まる', async () => {
  const d = must(await anon.from('profiles').select('id,display_name').limit(1000), 'select');
  assert.ok(d.some((r) => r.id === A.id));
  const notes = [];
  for (const [n, c] of [['anon', anon], ['C', C.c]]) {
    for (const col of ['created_at', 'name_asked', 'is_sample', '*']) {
      notes.push(`${n}.${col}:` + (await mustError(c.from('profiles').select(col).eq('id', A.id), `${n} ${col} `)).split(' ')[1]);
    }
  }
  return `id・表示名 ${d.length} 行 / ` + notes.join(' ');
});

// ======================================================================
// 2. 正確な座標・自宅（依頼13）
// ======================================================================
check('X01', 'trip_exact：A 以外は A の行を読めない', 'anon・B・C とも0行／A は正確な値', async () => {
  for (const [n, c] of [['anon', anon], ['B', B.c], ['C', C.c]]) {
    const d = must(await c.from('trip_exact').select('*').eq('owner', A.id), n);
    assert.equal(d.length, 0, `${n} に見えた`);
  }
  const mine = must(await A.c.from('trip_exact').select('spots').eq('trip_id', ids.T_pub).single(), 'A');
  assert.equal(mine.spots[0].lat, T_PUB_FAR.lat);
});
check('X02', 'post_exact：A 以外は A の行を読めない', 'anon・B・C とも0行', async () => {
  for (const [n, c] of [['anon', anon], ['B', B.c], ['C', C.c]]) {
    const d = must(await c.from('post_exact').select('*').eq('owner', A.id), n);
    assert.equal(d.length, 0, `${n} に見えた`);
  }
});
check('X03', '埋め込み（trips→trip_exact）でも正確な値が出ない', 'C の応答の trip_exact は空', async () => {
  const d = must(await C.c.from('trips').select('id,spots,trip_exact(spots)').eq('id', ids.T_pub).single(), 'select');
  const e = d.trip_exact;
  assert.ok(e === null || (Array.isArray(e) && e.length === 0), `出た: ${JSON.stringify(e)}`);
});
check('X04', '全体の旅行：ほかの人にはぼかした点・自宅の近くは null', '遠い点は約300m以内にずれる／近い点は lat,lng=null', async () => {
  const d = must(await anon.from('trips').select('spots').eq('id', ids.T_pub).single(), 'select');
  const [s1, s2] = d.spots;
  assert.notEqual(s1.lat, T_PUB_FAR.lat);
  assert.ok(Math.abs(s1.lat - T_PUB_FAR.lat) < 0.003 && Math.abs(s1.lng - T_PUB_FAR.lng) < 0.004, 'ずれが大きすぎる');
  assert.equal(s2.lat, null);
  assert.equal(s2.lng, null);
  return `${s1.lat},${s1.lng}`;
});
check('X05', '全体の投稿：ほかの人にはぼかした点', 'lat,lng が正確な値と違う', async () => {
  const d = must(await C.c.from('posts').select('lat,lng').eq('id', ids.P_pub).single(), 'select');
  assert.notEqual(d.lat, P_PUB_PT.lat);
  assert.notEqual(d.lng, P_PUB_PT.lng);
});
check('X06', 'グループの旅行・投稿：B にもぼかした値', 'B に正確な値が出ない', async () => {
  const t = must(await B.c.from('trips').select('spots').eq('id', ids.T_grp).single(), 'trip');
  assert.notEqual(t.spots[0].lat, T_GRP_PT.lat);
  const p = must(await B.c.from('posts').select('lat,lng').eq('id', ids.P_grp).single(), 'post');
  assert.notEqual(p.lat, P_GRP_PT.lat);
});
check('X07', 'profiles_private（自宅）：他人は読めない', 'anon・B・C とも0行（または権限なし）', async () => {
  for (const [n, c] of [['anon', anon], ['B', B.c], ['C', C.c]]) {
    const r = await c.from('profiles_private').select('*').eq('id', A.id);
    assert.ok(r.error || r.data.length === 0, `${n} に見えた`);
  }
});
check('X08', 'profiles_private：他人の id で作る・変える・upsert', 'すべて止まる。A の自宅は変わらない', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('profiles_private').insert({ id: A.id, home_lat: 0, home_lng: 0 }), 'insert '));
  notes.push(await denied(C.c.from('profiles_private').update({ home_lat: 1, home_lng: 1 }).eq('id', A.id).select(), 'update '));
  notes.push(await mustError(C.c.from('profiles_private').upsert({ id: A.id, home_lat: 2, home_lng: 2 }), 'upsert '));
  // 自分の行の id を A に書き換える
  must(await C.c.from('profiles_private').insert({ id: C.id }), 'C 自分の行');
  notes.push(await mustError(C.c.from('profiles_private').update({ id: A.id }).eq('id', C.id).select(), 'id 書き換え '));
  const h = must(await A.c.from('profiles_private').select('home_lat,home_lng').eq('id', A.id).single(), 'A');
  assert.deepEqual([h.home_lat, h.home_lng], [HOME.lat, HOME.lng]);
  return notes.join(' / ');
});
check('X09', 'near_home：他人の自宅の当て推量に使えない', 'C が A の自宅の座標を聞いても false', async () => {
  const d = must(await C.c.rpc('near_home', { p_points: [HOME, NEAR] }), 'rpc');
  assert.deepEqual(d, [false, false]);
  const a = must(await A.c.rpc('near_home', { p_points: [HOME] }), 'A');
  assert.deepEqual(a, [true], 'A 自身で true にならない（前提が崩れている）');
});
check('X10', 'near_home：anon は呼べない／配列以外は空', 'anon＝エラー／文字列・null・オブジェクト＝[]', async () => {
  const n = await mustError(anon.rpc('near_home', { p_points: [HOME] }), 'anon ');
  for (const v of ['abc', null, { lat: 1 }, 12]) {
    const d = must(await C.c.rpc('near_home', { p_points: v }), `p_points=${JSON.stringify(v)}`);
    assert.deepEqual(d, []);
  }
  return n;
});

// ======================================================================
// 3. 作る・変える・消す（trips / posts / favorites / profiles）
// ======================================================================
check('W01', 'trips：owner を他人にして insert', '止まる', async () => mustError(C.c.from('trips').insert({ title: 'x', owner: A.id })));
check('W02', 'posts：owner を他人にして insert', '止まる', async () =>
  mustError(C.c.from('posts').insert({ title: 'x', owner: A.id, lat: 1, lng: 1 })),
);
check('W03', 'trips：他人の行を update（題名・owner を自分に・visibility）', 'どれも0行。A の行は変わらない', async () => {
  const notes = [];
  notes.push(await denied(C.c.from('trips').update({ title: '乗っ取り' }).eq('id', ids.T_pub).select()));
  notes.push(await denied(C.c.from('trips').update({ owner: C.id }).eq('id', ids.T_pub).select()));
  notes.push(await denied(C.c.from('trips').update({ visibility: 'public' }).eq('id', ids.T_priv).select()));
  notes.push(await denied(B.c.from('trips').update({ title: 'B書換' }).eq('id', ids.T_grp).select()));
  const d = must(await A.c.from('trips').select('id,title,owner,visibility').in('id', [ids.T_pub, ids.T_priv, ids.T_grp]), 'A');
  const m = Object.fromEntries(d.map((r) => [r.id, r]));
  assert.equal(m[ids.T_pub].title, 'A全体');
  assert.equal(m[ids.T_pub].owner, A.id);
  assert.equal(m[ids.T_priv].visibility, 'private');
  assert.equal(m[ids.T_grp].title, 'Aグループ');
  const a = must(await anon.from('trips').select('id').eq('id', ids.T_priv), 'anon');
  assert.equal(a.length, 0);
  return notes.join(' / ');
});
check('W04', 'posts：他人の行を update（題名・owner・visibility・photo_path）', 'どれも0行', async () => {
  const notes = [];
  notes.push(await denied(C.c.from('posts').update({ title: '乗っ取り' }).eq('id', ids.P_pub).select()));
  notes.push(await denied(C.c.from('posts').update({ owner: C.id }).eq('id', ids.P_pub).select()));
  notes.push(await denied(C.c.from('posts').update({ visibility: 'public' }).eq('id', ids.P_priv).select()));
  notes.push(await denied(B.c.from('posts').update({ photo_path: null }).eq('id', ids.P_grp).select()));
  const d = must(await A.c.from('posts').select('title,visibility,photo_path').eq('id', ids.P_priv).single(), 'A');
  assert.equal(d.visibility, 'private');
  return notes.join(' / ');
});
check('W05', '自分の行の owner を他人に update', '止まる（他人に押し付けられない）', async () =>
  mustError(C.c.from('trips').update({ owner: A.id }).eq('id', ids.T_C).select()),
);
check('W06', 'trips/posts：他人の行を delete', '0行。A の行は残る', async () => {
  const notes = [];
  notes.push(await denied(C.c.from('trips').delete().eq('id', ids.T_pub).select()));
  notes.push(await denied(B.c.from('trips').delete().eq('id', ids.T_grp).select()));
  notes.push(await denied(C.c.from('posts').delete().eq('id', ids.P_pub).select()));
  notes.push(await denied(anon.from('trips').delete().eq('id', ids.T_pub).select()));
  const d = must(await A.c.from('trips').select('id').in('id', [ids.T_pub, ids.T_grp]), 'A');
  assert.equal(d.length, 2);
  return notes.join(' / ');
});
check('W07', 'trips/posts：他人の id で upsert（insert のふりをした上書き）', '止まる。A の行と正確な座標は変わらない', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('trips').upsert({ id: ids.T_pub, title: '乗っ取り', spots: [{ lat: 1, lng: 1 }] })));
  notes.push(await mustError(C.c.from('posts').upsert({ id: ids.P_pub, title: '乗っ取り', lat: 1, lng: 1 })));
  // 他人の行と同じ id で insert（trigger が先に *_exact を書く作りなので、正確な座標が壊れないか）
  notes.push(await mustError(C.c.from('trips').insert({ id: ids.T_priv, title: 'x', spots: [{ lat: 2, lng: 2 }] })));
  notes.push(await mustError(C.c.from('posts').insert({ id: ids.P_priv, title: 'x', lat: 2, lng: 2 })));
  const t = must(await A.c.from('trip_exact').select('owner,spots').eq('trip_id', ids.T_priv).single(), 'A trip_exact');
  assert.equal(t.owner, A.id);
  assert.equal(t.spots[0].lat, T_PRIV_PT.lat);
  const p = must(await A.c.from('post_exact').select('owner,lat').eq('post_id', ids.P_priv).single(), 'A post_exact');
  assert.equal(p.lat, P_PRIV_PT.lat);
  const tt = must(await A.c.from('trips').select('title').eq('id', ids.T_pub).single(), 'A trips');
  assert.equal(tt.title, 'A全体');
  return notes.join(' / ');
});
check('W08', '見本（is_sample）：作る・変える・消す', 'どれも止まる', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('trips').insert({ title: 'x', is_sample: true })));
  notes.push(await mustError(C.c.from('trips').update({ is_sample: true }).eq('id', ids.T_C).select()));
  notes.push(await denied(C.c.from('trips').update({ title: 'x' }).eq('id', '00000000-0000-4000-8000-000000000101').select()));
  notes.push(await denied(C.c.from('posts').delete().eq('id', '00000000-0000-4000-8000-000000000201').select()));
  return notes.join(' / ');
});
check('W09', 'anon（未ログイン）は書けない', 'insert / update / rpc すべて止まる', async () => {
  const notes = [];
  notes.push(await mustError(anon.from('trips').insert({ title: 'x' })));
  notes.push(await mustError(anon.from('posts').insert({ title: 'x', lat: 1, lng: 1 })));
  notes.push(await mustError(anon.from('favorites').insert({ trip_id: ids.T_pub })));
  notes.push(await denied(anon.from('trips').update({ title: 'x' }).eq('id', ids.T_pub).select()));
  notes.push(await mustError(anon.from('profiles').update({ display_name: 'x' }).eq('id', A.id).select()));
  return notes.join(' / ');
});
check('W10', 'favorites：見えない旅行に付ける・他人の名前で付ける・他人のを消す', 'どれも止まる', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('favorites').insert({ trip_id: ids.T_priv })));
  notes.push(await mustError(C.c.from('favorites').insert({ post_id: ids.P_grp })));
  notes.push(await mustError(C.c.from('favorites').insert({ user_id: B.id, trip_id: ids.T_pub })));
  notes.push(await denied(B.c.from('favorites').delete().eq('user_id', C.id).select()));
  return notes.join(' / ');
});
check('W11', 'profiles：他人の表示名・自分の is_sample・新規行', 'どれも止まる', async () => {
  const notes = [];
  notes.push(await denied(C.c.from('profiles').update({ display_name: '乗っ取り' }).eq('id', A.id).select()));
  notes.push(await mustError(C.c.from('profiles').update({ is_sample: true }).eq('id', C.id).select()));
  notes.push(await mustError(C.c.from('profiles').update({ name_asked: true }).eq('id', C.id).select()));
  notes.push(await mustError(C.c.from('profiles').insert({ id: crypto.randomUUID(), display_name: 'x' })));
  notes.push(await mustError(C.c.from('profiles').update({ display_name: 'あ'.repeat(31) }).eq('id', C.id).select()));
  notes.push(await denied(C.c.from('profiles').delete().eq('id', A.id).select()));
  const a = must(await anon.from('profiles').select('display_name').eq('id', A.id).single(), 'A');
  assert.equal(a.display_name, 'Aさん');
  return notes.join(' / ');
});
check('W12', '長すぎる文字列（題名201字・表示名31字）', '止まる', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('trips').insert({ title: 'あ'.repeat(201) })));
  notes.push(await mustError(C.c.from('posts').insert({ title: 'あ'.repeat(201), lat: 1, lng: 1 })));
  return notes.join(' / ');
});

// ======================================================================
// 4. グループ（groups / group_members / group_invites / trip_groups / post_groups）
// ======================================================================
check('G01', '招待コード：C・anon は読めない／B は読める', 'C＝0行・anon＝止まる・B＝1行', async () => {
  const c = must(await C.c.from('group_invites').select('*').eq('group_id', ids.G), 'C');
  assert.equal(c.length, 0, 'C に見えた');
  const c2 = must(await C.c.from('group_invites').select('*'), 'C 全件');
  assert.ok(c2.every((r) => r.group_id === ids.GC), 'C に他のグループのコードが見えた');
  const a = await anon.from('group_invites').select('*');
  assert.ok(a.error || a.data.length === 0, 'anon に見えた');
  const b = must(await B.c.from('group_invites').select('code').eq('group_id', ids.G), 'B');
  assert.equal(b.length, 1);
  return `anon: ${a.error ? a.error.code : a.data.length + '行'}`;
});
check('G02', 'メンバー一覧・グループ：C・anon は読めない', 'C＝0行・anon＝止まる', async () => {
  assert.equal(must(await C.c.from('group_members').select('*').eq('group_id', ids.G), 'C').length, 0);
  assert.equal(must(await C.c.from('groups').select('*').eq('id', ids.G), 'C').length, 0);
  assert.equal(must(await C.c.from('trip_groups').select('*').eq('group_id', ids.G), 'C').length, 0);
  assert.equal(must(await C.c.from('post_groups').select('*').eq('group_id', ids.G), 'C').length, 0);
  const a = await anon.from('group_members').select('*');
  assert.ok(a.error || a.data.length === 0, 'anon に見えた');
  const b = must(await B.c.from('group_members').select('user_id').eq('group_id', ids.G), 'B');
  assert.equal(b.length, 2);
});
check('G03', 'グループの表に直接書く（作る・入る・コードを変える・持ち主を変える）', 'どれも止まる', async () => {
  const notes = [];
  notes.push(await mustError(C.c.from('groups').insert({ name: 'x', color: '#000000', owner: C.id })));
  notes.push(await mustError(C.c.from('group_members').insert({ group_id: ids.G, user_id: C.id })));
  notes.push(await mustError(C.c.from('group_invites').update({ code: 'x'.repeat(24) }).eq('group_id', ids.G).select()));
  notes.push(await mustError(B.c.from('groups').update({ owner: B.id }).eq('id', ids.G).select()));
  notes.push(await mustError(B.c.from('group_members').update({ role: 'owner' }).eq('group_id', ids.G).select()));
  return notes.join(' / ');
});
check('G04', 'グループを消す・人を追い出す', 'C・B は消せない／B は A を外せない／A（作った人）は抜けられない', async () => {
  const notes = [];
  notes.push(await denied(C.c.from('groups').delete().eq('id', ids.G).select()));
  notes.push(await denied(B.c.from('groups').delete().eq('id', ids.G).select()));
  notes.push(await denied(B.c.from('group_members').delete().eq('group_id', ids.G).eq('user_id', A.id).select()));
  notes.push(await denied(C.c.from('group_members').delete().eq('group_id', ids.G).eq('user_id', B.id).select()));
  notes.push(await denied(A.c.from('group_members').delete().eq('group_id', ids.G).eq('user_id', A.id).select()));
  const m = must(await A.c.from('group_members').select('user_id').eq('group_id', ids.G), 'A');
  assert.equal(m.length, 2);
  return notes.join(' / ');
});
check('G05', '共有先（trip_groups / post_groups）を他人が付ける・外す', 'どれも止まる', async () => {
  const notes = [];
  // C が自分の旅行を、入っていないグループ G に付ける
  notes.push(await mustError(C.c.from('trip_groups').insert({ trip_id: ids.T_C, group_id: ids.G })));
  // C が A の旅行を、自分のグループ GC に付ける
  notes.push(await mustError(C.c.from('trip_groups').insert({ trip_id: ids.T_priv, group_id: ids.GC })));
  // B（メンバー）が A の旅行を G に付ける
  notes.push(await mustError(B.c.from('trip_groups').insert({ trip_id: ids.T_pub, group_id: ids.G })));
  notes.push(await mustError(B.c.from('post_groups').insert({ post_id: ids.P_priv, group_id: ids.G })));
  // B が A の共有を外す
  notes.push(await denied(B.c.from('trip_groups').delete().eq('trip_id', ids.T_grp).select()));
  notes.push(await denied(B.c.from('post_groups').delete().eq('post_id', ids.P_grp).select()));
  const t = must(await A.c.from('trip_groups').select('trip_id').eq('trip_id', ids.T_grp), 'A');
  assert.equal(t.length, 1);
  return notes.join(' / ');
});

// ======================================================================
// 5. 関数（security definer）を想定外の引数で
// ======================================================================
check('F01', 'anon は関数を呼べない', 'create_group / join_group / peek_invite / regenerate_invite / delete_my_data すべて止まる', async () => {
  const notes = [];
  notes.push(await mustError(anon.rpc('create_group', { p_name: 'x', p_color: '#000000' })));
  notes.push(await mustError(anon.rpc('join_group', { p_code: ids.code1 })));
  notes.push(await mustError(anon.rpc('peek_invite', { p_code: ids.code1 })));
  notes.push(await mustError(anon.rpc('regenerate_invite', { p_group: ids.G })));
  notes.push(await mustError(anon.rpc('delete_my_data')));
  return notes.join(' / ');
});
check('F02', 'peek_invite：空・短い・他人のID・長すぎる文字列', 'どれも0行（何も分からない）', async () => {
  for (const v of ['', null, 'abc', ids.G, A.id, 'x'.repeat(23), 'x'.repeat(100000), `${ids.code1}x`, ids.code1.slice(0, 20), "' or 1=1 --"]) {
    const d = must(await C.c.rpc('peek_invite', { p_code: v }), `p_code=${String(v).slice(0, 20)}`);
    assert.equal(d.length, 0, `p_code=${String(v).slice(0, 30)} で出た`);
  }
});
check('F03', 'join_group：空・短い・他人のID・長すぎる文字列', 'どれも null（入れない）', async () => {
  for (const v of ['', null, 'abc', ids.G, A.id, 'x'.repeat(100000), ids.code1.slice(0, 20), '%', "' or 1=1 --"]) {
    const d = must(await C.c.rpc('join_group', { p_code: v }), `p_code=${String(v).slice(0, 20)}`);
    assert.equal(d, null, `p_code=${String(v).slice(0, 30)} で入れた`);
  }
  assert.equal(must(await C.c.from('groups').select('id').eq('id', ids.G), 'C').length, 0);
});
check('F04', 'regenerate_invite：メンバー・他人・空・存在しない id', 'どれも止まる', async () => {
  const notes = [];
  notes.push(await mustError(B.c.rpc('regenerate_invite', { p_group: ids.G })));
  notes.push(await mustError(C.c.rpc('regenerate_invite', { p_group: ids.G })));
  notes.push(await mustError(C.c.rpc('regenerate_invite', { p_group: null })));
  notes.push(await mustError(C.c.rpc('regenerate_invite', { p_group: crypto.randomUUID() })));
  notes.push(await mustError(C.c.rpc('regenerate_invite', { p_group: 'not-a-uuid' })));
  const b = must(await B.c.from('group_invites').select('code').eq('group_id', ids.G).single(), 'B');
  assert.equal(b.code, ids.code1, 'コードが変わった');
  return notes.join(' / ');
});
check('F05', 'create_group：空・長すぎ・色の形式違い・長すぎる表示名', '名前・色の不正は止まる／表示名は無視される', async () => {
  const notes = [];
  notes.push(await mustError(C.c.rpc('create_group', { p_name: '', p_color: '#000000' })));
  notes.push(await mustError(C.c.rpc('create_group', { p_name: '   ', p_color: '#000000' })));
  notes.push(await mustError(C.c.rpc('create_group', { p_name: 'あ'.repeat(31), p_color: '#000000' })));
  notes.push(await mustError(C.c.rpc('create_group', { p_name: 'x', p_color: 'red' })));
  notes.push(await mustError(C.c.rpc('create_group', { p_name: 'x', p_color: null })));
  notes.push(await mustError(C.c.rpc('create_group', { p_name: null, p_color: '#000000' })));
  const g = must(await C.c.rpc('create_group', { p_name: '名前長', p_color: '#000000', p_display_name: 'x'.repeat(100000) }), '表示名長');
  const p = must(await C.c.from('profiles').select('display_name').eq('id', C.id).single(), 'C');
  assert.notEqual(p.display_name.length, 100000);
  must(await C.c.from('groups').delete().eq('id', g).select(), '片付け');
  return notes.join(' / ');
});
check('F06', 'private schema の関数・ほかの関数を API から呼ぶ', 'can_see / is_member / blur_point / rls_auto_enable すべて止まる', async () => {
  const notes = [];
  notes.push(await mustError(C.c.schema('private').rpc('can_see', { p_owner: A.id, p_visibility: 'private' })));
  notes.push(await mustError(C.c.schema('private').rpc('is_member', { p_group: ids.G })));
  notes.push(await mustError(C.c.schema('private').rpc('blur_point', { p_owner: A.id, p_lat: 1, p_lng: 1 })));
  notes.push(await mustError(C.c.rpc('rls_auto_enable')));
  notes.push(await mustError(anon.rpc('rls_auto_enable')));
  notes.push(await mustError(C.c.schema('auth').from('users').select('*')));
  return notes.join(' / ');
});
check('F07', 'delete_my_data：写真が残っていると何も消さない', 'C は写真が残っているのでエラー・C の旅行は残る', async () => {
  const n = await mustError(C.c.rpc('delete_my_data'));
  const d = must(await C.c.from('trips').select('id').eq('id', ids.T_C), 'C');
  assert.equal(d.length, 1);
  return n;
});

// ======================================================================
// 6. Storage（photos）
// ======================================================================
const bucket = (c) => c.storage.from('photos');
check('S01', '他人のフォルダに置く・上書きする', 'どれも止まる。A の写真は残る', async () => {
  const notes = [];
  notes.push(await mustError(bucket(C.c).upload(`${A.id}/evil.jpg`, jpeg(), { contentType: 'image/jpeg' })));
  notes.push(await mustError(bucket(C.c).upload(`${A.id}/p-pub.jpg`, jpeg(), { contentType: 'image/jpeg', upsert: true })));
  notes.push(await mustError(bucket(B.c).update(`${A.id}/p-grp.jpg`, jpeg(), { contentType: 'image/jpeg' })));
  notes.push(await mustError(bucket(anon).upload(`${A.id}/evil2.jpg`, jpeg(), { contentType: 'image/jpeg' })));
  notes.push(await mustError(bucket(C.c).upload(`sample/evil.jpg`, jpeg(), { contentType: 'image/jpeg' })));
  notes.push(await mustError(bucket(C.c).upload(`evil.jpg`, jpeg(), { contentType: 'image/jpeg' })));
  return notes.join(' / ');
});
check('S02', '自分の写真の上書き（upsert）', '止まる（仕様：置き直しは新しいパス）', async () =>
  mustError(bucket(A.c).upload(`${A.id}/p-pub.jpg`, jpeg(), { contentType: 'image/jpeg', upsert: true })),
);
check('S03', '署名付きURL：自分だけ・グループの写真', 'C・anon は作れない／B はグループのものだけ作れる', async () => {
  const notes = [];
  for (const [n, c] of [['C', C.c], ['anon', anon]]) {
    notes.push(n + ':' + (await mustError(bucket(c).createSignedUrl(`${A.id}/p-priv.jpg`, 60))));
    notes.push(n + ':' + (await mustError(bucket(c).createSignedUrl(`${A.id}/p-grp.jpg`, 60))));
  }
  notes.push('B:' + (await mustError(bucket(B.c).createSignedUrl(`${A.id}/p-priv.jpg`, 60))));
  must(await bucket(B.c).createSignedUrl(`${A.id}/p-grp.jpg`, 60), 'B グループの写真');
  // まとめて作る API でも同じ
  const many = await bucket(C.c).createSignedUrls([`${A.id}/p-priv.jpg`, `${A.id}/p-grp.jpg`], 60);
  if (!many.error) {
    assert.ok(many.data.every((x) => x.error || !x.signedUrl), `まとめて作れた: ${JSON.stringify(many.data)}`);
  }
  return notes.join(' / ');
});
check('S04', '署名付きURL：全体の投稿・全体の旅行の写真', 'C・anon とも作れる（仕様）', async () => {
  for (const c of [C.c, anon]) {
    must(await bucket(c).createSignedUrl(`${A.id}/p-pub.jpg`, 60), 'p-pub');
    must(await bucket(c).createSignedUrl(`${A.id}/t-pub.jpg`, 60), 't-pub');
  }
});
check('S05', 'ダウンロード：他人の自分だけの写真', 'C・anon とも止まる', async () => {
  const notes = [];
  notes.push(await mustError(bucket(C.c).download(`${A.id}/p-priv.jpg`)));
  notes.push(await mustError(bucket(anon).download(`${A.id}/p-priv.jpg`)));
  return notes.join(' / ');
});
check('S06', '一覧：他人のフォルダ', 'C・anon に自分だけ・グループの写真の名前が出ない', async () => {
  const notes = [];
  for (const [n, c] of [['C', C.c], ['anon', anon]]) {
    const { data, error } = await bucket(c).list(A.id, { limit: 100 });
    const names = error ? [] : data.map((x) => x.name);
    assert.ok(!names.includes('p-priv.jpg') && !names.includes('p-grp.jpg'), `${n} に見えた: ${names.join(',')}`);
    notes.push(`${n}: ${error ? '止まった' : names.join(',') || '0件'}`);
  }
  const top = await bucket(anon).list('', { limit: 1000 });
  notes.push(`anon の最上位: ${top.error ? '止まった' : top.data.length + '件'}`);
  return notes.join(' / ');
});
check('S07', '他人の写真を消す・動かす・写す', '消せない・動かせない・自分だけの写真は写せない', async () => {
  const notes = [];
  const rm = await bucket(C.c).remove([`${A.id}/p-pub.jpg`, `${A.id}/p-priv.jpg`]);
  assert.ok(rm.error || rm.data.length === 0, `消せた: ${JSON.stringify(rm.data)}`);
  notes.push(`remove: ${rm.error ? '止まった' : '0件'}`);
  notes.push('move:' + (await mustError(bucket(C.c).move(`${A.id}/p-pub.jpg`, `${C.id}/moved.jpg`))));
  notes.push('copy(priv):' + (await mustError(bucket(C.c).copy(`${A.id}/p-priv.jpg`, `${C.id}/copied.jpg`))));
  // 残っているか（A が自分で一覧）
  const own = must(await bucket(A.c).list(A.id, { limit: 100 }), 'A list').map((x) => x.name);
  for (const n of ['p-pub.jpg', 'p-grp.jpg', 'p-priv.jpg', 't-pub.jpg']) assert.ok(own.includes(n), `${n} が消えた`);
  return notes.join(' / ');
});
check('S08', '他人の写真のパスを自分の全体の投稿・旅行に書いて覗く', 'それでも署名付きURLは作れない', async () => {
  must(
    await C.c.from('posts').insert({ title: '覗き', visibility: 'public', lat: 1, lng: 1, photo_path: `${A.id}/p-priv.jpg` }),
    'C post',
  );
  must(
    await C.c
      .from('trips')
      .insert({ title: '覗き', visibility: 'public', spots: [{ id: 's1', name: 'x', lat: 1, lng: 1, photoId: `${A.id}/p-grp.jpg` }] }),
    'C trip',
  );
  const n1 = await mustError(bucket(C.c).createSignedUrl(`${A.id}/p-priv.jpg`, 60));
  const n2 = await mustError(bucket(anon).createSignedUrl(`${A.id}/p-grp.jpg`, 60));
  return `${n1} / ${n2}`;
});
check('S09', '形式違い（HTML）を置く', '止まる（JPEG だけ）', async () =>
  mustError(bucket(C.c).upload(`${C.id}/x.html`, new Blob(['<script>alert(1)</script>'], { type: 'text/html' }), { contentType: 'text/html' })),
);
check('S10', '中身が JPEG でないものを image/jpeg と名乗って置く', '記録のみ（中身は確かめない作り）', async () => {
  const r = await bucket(C.c).upload(`${C.id}/fake.jpg`, new Blob(['<html>not a jpeg</html>'], { type: 'image/jpeg' }), {
    contentType: 'image/jpeg',
  });
  if (!r.error) await bucket(C.c).remove([`${C.id}/fake.jpg`]);
  return r.error ? `止まった: ${r.error.message}` : '置けた（すぐ消した）';
});

// ======================================================================
// 7. グループを抜けた後
// ======================================================================
check('L01', 'B が抜ける → グループの中は見えない／B の投稿はグループに残る', '抜けた B＝グループ・コード・A のグループ旅行が見えない／A＝B の投稿が見える', async () => {
  const left = must(await B.c.from('group_members').delete().eq('group_id', ids.G).eq('user_id', B.id).select(), '抜ける');
  assert.equal(left.length, 1);
  assert.equal(must(await B.c.from('groups').select('id').eq('id', ids.G), 'B groups').length, 0);
  assert.equal(must(await B.c.from('group_invites').select('code').eq('group_id', ids.G), 'B invites').length, 0);
  assert.equal(must(await B.c.from('group_members').select('*').eq('group_id', ids.G), 'B members').length, 0);
  assert.equal(must(await B.c.from('trips').select('id').eq('id', ids.T_grp), 'B trips').length, 0);
  assert.equal(must(await B.c.from('posts').select('id').eq('id', ids.P_grp), 'B posts').length, 0);
  assert.equal(must(await A.c.from('posts').select('id').eq('id', ids.P_B), 'A sees B').length, 1, 'B の投稿が A に見えない');
  must(await B.c.from('post_groups').select('*').eq('post_id', ids.P_B), 'B 自分の共有');
});
check('L02', '招待リンクの作り直し → 古いコードで入れない', 'A が作り直した後、古いコードは B・C とも null', async () => {
  const code2 = must(await A.c.rpc('regenerate_invite', { p_group: ids.G }), 'regenerate');
  assert.notEqual(code2, ids.code1);
  assert.equal(must(await B.c.rpc('join_group', { p_code: ids.code1 }), 'B'), null);
  assert.equal(must(await C.c.rpc('peek_invite', { p_code: ids.code1 }), 'C').length, 0);
});

// ======================================================================
// 8. 正確な座標が、ほかの人の応答に1つも出ていないか（ここまでの全応答を検索）
// ======================================================================
check('X11', 'B・C・anon が受け取った応答の全文に、A の正確な座標・自宅が無い', '0か所', async () => {
  const hits = [];
  for (const who of ['B', 'C', 'anon']) {
    const all = seen[who].join('\n');
    for (const s of EXACT_STRINGS) if (all.includes(s)) hits.push(`${who}:${s}`);
  }
  assert.deepEqual(hits, []);
  return `応答 ${seen.B.length + seen.C.length + seen.anon.length} 件を検索`;
});

// ======================================================================
// 9. 大量に作る・大きな値（記録のみ。止める仕組みが無ければ報告）
// ======================================================================
check('M01', '1人で旅行100件を一度に（並列）', '記録のみ', async () => {
  const t0 = Date.now();
  const res = await Promise.all(
    Array.from({ length: 100 }, (_, i) => C.c.from('trips').insert({ title: `mass-${i}`, visibility: 'public' }).select('id')),
  );
  const ms = Date.now() - t0;
  const ok = res.filter((r) => !r.error).length;
  const errs = [...new Set(res.filter((r) => r.error).map((r) => `${r.error.code}:${r.error.message}`))];
  const del = must(await C.c.from('trips').delete().eq('owner', C.id).like('title', 'mass-%').select('id'), '片付け');
  return `${ok}/100 件成功・${ms}ms・エラー種類=${errs.length ? errs.join('|') : 'なし'}・片付け ${del.length} 件削除`;
});
check('M02', '大きな値（投稿のコメント100万字・スポット2000個）', '記録のみ', async () => {
  const r1 = await C.c.from('posts').insert({ title: 'big', lat: 1, lng: 1, comment: 'あ'.repeat(1_000_000) }).select('id');
  const spots = Array.from({ length: 2000 }, (_, i) => ({ id: `s${i}`, name: 'x'.repeat(100), memo: 'y'.repeat(200), lat: 35, lng: 139 }));
  const r2 = await C.c.from('trips').insert({ title: 'big', spots }).select('id');
  const d1 = must(await C.c.from('posts').delete().eq('owner', C.id).eq('title', 'big').select('id'), '片付け');
  const d2 = must(await C.c.from('trips').delete().eq('owner', C.id).eq('title', 'big').select('id'), '片付け');
  return `コメント100万字=${r1.error ? '止まった ' + r1.error.message : '入った'}・スポット2000個=${r2.error ? '止まった ' + r2.error.message : '入った'}・片付け ${d1.length + d2.length} 件`;
});
check('M03', 'near_home に1万点', '記録のみ', async () => {
  const t0 = Date.now();
  const r = await C.c.rpc('near_home', { p_points: Array.from({ length: 10000 }, () => ({ lat: 35, lng: 139 })) });
  return r.error ? `止まった: ${r.error.message}（${Date.now() - t0}ms）` : `${r.data.length} 件の答え・${Date.now() - t0}ms`;
});
check('M04', 'グループを続けて20個作る', '記録のみ', async () => {
  const res = await Promise.all(Array.from({ length: 20 }, (_, i) => C.c.rpc('create_group', { p_name: `mass${i}`, p_color: '#123456' })));
  const ok = res.filter((r) => !r.error);
  const del = must(await C.c.from('groups').delete().in('id', ok.map((r) => r.data)).select('id'), '片付け');
  return `${ok.length}/20 件成功・片付け ${del.length} 件削除`;
});

// ======================================================================
// 10. 量・回数の上限（依頼16・0008_seigen.sql / 0009_photo_quota.sql）。D（まっさらな人）で確かめる
//     上限の数字は SQL の private.lim() と画面の src/lib/limits.ts。ここでは依頼文の数字で確かめる
// ======================================================================
const RATE = (kind, win = 'minute') => new RegExp(`trs_rate_limit:${win}:${kind}`);
async function rateStopped(p, re) {
  const { error } = await p;
  if (!error) throw new Error('止まらなかった');
  if (!re.test(error.message)) throw new Error(`別のエラー: ${error.code} ${error.message}`);
  return error.message;
}
async function tooLong(p, label) {
  const { error } = await p;
  if (!error) throw new Error(`${label}：止まらなかった`);
  if (error.code !== '23514') throw new Error(`${label}：別のエラー ${error.code} ${error.message}`);
  return label;
}
const qIds = {};
const aa = (n) => 'あ'.repeat(n);
const qSpot = (i, name, memo) => ({ id: `s${i}`, name, memo, lat: 35, lng: 139, photoId: null });

check('Q01', '旅行：1分に10件までは作れる・11件目は止まる・編集は数えない', '10件○・11件目＝trs_rate_limit:minute:trip・既存の upsert/update○', async () => {
  for (let i = 0; i < 10; i++) {
    const r = must(await D.c.from('trips').insert({ title: `rate-${i}`, visibility: 'private' }).select('id').single(), `${i + 1}件目`);
    if (i === 0) qIds.trip = r.id;
  }
  const m = await rateStopped(D.c.from('trips').insert({ title: 'rate-11', visibility: 'private' }), RATE('trip'));
  must(await D.c.from('trips').upsert({ id: qIds.trip, title: '編集した', visibility: 'private' }), '編集（upsert）');
  must(await D.c.from('trips').update({ title: '編集2' }).eq('id', qIds.trip), '編集（update）');
  return m;
});
check('Q02', '投稿：1分に10件まで・11件目は止まる', '10件○・11件目＝trs_rate_limit:minute:post', async () => {
  for (let i = 0; i < 10; i++) {
    const r = must(
      await D.c.from('posts').insert({ title: `rate-${i}`, visibility: 'private', lat: 35, lng: 139 }).select('id').single(),
      `${i + 1}件目`,
    );
    if (i === 0) qIds.post = r.id;
  }
  return rateStopped(D.c.from('posts').insert({ title: 'rate-11', visibility: 'private', lat: 35, lng: 139 }), RATE('post'));
});
check('Q03', 'グループ：10個までは作れる・11個目は止まる', '10個○・11個目＝trs_rate_limit（1日10個に先に当たる）', async () => {
  for (let i = 0; i < 10; i++) must(await D.c.rpc('create_group', { p_name: `rate${i}`, p_color: '#123456' }), `${i + 1}個目`);
  return rateStopped(D.c.rpc('create_group', { p_name: 'rate11', p_color: '#123456' }), /trs_rate_limit:(day|minute):group/);
});
check('Q04', '写真：1分に10枚まで・11枚目は止まる・理由は my_photo_limit で分かる', '10枚○・11枚目×・my_photo_limit=minute・anon は呼べない', async () => {
  for (let i = 0; i < 10; i++) {
    must(await bucket(D.c).upload(`${D.id}/rate-${i}.jpg`, jpeg(), { contentType: 'image/jpeg' }), `${i + 1}枚目`);
  }
  const n = await mustError(bucket(D.c).upload(`${D.id}/rate-11.jpg`, jpeg(), { contentType: 'image/jpeg' }), '11枚目 ');
  const why = must(await D.c.rpc('my_photo_limit'), 'my_photo_limit');
  assert.equal(why, 'minute');
  const anonWhy = await mustError(anon.rpc('my_photo_limit'), 'anon ');
  return `${n} / my_photo_limit=${why} / anon: ${anonWhy.split(' ')[1]}`;
});
check('Q05', '長さ：上限ちょうどは通る（編集で確かめる＝回数に数えない）', '題名100字・コメント2000字・場所200字・スポット60個・名前100字・メモ1000字・約94KB○', async () => {
  must(await D.c.from('trips').update({ title: aa(100) }).eq('id', qIds.trip).select('id').single(), '旅行の題名100字');
  must(
    await D.c.from('posts').update({ title: aa(100), comment: aa(2000), place: aa(200) }).eq('id', qIds.post).select('id').single(),
    '投稿100/2000/200',
  );
  must(
    await D.c.from('trips').update({ spots: Array.from({ length: 60 }, (_, i) => qSpot(i, `x${i}`, '')) }).eq('id', qIds.trip).select('id').single(),
    'スポット60個',
  );
  must(await D.c.from('trips').update({ spots: [qSpot(0, aa(100), aa(1000))] }).eq('id', qIds.trip).select('id').single(), '名前100字・メモ1000字');
  must(
    await D.c.from('trips').update({ spots: Array.from({ length: 30 }, (_, i) => qSpot(i, `x${i}`, aa(1000))) }).eq('id', qIds.trip).select('id').single(),
    'メモ1000字×30（約94KB）',
  );
  return 'すべて通った';
});
check('Q06', '長さ：上限を1つ超えると止まる（insert・update とも。回数の上限より先に check 制約で止まる）', 'どれも 23514', async () => {
  const notes = [];
  notes.push(await tooLong(D.c.from('trips').insert({ title: aa(101) }), '旅行の題名101字（insert）'));
  notes.push(await tooLong(D.c.from('trips').update({ title: aa(101) }).eq('id', qIds.trip), '旅行の題名101字（update）'));
  notes.push(await tooLong(D.c.from('posts').insert({ title: aa(101), lat: 1, lng: 1 }), '投稿の題名101字'));
  notes.push(await tooLong(D.c.from('posts').update({ comment: aa(2001) }).eq('id', qIds.post), 'コメント2001字'));
  notes.push(await tooLong(D.c.from('posts').update({ place: aa(201) }).eq('id', qIds.post), '場所201字'));
  notes.push(
    await tooLong(D.c.from('trips').update({ spots: Array.from({ length: 61 }, (_, i) => qSpot(i, `x${i}`, '')) }).eq('id', qIds.trip), 'スポット61個'),
  );
  notes.push(await tooLong(D.c.from('trips').update({ spots: [qSpot(0, aa(101), '')] }).eq('id', qIds.trip), 'スポット名101字'));
  notes.push(await tooLong(D.c.from('trips').update({ spots: [qSpot(0, 'x', aa(1001))] }).eq('id', qIds.trip), 'メモ1001字'));
  notes.push(
    await tooLong(
      D.c.from('trips').update({ spots: Array.from({ length: 40 }, (_, i) => qSpot(i, `x${i}`, aa(1000))) }).eq('id', qIds.trip),
      'スポット全体 約125KB',
    ),
  );
  notes.push(await tooLong(D.c.from('profiles').update({ display_name: aa(31) }).eq('id', D.id), '表示名31字'));
  // 長すぎるものは保存されていない
  const t = must(await D.c.from('trips').select('title').eq('id', qIds.trip).single(), 'D');
  assert.equal(t.title.length, 100);
  return notes.join('・');
});
check('Q07', 'my_profile：自分の行だけ・anon は呼べない', 'D＝自分の1行（name_asked あり）／anon＝止まる', async () => {
  const d = must(await D.c.rpc('my_profile'), 'D');
  assert.equal(d.length, 1);
  assert.equal(d[0].id, D.id);
  assert.equal(typeof d[0].name_asked, 'boolean');
  const n = await mustError(anon.rpc('my_profile'), 'anon ');
  return `D: ${d.length}行 / anon: ${n.split(' ')[1]}`;
});
check('Q08', '回数の記録（private.rate_events）は API から読めない', 'D・anon とも止まる', async () => {
  const notes = [];
  notes.push(await mustError(D.c.schema('private').from('rate_events').select('*'), 'D '));
  notes.push(await mustError(anon.schema('private').from('rate_events').select('*'), 'anon '));
  return notes.join(' / ');
});

// ======================================================================
// 後片付け：各ユーザーが自分で（写真を Storage API で消す → delete_my_data）
// ======================================================================
const cleanup = [];
after(async () => {
  for (const who of ['B', 'C', 'D', 'A']) {
    const u = { A, B, C, D }[who];
    if (!u) continue;
    try {
      let removed = 0;
      for (;;) {
        const { data, error } = await bucket(u.c).list(u.id, { limit: 100 });
        if (error) throw new Error(`list: ${error.message}`);
        if (!data.length) break;
        const { data: gone, error: e2 } = await bucket(u.c).remove(data.map((x) => `${u.id}/${x.name}`));
        if (e2 || !gone?.length) throw new Error(`remove: ${e2?.message ?? '0件'}`);
        removed += gone.length;
      }
      const { data, error } = await u.c.rpc('delete_my_data');
      if (error) throw new Error(`delete_my_data: ${error.message}`);
      cleanup.push(`${who}: 写真 ${removed} 枚・${JSON.stringify(data)}`);
    } catch (e) {
      cleanup.push(`${who}: ★消せなかった（id=${u.id}）${e.message}`);
    }
  }
  // 結果の表
  const ng = rows.filter((r) => r.result.startsWith('NG'));
  const out = [
    '',
    '| 番号 | 項目 | 期待 | 結果 |',
    '|---|---|---|---|',
    ...rows.map((r) => `| ${r.no} | ${r.name} | ${r.expected} | ${r.result.replace(/\|/g, '｜')} |`),
    '',
    `合計 ${rows.length} 件・期待どおり ${rows.length - ng.length} 件・期待と違う ${ng.length} 件`,
    '',
    '後片付け：',
    ...cleanup.map((s) => '  ' + s),
    '',
  ].join('\n');
  console.log(out);
});
