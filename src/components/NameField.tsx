'use client';

// 表示名を1回だけ聞く欄（依頼12）。グループをつくる・参加するときに出す。
//   匿名ログインの人は表示名がまだ「旅人」なので、メンバー一覧で見分けられるように聞く。初期値は「旅人＋4桁」。
//   1回聞いたら（profiles.name_asked）、次からは出さない。
import { useEffect, useState } from 'react';
import { displayNameToAsk } from '@/lib/groups';
import { LIMITS } from '@/lib/limits';
import CharLeft from '@/components/CharLeft';

const MAX = LIMITS.displayName;

/** 聞く必要があるか（undefined＝確かめ中）と、入力中の名前 */
export function useNameAsk() {
  const [ask, setAsk] = useState<boolean | undefined>(undefined);
  const [name, setName] = useState('');
  useEffect(() => {
    let alive = true;
    displayNameToAsk()
      .then((v) => {
        if (!alive) return;
        setAsk(v !== null);
        if (v) setName(v);
      })
      .catch(() => alive && setAsk(false));
    return () => {
      alive = false;
    };
  }, []);
  return { ask, name, setName, value: ask ? name.trim().slice(0, MAX) || null : null };
}

export default function NameField({ name, setName }: { name: string; setName: (v: string) => void }) {
  return (
    <div className="text-left">
      <label htmlFor="display-name" className="mb-1 block text-sm font-semibold text-ink-soft">
        あなたの表示名（メンバーに見えます）
      </label>
      <input
        id="display-name"
        value={name}
        maxLength={MAX}
        onChange={(e) => setName(e.target.value)}
        enterKeyHint="done"
        autoComplete="off"
        className="w-full min-h-11 rounded-xl border border-line-soft bg-surface px-3 py-2 text-base text-ink outline-none focus:border-blue-400"
      />
      <CharLeft value={name} max={MAX} />
      <p className="mt-1 text-xs text-muted">本名でなくてかまいません。聞くのはこの1回だけです。</p>
    </div>
  );
}
