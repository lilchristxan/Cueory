/**
 * The cueory logo at the top middle of a printed puzzle (crossword, word path, sudoku). Print only: on screen it is
 * hidden by [data-print-only] (print.css). It is Christian's approved PNG artwork for light backgrounds (brand v1.0,
 * docs/BRAND.md), shown as is: never retyped, traced, recolored or shadowed. Its size on paper is --print-logo.
 */
export default function PrintLogo() {
  return (
    <img
      className="game-print-logo"
      data-print-only
      data-testid="game-print-logo"
      src="/brand/v1/logo-full-light-480.png"
      srcSet="/brand/v1/logo-full-light-480.png 480w, /brand/v1/logo-full-light-960.png 960w"
      sizes="12rem"
      width={960}
      height={303}
      alt="cueory"
      decoding="async"
      draggable={false}
    />
  );
}
