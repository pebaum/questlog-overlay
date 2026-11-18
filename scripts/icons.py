"""Rebuild the checked-in native icons after changing the mark (optional: Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

assets = Path(__file__).resolve().parents[1] / "assets"
size = 1024
ink, ivory = "#201f1b", "#f0e5c9"
mark = [(16, 1), (21, 11), (31, 16), (21, 21), (16, 31), (11, 21), (1, 16), (11, 11)]
hole = [(16, 7), (13, 13), (7, 16), (13, 19), (16, 25), (19, 19), (25, 16), (19, 13)]
core = [(16, 12), (20, 16), (16, 20), (12, 16)]

def points(shape, inset):
    return [(inset + x * (size - 2*inset) / 32, inset + y * (size - 2*inset) / 32) for x, y in shape]

def paint(template=False):
    im = Image.new("RGBA", (size, size))
    draw = ImageDraw.Draw(im)
    if not template:
        draw.rounded_rectangle((24, 24, 1000, 1000), radius=220, fill=ink)
    for shape, color in [(mark, "black" if template else ivory), (hole, (0, 0, 0, 0) if template else ink), (core, "black" if template else ivory)]:
        draw.polygon(points(shape, 20 if template else 125), fill=color)
    return im

app = paint()
app.resize((256, 256), Image.Resampling.LANCZOS).save(assets / "icon.png")
app.save(assets / "icon.ico", sizes=[(i, i) for i in [16, 24, 32, 48, 64, 128, 256]])
app.save(assets / "icon.icns")
for size_px, suffix in [(18, ""), (36, "@2x")]:
    paint(True).resize((size_px, size_px), Image.Resampling.LANCZOS).save(assets / f"trayTemplate{suffix}.png")
