#!/usr/bin/env python3
"""Render an INEXC knowledge badge (إفادة اطّلاع واجتياز) as a one-page PDF.
Usage: badge-render.py OUTPUT.pdf  < JSON {name,title,code,date}
Standalone: reads stdin, writes one file, touches nothing else."""
import glob, json, os, re, sys
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
LATIN_REGULAR = find_font(["/usr/share/fonts/**/DejaVuSans.ttf", "/usr/share/fonts/**/LiberationSans-Regular.ttf"]) or LATIN
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
K = 2  # drawn at double size so the PDF stays sharp when zoomed or printed
W, H = 1600 * K, 1130 * K
LATIN_RUN = re.compile(r"([A-Za-z](?:[A-Za-z0-9 .&'_/+-]*[A-Za-z0-9])?)")

def font(path, size):
    return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM if HAS_RAQM else ImageFont.Layout.BASIC)

def is_latin(text):
    return all(ord(ch) < 0x0590 for ch in text)

def segments(text, path, size):
    """Split a line into runs so Latin words use a font that has Latin letters (Arabic fonts often do not)."""
    if is_latin(text):
        return [(text, font(LATIN if path is BOLD else LATIN_REGULAR, size), "ltr")]
    out = []
    for part in LATIN_RUN.split(text):
        if not part:
            continue
        if LATIN_RUN.fullmatch(part):
            out.append((part, font(LATIN if path is BOLD else LATIN_REGULAR, size), "ltr"))
        else:
            out.append((part, font(path, size), "rtl"))
    return out

def measure(draw, part, f, direction):
    shown = part if HAS_RAQM or direction == "ltr" else shape(part)
    kwargs = {"direction": direction} if HAS_RAQM else {}
    return shown, kwargs, draw.textlength(shown, font=f, **kwargs)

def centered(draw, text, cx, y, path, size, fill, max_width=None):
    """Draw one centred line (size and positions in base units), shrinking the font until it fits max_width."""
    text = " ".join(str(text).split())
    cx, y, size = cx * K, y * K, size * K
    while True:
        parts = [(f, direction) + measure(draw, part, f, direction) for part, f, direction in segments(text, path, size)]
        total = sum(p[4] for p in parts)
        if not max_width or total <= max_width * K or size <= 26 * K:
            break
        size -= 4 * K
    # Runs can use different fonts, so they are aligned on one shared baseline rather than by their tops.
    baseline = y + max(f.getmetrics()[0] for f, *_ in parts)
    if is_latin(text):
        x = cx - total / 2
        for f, direction, shown, kwargs, width in parts:
            draw.text((x, baseline), shown, font=f, fill=fill, anchor="ls", **kwargs)
            x += width
    else:  # right-to-left line: logical order runs are placed from the right edge leftwards
        x = cx + total / 2
        for f, direction, shown, kwargs, width in parts:
            x -= width
            draw.text((x, baseline), shown, font=f, fill=fill, anchor="ls", **kwargs)

def box(values):
    return [v * K for v in values]

def render(data, output):
    img = Image.new("RGB", (W, H), PAPER)
    d = ImageDraw.Draw(img)
    for x in range(W):  # header gradient
        t = x / (W - 1)
        d.line([(x, 0), (x, 160 * K)], fill=tuple(round(a + (b - a) * t) for a, b in zip((7, 47, 115), (9, 75, 178))))
    d.rectangle(box([0, 160, 1600, 170]), fill=YELLOW)
    d.rectangle(box([0, 1054, 1600, 1130]), fill=DARK)
    d.rectangle(box([40, 206, 1560, 1018]), outline=BLUE, width=3 * K)
    d.rectangle(box([54, 220, 1546, 1004]), outline=YELLOW, width=2 * K)
    logo_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "badge-logo.png")
    if os.path.exists(logo_path):
        logo = Image.open(logo_path).convert("RGBA")
        lh = 118 * K
        logo = logo.resize((round(logo.width * lh / logo.height), lh), Image.LANCZOS)
        img.paste(logo, (W - 64 * K - logo.width, 21 * K), logo)
    d.text((70 * K, 62 * K), "INEXC KNOWLEDGE BADGE", font=font(LATIN, 34 * K), fill=YELLOW)
    centered(d, "إفادة اطّلاع واجتياز", 800, 262, BOLD, 80, DARK)
    centered(d, "تشهد شركة التميّز الابتكاري بأنّ", 800, 392, REGULAR, 38, MUTED)
    centered(d, data["name"], 800, 462, BOLD, 92, BLUE, 1340)
    d.rectangle(box([460, 606, 1140, 610]), fill=YELLOW)
    centered(d, "قد اطّلع على " + data["title"], 800, 646, REGULAR, 40, INK, 1380)
    centered(d, "واجتاز بنجاح التقييم المعرفي المصاحب له", 800, 712, REGULAR, 40, INK)
    cx, cy = 800 * K, 868 * K
    for radius, colour in ((70, YELLOW), (58, DARK), (35, YELLOW)):
        d.ellipse([cx - radius * K, cy - radius * K, cx + radius * K, cy + radius * K], fill=colour)
    d.line([(cx - 16 * K, cy), (cx - 4 * K, cy + 13 * K), (cx + 18 * K, cy - 13 * K)], fill=DARK, width=9 * K, joint="curve")
    centered(d, "التقدير: ناجح", 800, 946, BOLD, 30, DARK)
    centered(d, "التاريخ", 1280, 838, REGULAR, 30, MUTED)
    centered(d, data["date"], 1280, 888, BOLD, 34, DARK)
    centered(d, "رقم الإفادة", 320, 838, REGULAR, 30, MUTED)
    centered(d, data["code"], 320, 888, BOLD, 34, DARK)
    centered(d, "www.inexctraining.com", 800, 1074, BOLD, 26, "#FFFFFF")
    img.save(output, "PDF", resolution=150.0 * K, quality=92, title="INEXC Knowledge Badge " + data["code"])

if __name__ == "__main__":
    payload = json.load(sys.stdin)
    for key in ("name", "title", "code", "date"):
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            sys.exit("missing " + key)
    render(payload, sys.argv[1])
