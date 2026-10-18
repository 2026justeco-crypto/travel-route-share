'use client';

// グループのページ（依頼9で試作・依頼12でサーバー版）：/groups/view?id=…
//   そのグループに見せた旅行・写真を、地図（A＝タイル地図／くわしい地図、B＝地球儀の地図。トップと同じ部品）と一覧で見る。
//   メンバー一覧・招待リンク（コピー・作り直し）・抜ける（作った人は消す）。
//   メンバーでない人には中身を出さない（守りは RLS。メンバーでなければグループも旅行も返ってこない）。
//   ★確認は window.confirm を使わず、その場で「本当に？」のボタンを出す（2回押し）。
import { Suspense, useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { Group, Post, Trip } from '@/lib/types';
import { deleteGroup, getGroup, inviteUrl, isOwner, leaveGroup, regenerateInvite } from '@/lib/groups';
import { listGroupPosts, listGroupTrips } from '@/lib/store';
import { useAuth } from '@/lib/supabase';
import { photoUrls } from '@/lib/photos';
import { markReplace } from '@/lib/navTrail';
import { useTheme } from '@/lib/useTheme';
import type { MapPin } from '@/components/JapanMap';
import TopTileMap from '@/components/TopTileMap';
import { BookIcon, GroupIcon, LinkIcon, RouteIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading h-[420px]" />,
});

const SMALL_BTN =
  'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold transition';

function InvitePanel({
  group,
  onRegenerated,
  highlight,
}: {
  group: Group;
  onRegenerated: (code: string) => void;
  highlight: boolean;
}) {
  const url = inviteUrl(group.inviteCode);
  const [copied, setCopied] = useState(false);
  const [confirmRegen, setConfirmRegen] = useState(false);
  const [regenError, setRegenError] = useState('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // 書き込めない環境では、欄を選んで手でコピーしてもらう
      const el = document.getElementById('invite-url') as HTMLInputElement | null;
      el?.select();
      setCopied(false);
    }
  };

  return (
    <section
      aria-label="招待リンク"
      className={`t-card space-y-2 p-4 ${highlight ? 'ring-4 ring-[var(--accent)]' : ''}`}
    >
      <h2 className="flex items-center gap-1.5 font-extrabold text-ink">
        <LinkIcon className="h-5 w-5 text-link" />
        招待リンク
      </h2>
      <p className="text-sm text-muted">このリンクを知っている人だけが参加できます。LINE などで送ってください。</p>
      <div className="flex gap-2">
        <input
          id="invite-url"
          readOnly
          value={url}
          aria-label="招待リンク"
          onFocus={(e) => e.currentTarget.select()}
          className="min-h-11 w-full min-w-0 rounded-xl border border-line-soft bg-surface-2 px-3 text-sm text-ink"
        />
        <button
          type="button"
          onClick={copy}
          className={`${SMALL_BTN} shrink-0 border-transparent bg-primary text-on-primary`}
        >
          {copied ? 'コピーしました' : 'コピー'}
        </button>
      </div>
      {isOwner(group) &&
        (confirmRegen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2 text-sm">
            <span className="text-ink">今のリンクは使えなくなります。</span>
            <button
              type="button"
              onClick={async () => {
                setRegenError('');
                try {
                  const code = await regenerateInvite(group.id);
                  setConfirmRegen(false);
                  setCopied(false);
                  onRegenerated(code);
                } catch {
                  setRegenError('作り直せませんでした。もう一度押してください。');
                }
              }}
              className={`${SMALL_BTN} border-red-300 text-red-500`}
            >
              作り直す
            </button>
            <button type="button" onClick={() => setConfirmRegen(false)} className={`${SMALL_BTN} border-line-soft text-muted`}>
              やめる
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmRegen(true)}
            className="min-h-11 px-1 text-sm font-bold text-link underline"
          >
            リンクを作り直す（古いリンクを使えなくする）
          </button>
        ))}
      {regenError && (
        <p role="alert" className="text-sm font-bold text-red-500">
          {regenError}
        </p>
      )}
    </section>
  );
}

function GroupDetail({ id, created }: { id: string; created: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  // undefined＝読み込み中
  const [group, setGroup] = useState<Group | null | undefined>(undefined);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [left, setLeft] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const [outError, setOutError] = useState('');
  const [flashId, setFlashId] = useState<string | null>(null);
  const me = useAuth().userId;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // メンバーでなければ、グループも旅行・写真も RLS で返ってこない
        const [g, ts, ps] = await Promise.all([getGroup(id), listGroupTrips(id), listGroupPosts(id)]);
        if (!alive) return;
        setGroup(g);
        setTrips(ts);
        setPosts(ps);
        const ids = [...ps.map((p) => p.photoId), ...ts.flatMap((t) => t.spots.map((s) => s.photoId))].filter(
          (x): x is string => !!x,
        );
        if (ids.length) {
          const ph = await photoUrls(ids);
          if (alive) setPhotos(ph);
        }
      } catch {
        if (!alive) return;
        setLoadError(true);
        setGroup(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const pins: MapPin[] = useMemo(() => {
    const fromPosts = posts.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      title: p.title,
      comment: p.comment,
      userName: p.userName,
      photoUrl: p.photoId ? (photos.get(p.photoId) ?? null) : null,
      date: p.date,
      isMine: p.userId === me,
    }));
    // 旅行は最初に位置が入っているスポットに1本だけ立てる
    const fromTrips = trips.flatMap((t) => {
      const s = t.spots.find((x) => x.lat !== null && x.lng !== null);
      if (!s || s.lat === null || s.lng === null) return [];
      return [
        {
          id: t.id,
          lat: s.lat,
          lng: s.lng,
          title: t.title,
          comment: t.spots.map((x) => x.name).join(' → '),
          userName: t.userName,
          photoUrl: null,
          date: t.startDate,
          isMine: t.userId === me,
        },
      ];
    });
    return [...fromTrips, ...fromPosts];
  }, [posts, trips, photos, me]);

  if (group === undefined) return <PageSkeleton />;

  if (loadError)
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-extrabold text-ink">グループを読み込めませんでした</p>
        <p className="text-sm text-muted">通信のよいところで、開き直してください。</p>
        <Link href="/groups" className="t-btn t-btn-secondary w-full">
          グループの一覧へ
        </Link>
      </div>
    );

  // メンバーでない人・無いグループ：どちらも同じ画面（グループがあるかどうかも分からないように）
  if (group === null)
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-extrabold text-ink">{left ? 'グループを抜けました' : 'このグループのメンバーではありません'}</p>
        <p className="text-sm text-muted">
          グループの旅行と写真は、メンバーだけが見られます。入るには、メンバーから招待リンクをもらってください。
          {left
            ? 'あなたがこのグループに見せていた旅行と写真は、グループに残っています。見せたくなければ、その旅行の「編集」で見せる先を変えるか、消してください。'
            : ''}
        </p>
        <Link href="/groups" className="t-btn t-btn-secondary w-full">
          グループの一覧へ
        </Link>
      </div>
    );

  const owner = isOwner(group);
  const onRegenerated = (code: string) => setGroup({ ...group, inviteCode: code });

  const leaveOrDelete = async () => {
    setOutError('');
    try {
      if (owner) {
        if (!(await deleteGroup(group.id))) throw new Error('not deleted');
        markReplace();
        router.replace('/groups');
        return;
      }
      if (!(await leaveGroup(group.id))) throw new Error('not left');
      setLeft(true);
      setConfirmOut(false);
      setGroup(null);
      setTrips([]);
      setPosts([]);
      setPhotos(new Map());
    } catch {
      setOutError(owner ? '消せませんでした。もう一度押してください。' : '抜けられませんでした。もう一度押してください。');
    }
  };

  const openPost = (postId: string) => {
    document.getElementById(`gpost-${postId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setFlashId(postId);
    window.setTimeout(() => setFlashId((cur) => (cur === postId ? null : cur)), 1600);
  };

  const detailMap = (
    <>
      <JapanMap pins={pins} height="420px" />
      <p className="mt-1.5 text-xs text-muted">ピンを押すと旅行と写真の名前が見られます。</p>
    </>
  );

  return (
    <div className="space-y-6">
      {/* 見出し */}
      <div className="flex items-center gap-3">
        <span
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-white"
          style={{ background: group.color }}
        >
          <GroupIcon className="h-8 w-8" />
        </span>
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-extrabold text-ink">{group.name}</h1>
          <p className="text-sm text-muted">
            メンバー {group.members.length}人・旅行 {trips.length}・写真 {posts.length}
          </p>
        </div>
      </div>

      {created && (
        <p className="rounded-xl bg-tint px-3 py-2 text-sm font-bold text-ink">
          グループができました。下の招待リンクを、入ってほしい人に送りましょう。
        </p>
      )}

      {/* このグループに足す（見せる先にこのグループが入った状態で開く） */}
      <div className="grid grid-cols-2 gap-3">
        <Link href={`/trips/new?mode=omoide&group=${group.id}`} className="t-btn t-btn-primary whitespace-nowrap px-2" style={{ fontSize: '1rem', gap: '0.35rem' }}>
          <BookIcon className="t-btn-icon h-5 w-5" />
          思い出を足す
        </Link>
        <Link href={`/trips/new?group=${group.id}`} className="t-btn t-btn-secondary whitespace-nowrap px-2" style={{ fontSize: '1rem', gap: '0.35rem' }}>
          <RouteIcon className="t-btn-icon h-5 w-5" />
          ルートを足す
        </Link>
      </div>

      {created && <InvitePanel group={group} onRegenerated={onRegenerated} highlight />}

      {/* 地図：トップと同じ部品 */}
      {theme === 'a' ? (
        <TopTileMap posts={posts} trips={trips} allTrips={trips} photos={photos} onOpenPost={openPost} detailMap={detailMap} />
      ) : (
        <section>{detailMap}</section>
      )}

      {/* 旅行 */}
      <section>
        <h2 className="mb-3 text-lg font-extrabold text-ink">このグループの旅行</h2>
        {trips.length === 0 ? (
          <div className="rounded-xl border border-dashed border-line-soft bg-surface p-6 text-center text-sm text-muted">
            まだありません。「思い出を足す」から、このグループに見せる思い出をつくれます。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips.map((t) => {
              const thumbId = t.spots.find((s) => s.photoId)?.photoId;
              const thumb = thumbId ? photos.get(thumbId) : null;
              return (
                <Link key={t.id} href={`/trips/view?id=${t.id}`} className="t-card group overflow-hidden transition hover:-translate-y-0.5">
                  {thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt={t.title} className="h-32 w-full object-cover" />
                  )}
                  <div className="p-3">
                    <div className="flex items-center gap-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          t.status === 'plan' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
                        }`}
                      >
                        {t.status === 'plan' ? 'これから行く' : '思い出'}
                      </span>
                      <span className="text-xs text-muted">
                        {t.startDate}
                        {t.endDate && t.endDate !== t.startDate ? ` 〜 ${t.endDate}` : ''}
                      </span>
                    </div>
                    <div className="mt-1 font-bold text-ink group-hover:text-primary">{t.title}</div>
                    <div className="mt-1 truncate text-xs text-muted">{t.spots.map((s) => s.name).join(' → ')}</div>
                    <div className="mt-2 text-xs text-muted">{t.userName}</div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* 写真 */}
      {posts.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-extrabold text-ink">このグループの写真</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {posts.map((p) => {
              const photo = p.photoId ? photos.get(p.photoId) : null;
              return (
                <div
                  key={p.id}
                  id={`gpost-${p.id}`}
                  className={`t-card scroll-mt-20 overflow-hidden ${flashId === p.id ? 'ring-4 ring-[var(--accent)]' : ''}`}
                >
                  <div className="h-28 w-full bg-surface-2">
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={photo} alt={p.title} className="h-full w-full object-cover" />
                    )}
                  </div>
                  <div className="p-2.5">
                    <div className="text-sm font-bold leading-tight text-ink">{p.title}</div>
                    <div className="mt-0.5 text-xs text-muted">
                      {p.prefecture} ・ {p.userName}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* メンバー */}
      <section>
        <h2 className="mb-2 text-lg font-extrabold text-ink">メンバー（{group.members.length}人）</h2>
        <ul className="t-card divide-y divide-[var(--line-soft)] overflow-hidden">
          {group.members.map((m) => (
            <li key={m.id} className="flex min-h-12 items-center gap-2 px-3 py-2">
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-sm font-bold text-ink"
              >
                {m.name.slice(0, 1)}
              </span>
              <span className="min-w-0 flex-1 truncate font-bold text-ink">
                {m.id === me ? `あなた（${m.name}）` : m.name}
              </span>
              {m.id === group.ownerId && (
                <span className="shrink-0 rounded-full bg-tint px-2 py-0.5 text-xs font-bold text-link">作った人</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {!created && <InvitePanel group={group} onRegenerated={onRegenerated} highlight={false} />}

      {/* 抜ける／消す */}
      <section className="space-y-2 border-t border-line-soft pt-4">
        {confirmOut ? (
          <div className="space-y-2 rounded-xl border-2 border-red-300 bg-surface p-3">
            <p className="text-sm text-ink">
              {owner
                ? 'グループを消すと、メンバー全員がこのグループを見られなくなります。旅行と写真そのものは、それぞれの人の手元に残ります。'
                : '抜けると、このグループの旅行と写真は見られなくなります。あなたがこのグループに見せていた旅行と写真は、グループに残ります（見せたくなければ、抜ける前に見せる先を変えるか消してください）。'}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={leaveOrDelete} className={`${SMALL_BTN} border-red-400 bg-red-500 text-white`}>
                {owner ? 'グループを消す' : 'グループを抜ける'}
              </button>
              <button type="button" onClick={() => setConfirmOut(false)} className={`${SMALL_BTN} border-line-soft text-muted`}>
                やめる
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmOut(true)}
            className={`${SMALL_BTN} border-red-300 text-red-500 hover:bg-red-500/10`}
          >
            {owner ? 'グループを消す（作った人だけ）' : 'このグループを抜ける'}
          </button>
        )}
        {outError && (
          <p role="alert" className="text-sm font-bold text-red-500">
            {outError}
          </p>
        )}
        {owner && <p className="text-xs text-muted">作った人は抜けられません（消すことはできます）。</p>}
      </section>
    </div>
  );
}

function Gate() {
  const params = useSearchParams();
  const id = params.get('id') ?? '';
  const created = params.get('created') === '1';
  return <GroupDetail key={id} id={id} created={created} />;
}

export default function GroupViewPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Gate />
    </Suspense>
  );
}
