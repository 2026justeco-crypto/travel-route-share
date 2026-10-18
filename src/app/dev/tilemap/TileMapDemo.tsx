'use client';

import { useEffect, useRef, useState } from 'react';
import TileJapanMap from '@/components/TileJapanMap';
import { TILE_COLS, shortPrefName, type PrefName } from '@/lib/tileMap';
import { checkTileAdjacency } from '@/lib/prefAdjacency';

// 見本データ（確認用・保存しない）
const SAMPLE_VALUES: Record<PrefName, number> = {
  北海道: 2,
  東京都: 5,
  京都府: 3,
  大阪府: 12,
  長野県: 1,
  福岡県: 4,
  沖縄県: 1,
  神奈川県: 2,
};
const SAMPLE_VISITED = new Set<PrefName>(['北海道', '東京都', '京都府', '広島県', '鹿児島県', '和歌山県']);

const ADJ = checkTileAdjacency();

function Panel({ theme }: { theme: 'a' | 'b' }) {
  const [selected, setSelected] = useState<PrefName | null>('東京都');
  const [labels, setLabels] = useState(true);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [cellPx, setCellPx] = useState<number | null>(null);

  // 1マスの実際の大きさ（px）を測って出す
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const svg = el.querySelector('svg');
      if (svg) setCellPx(svg.getBoundingClientRect().width / (TILE_COLS + 1));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      data-theme={theme}
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: 'var(--bg)', color: 'var(--text)', border: 'var(--line-w) solid var(--line)' }}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold">
        <span>{theme === 'a' ? 'A＝ポップ' : 'B＝地球'}</span>
        <label className="flex items-center gap-1 font-normal">
          <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} />
          県名
        </label>
        <span className="font-normal" style={{ color: 'var(--text-muted)' }}>
          選択：{selected ? shortPrefName(selected) : 'なし'}
          {cellPx !== null && ` ／ 1マス ${cellPx.toFixed(1)}px`}
        </span>
      </div>
      <div ref={wrapRef} data-testid={`tilemap-${theme}`}>
        <TileJapanMap
          values={SAMPLE_VALUES}
          highlight={SAMPLE_VISITED}
          selected={selected}
          onSelect={(n) => setSelected((cur) => (cur === n ? null : n))}
          showLabels={labels}
          ariaLabel={`都道府県のタイル地図（${theme === 'a' ? 'A' : 'B'}）`}
        />
      </div>
      <div className="mt-3 flex items-start gap-3">
        <div className="w-32 shrink-0">
          <TileJapanMap interactive={false} />
        </div>
        <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
          左：押せない飾り（interactive=false・県名なし）。上：件数（緑が濃い＋右上の数字）と「行った県」（別の色）の見本。
        </p>
      </div>
    </section>
  );
}

export default function TileMapDemo() {
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-extrabold">タイル地図の見本（開発用）</h1>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        隣接の照合：実際に陸で接している {ADJ.total} 組のうち、タイルでも上下左右に接しているのは {ADJ.matched} 組
      </p>
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel theme="a" />
        <Panel theme="b" />
      </div>
      <details className="text-xs" style={{ color: 'var(--text-muted)' }}>
        <summary>照合の内訳</summary>
        <p className="mt-1">タイルで接していない組（{ADJ.missing.length}）：{ADJ.missing.join('／')}</p>
        <p className="mt-1">タイルだけで接している組（{ADJ.extra.length}）：{ADJ.extra.join('／')}</p>
      </details>
    </div>
  );
}
