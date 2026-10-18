'use client';

// サイトの中で画面を移るたびに、道のり（lib/navTrail）を更新する。画面には何も出さない。
// ブラウザの戻る/進むは lib/navTrail の popstate 側で直す（popstate がこの更新より後に来ることがある）。
import { Suspense, useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { trailOnChange, trailOnLoad } from '@/lib/navTrail';

function Tracker() {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      trailOnLoad();
      return;
    }
    trailOnChange();
  }, [pathname, search]);

  return null;
}

export default function NavTracker() {
  return (
    <Suspense fallback={null}>
      <Tracker />
    </Suspense>
  );
}
