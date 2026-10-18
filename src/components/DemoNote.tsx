// 「試作：グループはこの端末の中だけです」の注意書き（依頼9）。グループの画面に小さく出す
export default function DemoNote({ className = '' }: { className?: string }) {
  return (
    <p className={`rounded-lg bg-tint px-3 py-2 text-xs font-bold text-link ${className}`}>
      試作：グループはこの端末の中だけです。招待リンクを送っても、ほかの人の端末にはまだ届きません。
    </p>
  );
}
