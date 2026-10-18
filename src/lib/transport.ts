// 移動手段（スポット i → i+1 の区間ごと）。色・線の種類・アイコンの3つで見分ける（色だけに頼らない）。
// 地図（MapLibre の線）・凡例・一覧・入力ボタンが、すべてここの定義を使う。

import type { ThemeId } from './theme';
import type { TransportMode } from './types';

export const TRANSPORT_MODES: TransportMode[] = ['walk', 'bike', 'car', 'bus', 'train', 'plane', 'ship'];

export const TRANSPORT_LABEL: Record<TransportMode, string> = {
  walk: '徒歩',
  bike: '自転車',
  car: '車',
  bus: 'バス',
  train: '電車',
  plane: '飛行機',
  ship: '船',
};

/** 道路に沿わせる手段（OSRM の車用ルートで近似）。未設定の区間も今までどおり道路沿いで描く */
export function followsRoad(mode: TransportMode | undefined): boolean {
  return mode === undefined || mode === 'walk' || mode === 'bike' || mode === 'car' || mode === 'bus';
}

export function isTransportMode(v: unknown): v is TransportMode {
  return typeof v === 'string' && (TRANSPORT_MODES as string[]).includes(v);
}

// ---- 色（A＝明るいベクター地図の上／B＝暗い背景・衛星写真の上） ----
// 'none' は未設定（＝依頼2までのルート線と同じ色）
export type ModeKey = TransportMode | 'none';

export const MODE_COLOR: Record<ThemeId, Record<ModeKey, string>> = {
  a: {
    walk: '#e8590c',
    bike: '#2b8a3e',
    car: '#c92a2a',
    bus: '#e0a800',
    train: '#5f3dc4',
    plane: '#c2255c',
    ship: '#0c8599',
    none: '#2563eb',
  },
  b: {
    walk: '#ffa94d',
    bike: '#8ce99a',
    car: '#ff6b6b',
    bus: '#ffe066',
    train: '#b197fc',
    plane: '#f783ac',
    ship: '#f8f9fa',
    none: '#6cc7ff',
  },
};

/** 線の下に敷く縁（地図から浮かせる）。バスだけは別色の太い縁取りで見分ける */
export const LINE_CASING: Record<ThemeId, { casing: string; busOutline: string; trainTie: string }> = {
  a: { casing: '#ffffff', busOutline: '#2b2d52', trainTie: '#ffffff' },
  b: { casing: 'rgba(0,0,0,0.55)', busOutline: '#ffffff', trainTie: '#05070f' },
};

/** 線の太さと破線（凡例の見本と地図で同じ値を使う。破線の単位は「線の太さ」の倍数＝MapLibre と同じ） */
export const MODE_LINE: Record<ModeKey, { width: number; dash?: [number, number]; round?: boolean }> = {
  walk: { width: 4, dash: [0, 2.5], round: true }, // 点線（丸い端で点にする。10px おき）
  bike: { width: 2.5 }, // 細い実線
  car: { width: 5.5 }, // 太い実線
  bus: { width: 5 }, // 太い実線＋縁取り
  train: { width: 5 }, // 太い線の上に枕木風の破線
  plane: { width: 2.5, dash: [3, 2.5] }, // 細い破線（大圏の弧）
  ship: { width: 3, dash: [6, 3] }, // 長い破線
  none: { width: 4 },
};

// ---- アイコン（24×24 の線画。React と地図の DOM の両方で使うので path の d だけで持つ） ----

function circ(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
}

export const MODE_ICON: Record<TransportMode, string[]> = {
  walk: [circ(13, 4.2, 2), 'M12.5 8 10.6 14l3.1 2.6 1.1 5', 'M10.6 14 8.2 21', 'M11.6 10.4 8.4 12.6v3', 'M12.4 9.2l2.6 2.6 2.8.6'],
  bike: [circ(5.5, 16.5, 3.5), circ(18.5, 16.5, 3.5), 'M5.5 16.5 9 9h6.2l3.3 7.5', 'M9 9l3.4 7.5L15.2 9', 'M7.5 6h3.2'],
  car: ['M3.5 16.5V12l2.3-5.5h12.4L20.5 12v4.5Z', 'M3.5 12h17', circ(7.5, 16.8, 1.7), circ(16.5, 16.8, 1.7)],
  bus: ['M5.5 3h13a1.5 1.5 0 0 1 1.5 1.5V18H4V4.5A1.5 1.5 0 0 1 5.5 3Z', 'M4 11h16', 'M7 18v3M17 18v3', 'M7.5 14.5h.01M16.5 14.5h.01'],
  train: ['M8 3h8a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z', 'M5 10h14', 'M9 13.5h.01M15 13.5h.01', 'M9 17l-2 4M15 17l2 4'],
  plane: ['M12 2.8c.9 0 1.5.8 1.5 1.8v4.6l7 4.3v2l-7-2.1v4.5l2 1.5v1.6l-3.5-1-3.5 1V20l2-1.5V14l-7 2.1v-2l7-4.3V4.6c0-1 .6-1.8 1.5-1.8Z'],
  ship: ['M3 14.5h18l-2.2 4.5H5.2Z', 'M6 14.5V9.5h12v5', 'M12 9.5V4', 'M9 6.5h6', 'M3 21.5c1.5 0 1.5-.8 3-.8s1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8 1.5-.8 3-.8 1.5.8 3 .8'],
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** 地図の上に置く DOM 用（文字列を HTML として解釈させない＝createElementNS で組み立てる） */
export function modeIconSvgElement(mode: TransportMode, size = 16): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2.2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  for (const d of MODE_ICON[mode]) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.appendChild(p);
  }
  return svg;
}

// ---- 大圏（地球の表面での最短経路）。飛行機の弧に使う ----

/** [lng, lat] の2点を大圏で結ぶ点列（端点を含む） */
export function greatCircle(a: [number, number], b: [number, number], steps = 64): [number, number][] {
  const toRad = Math.PI / 180;
  const toDeg = 180 / Math.PI;
  const [lng1, lat1] = [a[0] * toRad, a[1] * toRad];
  const [lng2, lat2] = [b[0] * toRad, b[1] * toRad];
  const d =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin((lng2 - lng1) / 2) ** 2,
      ),
    );
  if (!isFinite(d) || d < 1e-9) return [a, b];
  const out: [number, number][] = [];
  let prevLng = a[0];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lng1) + B * Math.cos(lat2) * Math.cos(lng2);
    const y = A * Math.cos(lat1) * Math.sin(lng1) + B * Math.cos(lat2) * Math.sin(lng2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    let lng = Math.atan2(y, x) * toDeg;
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y)) * toDeg;
    // 日付変更線をまたいでも線が地球を逆回りしないよう経度を連続させる
    while (lng - prevLng > 180) lng -= 360;
    while (lng - prevLng < -180) lng += 360;
    prevLng = lng;
    out.push([lng, lat]);
  }
  return out;
}

/** 折れ線の「道のりの真ん中」の点（[lng, lat]） */
export function pathMidpoint(coords: [number, number][]): [number, number] {
  if (coords.length === 1) return coords[0];
  const seg: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const dx = (coords[i][0] - coords[i - 1][0]) * Math.cos((coords[i][1] * Math.PI) / 180);
    const dy = coords[i][1] - coords[i - 1][1];
    const len = Math.hypot(dx, dy);
    seg.push(len);
    total += len;
  }
  if (total === 0) return coords[0];
  let half = total / 2;
  for (let i = 0; i < seg.length; i++) {
    if (half <= seg[i]) {
      const f = seg[i] === 0 ? 0 : half / seg[i];
      return [
        coords[i][0] + (coords[i + 1][0] - coords[i][0]) * f,
        coords[i][1] + (coords[i + 1][1] - coords[i][1]) * f,
      ];
    }
    half -= seg[i];
  }
  return coords[coords.length - 1];
}

/**
 * スポットの並びから地図に渡す点の並びを作る（位置未設定のスポットは飛ばす）。
 * 飛ばしたスポットをまたぐ区間は、またいだ区間の手段がすべて同じならその手段、違えば未設定にする。
 */
export function routeFromSpots(
  spots: { name: string; lat: number | null; lng: number | null; moveTo?: TransportMode }[],
): { lat: number; lng: number; label: string; moveTo?: TransportMode }[] {
  const idx = spots.map((s, i) => (s.lat !== null && s.lng !== null ? i : -1)).filter((i) => i >= 0);
  return idx.map((si, k) => {
    const s = spots[si];
    const p = { lat: s.lat!, lng: s.lng!, label: s.name || `スポット${k + 1}` };
    if (k === idx.length - 1) return p;
    const modes = spots.slice(si, idx[k + 1]).map((x) => x.moveTo);
    const m = modes[0];
    return m && modes.every((x) => x === m) ? { ...p, moveTo: m } : p;
  });
}
