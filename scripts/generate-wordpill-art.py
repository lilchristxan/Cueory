"""Draws wordpill's wordmark and icon as plain SVG outlines (Christian's approved designs "B" and "L1", 2026-11-26).

The letters are real outlines taken from Liberation Serif (SIL Open Font License), so they look the same everywhere
and no font file is added to the site. Run `python3 scripts/generate-wordpill-art.py` to rebuild the three files in
public/design/games-v2/assets/ (the generated files are committed). The hex values live in the artwork files only;
components and CSS never use them.

  wordpill-wordmark-light.svg  Daytime wordmark: a horizontal capsule, "word" in white on game green, "pill" in bold
                               oxblood on ivory, with a 2-unit green outline.
  wordpill-wordmark-dark.svg   Evening wordmark: the same artwork with a thin ivory rim round the capsule (E1, approved
                               by Christian, 2026-11-26).
  wordpill-icon-l1.svg         The icon: the capsule shortened to "w | p" on an ivory rounded tile.
"""
import os

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/design/games-v2/assets")
FONTS = "/usr/share/fonts/truetype/liberation"

GREEN = "#0e5a3d"
IVORY = "#f9f5ef"
OXBLOOD = "#6e2019"
WHITE = "#ffffff"


def load(name):
    font = TTFont(os.path.join(FONTS, name))
    return font, font.getGlyphSet(), font["cmap"].getBestCmap(), font["head"].unitsPerEm


REGULAR = load("LiberationSerif-Regular.ttf")
BOLD = load("LiberationSerif-Bold.ttf")


def text_path(face, text, size, centre_x, baseline):
    """One path string for `text`, centred on centre_x, with its baseline at `baseline` (SVG y grows downward)."""
    font, glyphs, cmap, upem = face
    scale = size / upem
    names = [cmap[ord(ch)] for ch in text]
    width = sum(font["hmtx"][n][0] for n in names) * scale
    x = centre_x - width / 2
    parts = []
    for n in names:
        pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        glyphs[n].draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        parts.append(pen.getCommands())
        x += font["hmtx"][n][0] * scale
    return " ".join(p for p in parts if p)


def capsule(x, y, w, h, split, rim, tag):
    r = h / 2
    return (
        f'<defs><clipPath id="{tag}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r:g}"/></clipPath></defs>'
        f'<g clip-path="url(#{tag})"><rect x="{x}" y="{y}" width="{split - x:g}" height="{h}" fill="{GREEN}"/>'
        f'<rect x="{split}" y="{y}" width="{x + w - split:g}" height="{h}" fill="{IVORY}"/></g>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r:g}" fill="none" stroke="{rim}" stroke-width="2"/>'
    )


def wordmark(rim, title, tag):
    word = text_path(REGULAR, "word", 62, 100, 69)
    pill = text_path(BOLD, "pill", 62, 226, 69)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" role="img" aria-label="{title}">'
        f"{capsule(2, 2, 296, 96, 170, rim, tag)}"
        f'<path d="{word}" fill="{WHITE}"/><path d="{pill}" fill="{OXBLOOD}"/></svg>\n'
    )


def icon():
    w = text_path(REGULAR, "w", 30, 33, 60)
    p = text_path(BOLD, "p", 30, 65, 59)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="wordpill">'
        f'<rect width="100" height="100" rx="23" fill="{IVORY}"/>'
        f"{capsule(14, 31, 72, 38, 50, GREEN, 'wordpill-icon-clip')}"
        f'<path d="{w}" fill="{WHITE}"/><path d="{p}" fill="{OXBLOOD}"/></svg>\n'
    )


FILES = {
    "wordpill-wordmark-light.svg": wordmark(GREEN, "wordpill", "wordpill-clip-day"),
    "wordpill-wordmark-dark.svg": wordmark(IVORY, "wordpill", "wordpill-clip-evening"),
    "wordpill-icon-l1.svg": icon(),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, svg in FILES.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(svg)
        print("wrote", name, len(svg), "bytes")
