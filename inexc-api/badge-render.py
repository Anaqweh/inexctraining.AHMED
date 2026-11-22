#!/usr/bin/env python3
"""Render an INEXC knowledge badge (إفادة اطّلاع واجتياز) as a one-page PDF.
Usage: badge-render.py OUTPUT.pdf  < JSON {name,title,code,date}
Standalone: reads stdin, writes one file, touches nothing else."""
import glob, json, os, sys
from PIL import Image, ImageDraw, ImageFont, features

def find_font(patterns):
    for pattern in patterns:
        hits = sorted(glob.glob(pattern, recursive=True))
        if hits:
            return hits[0]
    return None

BOLD = find_font(["/usr/share/fonts/**/NotoSansArabic-Bold.ttf", "/usr/share/fonts/**/NotoKufiArabic-Bold.ttf",
                  "/usr/share/fonts/truetype/hosny-amiri/Amiri-Bold.ttf", "/usr/share/fonts/**/Amiri-Bold.ttf",
                  "/usr/share/fonts/**/NotoNaskhArabic-Bold.ttf", "/usr/share/fonts/**/KacstOne.ttf", "/usr/share/fonts/**/DejaVuSans-Bold.ttf"])
REGULAR = find_font(["/usr/share/fonts/**/NotoSansArabic-Regular.ttf", "/usr/share/fonts/**/NotoKufiArabic-Regular.ttf",
                     "/usr/share/fonts/truetype/hosny-amiri/Amiri-Regular.ttf", "/usr/share/fonts/**/Amiri-Regular.ttf",
                     "/usr/share/fonts/**/NotoNaskhArabic-Regular.ttf", "/usr/share/fonts/**/DejaVuSans.ttf"]) or BOLD
LATIN = find_font(["/usr/share/fonts/**/DejaVuSans-Bold.ttf", "/usr/share/fonts/**/LiberationSans-Bold.ttf"]) or BOLD
HAS_RAQM = features.check("raqm")
try:  # fallback when raqm is missing: shape Arabic letters manually
    import arabic_reshaper
    from bidi.algorithm import get_display
    def shape(s):
        return get_display(arabic_reshaper.reshape(s))
except Exception:
    def shape(s):
        return s

DARK, BLUE, YELLOW, PAPER, INK, MUTED = "#072F73", "#094BB2", "#FFC629", "#F7FAFF", "#0F2C52", "#4D6480"
W, H = 1600, 1130

def font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM if HAS_RAQM else ImageFont.Layout.BASIC)

def is_latin(text):
    return all(ord(ch) < 0x0590 for ch in text)

def centered(draw, text, cx, y, path, size, fill, max_width=None):
    """Draw one centred line, shrinking the font until it fits max_width."""
    text = " ".join(str(text).split())
    while True:
        f = font(LATIN if is_latin(text) and path is BOLD else path, size)
        kwargs = {"direction": "ltr" if is_latin(text) else "rtl"} if HAS_RAQM else {}
        shown = text if HAS_RAQM or is_latin(text) else shape(text)
        width = draw.textlength(shown, font=f, **kwargs)
        if not max_width or width <= max_width or size <= 26:
            break
        size -= 4
    draw.text((cx - width / 2, y), shown, font=f, fill=fill, **kwargs)
    return size

def render(data, output):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    for x in range(W):  # header gradient
        t = x / (W - 1)
        d.line([(x, 0), (x, 160)], fill=tuple(round(a + (b - a) * t) for a, b in zip((7, 47, 115), (9, 75, 178))))
    d.rectangle([0, 160, W, 170], fill=YELLOW)
    d.rectangle([0, H - 76, W, H], fill=DARK)
    d.rectangle([40, 206, W - 40, H - 112], outline=BLUE, width=3)
    d.rectangle([54, 220, W - 54, H - 126], outline=YELLOW, width=2)
    logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "badge-logo.png")
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")
        lh = 116
        logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.paste(logo, (W - 70 - logo.width, 22), logo)
    d.text((70, 62), "INEXC KNOWLEDGE BADGE", font=font(LATIN, 34), fill=YELLOW)
    centered(d, "إفادة اطّلاع واجتياز", W / 2, 262, BOLD, 80, DARK)
    centered(d, "تشهد شركة التميّز الابتكاري بأنّ", W / 2, 392, REGULAR, 38, MUTED)
    centered(d, data["name"], W / 2, 462, BOLD, 92, BLUE, W - 260)
    d.rectangle([W / 2 - 340, 606, W / 2 + 340, 610], fill=YELLOW)
    centered(d, "قد اطّلع على " + data["title"], W / 2, 646, REGULAR, 40, INK, W - 220)
    centered(d, "واجتاز بنجاح التقييم المعرفي المصاحب له", W / 2, 712, REGULAR, 40, INK)
    cx, cy = W // 2, 868
    d.ellipse([cx - 70, cy - 70, cx + 70, cy + 70], fill=YELLOW)
    d.ellipse([cx - 58, cy - 58, cx + 58, cy + 58], fill=DARK)
    d.ellipse([cx - 35, cy - 35, cx + 35, cy + 35], fill=YELLOW)
    d.line([(cx - 16, cy), (cx - 4, cy + 13), (cx + 18, cy - 13)], fill=DARK, width=9, joint="curve")
    centered(d, "التقدير: ناجح", W / 2, 946, BOLD, 30, DARK)
    centered(d, "التاريخ", W - 320, 838, REGULAR, 30, MUTED)
    centered(d, data["date"], W - 320, 888, BOLD, 34, DARK)
    centered(d, "رقم الإفادة", 320, 838, REGULAR, 30, MUTED)
    centered(d, data["code"], 320, 888, BOLD, 34, DARK)
    centered(d, "www.inexctraining.com", W / 2, H - 56, BOLD, 26, "#FFFFFF")
    img.save(output, "PDF", resolution=150.0, title="INEXC Knowledge Badge " + data["code"])

if __name__ == "__main__":
    payload = json.load(sys.stdin)
    for key in ("name", "title", "code", "date"):
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            sys.exit("missing " + key)
    render(payload, sys.argv[1])
