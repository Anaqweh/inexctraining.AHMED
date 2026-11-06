#!/usr/bin/env python3
"""تحويل أي ملف مرفوع على حائط الأعمال إلى صور صفحات مختومة بتوقيع التميز.
الاستخدام: wall-render.py <input> <outDir> <kind> <stampJSON> [originalName]
يطبع في النهاية PAGES=<n>. يعتمد على poppler (pdftoppm) وLibreOffice وPillow المثبتة في صورة الخادم."""
import glob, json, os, shutil, subprocess, sys, tempfile

from PIL import Image, ImageDraw, ImageFont, ImageOps, features

MAX_PAGES = 300
PAGE_WIDTH = 1400
DPI = 110

def log(msg):
    sys.stderr.write(str(msg) + "\n")

def find_font(patterns):
    for pat in patterns:
        hits = sorted(glob.glob(pat, recursive=True))
        if hits:
            return hits[0]
    return None

ARABIC_BOLD = find_font([
    "/usr/share/fonts/truetype/hosny-amiri/Amiri-Bold.ttf", "/usr/share/fonts/**/Amiri-Bold.ttf",
    "/usr/share/fonts/**/NotoNaskhArabic-Bold.ttf", "/usr/share/fonts/**/NotoSansArabic-Bold.ttf",
    "/usr/share/fonts/**/KacstOne.ttf", "/usr/share/fonts/**/DejaVuSans-Bold.ttf",
])
ARABIC_REG = find_font([
    "/usr/share/fonts/truetype/hosny-amiri/Amiri-Regular.ttf", "/usr/share/fonts/**/Amiri-Regular.ttf",
    "/usr/share/fonts/**/NotoNaskhArabic-Regular.ttf", "/usr/share/fonts/**/NotoSansArabic-Regular.ttf",
    "/usr/share/fonts/**/DejaVuSans.ttf",
]) or ARABIC_BOLD
LATIN = find_font(["/usr/share/fonts/**/DejaVuSans-Bold.ttf", "/usr/share/fonts/**/LiberationSans-Bold.ttf"]) or ARABIC_BOLD
HAS_RAQM = features.check("raqm")

try:  # احتياط عند غياب raqm: تشكيل الحروف العربية يدويًا
    import arabic_reshaper
    from bidi.algorithm import get_display
    def shape(s):
        return get_display(arabic_reshaper.reshape(s))
except Exception:  # pragma: no cover
    def shape(s):
        return s

def font(path, size):
    if not path:
        return ImageFont.load_default()
    try:
        if HAS_RAQM:
            return ImageFont.truetype(path, size, layout_engine=ImageFont.Layout.RAQM)
        return ImageFont.truetype(path, size)
    except Exception:
        return ImageFont.load_default()

def draw_text(draw, xy, s, fnt, fill, anchor="rm", rtl=True):
    try:
        if HAS_RAQM and isinstance(fnt, ImageFont.FreeTypeFont):
            draw.text(xy, s, font=fnt, fill=fill, anchor=anchor, direction="rtl" if rtl else "ltr")
            return
    except Exception:
        pass
    try:
        draw.text(xy, shape(s) if rtl else s, font=fnt, fill=fill, anchor=anchor)
    except Exception:
        draw.text(xy, shape(s) if rtl else s, font=fnt, fill=fill)

def text_width(draw, s, fnt, rtl=True):
    try:
        if HAS_RAQM and isinstance(fnt, ImageFont.FreeTypeFont):
            return draw.textlength(s, font=fnt, direction="rtl" if rtl else "ltr")
        return draw.textlength(shape(s) if rtl else s, font=fnt)
    except Exception:
        return len(s) * fnt.size * 0.55

def fit(img):
    if img.mode not in ("RGB",):
        bg = Image.new("RGB", img.size, "white")
        try:
            bg.paste(img, mask=img.convert("RGBA").split()[-1])
        except Exception:
            bg.paste(img.convert("RGB"))
        img = bg
    if img.width > PAGE_WIDTH:
        img = img.resize((PAGE_WIDTH, max(1, round(img.height * PAGE_WIDTH / img.width))), Image.LANCZOS)
    return img

def stamp(img, meta, page_no, total):
    """شريط توقيع التميز أسفل الصفحة: اسم المتدرب يمينًا، الشركة وسطًا، العلامة يسارًا."""
    if not meta:
        return img
    w = img.width
    band = max(56, int(w * 0.058))
    out = Image.new("RGB", (w, img.height + band), "white")
    out.paste(img, (0, 0))
    d = ImageDraw.Draw(out)
    top = img.height
    for y in range(band):  # تدرج الأزرق الغامق الرسمي (#0d4689 → #0b4ea2)
        t = y / band
        d.line([(0, top + y), (w, top + y)], fill=(int(13 - 2 * t), int(70 + 8 * t), int(137 + 25 * t)))
    d.rectangle([0, top, w, top + max(3, band // 16)], fill=(212, 167, 58))  # خيط ذهبي
    pad = int(band * 0.3)
    big = font(ARABIC_BOLD, int(band * 0.42))
    small = font(ARABIC_REG, int(band * 0.28))
    latin = font(LATIN, int(band * 0.26))
    cy = top + band // 2 + max(1, band // 16)
    name = str(meta.get("name") or "")[:60]
    company = str(meta.get("company") or "شركة التميز الابتكاري")
    brand = str(meta.get("brand") or "INEXC TRAINING")
    draw_text(d, (w - pad, cy), "✦ " + name, big, (255, 255, 255), anchor="rm")
    draw_text(d, (w // 2, cy), company, big, (212, 167, 58), anchor="mm")
    draw_text(d, (pad, cy - int(band * 0.16)), brand, latin, (205, 226, 255), anchor="lm", rtl=False)
    draw_text(d, (pad, cy + int(band * 0.2)), f"{page_no} / {total}", latin, (140, 170, 210), anchor="lm", rtl=False)
    board = str(meta.get("board") or "")[:70]
    if board and text_width(d, board, small) < w * 0.25:
        draw_text(d, (w - pad, cy + int(band * 0.3)), board, small, (190, 210, 240), anchor="rm")
    return out

def run(cmd, timeout, env=None):
    r = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, env=env)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.decode("utf-8", "ignore")[-400:] or f"فشل الأمر {cmd[0]}")
    return r

def pdf_to_images(pdf, tmp):
    prefix = os.path.join(tmp, "pg")
    run(["pdftoppm", "-r", str(DPI), "-png", "-l", str(MAX_PAGES), pdf, prefix], timeout=360)
    files = sorted(glob.glob(prefix + "-*.png"), key=lambda p: int(os.path.basename(p)[3:-4]))
    if not files:
        raise RuntimeError("لم تُستخرج أي صفحة من الملف")
    for f in files:
        yield Image.open(f)

def office_to_pdf(src, original_name, tmp):
    ext = os.path.splitext(original_name or "")[1].lower() or ".txt"
    staged = os.path.join(tmp, "source" + ext)
    shutil.copyfile(src, staged)
    env = dict(os.environ, HOME=tmp)
    run(["soffice", "--headless", "--norestore", "--nologo", "--convert-to", "pdf", "--outdir", tmp, staged], timeout=420, env=env)
    pdf = os.path.join(tmp, "source.pdf")
    if not os.path.exists(pdf):
        raise RuntimeError("تعذّر تحويل الملف إلى PDF")
    return pdf

def main():
    src, out_dir, kind, meta_json = sys.argv[1:5]
    original_name = sys.argv[5] if len(sys.argv) > 5 else ""
    meta = json.loads(meta_json) if meta_json and meta_json != "null" else None
    os.makedirs(out_dir, exist_ok=True)
    for old in glob.glob(os.path.join(out_dir, "page-*.png")):
        os.remove(old)
    tmp = tempfile.mkdtemp(prefix="wall-")
    try:
        if kind == "image":
            img = Image.open(src)
            try:
                img = ImageOps.exif_transpose(img)
            except Exception:
                pass
            pages = [img]
        elif kind == "pdf":
            pages = pdf_to_images(src, tmp)
        elif kind in ("office", "text"):
            pages = pdf_to_images(office_to_pdf(src, original_name, tmp), tmp)
        else:
            print("PAGES=0")
            return
        pages = list(pages)[:MAX_PAGES]
        total = len(pages)
        stamped = []
        for i, img in enumerate(pages, 1):
            page = stamp(fit(img), meta, i, total)
            page.save(os.path.join(out_dir, f"page-{i:03d}.png"), "PNG", optimize=True)
            stamped.append(page)
        # نسخة PDF مختومة للتنزيل: الصفحات نفسها بالختم
        if stamped:
            stamped[0].save(os.path.join(out_dir, "stamped.pdf"), "PDF", save_all=True, append_images=stamped[1:], resolution=DPI)
        print(f"PAGES={total}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

if __name__ == "__main__":
    main()
