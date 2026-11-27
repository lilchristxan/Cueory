"""Draws wordpill's wordmark and icon as plain SVG outlines (Christian's approved designs "B" and "L1", 2026-11-26).

The letters are real outlines taken from Liberation Serif (SIL Open Font License), so they look the same everywhere
and no font file is added to the site. Run `python3 scripts/generate-wordpill-art.py` to rebuild the three files in
public/design/games-v2/assets/ (the generated files are committed). The hex values live in the artwork files only;
components and CSS never use them.

  wordpill-wordmark-light.svg  Daytime wordmark: the name on its own, "word" in deep game green and "pill" in bold oxblood.
  wordpill-wordmark-dark.svg   Evening wordmark: the same letters, "word" in ivory and "pill" in a light oxblood.
  wordpill-icon-l1.svg         The icon: "wp" in a glass capsule, on its own (no tile), filling the frame.

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
# The brand's deep game green (--game-dark-green-deep): the rim of the ivory half in Daytime and on the icon.
GREEN_DEEP = "#053321"
IVORY = "#f9f5ef"
# "pill" on the Evening page: a light step of the oxblood, which itself is too dark to read there.
OXBLOOD_EVENING = "#e0958c"
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


def n(value):
    return f"{value:.2f}".rstrip("0").rstrip(".")


def capsule(x, y, w, h, split, rim, outline):
    """The glass capsule (Christian, 2026-11-26, "H1"): the green half is thick dark glass (a shell, a near-black core, a long
    shine along the top and a green glow along the bottom); the ivory half is a glossy pill with a hairline rim in `rim`; a
    soft shadow lies under both, and a hairline in `outline` runs round the whole pill so it stands clear of a dark page
    (Christian: "a very thin 1px outline for contrast"). Hairlines are one screen pixel at any size. Every shade here is a lighter or darker step of the game's own green and ivory.
    """
    r = h / 2
    t = h * 0.085  # the glass shell's thickness
    ix, iy, iw, ih = x + t, y + t, w - 2 * t, h - 2 * t
    rw = x + w - split
    return (
        "<defs>"
        f'<clipPath id="outer"><rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" rx="{n(r)}"/></clipPath>'
        f'<clipPath id="core"><rect x="{n(ix)}" y="{n(iy)}" width="{n(iw)}" height="{n(ih)}" rx="{n(ih / 2)}"/></clipPath>'
        f'<clipPath id="left"><rect x="{n(x)}" y="{n(y)}" width="{n(split - x)}" height="{n(h)}"/></clipPath>'
        f'<clipPath id="right"><rect x="{n(split)}" y="{n(y - 2)}" width="{n(rw + 4)}" height="{n(h + 4)}"/></clipPath>'
        f'<clipPath id="gloss"><rect x="{n(x)}" y="{n(y + h * 0.06)}" width="{n(w - h * 0.16)}" height="{n(h * 0.36)}" rx="{n(h * 0.18)}"/></clipPath>'
        '<linearGradient id="shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4c6257"/><stop offset=".5" stop-color="#22362c"/><stop offset="1" stop-color="#34493e"/></linearGradient>'
        f'<linearGradient id="glass" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a3a27"/><stop offset=".38" stop-color="#031a11"/><stop offset=".72" stop-color="#04261a"/><stop offset="1" stop-color="{GREEN}"/></linearGradient>'
        '<linearGradient id="streak" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".08" stop-color="#fff" stop-opacity=".85"/><stop offset=".55" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
        '<linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset=".45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>'
        '<linearGradient id="shine" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity=".05"/></linearGradient>'
        f'<filter id="soft" x="-10%" y="-80%" width="120%" height="260%"><feGaussianBlur stdDeviation="{n(h * 0.022)}"/></filter>'
        f'<filter id="softer" x="-10%" y="-80%" width="120%" height="260%"><feGaussianBlur stdDeviation="{n(h * 0.05)}"/></filter>'
        f'<filter id="shadow" x="-20%" y="-40%" width="140%" height="220%"><feGaussianBlur stdDeviation="{n(h * 0.035)}"/></filter>'
        "</defs>"
        f'<rect x="{n(x + h * 0.03)}" y="{n(y + h * 0.05)}" width="{n(w)}" height="{n(h)}" rx="{n(r)}" opacity=".32" filter="url(#shadow)"/>'
        '<g clip-path="url(#outer)">'
        f'<rect x="{n(x)}" y="{n(y)}" width="{n(w)}" height="{n(h)}" fill="url(#shell)"/>'
        f'<rect x="{n(x + r)}" y="{n(y + h * 0.015)}" width="{n(w - h)}" height="{n(h * 0.03)}" fill="#fff" opacity=".45" filter="url(#soft)"/>'
        f'<rect x="{n(split)}" y="{n(y)}" width="{n(rw)}" height="{n(h)}" fill="{IVORY}"/>'
        f'<rect x="{n(split)}" y="{n(y)}" width="{n(rw)}" height="{n(h)}" fill="url(#shade)"/>'
        f'<rect x="{n(split)}" y="{n(y + h * 0.06)}" width="{n(rw - h * 0.16)}" height="{n(h * 0.36)}" fill="url(#shine)" clip-path="url(#gloss)"/>'
        "</g>"
        '<g clip-path="url(#core)"><g clip-path="url(#left)">'
        f'<rect x="{n(ix)}" y="{n(iy)}" width="{n(iw)}" height="{n(ih)}" fill="url(#glass)"/>'
        f'<rect x="{n(ix + ih * 0.25)}" y="{n(iy + ih * 0.8)}" width="{n(split - ix - ih * 0.5)}" height="{n(ih * 0.12)}" rx="{n(ih * 0.06)}" fill="#17a05f" opacity=".55" filter="url(#softer)"/>'
        f'<rect x="{n(ix + ih * 0.3)}" y="{n(iy + ih * 0.09)}" width="{n(iw - ih * 0.6)}" height="{n(ih * 0.17)}" rx="{n(ih * 0.085)}" fill="url(#streak)" opacity=".8" filter="url(#soft)"/>'
        f'<ellipse cx="{n(ix + ih * 0.42)}" cy="{n(iy + ih * 0.2)}" rx="{n(ih * 0.16)}" ry="{n(ih * 0.07)}" fill="#fff" opacity=".8" filter="url(#soft)"/>'
        "</g></g>"
        f'<g clip-path="url(#right)"><rect x="{n(x + 0.5)}" y="{n(y + 0.5)}" width="{n(w - 1)}" height="{n(h - 1)}" rx="{n(r - 0.5)}" fill="none" stroke="{rim}" stroke-width="1" vector-effect="non-scaling-stroke"/></g>'
        f'<rect x="{n(x - 0.5)}" y="{n(y - 0.5)}" width="{n(w + 1)}" height="{n(h + 1)}" rx="{n(r + 0.5)}" fill="none" stroke="{outline}" stroke-width="1" vector-effect="non-scaling-stroke"/>'
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


# The icon is drawn a little smaller than its frame, from the top centre, so the shadow under it fits inside the image.
FIT_ICON = "translate(3 1) scale(.94)"
WORD_SIZE = 80


def wordmark(word_ink, pill_ink, title):
    """The name on its own, no capsule round it (Christian, 2026-11-26, "W1"): one word, "word" regular and "pill" bold."""
    word_centre, pill_centre, _ = joined(REGULAR, "word", BOLD, "pill", WORD_SIZE, 150, 3)
    word = text_path(REGULAR, "word", WORD_SIZE, word_centre, 71)
    pill = text_path(BOLD, "pill", WORD_SIZE, pill_centre, 71)
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100" role="img" aria-label="{title}">'
        f'<path d="{word}" fill="{word_ink}"/><path d="{pill}" fill="{pill_ink}"/></svg>\n'
    )


def icon():
    """"wp" in the glass capsule, filling its frame. One file for both palettes: the ivory hairline shows on a dark page."""
    w_centre, p_centre, line = joined(REGULAR, "w", BOLD, "p", 45, 50, 4.8)
    w = text_path(REGULAR, "w", 45, w_centre, 65)
    p = text_path(BOLD, "p", 45, p_centre, 62.5)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="wordpill">'
        f'<g transform="{FIT_ICON}">{capsule(3, 17, 94, 66, line, GREEN_DEEP, IVORY)}'
        f'<path d="{w}" fill="{WHITE}"/><path d="{p}" fill="{OXBLOOD}"/></g></svg>\n'
    )


FILES = {
    "wordpill-wordmark-light.svg": wordmark(GREEN_DEEP, OXBLOOD, "wordpill"),
    "wordpill-wordmark-dark.svg": wordmark(IVORY, OXBLOOD_EVENING, "wordpill"),
    "wordpill-icon-l1.svg": icon(),
}

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for name, svg in FILES.items():
        with open(os.path.join(OUT, name), "w") as f:
            f.write(svg)
        print("wrote", name, len(svg), "bytes")
