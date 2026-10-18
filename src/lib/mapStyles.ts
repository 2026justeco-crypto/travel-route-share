// 地図のスタイル（MapLibre GL JS 用）。A＝ポップ（メルカトル・ベクター）／B＝地球儀（globe・衛星写真）。
// どれも無料・キー不要。出典は各ソースの attribution に入れ、地図の右下に常に出す。
import type {
  ExpressionSpecification,
  LayerSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import type { ThemeId } from '@/lib/theme';

// ---- タイルの出どころ ----

// OpenFreeMap（OpenMapTiles 形式のベクタータイル・フォント）https://openfreemap.org
const OFM_TILEJSON = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> ' +
  '<a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">&copy; OpenMapTiles</a> ' +
  'Data from <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>';

// NASA GIBS の Blue Marble（全球の衛星写真モザイク）。レイヤ名・URLは GIBS の WMTS GetCapabilities
// （https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml）で確認：
// BlueMarble_NextGeneration / TileMatrixSet=GoogleMapsCompatible_Level8（z0〜8）/ image/jpeg
const GIBS_BLUE_MARBLE =
  'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg';
const GIBS_ATTRIBUTION =
  'Imagery: <a href="https://earthdata.nasa.gov/gibs" target="_blank" rel="noopener">NASA EOSDIS GIBS</a> (Blue Marble)';

// 国土地理院 シームレス空中写真（日本の拡大時）
const GSI_PHOTO = 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg';
const GSI_ATTRIBUTION =
  '<a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener">国土地理院</a>';

/** 入口の飾りの地図のように、地図コントロールを出さない所で手書きする出典 */
export const ATTRIBUTION_TEXT: Record<ThemeId, string> = {
  a: '© OpenFreeMap © OpenMapTiles © OpenStreetMap',
  b: 'NASA EOSDIS GIBS／国土地理院／© OpenFreeMap © OpenMapTiles © OpenStreetMap',
};

/** 地図の読み込み前に先に出す背景色（白い箱を出さない） */
export const MAP_BG: Record<ThemeId, string> = {
  a: '#a8def7', // 海の水色
  b: '#05070f', // 宇宙の黒（globals.css の B の --bg と同じ）
};

// ---- 共通の部品 ----

// 地名は日本語を優先（OpenMapTiles の name:ja → 無ければ name）
const NAME_JA: ExpressionSpecification = ['coalesce', ['get', 'name:ja'], ['get', 'name']];

const FONT_REGULAR = ['Noto Sans Regular'];
const FONT_BOLD = ['Noto Sans Bold'];

function placeLabels(color: string, halo: string, haloWidth: number): LayerSpecification[] {
  const paint = {
    'text-color': color,
    'text-halo-color': halo,
    'text-halo-width': haloWidth,
    'text-halo-blur': 0.3,
  };
  return [
    {
      id: 'label-water',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'water_name',
      filter: ['match', ['get', 'class'], ['ocean', 'sea', 'bay', 'strait'], true, false],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 2, 11, 8, 14],
        'text-max-width': 6,
        'text-letter-spacing': 0.15,
      },
      paint: { ...paint, 'text-color': color, 'text-opacity': 0.75 },
    },
    {
      id: 'label-village',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      minzoom: 11,
      filter: ['match', ['get', 'class'], ['village', 'suburb', 'hamlet', 'neighbourhood', 'quarter'], true, false],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 11, 11, 15, 14],
        'text-max-width': 7,
      },
      paint,
    },
    {
      id: 'label-town',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      minzoom: 8,
      filter: ['==', ['get', 'class'], 'town'],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_REGULAR,
        'text-size': ['interpolate', ['linear'], ['zoom'], 8, 11, 14, 16],
        'text-max-width': 7,
      },
      paint,
    },
    {
      id: 'label-city',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      minzoom: 4,
      filter: ['==', ['get', 'class'], 'city'],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 8, 14, 12, 18],
        'text-max-width': 7,
        'symbol-sort-key': ['coalesce', ['get', 'rank'], 99],
      },
      paint,
    },
    {
      id: 'label-state',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      minzoom: 5,
      maxzoom: 9,
      filter: ['match', ['get', 'class'], ['state', 'province'], true, false],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 10, 8, 13],
        'text-max-width': 6,
      },
      paint: { ...paint, 'text-opacity': 0.8 },
    },
    {
      id: 'label-country',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'place',
      maxzoom: 7,
      filter: ['==', ['get', 'class'], 'country'],
      layout: {
        'text-field': NAME_JA,
        'text-font': FONT_BOLD,
        'text-size': ['interpolate', ['linear'], ['zoom'], 1, 11, 5, 16],
        'text-max-width': 6,
      },
      paint,
    },
  ];
}

// ---- A＝ポップ（教育アプリ風）：水色の海・クリーム色の陸・白い道路・明るい緑の公園・濃紺の文字 ----

const POP = {
  land: '#fff3d6',
  water: '#a8def7',
  park: '#9fe08a',
  wood: '#c9ecb0',
  road: '#ffffff',
  roadCase: '#e7d3a8',
  building: '#f5e3bc',
  border: '#2b2d52',
  text: '#2b2d52',
};

function popStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    sources: {
      ofm: { type: 'vector', url: OFM_TILEJSON, attribution: OFM_ATTRIBUTION },
    },
    layers: [
      { id: 'land', type: 'background', paint: { 'background-color': POP.land } },
      {
        id: 'wood',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'landcover',
        filter: ['match', ['get', 'class'], ['wood', 'grass'], true, false],
        paint: { 'fill-color': POP.wood, 'fill-opacity': 0.55 },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'park',
        paint: { 'fill-color': POP.park, 'fill-opacity': 0.8 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'water',
        filter: ['!=', ['get', 'brunnel'], 'tunnel'],
        paint: { 'fill-color': POP.water },
      },
      {
        id: 'waterway',
        type: 'line',
        source: 'ofm',
        'source-layer': 'waterway',
        minzoom: 8,
        paint: { 'line-color': POP.water, 'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1, 14, 3] },
      },
      {
        id: 'building',
        type: 'fill',
        source: 'ofm',
        'source-layer': 'building',
        minzoom: 14,
        paint: { 'fill-color': POP.building, 'fill-outline-color': POP.roadCase },
      },
      {
        id: 'road-case',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'],
          true,
          false,
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': POP.roadCase,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1.5, 10, 3, 14, 9, 18, 24],
        },
      },
      {
        id: 'road',
        type: 'line',
        source: 'ofm',
        'source-layer': 'transportation',
        minzoom: 6,
        filter: [
          'match',
          ['get', 'class'],
          ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'minor'],
          true,
          false,
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': POP.road,
          'line-width': ['interpolate', ['linear'], ['zoom'], 6, 0.8, 10, 1.8, 14, 6, 18, 20],
        },
      },
      {
        id: 'border-pref',
        type: 'line',
        source: 'ofm',
        'source-layer': 'boundary',
        minzoom: 4,
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
        paint: {
          'line-color': POP.border,
          'line-opacity': 0.25,
          'line-width': 1,
          'line-dasharray': [2, 2],
        },
      },
      {
        id: 'border-country',
        type: 'line',
        source: 'ofm',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': POP.border, 'line-opacity': 0.45, 'line-width': 1.2 },
      },
      {
        id: 'label-road',
        type: 'symbol',
        source: 'ofm',
        'source-layer': 'transportation_name',
        minzoom: 13,
        layout: {
          'symbol-placement': 'line',
          'text-field': NAME_JA,
          'text-font': FONT_REGULAR,
          'text-size': 11,
        },
        paint: { 'text-color': POP.text, 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 },
      },
      ...placeLabels(POP.text, '#ffffff', 2),
    ],
  };
}

// ---- B＝地球儀（Radio Garden／Google Earth風）：衛星写真＋白文字・黒縁の地名 ----

function globeStyle(): StyleSpecification {
  return {
    version: 8,
    glyphs: OFM_GLYPHS,
    projection: { type: 'globe' },
    sky: {
      // 地球の縁の大気のにじみ（引きのときだけ・薄く）
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.55, 4, 0.35, 7, 0],
    },
    sources: {
      gibs: {
        type: 'raster',
        tiles: [GIBS_BLUE_MARBLE],
        tileSize: 256,
        maxzoom: 8,
        attribution: GIBS_ATTRIBUTION,
      },
      gsi: {
        type: 'raster',
        tiles: [GSI_PHOTO],
        tileSize: 256,
        minzoom: 2,
        maxzoom: 18,
        bounds: [122, 20, 154, 46.5], // 日本のまわりだけ取りに行く
        attribution: GSI_ATTRIBUTION,
      },
      ofm: { type: 'vector', url: OFM_TILEJSON, attribution: OFM_ATTRIBUTION },
    },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': MAP_BG.b } },
      { id: 'blue-marble', type: 'raster', source: 'gibs', paint: { 'raster-fade-duration': 200 } },
      {
        // 日本を拡大したら地理院の空中写真に切り替える（ズームでなめらかに重ねる）
        id: 'gsi-photo',
        type: 'raster',
        source: 'gsi',
        minzoom: 6,
        paint: {
          'raster-opacity': ['interpolate', ['linear'], ['zoom'], 6, 0, 8, 1],
          'raster-fade-duration': 200,
        },
      },
      {
        id: 'border-country',
        type: 'line',
        source: 'ofm',
        'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 2], ['!=', ['get', 'maritime'], 1]],
        paint: { 'line-color': '#ffe58a', 'line-opacity': 0.45, 'line-width': 0.8 },
      },
      ...placeLabels('#ffffff', 'rgba(0,0,0,0.9)', 1.6),
    ],
  };
}

export function mapStyle(theme: ThemeId, opts: { labels?: boolean } = {}): StyleSpecification {
  const style = theme === 'b' ? globeStyle() : popStyle();
  // 入口の飾りでは地名を消す（大きな見出しと重なって読みにくくなるため）
  if (opts.labels === false) style.layers = style.layers.filter((l) => l.type !== 'symbol');
  return style;
}
