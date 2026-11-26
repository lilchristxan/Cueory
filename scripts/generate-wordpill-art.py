"""Draws wordpill's wordmark and icon as plain SVG outlines (Christian's approved designs "B" and "L1", 2026-11-26).

The letters are real outlines taken from Liberation Serif (SIL Open Font License), so they look the same everywhere
and no font file is added to the site. Run `python3 scripts/generate-wordpill-art.py` to rebuild the three files in
public/design/games-v2/assets/ (the generated files are committed). The hex values live in the artwork files only;
components and CSS never use them.

  wordpill-wordmark-light.svg  Daytime wordmark: a horizontal capsule, "word" in white on game green, "pill" in bold
                               oxblood on ivory, with a 2-unit green outline.
  wordpill-wordmark-dark.svg   Evening wordmark: the same artwork with a thin ivory rim round the capsule (E1, approved
                               by Christian, 2026-11-26).
  wordpill-icon-l1.svg         The icon: the capsule shortened to "wp", on its own (no tile), filling the frame.

Christian, 2026-11-26 (second pass): wordpill is one word, so the whole word is centred in the capsule by its ink, "word"
and "pill" sit at a normal letter gap, and the colour line falls exactly on the left edge of the p (no ivory before it).
The icon lost its ivory tile and its letters grew; it follows the same rule.
"""
import os

from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public/design/games-v2/assets")
FONTS = "/usr/share/fonts/truetype/liberation"

GREEN = "#0e5a3d"
# The Daytime wordmark uses the brand's deep game green (--game-dark-green-deep): with the regular green the wordmark
# measured 2.49 against the Daytime page in the contrast guard (needs 3); this measures about 3.1. Icon and Evening keep GREEN.
GREEN_DEEP = "#053321"
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


def capsule(x, y, w, h, split, rim, tag, green=GREEN):
    r = h / 2
    return (
        f'<defs><clipPath id="{tag}"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r:g}"/></clipPath></defs>'
        f'<g clip-path="url(#{tag})"><rect x="{x}" y="{y}" width="{split - x:g}" height="{h}" fill="{green}"/>'
        f'<rect x="{split}" y="{y}" width="{x + w - split:g}" height="{h}" fill="{IVORY}"/></g>'
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r:g}" fill="none" stroke="{rim}" stroke-width="2"/>'
    )


def ink(face, ch, size):
    """A glyph's inked left edge, inked right edge and advance, in drawing units at `size`."""
    font, glyphs, cmap, upem = face
    name = cmap[ord(ch)]
    pen = BoundsPen(glyphs)
    glyphs[name].draw(pen)
    left, _, right, _ = pen.bounds
    return left * size / upem, right * size / upem, font["hmtx"][name][0] * size / upem


def advance(face, text, size):
    font, _, cmap, upem = face
    return sum(font["hmtx"][cmap[ord(ch)]][0] for ch in text) * size / upem


def joined(first_face, first, second_face, second, size, centre, gap):
    """Where two runs go so that, read as one word, their ink is centred on `centre` with `gap` between the two runs' ink.

    Returns the centre of each run (for text_path) and the x of the second run's first inked edge, where the colour line goes.
    """
    first_width, second_width = advance(first_face, first, size), advance(second_face, second, size)
    lead = ink(first_face, first[0], size)[0]
    _, last_right, last_advance = ink(first_face, first[-1], size)
    second_lead = ink(second_face, second[0], size)[0]
    _, end_right, end_advance = ink(second_face, second[-1], size)
    first_ink = first_width - lead - (last_advance - last_right)
    second_ink = second_width - second_lead - (end_advance - end_right)
    left = centre - (first_ink + gap + second_ink) / 2
    first_x = left - lead
    line = left + first_ink + gap
    second_x = line - second_lead
    return first_x + first_width / 2, second_x + second_width / 2, round(line, 2)


def wordmark(rim, title, tag, green=GREEN):
    word_centre, pill_centre, line = joined(REGULAR, "word", BOLD, "pill", 62, 150, 3)
    word = text_path(REGULAR, "word", 62, word_centre, 69)
    pill = text_path(BOLD, "pill", 62, pill_centre, 69)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" role="img" aria-label="{title}">'
        f"{capsule(2, 2, 296, 96, line, rim, tag, green)}"
        f'<path d="{word}" fill="{WHITE}"/><path d="{pill}" fill="{OXBLOOD}"/></svg>\n'
    )


def icon():
    w_centre, p_centre, line = joined(REGULAR, "w", BOLD, "p", 42, 50, 4.5)
    w = text_path(REGULAR, "w", 42, w_centre, 64)
    p = text_path(BOLD, "p", 42, p_centre, 62.5)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="wordpill">'
        f"{capsule(3, 23, 94, 54, line, GREEN, 'wordpill-icon-clip')}"
        f'<path d="{w}" fill="{WHITE}"/><path d="{p}" fill="{OXBLOOD}"/></svg>\n'
    )


FILES = {
    "wordpill-wordmark-light.svg": wordmark(GREEN_DEEP, "wordpill", "wordpill-clip-day", GREEN_DEEP),
    "wordpill-wordmark-dark.svg": wordmark(IVORY, "wordpill", "wordpill-clip-evening"),
    "wordpill-icon-l1.svg": icon(),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, svg in FILES.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(svg)
        print("wrote", name, len(svg), "bytes")
