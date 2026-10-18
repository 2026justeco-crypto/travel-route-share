'use client';

// 「見せる先」を選ぶ（依頼9で作り、依頼10で全体／自分だけ、依頼12でグループ（複数可）を足した）。
//   全体＝だれでも見られる（新規の既定）／グループ＝選んだグループのメンバーだけ（複数可）／自分だけ＝ほかの人には見えない。
//   グループを1つでも選ぶと visibility=groups。守りはサーバーの RLS。
import Link from 'next/link';
import type { Visibility } from '@/lib/types';
import type { GroupBrief } from '@/lib/groups';
import { GlobeIcon, GroupIcon, LockIcon } from '@/components/icons';

const CHIP =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-3.5 text-sm font-bold transition';

export function GroupDot({ color, className = 'h-3 w-3' }: { color: string; className?: string }) {
  return <span aria-hidden className={`inline-block shrink-0 rounded-full ${className}`} style={{ background: color }} />;
}

export interface ShareValue {
  visibility: Visibility;
  /** visibility=groups のときに見せるグループ（自分が入っているもの） */
  groupIds: string[];
}

/** 保存ボタンのそばに出す短い言葉 */
export function shareLabel(v: ShareValue, groups: GroupBrief[] | null): string {
  if (v.visibility === 'public') return '全体';
  if (v.visibility === 'private') return '自分だけ';
  const names = (groups ?? []).filter((g) => v.groupIds.includes(g.id)).map((g) => g.name);
  return names.length ? names.join('・') : 'グループ';
}

export function ShareIcon({ visibility, className = 'h-4 w-4' }: { visibility: Visibility; className?: string }) {
  if (visibility === 'public') return <GlobeIcon className={className} />;
  if (visibility === 'groups') return <GroupIcon className={className} />;
  return <LockIcon className={className} />;
}

export default function ShareToPicker({
  value,
  onChange,
  groups,
  leftCount = 0,
  dropLeft = false,
  onDropLeft,
}: {
  value: ShareValue;
  onChange: (v: ShareValue) => void;
  /** 自分が入っているグループ（null＝読み込み中） */
  groups: GroupBrief[] | null;
  /** 抜けたグループに見せたままの数（編集のときだけ） */
  leftCount?: number;
  dropLeft?: boolean;
  onDropLeft?: (v: boolean) => void;
}) {
  const plain = (v: 'public' | 'private', label: string, icon: React.ReactNode) => {
    const on = value.visibility === v;
    return (
      <button
        type="button"
        onClick={() => onChange({ visibility: v, groupIds: [] })}
        aria-pressed={on}
        className={`${CHIP} ${on ? 'border-[var(--line)] bg-tint text-ink' : 'border-line-soft text-muted hover:bg-surface-2'}`}
      >
        {icon}
        {label}
        {on && <span aria-hidden>✓</span>}
      </button>
    );
  };

  const toggleGroup = (id: string) => {
    const cur = value.visibility === 'groups' ? value.groupIds : [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    // 最後のグループを外したら「自分だけ」に戻す（だれにも見せない groups を作らない）
    onChange(next.length ? { visibility: 'groups', groupIds: next } : { visibility: 'private', groupIds: [] });
  };

  const selectedNames = (groups ?? []).filter((g) => value.groupIds.includes(g.id)).map((g) => g.name);

  return (
    <fieldset className="rounded-xl border border-line-soft bg-surface p-3">
      <legend className="px-1 text-sm font-semibold text-ink-soft">見せる先</legend>
      <div className="flex flex-wrap gap-2">
        {plain('public', '全体', <GlobeIcon className="h-4 w-4" />)}
        {plain('private', '自分だけ', <LockIcon className="h-4 w-4" />)}
      </div>

      <div className="mt-2">
        <p className="mb-1 text-xs font-semibold text-ink-soft">グループ（いくつでも）</p>
        {groups === null ? (
          <p className="text-xs text-muted">グループを読み込んでいます…</p>
        ) : groups.length === 0 ? (
          <p className="text-xs text-muted">
            入っているグループはありません。
            <Link href="/groups/new" className="ml-1 font-bold text-link underline">
              グループをつくる
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => {
              const on = value.visibility === 'groups' && value.groupIds.includes(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => toggleGroup(g.id)}
                  aria-pressed={on}
                  className={`${CHIP} ${on ? 'bg-tint text-ink' : 'border-line-soft text-muted hover:bg-surface-2'}`}
                  style={on ? { borderColor: g.color } : undefined}
                >
                  <GroupDot color={g.color} />
                  <span className="max-w-[12rem] truncate">{g.name}</span>
                  {on && <span aria-hidden>✓</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-1.5 text-xs text-muted">
        {value.visibility === 'public'
          ? 'だれでも見られます（トップの「みんなの旅」に出ます）。'
          : value.visibility === 'groups'
            ? `${selectedNames.join('・') || '選んだグループ'}のメンバーだけが見られます。メンバーは保存・転送できるので、見せたくない場所は入れないでください。`
            : 'ほかの人には見えません。'}
      </p>

      {leftCount > 0 && value.visibility === 'groups' && (
        <label className="mt-2 flex min-h-11 items-center gap-2 rounded-lg bg-surface-2 px-2 text-xs text-ink">
          <input type="checkbox" checked={dropLeft} onChange={(e) => onDropLeft?.(e.target.checked)} className="h-5 w-5" />
          抜けたグループ（{leftCount}つ）にも見せたままです。そこから外す
        </label>
      )}
    </fieldset>
  );
}
