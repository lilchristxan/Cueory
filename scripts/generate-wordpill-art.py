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


def cubic_point(c, t):
    (x0, y0), (x1, y1), (x2, y2), (x3, y3) = c
    u = 1 - t
    return (u**3 * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t**3 * x3, u**3 * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t**3 * y3)


def cubic_part(c, t0, t1):
    """The piece of cubic `c` between t0 and t1, as its own four control points (de Casteljau)."""
    def split(q, t):
        ab, bc, cd = [tuple(a + (b - a) * t for a, b in zip(q[i], q[i + 1])) for i in range(3)]
        abc, bcd = [tuple(a + (b - a) * t for a, b in zip(m, n)) for m, n in ((ab, bc), (bc, cd))]
        mid = tuple(a + (b - a) * t for a, b in zip(abc, bcd))
        return (q[0], ab, abc, mid), (mid, bcd, cd, q[3])
    _, right = split(c, t0)
    left, _ = split(right, (t1 - t0) / (1 - t0))
    return left


def descender_span(face, text, letter, size, centre_x, baseline, turn, about, curve):
    """Where `letter`'s tail crosses `curve`, as the pair of t values just clear of it on each side."""
    import math
    from fontTools.pens.recordingPen import DecomposingRecordingPen
    font, glyphs, cmap, upem = face
    scale = size / upem
    names = [cmap[ord(ch)] for ch in text]
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
    for n, ch in zip(names, text):
        if ch == letter:
            break
        x += font["hmtx"][n][0] * scale
    rec = DecomposingRecordingPen(glyphs)
    glyphs[cmap[ord(letter)]].draw(rec)
    cos, sin = math.cos(math.radians(turn)), math.sin(math.radians(turn))
    hits = []
    for _, points in rec.value:
        for px, py in points:
            gx, gy = x + px * scale - about[0], baseline - py * scale - about[1]
            hits.append((about[0] + gx * cos - gy * sin, about[1] + gx * sin + gy * cos))
    steps = [i / 400 for i in range(401)]
    near = [t for t in steps if any(abs(cubic_point(curve, t)[0] - hx) < 3 and hy > cubic_point(curve, t)[1] - 6 for hx, hy in hits)]
    return (min(near), max(near)) if near else None


def wordmark(face, fill, rim):
    # The name climbs to the right at a slight incline over a hand-drawn underline (Christian, 2026-11-27). The
    # underline breaks where the tail of the p comes down, so the two never cross.
    word = text_path(face, "wordpill", 70, 150, 60)
    curve = ((38, 87), (104, 76), (196, 73), (264, 78))
    span = descender_span(face, "wordpill", "p", 70, 150, 60, -4, (150, 50), curve)
    pieces = [curve] if span is None else [cubic_part(curve, 0.0001, max(span[0] - 0.02, 0.001)), cubic_part(curve, min(span[1] + 0.02, 0.998), 0.9999)]
    num = lambda v: f"{v:.2f}".rstrip("0").rstrip(".")
    swash = " ".join(f"M{num(c[0][0])} {num(c[0][1])} C {num(c[1][0])} {num(c[1][1])}, {num(c[2][0])} {num(c[2][1])}, {num(c[3][0])} {num(c[3][1])}" for c in pieces)
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
