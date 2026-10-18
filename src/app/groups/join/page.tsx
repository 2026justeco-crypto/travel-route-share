'use client';

// 招待リンクで入る画面（依頼9）：/groups/join?code=…
//   「○○に参加しますか？」→ 参加 → そのグループのページへ。
//   ★試作：同じブラウザの中にあるグループにだけ入れる（ほかの人の端末で作ったグループはここに無い）。
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Group } from '@/lib/types';
import { findGroupByCode, isMember, joinGroup, seedAll } from '@/lib/groups';
import { markReplace } from '@/lib/navTrail';
import { GroupIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import DemoNote from '@/components/DemoNote';

function Join() {
  const router = useRouter();
  const code = useSearchParams().get('code') ?? '';
  // undefined＝読み込み中／null＝そのリンクのグループが無い
  const [group, setGroup] = useState<Group | null | undefined>(undefined);

  useEffect(() => {
    (async () => {
      await seedAll();
      setGroup(findGroupByCode(code) ?? null);
    })();
  }, [code]);

  if (group === undefined) return <PageSkeleton />;

  if (group === null)
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-extrabold text-ink">この招待リンクは使えません</p>
        <p className="text-sm text-muted">
          リンクが作り直されたか、グループが消された可能性があります。招待してくれた人に、新しいリンクをもらってください。
        </p>
        <Link href="/groups" className="t-btn t-btn-secondary w-full">
          グループの一覧へ
        </Link>
        <DemoNote className="text-left" />
      </div>
    );

  const already = isMember(group);

  const join = () => {
    joinGroup(group.id);
    // 参加画面は履歴に残さない（グループのページの「戻る」で参加画面に戻らないように）
    markReplace();
    router.replace(`/groups/view?id=${group.id}`);
  };

  const owner = group.members.find((m) => m.id === group.ownerId);

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
          メンバー {group.members.length}人{owner ? `・作った人：${owner.name}` : ''}
        </p>
      </div>
      {already ? (
        <>
          <p className="font-bold text-ink">もう参加しています。</p>
          <Link href={`/groups/view?id=${group.id}`} className="t-btn t-btn-primary w-full">
            グループを見る
          </Link>
        </>
      ) : (
        <>
          <p className="text-lg font-bold text-ink">このグループに参加しますか？</p>
          <p className="text-sm text-muted">
            参加すると、メンバーが見せている旅行と写真が見られます。あなたの旅行は、見せる先に選んだものだけがこのグループに出ます。
          </p>
          <button type="button" onClick={join} className="t-btn t-btn-primary w-full">
            参加する
          </button>
        </>
      )}
      <DemoNote className="text-left" />
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
