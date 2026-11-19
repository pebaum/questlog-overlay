"""Rebuild Questlog's raster icons with Pillow and an installed SimSun (not redistributed)."""
import os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

assets = Path(__file__).resolve().parents[1] / "assets"
face = ImageFont.truetype(os.environ.get("SIMSUN_FONT", str(Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts" / "simsun.ttc")), 160, index=0)
glyph = Image.new("L", (200, 200))
ImageDraw.Draw(glyph).text((5, 0), "Q", font=face, fill=255)
glyph = glyph.crop(glyph.getbbox())
matrix = ((0, 8, 2, 10), (12, 4, 14, 6), (3, 11, 1, 9), (15, 7, 13, 5))

def paint(size, template=False):
    grid = min(size, 32)
    height = round(grid * .81)
    width = round(height * glyph.width / glyph.height)
    mask = glyph.resize((width, height), Image.Resampling.LANCZOS)
    image = Image.new("RGBA", (grid, grid))
    for y in range(grid):
        for x in range(grid):
            u, v = x - (grid - width) // 2, y - (grid - height) // 2
            level = matrix[y % 4][x % 4]
            ink = 0 <= u < width and 0 <= v < height and mask.getpixel((u, v)) >= 38 + level * 2
            if template:
                color = (0, 0, 0, 255 if ink else 0)
            elif ink:
                color = (209, 205, 194) if level < 4 else (245, 241, 228)
            else:
                gray = 51 if level < 4 else 42 if level < 12 else 38
                color = (gray, gray, gray)
            image.putpixel((x, y), color)
    return image.resize((size, size), Image.Resampling.NEAREST)

sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
app = paint(256)
app.save(assets / "icon.png")
app.save(assets / "icon.ico", sizes=[(i, i) for i in sizes], append_images=[paint(i) for i in sizes[:-1]])
paint(1024).save(assets / "icon.icns")
for px in (16, 20, 24, 32, 40, 48):
    paint(px).save(assets / f"tray-{px}.png")
for px, suffix in [(18, ""), (36, "@2x")]:
    paint(px, True).save(assets / f"trayTemplate{suffix}.png")
