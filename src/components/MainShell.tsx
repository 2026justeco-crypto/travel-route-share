'use client';

import { usePathname } from 'next/navigation';

// トップ（入口）だけは全画面で描くので、幅の制限と余白を外す。
// それ以外の画面は今までどおりの中央寄せの枠。
export default function MainShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/') {
    return <main className="w-full flex-1">{children}</main>;
  }
  return <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>;
}
