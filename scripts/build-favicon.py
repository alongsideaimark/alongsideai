"""Generate favicon + apple-touch-icon from the Alongside AI logo mark.
Run from repo root: python scripts/build-favicon.py
Writes: favicon.ico, assets/favicon-32.png, assets/favicon-16.png, assets/apple-touch-icon.png
"""
import os
from PIL import Image, ImageDraw

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSETS = os.path.join(REPO_ROOT, "assets")

CREAM = (250, 246, 241)
SAGE = (123, 158, 135)
GOLD = (212, 168, 83)

def draw_mark(size, bg=None):
    """Render the logo mark at (size x size) using the proportions from logo-mark.svg."""
    # viewBox is 120x140 in the SVG; for a square favicon we compress to square, matching the SVG's rounded-rect aesthetic.
    # Use an oversized canvas then downsample for anti-aliasing.
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.16)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=SAGE)

    # Two vertical lines with dots. Proportions roughly match the SVG even though the aspect is square.
    stroke = max(2, int(s * 0.085))
    # Line 1 (cream)
    x1 = int(s * 0.35)
    dot1_y = int(s * 0.30)
    dot1_r = int(s * 0.105)
    y1_bot = int(s * 0.86)
    d.line([(x1, dot1_y + 4), (x1, y1_bot)], fill=CREAM, width=stroke)
    d.ellipse([x1 - dot1_r, dot1_y - dot1_r, x1 + dot1_r, dot1_y + dot1_r], fill=CREAM)
    # Line 2 (gold)
    x2 = int(s * 0.65)
    dot2_y = int(s * 0.42)
    dot2_r = int(s * 0.105)
    y2_bot = int(s * 0.86)
    d.line([(x2, dot2_y + 4), (x2, y2_bot)], fill=GOLD, width=stroke)
    d.ellipse([x2 - dot2_r, dot2_y - dot2_r, x2 + dot2_r, dot2_y + dot2_r], fill=GOLD)

    return img.resize((size, size), Image.LANCZOS)

def main():
    # favicon.ico — multi-resolution for best rendering in browser tabs + bookmarks
    sizes = [16, 32, 48]
    images = [draw_mark(s) for s in sizes]
    ico_path = os.path.join(REPO_ROOT, "favicon.ico")
    images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"wrote {ico_path}")

    # Standalone PNGs
    for s in [16, 32]:
        p = os.path.join(ASSETS, f"favicon-{s}.png")
        draw_mark(s).save(p, "PNG", optimize=True)
        print(f"wrote {p}")

    # Apple touch icon — 180x180, with cream background (iOS applies rounded corners itself)
    apple = draw_mark(180, bg=CREAM)
    ap = os.path.join(ASSETS, "apple-touch-icon.png")
    apple.save(ap, "PNG", optimize=True)
    print(f"wrote {ap}")

if __name__ == "__main__":
    main()
