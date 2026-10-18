// 規約・プライバシー・通報（依頼14）。
//   問い合わせ・通報・削除依頼の受け先は、既存の「Justeco お問い合わせ」Googleフォーム（4サイト共用）。
//   先頭の「お問い合わせの種類」に「トラベルルートシェア（通報・削除依頼）」があり、事前入力で選んだ状態にして開く。
//   運営者の表記はハンドル名「Justeco」だけ（本名・住所・メールは書かない）。

/** 規約・プライバシーの最終更新日（中身を変えたらここも変える） */
export const LEGAL_UPDATED = '2026年10月18日';

/** 運営者の表記 */
export const OPERATOR = 'Justeco';

const FORM_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLScIo5gjuIXP7p_6g6LAt-HpSudRlZk6CS_j00WRbS_Bli3wcg/viewform';
/** 「お問い合わせの種類」の欄と、このサービスの選択肢 */
const ENTRY_KIND = 'entry.136850980';
const KIND_TRS = 'トラベルルートシェア（通報・削除依頼）';
/** 本文の欄 */
const ENTRY_BODY = 'entry.1311129114';

function formUrl(body?: string): string {
  const q = new URLSearchParams({ usp: 'pp_url', [ENTRY_KIND]: KIND_TRS });
  if (body) q.set(ENTRY_BODY, body);
  // URLSearchParams は空白を + にする。Googleフォームは %20 の方が確実に読むのでそろえる
  return `${FORM_URL}?${q.toString().replace(/\+/g, '%20')}`;
}

/** お問い合わせ（種類だけ選んだ状態） */
export const CONTACT_URL = formUrl();

export type ReportKind = 'trip' | 'post' | 'group';

const KIND_LABEL: Record<ReportKind, string> = { trip: '旅行', post: '写真（投稿）', group: 'グループ' };

/** 通報のフォーム（対象のURL・種類・名前・理由の欄を入れた状態） */
export function reportUrl(kind: ReportKind, targetUrl: string, title: string): string {
  const body = [`対象のURL：${targetUrl}`, `対象：${KIND_LABEL[kind]}「${title}」`, '理由：'].join('\n');
  return formUrl(body);
}
