import type { Region } from './types';
import { PREFECTURES } from './regions';

// タイル地図（四角だけでできた日本地図）の配置データ。
// 1県＝1マスが基本。格子の左上が (0,0)、x は右へ、y は下へ増える。
// 並び方はこのアプリで一から設計したもの（考え方）：
//  - 実際に陸で接している県どうしを、なるべく上下左右に接するように置く
//  - 細長い・大きい県だけ 2マスにして接し方を稼ぐ（青森・新潟・福島・千葉・山口・兵庫・鹿児島）
//  - 北海道は右上に離した横長、四国は本州から1マス離した 2×2、九州は本州の左に1マス離す、沖縄は左下
// 照合用の「陸で接している県の組」は prefAdjacency.ts（見本ページで一致数を出す）。

export type PrefName = string;

export interface TileCell {
  name: PrefName;
  x: number;
  y: number;
  w?: number;
  h?: number;
}

export interface Tile {
  name: PrefName;
  region: Region;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 配置（名前は regions.ts の PREFECTURES と同じ表記） */
export const TILE_LAYOUT: TileCell[] = [
  // 北海道（右上に離した横長）
  { name: '北海道', x: 13, y: 0, w: 3, h: 2 },
  // 東北
  { name: '青森県', x: 13, y: 3, w: 2 },
  { name: '秋田県', x: 13, y: 4 },
  { name: '岩手県', x: 14, y: 4 },
  { name: '山形県', x: 13, y: 5 },
  { name: '宮城県', x: 14, y: 5 },
  { name: '福島県', x: 13, y: 6, w: 2 },
  // 関東
  { name: '茨城県', x: 14, y: 7 },
  { name: '栃木県', x: 13, y: 7 },
  { name: '群馬県', x: 12, y: 7 },
  { name: '埼玉県', x: 13, y: 8 },
  { name: '千葉県', x: 14, y: 8, h: 2 },
  { name: '東京都', x: 13, y: 9 },
  { name: '神奈川県', x: 12, y: 9 },
  // 中部
  { name: '新潟県', x: 12, y: 5, h: 2 },
  { name: '富山県', x: 11, y: 6 },
  { name: '石川県', x: 10, y: 6 },
  { name: '福井県', x: 9, y: 6 },
  { name: '山梨県', x: 12, y: 8 },
  { name: '長野県', x: 11, y: 7 },
  { name: '岐阜県', x: 10, y: 7 },
  { name: '静岡県', x: 11, y: 9 },
  { name: '愛知県', x: 11, y: 8 },
  // 関西
  { name: '三重県', x: 10, y: 8 },
  { name: '滋賀県', x: 9, y: 7 },
  { name: '京都府', x: 8, y: 7 },
  { name: '大阪府', x: 8, y: 8 },
  { name: '兵庫県', x: 7, y: 7, h: 2 },
  { name: '奈良県', x: 9, y: 8 },
  { name: '和歌山県', x: 9, y: 9 },
  // 中国
  { name: '鳥取県', x: 6, y: 7 },
  { name: '島根県', x: 5, y: 7 },
  { name: '岡山県', x: 6, y: 8 },
  { name: '広島県', x: 5, y: 8 },
  { name: '山口県', x: 4, y: 7, h: 2 },
  // 四国（本州から1マス離した 2×2）
  { name: '徳島県', x: 6, y: 11 },
  { name: '香川県', x: 6, y: 10 },
  { name: '愛媛県', x: 5, y: 10 },
  { name: '高知県', x: 5, y: 11 },
  // 九州・沖縄（本州の左に1マス離す）
  { name: '福岡県', x: 1, y: 8 },
  { name: '佐賀県', x: 0, y: 8 },
  { name: '長崎県', x: 0, y: 9 },
  { name: '熊本県', x: 1, y: 9 },
  { name: '大分県', x: 2, y: 8 },
  { name: '宮崎県', x: 2, y: 9 },
  { name: '鹿児島県', x: 1, y: 10, w: 2 },
  { name: '沖縄県', x: 0, y: 12 },
];

const REGION_BY_NAME = new Map<PrefName, Region>(PREFECTURES.map((p) => [p.name, p.region]));

/** 地方つきの配置（並びは TILE_LAYOUT と同じ＝北から南。Tab で移る順番にもなる） */
export const TILES: Tile[] = TILE_LAYOUT.map((t) => {
  const region = REGION_BY_NAME.get(t.name);
  if (!region) throw new Error(`tileMap: 都道府県名が regions.ts と一致しません: ${t.name}`);
  return { name: t.name, region, x: t.x, y: t.y, w: t.w ?? 1, h: t.h ?? 1 };
});

/** 格子の大きさ（列数・行数） */
export const TILE_COLS = Math.max(...TILES.map((t) => t.x + t.w));
export const TILE_ROWS = Math.max(...TILES.map((t) => t.y + t.h));

export function tileRegion(name: PrefName): Region | undefined {
  return REGION_BY_NAME.get(name);
}

/**
 * マスに出す短い県名。
 * 決まり：末尾の「都・府・県」を取るだけ（北海道はそのまま）。
 * 例：東京都→東京、大阪府→大阪、京都府→京都、神奈川県→神奈川
 */
export function shortPrefName(name: PrefName): string {
  if (name === '北海道') return name;
  return name.replace(/[都府県]$/, '');
}
