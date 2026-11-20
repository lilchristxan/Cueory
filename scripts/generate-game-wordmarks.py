import os
import io
import uharfbuzz as hb
from fontTools.ttLib import TTFont
from fontTools.ttLib.woff2 import decompress
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen

REPO_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(REPO_ROOT, "public/brand/games")
os.makedirs(OUT_DIR, exist_ok=True)

def decompress_to_ttf(path):
    with open(path, "rb") as f:
        data = f.read()
    if path.endswith(".woff2"):
        out = io.BytesIO()
        decompress(io.BytesIO(data), out)
        return out.getvalue()
    return data

# ==========================================
# 1. GENERATE WORDMARKS
# ==========================================

# --- A. VIALO ---
# Bodoni Moda Medium (500), optical size 96
# Letter-spacing about -0.022em.
# Top 58% espresso #3e2c23, bottom 42% copper #b87348 (Evening: #f9f5ef over #d9976a).
bodoni_norm_data = decompress_to_ttf(os.path.join(REPO_ROOT, "public/fonts/bodoni-moda-latin-opsz-normal.woff2"))
tt_bodoni = TTFont(io.BytesIO(bodoni_norm_data))
inst_bodoni = instantiateVariableFont(tt_bodoni, {"wght": 500, "opsz": 96})
gset_bodoni = inst_bodoni.getGlyphSet()
upem_bodoni = inst_bodoni["head"].unitsPerEm

face_bodoni = hb.Face(bodoni_norm_data)
font_bodoni = hb.Font(face_bodoni)
font_bodoni.set_variations({"wght": 500, "opsz": 96})

buf = hb.Buffer()
buf.add_str("vialo")
buf.guess_segment_properties()
hb.shape(font_bodoni, buf)

letter_spacing_vialo = round(-0.022 * upem_bodoni)

# Measure raw bounds
raw_bounds_pen = BoundsPen(gset_bodoni)
x = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    gname = font_bodoni.glyph_to_string(info.codepoint)
    glyph = gset_bodoni[gname]
    glyph.draw(TransformPen(raw_bounds_pen, (1, 0, 0, 1, x + pos.x_offset, pos.y_offset)))
    x += pos.x_advance + letter_spacing_vialo

bx_min, by_min, bx_max, by_max = raw_bounds_pen.bounds
padding = 40
width = int(bx_max - bx_min + 2 * padding)
height = int(by_max - by_min + 2 * padding)

# In SVG: y increases downward.
# We transform font coords (x_font, y_font):
# x_svg = x_font - bx_min + padding
# y_svg = by_max - y_font + padding
svg_pen = SVGPathPen(gset_bodoni)
x = 0
for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
    gname = font_bodoni.glyph_to_string(info.codepoint)
    glyph = gset_bodoni[gname]
    # Matrix: a=1, b=0, c=0, d=-1, e = x + pos.x_offset - bx_min + padding, f = by_max + pos.y_offset + padding
    dx = x + pos.x_offset - bx_min + padding
    dy = by_max + pos.y_offset + padding
    tp = TransformPen(svg_pen, (1, 0, 0, -1, dx, dy))
    glyph.draw(tp)
    x += pos.x_advance + letter_spacing_vialo

vialo_path_d = svg_pen.getCommands()

# vialo-wordmark-light.svg
vialo_light_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="vialo">
  <defs>
    <linearGradient id="vialo-split-light" x1="0" y1="0" x2="0" y2="1">
      <stop offset="58%" stop-color="#3e2c23" />
      <stop offset="58%" stop-color="#b87348" />
    </linearGradient>
  </defs>
  <path d="{vialo_path_d}" fill="url(#vialo-split-light)" />
</svg>'''

# vialo-wordmark-dark.svg
vialo_dark_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} {height}" role="img" aria-label="vialo">
  <defs>
    <linearGradient id="vialo-split-dark" x1="0" y1="0" x2="0" y2="1">
      <stop offset="58%" stop-color="#f9f5ef" />
      <stop offset="58%" stop-color="#d9976a" />
    </linearGradient>
  </defs>
  <path d="{vialo_path_d}" fill="url(#vialo-split-dark)" />
</svg>'''

with open(os.path.join(OUT_DIR, "vialo-wordmark-light.svg"), "w") as f:
    f.write(vialo_light_svg)
with open(os.path.join(OUT_DIR, "vialo-wordmark-dark.svg"), "w") as f:
    f.write(vialo_dark_svg)

print("Saved vialo wordmarks. Dimensions:", width, height)

# --- B. TACHYYY ---
# "tach" in Bodoni Moda 500 roman, three italic "y"s overlapping.
# y2 and y3 shifted left 0.3365em, overall letter-spacing -0.0125em.
# Light: y1 rgba(62,44,35,0.22), y2 rgba(62,44,35,0.5), y3 #b87348.
# Evening: y1 rgba(249,245,239,0.22), y2 rgba(249,245,239,0.5), y3 #d9976a, tach #f9f5ef.
bodoni_ital_data = decompress_to_ttf(os.path.join(REPO_ROOT, "public/fonts/bodoni-moda-latin-opsz-italic.woff2"))
tt_ital = TTFont(io.BytesIO(bodoni_ital_data))
inst_ital = instantiateVariableFont(tt_ital, {"wght": 500, "opsz": 96})
gset_ital = inst_ital.getGlyphSet()

face_ital = hb.Face(bodoni_ital_data)
font_ital = hb.Font(face_ital)
font_ital.set_variations({"wght": 500, "opsz": 96})

upem_tachy = 2000
letter_spacing_tachy = round(-0.0125 * upem_tachy)
shift_y = round(0.3365 * upem_tachy)

buf_tach = hb.Buffer()
buf_tach.add_str("tach")
buf_tach.guess_segment_properties()
hb.shape(font_bodoni, buf_tach)

buf_y = hb.Buffer()
buf_y.add_str("y")
buf_y.guess_segment_properties()
hb.shape(font_ital, buf_y)
pos_y = buf_y.glyph_positions[0]
gname_y = font_ital.glyph_to_string(buf_y.glyph_infos[0].codepoint)
glyph_y = gset_ital[gname_y]

# Calculate positions
tachy_bounds = BoundsPen(None)
x = 0
for info, pos in zip(buf_tach.glyph_infos, buf_tach.glyph_positions):
    gname = font_bodoni.glyph_to_string(info.codepoint)
    glyph = gset_bodoni[gname]
    glyph.draw(TransformPen(tachy_bounds, (1, 0, 0, 1, x + pos.x_offset, pos.y_offset)))
    x += pos.x_advance + letter_spacing_tachy

y1_x = x
glyph_y.draw(TransformPen(tachy_bounds, (1, 0, 0, 1, y1_x + pos_y.x_offset, pos_y.y_offset)))

y2_x = y1_x + pos_y.x_advance + letter_spacing_tachy - shift_y
glyph_y.draw(TransformPen(tachy_bounds, (1, 0, 0, 1, y2_x + pos_y.x_offset, pos_y.y_offset)))

y3_x = y2_x + pos_y.x_advance + letter_spacing_tachy - shift_y
glyph_y.draw(TransformPen(tachy_bounds, (1, 0, 0, 1, y3_x + pos_y.x_offset, pos_y.y_offset)))

tx_min, ty_min, tx_max, ty_max = tachy_bounds.bounds
t_pad = 40
t_width = int(tx_max - tx_min + 2 * t_pad)
t_height = int(ty_max - ty_min + 2 * t_pad)

# Generate path for "tach"
tach_pen = SVGPathPen(gset_bodoni)
x = 0
for info, pos in zip(buf_tach.glyph_infos, buf_tach.glyph_positions):
    gname = font_bodoni.glyph_to_string(info.codepoint)
    glyph = gset_bodoni[gname]
    dx = x + pos.x_offset - tx_min + t_pad
    dy = ty_max + pos.y_offset + t_pad
    glyph.draw(TransformPen(tach_pen, (1, 0, 0, -1, dx, dy)))
    x += pos.x_advance + letter_spacing_tachy
tach_d = tach_pen.getCommands()

# Generate path for each y
def get_y_path(pos_x):
    p = SVGPathPen(gset_ital)
    dx = pos_x + pos_y.x_offset - tx_min + t_pad
    dy = ty_max + pos_y.y_offset + t_pad
    glyph_y.draw(TransformPen(p, (1, 0, 0, -1, dx, dy)))
    return p.getCommands()

y1_d = get_y_path(y1_x)
y2_d = get_y_path(y2_x)
y3_d = get_y_path(y3_x)

tachyyy_light_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {t_width} {t_height}" role="img" aria-label="tachyyy">
  <path d="{tach_d}" fill="#3e2c23" />
  <path d="{y1_d}" fill="rgba(62,44,35,0.22)" />
  <path d="{y2_d}" fill="rgba(62,44,35,0.5)" />
  <path d="{y3_d}" fill="#b87348" />
</svg>'''

tachyyy_dark_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {t_width} {t_height}" role="img" aria-label="tachyyy">
  <path d="{tach_d}" fill="#f9f5ef" />
  <path d="{y1_d}" fill="rgba(249,245,239,0.22)" />
  <path d="{y2_d}" fill="rgba(249,245,239,0.5)" />
  <path d="{y3_d}" fill="#d9976a" />
</svg>'''

with open(os.path.join(OUT_DIR, "tachyyy-wordmark-light.svg"), "w") as f:
    f.write(tachyyy_light_svg)
with open(os.path.join(OUT_DIR, "tachyyy-wordmark-dark.svg"), "w") as f:
    f.write(tachyyy_dark_svg)

print("Saved tachyyy wordmarks. Dimensions:", t_width, t_height)

# --- C. PICCLINE ---
# Sacramento (SIL OFL), teal #2f7a78 (light), Evening #4fb3ae (dark).
sacramento_path = os.path.join(REPO_ROOT, "scripts/fonts/Sacramento-Regular.ttf")
if not os.path.exists(sacramento_path):
    import urllib.request
    os.makedirs(os.path.dirname(sacramento_path), exist_ok=True)
    url = "https://raw.githubusercontent.com/google/fonts/main/ofl/sacramento/Sacramento-Regular.ttf"
    urllib.request.urlretrieve(url, sacramento_path)

with open(sacramento_path, "rb") as f:
    sacramento_data = f.read()

tt_sacramento = TTFont(sacramento_path)
gset_sacramento = tt_sacramento.getGlyphSet()

face_sacramento = hb.Face(sacramento_data)
font_sacramento = hb.Font(face_sacramento)

buf_picc = hb.Buffer()
buf_picc.add_str("piccline")
buf_picc.guess_segment_properties()
hb.shape(font_sacramento, buf_picc)

picc_bounds = BoundsPen(None)
x = 0
for info, pos in zip(buf_picc.glyph_infos, buf_picc.glyph_positions):
    gname = tt_sacramento.getGlyphName(info.codepoint)
    glyph = gset_sacramento[gname]
    glyph.draw(TransformPen(picc_bounds, (1, 0, 0, 1, x + pos.x_offset, pos.y_offset)))
    x += pos.x_advance

px_min, py_min, px_max, py_max = picc_bounds.bounds
p_pad = 40
p_width = int(px_max - px_min + 2 * p_pad)
p_height = int(py_max - py_min + 2 * p_pad)

picc_pen = SVGPathPen(gset_sacramento)
x = 0
for info, pos in zip(buf_picc.glyph_infos, buf_picc.glyph_positions):
    gname = tt_sacramento.getGlyphName(info.codepoint)
    glyph = gset_sacramento[gname]
    dx = x + pos.x_offset - px_min + p_pad
    dy = py_max + pos.y_offset + p_pad
    glyph.draw(TransformPen(picc_pen, (1, 0, 0, -1, dx, dy)))
    x += pos.x_advance
piccline_d = picc_pen.getCommands()

piccline_light_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {p_width} {p_height}" role="img" aria-label="piccline">
  <path d="{piccline_d}" fill="#2f7a78" />
</svg>'''

piccline_dark_svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {p_width} {p_height}" role="img" aria-label="piccline">
  <path d="{piccline_d}" fill="#4fb3ae" />
</svg>'''

with open(os.path.join(OUT_DIR, "piccline-wordmark-light.svg"), "w") as f:
    f.write(piccline_light_svg)
with open(os.path.join(OUT_DIR, "piccline-wordmark-dark.svg"), "w") as f:
    f.write(piccline_dark_svg)

print("Saved piccline wordmarks. Dimensions:", p_width, p_height)

# ==========================================
# 2. GENERATE GAME ICONS
# ==========================================
# All tiles: rounded square, corner radius 23% of the width (rx=23 in 100x100 viewBox).
# Dark espresso tile: 1px ring rgba(249,245,239,0.16).

# --- VIALO ICON ---
# 5x3 grid, rect x="{9+17c}" y="{22+22r}" width="14" height="12" rx="6"
# Lit cells (row, col): (0,0), (0,4), (1,1), (1,3), (2,2)
# Dark tile #3e2c23: lit #d9976a, unlit #5a463a
# Light tile #f9f5ef: lit #b87348, unlit #eadccf
lit_cells = {(0,0), (0,4), (1,1), (1,3), (2,2)}

def build_vialo_cells(lit_color, unlit_color):
    rects = []
    for r in range(3):
        for c in range(5):
            x = 9 + 17 * c
            y = 22 + 22 * r
            color = lit_color if (r, c) in lit_cells else unlit_color
            rects.append(f'  <rect x="{x}" y="{y}" width="14" height="12" rx="6" fill="{color}" />')
    return "\n".join(rects)

vialo_icon_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="vialo">
  <rect width="100" height="100" rx="23" fill="#f9f5ef" />
{build_vialo_cells("#b87348", "#eadccf")}
</svg>'''

vialo_icon_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="vialo">
  <rect width="100" height="100" rx="23" fill="#3e2c23" stroke="rgba(249,245,239,0.16)" stroke-width="1" />
{build_vialo_cells("#d9976a", "#5a463a")}
</svg>'''

with open(os.path.join(OUT_DIR, "vialo-light.svg"), "w") as f:
    f.write(vialo_icon_light)
with open(os.path.join(OUT_DIR, "vialo-dark.svg"), "w") as f:
    f.write(vialo_icon_dark)

# --- TACHYYY ICON ---
# Heart path M50 90 C20 68 8 50 8 34 C8 20 19 10 31 10 C39 10 46 14 50 22 C54 14 61 10 69 10 C81 10 92 20 92 34 C92 50 80 68 50 90 Z
# scaled 0.62, three copies at translate(6,19), (19,19), (32,19).
heart_d = "M50 90 C20 68 8 50 8 34 C8 20 19 10 31 10 C39 10 46 14 50 22 C54 14 61 10 69 10 C81 10 92 20 92 34 C92 50 80 68 50 90 Z"

tachyyy_icon_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="tachyyy">
  <rect width="100" height="100" rx="23" fill="#f9f5ef" />
  <path d="{heart_d}" transform="translate(6 19) scale(0.62)" fill="#3e2c23" fill-opacity="0.22" />
  <path d="{heart_d}" transform="translate(19 19) scale(0.62)" fill="#3e2c23" fill-opacity="0.5" />
  <path d="{heart_d}" transform="translate(32 19) scale(0.62)" fill="#b87348" />
</svg>'''

tachyyy_icon_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="tachyyy">
  <rect width="100" height="100" rx="23" fill="#3e2c23" stroke="rgba(249,245,239,0.16)" stroke-width="1" />
  <path d="{heart_d}" transform="translate(6 19) scale(0.62)" fill="#f9f5ef" fill-opacity="0.22" />
  <path d="{heart_d}" transform="translate(19 19) scale(0.62)" fill="#f9f5ef" fill-opacity="0.5" />
  <path d="{heart_d}" transform="translate(32 19) scale(0.62)" fill="#d9976a" />
</svg>'''

with open(os.path.join(OUT_DIR, "tachyyy-light.svg"), "w") as f:
    f.write(tachyyy_icon_light)
with open(os.path.join(OUT_DIR, "tachyyy-dark.svg"), "w") as f:
    f.write(tachyyy_icon_dark)

# --- PICCLINE ICON ---
# path M14 70 C34 70 52 62 58 44 C62 30 56 16 46 18 C34 20 34 44 44 58 C52 68 68 70 86 70, shifted down 3, stroke 6, round caps/joins.
# Teal tile #2f7a78: copper #b87348 line, ivory start dot r 7.5, copper end dot r 9.5.
# Light tile #f9f5ef: teal line and start dot, copper end dot.
piccline_path = "M14 70 C34 70 52 62 58 44 C62 30 56 16 46 18 C34 20 34 44 44 58 C52 68 68 70 86 70"

piccline_icon_light = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="piccline">
  <rect width="100" height="100" rx="23" fill="#f9f5ef" />
  <g transform="translate(0 3)">
    <path d="{piccline_path}" fill="none" stroke="#2f7a78" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="14" cy="70" r="7.5" fill="#2f7a78" />
    <circle cx="86" cy="70" r="9.5" fill="#b87348" />
  </g>
</svg>'''

piccline_icon_dark = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" role="img" aria-label="piccline">
  <rect width="100" height="100" rx="23" fill="#2f7a78" />
  <g transform="translate(0 3)">
    <path d="{piccline_path}" fill="none" stroke="#b87348" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" />
    <circle cx="14" cy="70" r="7.5" fill="#f9f5ef" />
    <circle cx="86" cy="70" r="9.5" fill="#b87348" />
  </g>
</svg>'''

with open(os.path.join(OUT_DIR, "piccline-light.svg"), "w") as f:
    f.write(piccline_icon_light)
with open(os.path.join(OUT_DIR, "piccline-dark.svg"), "w") as f:
    f.write(piccline_icon_dark)

print("Saved all game icons.")
