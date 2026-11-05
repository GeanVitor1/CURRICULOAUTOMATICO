"""Raster exports of the geometric mark in public/favicon.svg, with store padding."""
from math import sin, cos, pi
from pathlib import Path
from PIL import Image, ImageDraw

root = Path(__file__).resolve().parents[1] / "browser-extension" / "gupy-session"
scale = 8
for size in (16, 32, 48, 128):
    image = Image.new("RGBA", (size * scale, size * scale))
    draw = ImageDraw.Draw(image)
    margin = size / 8
    unit = (size - margin * 2) / 32 * scale
    offset = margin * scale
    point = lambda x, y: (offset + x * unit, offset + y * unit)
    draw.rounded_rectangle((*point(0, 0), *point(32, 32)), radius=6 * unit, fill="#a5df80")
    draw.ellipse((*point(11, 11), *point(21, 21)), outline="#17201a", width=max(1, round(1.7 * unit)))
    angle = -pi / 4
    orbit = []
    for step in range(257):
        t = step * 2 * pi / 256
        x, y = 12 * cos(t), 5 * sin(t)
        orbit.append(point(16 + x * cos(angle) - y * sin(angle), 16 + x * sin(angle) + y * cos(angle)))
    draw.line(orbit, fill="#17201a", width=max(1, round(1.7 * unit)), joint="curve")
    image.resize((size, size), Image.Resampling.LANCZOS).save(root / f"icon-{size}.png")
