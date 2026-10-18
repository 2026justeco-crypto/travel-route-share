'use client';

// 入口の背景に敷く飾りの地図（操作は受け付けない）。
// A＝日本全体が見えるポップな地図／B＝ゆっくり自転する地球儀（動きを減らす設定の人には止めて出す）。

import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { mapStyle } from '@/lib/mapStyles';
import type { ThemeId } from '@/lib/theme';
import { useTheme } from '@/lib/useTheme';

export default function HeroMap() {
  const theme = useTheme();
  return <HeroMapView key={theme} theme={theme} />;
}

const DEG_PER_SEC = 3; // 1周およそ2分

function HeroMapView({ theme }: { theme: ThemeId }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.clientWidth;
    const h = el.clientHeight;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const common = {
      container: el,
      style: mapStyle(theme, { labels: false }),
      interactive: false,
      attributionControl: false as const,
      fadeDuration: 0,
    };

    let m: maplibregl.Map;
    if (theme === 'b') {
      // 地球の直径を画面に合わせる（赤道1周＝512×2^zoom px → 直径はその1/π）
      const diameter = Math.min(w * 0.96, h * 0.56);
      const z = Math.log2((diameter * Math.PI) / 512);
      m = new maplibregl.Map({ ...common, center: [138, 28], zoom: z });
      // 地球を少し上へ（下は大きなボタンの場所）
      m.setPadding({ top: 0, left: 0, right: 0, bottom: h * 0.22 });
    } else {
      // 日本全体（北海道〜九州）が入るように。下は大きなボタンの場所なので余白を多めに
      const narrow = w < 640;
      m = new maplibregl.Map({
        ...common,
        bounds: [
          [128.6, 30.6],
          [146.2, 45.6],
        ],
        fitBoundsOptions: {
          padding: narrow
            ? { top: 70, bottom: Math.round(h * 0.3), left: 8, right: 8 }
            : { top: 70, bottom: Math.round(h * 0.28), left: 40, right: 40 },
        },
      });
    }

    let raf = 0;
    let visible = true;
    let last = 0;
    const spin = (t: number) => {
      if (last) {
        const dt = Math.min(0.1, (t - last) / 1000);
        const c = m.getCenter();
        m.setCenter([c.lng + DEG_PER_SEC * dt, c.lat]);
      }
      last = t;
      raf = requestAnimationFrame(spin);
    };
    const start = () => {
      if (raf || reduce || theme !== 'b' || !visible) return;
      last = 0;
      raf = requestAnimationFrame(spin);
    };
    const stop = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    };
    m.on('load', start);

    // 画面の外に出たら止める（スクロールで2画面目に行ったとき）
    const io = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) {
        if (m.loaded()) start();
      } else stop();
    });
    io.observe(el);

    return () => {
      io.disconnect();
      stop();
      m.remove();
    };
  }, [theme]);

  // maplibre-gl.css が .maplibregl-map に position:relative を当てるので、位置はインラインで指定する
  return <div ref={ref} style={{ position: 'absolute', inset: 0 }} />;
}
