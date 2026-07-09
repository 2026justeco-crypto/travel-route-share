import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-[1000] border-b border-gray-200 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-xl">🗾</span>
          <span className="text-lg font-bold tracking-tight text-blue-600">
            Travel Route Share
          </span>
          <span className="ml-2 hidden rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600 sm:inline">
            旅行全体を共有するSNS（MVP・デモモード）
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/posts/new"
            className="rounded-lg border border-blue-600 px-3 py-1.5 text-sm font-semibold text-blue-600 hover:bg-blue-50"
          >
            写真を投稿
          </Link>
          <Link
            href="/trips/new"
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            旅行ルート作成
          </Link>
        </nav>
      </div>
    </header>
  );
}
