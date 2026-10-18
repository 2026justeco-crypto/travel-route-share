'use client';

// 写真1枚（依頼11）。写真が付いているのに URL がまだ来ていない・画像を読み込み中の間は骨組みを出す。
//   photoId が無い（写真なし）ときは何も出さない。URL を作れなかった（見られない・消えた）ときも何も出さない。
import { useState } from 'react';

interface Props {
  photoId: string | null | undefined;
  /** photoUrls で取った URL の表（まだ取っている途中なら loading を true に） */
  urls: Map<string, string>;
  /** URL を取っている途中か（終わったのに表に無い＝出せない写真） */
  loading?: boolean;
  alt: string;
  className?: string;
}

export default function PhotoImg({ photoId, urls, loading = false, alt, className = '' }: Props) {
  const src = photoId ? urls.get(photoId) : undefined;
  const [loadedSrc, setLoadedSrc] = useState<string | null>(null);
  if (!photoId) return null;
  if (!src) return loading ? <div aria-hidden className={`trs-skeleton ${className}`} /> : null;
  const done = loadedSrc === src;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoadedSrc(src)}
      className={`${className} ${done ? '' : 'trs-skeleton'}`}
    />
  );
}
