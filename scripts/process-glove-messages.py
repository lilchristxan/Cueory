#!/usr/bin/env python3
"""
Turns Christian's message-glove photos into the transparent WebP files the glove notes show (D-94, message gloves).

Usage:  python3 -I scripts/process-glove-messages.py <source-folder> [--out public/gloves/messages] [--max-width 720]

What it does, in order (re-runnable: finished files are skipped, so an interrupted run carries on):
 1. Lists the source PNGs in natural order (1.png, 2.png, ... 100.png, 100.1.png, image.png).
 2. Drops duplicates: byte-identical files, and near duplicates (under 1% of pixels differ at 300x224); work size 840 px.
    The first file in natural order is kept. The dropped names are printed and written to the manifest.
 3. Removes the white background with rembg (u2net model, alpha matting for a soft edge without a white halo).
    Needs: pip install rembg onnxruntime pillow numpy (the model downloads on first use).
 4. Crops to the glove with a small margin, resizes to --max-width wide, exports WebP (alpha, no metadata),
    lowering quality until each file is at most about 70 KB.
 5. Writes <out>/manifest.json: for each kept file its stable name (msg-001.webp ...), the source name, size and
    a guessed glove colour (it is built from the small per-file notes in <out>/.meta, which are not committed).
    content/gloves/messages.json (the transcribed text) is written by hand from this.

The source photos are not committed (they are large and are Christian's originals); only the WebP output is.
"""
import argparse, hashlib, json, os, re, sys
import numpy as np
from PIL import Image

MARGIN = 0.03
TARGET_BYTES = 70_000


def natural_key(name):
    return [int(p) if p.isdigit() else p for p in re.split(r'(\d+)', name)]


def find_duplicates(folder, names):
    """Returns (kept, dropped) where dropped maps a dropped name to the name it repeats."""
    seen_hash, small, kept, dropped = {}, {}, [], {}
    for name in names:
        path = os.path.join(folder, name)
        digest = hashlib.sha256(open(path, 'rb').read()).hexdigest()
        if digest in seen_hash:
            dropped[name] = seen_hash[digest]
            continue
        thumb = np.asarray(Image.open(path).convert('L').resize((300, 224), Image.BILINEAR), dtype=float)
        twin = next((other for other, t in small.items() if (np.abs(t - thumb) > 25).mean() < 0.01), None)
        if twin:
            dropped[name] = twin
            continue
        seen_hash[digest] = name
        small[name] = thumb
        kept.append(name)
    return kept, dropped


COLOURS = [  # (name, hue range in degrees): the four glove colours Christian photographed
    ('pink', 300, 361), ('pink', 0, 40), ('cream', 40, 70), ('sky blue', 190, 222), ('periwinkle', 222, 300),
]


def glove_colour(rgba):
    """A rough colour name from the hue of the light, saturated-enough glove pixels (ink is dark, so it is skipped)."""
    arr = np.asarray(rgba.convert('RGBA').resize((160, 120)), dtype=float)
    mask = (arr[..., 3] > 250) & (arr[..., :3].max(axis=-1) > 120)
    if not mask.any():
        return 'unknown'
    hsv = np.asarray(Image.fromarray(arr[..., :3].astype('uint8')).convert('HSV'), dtype=float)[mask]
    sat = np.median(hsv[:, 1]) / 255
    hue = np.median(hsv[:, 0]) * 360 / 255
    if sat < 0.08 or (sat < 0.22 and 40 <= hue < 70):
        return 'cream'
    for name, low, high in COLOURS:
        if low <= hue < high:
            return name
    return 'unknown'


def cut_out(session, path, max_width):
    from rembg import remove
    image = Image.open(path).convert('RGB')
    work = image.resize((840, round(840 * image.height / image.width)), Image.LANCZOS)
    cut = remove(work, session=session, alpha_matting=True, alpha_matting_foreground_threshold=240,
                 alpha_matting_background_threshold=10, alpha_matting_erode_size=10)
    box = cut.getchannel('A').point(lambda v: 255 if v > 12 else 0).getbbox()
    pad = round(MARGIN * max(box[2] - box[0], box[3] - box[1]))
    box = (max(0, box[0] - pad), max(0, box[1] - pad), min(cut.width, box[2] + pad), min(cut.height, box[3] + pad))
    cut = cut.crop(box)
    if cut.width > max_width:
        cut = cut.resize((max_width, round(cut.height * max_width / cut.width)), Image.LANCZOS)
    return cut


def save_webp(image, path):
    for quality in (82, 76, 70, 64, 58, 52, 46):
        image.save(path, 'WEBP', quality=quality, alpha_quality=quality, method=6, exif=b'', icc_profile=None)
        if os.path.getsize(path) <= TARGET_BYTES:
            break
    return quality


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('source')
    parser.add_argument('--out', default='public/gloves/messages')
    parser.add_argument('--max-width', type=int, default=720)
    parser.add_argument('--reverse', action='store_true',
                        help='work from the last file backwards (a second copy of the script can run from the front)')
    args = parser.parse_args()
    names = sorted((n for n in os.listdir(args.source) if n.lower().endswith('.png')), key=natural_key)
    kept, dropped = find_duplicates(args.source, names)
    print(f'{len(names)} files, {len(kept)} kept, dropped duplicates: {dropped}')
    meta_dir = os.path.join(args.out, '.meta')  # one small note per finished file, so two runs can share the work
    os.makedirs(meta_dir, exist_ok=True)
    jobs = [(index, name) for index, name in enumerate(kept, start=1)]
    if args.reverse:
        jobs.reverse()
    session = None
    for index, name in jobs:
        stable = f'msg-{index:03d}.webp'
        target = os.path.join(args.out, stable)
        meta_path = os.path.join(meta_dir, stable + '.json')
        if os.path.exists(meta_path) and os.path.exists(target):
            continue
        if os.path.exists(target) and not os.path.exists(meta_path):
            if os.path.getmtime(target) > __import__('time').time() - 120:
                continue  # the other copy of the script is probably writing it right now
            cut = Image.open(target)  # adopt a file made by an earlier, interrupted run
            quality = None
        else:
            if session is None:
                from rembg import new_session
                session = new_session('u2net')
            cut = cut_out(session, os.path.join(args.source, name), args.max_width)
            quality = save_webp(cut, target)
        entry = {'file': stable, 'source': name, 'width': cut.width, 'height': cut.height,
                 'colour': glove_colour(cut), 'quality': quality, 'bytes': os.path.getsize(target)}
        json.dump(entry, open(meta_path, 'w'))
        print(stable, name, cut.size, entry['bytes'], flush=True)
    files = []
    for index, name in enumerate(kept, start=1):
        meta_path = os.path.join(meta_dir, f'msg-{index:03d}.webp.json')
        if os.path.exists(meta_path):
            files.append(json.load(open(meta_path)))
    json.dump({'dropped': dropped, 'files': files}, open(os.path.join(args.out, 'manifest.json'), 'w'), indent=1)
    total = sum(e['bytes'] for e in files)
    print(f'{len(files)} of {len(kept)} files in the manifest, {total / 1e6:.1f} MB total')


if __name__ == '__main__':
    sys.exit(main())
