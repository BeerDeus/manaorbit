// Vraies images de cartes (Scryfall), gardées sur le disque : shots/cartes/ (non versionné). Utilisé par tools/insta/rendu.mjs (cartes des posts)
// et par tools/store-assets.mjs avec VRAIES_CARTES=1 (écrans de l'appli avec les vraies images au lieu des cartes dessinées).
// Téléchargement par curl (suit HTTPS_PROXY tout seul), une requête à la fois, 120 ms entre deux (règles d'usage de l'API Scryfall).
// Images : jamais recadrées ni déformées (règles de Scryfall et Fan Content Policy de Wizards) ; la carte entière garde le nom de l'artiste et le ©.
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CACHE = join(ROOT, 'shots', 'cartes');
const IDX = join(CACHE, 'index-v4.json');      // v4 : présentation classique préférée (pas de vitrine ni de sans-bordure)
const UA = 'ManaOrbitVisuels/1.0 (manaorbit.app)';
let idx = null, last = 0, queue = Promise.resolve();
const loadIdx = () => { if (!idx) { mkdirSync(CACHE, { recursive: true }); try { idx = JSON.parse(readFileSync(IDX, 'utf8')); } catch { idx = {}; } } return idx; };
const slug = s => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** Une requête à la fois, espacées de 120 ms. */
function curl(args) {
  const run = async () => {
    const wait = last + 120 - Date.now(); if (wait > 0) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    return new Promise((res, rej) => execFile('curl', ['-sSfL', '--max-time', '30', '-H', 'User-Agent: ' + UA, ...args], { encoding: 'buffer', maxBuffer: 30e6 }, (e, out) => (e ? rej(e) : res(out))));
  };
  const p = queue.then(run, run); queue = p.catch(() => {}); return p;
}
const api = async path => JSON.parse((await curl(['-H', 'Accept: application/json', 'https://api.scryfall.com' + path])).toString('utf8'));
/** Impression utilisable : traduite pour de vrai (une impression « fr » sans nom imprimé est une carte anglaise d'une série spéciale). */
// et la carte elle-même, pas une autre dont c'est la 2e face (« Emeritus of Woe // Demonic Tutor »)
const okFor = name => c => (c.lang === 'en' || !!(c.printed_name || (c.card_faces && c.card_faces[0].printed_name))) && (c.name === name || c.name.startsWith(name + ' //'));
const uris = c => c.image_uris || (c.card_faces && c.card_faces[0].image_uris) || null;

/** Fiche Scryfall d'une carte : impression dans la langue demandée si elle existe (la plus récente au cadre moderne d'abord), sinon l'impression par défaut. */
async function lookup(name, lang, set) {
  const key = [name, lang, set || ''].join('|'), I = loadIdx();
  if (I[key]) return I[key];
  let c = null; const ok = okFor(name);
  const q = (extra) => '/cards/search?unique=prints&order=released&dir=desc&q=' + encodeURIComponent(`!"${name}" ${extra} game:paper`);
  try { if (set) c = (await api(q(`set:${set} lang:${lang}`))).data.find(ok); } catch { /* aucune */ }
  try { if (!c) c = (await api(q(`lang:${lang} frame:2015 border:black -is:fullart -is:promo -frame:showcase -frame:extendedart -frame:etched -is:boosterfun`))).data.find(ok); } catch { /* aucune */ }      // présentation classique d'abord
  try { if (!c && lang !== 'en') c = (await api(q(`lang:${lang} frame:2015`))).data.find(ok); } catch { /* aucune */ }
  try { if (!c && lang !== 'en') c = (await api(q(`lang:${lang}`))).data.find(ok); } catch { /* aucune */ }
  try { if (!c) c = await api('/cards/named?exact=' + encodeURIComponent(name)); } catch { /* aucune */ }
  const u = c && uris(c);
  I[key] = u ? { u: { small: u.small, normal: u.normal, large: u.large, png: u.png, art_crop: u.art_crop }, lang: c.lang, set: c.set, artist: c.artist || '' } : { u: null };
  writeFileSync(IDX, JSON.stringify(I, null, 1)); return I[key];
}

/** Chemin local de l'image (taille : small, normal, large, png, art_crop), ou null si Scryfall ne la connaît pas. */
export async function carteImage(name, { lang = 'fr', size = 'large', set = '' } = {}) {
  const ext = size === 'png' ? '.png' : '.jpg', f = join(CACHE, `${slug(name)}-${lang}${set ? '-' + set : ''}-${size}${ext}`);
  if (existsSync(f) && statSync(f).size > 1000) return f;
  const r = await lookup(name, lang, set); if (!r.u || !r.u[size]) return null;
  try { writeFileSync(f, await curl([r.u[size]])); return f; } catch { return null; }
}
