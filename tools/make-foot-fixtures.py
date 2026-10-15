# Photos de cartes entières pour tester la lecture de la ligne du bas (scanfoot.js) : bord noir, ligne « 0202 U » / « DSK • EN  Artiste »
# en bas à gauche, à la taille réelle (hauteur des capitales ≈ 1,1 % de la carte). Une photo « appareil » (carte de 1 400 px de haut) et une
# « aperçu » (980 px : l'image de la caméra en direct). Usage : python3 tools/make-foot-fixtures.py tests/fixtures
import random, sys
from PIL import Image, ImageDraw, ImageFont, ImageFilter
random.seed(11)
SERIF = '/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf'
SANS = '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf'
SANSR = '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf'
def card(name, l1, l2, artist, H=1400, frame=(214, 196, 150)):
    W = round(H * 63 / 88); k = H / 1040
    im = Image.new('RGB', (W, H), (12, 12, 12)); d = ImageDraw.Draw(im)      # bord noir
    m = round(26 * k); d.rounded_rectangle((m, m, W - m, round(H * 0.915)), round(20 * k), fill=frame)
    band = (236, 226, 196)
    d.rounded_rectangle((round(44 * k), round(44 * k), W - round(44 * k), round(112 * k)), round(12 * k), fill=band, outline=(60, 50, 40), width=max(1, round(3 * k)))
    d.text((round(62 * k), round(78 * k)), name, font=ImageFont.truetype(SERIF, round(42 * k)), fill=(25, 20, 15), anchor='lm')
    d.rectangle((round(60 * k), round(128 * k), W - round(60 * k), round(570 * k)), fill=(70, 100, 140))
    for _ in range(40):
        x, y = random.randint(round(70 * k), W - round(140 * k)), random.randint(round(140 * k), round(540 * k))
        d.ellipse((x, y, x + random.randint(20, 120), y + random.randint(20, 90)), fill=tuple(random.randint(40, 200) for _ in range(3)))
    d.rounded_rectangle((round(44 * k), round(590 * k), W - round(44 * k), round(650 * k)), round(8 * k), fill=band)
    d.text((round(62 * k), round(620 * k)), 'Artifact', font=ImageFont.truetype(SERIF, round(30 * k)), fill=(25, 20, 15), anchor='lm')
    d.rectangle((round(60 * k), round(670 * k), W - round(60 * k), round(930 * k)), fill=band)
    d.text((round(78 * k), round(700 * k)), '{T}: Add {C}{C}.', font=ImageFont.truetype(SANSR, round(30 * k)), fill=(25, 20, 15))
    fs = round(H * 0.0155); f = ImageFont.truetype(SANS, fs); fr = ImageFont.truetype(SANSR, fs)      # ligne du bas : blanc sur le bord noir
    x0, y1, y2 = round(W * 0.05), round(H * 0.928), round(H * 0.952)
    d.text((x0, y1), l1, font=f, fill=(235, 235, 235))
    d.text((x0, y2), l2, font=f, fill=(235, 235, 235)); d.text((x0 + round(W * 0.2), y2), artist, font=fr, fill=(235, 235, 235))
    d.text((W - round(W * 0.05), y2), '™ & © 2024 Wizards of the Coast', font=ImageFont.truetype(SANSR, round(fs * 0.8)), fill=(200, 200, 200), anchor='ra')
    return im
def photo(im, rot=0.0, blur=0.0, noise=0, pad=0.015, bg=(96, 84, 70)):      # pad : la marge que laisse le cadre de l'écran autour de la carte
    p = round(im.width * pad); base = Image.new('RGB', (im.width + 2 * p, im.height + 2 * p), bg); base.paste(im, (p, p))
    if rot: base = base.rotate(rot, resample=Image.BICUBIC, fillcolor=bg)
    if blur: base = base.filter(ImageFilter.GaussianBlur(blur))
    if noise:
        px = base.load()
        for _ in range(base.width * base.height // 14):
            x, y = random.randrange(base.width), random.randrange(base.height); r, g, b = px[x, y]; n = random.randint(-noise, noise); px[x, y] = (max(0, min(255, r + n)), max(0, min(255, g + n)), max(0, min(255, b + n)))
    return base
out = sys.argv[1]
jobs = {
  'foot-dsk.jpg': photo(card('Sol Ring', '0202 U', 'DSK • EN', 'Mike Bierek'), blur=0.5, noise=10),
  'foot-m21.jpg': photo(card('Sol Ring', '203/274 U', 'M21 • EN', 'Mike Bierek'), blur=0.6, noise=12),
  'foot-blb-fr.jpg': photo(card('Tour de commandement', '0201 C', 'BLB • FR', 'Ryan Yee', frame=(150, 140, 120)), blur=0.5, noise=10),
  'foot-preview.jpg': photo(card('Sol Ring', '0200 U', 'CMM • EN', 'Mike Bierek', H=980), blur=0.7, noise=12),
}
for n, im in jobs.items(): im.convert('RGB').save(f'{out}/{n}', quality=88)
print('ok', len(jobs))
