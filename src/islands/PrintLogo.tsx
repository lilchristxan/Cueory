/**
 * The cueory logo at the top middle of a printed puzzle (crossword, word path, sudoku). Print only: on screen it is
 * hidden by [data-print-only] (print.css). It is Christian's approved PNG artwork for light backgrounds (brand v1.0,
 * docs/BRAND.md), shown as is: never retyped, traced, recolored or shadowed. Its size on paper is --print-logo.
 *
 * It is drawn by a background that print.css sets only inside @media print, so no browser requests the artwork on screen
 * (Firefox used to abort the hidden eager image request and the console sweep counted it). The "?print" query names the
 * same file at its own address, so this print copy is never mistaken for (or held up behind) the share card's request
 * for the same logo when it draws a story image.
 */
export default function PrintLogo() {
  return <div className="game-print-logo" data-print-only data-testid="game-print-logo" role="img" aria-label="cueory" />;
}
