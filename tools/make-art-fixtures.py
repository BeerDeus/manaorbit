# Éditions d'une même carte (petites images comme celles de Scryfall, 146 × 204) et photos prises au téléphone de deux d'entre elles, pour tester la
# reconnaissance de l'illustration (scanart.js). lea et 2x2 partagent la même illustration (réédition), cadre de couleur différente.
# Usage : python3 tools/make-art-fixtures.py tests/fixtures/art
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageEnhance
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
def art(seed, W=600, H=440):
    r = random.Random(seed); im = Image.new('RGB', (W, H), tuple(r.randint(30, 200) for _ in range(3))); d = ImageDraw.Draw(im)
    for _ in range(22):
        x, y = r.randint(-60, W), r.randint(-60, H); w, h = r.randint(60, 260), r.randint(50, 220)
        d.ellipse((x, y, x + w, y + h), fill=tuple(r.randint(0, 255) for _ in range(3)))
    return im
def card(name, a, frame, H=1040):
    W = round(H * 63 / 88); k = H / 1040
    im = Image.new('RGB', (W, H), (12, 12, 12)); d = ImageDraw.Draw(im)
    d.rounded_rectangle((round(26 * k), round(26 * k), W - round(26 * k), round(H * 0.915)), round(20 * k), fill=frame)
    d.rounded_rectangle((round(44 * k), round(44 * k), W - round(44 * k), round(112 * k)), round(12 * k), fill=(236, 226, 196))
    d.text((round(62 * k), round(78 * k)), name, font=ImageFont.truetype(SERIF, round(40 * k)), fill=(25, 20, 15), anchor='lm')
    box = (round(60 * k), round(128 * k), W - round(60 * k), round(570 * k)); im.paste(a.resize((box[2] - box[0], box[3] - box[1])), box[:2])
    d.rounded_rectangle((round(44 * k), round(590 * k), W - round(44 * k), round(650 * k)), round(8 * k), fill=(236, 226, 196))
    d.rectangle((round(60 * k), round(670 * k), W - round(60 * k), round(930 * k)), fill=(236, 226, 196))
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
out = sys.argv[1]
ARTS = {'cmm': 1, 'lea': 2, '2x2': 2, 'm21': 3, 'sta': 4}
FRAMES = {'cmm': (214, 196, 150), 'lea': (200, 180, 140), '2x2': (150, 160, 190), 'm21': (214, 196, 150), 'sta': (40, 40, 60)}
for s, a in ARTS.items():
    card('Swords to Plowshares', art(a), FRAMES[s]).resize((146, 204), Image.LANCZOS).save(f'{out}/print-{s}.jpg', quality=85)
photo(card('Swords to Plowshares', art(3), FRAMES['m21'], H=978), 31).save(f'{out}/photo-m21.jpg', quality=85)
photo(card('Épées aux charrues', art(2), FRAMES['lea'], H=978), 32, gain=(0.9, 1.0, 1.15), bright=1.1).save(f'{out}/photo-lea.jpg', quality=85)      # carte française, lumière froide
print('ok')
