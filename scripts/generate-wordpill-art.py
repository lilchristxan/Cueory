"""Draws wordpill's wordmark and icon as plain SVG outlines (Christian's choice, 2026-11-27).

The brand is two pieces. The wordmark is the name on its own, in script, with no capsule round it: it climbs to
the right at a slight incline over a hand-drawn underline. The logo (the icon)
is a single script "w" in a capsule filled with wordpill's pale sky (mint at the top, white in the middle, pink at the bottom).

The letters are real outlines taken from Yellowtail (by Astigmatic, Apache License 2.0), so they look the same everywhere
and no font file is added to the site. The font is not in this repository: download the npm package
`@fontsource/yellowtail` (`npm pack @fontsource/yellowtail`, then unpack it), and run

    WORDPILL_FONT=/path/to/yellowtail-latin-400-normal.woff2 python3 scripts/generate-wordpill-art.py

to rebuild the three files in public/design/games-v2/assets/ (the generated files are committed). The hex values live in
the artwork files only; components and CSS never use them.

  wordpill-wordmark-light.svg  Daytime wordmark: game-green letters with a thin white outline.
  wordpill-wordmark-dark.svg   Evening wordmark: the same letters in white with a thin game-green outline.
  wordpill-icon-l1.svg         The logo (Christian's "V1", 2026-11-27): a white "w" with a thin bronze outline, in the sky
                               capsule with a thin bronze rim. Bronze is the letter colour on the game's white pill.
"""
import os
import sys

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/design/games-v2/assets")

GREEN = "#0e5a3d"
WHITE = "#ffffff"
BRONZE = "#6b5243"  # the letter colour on the game's white pill
# The sky inside the capsule, top to bottom: mint, pale mint, pink white, rose, pink.
SKY = (("0", "#a8d5ba"), ("0.3", "#dff1e6"), ("0.55", "#fff5f7"), ("0.8", "#f7c6d4"), ("1", "#f4a6c0"))


def load():
    path = os.environ.get("WORDPILL_FONT")
    if not path or not os.path.isfile(path):
        sys.exit("Set WORDPILL_FONT to the Yellowtail font file (see the note at the top of this script).")
    font = TTFont(path)
    return font, font.getGlyphSet(), font["cmap"].getBestCmap(), font["head"].unitsPerEm


def text_path(face, text, size, centre_x, baseline):
    """One path string for `text`, with its ink centred on centre_x and its baseline at `baseline` (SVG y grows downward)."""
    font, glyphs, cmap, upem = face
    scale = size / upem
    names = [cmap[ord(ch)] for ch in text]
    # Measure the inked width (a script face has long side bearings, so advances alone would sit off-centre).
    x, left, right = 0.0, None, None
    for n in names:
        pen = BoundsPen(glyphs)
        glyphs[n].draw(pen)
        if pen.bounds:
            lo, hi = x + pen.bounds[0] * scale, x + pen.bounds[2] * scale
            left = lo if left is None else min(left, lo)
            right = hi if right is None else max(right, hi)
        x += font["hmtx"][n][0] * scale
    x = centre_x - (left + right) / 2
    parts = []
    for n in names:
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        glyphs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        parts.append(pen.getCommands())
        x += font["hmtx"][n][0] * scale
    return " ".join(p for p in parts if p)


def capsule(x, y, w, h, tag, line, rim=GREEN):
    stops = "".join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in SKY)
    return (
        f'<defs><linearGradient id="{tag}" x1="0" y1="0" x2="0" y2="1">{stops}</linearGradient></defs>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{h / 2:g}" fill="url(#{tag})" stroke="{rim}" stroke-width="{line}"/>'
    )


def letters(d, line, fill=GREEN, rim=WHITE):
    # The rim is painted under the fill, so it shows only as a thin line outside the letters.
    return f'<path d="{d}" fill="{fill}" stroke="{rim}" stroke-width="{line * 2}" stroke-linejoin="round" paint-order="stroke"/>'


def wordmark(face, fill, rim):
    # The name climbs to the right at a slight incline over a hand-drawn underline (Christian, 2026-11-27).
    word = text_path(face, "wordpill", 70, 150, 60)
    swash = "M38 87 C 104 76, 196 73, 264 78"
    line = (
        f'<path d="{swash}" fill="none" stroke="{rim}" stroke-width="6" stroke-linecap="round"/>'
        f'<path d="{swash}" fill="none" stroke="{fill}" stroke-width="3" stroke-linecap="round"/>'
    )
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" role="img" aria-label="wordpill">'
        f'<g transform="rotate(-4 150 50)">{letters(word, 1.5, fill, rim)}</g>{line}</svg>\n'
    )


def icon(face):
    w = text_path(face, "w", 72, 50, 64)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="wordpill">'
        f'{capsule(3, 23, 94, 54, "wordpill-icon-sky", 1.5, BRONZE)}{letters(w, 1.2, WHITE, BRONZE)}</svg>\n'
    )


if __name__ == "__main__":
    face = load()
    files = {
        "wordpill-wordmark-light.svg": wordmark(face, GREEN, WHITE),
        "wordpill-wordmark-dark.svg": wordmark(face, WHITE, GREEN),
        "wordpill-icon-l1.svg": icon(face),
    }
    os.makedirs(OUT, exist_ok=True)
    for name, svg in files.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(svg)
        print("wrote", name, len(svg), "bytes")
