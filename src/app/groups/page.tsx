'use client';

// グループの一覧（依頼9で試作・依頼12でサーバー版）。自分が入っているグループ＋「つくる」。
//   入るのは招待リンクから（ここには出さない＝コードを知っている人だけ）。
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { groupCounts, isOwner, myGroups, type GroupBrief } from '@/lib/groups';
import { useAuth } from '@/lib/supabase';
import { GroupIcon, PlusIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';

interface Row {
  group: GroupBrief;
  trips: number;
  posts: number;
}

export default function GroupsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  // 自分が作ったかの表示に使う（読み込み後に分かる）
  useAuth();

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const gs = await myGroups();
        const counts = await groupCounts(gs.map((g) => g.id));
        if (!alive) return;
        setRows(gs.map((group) => ({ group, ...(counts.get(group.id) ?? { trips: 0, posts: 0 }) })));
      } catch {
        if (!alive) return;
        setLoadError(true);
        setRows([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

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

      {rows === null ? (
        <PageSkeleton />
      ) : (
        <section>
          <h2 className="mb-2 text-lg font-extrabold">入っているグループ</h2>
          {loadError ? (
            <div className="rounded-xl border border-dashed border-line-soft bg-surface p-6 text-center text-sm text-muted">
              グループを読み込めませんでした。通信のよいところで開き直してください。
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-soft bg-surface p-6 text-center text-sm text-muted">
              まだありません。つくるか、メンバーから招待リンクをもらって参加してください。
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map(({ group: g, trips, posts }) => (
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
                        メンバー {g.memberCount}人・旅行 {trips}・写真 {posts}
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
      )}
    </div>
  );
}
