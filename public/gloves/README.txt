Glove photos for the glove-note pop-ups (D-94).

glove-*.webp (the five-colour set from 1 Nov 2026)
  Source: an image Christian made with an AI image tool, 2026-11-01. Owned by Cueory; not from a stock site.
  Processed by the lead: background removed (rembg u2net), no metadata, WebP quality 88, native size (about 300 x 432 px).
  Palm boxes (percent of each image; the text area, kept level): x 21, y 47, width 56, height 29 (cream: x 23).
  Font for the writing: Kalam (SIL OFL 1.1, public/fonts/kalam-OFL.txt), self-hosted.

messages/msg-NNN.webp (the message gloves, 24 Nov 2026)
  Source: Christian's own artwork, "gloves/upscayl_png_ultrasharp-4x_2x" (201 PNGs, 2400 x 1792, a glove with a short
  handwritten message and "break idea" on the palm, on a white or grey background). Cueory owns it and Christian
  approved it as public content. The pictures are never redrawn, recoloured or retyped.
  Made by scripts/process-glove-messages.py (run it again with the source folder as its argument; the originals are not
  in this repository). It drops duplicates (46 = 47 and 110 = image.png were byte-identical), removes the
  background with rembg (u2net, alpha matting for a soft edge), crops to the glove with a small margin, resizes to
  720 px wide and exports WebP with transparency and no metadata, lowering quality until each file is about 70 KB or less.
  The handwritten words are in content/gloves/messages.json (id, file, text, ornament, colour, width, height). The
  text is each picture's alt text, so it is checked at build time (src/content.config.ts) and in
  tests/unit/glove-messages.test.ts. Each number msg-001 ... is stable: do not renumber, add new ones at the end.
  The note shows one picture at a time (src/components/GloveNote.astro), up to 22 rem wide, so 720 px is about 2x.
