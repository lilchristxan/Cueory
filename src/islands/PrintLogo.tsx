/**
 * The cueory logo at the top middle of a printed puzzle (crossword, word path, sudoku). Print only: on screen it is
 * hidden by [data-print-only] (print.css). It is Christian's approved PNG artwork for light backgrounds (brand v1.0,
 * docs/BRAND.md), shown as is: never retyped, traced, recolored or shadowed. Its size on paper is --print-logo.
 *
 * It is not requested on screen: the <img> is lazy and hidden (display: none, print.css), so no browser fetches it until
 * the page is printed (Firefox used to abort the eager hidden request and the console sweep counted it). The <picture>
 * source with media="print" picks the file for paper. The "?print" query names the same file at its own address, so this
 * print copy is never mistaken for (or held up behind) the share card's request for the same logo when it draws a story
 * image.
 */
export default function PrintLogo() {
  return (
    <picture>
      <source
        media="print"
        srcSet="/brand/v1/logo-full-light-480.png?print 480w, /brand/v1/logo-full-light-960.png?print 960w"
        sizes="12rem"
      />
      <img
        className="game-print-logo"
        data-print-only
        data-testid="game-print-logo"
        src="/brand/v1/logo-full-light-480.png?print"
        loading="lazy"
        width={960}
        height={303}
        alt="cueory"
        decoding="async"
        draggable={false}
      />
    </picture>
  );
}
