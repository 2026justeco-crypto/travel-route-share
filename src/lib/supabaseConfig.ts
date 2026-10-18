// Supabase の接続先（依頼10）。
// ★ここに置くのは公開キー（publishable）だけ。ページに載る前提の鍵で、守りは DB の RLS だけ。
//   secret キー／service_role キーは絶対に入れない。
//   GitHub Pages の静的書き出しなので、環境変数ではなく定数で置く。
export const SUPABASE_URL = 'https://qohoyaabuqxgbtebrmpj.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_qG0hMxegMBgbF99XQKkm6Q_4pOGh8E0';
