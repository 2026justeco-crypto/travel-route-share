'use client';

// 「見せる先」を選ぶ1行（依頼9）。自分だけ／グループ（複数選べる）。
// 何も選ばない＝自分だけ（既定。今までの旅行・写真もこの扱い）。
// ★自分が入っているグループを localStorage から読むので、呼び出し側はブラウザでだけ描画する（useMounted の後）。
import { useState } from 'react';
import Link from 'next/link';
import { myGroups } from '@/lib/groups';
import { LockIcon } from '@/components/icons';

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition';

export function GroupDot({ color, className = 'h-3 w-3' }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

export default function ShareToPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const [groups] = useState(() => myGroups());
  const onlyMe = value.length === 0;

  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);

  return (
    <fieldset className="rounded-xl border border-line-soft bg-surface p-3">
      <legend className="px-1 text-sm font-semibold text-ink-soft">見せる先</legend>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onChange([])}
          aria-pressed={onlyMe}
          className={`${CHIP} ${onlyMe ? 'border-[var(--line)] bg-tint text-ink' : 'border-line-soft text-muted hover:bg-surface-2'}`}
        >
          <LockIcon className="h-4 w-4" />
          自分だけ
        </button>
        {groups.map((g) => {
          const on = value.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              onClick={() => toggle(g.id)}
              aria-pressed={on}
              className={`${CHIP} ${on ? 'bg-tint text-ink' : 'border-line-soft text-muted hover:bg-surface-2'}`}
              style={on ? { borderColor: g.color } : undefined}
            >
              <GroupDot color={g.color} />
              {g.name}
              {on && <span aria-hidden>✓</span>}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {groups.length === 0 ? (
          <>
            グループに入ると、グループの人にも見せられます（
            <Link href="/groups" className="font-bold text-link underline">
              グループ
            </Link>
            ）。
          </>
        ) : onlyMe ? (
          'ほかの人には見えません。'
        ) : (
          '選んだグループのメンバーだけが見られます。'
        )}
        <span className="ml-1">試作：グループはこの端末の中だけです。</span>
      </p>
    </fieldset>
  );
}
