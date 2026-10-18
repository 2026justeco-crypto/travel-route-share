// 利用規約・プライバシーポリシーのページの部品（依頼14）。サーバー側で描く（静的に書き出す）。
import Link from 'next/link';
import { CONTACT_URL, LEGAL_UPDATED, OPERATOR } from '@/lib/legal';

export function LegalPage({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-6 text-ink">
      <header className="space-y-1">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        <p className="text-sm text-muted">
          最終更新日：{LEGAL_UPDATED}　運営：{OPERATOR}
        </p>
      </header>
      {children}
      <nav aria-label="ほかのページ" className="flex flex-wrap gap-x-3 border-t border-line-soft pt-4 text-sm">
        <Link href="/terms" className="inline-flex min-h-11 items-center text-link underline">
          利用規約
        </Link>
        <Link href="/privacy" className="inline-flex min-h-11 items-center text-link underline">
          プライバシーポリシー
        </Link>
        <Link href="/settings" className="inline-flex min-h-11 items-center text-link underline">
          設定（データを消す）
        </Link>
        <Link href="/" className="inline-flex min-h-11 items-center text-link underline">
          トップへ
        </Link>
      </nav>
    </article>
  );
}

export function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  );
}

export function List({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1 pl-5">
      {items.map((x, i) => (
        <li key={i}>{x}</li>
      ))}
    </ul>
  );
}

/** お問い合わせフォームへのリンク（新しいタブ） */
export function ContactLink({ children = 'お問い合わせフォーム' }: { children?: React.ReactNode }) {
  return (
    <a href={CONTACT_URL} target="_blank" rel="noopener noreferrer" className="text-link underline">
      {children}
    </a>
  );
}
