"""Generate the Alongside AI Open Graph / social share image at 1200x630.
Run from repo root: python scripts/build-og-image.py
Writes to assets/og-image.png.
This is a build tool, not a runtime dependency. Run once when the image needs to change.
"""
import io
import os
import urllib.request
from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
ASSETS = os.path.join(REPO_ROOT, "assets")
CACHE = os.path.join(REPO_ROOT, "scripts", ".font-cache")
os.makedirs(CACHE, exist_ok=True)

FONT_URLS = {
    "serif": "https://cdn.jsdelivr.net/fontsource/fonts/dm-serif-display@latest/latin-400-normal.ttf",
    "serif-italic": "https://cdn.jsdelivr.net/fontsource/fonts/dm-serif-display@latest/latin-400-italic.ttf",
    "sans": "https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-400-normal.ttf",
    "sans-bold": "https://cdn.jsdelivr.net/fontsource/fonts/nunito@latest/latin-700-normal.ttf",
}

def font_path(name):
    p = os.path.join(CACHE, name + ".ttf")
    if not os.path.exists(p):
        print(f"  fetching {name}...")
        with urllib.request.urlopen(FONT_URLS[name]) as r:
            open(p, "wb").write(r.read())
    return p

CREAM = (250, 246, 241)
CHARCOAL = (44, 51, 48)
CHARCOAL_SOFT = (74, 85, 80)
SAGE = (123, 158, 135)
SAGE_PALE = (232, 240, 235)
GOLD = (212, 168, 83)
GRAY = (138, 135, 128)

W, H = 1200, 630

def draw_logo_mark(canvas, x, y, size=64):
    # Matches assets/logo-mark.svg — viewBox 120x140.
    # So a square-ish mark with vertical lines.
    w = size
    h = int(size * 140 / 120)
    overlay = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(overlay)
    # Rounded rect background
    radius = int(w * 18 / 120)
    d.rounded_rectangle([0, 0, w - 1, h - 1], radius=radius, fill=SAGE)
    # First vertical line (cream) + dot
    sx1 = w * 42 / 120
    sy_top1 = h * 34 / 140
    sy_bot1 = h * 112 / 140
    stroke_w = max(3, int(w * 7 / 120))
    d.line([(sx1, sy_top1), (sx1, sy_bot1)], fill=CREAM, width=stroke_w)
    r1 = w * 11 / 120
    d.ellipse([sx1 - r1, h * 38 / 140 - r1, sx1 + r1, h * 38 / 140 + r1], fill=CREAM)
    # Second line (gold) + dot
    sx2 = w * 78 / 120
    sy_top2 = h * 52 / 140
    sy_bot2 = h * 112 / 140
    d.line([(sx2, sy_top2), (sx2, sy_bot2)], fill=GOLD, width=stroke_w)
    r2 = w * 11 / 120
    d.ellipse([sx2 - r2, h * 56 / 140 - r2, sx2 + r2, h * 56 / 140 + r2], fill=GOLD)
    canvas.paste(overlay, (x, y), overlay)
    return w, h

def text_size(draw, text, font):
    bbox = draw.textbbox((0, 0), text, font=font)
    return bbox[2] - bbox[0], bbox[3] - bbox[1], bbox[1]  # w, h, y_offset

def main():
    img = Image.new("RGB", (W, H), CREAM)
    draw = ImageDraw.Draw(img)

    # Subtle sage bar on the left edge as a brand anchor
    draw.rectangle([0, 0, 10, H], fill=SAGE)

    # Top-left logo lockup
    mark_x, mark_y = 76, 72
    mark_w, mark_h = draw_logo_mark(img, mark_x, mark_y, size=64)

    wordmark_serif = ImageFont.truetype(font_path("serif"), 48)
    wordmark_ai = ImageFont.truetype(font_path("sans-bold"), 24)
    word_x = mark_x + mark_w + 20
    # Place serif wordmark using the font's ascent to nail baseline math.
    serif_ascent, serif_descent = wordmark_serif.getmetrics()
    wordmark_top = mark_y + (mark_h - (serif_ascent + serif_descent)) // 2 + 2
    draw.text((word_x, wordmark_top), "alongside", font=wordmark_serif, fill=CHARCOAL)
    serif_bbox = draw.textbbox((word_x, wordmark_top), "alongside", font=wordmark_serif)
    serif_right = serif_bbox[2]
    serif_baseline = wordmark_top + serif_ascent
    # AI lockup — no space between letters, uppercase, sage, baseline-aligned with "alongside"
    ai_ascent, ai_descent = wordmark_ai.getmetrics()
    ai_top = serif_baseline - ai_ascent
    draw.text((serif_right + 16, ai_top), "AI", font=wordmark_ai, fill=SAGE)

    # Eyebrow
    eyebrow_font = ImageFont.truetype(font_path("sans-bold"), 18)
    eyebrow_text = "A   C U S T O M   A I   P L A N"
    draw.text((80, 230), eyebrow_text, font=eyebrow_font, fill=SAGE)

    # Headline — break across 3 lines
    head_font = ImageFont.truetype(font_path("serif"), 64)
    head_italic = ImageFont.truetype(font_path("serif-italic"), 64)
    line1 = "You don't need to learn AI."
    line2a = "You just need "
    line2b = "someone"
    line3 = "to set it up for you."

    y = 272
    x = 80
    draw.text((x, y), line1, font=head_font, fill=CHARCOAL)
    w1, h1, off1 = text_size(draw, line1, head_font)

    y += 78
    draw.text((x, y), line2a, font=head_font, fill=CHARCOAL)
    w2a, h2a, _ = text_size(draw, line2a, head_font)
    draw.text((x + w2a, y), line2b, font=head_italic, fill=SAGE)

    y += 78
    draw.text((x, y), line3, font=head_font, fill=CHARCOAL)

    # Bottom row — URL on left, tagline on right
    url_font = ImageFont.truetype(font_path("sans-bold"), 22)
    tag_font = ImageFont.truetype(font_path("serif-italic"), 26)

    bottom_y = H - 68
    draw.text((80, bottom_y), "alongsideai.ai", font=url_font, fill=CHARCOAL)

    tag_text = '"Technology, on your terms."'
    tw2, th2, toff2 = text_size(draw, tag_text, tag_font)
    draw.text((W - 80 - tw2, bottom_y - 4), tag_text, font=tag_font, fill=CHARCOAL_SOFT)

    # Thin divider line above the bottom row
    draw.line([(80, H - 96), (W - 80, H - 96)], fill=(44, 51, 48, 40), width=1)

    out = os.path.join(ASSETS, "og-image.png")
    img.save(out, "PNG", optimize=True)
    # Also save a JPG — slightly smaller file, some platforms prefer
    img_rgb = img.convert("RGB")
    img_rgb.save(os.path.join(ASSETS, "og-image.jpg"), "JPEG", quality=90, optimize=True)
    print(f"wrote {out} ({os.path.getsize(out)} bytes)")

if __name__ == "__main__":
    main()
