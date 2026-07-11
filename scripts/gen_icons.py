#!/usr/bin/env python3
"""Generate PWA icons for Shaxsiy O'yin.
Brand: navy bg (#0a0e1a), gold accent (#f5c800). Motif: buzzer button.
Rendered at 4x supersample then downscaled for crisp anti-aliasing.
"""
import os
from PIL import Image, ImageDraw, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT, exist_ok=True)

NAVY      = (10, 14, 26)      # #0a0e1a
NAVY_CARD = (17, 24, 39)      # #111827
GOLD      = (245, 200, 0)     # #f5c800
GOLD_DIM  = (201, 162, 0)     # #c9a200
GOLD_DEEP = (150, 120, 0)
WHITE     = (240, 244, 255)

SS = 4  # supersample factor


def rounded_tile(size, bg, radius_frac=0.22):
    """Full-bleed rounded square background."""
    s = size * SS
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    r = int(s * radius_frac)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=r, fill=bg)
    return img


def draw_buzzer(img, center_frac=0.5, btn_frac=0.30, ring_frac=0.40):
    """Draw a gold buzzer button: outer ring + domed button + highlight."""
    s = img.size[0]
    d = ImageDraw.Draw(img)
    cx = cy = int(s * center_frac)

    # Outer thin ring (gold, dim)
    ro = int(s * ring_frac)
    d.ellipse([cx - ro, cy - ro, cx + ro, cy + ro], outline=GOLD_DIM, width=max(2, int(s * 0.012)))

    # Base plate shadow (slightly larger dark disc under button)
    rb = int(s * (btn_frac + 0.045))
    d.ellipse([cx - rb, cy - rb, cx + rb, cy + rb], fill=GOLD_DEEP)

    # Button body — vertical gold gradient (lighter top -> deeper bottom)
    rr = int(s * btn_frac)
    top = (255, 224, 71)
    bot = GOLD_DIM
    grad = Image.new("RGB", (1, rr * 2), NAVY)
    gp = grad.load()
    for y in range(rr * 2):
        t = y / (rr * 2 - 1)
        gp[0, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3))
    grad = grad.resize((rr * 2, rr * 2))
    mask = Image.new("L", (rr * 2, rr * 2), 0)
    ImageDraw.Draw(mask).ellipse([0, 0, rr * 2 - 1, rr * 2 - 1], fill=255)
    img.paste(grad, (cx - rr, cy - rr), mask)

    # Glossy highlight (upper-left ellipse, translucent white) — clipped to button
    gloss = Image.new("RGBA", img.size, (0, 0, 0, 0))
    gd = ImageDraw.Draw(gloss)
    hx, hy = cx - int(rr * 0.26), cy - int(rr * 0.36)
    gw, gh = int(rr * 0.82), int(rr * 0.48)
    gd.ellipse([hx - gw, hy - gh, hx + gw, hy + gh], fill=(255, 255, 255, 105))
    btn_mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(btn_mask).ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=255)
    img.paste(gloss, (0, 0), Image.composite(gloss.split()[3], Image.new("L", img.size, 0), btn_mask))


def make_icon(size, maskable=False, bg=NAVY):
    """maskable => keep art inside center 80% safe zone (smaller buzzer, full bg)."""
    tile = rounded_tile(size, bg, radius_frac=0.0 if maskable else 0.22)
    # For maskable, background is a full square (no rounding) so OS mask can clip.
    if maskable:
        s = size * SS
        tile = Image.new("RGBA", (s, s), bg + (255,))
        draw_buzzer(tile, btn_frac=0.24, ring_frac=0.32)
    else:
        draw_buzzer(tile, btn_frac=0.30, ring_frac=0.40)
    return tile.resize((size, size), Image.LANCZOS)


def make_apple(size=180):
    """iOS apple-touch-icon: opaque, square (iOS rounds corners itself)."""
    s = size * SS
    tile = Image.new("RGBA", (s, s), NAVY + (255,))
    draw_buzzer(tile, btn_frac=0.29, ring_frac=0.39)
    return tile.resize((size, size), Image.LANCZOS).convert("RGB")


def make_favicon(size):
    tile = rounded_tile(size, NAVY, radius_frac=0.22)
    draw_buzzer(tile, btn_frac=0.34, ring_frac=0.44)
    return tile.resize((size, size), Image.LANCZOS)


# Standard "any" icons
make_icon(192).save(os.path.join(OUT, "icon-192.png"))
make_icon(512).save(os.path.join(OUT, "icon-512.png"))
# Maskable
make_icon(192, maskable=True).save(os.path.join(OUT, "icon-192-maskable.png"))
make_icon(512, maskable=True).save(os.path.join(OUT, "icon-512-maskable.png"))
# Apple touch icon
make_apple(180).save(os.path.join(OUT, "apple-touch-icon.png"))
# Favicons
make_favicon(32).save(os.path.join(OUT, "favicon-32.png"))
make_favicon(180).save(os.path.join(OUT, "icon-180.png"))

print("Generated:")
for f in sorted(os.listdir(OUT)):
    p = os.path.join(OUT, f)
    print(f"  {f}  ({os.path.getsize(p)} bytes)")
