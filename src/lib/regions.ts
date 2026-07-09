import type { Region } from './types';

// 都道府県の代表点（県庁所在地の近似座標）。最寄り判定で地域フィルターに使う。
// MVPの近似実装：厳密な県境判定はβ版で逆ジオコーディングに置き換える。
interface Pref {
  name: string;
  region: Region;
  lat: number;
  lng: number;
}

export const PREFECTURES: Pref[] = [
  { name: '北海道', region: '北海道', lat: 43.06, lng: 141.35 },
  { name: '青森県', region: '東北', lat: 40.82, lng: 140.74 },
  { name: '岩手県', region: '東北', lat: 39.7, lng: 141.15 },
  { name: '宮城県', region: '東北', lat: 38.27, lng: 140.87 },
  { name: '秋田県', region: '東北', lat: 39.72, lng: 140.1 },
  { name: '山形県', region: '東北', lat: 38.24, lng: 140.36 },
  { name: '福島県', region: '東北', lat: 37.75, lng: 140.47 },
  { name: '茨城県', region: '関東', lat: 36.34, lng: 140.45 },
  { name: '栃木県', region: '関東', lat: 36.57, lng: 139.88 },
  { name: '群馬県', region: '関東', lat: 36.39, lng: 139.06 },
  { name: '埼玉県', region: '関東', lat: 35.86, lng: 139.65 },
  { name: '千葉県', region: '関東', lat: 35.61, lng: 140.12 },
  { name: '東京都', region: '関東', lat: 35.69, lng: 139.69 },
  { name: '神奈川県', region: '関東', lat: 35.45, lng: 139.64 },
  { name: '新潟県', region: '中部', lat: 37.9, lng: 139.02 },
  { name: '富山県', region: '中部', lat: 36.7, lng: 137.21 },
  { name: '石川県', region: '中部', lat: 36.59, lng: 136.63 },
  { name: '福井県', region: '中部', lat: 36.07, lng: 136.22 },
  { name: '山梨県', region: '中部', lat: 35.66, lng: 138.57 },
  { name: '長野県', region: '中部', lat: 36.65, lng: 138.18 },
  { name: '岐阜県', region: '中部', lat: 35.39, lng: 136.72 },
  { name: '静岡県', region: '中部', lat: 34.98, lng: 138.38 },
  { name: '愛知県', region: '中部', lat: 35.18, lng: 136.91 },
  { name: '三重県', region: '関西', lat: 34.73, lng: 136.51 },
  { name: '滋賀県', region: '関西', lat: 35.0, lng: 135.87 },
  { name: '京都府', region: '関西', lat: 35.02, lng: 135.76 },
  { name: '大阪府', region: '関西', lat: 34.69, lng: 135.52 },
  { name: '兵庫県', region: '関西', lat: 34.69, lng: 135.18 },
  { name: '奈良県', region: '関西', lat: 34.69, lng: 135.83 },
  { name: '和歌山県', region: '関西', lat: 34.23, lng: 135.17 },
  { name: '鳥取県', region: '中国', lat: 35.5, lng: 134.24 },
  { name: '島根県', region: '中国', lat: 35.47, lng: 133.05 },
  { name: '岡山県', region: '中国', lat: 34.66, lng: 133.93 },
  { name: '広島県', region: '中国', lat: 34.4, lng: 132.46 },
  { name: '山口県', region: '中国', lat: 34.19, lng: 131.47 },
  { name: '徳島県', region: '四国', lat: 34.07, lng: 134.56 },
  { name: '香川県', region: '四国', lat: 34.34, lng: 134.04 },
  { name: '愛媛県', region: '四国', lat: 33.84, lng: 132.77 },
  { name: '高知県', region: '四国', lat: 33.56, lng: 133.53 },
  { name: '福岡県', region: '九州・沖縄', lat: 33.61, lng: 130.42 },
  { name: '佐賀県', region: '九州・沖縄', lat: 33.25, lng: 130.3 },
  { name: '長崎県', region: '九州・沖縄', lat: 32.74, lng: 129.87 },
  { name: '熊本県', region: '九州・沖縄', lat: 32.79, lng: 130.74 },
  { name: '大分県', region: '九州・沖縄', lat: 33.24, lng: 131.61 },
  { name: '宮崎県', region: '九州・沖縄', lat: 31.91, lng: 131.42 },
  { name: '鹿児島県', region: '九州・沖縄', lat: 31.56, lng: 130.56 },
  { name: '沖縄県', region: '九州・沖縄', lat: 26.21, lng: 127.68 },
];

export function nearestPrefecture(lat: number, lng: number): Pref {
  let best = PREFECTURES[0];
  let bestD = Infinity;
  for (const p of PREFECTURES) {
    const d = (p.lat - lat) ** 2 + (p.lng - lng) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
