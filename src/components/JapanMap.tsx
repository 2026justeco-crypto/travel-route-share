'use client';

// 地図（MapLibre GL JS v5）。A＝ポップ（メルカトル・ベクター）／B＝地球儀（globe・衛星写真）。
// <html data-theme> が変わったら地図を作り直す（スタイルの差し替えより確実で、追加した線やピンも描き直せる）。
// 呼び出し側は今までどおり dynamic(() => import(...), { ssr: false }) で読み込む。

import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import maplibregl from 'maplibre-gl';
import type { GeoJSONSource, IControl, LngLatBoundsLike, Map as MlMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { fetchRoadLegs, isRoadLegsCached } from '@/lib/route';
import { MAP_BG, mapStyle } from '@/lib/mapStyles';
import type { ThemeId } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';
import type { TransportMode } from '@/lib/types';
import {
  LINE_CASING,
  MODE_COLOR,
  MODE_LINE,
  TRANSPORT_LABEL,
  TRANSPORT_MODES,
  followsRoad,
  greatCircle,
  isTransportMode,
  modeIconSvgElement,
  pathMidpoint,
  type ModeKey,
} from '@/lib/transport';
import { ModeIcon } from '@/components/icons';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  title: string;
  comment?: string;
  userName?: string;
  photoUrl?: string | null;
  date?: string;
  isMine?: boolean;
  isFavorite?: boolean;
}

export interface RoutePoint {
  lat: number;
  lng: number;
  label: string;
  moveTo?: TransportMode; // この点から次の点への移動手段（無い＝未設定）
}

interface Props {
  pins?: MapPin[];
  route?: RoutePoint[];
  onPick?: (lat: number, lng: number) => void;
  picked?: { lat: number; lng: number } | null;
  center?: [number, number];
  zoom?: number; // Leaflet 時代と同じ数え方（MapLibre は1段小さい値で同じ縮尺になるので中で -1 する）
  height?: string;
  onToggleFavorite?: (postId: string) => void;
  fitRoute?: boolean; // ルート全体が収まるよう表示範囲を自動調整（閲覧ページ用）
  roadRoute?: boolean; // 実際の道路に沿ったルートを描く（OSRM・失敗時は直線にフォールバック）。電車・船・飛行機の区間は対象外
  fitButton?: boolean; // 「ルート全体を表示」ボタンを地図上に出す（編集ページ用）
}

type LatLng = [number, number];

// OSRM を1回の表示で呼ぶ上限（道路沿いの「ひと続き」の数。超えた分は直線で描く）
const MAX_ROAD_RUNS = 3;
const OSRM_GAP_MS = 1100; // デモサーバーへの連続呼び出しは1秒以上あける

/** 区間（i → i+1）の移動手段が道路沿いのものが続くところを [始点, 終点] の点番号でまとめる */
function roadRuns(route: RoutePoint[]): [number, number][] {
  const runs: [number, number][] = [];
  let start = -1;
  for (let i = 0; i < route.length - 1; i++) {
    if (followsRoad(route[i].moveTo)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      runs.push([start, i]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, route.length - 1]);
  return runs;
}

interface Segment {
  mode: ModeKey;
  road: boolean; // 道路沿いの線が取れた
  coords: [number, number][]; // [lng, lat]
}

// 投稿者ごとに安定した色を名前から決める（アカウント機構ができるまでの簡易アバター）
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

// ---- ピンの見た目（DOM を直接作る。文字は textContent で入れる＝HTML として解釈させない） ----

function pinElement(p: MapPin, theme: ThemeId): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', `${p.title}（${p.userName ?? ''}）`);
  el.title = p.title;
  if (theme === 'b') {
    // 発光する点（自分の投稿は青く光る）
    el.className = `trs-marker trs-pin-b${p.isMine ? ' is-mine' : ''}`;
    const dot = document.createElement('span');
    dot.className = 'trs-pin-b-dot';
    el.appendChild(dot);
  } else {
    // 名前の頭文字の丸いアイコン（自分の投稿は青）
    el.className = 'trs-marker trs-pin-a';
    el.style.background = p.isMine ? '#2563eb' : userColor(p.userName ?? '?');
    el.textContent = Array.from((p.userName ?? '?').trim())[0] ?? '?';
  }
  return el;
}

function numberElement(n: number, label: string): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'trs-marker trs-num';
  el.textContent = String(n);
  el.setAttribute('aria-label', `${n}. ${label}`);
  return el;
}

function pickedElement(): HTMLDivElement {
  const el = document.createElement('div');
  el.className = 'trs-marker trs-picked';
  return el;
}

function fitToRoute(map: MlMap, route: RoutePoint[], animate: boolean) {
  if (route.length === 0) return;
  if (route.length === 1) {
    map.jumpTo({ center: [route[0].lng, route[0].lat], zoom: 12 });
    return;
  }
  let w = 180, s = 90, e = -180, n = -90;
  for (const r of route) {
    w = Math.min(w, r.lng);
    e = Math.max(e, r.lng);
    s = Math.min(s, r.lat);
    n = Math.max(n, r.lat);
  }
  const bounds: LngLatBoundsLike = [
    [w, s],
    [e, n],
  ];
  map.fitBounds(bounds, { padding: 48, maxZoom: 13, duration: animate ? 800 : 0 });
}

// 地図の上に React で描くための入れ物（右下の操作ボタン用）
class PortalControl implements IControl {
  constructor(private node: HTMLElement) {}
  onAdd() {
    return this.node;
  }
  onRemove() {
    this.node.remove();
  }
}

// ---- 入口：テーマが変わったら中身ごと作り直す（道路沿いルートの取得は作り直しの外に置く＝OSRMを呼び直さない） ----

export default function JapanMap(props: Props) {
  const theme = useTheme();
  const { route = [], roadRoute = false } = props;

  const routePoints = route.filter((r) => r.lat !== null && r.lng !== null);
  // 呼び出し側は毎回新しい配列を渡してくるので、中身が同じなら同じものとして扱う
  const routeKey = JSON.stringify(routePoints.map((r) => [r.lat, r.lng, r.label, r.moveTo ?? null]));
  const stableRoute = useMemo<RoutePoint[]>(
    () =>
      (JSON.parse(routeKey) as [number, number, string, string | null][]).map(([lat, lng, label, mv]) => ({
        lat,
        lng,
        label,
        ...(isTransportMode(mv) ? { moveTo: mv } : {}),
      })),
    [routeKey],
  );

  // 実道路ルート（OSRM）。ルートが変わった時だけ取得する。区間 i の道路沿いの線（無い区間は null＝直線で描く）
  const [road, setRoad] = useState<{ key: string; legs: (LatLng[] | null)[] } | null>(null);
  useEffect(() => {
    if (!roadRoute || stableRoute.length < 2) return;
    let cancelled = false;
    (async () => {
      const legs: (LatLng[] | null)[] = new Array(stableRoute.length - 1).fill(null);
      const runs = roadRuns(stableRoute).slice(0, MAX_ROAD_RUNS);
      let called = false;
      for (const [a, b] of runs) {
        const pts = stableRoute.slice(a, b + 1);
        const willCall = pts.length >= 2 && pts.length <= 12 && !isRoadLegsCached(pts);
        if (willCall && called) await new Promise((r) => setTimeout(r, OSRM_GAP_MS));
        if (cancelled) return;
        const got = await fetchRoadLegs(pts);
        if (willCall) called = true;
        if (got) got.forEach((leg, k) => (legs[a + k] = leg));
      }
      if (!cancelled) setRoad({ key: routeKey, legs });
    })();
    return () => {
      cancelled = true;
    };
  }, [roadRoute, routeKey, stableRoute]);
  const roadLegs = roadRoute && road?.key === routeKey ? road.legs : null;

  return (
    <MapView
      key={theme}
      {...props}
      theme={theme}
      route={stableRoute}
      roadLegs={roadLegs}
      roadNote={roadRoute}
    />
  );
}

// ---- 本体 ----

function MapView({
  theme,
  pins = [],
  route,
  roadLegs,
  roadNote,
  onPick,
  picked,
  center = [37.5, 137.0],
  zoom = 5,
  height = '480px',
  onToggleFavorite,
  fitRoute = false,
  fitButton = false,
}: Omit<Props, 'route' | 'roadRoute'> & {
  theme: ThemeId;
  route: RoutePoint[];
  roadLegs: (LatLng[] | null)[] | null;
  roadNote: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MlMap | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 初期の中心・縮尺は最初の1回だけ使う
  const [initialView] = useState(() => ({ center, zoom }));
  // 地図の中に React を描き込む入れ物（ポップアップの中身・右下のボタン）
  const [popupNode] = useState(() => document.createElement('div'));
  const [controlNode] = useState(() => {
    const d = document.createElement('div');
    d.className = 'maplibregl-ctrl trs-ctrl';
    return d;
  });

  // 最新の onPick を地図のイベントから呼べるようにする
  const onPickRef = useRef(onPick);
  useEffect(() => {
    onPickRef.current = onPick;
  });

  // 地図の作成（テーマごとに1回）
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // スマホ（指で触る端末）では、ページを1本指でスクロールしても地図が勝手に動かないようにする（2本指で動かす）
    const touch = window.matchMedia('(pointer: coarse)').matches;
    const m = new maplibregl.Map({
      container: el,
      style: mapStyle(theme),
      center: [initialView.center[1], initialView.center[0]],
      zoom: Math.max(0, initialView.zoom - 1),
      attributionControl: { compact: false },
      cooperativeGestures: touch,
      locale: {
        'CooperativeGesturesHandler.WindowsHelpText': 'Ctrl キーを押しながらスクロールで拡大・縮小',
        'CooperativeGesturesHandler.MacHelpText': '⌘ キーを押しながらスクロールで拡大・縮小',
        'CooperativeGesturesHandler.MobileHelpText': '2本の指で地図を動かせます',
        'AttributionControl.ToggleAttribution': '出典を表示',
      },
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
      maxPitch: 0,
      renderWorldCopies: theme !== 'b',
    });
    m.touchZoomRotate.disableRotation();
    m.keyboard.disableRotation();
    m.addControl(new PortalControl(controlNode), 'bottom-right');
    m.on('load', () => setMap(m));
    return () => {
      m.remove();
    };
  }, [theme, initialView, controlNode]);

  // 地図を押したとき：位置指定（onPick）／開いている詳細を閉じる
  useEffect(() => {
    if (!map) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const t = e.originalEvent.target as HTMLElement | null;
      if (t?.closest('.trs-marker')) return; // ピンを押したときは位置指定しない
      setSelectedId(null);
      onPickRef.current?.(e.lngLat.lat, e.lngLat.lng);
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = onPick ? 'crosshair' : '';
    return () => {
      map.off('click', onClick);
    };
  }, [map, onPick]);

  // Esc で詳細を閉じる
  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedId(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  // 投稿のピン
  useEffect(() => {
    if (!map) return;
    const markers = pins.map((p) => {
      const el = pinElement(p, theme);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        setSelectedId(p.id);
      });
      return new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([p.lng, p.lat])
        .addTo(map);
    });
    return () => markers.forEach((mk) => mk.remove());
  }, [map, pins, theme]);

  const selected = selectedId ? (pins.find((p) => p.id === selectedId) ?? null) : null;
  const selLng = selected?.lng;
  const selLat = selected?.lat;

  // A：ピンを押したら地図のポップアップ（中身は React で popupNode に描く）
  useEffect(() => {
    if (!map || theme !== 'a' || selLng === undefined || selLat === undefined) return;
    const popup = new maplibregl.Popup({ maxWidth: '260px', offset: 20, className: 'trs-popup' })
      .setLngLat([selLng, selLat])
      .setDOMContent(popupNode)
      .addTo(map);
    const onClose = () => setSelectedId(null);
    popup.on('close', onClose);
    return () => {
      popup.off('close', onClose);
      popup.remove();
    };
  }, [map, theme, selectedId, selLng, selLat, popupNode]);

  // B：選んだ点に寄せる（下のパネルに隠れない位置へ）
  useEffect(() => {
    if (!map || theme !== 'b' || selLng === undefined || selLat === undefined) return;
    const wide = map.getContainer().clientWidth >= 768;
    const h = map.getContainer().clientHeight;
    map.easeTo({
      center: [selLng, selLat],
      offset: wide ? [-160, 0] : [0, -h * 0.27],
      duration: 500,
    });
  }, [map, theme, selectedId, selLng, selLat]);

  // ルートの番号ピン（押すとスポット名）
  useEffect(() => {
    if (!map) return;
    const markers = route.map((r, i) => {
      const el = numberElement(i + 1, r.label);
      const popup = new maplibregl.Popup({ offset: 16, closeButton: false, className: 'trs-popup trs-popup-mini' })
        .setText(`${i + 1}. ${r.label}`);
      el.addEventListener('click', (ev) => {
        ev.stopPropagation();
        popup.setLngLat([r.lng, r.lat]).addTo(map);
      });
      return { mk: new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([r.lng, r.lat]).addTo(map), popup };
    });
    return () =>
      markers.forEach(({ mk, popup }) => {
        popup.remove();
        mk.remove();
      });
  }, [map, route]);

  // 区間ごとの線（道路沿いが取れた区間はその形、電車・船は直線、飛行機は大圏の弧）
  const segments = useMemo<Segment[]>(() => {
    const out: Segment[] = [];
    for (let i = 0; i < route.length - 1; i++) {
      const a: [number, number] = [route[i].lng, route[i].lat];
      const b: [number, number] = [route[i + 1].lng, route[i + 1].lat];
      const mode: ModeKey = route[i].moveTo ?? 'none';
      const leg = roadLegs?.[i];
      if (leg && leg.length >= 2) {
        out.push({ mode, road: true, coords: leg.map(([lat, lng]) => [lng, lat]) });
      } else if (mode === 'plane') {
        out.push({ mode, road: false, coords: greatCircle(a, b) });
      } else {
        out.push({ mode, road: false, coords: [a, b] });
      }
    }
    return out;
  }, [route, roadLegs]);

  useEffect(() => {
    if (!map) return;
    const data: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: segments.map((sg) => ({
        type: 'Feature',
        properties: { m: sg.mode, road: sg.road },
        geometry: { type: 'LineString', coordinates: sg.coords },
      })),
    };
    const src = map.getSource('route') as GeoJSONSource | undefined;
    if (src) {
      src.setData(data);
      return;
    }
    map.addSource('route', { type: 'geojson', data });
    addRouteLayers(map, theme);
  }, [map, segments, theme]);

  // 区間の真ん中に移動手段のアイコン（未設定の区間には置かない）。押しても地図の操作の邪魔をしない
  useEffect(() => {
    if (!map) return;
    const markers = segments
      .filter((sg): sg is Segment & { mode: TransportMode } => sg.mode !== 'none')
      .map((sg) => {
        const el = document.createElement('div');
        el.className = 'trs-modeicon';
        el.style.color = MODE_COLOR[theme][sg.mode];
        el.style.borderColor = MODE_COLOR[theme][sg.mode];
        el.appendChild(modeIconSvgElement(sg.mode, 16));
        return new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(pathMidpoint(sg.coords))
          .addTo(map);
      });
    return () => markers.forEach((mk) => mk.remove());
  }, [map, segments, theme]);

  // 凡例：使っている手段だけ（全部未設定の古い旅行では手段の行は出さない）
  const usedModes = TRANSPORT_MODES.filter((m) => segments.some((sg) => sg.mode === m));
  const hasUnset = segments.some((sg) => sg.mode === 'none');
  const hasRoad = roadNote && segments.some((sg) => sg.road);

  // 閲覧ページ：ルート全体が収まるように合わせる（ルートの中身が変わったときだけ）
  useEffect(() => {
    if (!map || !fitRoute) return;
    // route は親で中身ごとに固定済み（中身が同じなら同じ配列）
    fitToRoute(map, route, false);
  }, [map, fitRoute, route]);

  // 地図で決めた位置の印
  const pickedLat = picked?.lat;
  const pickedLng = picked?.lng;
  useEffect(() => {
    if (!map || pickedLat === undefined || pickedLng === undefined) return;
    const mk = new maplibregl.Marker({ element: pickedElement(), anchor: 'center' })
      .setLngLat([pickedLng, pickedLat])
      .addTo(map);
    return () => {
      mk.remove();
    };
  }, [map, pickedLat, pickedLng]);

  const detail = selected ? (
    <PinDetail
      pin={selected}
      theme={theme}
      onToggleFavorite={onToggleFavorite}
      onClose={() => setSelectedId(null)}
    />
  ) : null;

  return (
    <div
      style={{ height, background: MAP_BG[theme] }}
      className="trs-map relative w-full overflow-hidden"
    >
      {/* maplibre-gl.css が .maplibregl-map に position:relative を当てるので、位置はインラインで指定する */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {/* 左上の凡例（使っている移動手段だけ）＋道のりの注記 */}
      {(usedModes.length > 0 || hasRoad) && (
        <div className="trs-legend" aria-label="移動手段の凡例">
          {usedModes.map((m) => (
            <div key={m} className="trs-legend-row">
              <LegendSwatch mode={m} theme={theme} />
              <ModeIcon mode={m} className="h-3.5 w-3.5 shrink-0" />
              <span>{TRANSPORT_LABEL[m]}</span>
            </div>
          ))}
          {usedModes.length > 0 && hasUnset && (
            <div className="trs-legend-row">
              <LegendSwatch mode="none" theme={theme} />
              <span className="pl-[18px]">未設定</span>
            </div>
          )}
          {hasRoad && <div className="trs-legend-note">道のりは目安</div>}
        </div>
      )}

      {/* 右下の丸い操作ボタン（ズーム±・ルート全体） */}
      {createPortal(
        <>
          <button
            type="button"
            className="trs-ctrl-btn"
            aria-label="拡大"
            title="拡大"
            onClick={() => map?.zoomIn()}
          >
            <PlusIcon />
          </button>
          <button
            type="button"
            className="trs-ctrl-btn"
            aria-label="縮小"
            title="縮小"
            onClick={() => map?.zoomOut()}
          >
            <MinusIcon />
          </button>
          {fitButton && route.length > 0 && (
            <button
              type="button"
              className="trs-ctrl-btn"
              aria-label="ルート全体を表示"
              title="ルート全体を表示"
              onClick={() => map && fitToRoute(map, route, true)}
            >
              <FitIcon />
            </button>
          )}
        </>,
        controlNode,
      )}

      {/* A：ポップアップの中身 */}
      {theme === 'a' && detail && createPortal(detail, popupNode)}

      {/* B：下からせり上がるパネル（PCでは右側のカード） */}
      {theme === 'b' && detail && (
        <div key={selected?.id} className="trs-sheet" role="dialog" aria-label={selected?.title}>
          {detail}
        </div>
      )}
    </div>
  );
}

// ---- 区間の線のレイヤー（色・太さ・破線は lib/transport.ts の定義から） ----

function addRouteLayers(map: MlMap, theme: ThemeId) {
  const col = MODE_COLOR[theme];
  const cas = LINE_CASING[theme];
  const isM = (m: ModeKey): maplibregl.ExpressionSpecification => ['==', ['get', 'm'], m];
  const round = { 'line-cap': 'round', 'line-join': 'round' } as const;

  // 下敷きの縁（バス・徒歩以外。徒歩は点の形の縁を別に敷く）
  map.addLayer({
    id: 'route-casing',
    type: 'line',
    source: 'route',
    filter: ['!', ['in', ['get', 'm'], ['literal', ['bus', 'walk']]]],
    layout: round,
    paint: {
      'line-color': cas.casing,
      'line-width': [
        'match',
        ['get', 'm'],
        'bike', 5.5,
        'car', 8.5,
        'train', 8,
        'plane', 5,
        'ship', 6,
        ['case', ['get', 'road'], 7, 5],
      ],
      'line-opacity': ['case', ['all', ['==', ['get', 'm'], 'none'], ['!', ['get', 'road']]], 0.6, 0.9],
    },
  });
  // 徒歩：点の形の縁
  map.addLayer({
    id: 'route-walk-casing',
    type: 'line',
    source: 'route',
    filter: isM('walk'),
    layout: round,
    paint: { 'line-color': cas.casing, 'line-width': 7, 'line-dasharray': [0, 10 / 7] },
  });
  // バス：別色の太い縁取り
  map.addLayer({
    id: 'route-bus-outline',
    type: 'line',
    source: 'route',
    filter: isM('bus'),
    layout: round,
    paint: { 'line-color': cas.busOutline, 'line-width': 9.5 },
  });
  // 未設定：今までどおり（道路沿いは実線、直線は破線）
  map.addLayer({
    id: 'route-none-road',
    type: 'line',
    source: 'route',
    filter: ['all', isM('none'), ['get', 'road']],
    layout: round,
    paint: { 'line-color': col.none, 'line-width': 4, 'line-opacity': 0.9 },
  });
  map.addLayer({
    id: 'route-none-straight',
    type: 'line',
    source: 'route',
    filter: ['all', isM('none'), ['!', ['get', 'road']]],
    paint: { 'line-color': col.none, 'line-width': 3, 'line-dasharray': [2, 2.6] },
  });
  // 手段ごとの線
  for (const m of TRANSPORT_MODES) {
    const spec = MODE_LINE[m];
    map.addLayer({
      id: `route-${m}`,
      type: 'line',
      source: 'route',
      filter: isM(m),
      layout: spec.round || !spec.dash ? round : { 'line-join': 'round' },
      paint: {
        'line-color': col[m],
        'line-width': spec.width,
        ...(spec.dash ? { 'line-dasharray': spec.dash } : {}),
      },
    });
  }
  // 電車：枕木風の縞
  map.addLayer({
    id: 'route-train-ties',
    type: 'line',
    source: 'route',
    filter: isM('train'),
    paint: { 'line-color': cas.trainTie, 'line-width': 2.2, 'line-dasharray': [1.2, 1.8] },
  });
}

/** 凡例の線の見本（地図の線と同じ太さ・破線の比で描く） */
function LegendSwatch({ mode, theme }: { mode: ModeKey; theme: ThemeId }) {
  const col = MODE_COLOR[theme][mode];
  const cas = LINE_CASING[theme];
  const line = (stroke: string, w: number, dash?: [number, number], cap: 'round' | 'butt' = 'butt') => (
    <line
      x1={cap === 'round' ? 4 : 1}
      x2={cap === 'round' ? 26 : 29}
      y1={6}
      y2={6}
      stroke={stroke}
      strokeWidth={w}
      strokeLinecap={cap}
      strokeDasharray={dash ? `${dash[0] * w} ${dash[1] * w}` : undefined}
    />
  );
  const spec = MODE_LINE[mode];
  return (
    <svg width="30" height="12" viewBox="0 0 30 12" aria-hidden className="shrink-0">
      {mode === 'bus' && line(cas.busOutline, 9.5, undefined, 'round')}
      {mode === 'none'
        ? line(col, 3, [2, 2.6])
        : line(col, spec.width, spec.dash, spec.round || !spec.dash ? 'round' : 'butt')}
      {mode === 'train' && line(cas.trainTie, 2.2, [1.2, 1.8])}
    </svg>
  );
}

function PinDetail({
  pin,
  theme,
  onToggleFavorite,
  onClose,
}: {
  pin: MapPin;
  theme: ThemeId;
  onToggleFavorite?: (postId: string) => void;
  onClose: () => void;
}) {
  const b = theme === 'b';
  return (
    <div className={b ? '' : 'w-56'}>
      {b && (
        <>
          <div className="trs-sheet-grip" aria-hidden />
          <button type="button" onClick={onClose} className="trs-sheet-close" aria-label="閉じる">
            ×
          </button>
        </>
      )}
      {pin.photoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={pin.photoUrl}
          alt={pin.title}
          className={b ? 'mb-3 h-40 w-full rounded-2xl object-cover' : 'mb-2 h-32 w-full rounded-xl object-cover'}
        />
      )}
      <div className={b ? 'pr-8 text-xl font-extrabold leading-tight text-white' : 'text-sm font-bold text-[#2b2d52]'}>
        {pin.title}
      </div>
      {pin.comment && (
        <div className={b ? 'mt-1.5 text-sm text-[#c7cfe2]' : 'mt-1 text-xs text-[#5d6088]'}>{pin.comment}</div>
      )}
      <div
        className={`mt-2 flex items-center justify-between ${b ? 'text-sm text-[#a9b3cc]' : 'text-xs text-[#5d6088]'}`}
      >
        <span>
          {pin.userName}
          {pin.date ? ` ・ ${pin.date}` : ''}
        </span>
        {onToggleFavorite && (
          <button
            type="button"
            onClick={() => onToggleFavorite(pin.id)}
            className={`ml-2 rounded-full leading-none ${
              b ? 'px-3 py-1.5 text-lg' : 'px-1 text-base'
            } ${pin.isFavorite ? 'text-amber-400' : b ? 'text-white/60' : 'text-[#5d6088]'}`}
            title="お気に入り"
            aria-label={pin.isFavorite ? 'お気に入りを外す' : 'お気に入りに追加'}
            aria-pressed={!!pin.isFavorite}
          >
            {pin.isFavorite ? '★' : '☆'}
          </button>
        )}
      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden>
      <path d="M5 12h14" />
    </svg>
  );
}
function FitIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <circle cx="12" cy="12" r="2.2" />
    </svg>
  );
}
