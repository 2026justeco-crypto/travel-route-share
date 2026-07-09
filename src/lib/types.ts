export type Region =
  | '北海道'
  | '東北'
  | '関東'
  | '中部'
  | '関西'
  | '中国'
  | '四国'
  | '九州・沖縄';

export const REGIONS: Region[] = [
  '北海道',
  '東北',
  '関東',
  '中部',
  '関西',
  '中国',
  '四国',
  '九州・沖縄',
];

export interface Post {
  id: string;
  userId: string;
  userName: string;
  title: string;
  comment: string;
  date: string; // 投稿日 (YYYY-MM-DD)
  lat: number;
  lng: number;
  placeName: string;
  prefecture: string;
  region: Region;
  photoId: string | null;
  createdAt: string; // ISO
}

export interface TripSpot {
  id: string;
  name: string;
  memo: string;
  lat: number | null;
  lng: number | null;
  photoId: string | null;
}

export type TripStatus = 'plan' | 'done'; // 予定 / 実績（旅行記）

export interface Trip {
  id: string;
  userId: string;
  userName: string;
  title: string;
  startDate: string;
  endDate: string;
  status: TripStatus;
  spots: TripSpot[];
  createdAt: string; // ISO
}

export type RecentFilter = 'all' | '7' | '30' | '90';
