'use client';

// 設定（依頼13）：自宅のあたりを地図で1点登録する・消す。
//   入口はヘッダー右端の歯車とフッター（下部タブは増やさない）。保存の前の案内「自宅を登録する」からも来る。
//   登録した点は本人だけが読める表（profiles_private・RLS）。登録・変更・消すと、サーバーが自分の旅行・投稿のぼかしを作り直す。
// すべてのデータを消す（依頼14）：2回押し。写真→サーバーの残り（rpc delete_my_data）→この端末の順に消し、ログアウトする（lib/deleteMe.ts）。
import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { clearHome, getHome, setHome } from '@/lib/home';
import { deleteAllMyData, type DeleteResult } from '@/lib/deleteMe';
import { searchPlaces, shortLabel, type PlaceHit } from '@/lib/geocode';
import { nearestPrefecture } from '@/lib/regions';
import { PinIcon, SearchIcon } from '@/components/icons';
import { PageSkeleton } from '@/components/Skeleton';
import { useMounted } from '@/lib/useMounted';

const MAP_HEIGHT = 'min(52vh, 420px)';

const JapanMap = dynamic(() => import('@/components/JapanMap'), {
  ssr: false,
  loading: () => <div className="trs-map trs-map-loading" style={{ height: MAP_HEIGHT }} />,
});

type Point = { lat: number; lng: number };

function HomeSettings() {
  // undefined＝読み込み中
  const [saved, setSaved] = useState<Point | null | undefined>(undefined);
  const [picked, setPicked] = useState<Point | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[] | null>(null);
  const [searchBusy, setSearchBusy] = useState(false);
  // 地図は開いたときの位置で描くので、名前で探して選んだときは描き直してその場所へ寄せる
  const [mapKey, setMapKey] = useState(0);

  useEffect(() => {
    let alive = true;
    getHome()
      .then((st) => {
        if (!alive) return;
        setSaved(st.home);
        setPicked(st.home);
      })
      .catch(() => {
        if (!alive) return;
        setLoadError(true);
        setSaved(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (saved === undefined) return <PageSkeleton />;

  const changed = !!picked && (!saved || picked.lat !== saved.lat || picked.lng !== saved.lng);

  const save = async () => {
    if (!picked) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await setHome(picked.lat, picked.lng);
      setSaved(picked);
      setMessage('自宅のあたりを登録しました。近くの場所は、ほかの人には表示しません（今までの旅行・投稿にも効きます）。');
    } catch {
      setError('登録できませんでした。通信のよいところで、もう一度押してください。');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await clearHome();
      setSaved(null);
      setPicked(null);
      setMessage('自宅の登録を消しました。隠していた場所は、ぼかした位置でほかの人に表示されます。');
    } catch {
      setError('消せませんでした。通信のよいところで、もう一度押してください。');
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    if (!query.trim() || searchBusy) return;
    setSearchBusy(true);
    try {
      setHits(await searchPlaces(query));
    } catch {
      setHits([]);
    } finally {
      setSearchBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
        <h2 className="text-lg font-extrabold">自宅のあたり</h2>
        <p className="text-sm text-ink-soft">
          登録すると、自宅から1km以内の場所は、ほかの人には地図にもルートの線にも出しません（名前・メモ・写真は出ます）。
          登録した場所は、あなたにしか見えません。
        </p>
        <p className="text-xs text-muted">
          登録しなくても、ほかの人には位置を少しぼかして見せています（あなたには正確な位置が見えます）。
        </p>
        {loadError && (
          <p role="alert" className="text-sm font-bold text-red-500">
            読み込めませんでした。通信のよいところで開き直してください。
          </p>
        )}
        <p className="text-sm font-bold text-ink">
          {saved ? `登録ずみ：${nearestPrefecture(saved.lat, saved.lng).name}のあたり` : 'まだ登録していません'}
        </p>

        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void search();
            }}
            placeholder="駅や町の名前で探す（例：吉祥寺駅）"
            aria-label="場所の名前"
            enterKeyHint="search"
            className="min-h-11 w-full min-w-0 rounded-xl border border-line-soft bg-surface px-3 py-2 text-base text-ink outline-none focus:border-blue-400"
          />
          <button
            type="button"
            onClick={() => void search()}
            disabled={!query.trim() || searchBusy}
            aria-label="探す"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full border border-blue-300 px-3 text-sm font-bold text-link disabled:opacity-50"
          >
            <SearchIcon className="h-5 w-5" />
            {searchBusy ? '…' : '探す'}
          </button>
        </div>
        {hits && (
          <div className="space-y-1 rounded-xl bg-tint p-2 text-sm">
            {hits.length === 0 && <p className="px-1 text-muted">見つかりませんでした。地図を押して選んでください。</p>}
            {hits.map((h, i) => (
              <button
                type="button"
                key={i}
                onClick={() => {
                  setPicked({ lat: h.lat, lng: h.lng });
                  setHits(null);
                  setMapKey((k) => k + 1);
                }}
                className="flex min-h-11 w-full items-center gap-1.5 rounded-lg bg-surface px-2.5 py-1.5 text-left text-ink-soft shadow-sm hover:bg-tint"
              >
                <PinIcon className="h-4 w-4 shrink-0 text-link" />
                {shortLabel(h.label)}
              </button>
            ))}
            {hits.length > 0 && <div className="text-right text-[10px] text-muted">検索: OpenStreetMap Nominatim</div>}
          </div>
        )}

        <p className="text-sm text-link">地図を押すと、その場所が「自宅のあたり」になります（家の真上でなくてかまいません）。</p>
        <JapanMap
          key={mapKey}
          onPick={(lat, lng) => setPicked({ lat, lng })}
          picked={picked}
          center={picked ? [picked.lat, picked.lng] : undefined}
          zoom={picked ? 13 : undefined}
          height={MAP_HEIGHT}
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!changed || busy}
            className="min-h-11 flex-1 rounded-full bg-primary px-4 text-sm font-bold text-on-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? '保存しています…' : saved ? 'この場所に変える' : 'この場所を自宅のあたりにする'}
          </button>
          {saved && (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full border-2 border-red-300 px-4 text-sm font-bold text-red-500 disabled:opacity-50"
            >
              登録を消す
            </button>
          )}
        </div>
        {message && (
          <p role="status" className="text-sm font-bold text-emerald-600">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm font-bold text-red-500">
            {error}
          </p>
        )}
      </section>
    </div>
  );
}

function DeleteAll({ onDone }: { onDone: (r: DeleteResult) => void }) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      onDone(await deleteAllMyData());
    } catch {
      setBusy(false);
      setError('途中で消せませんでした。通信のよいところで、もう一度押してください（続きから消します）。');
    }
  };

  return (
    <section aria-labelledby="delete-all-title" className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
      <h2 id="delete-all-title" className="text-lg font-extrabold">
        すべてのデータを消す
      </h2>
      <p className="text-sm text-ink-soft">
        あなたの旅行・写真・お気に入り・グループの参加・自宅のあたりを、サーバーからすべて消して、この端末からもログアウトします。
        登録なしで使っているため、消したものは元に戻せません。
      </p>
      <p className="text-xs text-muted">
        あなたが作ったグループは、ほかにメンバーがいれば、いちばん前から入っている人に「作った人」を引き継ぎます（ほかの人の旅行と写真は消えません）。ほかにメンバーがいないグループは消します。
      </p>
      {confirm ? (
        <div className="space-y-2 rounded-xl border-2 border-red-300 bg-surface p-3">
          <p className="text-sm font-bold text-ink">本当にすべて消しますか？ 元に戻せません。</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-60"
            >
              {busy ? '消しています…' : 'すべて消す'}
            </button>
            <button
              type="button"
              onClick={() => setConfirm(false)}
              disabled={busy}
              className="min-h-11 flex-1 rounded-full border-2 border-line-soft px-4 text-sm font-bold text-muted"
            >
              やめる
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="min-h-11 w-full rounded-full border-2 border-red-300 px-4 text-sm font-bold text-red-500 hover:bg-red-500/10"
        >
          すべてのデータを消す
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm font-bold text-red-500">
          {error}
        </p>
      )}
    </section>
  );
}

function DeletedCard({ r }: { r: DeleteResult }) {
  const parts = [
    `旅行${r.trips}件`,
    `写真の投稿${r.posts}件`,
    `写真のファイル${r.photos}枚`,
    `お気に入り${r.favorites}件`,
    // 自分しかいなかったグループは、グループごと消えるので参加の行は数に入らない。足して「入っていたグループの数」にする
    `グループの参加${r.groupMembers + r.groupsDeleted}件`,
  ];
  return (
    <section role="status" className="space-y-3 rounded-xl border border-line-soft bg-surface p-4">
      <h2 className="text-lg font-extrabold">すべて消しました</h2>
      <p className="text-sm text-ink-soft">{parts.join('・')}を消し、この端末からもログアウトしました。</p>
      {r.groupsHandedOver > 0 && (
        <p className="text-sm text-ink-soft">作ったグループ{r.groupsHandedOver}つは、ほかのメンバーに引き継ぎました。</p>
      )}
      <p className="text-xs text-muted">また使うときは、新しい利用者として始まります。</p>
      <Link href="/" className="t-btn t-btn-secondary w-full">
        トップへ
      </Link>
    </section>
  );
}

function SettingsBody() {
  const [deleted, setDeleted] = useState<DeleteResult | null>(null);
  if (deleted) return <DeletedCard r={deleted} />;
  return (
    <>
      <HomeSettings />
      <DeleteAll onDone={setDeleted} />
    </>
  );
}

export default function SettingsPage() {
  const mounted = useMounted();
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* 画面名はヘッダーに出しているので、見出しは読み上げ用だけにする */}
      <h1 className="sr-only">設定</h1>
      {mounted ? <SettingsBody /> : <PageSkeleton />}
    </div>
  );
}
