'use client';

// 「見せる先」を選ぶ1行（依頼9で作り、依頼10で全体／自分だけに変えた）。
//   全体＝だれでも見られる（新規の既定）／自分だけ＝ほかの人には見えない（サーバーの RLS で守る）。
//   グループ（複数可）は依頼12でサーバー版にしてから足す。
import type { Visibility } from '@/lib/types';
import { GlobeIcon, LockIcon } from '@/components/icons';

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition';

export function GroupDot({ color, className = 'h-3 w-3' }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

/** 今のところ選べるのは全体と自分だけ */
export type PickVisibility = Extract<Visibility, 'public' | 'private'>;

export default function ShareToPicker({
  value,
  onChange,
}: {
  value: PickVisibility;
  onChange: (v: PickVisibility) => void;
}) {
  const opt = (v: PickVisibility, label: string, icon: React.ReactNode) => {
    const on = value === v;
    return (
      <button
        type="button"
        onClick={() => onChange(v)}
        aria-pressed={on}
        className={`${CHIP} ${on ? 'border-[var(--line)] bg-tint text-ink' : 'border-line-soft text-muted hover:bg-surface-2'}`}
      >
        {icon}
        {label}
        {on && <span aria-hidden>✓</span>}
      </button>
    );
  };

  return (
    <fieldset className="rounded-xl border border-line-soft bg-surface p-3">
      <legend className="px-1 text-sm font-semibold text-ink-soft">見せる先</legend>
      <div className="flex flex-wrap gap-2">
        {opt('public', '全体', <GlobeIcon className="h-4 w-4" />)}
        {opt('private', '自分だけ', <LockIcon className="h-4 w-4" />)}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {value === 'public' ? 'だれでも見られます（トップの「みんなの旅」に出ます）。' : 'ほかの人には見えません。'}
        <span className="ml-1">グループに見せる機能は準備中です。</span>
      </p>
    </fieldset>
  );
}
