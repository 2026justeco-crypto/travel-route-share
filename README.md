# Travel Route Share（仮）

「旅行全体を共有するSNS」— 写真1枚ではなく、旅行のルート・順番・体験をひとつのストーリーとして共有するWebサービス。

## デモ（GitHub Pages）

https://2026justeco-crypto.github.io/travel-route-share/

## ローカルでの起動方法（MVP・デモモード）

```
npm install
npm run dev
```

→ http://localhost:3000 を開く。

- **デモモード**：アカウント不要。データはブラウザ内（localStorage / IndexedDB）にのみ保存される
- 初回起動時に「デモユーザー」の投稿5件が自動生成される（他ユーザー表示・フィルターの動作確認用）
- β版で Supabase（Auth / Database / Storage）に差し替え予定（`docs/phases.md` 参照）

## MVPでできること

- 日本地図（Leaflet + OpenStreetMap）にピン表示・ポップアップで写真/タイトル/コメント/投稿者
- 写真投稿：EXIFのGPSから自動でピン位置取得。GPSが無い写真は地図クリックで位置指定
- 旅行ルート作成：スポットを順番に登録（並べ替え・写真・メモ）、地図に番号ピン＋ルート線
- 予定→実績：旅行後にスポットへ写真を追加し「旅行記」に更新
- フィルター：自分/他ユーザー・地域（8区分）・お気に入り・**直近のみ表示（7/30/90日・選択式）**
- 検索：地名・都道府県・タイトル・投稿者
- タイムライン：新着旅行・新着投稿のカード表示

## プライバシー設計（MVP時点）

- 写真は保存時に縮小・再エンコードするため、**GPS等のEXIFは保存データに残らない**（ピン位置のみ別途保存）
- デモモードは外部送信なし（全データがローカル）
- 公開サービス化する際は `docs/phases.md` の「公開前に必須の対策」を必ず実施すること

## 技術構成

- Next.js (App Router) / React / TypeScript / Tailwind CSS
- Leaflet + react-leaflet + OpenStreetMap
- exifr（EXIF GPS抽出）
- データ層：`src/lib/store.ts`（デモ実装。β版でSupabase実装に差し替えられるよう関数を分離）
