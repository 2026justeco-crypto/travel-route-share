'use client';

import { useId, type KeyboardEvent } from 'react';
import { TILES, TILE_COLS, TILE_ROWS, shortPrefName, type PrefName, type Tile } from '@/lib/tileMap';

// タイル地図（四角だけでできたポップな日本地図）。SVG で描き、親の幅いっぱいに伸び縮みする（縦横比は固定）。
// 色・枠の太さは globals.css の --tile-* 変数から取る（A＝ポップ／B＝暗い地に発光する枠）。

const U = 100; // 1マスの大きさ（viewBox の単位）
const PAD = 0.5 * U; // 周りの海の余白
const RX = 10; // 角の丸み（少しだけ）

export interface TileJapanMapProps {
  /** 県ごとの件数。1以上の県は色を濃くし、右上に数字バッジを出す */
  values?: Record<PrefName, number>;
  /** 「行った県」など、別の色で塗る県 */
  highlight?: Set<PrefName>;
  /** 読み上げで highlight の県に添える言葉（既定：行った県） */
  highlightLabel?: string;
  /** 選んでいる県（枠で強調） */
  selected?: PrefName | null;
  /** 県が押されたとき */
  onSelect?: (name: PrefName) => void;
  /** 県名を出すか（短い表記：東京都→東京 など）。出さないときは件数バッジをマスの真ん中に大きく出す */
  showLabels?: boolean;
  /** false なら押せない飾り（入口の背景用）。既定 true */
  interactive?: boolean;
  className?: string;
  /** 地図全体の読み上げ名 */
  ariaLabel?: string;
}

function badgeText(n: number) {
  return n > 99 ? '99+' : String(n);
}

export default function TileJapanMap({
  values,
  highlight,
  highlightLabel = '行った県',
  selected = null,
  onSelect,
  showLabels = false,
  interactive = true,
  className = '',
  ariaLabel = '都道府県のタイル地図',
}: TileJapanMapProps) {
  const uid = useId().replace(/:/g, '');
  const dotId = `trs-tile-dot-${uid}`;
  const vw = TILE_COLS * U + PAD * 2;
  const vh = TILE_ROWS * U + PAD * 2;

  const box = (t: Tile) => ({
    x: PAD + t.x * U,
    y: PAD + t.y * U,
    w: t.w * U,
    h: t.h * U,
  });

  const selectedTile = selected ? TILES.find((t) => t.name === selected) : undefined;

  const handleKey = (e: KeyboardEvent<SVGGElement>, name: PrefName) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect?.(name);
    }
  };

  return (
    <svg
      viewBox={`0 0 ${vw} ${vh}`}
      className={`trs-tilemap ${interactive ? 'is-interactive' : ''} ${className}`}
      style={{ aspectRatio: `${vw} / ${vh}` }}
      role={interactive ? 'group' : undefined}
      aria-label={interactive ? ariaLabel : undefined}
      aria-hidden={interactive ? undefined : true}
      focusable={interactive ? undefined : 'false'}
    >
      <defs>
        <pattern id={dotId} width={U / 2} height={U / 2} patternUnits="userSpaceOnUse">
          <circle cx={U / 4} cy={U / 4} r={U / 18} className="trs-tilemap-dot" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={vw} height={vh} className="trs-tilemap-sea" />
      <rect x={0} y={0} width={vw} height={vh} fill={`url(#${dotId})`} />

      <g className="trs-tilemap-land">
        {TILES.map((t) => {
          const b = box(t);
          const n = values?.[t.name] ?? 0;
          const hot = n >= 1;
          const visited = highlight?.has(t.name) ?? false;
          const label = shortPrefName(t.name);
          const small = t.w === 1 && t.h === 1;
          const fontSize = small ? (label.length >= 3 ? 27 : 34) : 40;
          const desc = [t.name, hot ? `${n}件` : '', visited ? highlightLabel : ''].filter(Boolean).join('、');
          return (
            <g
              key={t.name}
              className={`trs-tile ${hot ? 'is-hot' : ''} ${visited ? 'is-visited' : ''}`}
              data-pref={t.name}
              {...(interactive
                ? {
                    role: 'button',
                    tabIndex: 0,
                    'aria-label': desc,
                    'aria-pressed': selected === t.name,
                    onClick: () => onSelect?.(t.name),
                    onKeyDown: (e: KeyboardEvent<SVGGElement>) => handleKey(e, t.name),
                  }
                : {})}
            >
              <rect
                x={b.x}
                y={b.y}
                width={b.w}
                height={b.h}
                rx={RX}
                className="trs-tile-body"
                vectorEffect="non-scaling-stroke"
              />
              {showLabels && (
                <text
                  x={b.x + b.w / 2}
                  y={b.y + b.h / 2}
                  dy="0.36em"
                  textAnchor="middle"
                  fontSize={fontSize}
                  className="trs-tile-label"
                >
                  {label}
                </text>
              )}
              {hot &&
                (showLabels ? (
                  // 県名があるとき：右上に小さく
                  <g>
                    <circle cx={b.x + b.w - 20} cy={b.y + 20} r={n > 9 ? 24 : 20} className="trs-tile-badge" />
                    <text
                      x={b.x + b.w - 20}
                      y={b.y + 20}
                      dy="0.36em"
                      textAnchor="middle"
                      fontSize={n > 9 ? 22 : 26}
                      className="trs-tile-badge-text"
                    >
                      {badgeText(n)}
                    </text>
                  </g>
                ) : (
                  // 県名を出さないとき（スマホ幅）：マスの真ん中に大きく（1マス約23pxでも数字が読めるように）
                  <g>
                    <circle cx={b.x + b.w / 2} cy={b.y + b.h / 2} r={40} className="trs-tile-badge" />
                    <text
                      x={b.x + b.w / 2}
                      y={b.y + b.h / 2}
                      dy="0.36em"
                      textAnchor="middle"
                      fontSize={n > 99 ? 30 : n > 9 ? 40 : 50}
                      className="trs-tile-badge-text"
                    >
                      {badgeText(n)}
                    </text>
                  </g>
                ))}
              {interactive && (
                <rect
                  x={b.x + 7}
                  y={b.y + 7}
                  width={b.w - 14}
                  height={b.h - 14}
                  rx={RX - 3}
                  className="trs-tile-ring"
                  vectorEffect="non-scaling-stroke"
                />
              )}
            </g>
          );
        })}
      </g>

      {/* 選んでいる県の枠は、隣のマスに隠れないよう一番上に描く */}
      {selectedTile && (
        <rect
          x={box(selectedTile).x}
          y={box(selectedTile).y}
          width={box(selectedTile).w}
          height={box(selectedTile).h}
          rx={RX}
          className="trs-tile-selected"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
