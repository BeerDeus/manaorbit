# Symboles d'extension pour tester leur lecture (scansym.js) : quelques formes (étoile, croissant, écu, chevron et son presque jumeau, anneau) écrites en SVG
# (comme ceux de svgs.scryfall.io : une silhouette noire, viewBox 0 0 100 100) et dessinées à droite de la ligne de type de cartes à la MÊME illustration
# (réédition), couleur de rareté (noir, argent, or, orange : dégradé, contour), puis « photographiées » (lumière, flou, bruit, carte décalée et penchée).
# Aussi les petites images Scryfall (146 × 204) de chaque édition. Usage : python3 tools/make-sym-fixtures.py tests/fixtures/sym
import math, random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance, ImageChops
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'

def star(n=5, r0=0.5, r1=0.22, rot=-90):
    return [[(0.5 + (r0 if i % 2 == 0 else r1) * math.cos(math.radians(rot + i * 180 / n)), 0.5 + (r0 if i % 2 == 0 else r1) * math.sin(math.radians(rot + i * 180 / n))) for i in range(2 * n)]]
def circle(cx, cy, r, n=64, a0=0, a1=360):
    return [(cx + r * math.cos(math.radians(a0 + (a1 - a0) * i / n)), cy + r * math.sin(math.radians(a0 + (a1 - a0) * i / n))) for i in range(n + 1)]
def crescent():      # disque moins un disque décalé : un seul contour
    out = [(0.5 + 0.48 * math.cos(math.radians(a)), 0.5 + 0.48 * math.sin(math.radians(a))) for a in range(40, 321, 5)]
    inner = [(0.66 + 0.36 * math.cos(math.radians(a)), 0.44 + 0.36 * math.sin(math.radians(a))) for a in range(110, 251, 5)]
    return [out + inner[::-1]]
def shield():
    top = [(0.12, 0.08), (0.5, 0.0), (0.88, 0.08), (0.88, 0.45)]
    bottom = [(0.5 + 0.38 * math.cos(math.radians(a)), 0.45 + 0.55 * math.sin(math.radians(a))) for a in range(0, 181, 6)]
    return [top + bottom]
def chevron(t=0.24, h=0.62):      # « V » épais, pointe en bas
    return [[(0.0, 0.0), (t, 0.0), (0.5, h), (1 - t, 0.0), (1.0, 0.0), (0.5, 1.0)]]
def ring():      # anneau à trou et barre : la silhouette (trou bouché) est un disque à encoche
    return [circle(0.5, 0.5, 0.5)[:-1], circle(0.5, 0.5, 0.26)[:-1][::-1], [(0.46, 0.0), (0.54, 0.0), (0.54, 0.3), (0.46, 0.3)]]
SHAPES = {
    'tsa': star(),                       # étoile à 5 branches
    'tsb': crescent(),                   # croissant
    'tsc': shield(),                     # écu
    'tsd': chevron(),                    # chevron
    'tse': chevron(0.25, 0.6),           # presque le même chevron : symbole ambigu
    'tsf': ring(),
}
def svg_of(rings):
    d = ' '.join('M' + ' L'.join(f'{x * 100:.2f} {y * 100:.2f}' for x, y in r) + ' Z' for r in rings)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path fill-rule="evenodd" d="{d}"/></svg>'
def mask_of(rings, w, h, ss=4):
    """Silhouette (pair-impair) dans une boîte w × h, lissée (suréchantillonnage)."""
    W, H = w * ss, h * ss; m = Image.new('1', (W, H), 0)
    for r in rings:
        one = Image.new('1', (W, H), 0); ImageDraw.Draw(one).polygon([(x * (W - 1), y * (H - 1)) for x, y in r], fill=1); m = ImageChops.logical_xor(m, one)
    return m.convert('L').resize((w, h), Image.LANCZOS), m
RARITY = {'c': ((25, 25, 25), (25, 25, 25), (235, 235, 235)), 'u': ((215, 222, 228), (105, 112, 120), (15, 15, 15)), 'r': ((238, 205, 115), (150, 110, 35), (15, 15, 15)), 'm': ((250, 150, 50), (190, 55, 20), (15, 15, 15))}
def draw_symbol(im, rings, right, cy, h, rarity='r'):
    """Symbole à droite de la ligne de type : bord droit right, centre vertical cy, hauteur h (px) ; dégradé de rareté et contour fin."""
    xs = [x for r in rings for x, _ in r]; ys = [y for r in rings for _, y in r]; aw, ah = max(xs) - min(xs), max(ys) - min(ys)
    w = max(4, round(h * aw / ah)); ss = 4
    nr = [[((x - min(xs)) / aw, (y - min(ys)) / ah) for x, y in r] for r in rings]
    pad = 3; W, H = (w + 2 * pad) * ss, (h + 2 * pad) * ss
    big = Image.new('1', (W, H), 0)
    for r in nr:
        one = Image.new('1', (W, H), 0); ImageDraw.Draw(one).polygon([(pad * ss + x * (w * ss - 1), pad * ss + y * (h * ss - 1)) for x, y in r], fill=1); big = ImageChops.logical_xor(big, one)
    fill = big.convert('L'); edge = fill.filter(ImageFilter.MaxFilter(2 * round(0.9 * ss) + 1))      # contour d'environ 1 px
    c0, c1, oc = RARITY[rarity]; grad = Image.new('RGB', (W, H))
    gd = ImageDraw.Draw(grad)
    for y in range(H): t = y / (H - 1); gd.line((0, y, W, y), fill=tuple(round(a + (b - a) * t) for a, b in zip(c0, c1)))
    sym = Image.new('RGB', (W, H), oc); sym.paste(grad, (0, 0), fill)
    alpha = edge.resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS); sym = sym.resize((w + 2 * pad, h + 2 * pad), Image.LANCZOS)
    im.paste(sym, (round(right - w - pad), round(cy - h / 2 - pad)), alpha)
def art(seed, W=600, H=440):
    r = random.Random(seed); im = Image.new('RGB', (W, H), tuple(r.randint(30, 200) for _ in range(3))); d = ImageDraw.Draw(im)
    for _ in range(22):
        x, y = r.randint(-60, W), r.randint(-60, H); w, h = r.randint(60, 260), r.randint(50, 220)
        d.ellipse((x, y, x + w, y + h), fill=tuple(r.randint(0, 255) for _ in range(3)))
    return im
def card(name, a, rings=None, rarity='r', H=1040, frame=(214, 196, 150), band=(236, 226, 196), typ='Instant'):
    W = round(H * 63 / 88); k = H / 1040
    im = Image.new('RGB', (W, H), (12, 12, 12)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((round(26 * k), round(26 * k), W - round(26 * k), round(H * 0.915)), round(20 * k), fill=frame)
    d.rounded_rectangle((round(44 * k), round(44 * k), W - round(44 * k), round(112 * k)), round(12 * k), fill=band)
    d.text((round(62 * k), round(78 * k)), name, font=ImageFont.truetype(SERIF, round(40 * k)), fill=(25, 20, 15), anchor='lm')
    box = (round(60 * k), round(128 * k), W - round(60 * k), round(570 * k)); im.paste(a.resize((box[2] - box[0], box[3] - box[1])), box[:2])
    d.rounded_rectangle((round(44 * k), round(590 * k), W - round(44 * k), round(650 * k)), round(8 * k), fill=band, outline=(60, 50, 40), width=max(1, round(2 * k)))
    fs = round(30 * k)
    while fs > 10 and d.textlength(typ, font=ImageFont.truetype(SERIF, fs)) > W * 0.8 - 62 * k: fs -= 1      # comme sur une vraie carte : le type rapetisse, jamais sur le symbole
    d.text((round(62 * k), round(620 * k)), typ, font=ImageFont.truetype(SERIF, fs), fill=(25, 20, 15), anchor='lm')
    d.rectangle((round(60 * k), round(670 * k), W - round(60 * k), round(930 * k)), fill=band)
    if rings: draw_symbol(im, rings, W - round(64 * k), round(620 * k), round(34 * k), rarity)
    return im
def photo(im, seed, gain=(1.12, 1.0, 0.82), bright=0.85, blur=1.4, noise=14, shift=(0.02, -0.015), rot=1.2):
    r = random.Random(seed); W, H = im.size
    big = Image.new('RGB', (round(W * 1.1), round(H * 1.1)), (90, 80, 66)); big.paste(im, (round(W * 0.05 + W * shift[0]), round(H * 0.05 + H * shift[1])))
    big = big.rotate(rot, resample=Image.BICUBIC, fillcolor=(90, 80, 66)).crop((round(W * 0.05), round(H * 0.05), round(W * 0.05) + W, round(H * 0.05) + H))      # cadre de l'écran : la carte un peu décalée
    ch = big.split(); big = Image.merge('RGB', [c.point(lambda v, g=g: max(0, min(255, round(v * g)))) for c, g in zip(ch, gain)])      # lumière chaude
    big = ImageEnhance.Brightness(big).enhance(bright).filter(ImageFilter.GaussianBlur(blur))
    px = big.load()
    for _ in range(W * H // 10):
        x, y = r.randrange(W), r.randrange(H); p = px[x, y]; n = r.randint(-noise, noise); px[x, y] = tuple(max(0, min(255, c + n)) for c in p)
    return big

if __name__ == '__main__':
    out = sys.argv[1]
    for s, rings in SHAPES.items():
        open(f'{out}/{s}.svg', 'w').write(svg_of(rings) + '\n')
        card('Swords to Plowshares', art(2), rings).resize((146, 204), Image.LANCZOS).save(f'{out}/print-{s}.jpg', quality=85)      # même illustration dans toutes les éditions
    A = art(2)
    photo(card('Swords to Plowshares', A, SHAPES['tsc'], 'r', H=978), 41).save(f'{out}/photo-tsc.jpg', quality=85)      # or, lumière chaude
    photo(card('Épées aux charrues', A, SHAPES['tsb'], 'u', H=978, typ='Éphémère'), 42, gain=(0.9, 1.0, 1.15), bright=1.1, shift=(-0.015, 0.012), rot=-1.5).save(f'{out}/photo-tsb.jpg', quality=85)      # argent, lumière froide
    photo(card('Swords to Plowshares', A, SHAPES['tsa'], 'c', H=1200, typ='Legendary Creature — Human'), 43, blur=1.8, noise=18).save(f'{out}/photo-tsa.jpg', quality=85)      # noir, ligne de type longue
    photo(card('Swords to Plowshares', A, SHAPES['tsd'], 'm', H=978), 44).save(f'{out}/photo-tsd.jpg', quality=85)      # orange : chevron, presque le même que tse
    photo(card('Swords to Plowshares', A, None, H=978), 45).save(f'{out}/photo-none.jpg', quality=85)      # pas de symbole (Alpha, Beta, Unlimited, Revised…)
    print('ok')
