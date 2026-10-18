'use client';

// グループの一覧（依頼9）。自分が入っているグループ＋「つくる」。
// ★試作：グループはこの端末の中だけ。ほかの人の端末には届かない（画面にも書く）。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Group } from '@/lib/types';
import { groupPosts, groupTrips, isMember, isOwner, listGroups, seedAll } from '@/lib/groups';
import { GroupIcon, LinkIcon, PlusIcon } from '@/components/icons';
import { GroupDot } from '@/components/ShareToPicker';
import { PageSkeleton } from '@/components/Skeleton';
import DemoNote from '@/components/DemoNote';

interface Row {
  group: Group;
  trips: number;
  posts: number;
}

export default function GroupsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    (async () => {
      await seedAll();
      setRows(
        listGroups().map((group) => ({
          group,
          trips: groupTrips(group.id).length,
          posts: groupPosts(group.id).length,
        })),
      );
    })();
  }, []);

  const mine = rows?.filter((r) => isMember(r.group)) ?? [];
  // 試作用：この端末にあるが自分が入っていないグループ＝「届いた招待リンク」のかわり
  const invites = rows?.filter((r) => !isMember(r.group)) ?? [];

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-extrabold">グループ</h1>
      </div>
      <p className="-mt-3 text-sm text-muted">なかまだけで、旅行と思い出を見せあえます。</p>

      <Link href="/groups/new" className="t-btn t-btn-primary w-full">
        <PlusIcon className="t-btn-icon h-6 w-6" />
        グループをつくる
      </Link>
      <DemoNote />

      {rows === null ? (
        <PageSkeleton />
      ) : (
        <>
          <section>
            <h2 className="mb-2 text-lg font-extrabold">入っているグループ</h2>
            {mine.length === 0 ? (
              <div className="rounded-xl border border-dashed border-line-soft bg-surface p-6 text-center text-sm text-muted">
                まだありません。つくるか、招待リンクから参加してください。
              </div>
            ) : (
              <ul className="space-y-3">
                {mine.map(({ group: g, trips, posts }) => (
                  <li key={g.id}>
                    <Link
                      href={`/groups/view?id=${g.id}`}
                      className="t-card flex min-h-16 items-center gap-3 p-3 transition hover:-translate-y-0.5"
                    >
                      <span
                        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-white"
                        style={{ background: g.color }}
                      >
                        <GroupIcon className="h-6 w-6" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-extrabold text-ink">{g.name}</span>
                        <span className="block text-xs text-muted">
                          メンバー {g.members.length}人・旅行 {trips}・写真 {posts}
                          {isOwner(g) ? '・あなたが作成' : ''}
                        </span>
                      </span>
                      <span aria-hidden className="text-xl text-muted">›</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {invites.length > 0 && (
            <section>
              <h2 className="mb-1 text-lg font-extrabold">届いた招待（見本）</h2>
              <p className="mb-2 text-xs text-muted">
                試作なので、ほかの人からの招待リンクのかわりに見本を置いています。押すと招待リンクを開いたときの画面になります。
              </p>
              <ul className="space-y-2">
                {invites.map(({ group: g }) => (
                  <li key={g.id}>
                    <Link
                      href={`/groups/join?code=${encodeURIComponent(g.inviteCode)}`}
                      className="flex min-h-12 items-center gap-2 rounded-xl border-2 border-dashed border-line-soft bg-surface px-3 py-2 hover:border-primary"
                    >
                      <LinkIcon className="h-5 w-5 shrink-0 text-link" />
                      <GroupDot color={g.color} />
                      <span className="min-w-0 flex-1 truncate font-bold text-ink">{g.name}の招待リンク</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
