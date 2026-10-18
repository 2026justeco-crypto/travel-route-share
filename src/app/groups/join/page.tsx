'use client';

// 招待リンクで入る画面（依頼9で試作・依頼12でサーバー版）：/groups/join?code=…
//   「○○に参加しますか？」→ 参加（初めてなら表示名も1回だけ聞く）→ そのグループのページへ。
//   コードが合わなければ「使えません」だけを出す（グループがあるかどうかも分からない）。
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { joinGroup, peekInvite, type InvitePeek } from '@/lib/groups';
import { markReplace } from '@/lib/navTrail';
import { GroupIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import NameField, { useNameAsk } from '@/components/NameField';

function Unusable({ offline = false }: { offline?: boolean }) {
  return (
    <div className="space-y-4 text-center">
      <p className="text-lg font-extrabold text-ink">{offline ? '招待リンクを確かめられませんでした' : 'この招待リンクは使えません'}</p>
      <p className="text-sm text-muted">
        {offline
          ? '通信のよいところで、もう一度開いてください。'
          : 'リンクが作り直されたか、グループが消された可能性があります。招待してくれた人に、新しいリンクをもらってください。'}
      </p>
      <Link href="/groups" className="t-btn t-btn-secondary w-full">
        グループの一覧へ
      </Link>
    </div>
  );
}

function Join() {
  const router = useRouter();
  const code = useSearchParams().get('code') ?? '';
  // undefined＝読み込み中／null＝そのリンクは使えない
  const [group, setGroup] = useState<InvitePeek | null | undefined>(undefined);
  const [offline, setOffline] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const me = useNameAsk();

  useEffect(() => {
    let alive = true;
    peekInvite(code)
      .then((g) => alive && setGroup(g))
      .catch(() => {
        if (!alive) return;
        setOffline(true);
        setGroup(null);
      });
    return () => {
      alive = false;
    };
  }, [code]);

  if (group === undefined) return <PageSkeleton />;
  if (group === null) return <Unusable offline={offline} />;

  const join = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const id = await joinGroup(code, me.value);
      if (!id) {
        // 見ている間に作り直された
        setGroup(null);
        return;
      }
      // 参加画面は履歴に残さない（グループのページの「戻る」で参加画面に戻らないように）
      markReplace();
      router.replace(`/groups/view?id=${id}`);
    } catch {
      setBusy(false);
      setError('参加できませんでした。通信のよいところで、もう一度押してください。');
    }
  };

  return (
    <div className="space-y-5 text-center">
      <span
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ background: group.color }}
      >
        <GroupIcon className="h-9 w-9" />
      </span>
      <div>
        <h1 className="text-2xl font-extrabold text-ink">{group.name}</h1>
        <p className="mt-1 text-sm text-muted">
          メンバー {group.memberCount}人・作った人：{group.ownerName}
        </p>
      </div>
      {group.already ? (
        <>
          <p className="font-bold text-ink">もう参加しています。</p>
          <Link href={`/groups/view?id=${group.groupId}`} className="t-btn t-btn-primary w-full">
            グループを見る
          </Link>
        </>
      ) : (
        <>
          <p className="text-lg font-bold text-ink">このグループに参加しますか？</p>
          <p className="text-sm text-muted">
            参加すると、メンバーが見せている旅行と写真が見られます。あなたの旅行は、見せる先に選んだものだけがこのグループに出ます。
          </p>
          {me.ask && <NameField name={me.name} setName={me.setName} />}
          <button
            type="button"
            onClick={join}
            disabled={busy || me.ask === undefined || (me.ask && !me.value)}
            className="t-btn t-btn-primary w-full disabled:opacity-50"
          >
            {busy ? '参加しています…' : '参加する'}
          </button>
          {error && (
            <p role="alert" className="text-sm font-bold text-red-500">
              {error}
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function JoinGroupPage() {
  return (
    <div className="mx-auto max-w-md">
      <Suspense fallback={<PageSkeleton />}>
        <Join />
      </Suspense>
    </div>
  );
}
