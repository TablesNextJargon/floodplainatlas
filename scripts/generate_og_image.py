"""Generate the Floodplain Atlas social-preview image."""
from math import sin, pi
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1200, 630
image = Image.new("RGB", (WIDTH, HEIGHT), "#102b3a")
draw = ImageDraw.Draw(image)
bold = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 78)
regular = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 43)
small = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 23)

draw.text((112, 104), "Floodplain Atlas", font=bold, fill="#f6fbfc")
draw.line([(52, 230), (88, 214), (130, 230), (172, 214), (212, 230), (254, 214)], fill="#f6fbfc", width=8, joint="curve")
draw.text((112, 258), "Separate flood maps for Great Britain", font=regular, fill="#b8cbd3")
draw.text((112, 316), "and the Republic of Ireland", font=regular, fill="#b8cbd3")

for base_y, amplitude, phase in ((465, 18, 0), (525, 18, 0.65)):
    points = []
    for x in range(58, 945, 4):
        y = base_y + sin((x / 175) * 2 * pi + phase) * amplitude
        points.append((x, y))
    draw.line(points, fill="#5bc9bb", width=10, joint="curve")

draw.text((112, 574), "floodplainatlas.com", font=small, fill="#5d7986")
image.save(ROOT / "public" / "og-image.png", optimize=True)
