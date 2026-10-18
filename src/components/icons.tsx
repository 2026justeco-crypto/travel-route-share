// シンプルな線のアイコン（SVG直書き・ライブラリなし）。色は currentColor。
import type { TransportMode } from '@/lib/types';
import { MODE_ICON } from '@/lib/transport';

type P = { className?: string };

const base = {
  width: 24,
  height: 24,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

/** ルート（点と点を結ぶ道） */
export function RouteIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="6" cy="19" r="2.2" />
      <circle cx="18" cy="5" r="2.2" />
      <path d="M8.2 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.8" />
    </svg>
  );
}

/** 思い出（開いた本） */
export function BookIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Z" />
      <path d="M12 6.5v13" />
    </svg>
  );
}

/** 下向き矢印 */
export function ArrowDownIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14" />
      <path d="m6 13 6 6 6-6" />
    </svg>
  );
}

/** 移動手段のアイコン（形は lib/transport.ts の MODE_ICON と共通） */
export function ModeIcon({ mode, className }: P & { mode: TransportMode }) {
  return (
    <svg {...base} className={className}>
      {MODE_ICON[mode].map((d, i) => (
        <path key={i} d={d} />
      ))}
    </svg>
  );
}

/** 移動手段が未設定のときの印（はてな入りの丸） */
export function ModeUnsetIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" strokeDasharray="3 3" />
      <path d="M9.6 9.4a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2-2.4 3.4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

/** 虫めがね（さがす） */
export function SearchIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.2-4.2" />
    </svg>
  );
}

/** カメラ（写真） */
export function CameraIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M4 8h3l1.6-2.4h6.8L17 8h3v11H4Z" />
      <circle cx="12" cy="13.2" r="3.4" />
    </svg>
  );
}

/** 地図のピン */
export function PinIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s-6.5-6.2-6.5-11.2a6.5 6.5 0 0 1 13 0C18.5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.8" r="2.3" />
    </svg>
  );
}

/** 足す（つくる） */
export function PlusIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

/** 上・下・消す（スポットの並べ替え用） */
export function ChevronUpIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}
export function ChevronLeftIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m15 6-6 6 6 6" />
    </svg>
  );
}
export function ChevronDownIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
export function CloseIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

/** 星（お気に入り）。filled で塗る */
export function StarIcon({ className, filled = false }: P & { filled?: boolean }) {
  return (
    <svg {...base} fill={filled ? 'currentColor' : 'none'} className={className}>
      <path d="m12 3.6 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8Z" />
    </svg>
  );
}

/** ロゴの印（地球の丸に道） */
export function LogoIcon({ className }: P) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M7.5 15.5c2-1 2.5-4 4.5-4.5s3 1.5 4.5-1" />
      <circle cx="7.5" cy="15.5" r="1.2" fill="currentColor" />
      <circle cx="16.5" cy="10" r="1.2" fill="currentColor" />
    </svg>
  );
}
