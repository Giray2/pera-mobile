"""PERA logo uretici - 1024x1024 icon + splash + favicon."""
from PIL import Image, ImageDraw, ImageFont
import math

NAVY = (10, 22, 40, 255)          # #0A1628
NAVY_DARK = (5, 12, 24, 255)
ACCENT = (56, 189, 248, 255)      # açık mavi (tech vurgu)
ACCENT_DIM = (56, 189, 248, 90)
WHITE = (240, 248, 255, 255)

FONT_BOLD = "/System/Library/Fonts/HelveticaNeue.ttc"
FONT_SFNS = "/System/Library/Fonts/SFNS.ttf"


def radial_gradient(size, inner, outer):
    img = Image.new("RGBA", (size, size))
    px = img.load()
    cx, cy = size / 2, size / 2
    max_d = math.hypot(cx, cy)
    for y in range(size):
        for x in range(size):
            d = math.hypot(x - cx, y - cy) / max_d
            d = min(d, 1.0)
            r = int(inner[0] + (outer[0] - inner[0]) * d)
            g = int(inner[1] + (outer[1] - inner[1]) * d)
            b = int(inner[2] + (outer[2] - inner[2]) * d)
            px[x, y] = (r, g, b, 255)
    return img


def draw_circuit_lines(draw, cx, cy, r, color):
    # P harfinin sag ustunden cikan devre cizgileri
    pts = [
        [(cx + r * 0.55, cy - r * 0.35), (cx + r * 0.95, cy - r * 0.35), (cx + r * 0.95, cy - r * 0.65)],
        [(cx + r * 0.55, cy - r * 0.05), (cx + r * 1.05, cy - r * 0.05)],
        [(cx + r * 0.5, cy + r * 0.25), (cx + r * 0.9, cy + r * 0.25), (cx + r * 0.9, cy + r * 0.55)],
    ]
    for path in pts:
        draw.line(path, fill=color, width=6, joint="curve")
        for (px, py) in [path[0], path[-1]]:
            draw.ellipse([px - 8, py - 8, px + 8, py + 8], fill=color)


def make_icon(size=1024, with_circuit=True):
    img = radial_gradient(size, (16, 34, 58, 255), NAVY_DARK)
    draw = ImageDraw.Draw(img, "RGBA")

    cx, cy = size / 2, size * 0.44
    r = size * 0.34

    # Yumusak parlaklik halkasi (glow)
    glow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    gdraw = ImageDraw.Draw(glow)
    gdraw.ellipse([cx - r * 1.15, cy - r * 1.15, cx + r * 1.15, cy + r * 1.15], fill=(56, 189, 248, 40))
    glow = glow.filter(__import__("PIL.ImageFilter", fromlist=["ImageFilter"]).GaussianBlur(size * 0.03))
    img = Image.alpha_composite(img, glow)
    draw = ImageDraw.Draw(img, "RGBA")

    # Buyuk "P" harfi
    p_font = ImageFont.truetype(FONT_BOLD, int(size * 0.46))
    bbox = draw.textbbox((0, 0), "P", font=p_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px = cx - tw / 2 - bbox[0]
    py = cy - th / 2 - bbox[1] - size * 0.03

    # gradient dolgu efekti icin iki katman (beyaz + accent kenar)
    draw.text((px + 4, py + 4), "P", font=p_font, fill=(0, 0, 0, 60))
    draw.text((px, py), "P", font=p_font, fill=WHITE)
    draw.text((px, py), "P", font=p_font, fill=None, stroke_width=3, stroke_fill=ACCENT)

    if with_circuit:
        draw_circuit_lines(draw, cx, cy, r, ACCENT)

    # Alt "ERA" yazisi
    era_font = ImageFont.truetype(FONT_BOLD, int(size * 0.135))
    era_text = "ERA"
    ebbox = draw.textbbox((0, 0), era_text, font=era_font)
    etw = ebbox[2] - ebbox[0]
    ex = cx - etw / 2 - ebbox[0]
    ey = cy + r * 0.62
    # harf araligi icin manuel cizim
    spacing = int(size * 0.018)
    total_w = etw + spacing * (len(era_text) - 1)
    cx_letter = cx - total_w / 2
    for ch in era_text:
        cb = draw.textbbox((0, 0), ch, font=era_font)
        cw = cb[2] - cb[0]
        draw.text((cx_letter - cb[0], ey - cb[1]), ch, font=era_font, fill=ACCENT)
        cx_letter += cw + spacing

    return img


def make_adaptive_icon(size=1024):
    # Android adaptive icon foreground: seffaf arka plan, guvenli alan icinde kucuk logo
    # (backgroundColor app.json'da #020B14 olarak ayrica ayarlanir)
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img, "RGBA")
    cx, cy = size / 2, size * 0.46
    r = size * 0.24

    p_font = ImageFont.truetype(FONT_BOLD, int(size * 0.32))
    bbox = draw.textbbox((0, 0), "P", font=p_font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    px = cx - tw / 2 - bbox[0]
    py = cy - th / 2 - bbox[1]
    draw.text((px, py), "P", font=p_font, fill=WHITE, stroke_width=2, stroke_fill=ACCENT)

    era_font = ImageFont.truetype(FONT_BOLD, int(size * 0.095))
    era_text = "ERA"
    ebbox = draw.textbbox((0, 0), era_text, font=era_font)
    spacing = int(size * 0.014)
    total_w = (ebbox[2] - ebbox[0]) + spacing * 2
    cx_letter = cx - total_w / 2
    ey = cy + r * 0.95
    for ch in era_text:
        cb = draw.textbbox((0, 0), ch, font=era_font)
        cw = cb[2] - cb[0]
        draw.text((cx_letter - cb[0], ey - cb[1]), ch, font=era_font, fill=ACCENT)
        cx_letter += cw + spacing

    return img


def main():
    out = "/Users/it-mc/PERA-Mobile/assets/images"

    icon = make_icon(1024, with_circuit=True)
    icon.convert("RGB").save(f"{out}/icon.png")
    icon.convert("RGB").save(f"{out}/splash-icon.png")

    adaptive = make_adaptive_icon(1024)
    adaptive.save(f"{out}/adaptive-icon.png")  # RGBA - seffaf arka plan korunur

    favicon = icon.resize((196, 196), Image.LANCZOS)
    favicon.convert("RGB").save(f"{out}/favicon.png")

    print("Logo dosyalari olusturuldu:", out)


if __name__ == "__main__":
    main()
