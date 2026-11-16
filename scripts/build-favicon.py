"""يولّد أيقونة التبويب من الشعار الرسمي المعتمد assets/inexc-approved-logo.jpg (بدون إعادة رسم).
الاستخدام: python3 scripts/build-favicon.py assets/inexc-approved-logo.jpg <out-dir>"""
import sys
from PIL import Image
import numpy as np
src, out = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(float)
# emblem = everything left of the vertical divider bar
blue = (a[:,:,2] - a[:,:,0])  # blueness
mask = blue > 40
cols = mask.sum(axis=0)
# find the divider: a column band with very tall blue run
tall = np.where(cols > 0.55*mask.sum(axis=0).max())[0]
div_x = tall.min()
print('divider at', div_x, 'size', im.size)
em = mask[:, :div_x-12]
ys, xs = np.where(em)
x0,x1,y0,y1 = xs.min(), xs.max(), ys.min(), ys.max()
print('emblem bbox', x0,y0,x1,y1)
crop = a[y0:y1+1, x0:x1+1]
# alpha from distance to white; colour = official blue sampled from solid areas
solid = crop[(crop[:,:,2]-crop[:,:,0])>120]
col = np.median(solid, axis=0)
print('blue', col)
alpha = np.clip((255 - crop[:,:,0]) / (255 - col[0]), 0, 1)
rgba = np.zeros(crop.shape[:2]+(4,), dtype=np.uint8)
rgba[:,:,:3] = col.round().astype(np.uint8)
rgba[:,:,3] = (alpha*255).round().astype(np.uint8)
em_img = Image.fromarray(rgba, 'RGBA')
def square(size, pad, bg=None):
    canvas = Image.new('RGBA', (size,size), bg or (0,0,0,0))
    inner = size - 2*pad
    w,h = em_img.size
    s = min(inner/w, inner/h)
    r = em_img.resize((max(1,round(w*s)), max(1,round(h*s))), Image.LANCZOS)
    canvas.alpha_composite(r, ((size-r.width)//2, (size-r.height)//2))
    return canvas
square(512, 14).save(f'{out}/inexc-favicon.png', optimize=True)
square(192, 6).save(f'{out}/inexc-favicon-192.png', optimize=True)
square(180, 16, (255,255,255,255)).convert('RGB').save(f'{out}/inexc-apple-touch-icon.png', optimize=True)
ico = square(256, 4)
ico.save(f'{out}/favicon.ico', sizes=[(16,16),(32,32),(48,48),(64,64)])
