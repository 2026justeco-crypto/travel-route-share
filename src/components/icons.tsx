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
