'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

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
}

interface Props {
  pins?: MapPin[];
  route?: RoutePoint[];
  onPick?: (lat: number, lng: number) => void;
  picked?: { lat: number; lng: number } | null;
  center?: [number, number];
  zoom?: number;
  height?: string;
  onToggleFavorite?: (postId: string) => void;
  fitRoute?: boolean; // ルート全体が収まるよう表示範囲を自動調整（閲覧ページ用）
}

// 投稿者ごとに安定した色を名前から決める（アカウント機構ができるまでの簡易アバター）
function userColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360;
  return `hsl(${h}, 65%, 45%)`;
}

// 投稿者アイコンのピン：名前の頭文字＋固有色。自分の投稿は青いリングで区別
function avatarIcon(userName: string, isMine: boolean): L.DivIcon {
  const initial = Array.from(userName.trim())[0] ?? '?';
  const bg = isMine ? '#2563eb' : userColor(userName);
  const ring = isMine ? '#93c5fd' : '#ffffff';
  return L.divIcon({
    className: '',
    html: `<div style="width:30px;height:30px;border-radius:50%;background:${bg};color:#fff;border:3px solid ${ring};box-shadow:0 1px 5px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:bold;font-family:sans-serif">${initial}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function numberIcon(n: number): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<div style="width:26px;height:26px;border-radius:50%;background:#2563eb;color:#fff;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:bold;font-family:sans-serif">${n}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

const pickedIcon = L.divIcon({
  className: '',
  html: `<div style="width:20px;height:20px;border-radius:50%;background:#dc2626;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.5)"></div>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

function FitRoute({ route }: { route: RoutePoint[] }) {
  const map = useMap();
  useEffect(() => {
    if (route.length === 0) return;
    if (route.length === 1) {
      map.setView([route[0].lat, route[0].lng], 13);
      return;
    }
    map.fitBounds(
      L.latLngBounds(route.map((r) => [r.lat, r.lng] as [number, number])),
      { padding: [40, 40], maxZoom: 14 },
    );
  }, [map, route]);
  return null;
}

function ClickPicker({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export default function JapanMap({
  pins = [],
  route = [],
  onPick,
  picked,
  center = [37.5, 137.0],
  zoom = 5,
  height = '480px',
  onToggleFavorite,
  fitRoute = false,
}: Props) {
  const routePoints = route.filter(
    (r) => r.lat !== null && r.lng !== null,
  ) as RoutePoint[];

  return (
    <div style={{ height }} className="w-full overflow-hidden rounded-2xl border-2 border-sky-100">
      <MapContainer center={center} zoom={zoom} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
        <TileLayer
          attribution='<a href="https://maps.gsi.go.jp/development/ichiran.html">国土地理院</a>'
          url="https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"
        />
        {onPick && <ClickPicker onPick={onPick} />}
        {fitRoute && <FitRoute route={routePoints} />}

        {pins.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={avatarIcon(p.userName ?? '?', !!p.isMine)}
          >
            <Popup maxWidth={260}>
              <div className="w-56">
                {p.photoUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={p.photoUrl}
                    alt={p.title}
                    className="mb-2 h-32 w-full rounded-md object-cover"
                  />
                )}
                <div className="text-sm font-bold text-gray-900">{p.title}</div>
                {p.comment && <div className="mt-1 text-xs text-gray-600">{p.comment}</div>}
                <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                  <span>
                    {p.userName}
                    {p.date ? ` ・ ${p.date}` : ''}
                  </span>
                  {onToggleFavorite && (
                    <button
                      onClick={() => onToggleFavorite(p.id)}
                      className="ml-2 rounded px-1 text-base leading-none"
                      title="お気に入り"
                    >
                      {p.isFavorite ? '★' : '☆'}
                    </button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}

        {routePoints.map((r, i) => (
          <Marker key={`r${i}`} position={[r.lat, r.lng]} icon={numberIcon(i + 1)}>
            <Popup>
              <span className="text-sm font-bold">
                {i + 1}. {r.label}
              </span>
            </Popup>
          </Marker>
        ))}
        {routePoints.length >= 2 && (
          <Polyline
            positions={routePoints.map((r) => [r.lat, r.lng] as [number, number])}
            pathOptions={{ color: '#2563eb', weight: 3, dashArray: '6 8' }}
          />
        )}

        {picked && <Marker position={[picked.lat, picked.lng]} icon={pickedIcon} />}
      </MapContainer>
    </div>
  );
}
