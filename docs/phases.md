# 開発フェーズ計画（MVP → β → 正式版）

## MVP（実装済み・デモモード）

**目的：コア価値「旅行全体をルートとして共有する体験」の検証。**
アカウント無しですぐ触れることを優先し、データはブラウザ内保存（localStorage / IndexedDB）。

- 日本地図＋ピン＋ポップアップ（写真/タイトル/コメント/投稿者）
- 写真投稿（EXIF GPS自動取得 / 地図クリック指定）
- 旅行ルート作成（順番・並べ替え・写真・メモ・番号ピン・ルート線）
- 予定→実績（旅行記化）
- フィルター（自分/他ユーザー・地域8区分・お気に入り・直近のみ表示 7/30/90日）
- 検索（クライアント内テキスト検索）・タイムライン

**理由**：認証・SNS機能を先に作ると検証開始が遅れる。ルート作成体験こそが差別化点なので最優先で形にした。

## β版（次フェーズ・Supabase導入）

**目的：複数ユーザーでの実利用開始。**

- Supabase Auth（メール/Googleログイン）
- DB移行（下記スキーマ）・Storage（写真）
- いいね・コメント・お気に入り（サーバー保存）
- マイページ（投稿一覧・作成ルート・お気に入り・行った都道府県）
- 検索のサーバー実装（地名・都道府県・投稿者・タグ）
- 公開/限定公開の設定
- タグ機能

**理由**：人に見せられる品質の後に人を呼ぶ機能を入れる順序。認証とデータ永続化はセット。

### 公開前に必須の対策（プライバシー・安全）

1. EXIF除去の維持（サーバー側でも再確認）
2. 位置ぼかしオプション（数百m丸め）／自宅セーフゾーン（指定地点の半径内は投稿時に警告 or 自動非公開）
3. デフォルト非公開 or 限定公開スタート
4. 通報機能・利用規約・プライバシーポリシー
5. 投稿画像のモデレーション体制

## 正式版（将来）

- フォロー機能・人気旅行ランキング
- AIによる旅行ルート提案
- 行った都道府県の自動塗りつぶし
- 海外マップ対応・GPXインポート・移動距離/時間の自動計算

## β版 Supabase スキーマ案

```sql
create table users (
  id uuid primary key references auth.users(id),
  name text not null,
  avatar_url text,
  created_at timestamptz default now()
);

create table photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  storage_path text not null,
  created_at timestamptz default now()
);

create table posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  title text not null,
  comment text,
  posted_on date not null,
  lat double precision not null,
  lng double precision not null,
  place_name text,
  prefecture text,
  region text,
  photo_id uuid references photos(id),
  visibility text not null default 'private', -- private / limited / public
  created_at timestamptz default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  title text not null,
  start_date date,
  end_date date,
  status text not null default 'plan', -- plan / done
  visibility text not null default 'private',
  created_at timestamptz default now()
);

create table trip_spots (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade not null,
  sort_order int not null,
  name text not null,
  memo text,
  lat double precision,
  lng double precision,
  photo_id uuid references photos(id)
);

create table favorites (
  user_id uuid references users(id) not null,
  post_id uuid references posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

create table likes (
  user_id uuid references users(id) not null,
  post_id uuid references posts(id) on delete cascade not null,
  created_at timestamptz default now(),
  primary key (user_id, post_id)
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) not null,
  post_id uuid references posts(id) on delete cascade not null,
  body text not null,
  created_at timestamptz default now()
);
-- 全テーブルに RLS（行レベルセキュリティ）を設定すること
```
