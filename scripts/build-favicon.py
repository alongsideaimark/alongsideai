"""Generate favicon + apple-touch-icon from the Lantern Plan logo mark.
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
    """Render the lantern mark at (size x size) using proportions from logo-mark.svg.

    The SVG is 120x140; for a square favicon we compress to square, centering
    the lantern. Detail is intentionally minimal at small sizes — sage square +
    visible gold light is what reads at 16px.
    """
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), bg or (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = int(s * 0.16)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=SAGE)

    cx = s / 2
    stroke = max(2, int(s * 0.045))

    body_x1 = int(s * 0.28); body_x2 = int(s * 0.72)
    body_y1 = int(s * 0.34); body_y2 = int(s * 0.78)
    d.rounded_rectangle([body_x1, body_y1, body_x2, body_y2],
                        radius=int(s * 0.03), outline=CREAM, width=stroke)

    glow_r = int(s * 0.10); glow_cy = int(s * 0.52)
    d.ellipse([cx - glow_r, glow_cy - glow_r, cx + glow_r, glow_cy + glow_r], fill=GOLD)

    cap_x1 = int(s * 0.33); cap_x2 = int(s * 0.67)
    cap_y1 = int(s * 0.25); cap_y2 = int(s * 0.30)
    d.rounded_rectangle([cap_x1, cap_y1, cap_x2, cap_y2], radius=int(s * 0.014), fill=CREAM)

    base_x1 = int(s * 0.33); base_x2 = int(s * 0.67)
    base_y1 = int(s * 0.79); base_y2 = int(s * 0.84)
    d.rounded_rectangle([base_x1, base_y1, base_x2, base_y2], radius=int(s * 0.014), fill=CREAM)

    handle_x1 = int(s * 0.40); handle_x2 = int(s * 0.60)
    handle_y1 = int(s * 0.13); handle_y2 = int(s * 0.27)
    d.arc([handle_x1, handle_y1, handle_x2, handle_y2], start=180, end=360, fill=CREAM, width=stroke)

    return img.resize((size, size), Image.LANCZOS)

def main():
    sizes = [16, 32, 48]
    images = [draw_mark(s) for s in sizes]
    ico_path = os.path.join(REPO_ROOT, "favicon.ico")
    images[0].save(ico_path, format="ICO", sizes=[(s, s) for s in sizes])
    print(f"wrote {ico_path}")

    for s in [16, 32]:
        p = os.path.join(ASSETS, f"favicon-{s}.png")
        draw_mark(s).save(p, "PNG", optimize=True)
        print(f"wrote {p}")

    apple = draw_mark(180, bg=CREAM)
    ap = os.path.join(ASSETS, "apple-touch-icon.png")
    apple.save(ap, "PNG", optimize=True)
    print(f"wrote {ap}")

if __name__ == "__main__":
    main()
