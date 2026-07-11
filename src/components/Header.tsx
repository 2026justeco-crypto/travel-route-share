import Link from 'next/link';

export default function Header() {
  return (
    <header className="sticky top-0 z-[1000] border-b-2 border-sky-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href="/" className="flex items-center gap-2">
          <span className="text-2xl">🗾</span>
          <span className="text-lg font-extrabold tracking-tight text-sky-600">
            Travel Route Share
          </span>
          <span className="ml-2 hidden rounded-full bg-sky-100 px-2.5 py-0.5 text-xs font-bold text-sky-600 sm:inline">
            旅行全体を共有するSNS（MVP・デモモード）
          </span>
        </Link>
        <nav className="flex items-center gap-2">
          <Link
            href="/posts/new"
            className="rounded-full border-2 border-sky-500 px-4 py-1.5 text-sm font-bold text-sky-600 transition hover:bg-sky-50"
          >
            📷 写真を投稿
          </Link>
          <Link
            href="/trips/new"
            className="rounded-full bg-sky-500 px-4 py-1.5 text-sm font-bold text-white shadow-md shadow-sky-200 transition hover:bg-sky-600"
          >
            🧭 旅行ルート作成
          </Link>
        </nav>
      </div>
    </header>
  );
}
