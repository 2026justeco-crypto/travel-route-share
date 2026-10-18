'use client';

import { Suspense, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { Trip } from '@/lib/types';
import { getTrip, saveTrip, deleteTrip, isFavorite, toggleFavorite } from '@/lib/store';
import { useAuth } from '@/lib/supabase';
import { photoUrls } from '@/lib/photos';
import PhotoImg from '@/components/PhotoImg';
import type { RoutePoint } from '@/components/JapanMap';
import { ModeIcon, StarIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { MODE_COLOR, TRANSPORT_LABEL, routeFromSpots } from '@/lib/transport';
import { useTheme } from '@/lib/useTheme';
import { useMounted } from '@/lib/useMounted';
import { sharedGroupsVisible, type GroupBrief } from '@/lib/groups';
import { GroupDot, ShareIcon } from '@/components/ShareToPicker';
import ReportLink from '@/components/ReportLink';

// スマホでは地図を先に・画面の半分ほどで出す（ルートをすぐ確かめられるように）
const MAP_HEIGHT = 'min(52vh, 560px)';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading" style={{ height: MAP_HEIGHT }} />,
});

function TripDetail({ id }: { id: string }) {
  const router = useRouter();
  // undefined＝読み込み中／null＝無い・見られない（自分だけの旅行を他の人が開いたときも、RLS で「無い」になる）
  const [trip, setTrip] = useState<Trip | null | undefined>(undefined);
  // 見せているグループのうち、自分が入っているもの（メンバーでないグループは RLS で返らない）
  const [shareGroups, setShareGroups] = useState<GroupBrief[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [fav, setFav] = useState(false);
  const [photos, setPhotos] = useState<Map<string, string>>(new Map());
  const [photosLoading, setPhotosLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [actionError, setActionError] = useState('');
  const theme = useTheme();
  const me = useAuth().userId;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const t = await getTrip(id);
        if (!alive) return;
        if (!t) {
          setTrip(null);
          return;
        }
        setTrip(t);
        const [f, gs] = await Promise.all([
          isFavorite(id).catch(() => false),
          t.visibility === 'groups' ? sharedGroupsVisible('trip', id).catch(() => []) : Promise.resolve([]),
        ]);
        if (!alive) return;
        setFav(f);
        setShareGroups(gs);
      } catch {
        if (alive) {
          setLoadError(true);
          setTrip(null);
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [id]);

  const photoKey = (trip?.spots ?? []).map((s) => s.photoId ?? '').join(',');
  useEffect(() => {
    const ids = photoKey.split(',').filter(Boolean);
    if (!ids.length) return;
    let alive = true;
    // 写真はまとめて署名付きURLにする（見てはいけない写真は返ってこない＝RLS）
    photoUrls(ids).then((m) => {
      if (!alive) return;
      setPhotos(m);
      setPhotosLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [photoKey]);

  if (trip === undefined) return <PageSkeleton />;

  if (trip === null)
    return (
      <div className="text-sm text-muted">
        {loadError
          ? '旅行を読み込めませんでした。通信のよいところで開き直してください。'
          : '旅行が見つかりません（消されたか、作った人や見せる先のグループのメンバーだけが見られる旅行です）。'}
        <Link href="/" className="text-link underline">トップへ戻る</Link>
      </div>
    );

  const route: RoutePoint[] = routeFromSpots(trip.spots);

  const center: [number, number] =
    route.length > 0
      ? [
          route.reduce((a, r) => a + r.lat, 0) / route.length,
          route.reduce((a, r) => a + r.lng, 0) / route.length,
        ]
      : [37.5, 137.0];

  // 編集・削除のボタンは自分の旅行にだけ出す（出さないのは見た目の都合。守りは RLS）
  const isMine = !!me && trip.userId === me;

  const markDone = async () => {
    setActionError('');
    try {
      setTrip(await saveTrip({ ...trip, status: 'done' }));
    } catch {
      setActionError('保存できませんでした。もう一度押してください。');
    }
  };

  const remove = async () => {
    setActionError('');
    try {
      const ok = await deleteTrip(trip.id);
      if (!ok) throw new Error('not deleted');
      router.push('/');
    } catch {
      setConfirmDelete(false);
      setActionError('削除できませんでした。もう一度押してください。');
    }
  };

  const onFav = async () => {
    const before = fav;
    setFav(!before);
    try {
      setFav(await toggleFavorite(trip.id, 'trip'));
    } catch {
      setFav(before);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                trip.status === 'plan' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'
              }`}
            >
              {trip.status === 'plan' ? 'これから行く' : '思い出'}
            </span>
            <span className="text-sm text-muted">
              {trip.startDate}
              {trip.endDate && trip.endDate !== trip.startDate ? ` 〜 ${trip.endDate}` : ''}
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-bold">{trip.title}</h1>
          <div className="mt-1 text-sm text-muted">作った人：{trip.userName}</div>
          {/* 見せる先：自分の旅行は全体／グループ／自分だけを出す。グループは押すとそのグループのページへ */}
          {(isMine || shareGroups.length > 0) && (
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs font-bold text-muted">
              <span>見せる先：</span>
              {shareGroups.length === 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2 py-0.5">
                  <ShareIcon visibility={trip.visibility ?? 'public'} className="h-3.5 w-3.5" />
                  {trip.visibility === 'public' ? '全体' : trip.visibility === 'groups' ? 'グループ' : '自分だけ'}
                </span>
              ) : (
                shareGroups.map((g) => (
                  <Link
                    key={g.id}
                    href={`/groups/view?id=${g.id}`}
                    className="inline-flex min-h-8 items-center gap-1 rounded-full border-2 bg-surface px-2.5 text-ink"
                    style={{ borderColor: g.color }}
                  >
                    <GroupDot color={g.color} className="h-2.5 w-2.5" />
                    {g.name}
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onFav}
            aria-pressed={fav}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border-2 px-4 text-sm font-bold ${
              fav ? 'border-amber-400 bg-amber-400/15 text-amber-600' : 'border-line-soft text-ink-soft hover:bg-surface-2'
            }`}
          >
            <StarIcon filled={fav} className={`h-5 w-5 ${fav ? 'text-amber-500' : ''}`} />
            {fav ? 'お気に入り済み' : 'お気に入り'}
          </button>
          {isMine && trip.status === 'plan' && (
            <button
              type="button"
              onClick={markDone}
              className="min-h-11 rounded-full bg-emerald-600 px-4 text-sm font-bold text-white shadow-md hover:bg-emerald-700"
            >
              行ってきた：思い出にする
            </button>
          )}
          {isMine && (
            <>
              <Link
                href={`/trips/edit?id=${trip.id}`}
                className="inline-flex min-h-11 items-center rounded-full border-2 border-blue-600 px-4 text-sm font-bold text-link hover:bg-tint"
              >
                編集
              </Link>
              {confirmDelete ? (
                <span className="inline-flex flex-wrap items-center gap-2 rounded-full bg-surface-2 py-1 pl-3 pr-1 text-sm">
                  <span className="font-bold text-ink">本当に削除しますか？</span>
                  <button
                    type="button"
                    onClick={remove}
                    className="min-h-11 rounded-full bg-red-500 px-4 text-sm font-bold text-white"
                  >
                    削除する
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="min-h-11 rounded-full border-2 border-line-soft px-4 text-sm font-bold text-muted"
                  >
                    やめる
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="min-h-11 rounded-full border-2 border-red-300 px-4 text-sm font-bold text-red-500 hover:bg-red-500/10"
                >
                  削除
                </button>
              )}
            </>
          )}
        </div>
        {actionError && (
          <p role="alert" className="w-full text-sm font-bold text-red-500">
            {actionError}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        {/* 地図（スマホでは先に・PCでは右） */}
        <div className="order-first lg:order-none lg:col-span-3 lg:col-start-3 lg:row-start-1">
          <JapanMap
            route={route}
            center={center}
            zoom={route.length ? 11 : 5}
            height={MAP_HEIGHT}
            fitRoute
            roadRoute
            fitButton
          />
          {route.length < trip.spots.length && (
            <p className="mt-1.5 text-sm text-muted">
              {isMine
                ? '位置が入っていないスポットは地図に出ません（「編集」で入れられます）。'
                : '位置を出していないスポットは地図に出ません。'}
            </p>
          )}
          {/* 持ち主にだけ：ほかの人にはぼかした位置で見せていること（依頼13） */}
          {isMine && route.length > 0 && (
            <p className="mt-1.5 text-xs text-muted">
              ほかの人には、位置を少しぼかして見せています（ルートの線もぼかした点どうしで引きます）。
              {trip.hiddenSpotIds?.length ? '自宅の近くのスポットは、ほかの人には地図に出しません。' : ''}
            </p>
          )}
        </div>

        {/* ルート（左） */}
        <div className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
          <ol className="space-y-0">
            {trip.spots.map((s, i) => {
              return (
                <li key={s.id}>
                  <div className="rounded-xl border border-line-soft bg-surface p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                        {i + 1}
                      </span>
                      <span className="font-bold">{s.name}</span>
                      {s.lat === null && (
                        <span className="rounded bg-surface-2 px-1.5 py-0.5 text-xs text-muted">位置なし</span>
                      )}
                      {isMine && trip.hiddenSpotIds?.includes(s.id) && (
                        <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs font-bold text-amber-600">
                          自宅の近く：ほかの人には位置を出していません
                        </span>
                      )}
                    </div>
                    <PhotoImg
                      photoId={s.photoId}
                      urls={photos}
                      loading={photosLoading}
                      alt={s.name}
                      className="mt-2 h-36 w-full rounded-lg object-cover"
                    />
                    {s.memo && <p className="mt-2 whitespace-pre-wrap text-sm text-muted">{s.memo}</p>}
                  </div>
                  {i < trip.spots.length - 1 &&
                    (s.moveTo ? (
                      <div
                        className="flex items-center justify-center gap-1.5 py-1.5 text-sm font-bold"
                        style={{ color: MODE_COLOR[theme][s.moveTo] }}
                      >
                        <span className="text-lg leading-none">↓</span>
                        <ModeIcon mode={s.moveTo} className="h-5 w-5" />
                        <span className="text-ink-soft">{TRANSPORT_LABEL[s.moveTo]}</span>
                      </div>
                    ) : (
                      <div className="py-1 text-center text-lg leading-none text-blue-400">↓</div>
                    ))}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* 通報（依頼14）：ほかの人の旅行にだけ、いちばん下に小さく */}
      {!isMine && (
        <div className="flex justify-end border-t border-line-soft pt-2">
          <ReportLink kind="trip" id={trip.id} title={trip.title} />
        </div>
      )}
    </div>
  );
}

function TripDetailGate() {
  const id = useSearchParams().get('id') ?? '';
  const mounted = useMounted();
  if (!mounted) return <PageSkeleton />;
  return <TripDetail key={id} id={id} />;
}

export default function TripDetailPage() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <TripDetailGate />
    </Suspense>
  );
}
