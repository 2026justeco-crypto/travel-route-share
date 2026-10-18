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

/** 見せる先（依頼10）。public＝全体／groups＝グループ（依頼12）／private＝自分だけ */
export type Visibility = 'public' | 'groups' | 'private';

export interface Post {
  id: string;
  userId: string;
  userName: string;
  title: string;
  comment: string;
  date: string; // 投稿日 (YYYY-MM-DD)
  /** 持ち主には正確な位置、ほかの人にはぼかした位置。自宅の近く（依頼13）はほかの人には null */
  lat: number | null;
  lng: number | null;
  placeName: string;
  prefecture: string;
  region: Region;
  photoId: string | null;
  createdAt: string; // ISO
  /** 見せる先のグループ（依頼9の試作の形。端末に残った古いデータだけが持つ。サーバー版は trip_groups / post_groups） */
  groupIds?: string[];
  /** 見せる先（依頼10・サーバーのデータだけが持つ） */
  visibility?: Visibility;
  /** 運営の見本 */
  isSample?: boolean;
  /** 持ち主の画面だけ：自宅の近くなので、ほかの人には位置を出していない（依頼13） */
  hiddenFromOthers?: boolean;
}

/** 移動手段：徒歩／自転車／車／バス／電車／飛行機／船 */
export type TransportMode = 'walk' | 'bike' | 'car' | 'bus' | 'train' | 'plane' | 'ship';

export interface TripSpot {
  id: string;
  name: string;
  memo: string;
  lat: number | null;
  lng: number | null;
  photoId: string | null;
  /** このスポットから次のスポットへの移動手段。無い＝未設定（古いデータもこの扱い）。最後のスポットでは使わない */
  moveTo?: TransportMode;
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
  /** 見せる先のグループ（依頼9の試作の形。端末に残った古いデータだけが持つ。サーバー版は trip_groups / post_groups） */
  groupIds?: string[];
  /** 見せる先（依頼10・サーバーのデータだけが持つ） */
  visibility?: Visibility;
  /** 運営の見本 */
  isSample?: boolean;
  /** 持ち主の画面だけ：自宅の近くなので、ほかの人には位置を出していないスポットの id（依頼13） */
  hiddenSpotIds?: string[];
}

// ---------- グループ（依頼9で試作・依頼12でサーバー版） ----------

export interface GroupMember {
  id: string;
  name: string;
  joinedAt: string; // ISO
  role: 'owner' | 'member';
}

export interface Group {
  id: string;
  name: string;
  /** 目印の色（#rrggbb） */
  color: string;
  ownerId: string;
  /** 招待リンクの合言葉。作り直すと古いリンクは使えなくなる */
  inviteCode: string;
  members: GroupMember[];
  createdAt: string; // ISO
}

export type RecentFilter = 'all' | '7' | '30' | '90';
