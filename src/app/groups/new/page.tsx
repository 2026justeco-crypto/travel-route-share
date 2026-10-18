'use client';

// グループをつくる（依頼9）。名前と色だけ。作ったらそのグループのページで招待リンクを出す。
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { GROUP_COLORS, createGroup } from '@/lib/groups';
import { markReplace } from '@/lib/navTrail';
import { GroupIcon } from '@/components/icons';
import DemoNote from '@/components/DemoNote';

const MAX_NAME = 30;

export default function NewGroupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [color, setColor] = useState<string>(GROUP_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const ok = name.trim().length > 0;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ok || saving) return;
    setSaving(true);
    const g = createGroup(name.slice(0, MAX_NAME), color);
    // 作成画面は履歴に残さない（グループのページから「戻る」で作成画面に戻らないように）
    markReplace();
    router.replace(`/groups/view?id=${g.id}&created=1`);
  };

  return (
    <form onSubmit={submit} className="mx-auto max-w-md space-y-5">
      <h1 className="sr-only">グループをつくる</h1>

      {/* できあがりの見本 */}
      <div className="flex items-center justify-center gap-3 py-2">
        <span
          className="flex h-14 w-14 items-center justify-center rounded-full text-white transition-colors"
          style={{ background: color }}
        >
          <GroupIcon className="h-8 w-8" />
        </span>
        <span className="max-w-[60%] truncate text-xl font-extrabold text-ink">{name.trim() || 'グループの名前'}</span>
      </div>

      <div>
        <label htmlFor="group-name" className="mb-1 block text-sm font-semibold text-ink-soft">
          名前
        </label>
        <input
          id="group-name"
          value={name}
          maxLength={MAX_NAME}
          onChange={(e) => setName(e.target.value)}
          placeholder="例：大学の旅サークル"
          enterKeyHint="done"
          autoComplete="off"
          className="w-full min-h-11 rounded-xl border border-line-soft bg-surface px-3 py-2 text-base text-ink outline-none focus:border-blue-400"
        />
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-semibold text-ink-soft">色</legend>
        <div className="flex flex-wrap gap-2">
          {GROUP_COLORS.map((c, i) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              aria-pressed={color === c}
              aria-label={`色 ${i + 1}`}
              className={`flex h-11 w-11 items-center justify-center rounded-full border-[3px] ${
                color === c ? 'border-[var(--line)]' : 'border-transparent'
              }`}
            >
              <span className="h-8 w-8 rounded-full" style={{ background: c }} />
            </button>
          ))}
        </div>
      </fieldset>

      <button type="submit" disabled={!ok || saving} className="t-btn t-btn-primary w-full disabled:opacity-50">
        {saving ? 'つくっています…' : 'つくって招待リンクを出す'}
      </button>
      <DemoNote />
    </form>
  );
}
