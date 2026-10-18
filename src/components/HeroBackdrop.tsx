// 入口の全画面背景。
// ★依頼2でここを地図（A）・地球儀（B）の全画面表示に差し替える。今は仮の背景だけ。
//   A＝淡色＋水玉／B＝濃色＋ぼんやりした円（地球の仮置き）。切替は globals.css の data-theme だけで行う。
export default function HeroBackdrop() {
  return (
    <div aria-hidden className="hero-backdrop pointer-events-none absolute inset-0 overflow-hidden">
      <div className="hero-globe absolute left-1/2 top-[30%] aspect-square w-[min(120vw,70dvh)] -translate-x-1/2 -translate-y-1/2 rounded-full" />
    </div>
  );
}
