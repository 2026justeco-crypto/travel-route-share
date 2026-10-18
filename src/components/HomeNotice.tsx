'use client';

// 保存の前に出す小さなカード（依頼13）。alert/confirm は使わない。
//   - 自宅の近くの場所があるとき：「自宅の近くです。この場所はほかの人には表示しません」→ このまま保存／戻る
//   - 自宅を登録していない人が初めて全体に見せるとき（1回だけ）：「自宅を登録すると…」→ 自宅を登録する／あとで（このまま保存）
//   隠すのはサーバー（trigger）なので、このカードを閉じても守りは変わらない。
import Link from 'next/link';
import type { SaveCheck } from '@/lib/home';
import { PinIcon } from '@/components/icons';

export default function HomeNotice({
  check,
  names,
  onContinue,
  onBack,
}: {
  check: SaveCheck;
  /** 自宅の近くの場所の名前（check.near と同じ順） */
  names: string[];
  onContinue: () => void;
  onBack: () => void;
}) {
  if (check.near.length > 0)
    return (
      <section role="alert" aria-label="自宅の近くの場所" className="t-card mb-3 space-y-2 border-amber-400 p-4">
        <p className="flex items-start gap-1.5 text-sm font-bold text-ink">
          <PinIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          自宅の近くです。この場所はほかの人には表示しません。
        </p>
        {names.length > 0 && (
          <ul className="list-inside list-disc text-sm text-ink-soft">
            {names.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted">名前・メモ・写真は出ます。地図とルートの線からは外します。あなたには今までどおり見えます。</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onContinue}
            className="min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
          >
            このまま保存
          </button>
          <button
            type="button"
            onClick={onBack}
            className="min-h-11 flex-1 rounded-full border-2 border-line-soft px-4 text-sm font-bold text-ink"
          >
            戻る
          </button>
        </div>
      </section>
    );

  if (check.hint)
    return (
      <section role="status" aria-label="自宅の登録の案内" className="t-card mb-3 space-y-2 p-4">
        <p className="text-sm font-bold text-ink">自宅を登録すると、近くの場所を自動で隠せます。</p>
        <p className="text-xs text-muted">
          ほかの人には、位置を少しぼかして見せています。家から出発するルートなら、自宅のあたりを登録しておくと安心です（登録した場所はあなたにしか見えません）。
        </p>
        <div className="flex gap-2">
          <Link
            href="/settings"
            className="flex min-h-11 flex-1 items-center justify-center rounded-full bg-primary px-4 text-sm font-bold text-on-primary"
          >
            自宅を登録する
          </Link>
          <button
            type="button"
            onClick={onContinue}
            className="min-h-11 flex-1 rounded-full border-2 border-line-soft px-4 text-sm font-bold text-ink"
          >
            あとで（保存する）
          </button>
        </div>
      </section>
    );

  return null;
}
