/* ── motion.js : mouvement et retours au toucher ────────────────────────────────────────────────────────────────
   · Carte en grand : elle part de la vignette touchée et y revient en se fermant (FLIP, Web Animations).
   · Cartes « foil » (.tilt : carte en grand, commandant, couvertures de decks) : inclinaison 3D et reflet qui suivent le doigt ou la souris.
   · Entrées en cascade (.stg) : listes et grilles arrivent ligne après ligne quand un écran ou un onglet s'ouvre (14 premières seulement).
   · En-têtes des écrans plein format : filet et ombre seulement quand le contenu passe dessous.
   Tout passe par transform / opacity (compositeur, jamais de mise en page) ; « réduire les animations » coupe tout. */
const MO = { press: null, at: 0, tilt: null, raf: 0, pt: null };
const motionOff = () => reduceMotion() || typeof Element === 'undefined' || !Element.prototype.animate;

/* ── Vignette touchée : point de départ de la carte en grand ── */
const PRESS_SEL = '.thumb, .dvc-art, .imgv-v img, .ca-opt';
document.addEventListener('pointerdown', e => {
  const el = e.target && e.target.closest && e.target.closest(PRESS_SEL);
  if (el) { MO.press = el; MO.at = performance.now(); }
}, { capture: true, passive: true });
/** Élément touché il y a moins de 900 ms, encore affiché : origine du FLIP (null sinon). */
function pressOrigin() {
  const el = MO.press; if (!el || !el.isConnected || performance.now() - MO.at > 900) return null;
  const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 ? r : null;
}
/** Anime `el` depuis le rectangle `from` jusqu'à sa place (agrandissement depuis la vignette). */
function flipFrom(el, from, ms = 460) {
  if (!from || motionOff()) return false;
  const was = el.style.transition; el.style.transition = 'none'; el.style.transform = 'none';
  const to = el.getBoundingClientRect(); el.style.transform = ''; void el.offsetWidth; el.style.transition = was;
  if (!to.width) return false;
  const dx = from.left + from.width / 2 - (to.left + to.width / 2), dy = from.top + from.height / 2 - (to.top + to.height / 2), s = from.width / to.width;
  return el.animate([{ transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.5 }, { transform: 'none', opacity: 1 }], { duration: ms, easing: 'cubic-bezier(.22,1.12,.36,1)' });      // léger dépassement : la carte « se pose » ; l'animation (vraie) est rendue : la carte en grand repeint son image à la fin
}
/** Retour vers le rectangle `to` (fermeture). */
function flipTo(el, to, ms = 300) {
  if (!to || motionOff()) return false;
  const r = el.getBoundingClientRect(); if (!r.width) return false;
  const dx = to.left + to.width / 2 - (r.left + r.width / 2), dy = to.top + to.height / 2 - (r.top + r.height / 2), s = to.width / r.width;
  el.animate([{ transform: getComputedStyle(el).transform === 'none' ? 'none' : getComputedStyle(el).transform, opacity: 1 }, { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.4 }], { duration: ms, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' });
  return true;
}

/* ── Inclinaison foil ── */
function tiltReset(el) { if (!el) return; el.style.removeProperty('--rx'); el.style.removeProperty('--ry'); el.classList.remove('tilting'); }
function tiltPaint() {
  MO.raf = 0; const el = MO.tilt, p = MO.pt; if (!el || !p) return;
  const r = el.getBoundingClientRect(); if (!r.width) return;
  const x = Math.min(1, Math.max(0, (p.x - r.left) / r.width)), y = Math.min(1, Math.max(0, (p.y - r.top) / r.height)), max = el.classList.contains('imgv-card') ? 9 : 7;
  el.style.setProperty('--rx', ((0.5 - y) * max).toFixed(2) + 'deg'); el.style.setProperty('--ry', ((x - 0.5) * max).toFixed(2) + 'deg');
  el.style.setProperty('--mx', (x * 100).toFixed(1) + '%'); el.style.setProperty('--my', (y * 100).toFixed(1) + '%');
  el.classList.add('tilting');
}
function tiltMove(e) {
  if (motionOff()) return;
  const el = e.target && e.target.closest && e.target.closest('.tilt');
  if (el !== MO.tilt) { tiltReset(MO.tilt); MO.tilt = el; }
  if (!el) return;
  MO.pt = { x: e.clientX, y: e.clientY };
  if (!MO.raf) MO.raf = requestAnimationFrame(tiltPaint);
}
document.addEventListener('pointermove', tiltMove, { passive: true });
document.addEventListener('pointerdown', tiltMove, { passive: true });
for (const ev of ['pointerup', 'pointercancel', 'pointerleave', 'scroll']) document.addEventListener(ev, e => { if (ev !== 'pointerup' || e.pointerType !== 'mouse') { tiltReset(MO.tilt); MO.tilt = null; } }, { passive: true, capture: ev === 'scroll' });

/* ── Images de cartes : une image déjà chargée revient sans fondu ; une vignette chargée hors du document est rattrapée ──
   Les conteneurs posent la classe .ok sur l'événement load (écouteur en capture) : une vignette gardée puis déplacée (viewer, tri, filtre, changement de vue)
   qui finit de charger pendant qu'elle est détachée rate cet événement et resterait transparente ; un repeint (innerHTML) refait chaque image et relançait son fondu. */
const IMG_SEEN = new Set();
document.addEventListener('load', e => { const t = e.target; if (t && t.tagName === 'IMG' && t.naturalWidth) { if (IMG_SEEN.size > 4000) IMG_SEEN.clear(); IMG_SEEN.add(t.getAttribute('src')); } }, true);
/** Attribut de classe d'une image de carte : « ok » d'emblée si cette adresse a déjà été chargée (cache du navigateur : pas de fondu, pas de clignotement). */
const imgOkAttr = u => (u && IMG_SEEN.has(u) ? ' class="ok"' : '');
/** Images d'un nœud remis dans le document : chargées entre-temps → .ok ; en échec → retirées (la lettre d'attente reste), comme le ferait l'écouteur error. */
function imgSettle(root) {
  for (const im of root.querySelectorAll('img')) {
    if (!im.complete || im.classList.contains('ok') || !im.getAttribute('src') || im.ownerDocument !== document) continue;      // image d'un modèle (template) : jamais chargée, pas en échec
    if (im.naturalWidth) im.classList.add('ok'); else im.remove();
  }
}

/* ── Entrées en cascade ── */
/** Rejoue l'arrivée en cascade des enfants de chaque conteneur (listes, grilles) : seulement à l'ouverture d'un écran, d'un onglet, d'un tri. */
function stagger(...els) {
  if (motionOff()) return;
  const list = els.flat().filter(Boolean); for (const el of list) el.classList.remove('stg');
  requestAnimationFrame(() => { for (const el of list) el.classList.add('stg'); });      // relancée à l'image suivante : plus de mise en page forcée (void offsetWidth) par élément
}

/* ── En-têtes des écrans plein format ── */
let MO_SCR = 0;
document.addEventListener('scroll', e => {
  const sc = e.target; if (!sc || !sc.classList || !sc.classList.contains('dv-scroll') || MO_SCR) return;
  MO_SCR = requestAnimationFrame(() => { MO_SCR = 0; const dv = sc.closest('.dv'); if (dv) dv.classList.toggle('scrolled', sc.scrollTop > 4); });      // une lecture par image, pas à chaque événement (scrollTop forçait une mise en page : 20 à 30 ms par événement, CPU ×4)
}, { capture: true, passive: true });
