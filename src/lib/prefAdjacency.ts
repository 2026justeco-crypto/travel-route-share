import { TILES, type PrefName } from './tileMap';

// 実際に陸で接している都道府県の組（海をはさむ・橋やトンネルだけでつながる組は含めない）。
// タイル地図の並びを照らし合わせるための一覧。見本ページ（/dev/tilemap）で一致数を出す。
const LAND_NEIGHBORS: Record<PrefName, PrefName[]> = {
  青森県: ['岩手県', '秋田県'],
  岩手県: ['秋田県', '宮城県'],
  宮城県: ['秋田県', '山形県', '福島県'],
  秋田県: ['山形県'],
  山形県: ['福島県', '新潟県'],
  福島県: ['新潟県', '群馬県', '栃木県', '茨城県'],
  茨城県: ['栃木県', '埼玉県', '千葉県'],
  栃木県: ['群馬県', '埼玉県'],
  群馬県: ['埼玉県', '長野県', '新潟県'],
  埼玉県: ['長野県', '山梨県', '東京都', '千葉県'],
  千葉県: ['東京都'],
  東京都: ['神奈川県', '山梨県'],
  神奈川県: ['山梨県', '静岡県'],
  新潟県: ['長野県', '富山県'],
  富山県: ['長野県', '岐阜県', '石川県'],
  石川県: ['岐阜県', '福井県'],
  福井県: ['岐阜県', '滋賀県', '京都府'],
  山梨県: ['静岡県', '長野県'],
  長野県: ['静岡県', '愛知県', '岐阜県'],
  岐阜県: ['愛知県', '三重県', '滋賀県'],
  静岡県: ['愛知県'],
  愛知県: ['三重県'],
  三重県: ['滋賀県', '京都府', '奈良県', '和歌山県'],
  滋賀県: ['京都府'],
  京都府: ['奈良県', '大阪府', '兵庫県'],
  大阪府: ['奈良県', '和歌山県', '兵庫県'],
  兵庫県: ['鳥取県', '岡山県'],
  奈良県: ['和歌山県'],
  鳥取県: ['岡山県', '島根県', '広島県'],
  島根県: ['広島県', '山口県'],
  岡山県: ['広島県'],
  広島県: ['山口県'],
  徳島県: ['香川県', '愛媛県', '高知県'],
  香川県: ['愛媛県'],
  愛媛県: ['高知県'],
  福岡県: ['佐賀県', '熊本県', '大分県'],
  佐賀県: ['長崎県'],
  熊本県: ['大分県', '宮崎県', '鹿児島県'],
  大分県: ['宮崎県'],
  宮崎県: ['鹿児島県'],
};

const pairKey = (a: PrefName, b: PrefName) => (a < b ? `${a}・${b}` : `${b}・${a}`);

/** 実際に陸で接している組の一覧（重複なし） */
export function landPairs(): string[] {
  const s = new Set<string>();
  for (const [a, bs] of Object.entries(LAND_NEIGHBORS)) for (const b of bs) s.add(pairKey(a, b));
  return [...s];
}

/** タイル地図の上で上下左右に接している組の一覧 */
export function tilePairs(): string[] {
  const cell = new Map<string, PrefName>();
  for (const t of TILES)
    for (let i = 0; i < t.w; i++) for (let j = 0; j < t.h; j++) cell.set(`${t.x + i},${t.y + j}`, t.name);
  const s = new Set<string>();
  for (const [k, n] of cell) {
    const [x, y] = k.split(',').map(Number);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
    ]) {
      const o = cell.get(`${x + dx},${y + dy}`);
      if (o && o !== n) s.add(pairKey(n, o));
    }
  }
  return [...s];
}

/** 照合結果：実際の組のうちタイルでも接している数、接していない組、タイルだけで接している組 */
export function checkTileAdjacency() {
  const real = landPairs();
  const grid = new Set(tilePairs());
  const realSet = new Set(real);
  const matched = real.filter((p) => grid.has(p));
  const missing = real.filter((p) => !grid.has(p));
  const extra = [...grid].filter((p) => !realSet.has(p));
  return { total: real.length, matched: matched.length, missing, extra };
}
