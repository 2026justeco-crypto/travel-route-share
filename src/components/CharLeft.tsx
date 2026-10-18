// 入力欄の残り文字数（依頼16）。上限は lib/limits.ts。
//   数え方は入力欄の maxLength と同じ（value.length）。書き始めてから出す。残りが少ないと赤くする
export default function CharLeft({ value, max, id }: { value: string; max: number; id?: string }) {
  if (!value) return null;
  const left = max - value.length;
  return (
    <p
      id={id}
      aria-live="polite"
      className={`mt-0.5 text-right text-xs ${left <= Math.max(5, Math.floor(max * 0.1)) ? 'font-bold text-red-500' : 'text-muted'}`}
    >
      あと{Math.max(0, left)}字
    </p>
  );
}
