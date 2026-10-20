#!/usr/bin/env node
// Mana Orbit — proxy local (aucune dépendance, Node ≥ 18).
//   CARDTRADER_TOKEN=xxxxx node proxy.mjs          → http://localhost:8787
//   HOST=0.0.0.0 ALLOWED_UIDS=<uid Firebase> node proxy.mjs  → accessible depuis le téléphone, réservé à ton compte Firebase
//   HOST=0.0.0.0 APP_KEY=un-secret node proxy.mjs  → variante : clé partagée à saisir dans Réglages
// Le token reste côté serveur. Seules les routes utiles sont relayées ; l'achat (cart/purchase) est bloqué.
//   Alertes de prix : mêmes clés VAPID, ou le compte de service FCM pour l'appli Android (ALERTS=0 pour couper).
//   Notifications « recherche terminée » (facultatif) : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (voir gen-vapid.mjs).
//   Notifications dans l'appli Android (facultatif) : FCM_SERVICE_ACCOUNT (JSON du compte de service Firebase, ou son base64) ou FCM_SERVICE_ACCOUNT_FILE.
import http from 'node:http';
import { readFile, writeFile, mkdir, rename, stat, readdir, unlink } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { gunzipSync, gzipSync, gzip, gunzip, brotliCompress, constants as zc } from 'node:zlib';
import { promisify } from 'node:util';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, createPublicKey, createPrivateKey, verify as rsaVerify, sign as dsaSign, randomBytes, createHash, createHmac, createECDH, createCipheriv, createDecipheriv, hkdfSync } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const gzipA = promisify(gzip), gunzipA = promisify(gunzip), brotliA = promisify(brotliCompress);
const PORT = Number(process.env.PORT) || 8787;
const HOST = process.env.HOST || '127.0.0.1';
const TOKEN = (process.env.CARDTRADER_TOKEN || '').trim();
const APP_KEY = (process.env.APP_KEY || '').trim();
const UPSTREAM = (process.env.CT_UPSTREAM || 'https://api.cardtrader.com/api/v2').replace(/\/+$/, '') + '/'; // surchargeable pour les tests
const PAGE = ['deck-deal.html', 'dist/deck-deal.html'].map(f => join(here, f)).find(existsSync);
const PWA = process.env.PWA_DIR || join(here, 'pwa');                       // surchargeable pour les tests (dossier temporaire)
// Bloc d'annonces AdMob du bandeau de l'appli Android (ca-app-pub-…/…), donné à l'appli par /__ping ; vide : bandeau de test de Google.
const ADMOB_RAW = (process.env.ADMOB_BANNER_ID || '').trim(), ADMOB_BANNER = /^ca-app-pub-\d+\/\d+$/.test(ADMOB_RAW) ? ADMOB_RAW : '';
// Adresse du site (manaorbit.app depuis le 12 octobre 2026) et anciennes adresses (hôte tel qu'envoyé par le navigateur, port compris). Sur une ancienne adresse :
// la page d'accueil devient une page de déménagement (les données de l'appareil suivent dans l'adresse : src/migrate.js), sw.js se désinstalle (une appli installée
// ne garde pas l'ancienne copie), /__mig dit au nouveau site qu'elle répond ; tout le reste est servi comme avant (ancienne APK, liens déjà partagés).
const SITE_URL = (process.env.SITE_URL || 'https://manaorbit.app').trim().replace(/\/+$/, '');
const OLD_HOSTS = String(process.env.OLD_HOSTS ?? 'card.m2s-photo.fr').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
// app-ads.txt (AdMob) : identifiant d'éditeur public pub-…, tiré de l'ID d'application Mana Orbit (le même que dans l'APK, public) ; ADMOB_PUB_ID ou ADMOB_APP_ID le remplacent.
const ADMOB_PUB = (/pub-\d{10,20}/.exec(String(process.env.ADMOB_PUB_ID || process.env.ADMOB_APP_ID || 'ca-app-pub-9859793504995886~7202291377')) || [''])[0];
// Android App Links (APK 1.0.5) : /.well-known/assetlinks.json déclare l'appli app.manaorbit pour ce site ; Android le vérifie à l'installation, puis ouvre
// les liens https://manaorbit.app/ (?p=, ?troc=…) dans l'appli. ASSETLINKS_SHA256 : empreintes SHA-256 des certificats qui signent l'appli (Play Console ›
// Test et publication › Intégrité de l'appli › Signature de l'application : clé de signature Play et clé d'importation), séparées par des virgules,
// avec ou sans « : ». Aucune empreinte valide : 404 (les liens restent dans le navigateur). Rien de secret : ces empreintes sont publiques.
// Empreintes de l'appli Play (Play Console › Intégrité de l'appli › Signature, relevées le 15 octobre 2026) : clé de signature de l'application (Google) et clé d'importation.
// Publiques par nature (servies telles quelles) ; ASSETLINKS_SHA256 les remplace si elle est définie, « 0 » coupe les App Links.
// Dernière appli Android publiée sur le Play Store (versionCode) : une coque plus ancienne affiche « Mise à jour de l'appli » au lancement (pwa.js › apkCheck).
// À monter quand la nouvelle version est en ligne (test fermé compris) ; APK_LATEST sur Hostinger la remplace sans redéployer le code. 0 : jamais.
const APK_LATEST = Math.max(0, Math.min(1e6, Math.floor(Number(process.env.APK_LATEST ?? 6)) || 0));      // 6 = 1.0.5 (en ligne le 15 octobre)
const ASSETLINKS_DEF = '96:57:5F:6F:FD:89:38:E5:FE:46:BD:72:3B:E0:94:E6:27:5C:10:26:B9:14:01:57:D3:37:70:91:B7:A5:8A:33,B2:5B:42:63:AE:39:5B:E7:17:E9:3A:CF:9F:F7:88:13:A8:06:5B:83:2B:5D:41:91:3C:6D:E9:4B:25:24:0D:93';
const ASSETLINKS_ENV = process.env.ASSETLINKS_SHA256 == null ? ASSETLINKS_DEF : String(process.env.ASSETLINKS_SHA256).trim() === '0' ? '' : String(process.env.ASSETLINKS_SHA256);
const ASSETLINKS_RAW = ASSETLINKS_ENV.split(',').map(x => x.trim()).filter(Boolean);
const ASSETLINKS_FP = [...new Set(ASSETLINKS_RAW.map(x => x.replace(/:/g, '').toUpperCase()).filter(x => /^[0-9A-F]{64}$/.test(x)).map(x => x.match(/../g).join(':')))];
const ASSETLINKS = ASSETLINKS_FP.length ? JSON.stringify([{ relation: ['delegate_permission/common.handle_all_urls'], target: { namespace: 'android_app', package_name: 'app.manaorbit', sha256_cert_fingerprints: ASSETLINKS_FP } }]) : '';
// Interrupteurs EDHREC / Archidekt (plan B de docs/a-faire.md : si l'un refuse, sa fonction est coupée depuis Hostinger, sans nouvelle APK), annoncés par /__ping (off) :
// EDHREC_OFF=1 : plus de fichier EDH (/edh.bin.gz, /edh.tsv : 410) ni d'import de liens edhrec.com ; l'appli cache les decks EDHREC et efface sa copie.
// ARCHIDEKT_OFF=1 : fichier EDH servi sans les decks Archidekt (edhFilter), plus d'import de liens archidekt.com ; l'appli les retire aussi de sa copie.
const OFF = ['edhrec', 'archidekt'].filter(x => /^(1|true|on|yes|oui)$/i.test(String(process.env[x.toUpperCase() + '_OFF'] || '').trim()));

// Fichiers PWA servis depuis ./pwa : correspondance EXACTE sur cette liste (aucun chemin n'est construit depuis l'URL → pas de traversée).
const YEAR = 'public, max-age=604800', NOCACHE = 'no-cache';
const STATIC = new Map([
  ['/manifest.webmanifest', ['manifest.webmanifest', 'application/manifest+json; charset=utf-8', NOCACHE]],
  ['/sw.js', ['sw.js', 'text/javascript; charset=utf-8', NOCACHE]],
  ['/icons/icon.svg', ['icons/icon.svg', 'image/svg+xml', YEAR]],
  ['/icons/icon-192.png', ['icons/icon-192.png', 'image/png', YEAR]],
  ['/icons/icon-512.png', ['icons/icon-512.png', 'image/png', YEAR]],
  ['/icons/maskable-512.png', ['icons/maskable-512.png', 'image/png', YEAR]],
  ['/icons/apple-touch-icon.png', ['icons/apple-touch-icon.png', 'image/png', YEAR]],
  ['/icons/favicon-32.png', ['icons/favicon-32.png', 'image/png', YEAR]],
  ['/edh.tsv', ['edh.tsv', 'text/tab-separated-values; charset=utf-8', 'public, max-age=86400', true]],                  // commandants EDHREC, decks moyens et prix (généré par gen-edhrec.mjs), gzip comme le catalogue français
  ['/edh.bin.gz', ['edh.bin.gz', 'application/octet-stream', 'public, max-age=86400', 'pre']],                          // même contenu en binaire compact (EDH2, déjà compressé par le générateur : envoyé tel quel avec Content-Encoding: gzip, ou décompressé si le client n'accepte pas gzip)
  ['/privacy', ['privacy.html', 'text/html; charset=utf-8', 'public, max-age=3600']],                                    // politique de confidentialité (lien de la fiche Google Play) et suppression de compte
  ['/privacy.html', ['privacy.html', 'text/html; charset=utf-8', 'public, max-age=3600']],
  ['/legal', ['legal.html', 'text/html; charset=utf-8', 'public, max-age=3600']],                                        // mentions légales (éditeur, hébergeur, propriété intellectuelle), reliées depuis /privacy et les Réglages
  ['/legal.html', ['legal.html', 'text/html; charset=utf-8', 'public, max-age=3600']],
  ['/mentions-legales', ['legal.html', 'text/html; charset=utf-8', 'public, max-age=3600']],
  ['/passer-de-manabox', ['passer-de-manabox.html', 'text/html; charset=utf-8', 'public, max-age=3600']],                // guide public « Passer de ManaBox » (référencé ; même contenu que la feuille de src/switch.js)
  ['/passer-de-manabox.html', ['passer-de-manabox.html', 'text/html; charset=utf-8', 'public, max-age=3600']],
  ['/testeurs', ['testeurs.html', 'text/html; charset=utf-8', 'public, max-age=600']],                                  // page « Deviens testeur » (lien en bio des réseaux) : en attendant le lien d'inscription du 19 octobre
  ['/testeurs.html', ['testeurs.html', 'text/html; charset=utf-8', 'public, max-age=600']],
  ['/prices.tsv', ['prices.tsv.gz', 'text/tab-separated-values; charset=utf-8', 'public, max-age=3600', 'pre', 'px']],          // prix « à partir de » (gen-prices.mjs, relu depuis GitHub) : servi seulement une fois récupéré
  ['/fr-names.tsv', ['fr-names.tsv', 'text/tab-separated-values; charset=utf-8', 'public, max-age=86400', true]],      // catalogue des noms de cartes en français (généré par gen-fr-names.mjs) ; 4e valeur : compressé en gzip si le client l'accepte
  ['/names-all.tsv', ['names-all.tsv', 'text/tab-separated-values; charset=utf-8', 'public, max-age=86400', true]],    // noms imprimés de toutes les langues, sans images (gen-names-all.mjs) : scan des autres langues sur l'appareil ; demandé par chaque scan en Wi-Fi (tous les 14 jours), donc compressé dès le démarrage
]);
// Catalogues des noms imprimés des autres langues (gen-fr-names.mjs --lang xx) : /names-<code Scryfall>.tsv, liste fermée (rien n'est construit depuis l'URL) ;
// /names-fr.tsv = fr-names.tsv. 'lazy' : compressés à la première demande seulement (≈ 5 Mo de mémoire par langue servie), pas au démarrage.
const NAME_LANGS = ['fr', 'de', 'es', 'it', 'pt', 'ja', 'zhs', 'zht', 'ko', 'ru'];
for (const l of NAME_LANGS) STATIC.set('/names-' + l + '.tsv', [l === 'fr' ? 'fr-names.tsv' : 'names-' + l + '.tsv', 'text/tab-separated-values; charset=utf-8', 'public, max-age=86400', l === 'fr' ? true : 'lazy']);

// ── Données EDHREC (edh.bin.gz) : le serveur récupère tout seul la dernière version générée par GitHub Actions (lundi et jeudi), sans redéploiement ──
// Au démarrage puis toutes les 6 h : lecture conditionnelle (ETag) du fichier du dépôt ; il n'est gardé que s'il est lisible (gzip + EDH2), assez fourni et plus récent
// que celui servi. Copie gardée en mémoire et dans .data/ (non versionné : ne gêne jamais un « git pull » de déploiement). Panne ou fichier douteux : on garde l'ancien.
const EDH_SRC = (process.env.EDH_SOURCE_URL === undefined ? 'https://raw.githubusercontent.com/BeerDeus/mtgcardshop/main/pwa/edh.bin.gz' : process.env.EDH_SOURCE_URL).trim();      // '' : désactivé
const EDH_EVERY = Number(process.env.EDH_SYNC_MS) || 6 * 3600000, EDH_FIRST = process.env.EDH_SYNC_FIRST_MS === undefined ? 5000 : Number(process.env.EDH_SYNC_FIRST_MS);
const EDH_DIR = process.env.EDH_DATA_DIR || join(here, '.data'), EDH_COPY = join(EDH_DIR, 'edh.bin.gz'), EDH_REPO = join(PWA, 'edh.bin.gz');
let EDHB = null; try { EDHB = createRequire(import.meta.url)('./edhbin.cjs'); } catch (e) { /* sans lecteur : contrôle minimal (gzip + EDH2) */ }
let EDH_LIVE = null;                         // { buf, at, decks, cmds } : copie plus récente que celle du dépôt, servie à la place
const EDH_ST = { from: 'none', at: '', decks: 0, cmds: 0, bytes: 0, check: '', err: '' };
let edhEtag = '', edhBusy = false;
/** Contrôle un fichier edh.bin.gz : { at, decks, cmds } ou lève une erreur. */
function edhInfo(buf) {
  const raw = gunzipSync(buf);
  if (raw.length < 12 || raw.toString('latin1', 0, 4) !== 'EDH2') throw new Error('pas un fichier EDH2');
  if (!EDHB) return { at: '', decks: 0, cmds: 0 };
  const u = EDHB.edhUnpack(raw); return { at: String(u.at || ''), decks: u.dk.length, cmds: u.cmds.length };
}
/** Fichier EDH servi sans les decks Archidekt (ARCHIDEKT_OFF) : recalculé seulement quand le fichier change (empreinte). Illisible : refusé plutôt que servi tel quel. */
let EDH_NOARCH = { key: '', buf: null };
function edhNoArchidekt(data) {
  const key = sha1Of(data); if (EDH_NOARCH.key === key) return EDH_NOARCH.buf;
  const out = EDHB.edhFilter(gunzipSync(data), m => m[1] !== 'archidekt'), buf = gzipSync(out, { level: 9 });
  EDH_NOARCH = { key, buf }; return buf;
}
/** Relecture ratée (réseau pas encore prêt juste après un redéploiement, GitHub injoignable) : nouvel essai 1, 2, 4… min (1 h au plus)
 *  au lieu d'attendre le passage suivant (6 h, prix absents d'ici là). Remis à zéro au premier succès. SYNC_RETRY_MS : base (tests). */
const SYNC_RETRY_MS = Number(process.env.SYNC_RETRY_MS) || 60000, SYNC_RT = { px: { n: 0, t: null }, edh: { n: 0, t: null } };
function syncRetry(k, fn) { const r = SYNC_RT[k]; if (r.t) return; r.t = setTimeout(() => { r.t = null; fn(); }, Math.min(60, 2 ** r.n++) * SYNC_RETRY_MS); r.t.unref(); }
const syncOk = k => { const r = SYNC_RT[k]; r.n = 0; if (r.t) { clearTimeout(r.t); r.t = null; } };
async function edhLocal(f) { try { const buf = await readFile(f); return { buf, ...edhInfo(buf) }; } catch (e) { return null; } }
async function edhBoot() {
  const [repo, copy] = await Promise.all([edhLocal(EDH_REPO), edhLocal(EDH_COPY)]), best = copy && (!repo || copy.at > repo.at) ? copy : null;
  if (best) { EDH_LIVE = best; Object.assign(EDH_ST, { from: 'copie', at: best.at, decks: best.decks, cmds: best.cmds, bytes: best.buf.length }); }
  else if (repo) Object.assign(EDH_ST, { from: 'dépôt', at: repo.at, decks: repo.decks, cmds: repo.cmds, bytes: repo.buf.length });
}
async function edhSync() {
  if (!EDH_SRC || edhBusy) return; edhBusy = true; EDH_ST.check = new Date().toISOString();
  let got = false;      // GitHub a répondu : un fichier refusé ensuite n'est pas une panne à réessayer tout de suite
  try {
    const r = await fetch(EDH_SRC, { headers: { 'User-Agent': 'deckdeal-proxy', ...(edhEtag ? { 'If-None-Match': edhEtag } : {}) }, signal: AbortSignal.timeout(90000) });
    if (r.status === 304) { EDH_ST.err = ''; syncOk('edh'); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    got = true; syncOk('edh');
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 40e6) throw new Error('fichier trop gros');
    const m = edhInfo(buf);
    if (EDHB && (m.decks < 50 || m.cmds < 100)) throw new Error(`fichier trop maigre (${m.decks} decks, ${m.cmds} commandants) : ignoré`);
    if (EDH_ST.decks && m.decks < EDH_ST.decks / 2) throw new Error(`${m.decks} decks contre ${EDH_ST.decks} servis : ignoré`);
    edhEtag = r.headers.get('etag') || ''; EDH_ST.err = '';
    if (EDH_ST.at && m.at && m.at <= EDH_ST.at) return;                       // déjà à jour
    EDH_LIVE = { buf, ...m }; Object.assign(EDH_ST, { from: 'GitHub', at: m.at, decks: m.decks, cmds: m.cmds, bytes: buf.length });
    console.log(`EDH : données du ${m.at} récupérées (${m.decks} decks, ${m.cmds} commandants, ${(buf.length / 1048576).toFixed(2)} Mo)`);
    try { await mkdir(EDH_DIR, { recursive: true }); await writeFile(EDH_COPY + '.tmp', buf); await rename(EDH_COPY + '.tmp', EDH_COPY); } catch (e) { /* dossier en lecture seule : la copie en mémoire suffit jusqu'au redémarrage */ }
  } catch (e) { EDH_ST.err = String(e && e.message || e); console.warn('EDH : mise à jour impossible (' + EDH_ST.err + ')'); if (!got) syncRetry('edh', edhSync); }
  finally { edhBusy = false; }
}

// ── Prix « à partir de » de chaque carte (prices.tsv.gz, tendance Cardmarket / TCGplayer) : générés chaque jour par GitHub Actions (branche data),
// relus ici toutes les 6 h comme les données EDHREC. L'app s'en sert quand l'utilisateur n'a pas de token CardTrader. Absent : l'app interroge Scryfall elle-même.
const PX_SRC = (process.env.PRICES_SOURCE_URL === undefined ? 'https://raw.githubusercontent.com/BeerDeus/mtgcardshop/data/prices.tsv.gz' : process.env.PRICES_SOURCE_URL).trim();      // '' : désactivé
const PX_COPY = join(EDH_DIR, 'prices.tsv.gz');
let PX_LIVE = null, pxEtag = '', pxBusy = false;
const PX_ST = { at: '', cards: 0, bytes: 0, check: '', err: '' };
/** Contrôle un fichier prices.tsv.gz : { at, cards } ou lève une erreur. */
function pxInfo(buf) {
  const raw = gunzipSync(buf), head = raw.toString('utf8', 0, Math.min(raw.length, 120)).split('\n')[0], m = /^#MOPX1 (\S+) (\d+)$/.exec(head);
  if (!m) throw new Error('pas un fichier de prix');
  return { at: m[1], cards: Number(m[2]) };
}
async function pxBoot() { try { const buf = await readFile(PX_COPY), m = pxInfo(buf); PX_LIVE = { buf, ...m }; Object.assign(PX_ST, { at: m.at, cards: m.cards, bytes: buf.length }); } catch (e) { /* pas encore de copie */ } }
async function pxSync() {
  if (!PX_SRC || pxBusy) return; pxBusy = true; PX_ST.check = new Date().toISOString();
  let got = false;
  try {
    const r = await fetch(PX_SRC, { headers: { 'User-Agent': 'manaorbit-proxy', ...(pxEtag ? { 'If-None-Match': pxEtag } : {}) }, signal: AbortSignal.timeout(90000) });
    if (r.status === 304) { PX_ST.err = ''; syncOk('px'); return; }
    if (!r.ok) throw new Error('HTTP ' + r.status);
    got = true; syncOk('px');
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 20e6) throw new Error('fichier trop gros');
    const m = pxInfo(buf);
    if (m.cards < 15000) throw new Error(`seulement ${m.cards} cartes : ignoré`);
    pxEtag = r.headers.get('etag') || ''; PX_ST.err = '';
    if (PX_ST.at && m.at <= PX_ST.at) return;
    PX_LIVE = { buf, ...m }; Object.assign(PX_ST, { at: m.at, cards: m.cards, bytes: buf.length });
    console.log(`Prix : relevé du ${m.at} (${m.cards} cartes, ${(buf.length / 1024).toFixed(0)} Ko)`);
    try { await mkdir(EDH_DIR, { recursive: true }); await writeFile(PX_COPY + '.tmp', buf); await rename(PX_COPY + '.tmp', PX_COPY); } catch (e) { /* lecture seule : la copie en mémoire suffit */ }
  } catch (e) { PX_ST.err = String(e && e.message || e); console.warn('Prix : mise à jour impossible (' + PX_ST.err + ')'); if (!got) syncRetry('px', pxSync); }
  finally { pxBusy = false; }
}

// Accès par compte Firebase : le navigateur envoie son jeton d'identité (X-Firebase-Token), le proxy en vérifie la signature Google
// puis compare l'UID (ou l'email vérifié) à la liste autorisée. Rien à retaper, rien à partager.
const csv = v => String(v || '').split(/[\s,;]+/).map(x => x.trim()).filter(Boolean);
const FB_PROJECT = (process.env.FIREBASE_PROJECT_ID || 'm2s-mtg').trim();
const ALLOWED_UIDS = new Set(csv(process.env.ALLOWED_UIDS));
const ALLOWED_EMAILS = new Set(csv(process.env.ALLOWED_EMAILS).map(x => x.toLowerCase()));
const AUTH_FB = ALLOWED_UIDS.size + ALLOWED_EMAILS.size > 0;
const JWKS_URL = process.env.FIREBASE_JWKS_URL || 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com'; // surchargeable pour les tests

const LOOPBACK = new Set(['127.0.0.1', '::1', 'localhost']);
// Serveur local (lié à la boucle locale) : seuls ces noms d'hôte sont servis, contre le « DNS rebinding » (une page piégée qui se fait passer pour localhost).
const LOCAL = LOOPBACK.has(HOST), LOCAL_HOSTS = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i;
if (TOKEN && !LOOPBACK.has(HOST) && !APP_KEY && !AUTH_FB) {
  console.error('Refus de démarrer : HOST=' + HOST + ' expose ton token CardTrader. Définis ALLOWED_UIDS=<ton uid Firebase> (recommandé) ou APP_KEY=un-secret.');
  process.exit(1);
}

// Routes relayées : méthode → chemins autorisés. Tout le reste (dont cart/purchase) répond 403.
const ALLOW = {
  GET: new Set(['info', 'expansions', 'blueprints/export', 'marketplace/products', 'cart', 'shipping_methods']),
  POST: new Set(['cart/add', 'cart/remove']),
};

// Cache mémoire des catalogues (lourds, quasi statiques).
const CACHE_TTL = 6 * 3600 * 1000;
const CACHE_MAX = (Number(process.env.CACHE_MAX_MB) || 48) * 1024 * 1024; // plafond mémoire : évite qu'un hébergeur tue le process
const cache = new Map(); let cacheBytes = 0;
function cacheSet(k, body) {
  if (body.length > CACHE_MAX) return;
  const old = cache.get(k); if (old) cacheBytes -= old.body.length;
  cache.delete(k); cache.set(k, { t: Date.now(), body }); cacheBytes += body.length;
  for (const [kk, v] of cache) { if (cacheBytes <= CACHE_MAX) break; cache.delete(kk); cacheBytes -= v.body.length; } // plus ancien d'abord
}

// Concurrence vers CardTrader plafonnée : protège ton token d'un pic de requêtes (plusieurs onglets, boucle…).
const UP_CONC = Number(process.env.UP_CONC) || 12, UP_QUEUE_MAX = 200;
let upActive = 0; const upQueue = [];
const upGate = () => upActive < UP_CONC ? (upActive++, Promise.resolve()) : new Promise(r => upQueue.push(r));
const upDone = () => { const n = upQueue.shift(); if (n) n(); else upActive--; };

/* ── Recherche d'offres en tâche de fond ─────────────────────────────────────────────────────────
   Le navigateur envoie la liste des blueprints ; le serveur les interroge à cadence constante (la limite CardTrader est de
   10 requêtes/s sur marketplace/products) et le navigateur relève les résultats. Si l'appli est quittée ou mise en veille,
   la boucle continue ici ; la même recherche relancée se rattache à la tâche en cours ou lit le cache.
   Cache : offres 10 min, absences d'offres 3 h (un blueprint sans offre française l'est rarement une heure plus tard). */
const JOBS_ON = process.env.JOBS !== '0';
const JOB_RATE = Math.min(9.6, Math.max(1, Number(process.env.JOB_RATE) || 9));
const JOB_CONC = 4, JOB_MAX_RUNNING = Number(process.env.JOB_MAX_RUNNING) || 8, JOB_MAX_KEPT = 4 * JOB_MAX_RUNNING, JOB_MAX_BPS = 3000, JOB_PAGE = 300, JOB_MAX_GROUPS = 40;      // groupes : langue × foil (11 × 3 au plus)
const JOB_KEEP = Number(process.env.JOB_KEEP_MS ?? 15 * 60e3);
const OFFER_TTL = Number(process.env.OFFER_TTL_MS ?? 10 * 60e3), OFFER_TTL_EMPTY = Number(process.env.OFFER_TTL_EMPTY_MS ?? 3 * 3600e3);
const OFFERS_MAX = (Number(process.env.OFFERS_CACHE_MB) || 40) * 1024 * 1024;
// Token d'un utilisateur : 2 recherches en cours au plus (les places de JOB_MAX_RUNNING restent aux autres) ; résultats gardés par toutes les tâches : plafond mémoire.
const JOB_PER_TOKEN = Number(process.env.JOB_MAX_PER_TOKEN) || 2, JOB_RES_MAX = (Number(process.env.JOB_RESULTS_MB) || 64) * 1024 * 1024;
const sleepMs = ms => new Promise(r => setTimeout(r, ms));
/** Empreinte d'un token CardTrader : seule forme gardée en mémoire au-delà d'une requête ou d'une recherche (jamais le token lui-même). */
const tokHash = t => createHash('sha256').update(String(t)).digest('base64url').slice(0, 22);

// Cadence des requêtes marketplace/products (tâches de fond ET relais direct) : un budget par token, la limite CardTrader étant propre à chaque compte.
// Clé : empreinte du token ; une entrée inactive depuis 60 s est oubliée à la création suivante.
const PACE = new Map();
const paceOf = tok => {
  const k = tokHash(tok); let p = PACE.get(k);
  if (!p) { const old = Date.now() - 60e3; for (const [kk, v] of PACE) if (v.at < old) PACE.delete(kk); p = { at: 0, slow: 0 }; PACE.set(k, p); }
  return p;
};
async function pace(tok = TOKEN) {
  const p = paceOf(tok), rate = p.slow > 0 ? Math.max(3, JOB_RATE * 0.6) : JOB_RATE; if (p.slow > 0) p.slow--;
  const now = Date.now(), at = Math.max(now, p.at); p.at = at + 1000 / rate;
  if (at > now) await sleepMs(at - now);
}
const throttle = (tok, ms) => { const p = paceOf(tok); p.slow = 40; p.at = Math.max(p.at, Date.now() + ms); };   // 429 : pause puis cadence réduite pendant 40 requêtes
/** Token CardTrader de l'utilisateur (en-tête X-CT-Token) : il cherche avec son propre compte, sans passer par le token du serveur. '' sinon. */
const userTok = req => { const t = String(req.headers['x-ct-token'] || '').trim(); return /^[A-Za-z0-9._~+/=-]{20,4096}$/.test(t) ? t : ''; };
// Token utilisateur que CardTrader a déjà accepté (une réponse 2xx depuis moins de 6 h) : lui seul lit les caches partagés (catalogues, offres),
// remplis avec d'autres tokens ; un token inventé n'obtient que la réponse de CardTrader. Empreintes seulement, 5 000 au plus (les plus anciennes sortent).
const CT_OK = new Map();
const tokOk = th => !th || (CT_OK.get(th) || 0) > Date.now() - CACHE_TTL;
function tokSeen(th) {
  if (!th) return;
  CT_OK.delete(th); while (CT_OK.size >= 5000) CT_OK.delete(CT_OK.keys().next().value);
  CT_OK.set(th, Date.now());
}

const offers = new Map(); let offersBytes = 0;
const okey = (bp, lang, foil) => bp + '|' + lang + '|' + foil;
function offersGet(k) {
  const e = offers.get(k); if (!e) return null;
  if (Date.now() - e.t > (e.products.length ? OFFER_TTL : OFFER_TTL_EMPTY)) { offers.delete(k); offersBytes -= e.size; return null; }
  return e;
}
/** Met en cache les offres d'un blueprint ; retourne leur taille (octets environ), comptée aussi dans le plafond des résultats de tâches. */
function offersSet(k, products) {
  const size = 96 + JSON.stringify(products).length;
  if (!(products.length ? OFFER_TTL : OFFER_TTL_EMPTY)) return size;
  const old = offers.get(k); if (old) offersBytes -= old.size;
  offers.delete(k); offers.set(k, { t: Date.now(), products, size }); offersBytes += size;
  for (const [kk, v] of offers) { if (offersBytes <= OFFERS_MAX) break; offers.delete(kk); offersBytes -= v.size; }
  return size;
}
// On ne garde que les champs lus par l'application (3× plus léger en mémoire et sur le réseau).
const pick = (o, keys) => o && Object.fromEntries(keys.filter(k => o[k] !== undefined).map(k => [k, o[k]]));
const slim = p => ({ id: p.id, blueprint_id: p.blueprint_id, quantity: p.quantity, graded: p.graded, on_vacation: p.on_vacation, bundle_size: p.bundle_size,
  price: pick(p.price, ['cents', 'currency']), expansion: pick(p.expansion, ['code', 'name_en']),
  properties_hash: pick(p.properties_hash, ['condition', 'mtg_language', 'mtg_foil', 'signed', 'altered', 'collector_number']),
  user: pick(p.user, ['id', 'username', 'country_code', 'can_sell_via_hub', 'user_type']) });

const cancelled = () => Object.assign(new Error('cancelled'), { cancelled: true });
async function fetchProducts(bp, lang, foil, signal, tok = TOKEN) {
  const qs = new URLSearchParams({ blueprint_id: String(bp) }); if (lang) qs.set('language', lang);
  if (foil === 'no') qs.set('foil', 'false'); else if (foil === 'yes') qs.set('foil', 'true');
  const url = UPSTREAM + 'marketplace/products?' + qs, soft = m => Object.assign(new Error(m), { soft: true });
  for (let a = 0; ; a++) {
    if (signal.aborted) throw cancelled();
    await pace(tok); await upGate();
    if (signal.aborted) { upDone(); throw cancelled(); }
    const ctl = new AbortController(), onAbort = () => ctl.abort(), timer = setTimeout(() => ctl.abort(), 30000);
    signal.addEventListener('abort', onAbort, { once: true });
    let r, text;
    try { r = await fetch(url, { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, signal: ctl.signal }); text = await r.text(); }
    catch (e) { if (signal.aborted) throw cancelled(); if (a < 3) { await sleepMs(800 * (a + 1)); continue; } throw soft('upstream_unreachable'); }
    finally { clearTimeout(timer); signal.removeEventListener('abort', onAbort); upDone(); }
    if (r.status === 429 || r.status >= 500) {
      if (r.status === 429) throttle(tok, Number(r.headers.get('retry-after')) * 1000 || 1100);
      if (a < 4) { await sleepMs(r.status === 429 ? 0 : 700 * (a + 1)); continue; }
      throw soft('upstream_' + r.status);
    }
    if (r.status === 401 || r.status === 403) throw Object.assign(new Error('upstream_auth'), { fatal: r.status });
    if (!r.ok) throw soft('upstream_' + r.status);
    let j; try { j = JSON.parse(text); } catch (e) { throw soft('upstream_bad_json'); }
    return (Array.isArray(j) ? j : Object.values(j || {}).flat()).filter(Boolean).map(slim);
  }
}


/* ── Notifications push « recherche terminée » (Web Push : RFC 8030 · 8291 · 8292), sans dépendance ─────────────────────
   Le navigateur envoie son abonnement avec la recherche ; si plus personne ne relève la tâche à sa fin, le serveur pousse une
   notification chiffrée. Rien n'est stocké : l'abonnement vit avec la tâche (15 min) puis disparaît. */
const VAPID_PUB = (process.env.VAPID_PUBLIC_KEY || '').trim(), VAPID_PRIV = (process.env.VAPID_PRIVATE_KEY || '').trim(), VAPID_SUB = (process.env.VAPID_SUBJECT || '').trim();
const PUSH_GRACE = Number(process.env.PUSH_GRACE_MS ?? 4000);
const PUSH_HOSTS = [/(^|\.)fcm\.googleapis\.com$/, /(^|\.)android\.googleapis\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /(^|\.)notify\.windows\.com$/, /(^|\.)push\.apple\.com$/];
const PUSH_EXTRA = new Set(csv(process.env.PUSH_ALLOW_HOSTS));        // tests uniquement : « 127.0.0.1:9999 »
let vapidKey = null;
if (VAPID_PUB || VAPID_PRIV || VAPID_SUB) {
  try {
    const pub = Buffer.from(VAPID_PUB, 'base64url');
    if (pub.length !== 65 || pub[0] !== 4) throw new Error('VAPID_PUBLIC_KEY illisible (65 octets en base64url attendus)');
    if (!/^(mailto:[^\s@]+@[^\s@]+\.[^\s@]+|https:\/\/[^\s]+)$/.test(VAPID_SUB)) throw new Error('VAPID_SUBJECT doit être « mailto:toi@exemple.fr » ou une adresse https://');
    const chk = createECDH('prime256v1'); chk.setPrivateKey(Buffer.from(VAPID_PRIV, 'base64url'));
    if (!chk.getPublicKey().equals(pub)) throw new Error('VAPID_PRIVATE_KEY ne correspond pas à VAPID_PUBLIC_KEY');
    vapidKey = createPrivateKey({ key: { kty: 'EC', crv: 'P-256', x: pub.subarray(1, 33).toString('base64url'), y: pub.subarray(33).toString('base64url'), d: VAPID_PRIV }, format: 'jwk' });
  } catch (e) { console.error('Notifications désactivées : ' + e.message); vapidKey = null; }
}
const PUSH_ON = !!vapidKey;
const jwtCache = new Map();
function vapidAuth(aud) {
  const now = Math.floor(Date.now() / 1000), c = jwtCache.get(aud);
  if (c && c.exp - now > 3600) return c.h;
  const exp = now + 12 * 3600, enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = enc({ typ: 'JWT', alg: 'ES256' }) + '.' + enc({ aud, exp, sub: VAPID_SUB });
  const sig = dsaSign('sha256', Buffer.from(unsigned), { key: vapidKey, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  const h = `vapid t=${unsigned}.${sig}, k=${VAPID_PUB}`; jwtCache.set(aud, { exp, h }); return h;
}
/** Chiffrement du message (aes128gcm, RFC 8291) pour l'abonnement {p256dh, auth}. */
function encryptPush(payload, p256dh, auth) {
  const ua = Buffer.from(p256dh, 'base64url'), au = Buffer.from(auth, 'base64url');
  const ecdh = createECDH('prime256v1'); ecdh.generateKeys();
  const asPub = ecdh.getPublicKey(), secret = ecdh.computeSecret(ua), salt = randomBytes(16);
  const ikm = Buffer.from(hkdfSync('sha256', secret, au, Buffer.concat([Buffer.from('WebPush: info\0'), ua, asPub]), 32));
  const cek = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: aes128gcm\0'), 16));
  const nonce = Buffer.from(hkdfSync('sha256', ikm, salt, Buffer.from('Content-Encoding: nonce\0'), 12));
  const gcm = createCipheriv('aes-128-gcm', cek, nonce);
  const ct = Buffer.concat([gcm.update(Buffer.concat([payload, Buffer.from([2])])), gcm.final(), gcm.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, ct]);
}
function pushEndpointOk(s) {
  if (typeof s !== 'string' || s.length > 700) return false;
  let u; try { u = new URL(s); } catch (e) { return false; }
  if (u.username || u.password) return false;
  if (PUSH_EXTRA.has(u.host)) return u.protocol === 'http:' || u.protocol === 'https:';
  return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some(re => re.test(u.hostname));
}
/** Cible reçue → forme sûre, ou null : abonnement Web Push du navigateur, ou { fcm: jeton } de l'appli Android (chacun seulement si son service est configuré). */
function parseTarget(s) {
  if (!s || typeof s !== 'object') return null;
  if ('fcm' in s) return FCM_ON && typeof s.fcm === 'string' && FCM_TOKEN_RE.test(s.fcm) ? { fcm: s.fcm } : null;
  const k = s.keys;
  if (!PUSH_ON || !pushEndpointOk(s.endpoint) || !k || typeof k.p256dh !== 'string' || typeof k.auth !== 'string') return null;
  if (!/^[A-Za-z0-9_-]{80,100}$/.test(k.p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(k.auth)) return null;
  const ua = Buffer.from(k.p256dh, 'base64url');
  if (ua.length !== 65 || ua[0] !== 4) return null;
  try { const e = createECDH('prime256v1'); e.generateKeys(); e.computeSecret(ua); } catch (e) { return null; }   // point hors courbe
  return { endpoint: s.endpoint, keys: { p256dh: k.p256dh, auth: k.auth } };
}
/** Clé d'une cible : dédoublonnage des notifications d'une tâche, identifiant d'un appareil abonné aux alertes. */
const pushKey = s => s.fcm ? 'fcm:' + s.fcm : s.endpoint;
/** Abonnement (ou jeton FCM) + texte reçus de l'appli → forme sûre, ou null (la recherche part quand même, sans notification). */
function parsePush(p) {
  if (!p || typeof p !== 'object') return null;
  const sub = parseTarget(p.sub); if (!sub) return null;
  const str = (v, n, d) => typeof v === 'string' && v.trim() ? v.replace(/[\u0000-\u001f]/g, ' ').slice(0, n) : d;
  const url = typeof p.url === 'string' && /^\.\/(\?[\w=&.%-]{0,60})?$/.test(p.url) ? p.url : './?resume=1';
  return { sub, title: str(p.title, 80, 'Recherche terminée'), body: str(p.body, 200, 'Les offres sont prêtes.'), url };
}
/** Envoi vers la cible : statut HTTP (404 / 410 = cible périmée, à retirer), 0 si le service est injoignable ou n'est plus configuré. */
async function sendPush(p) {
  if (p.sub.fcm) return FCM_ON ? sendFcm(p) : 0;
  if (!PUSH_ON) return 0;                                            // abonnement enregistré avant le retrait des clés VAPID : gardé, pas envoyé
  const u = new URL(p.sub.endpoint), body = encryptPush(Buffer.from(JSON.stringify({ title: p.title, body: p.body, url: p.url, ...(p.kind ? { kind: p.kind } : {}), ...(p.tag ? { tag: p.tag } : {}) })), p.sub.keys.p256dh, p.sub.keys.auth);      // tag : une notification du même sujet remplace la précédente (sw.js)
  for (let a = 0; a < 2; a++) {
    let r;
    try {
      r = await fetch(u, { method: 'POST', body, signal: AbortSignal.timeout(10000), redirect: 'manual',
        headers: { Authorization: vapidAuth(u.origin), 'Content-Encoding': 'aes128gcm', 'Content-Type': 'application/octet-stream', TTL: String(p.ttl || 3600), Urgency: p.urgency || 'high', Topic: p.topic || 'deckdeal-run' } });
    } catch (e) { if (a === 0) { await sleepMs(1500); continue; } return 0; }
    if ((r.status === 429 || r.status >= 500) && a === 0) { await sleepMs(Math.min(5000, Number(r.headers.get('retry-after')) * 1000 || 1500)); continue; }
    return r.status;
  }
  return 0;
}

/* ── Notifications dans l'appli Android (Firebase Cloud Messaging, API HTTP v1), sans dépendance ─────────────────────────
   La WebView de l'appli n'a pas Web Push : l'appli envoie son jeton FCM ({ fcm }) partout où le navigateur envoie son abonnement.
   Compte de service Firebase (FCM_SERVICE_ACCOUNT : le JSON, ou ce JSON en base64 ; ou FCM_SERVICE_ACCOUNT_FILE : son chemin) →
   jeton d'accès OAuth2 (assertion JWT RS256 signée avec sa clé privée, gardé jusqu'à 5 min de son expiration) → POST messages:send.
   Jeton d'appareil refusé (UNREGISTERED, NOT_FOUND, jeton invalide) : statut 404, la cible est retirée comme un abonnement expiré. */
const FCM_BASE = (process.env.FCM_BASE_URL || 'https://fcm.googleapis.com').replace(/\/+$/, '');          // surchargeable pour les tests
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_TOKEN_RE = /^[A-Za-z0-9:_-]{100,4096}$/;
let fcmSa = null;
{
  const raw = (process.env.FCM_SERVICE_ACCOUNT || '').replace(/^\uFEFF/, '').trim(), file = (process.env.FCM_SERVICE_ACCOUNT_FILE || '').trim();
  if (raw || file) {
    const src = raw ? 'FCM_SERVICE_ACCOUNT' : 'FCM_SERVICE_ACCOUNT_FILE';
    try {
      let txt;
      try { txt = raw ? (raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')) : readFileSync(file, 'utf8'); } catch (e) { throw new Error(src + ' : fichier illisible (' + e.message + ')'); }
      let j; try { j = JSON.parse(txt.replace(/^\uFEFF/, '')); } catch (e) { throw new Error(src + ' illisible : colle le JSON du compte de service (sur une ligne) ou ce JSON encodé en base64'); }
      if (!j || typeof j.client_email !== 'string' || typeof j.private_key !== 'string' || typeof j.project_id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(j.project_id)) throw new Error(src + ' : compte de service incomplet (project_id, client_email et private_key attendus)');
      let key; try { key = createPrivateKey(j.private_key.replace(/\\n/g, '\n')); } catch (e) { throw new Error(src + ' : private_key illisible'); }
      if (key.asymmetricKeyType !== 'rsa') throw new Error(src + ' : private_key doit être une clé RSA');
      const tokenUrl = String(process.env.FCM_TOKEN_URL || j.token_uri || 'https://oauth2.googleapis.com/token').trim();
      if (!/^https?:\/\/[^\s/]+\//.test(tokenUrl)) throw new Error(src + ' : token_uri invalide');
      fcmSa = { email: j.client_email, project: j.project_id, key, tokenUrl };
    } catch (e) { console.error('Notifications de l\'appli (FCM) désactivées : ' + e.message); fcmSa = null; }
  }
}
const FCM_ON = !!fcmSa;
const fcmAuth = new Map();      // portée OAuth → { tok, exp, run } : FCM, et Firestore pour les decks publics
/** Assertion JWT signée (RS256), échangée contre un jeton d'accès (OAuth2, RFC 7523). */
function fcmJwt(scope) {
  const now = Math.floor(Date.now() / 1000), enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = enc({ alg: 'RS256', typ: 'JWT' }) + '.' + enc({ iss: fcmSa.email, scope, aud: fcmSa.tokenUrl, iat: now, exp: now + 3600 });
  return unsigned + '.' + dsaSign('sha256', Buffer.from(unsigned), fcmSa.key).toString('base64url');
}
/** Jeton d'accès du compte de service pour cette portée (FCM par défaut), gardé jusqu'à 5 min de son expiration ; une seule demande à la fois. */
function fcmAccess(scope = FCM_SCOPE) {
  let a = fcmAuth.get(scope); if (!a) fcmAuth.set(scope, a = { tok: '', exp: 0, run: null });
  if (a.tok && Date.now() < a.exp - 300e3) return Promise.resolve(a.tok);
  if (!a.run) a.run = (async () => {
    const r = await fetch(fcmSa.tokenUrl, { method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: fcmJwt(scope) }).toString() });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || typeof j.access_token !== 'string' || !j.access_token) throw new Error('jeton d\'accès refusé (' + r.status + (j && j.error ? ' ' + String(j.error).slice(0, 60) : '') + ')');
    a.tok = j.access_token; a.exp = Date.now() + (Number(j.expires_in) > 0 ? Number(j.expires_in) : 3600) * 1000;
    return a.tok;
  })().finally(() => { a.run = null; });
  return a.run;
}
/** Jeton d'appareil à oublier : appli désinstallée, jeton renouvelé, autre projet Firebase, jeton mal formé. */
function fcmGone(status, e) {
  const det = Array.isArray(e && e.details) ? e.details : [], code = (det.find(d => d && d.errorCode) || {}).errorCode || (e && e.status) || '';
  if (status === 404 || code === 'UNREGISTERED' || code === 'NOT_FOUND' || code === 'SENDER_ID_MISMATCH') return true;
  return code === 'INVALID_ARGUMENT' && (/registration token/i.test(String(e && e.message || '')) || det.some(d => d && Array.isArray(d.fieldViolations) && d.fieldViolations.some(f => f && f.field === 'message.token')));
}
async function sendFcm(p) {
  const body = JSON.stringify({ message: { token: p.sub.fcm, notification: { title: p.title, body: p.body }, data: { url: p.url },
    android: { priority: 'HIGH', ttl: (p.ttl || 3600) + 's', collapse_key: p.topic || 'deckdeal-run', ...(p.tag ? { notification: { tag: p.tag } } : {}) } } });   // ttl et collapse_key : équivalents des en-têtes TTL et Topic de Web Push ; tag : remplace la notification du même sujet
  for (let a = 0; a < 2; a++) {
    let tok, r;
    try { tok = await fcmAccess(); } catch (e) { console.warn('FCM : ' + e.message); return 0; }
    try {
      r = await fetch(`${FCM_BASE}/v1/projects/${fcmSa.project}/messages:send`, { method: 'POST', body, signal: AbortSignal.timeout(10000), redirect: 'manual',
        headers: { Authorization: 'Bearer ' + tok, 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json' } });
    } catch (e) { if (a === 0) { await sleepMs(1500); continue; } return 0; }
    if (r.ok) { await r.arrayBuffer().catch(() => {}); return r.status; }
    const e = ((await r.json().catch(() => null)) || {}).error;
    if (fcmGone(r.status, e)) return 404;
    if (r.status === 401 && a === 0) { fcmAuth.get(FCM_SCOPE).tok = ''; continue; }                // jeton d'accès révoqué ou expiré : un nouveau, un seul essai
    if ((r.status === 429 || r.status >= 500) && a === 0) { await sleepMs(Math.min(5000, Number(r.headers.get('retry-after')) * 1000 || 1500)); continue; }
    console.warn('FCM : ' + r.status + (e && e.message ? ' ' + String(e.message).slice(0, 120) : ''));
    return r.status;
  }
  return 0;
}

/** Fin de tâche : si personne n'a relevé l'état final dans le délai de grâce (appli quittée, téléphone en veille), on prévient. */
function pushWhenDone(job) {
  if (!(PUSH_ON || FCM_ON) || job.status !== 'done' || !job.pushes.length) return;
  setTimeout(async () => {
    if (job.seenEnd) return;
    for (const p of job.pushes.splice(0)) {
      const st = await sendPush(p), via = p.sub.fcm ? ' FCM' : '';
      if (st && st < 300) console.log('push' + via + ' envoyé (' + st + ')'); else console.warn('push' + via + ' refusé (' + (st || 'réseau') + ')' + (st === 404 || st === 410 ? ' : abonnement expiré' : ''));
    }
  }, PUSH_GRACE).unref();
}

/* ── Alertes de prix (Web Push, ou FCM dans l'appli Android) ───────────────────────────────────────────────────────────
   L'appli enregistre ici, avec son abonnement push (ou son jeton FCM), la liste des cartes à surveiller (cartes manquantes de tes decks enregistrés,
   cartes suivies à la main, avec ou sans prix cible). Toutes les 6 h le serveur relit le prix tendance Cardmarket (champ `eur` de
   Scryfall, lots de 75 noms) et pousse une notification quand une carte :
   · chute d'au moins `thr` % (30 par défaut) ET d'au moins 0,50 € sous sa valeur habituelle (médiane des relevés précédents) ;
   · passe sous le prix cible fixé à la main.
   Une carte déjà signalée n'est plus signalée pendant 5 jours, sauf nouvelle chute de 15 % ou plus. Un seul message par appareil et par
   passage (plusieurs cartes = un résumé). Stocké dans .data/alerts.json (abonnements, listes, relevés), écriture atomique ; un
   abonnement refusé par le service de push (404 / 410, jeton FCM périmé) est retiré. Le serveur doit tourner en continu pour que les passages aient lieu.
   Route publique, donc bornée : enregistrements et contrôles à la demande comptés par IP, 10 appareils par IP, 64 Ko par liste, cartes au total plafonnées ;
   serveur plein : un nouvel appareil est refusé (507), jamais un abonné évincé (seulement un enregistrement sans prix ni notification réussie).
   « Vérifier les prix » ne relève que les cartes de cet appareil ; un relevé par carte et par heure au plus (sinon il remplace le dernier). */
const ALERTS_ON = (PUSH_ON || FCM_ON) && process.env.ALERTS !== '0';
const SCRY_UP = (process.env.SCRYFALL_UPSTREAM || 'https://api.scryfall.com').replace(/\/+$/, '');            // surchargeable pour les tests
const AL_EVERY = Number(process.env.ALERT_EVERY_MS) || 6 * 3600e3;
const AL_FIRST = process.env.ALERT_FIRST_MS === undefined ? 90e3 : Number(process.env.ALERT_FIRST_MS);
const AL_FILE = process.env.ALERT_FILE || join(EDH_DIR, 'alerts.json');
const AL_SEED = Number(process.env.ALERT_SEED_MS ?? 2500);
const AL_MIN_DROP = Number(process.env.ALERT_MIN_DROP_CENTS) || 50, AL_COOL = Number(process.env.ALERT_COOLDOWN_MS ?? 5 * 86400e3), AL_CHECK_GAP = Number(process.env.ALERT_CHECK_GAP_MS ?? 90e3);
const AL_MAX_ITEMS = 400, AL_MAX_SUBS = Number(process.env.ALERT_MAX_SUBS) || 500, AL_HIST_MAX = 48, AL_HIST_AGE = 14 * 86400e3, AL_HITS_KEEP = 20, AL_BASE_WIN = 12;
const AL_RATE = Number(process.env.ALERT_RATE_PER_H ?? 30), AL_PER_IP = Number(process.env.ALERT_MAX_PER_IP) || 10, AL_MAX_CARDS = Number(process.env.ALERT_MAX_CARDS) || 50000;
const AL_HIST_GAP = Number(process.env.ALERT_HIST_GAP_MS ?? 3600e3), AL_BODY_MAX = 64 * 1024, AL_STALE = 30 * 86400e3;
// ip : appareil → réseau qui l'a enregistré, en mémoire seulement (jamais écrit sur disque) ; sert au plafond par IP.
const AL = { subs: new Map(), px: new Map(), ip: new Map(), run: null, saveT: null, seedT: null, last: { at: 0, ok: 0, miss: 0, hits: 0, err: '' }, warned: false };
const alKey = name => String(name || '').split('//')[0].replace(/æ/gi, 'ae').replace(/œ/gi, 'oe').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’‘`´]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const alEur = c => (c / 100).toFixed(2).replace('.', ',') + ' €';
const alId = key => createHash('sha1').update(key).digest('hex').slice(0, 24);                  // key : pushKey(cible) → un enregistrement par abonnement ou jeton FCM
const alMedian = a => { const s = a.slice().sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

async function alLoad() {
  try {
    const j = JSON.parse(await readFile(AL_FILE, 'utf8'));
    for (const r of Array.isArray(j.subs) ? j.subs : []) if (r && r.id && r.sub && Array.isArray(r.items)) AL.subs.set(r.id, r);
    for (const [k, h] of Object.entries(j.px || {})) if (Array.isArray(h)) AL.px.set(k, h);
    if (j.last && typeof j.last === 'object') AL.last = { ...AL.last, ...j.last, err: '' };
  } catch (e) { if (e && e.code !== 'ENOENT') console.warn('Alertes : fichier illisible (' + e.message + '), repart de zéro'); }
}
function alSaveSoon() {
  if (AL.saveT) return;
  AL.saveT = setTimeout(async () => {
    AL.saveT = null;
    try {
      await mkdir(dirname(AL_FILE), { recursive: true });
      const tmp = AL_FILE + '.tmp';
      await writeFile(tmp, JSON.stringify({ v: 1, last: AL.last, subs: [...AL.subs.values()], px: Object.fromEntries(AL.px) }));
      await rename(tmp, AL_FILE);
    } catch (e) { if (!AL.warned) { AL.warned = true; console.warn('Alertes : écriture impossible (' + e.message + ') : les listes restent en mémoire jusqu\'au prochain redémarrage'); } }
  }, 1500);
  AL.saveT.unref();
}

/** Prix tendance (centimes) des noms demandés : Map clé → centimes, ou null si Scryfall ne connaît pas la carte / n'a pas de prix. */
async function alFetch(list) {
  const out = new Map();
  for (let i = 0; i < list.length; i += 75) {
    const chunk = list.slice(i, i + 75);
    const r = await fetch(SCRY_UP + '/cards/collection', { method: 'POST', signal: AbortSignal.timeout(20000), redirect: 'manual',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'User-Agent': UA },
      body: JSON.stringify({ identifiers: chunk.map(([, n]) => ({ name: String(n).split('//')[0].trim() })) }) });
    if (r.status === 429) throw new Error('Scryfall : trop de requêtes (429)');
    if (!r.ok) throw new Error('Scryfall : HTTP ' + r.status);
    const j = await r.json();
    const got = new Map();
    for (const c of j.data || []) got.set(alKey(c.name), eurC(c.prices && c.prices.eur));
    for (const [k] of chunk) out.set(k, got.has(k) ? got.get(k) : null);
    if (i + 75 < list.length) await sleepMs(120);
  }
  return out;
}
const eurC = v => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null; };

/** Cartes d'un abonnement qui méritent une alerte, d'après les relevés partagés. Met à jour l'état par carte (dernier envoi, ré-armement). */
function alEval(rec, now) {
  const hits = [], thr = rec.thr / 100;
  for (const it of rec.items) {
    const h = AL.px.get(it.nk); if (!h || !h.length) continue;
    const cur = h[h.length - 1][1], prev = h.slice(0, -1).slice(-AL_BASE_WIN).map(x => x[1]);
    if (it.t) {                                                                    // prix cible : une alerte, ré-armée quand le prix remonte
      if (cur > it.t) { it.arm = true; continue; }
      if (it.arm === false) continue;
      it.arm = false; it.nt = now; it.na = cur;
      hits.push({ k: it.k, n: it.n, why: 'target', t: it.t, to: cur, from: prev.length ? alMedian(prev) : cur, d: it.d || [], at: now });
      continue;
    }
    if (!prev.length) continue;
    const base = alMedian(prev), drop = base - cur;
    if (drop < AL_MIN_DROP || drop / base < thr) continue;
    if (it.nt && now - it.nt < AL_COOL && cur > (it.na || 0) * 0.85) continue;      // déjà signalée : seulement si elle rechute d'au moins 15 %
    it.nt = now; it.na = cur;
    hits.push({ k: it.k, n: it.n, why: 'drop', from: base, to: cur, pct: Math.round(drop / base * 100), d: it.d || [], at: now });
  }
  return hits;
}
// Textes des alertes dans la langue de l'interface envoyée par l'appli (« lang ») ; français pour une appli plus ancienne qui ne la donne pas, ou une langue inconnue.
// Allemand, espagnol, italien : euros écrits comme en français (« 1,80 € ») ; portugais (du Brésil, celui des cartes Magic) : « € 1,80 ».
const AL_TXT = {
  fr: { eur: alEur, pct: p => `−${p} %`, at: (n, p) => `${n} à ${p}`, drop: (n, p) => `${n} : ${p}`, under: p => `Sous ton prix cible de ${p} (tendance Cardmarket).`, trend: (a, b) => `${a} → ${b} (tendance Cardmarket).`, deck: d => ' · manque à ' + d, many: n => `${n} cartes en baisse`, more: n => ` et ${n} autre${n > 1 ? 's' : ''}` },
  en: { eur: c => '€' + (c / 100).toFixed(2), pct: p => `−${p}%`, at: (n, p) => `${n} at ${p}`, drop: (n, p) => `${n}: ${p}`, under: p => `Below your target price of ${p} (Cardmarket trend).`, trend: (a, b) => `${a} → ${b} (Cardmarket trend).`, deck: d => ' · missing from ' + d, many: n => `${n} cards down`, more: n => ` and ${n} more` },
  de: { eur: alEur, pct: p => `−${p} %`, at: (n, p) => `${n} für ${p}`, drop: (n, p) => `${n}: ${p}`, under: p => `Unter deinem Zielpreis von ${p} (Cardmarket-Trend).`, trend: (a, b) => `${a} → ${b} (Cardmarket-Trend).`, deck: d => ' · fehlt in ' + d, many: n => `${n} Karten günstiger`, more: n => ` und ${n} weitere` },
  es: { eur: alEur, pct: p => `−${p} %`, at: (n, p) => `${n} a ${p}`, drop: (n, p) => `${n}: ${p}`, under: p => `Por debajo de tu precio objetivo de ${p} (tendencia de Cardmarket).`, trend: (a, b) => `${a} → ${b} (tendencia de Cardmarket).`, deck: d => ' · falta en ' + d, many: n => `${n} cartas bajan de precio`, more: n => ` y ${n} más` },
  it: { eur: alEur, pct: p => `−${p}%`, at: (n, p) => `${n} a ${p}`, drop: (n, p) => `${n}: ${p}`, under: p => `Sotto il tuo prezzo obiettivo di ${p} (tendenza Cardmarket).`, trend: (a, b) => `${a} → ${b} (tendenza Cardmarket).`, deck: d => ' · manca in ' + d, many: n => `${n} carte in calo`, more: n => ` e altre ${n}` },
  pt: { eur: c => '€ ' + (c / 100).toFixed(2).replace('.', ','), pct: p => `−${p}%`, at: (n, p) => `${n} por ${p}`, drop: (n, p) => `${n}: ${p}`, under: p => `Abaixo do seu preço-alvo de ${p} (tendência do Cardmarket).`, trend: (a, b) => `${a} → ${b} (tendência do Cardmarket).`, deck: d => ' · falta em ' + d, many: n => `${n} cartas em queda`, more: n => ` e mais ${n}` },
};
const alLang = l => (typeof l === 'string' && Object.prototype.hasOwnProperty.call(AL_TXT, l) ? l : 'fr');
function alMessage(hits, lang) {
  const L = AL_TXT[alLang(lang)];
  if (hits.length === 1) {
    const h = hits[0], deck = h.d && h.d.length ? L.deck(h.d[0]) : '';
    return h.why === 'target'
      ? { title: L.at(h.n, L.eur(h.to)), body: L.under(L.eur(h.t)) + deck }
      : { title: L.drop(h.n, L.pct(h.pct)), body: L.trend(L.eur(h.from), L.eur(h.to)) + deck };
  }
  const part = h => h.why === 'target' ? `${h.n} ${L.eur(h.to)}` : `${h.n} ${L.pct(h.pct)}`;
  return { title: L.many(hits.length), body: hits.slice(0, 3).map(part).join(', ') + (hits.length > 3 ? L.more(hits.length - 3) : '') };
}

/** Un passage : relève les prix des cartes suivies, puis prévient chaque appareil concerné. `seed` : seulement les cartes jamais relevées (pas d'alerte) ;
    `rec` : un seul appareil (« Vérifier les prix »), résultat gardé dans rec.last. Les passages s'attendent les uns les autres, jamais deux à la fois. */
async function alTick(opt = {}) {
  if (!ALERTS_ON) return null;
  while (AL.run) await AL.run;
  AL.run = alPass(opt).finally(() => { AL.run = null; });
  return AL.run;
}
async function alPass({ seed = false, rec = null }) {
  const now = Date.now(), recs = rec ? [rec] : [...AL.subs.values()], out = { at: now, ok: 0, miss: 0, hits: 0, err: '' };
  try {
    const want = new Map();
    for (const r of recs) for (const it of r.items) if (!want.has(it.nk)) want.set(it.nk, it.n);
    const ask = [...want].filter(([k]) => !seed || !(AL.px.get(k) || []).length);
    if (!ask.length && seed) return AL.last;
    const got = ask.length ? await alFetch(ask) : new Map();
    for (const [k, c] of got) {
      if (c == null) { out.miss++; continue; }
      out.ok++; const h = AL.px.get(k) || [], l = h[h.length - 1];
      if (l && now - l[0] < AL_HIST_GAP) l[1] = c;                                // relevé de moins d'une heure : remplacé (contrôles répétés : la médiane garde sa profondeur)
      else h.push([now, c]);
      while (h.length > AL_HIST_MAX || (h.length > 2 && now - h[0][0] > AL_HIST_AGE)) h.shift();
      AL.px.set(k, h);
    }
    if (!seed && !rec) for (const k of [...AL.px.keys()]) if (!want.has(k)) AL.px.delete(k);
    if (seed) AL.last.err = '';
    else {
      for (const r of recs) {
        const hits = alEval(r, now); if (!hits.length) continue;
        r.hits = [...hits, ...(r.hits || [])].slice(0, AL_HITS_KEEP);
        const m = alMessage(hits, r.lang), st = await sendPush({ sub: r.sub, title: m.title.slice(0, 80), body: m.body.slice(0, 200), url: './?alerts=1', kind: 'alert', topic: 'deckdeal-alert', ttl: 43200, urgency: 'normal' });
        if (st && st < 300) { out.hits++; r.pushed = now; console.log('alerte envoyée (' + hits.length + ' carte' + (hits.length > 1 ? 's' : '') + ')'); }
        else if (st === 404 || st === 410) { AL.subs.delete(r.id); console.warn('alerte : ' + (r.sub.fcm ? 'jeton FCM périmé' : 'abonnement expiré') + ', retiré'); }
        else console.warn('alerte refusée (' + (st || 'réseau') + ')');
      }
      if (!rec) AL.last = out;
    }
  } catch (e) { out.err = String(e && e.message || e).slice(0, 160); if (!rec) AL.last = { ...AL.last, err: out.err }; console.warn('Alertes : ' + out.err); }
  if (rec) rec.last = out;
  alSaveSoon();
  return rec ? out : AL.last;
}
function alSeedSoon() { if (AL.seedT) return; AL.seedT = setTimeout(() => { AL.seedT = null; alTick({ seed: true }); }, AL_SEED); AL.seedT.unref(); }

const alStr = (v, n) => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n) : '';
/** Serveur plein : retire l'enregistrement le plus ancien qui ne peut être un abonné actif (aucune notification réussie, et aucune carte au prix connu
    depuis plus d'une heure, ou pas réenregistré depuis 30 jours alors que l'appli le refait toutes les 12 h). Faux si aucun : le nouveau venu est refusé. */
function alEvict(now, keep = '') {
  let pick = null;
  for (const r of AL.subs.values()) {
    if (r.id === keep || r.pushed || !(now - r.at > AL_STALE || (now - r.at > 3600e3 && !r.items.some(it => (AL.px.get(it.nk) || []).length)))) continue;
    if (!pick || r.at < pick.at) pick = r;
  }
  if (pick) { AL.subs.delete(pick.id); console.warn('Alertes : serveur plein, enregistrement inactif retiré'); }
  return !!pick;
}
async function alertsApi(req, res, path, url) {
  if (!ALERTS_ON) return json(res, 404, { error: 'alerts_disabled', message: PUSH_ON || FCM_ON ? 'Alertes désactivées (ALERTS=0).' : 'Notifications non configurées (clés VAPID ou compte de service FCM manquants).' });
  const sub = path.replace(/^alerts\/?/, '');
  const id = String(url.searchParams.get('id') || '');
  if (req.method === 'PUT' && !sub) {
    const wait = rateWait(req, 'alerts', AL_RATE, 3600e3); if (wait) return tooMany(res, wait);
    let b; try { b = JSON.parse((await readBody(req, AL_BODY_MAX)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
    const pu = parsePush({ sub: b && b.sub, url: './?alerts=1' });
    if (!pu) return json(res, 400, { error: 'bad_subscription', message: 'Abonnement push invalide ou refusé.' });
    const rid = alId(pushKey(pu.sub)), old = AL.subs.get(rid), oldItems = new Map(((old && old.items) || []).map(x => [x.nk, x])), net = clientOf(req), now = Date.now();
    const items = new Map();
    for (const x of Array.isArray(b.items) ? b.items : []) {
      if (items.size >= AL_MAX_ITEMS) break;
      const n = alStr(x && x.n, 150), nk = alKey(n); if (!nk || items.has(nk)) continue;
      const t = Number.isSafeInteger(x.t) && x.t > 0 && x.t <= 1e6 ? x.t : 0, d = (Array.isArray(x.d) ? x.d : []).map(y => alStr(y, 40)).filter(Boolean).slice(0, 3), prev = oldItems.get(nk) || {};
      items.set(nk, { k: alStr(x.k, 150) || nk, n, nk, ...(t ? { t } : {}), ...(d.length ? { d } : {}), ...(prev.nt ? { nt: prev.nt, na: prev.na } : {}), ...(t && prev.t === t && prev.arm === false ? { arm: false } : {}) });
    }
    if (!items.size) { AL.subs.delete(rid); alSaveSoon(); return json(res, 200, { ok: true, id: rid, watching: 0 }); }
    const thr = Math.min(80, Math.max(10, Math.round(Number(b.thr)) || 30));
    if (!old) {
      if (net && [...AL.subs.keys()].filter(k => AL.ip.get(k) === net).length >= AL_PER_IP) return json(res, 429, { error: 'too_many_devices', message: 'Trop d\'appareils enregistrés depuis ce réseau.' });
      if (AL.subs.size >= AL_MAX_SUBS && !alEvict(now)) return json(res, 507, { error: 'alerts_full', message: 'Le serveur surveille déjà le maximum d\'appareils : réessaie plus tard.' }, { 'Retry-After': '3600' });
    }
    const cards = () => { let n = items.size; for (const r of AL.subs.values()) if (r.id !== rid) n += r.items.length; return n; };
    while (cards() > AL_MAX_CARDS) if (!alEvict(now, rid)) return json(res, 507, { error: 'alerts_full', message: 'Le serveur surveille déjà le maximum de cartes : réessaie plus tard.' }, { 'Retry-After': '3600' });
    AL.subs.set(rid, { ...(old || {}), id: rid, sub: pu.sub, thr, lang: alLang(b.lang), at: now, items: [...items.values()], hits: (old && old.hits) || [] });
    if (net) { AL.ip.set(rid, net); if (AL.ip.size > 2 * AL_MAX_SUBS) for (const k of AL.ip.keys()) if (!AL.subs.has(k)) AL.ip.delete(k); }
    alSaveSoon(); alSeedSoon();
    return json(res, 200, { ok: true, id: rid, watching: items.size, thr, last: AL.last.at, next: AL.last.at ? AL.last.at + AL_EVERY : 0 });
  }
  const rec = AL.subs.get(id);
  if (req.method === 'GET' && !sub) {
    if (!rec) return json(res, 404, { error: 'not_registered', message: 'Cet appareil n\'est pas (ou plus) enregistré pour les alertes.' });
    const prices = {};
    for (const it of rec.items) { const h = AL.px.get(it.nk); if (h && h.length) prices[it.k] = { c: h[h.length - 1][1], b: h.length > 1 ? alMedian(h.slice(0, -1).slice(-AL_BASE_WIN).map(x => x[1])) : 0 }; }
    const last = rec.last && rec.last.at > AL.last.at ? rec.last : AL.last;          // le plus récent : passage de toutes les 6 h ou contrôle de cet appareil
    return json(res, 200, { id: rec.id, thr: rec.thr, watching: rec.items.length, priced: Object.keys(prices).length, last, next: AL.last.at ? AL.last.at + AL_EVERY : 0, every: AL_EVERY, prices, hits: rec.hits || [] });
  }
  if (req.method === 'DELETE' && !sub) { const had = AL.subs.delete(id); if (had) alSaveSoon(); return json(res, 200, { ok: true, removed: had }); }
  if (req.method === 'POST' && sub === 'check') {
    if (!rec) return json(res, 404, { error: 'not_registered', message: 'Cet appareil n\'est pas (ou plus) enregistré pour les alertes.' });
    const gap = (rec.checkAt || 0) + AL_CHECK_GAP - Date.now();
    if (gap > 0) return json(res, 200, { ok: true, skipped: true, retry: Math.ceil(gap / 1000), last: rec.last || AL.last });
    const wait = rateWait(req, 'alcheck', AL_RATE, 3600e3); if (wait) return tooMany(res, wait);
    rec.checkAt = Date.now(); const last = await alTick({ rec });
    return json(res, 200, { ok: !last.err, last, error: last.err || undefined });
  }
  return json(res, 405, { error: 'method_not_allowed' });
}

const jobs = new Map(); let jobBytes = 0;                            // jobBytes : résultats gardés par toutes les tâches (plafond JOB_RES_MAX)
/** gs : [{ lang, foil, bps }] : les blueprints à lire dans cette langue et ce foil ; le premier groupe est celui de la recherche, les suivants (more) les lignes de la
 *  liste qui ont leur propre foil ou leur langue (« *F* », « *FR* ») : une seule tâche, une seule cadence. */
function newJob({ gs, fresh, tok = TOKEN, th = '' }) {
  const sig = createHash('sha1').update([tok === TOKEN ? '' : tok, ...gs.flatMap((g, i) => [...(i ? ['|'] : []), g.lang, g.foil, ...g.bps.slice().sort((a, b) => a - b)])].join(',')).digest('hex');      // un token différent : une tâche à part (elle tourne avec ce token)
  const now = Date.now();
  let same = null;                                                    // la tâche la plus récente de même signature (en cours, ou terminée et encore valable)
  for (const j of jobs.values()) if (j.sig === sig && (j.status === 'running' || (j.status === 'done' && !fresh && now - j.end < OFFER_TTL)) && (!same || j.t0 > same.t0)) same = j;
  if (same) return { job: same, attached: true };
  const running = [...jobs.values()].filter(j => j.status === 'running');
  if (running.length >= JOB_MAX_RUNNING) return { busy: true };
  if (th && running.filter(j => j.th === th).length >= JOB_PER_TOKEN) return { busy: true, mine: true };
  // th : empreinte du token de l'utilisateur ('' : token du serveur) ; tok n'est gardé que le temps de la recherche (effacé dès la fin, l'échec ou l'annulation).
  const queue = gs.flatMap((g, i) => g.bps.map(bp => ({ bp, g: i })));
  const job = { id: randomBytes(12).toString('hex'), sig, tok, th, gs: gs.map(({ lang, foil }) => ({ lang, foil })), fresh: !!fresh, queue, total: queue.length, results: [], bytes: 0, done: 0, cached: 0, cacheAge: 0, oldest: Infinity, errors: 0, sent: 0, stamps: [],
    status: 'running', fatal: null, ctl: new AbortController(), t0: now, end: 0, pushes: [], seenEnd: false };
  jobs.set(job.id, job);
  runJob(job);
  return { job, attached: false };
}
const jobDrop = j => { jobs.delete(j.id); jobBytes -= j.bytes; };
const jobStop = (j, status) => { j.status = status; j.ctl.abort(); j.tok = null; j.end = Date.now(); };
/** Garde un résultat dans la limite JOB_RES_MAX : les tâches terminées les plus anciennes sont oubliées d'abord ; plafond encore dépassé, la tâche
    échoue (l'appli relance ce qui manque, lu dans le cache des offres, puis le lit elle-même). Faux si la tâche s'arrête. */
function jobKeep(job, res, size) {
  if (jobBytes + size > JOB_RES_MAX) for (const j of [...jobs.values()].filter(x => x.end).sort((a, b) => a.end - b.end)) { jobDrop(j); if (jobBytes + size <= JOB_RES_MAX) break; }
  if (jobBytes + size > JOB_RES_MAX) { jobStop(job, 'failed'); return false; }
  job.results.push(res); job.bytes += size; jobBytes += size; return true;
}
async function runJob(job) {
  const worker = async () => {
    while (job.status === 'running') {
      const it = job.queue.shift(); if (it === undefined) return;
      const { bp } = it, { lang, foil } = job.gs[it.g], g = it.g ? { g: it.g } : {};      // g : groupe de la ligne (absent pour le premier : réponses d'avant les groupes)
      const k = okey(bp, lang, foil), hit = job.fresh || !tokOk(job.th) ? null : offersGet(k);       // cache partagé : seulement pour un token déjà accepté par CardTrader
      let products = null, error = null, size = 64;
      if (hit) { products = hit.products; size = hit.size; job.cached++; job.cacheAge = Math.max(job.cacheAge, Date.now() - hit.t); job.oldest = Math.min(job.oldest, hit.t); }
      else {
        try { const at = Date.now(); products = await fetchProducts(bp, lang, foil, job.ctl.signal, job.tok); tokSeen(job.th); size = offersSet(k, products); job.sent++; job.stamps.push(Date.now()); job.oldest = Math.min(job.oldest, at); }
        catch (e) {
          if (e.cancelled) return;
          if (e.fatal) { job.fatal = e.fatal; jobStop(job, 'failed'); return; }
          error = e.message || 'error'; job.errors++;
        }
      }
      if (job.status !== 'running' || !jobKeep(job, error ? { bp, ...g, error } : { bp, ...g, products }, size)) return;
      job.done++;
    }
  };
  try { await Promise.all(Array.from({ length: Math.min(JOB_CONC, job.queue.length) }, worker)); }
  catch (e) { console.error('job:', e); if (job.status === 'running') job.status = 'failed'; }
  if (job.status === 'running') job.status = 'done';
  job.tok = null; job.end = job.end || Date.now();
  pushWhenDone(job);
}
function gcJobs() {
  const now = Date.now(), fin = [];
  for (const j of jobs.values()) {
    if (j.status === 'running' && now - j.t0 > 30 * 60e3) jobStop(j, 'cancelled');
    if (j.end && now - j.end > JOB_KEEP) jobDrop(j); else if (j.end) fin.push(j);
  }
  fin.sort((a, b) => a.end - b.end); while (fin.length > JOB_MAX_KEPT) jobDrop(fin.shift());
}
if (JOBS_ON) setInterval(gcJobs, 30e3).unref();

async function jobsApi(req, res, path, url, tok = TOKEN, th = '') {
  if (!JOBS_ON) return json(res, 404, { error: 'jobs_disabled' });
  const m = /^jobs(?:\/([a-f0-9]{24}))?$/.exec(path);
  if (!m) return json(res, 404, { error: 'not_found' });
  if (req.method === 'POST' && !m[1]) {
    if (th) { const wait = rateWait(req, 'jobs', USER_JOBS_H, 3600e3); if (wait) return tooMany(res, wait); }
    let b; try { b = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
    // lang, foil, bps : le groupe de la recherche ; more (facultatif) : [{ lang, foil, bps }], lignes de la liste avec leur propre foil ou leur langue (résultats marqués g : 1, 2…)
    const grp = x => ({ lang: x && x.lang != null ? String(x.lang) : '', foil: x && x.foil != null ? String(x.foil) : 'any', bps: Array.isArray(x && x.bps) ? [...new Set(x.bps)] : [] });
    const gs = b && (b.more == null || Array.isArray(b.more)) ? [grp(b), ...(b.more || []).map(grp)] : null;
    if (!b || b.type !== 'offers' || !gs || gs.length > JOB_MAX_GROUPS || gs.reduce((a, g) => a + g.bps.length, 0) > JOB_MAX_BPS
      || !gs.every(g => /^([a-z]{2}(-[A-Za-z]{2})?)?$/.test(g.lang) && ['no', 'yes', 'any'].includes(g.foil) && g.bps.length && g.bps.every(x => Number.isSafeInteger(x) && x > 0)))
      return json(res, 400, { error: 'bad_request', message: 'Paramètres invalides (type, lang, foil, bps ou more).' });
    const r = newJob({ gs, fresh: !!b.fresh, tok, th });
    if (r.busy) return json(res, 429, { error: 'busy', message: r.mine ? 'Trop de recherches en cours avec ce token.' : 'Trop de recherches en cours sur le serveur.' }, { 'Retry-After': '10' });
    const pu = parsePush(b.push);
    if (pu && r.job.status === 'running' && r.job.pushes.length < 3 && !r.job.pushes.some(x => pushKey(x.sub) === pushKey(pu.sub))) r.job.pushes.push(pu);
    return json(res, 202, { id: r.job.id, total: r.job.total, attached: r.attached, status: r.job.status, push: !!pu });
  }
  const job = m[1] && jobs.get(m[1]);
  if (!job) return json(res, m[1] ? 404 : 405, { error: m[1] ? 'job_not_found' : 'method_not_allowed', message: m[1] ? 'Recherche introuvable (serveur redémarré ou trop ancienne).' : undefined });
  if (req.method === 'DELETE') { if (job.status === 'running') { jobStop(job, 'cancelled'); job.pushes.length = 0; } return json(res, 200, { id: job.id, status: job.status }); }
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (job.status !== 'running') job.seenEnd = true;               // quelqu'un relève le résultat final : pas de notification
  const from = Math.max(0, Math.floor(Number(url.searchParams.get('from')) || 0));
  const items = job.results.slice(from, from + JOB_PAGE), now = Date.now();
  while (job.stamps.length && now - job.stamps[0] > 5000) job.stamps.shift();
  return json(res, 200, { id: job.id, status: job.status, total: job.total, done: job.done, cached: job.cached, cacheAge: Math.round(job.cacheAge / 1000), dataAge: job.oldest === Infinity ? 0 : Math.round((now - job.oldest) / 1000), errors: job.errors, sent: job.sent,
    rps: Math.round(job.stamps.length / Math.min(5, Math.max(1, (now - job.t0) / 1000)) * 10) / 10, count: job.results.length, from, next: from + items.length, items, fatal: job.fatal });
}

// En-têtes de sécurité sur toutes les réponses (pas de CSP : la page charge Firebase, Scryfall et Google Fonts).
const SEC = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(self), microphone=(), geolocation=(), payment=()',   // caméra : scan des cartes de la collection
};
const json = (res, status, obj, extra = {}) => {
  const b = JSON.stringify(obj);
  res.writeHead(status, { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra });
  res.end(b);
};

// Freine le brute-force de la clé : délai sur chaque mauvaise clé + blocage temporaire par IP.
// L'IP retenue est la DERNIÈRE de X-Forwarded-For (ajoutée par le reverse proxy de l'hébergeur, non falsifiable par le client).
// Sans X-Forwarded-For on ne sait pas distinguer les clients : délai seul, pas de blocage (sinon un tiers pourrait t'enfermer dehors).
const BAD = new Map(), BAD_MAX = 15, BAD_WIN = 10 * 60e3, BAD_LOCK = 5 * 60e3;
const ipOf = req => String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() || req.socket.remoteAddress || '?';
const isLocked = req => { const e = BAD.get(ipOf(req)); return !!e && e.until > Date.now(); };
/** Essai invalide : compté pour l'IP (blocage au 15e) puis freiné. */
async function badHit(req) {
  const k = ipOf(req), now = Date.now();
  if (BAD.size > 1000) for (const [kk, v] of BAD) if (now - v.first > BAD_WIN && v.until < now) BAD.delete(kk);
  let e = BAD.get(k);
  if (!e || (now - e.first > BAD_WIN && e.until < now)) e = { n: 0, first: now, until: 0 };
  e.n++;
  if (e.n >= BAD_MAX && req.headers['x-forwarded-for']) e.until = now + BAD_LOCK;
  BAD.set(k, e);
  await new Promise(r => setTimeout(r, Number(process.env.BAD_KEY_DELAY_MS ?? 400)));
}
async function badKey(req, res, error = 'bad_app_key', status = 401) {
  await badHit(req);
  return json(res, status, { error, message: error === 'forbidden' ? 'Ce compte n\'est pas autorisé sur ce serveur.' : error === 'bad_token' ? 'Jeton de connexion invalide.' : undefined });
}

// Budgets par client sur les routes publiques coûteuses (seau de jetons : `cap` requêtes d'avance, rechargé de `cap` par période `per`).
// Client : l'IP ci-dessus, réseau /64 pour une IPv6 (une box en reçoit des milliards). Sans X-Forwarded-For, clients indiscernables : pas de limite, comme pour
// le blocage BAD (sinon, derrière un proxy qui ne l'ajoute pas, tous les visiteurs partageraient un seul budget). Les plafonds globaux restent.
// Token d'un utilisateur : 360 relais par minute (le rythme maximal de l'appli, 6/s) ; 120 recherches par heure (un refus renvoie l'appli à la lecture depuis l'appareil).
const IMPORT_RATE = Number(process.env.IMPORT_RATE_PER_H ?? 30), USER_RATE = Number(process.env.USER_RATE_PER_MIN ?? 360), USER_JOBS_H = Number(process.env.USER_JOBS_PER_H ?? 120);
const BUCKETS = new Map();
/** Réseau d'une adresse : IPv4 telle quelle, préfixe /64 d'une IPv6. */
function netOf(ip) {
  const v4 = /(?:^|:)(\d+\.\d+\.\d+\.\d+)$/.exec(ip); if (v4 || !ip.includes(':')) return v4 ? v4[1] : ip;
  const [a, b] = ip.split('::'), h = a ? a.split(':') : [], t = b ? b.split(':') : [];
  const g = b === undefined ? h : [...h, ...Array(Math.max(0, 8 - h.length - t.length)).fill('0'), ...t];
  return g.slice(0, 4).map(x => (parseInt(x, 16) || 0).toString(16)).join(':') + '::/64';
}
const clientOf = req => req.headers['x-forwarded-for'] ? netOf(ipOf(req)) : '';
/** 0 : requête permise (un jeton consommé) ; sinon secondes à attendre. cap ≤ 0 : sans limite. */
function rateWait(req, name, cap, per) {
  const c = clientOf(req); if (!c || !(cap > 0)) return 0;
  const k = name + ' ' + c, now = Date.now(); let b = BUCKETS.get(k);
  if (!b) { if (BUCKETS.size > 10000) for (const [kk, v] of BUCKETS) if (now - v.t > v.per) BUCKETS.delete(kk); b = { n: cap, t: now, per }; BUCKETS.set(k, b); }
  b.n = Math.min(cap, b.n + (now - b.t) * cap / per); b.t = now;
  if (b.n >= 1) { b.n--; return 0; }
  return Math.max(1, Math.ceil((1 - b.n) * per / cap / 1000));
}
const tooMany = (res, s) => json(res, 429, { error: 'rate_limited', message: 'Trop de requêtes depuis ce réseau : réessaie dans quelques minutes.', retry: s }, { 'Retry-After': String(s) });
// Corps trop gros : réponse puis fermeture de la connexion (le reste du corps n'est jamais lu).
const tooLarge = res => json(res, 413, { error: 'too_large', message: 'Requête trop grosse.' }, { Connection: 'close' });

/* ── Jeton Firebase (JWT RS256) : vérification sans dépendance ───────────────────────────────── */
const authErr = (code, message) => Object.assign(new Error(message || code), { authCode: code });
const jwk = { keys: new Map(), exp: 0, lastTry: 0 };
async function loadKeys(force) {
  const now = Date.now();
  if (!force && jwk.keys.size && jwk.exp > now) return;
  if (force && now - jwk.lastTry < 60e3 && jwk.keys.size) return;  // un jeton « inconnu » ne doit pas déclencher une avalanche de requêtes vers Google
  jwk.lastTry = now;
  let r;
  try { r = await fetch(JWKS_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json' } }); } catch (e) { r = null; }
  if (!r || !r.ok) { if (jwk.keys.size) return; throw authErr('unavailable', 'Clés Firebase injoignables'); } // à défaut, on garde les anciennes clés
  const j = await r.json(), keys = new Map();
  for (const k of (j && j.keys) || []) { try { if (k.kid && k.kty === 'RSA') keys.set(k.kid, createPublicKey({ key: k, format: 'jwk' })); } catch (e) { /* clé illisible : ignorée */ } }
  if (!keys.size) { if (jwk.keys.size) return; throw authErr('unavailable', 'Aucune clé Firebase exploitable'); }
  const m = /max-age=(\d+)/.exec(r.headers.get('cache-control') || '');
  jwk.keys = keys; jwk.exp = now + Math.min(24 * 3600e3, Math.max(60e3, (m ? Number(m[1]) : 3600) * 1000));
}
const b64j = x => JSON.parse(Buffer.from(x, 'base64url').toString('utf8'));
/** Retourne {uid, email, emailVerified} ou lève une erreur {authCode: expired | invalid | forbidden | unavailable}.
    any : tout compte du projet Firebase (amis : chacun ses données), sans la liste ALLOWED_UIDS / ALLOWED_EMAILS du token CardTrader du serveur. */
async function verifyIdToken(tok, any = false) {
  const parts = String(tok || '').split('.');
  if (parts.length !== 3 || tok.length > 4096) throw authErr('invalid');
  let h, c;
  try { h = b64j(parts[0]); c = b64j(parts[1]); } catch (e) { throw authErr('invalid'); }
  if (!h || h.alg !== 'RS256' || typeof h.kid !== 'string') throw authErr('invalid');          // alg « none » ou HS256 : refusés d'office
  await loadKeys(false);
  let key = jwk.keys.get(h.kid);
  if (!key) { await loadKeys(true); key = jwk.keys.get(h.kid); }
  if (!key) throw authErr('invalid');
  let okSig = false;
  try { okSig = rsaVerify('RSA-SHA256', Buffer.from(parts[0] + '.' + parts[1]), key, Buffer.from(parts[2], 'base64url')); } catch (e) { okSig = false; }
  if (!okSig) throw authErr('invalid');
  const now = Math.floor(Date.now() / 1000), skew = 60;
  if (!c || c.aud !== FB_PROJECT || c.iss !== 'https://securetoken.google.com/' + FB_PROJECT) throw authErr('invalid');
  if (typeof c.sub !== 'string' || !c.sub || c.sub.length > 128) throw authErr('invalid');
  if (!Number.isFinite(c.exp) || !Number.isFinite(c.iat) || c.iat > now + skew || (c.auth_time && c.auth_time > now + skew)) throw authErr('invalid');
  if (c.exp <= now) throw authErr('expired');
  const email = typeof c.email === 'string' ? c.email.toLowerCase() : '', emailVerified = c.email_verified === true;
  if (!any && !(ALLOWED_UIDS.has(c.sub) || (email && emailVerified && ALLOWED_EMAILS.has(email)))) throw authErr('forbidden');
  return { uid: c.sub, email, emailVerified, provider: c.firebase && typeof c.firebase.sign_in_provider === 'string' ? c.firebase.sign_in_provider : '' };      // provider : google.com, password… (Carte mystère : classement des comptes Google ou vérifiés)
}

const safeEq = (a, b) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

// Au-delà de `max` : lecture arrêtée (requête en pause), erreur 413 ; la réponse (tooLarge) ferme ensuite la connexion.
const readBody = (req, max = 256 * 1024) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  const onData = c => { n += c.length; if (n > max) { req.off('data', onData); req.pause(); reject(Object.assign(new Error('too large'), { status: 413 })); } else chunks.push(c); };
  req.on('data', onData);
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});

// Autorisation : compte Firebase autorisé OU clé APP_KEY (si l'une ou l'autre est configurée). Sans rien de configuré : ouvert (local uniquement).
// Aucun identifiant fourni → 401 sans pénalité (pas de devinette possible) ; identifiant faux → délai + blocage par IP.
async function authorize(req, res) {
  if (!APP_KEY && !AUTH_FB) return true;
  if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return false; }
  const key = String(req.headers['x-app-key'] || ''), tok = String(req.headers['x-firebase-token'] || '');
  if (APP_KEY && key && safeEq(key, APP_KEY)) return true;
  if (AUTH_FB && tok) {
    try { await verifyIdToken(tok); return true; }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') { json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' }); return false; }
      if (code === 'unavailable') { json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' }); return false; }
      if (code === 'forbidden') { json(res, 403, { error: 'forbidden', message: 'Ce compte n\'est pas autorisé sur ce serveur.' }); return false; }      // jeton authentique : pas un essai de clé, rien à compter
      await badKey(req, res, 'bad_token', 401); return false;
    }
  }
  if (!key && !tok) { json(res, 401, { error: 'auth_required', message: AUTH_FB ? 'Connecte-toi pour utiliser le proxy.' : 'Clé du proxy requise.', login: AUTH_FB, key: !!APP_KEY }); return false; }
  await badKey(req, res); return false;
}


/** Ce visiteur peut-il chercher avec le token du serveur ? (compte autorisé, bonne clé, ou serveur local ouvert) Jeton Firebase refusé : sans pénalité
    (aucune devinette possible) ; mauvaise APP_KEY : comptée et freinée comme dans authorize, IP bloquée → false (sinon /__me servirait à deviner la clé). */
async function serverOk(req) {
  if (!TOKEN) return false;
  if (!APP_KEY && !AUTH_FB) return true;
  if (isLocked(req)) return false;
  const key = String(req.headers['x-app-key'] || ''), tok = String(req.headers['x-firebase-token'] || '');
  if (APP_KEY && key && safeEq(key, APP_KEY)) return true;
  if (AUTH_FB && tok) { try { await verifyIdToken(tok); return true; } catch (e) { /* jeton refusé */ } }
  if (APP_KEY && key) await badHit(req);
  return false;
}

/* ── Import d'une liste depuis un lien (menu « Partager » de l'appli EDHREC, Archidekt) ──────────────────────────────────────
   Ouvert à tous (limité par IP), lecture seule, hôtes en liste blanche, aucune redirection suivie, 2 Mo et 8 s maximum. Le serveur renvoie la liste en texte
   « 1 Sol Ring » avec un en-tête « Commander » si le site le distingue. Archidekt : au mieux (son API peut changer). Moxfield : pas d'API publique,
   ses liens ne sont pas lus (décision du 12 octobre 2026) ; on colle la liste exportée à la place. */
const IMPORT_UP = (process.env.IMPORT_UPSTREAM || '').replace(/\/+$/, '');          // tests uniquement
const IMPORT_MAX = 2 * 1024 * 1024, IMPORT_LINES = 450;
const UA = 'Mozilla/5.0 (compatible; DeckDeal/1.0)';
async function getJsonLimited(url, headers = {}) {
  let r;
  try { r = await fetch(url, { headers: { Accept: 'application/json', 'User-Agent': UA, ...headers }, redirect: 'manual', signal: AbortSignal.timeout(8000) }); }
  catch (e) { throw Object.assign(new Error('Site injoignable'), { status: 502 }); }
  if (r.status >= 300 && r.status < 400) throw Object.assign(new Error('Redirection non suivie'), { status: 502 });
  if (r.status === 404) throw Object.assign(new Error('Liste introuvable (privée ou lien incomplet ?)'), { status: 404 });
  if (!r.ok) throw Object.assign(new Error('Le site a refusé la lecture (' + r.status + ')'), { status: 502 });
  const big = () => Object.assign(new Error('Réponse trop grosse'), { status: 413 });
  const len = Number(r.headers.get('content-length')); if (len > IMPORT_MAX) { r.body && r.body.cancel().catch(() => {}); throw big(); }
  const parts = []; let n = 0;                                          // lu en flux : une réponse sans longueur annoncée est coupée dès IMPORT_MAX
  if (r.body) {
    const rd = r.body.getReader();
    try { for (let c; !(c = await rd.read()).done;) { n += c.value.length; if (n > IMPORT_MAX) throw big(); parts.push(c.value); } }
    catch (e) { rd.cancel().catch(() => {}); throw e.status ? e : Object.assign(new Error('Site injoignable'), { status: 502 }); }
  }
  try { return JSON.parse(Buffer.concat(parts).toString('utf8')); } catch (e) { throw Object.assign(new Error('Réponse illisible'), { status: 502 }); }
}
const qn = v => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 && n < 100 ? n : 1; };
const cleanName = v => typeof v === 'string' ? v.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 150) : '';
function toText(cmd, main) {
  const line = ([n, q]) => q + ' ' + n;
  const out = [];
  if (cmd.length) out.push('Commander', ...cmd.map(line), '');
  if (out.length) out.push('Deck');
  out.push(...main.map(line));
  return out.join('\n');
}
function fromEdhrec(j) {
  const d = j && j.deck, cmd = [], main = [];
  const add = (list, n, q) => { n = cleanName(n); if (n) list.push([n, qn(q)]); };
  if (Array.isArray(d)) for (const x of d) { const m = /^\s*(\d+)\s*x?\s+(.+?)\s*$/.exec(String(x)); if (m) add(main, m[2], m[1]); else add(main, String(x), 1); }
  else if (d && typeof d === 'object') {
    for (const x of d.commander_v2 || (d.commander || []).map(n => [n, 1])) add(cmd, x[0], x[1]);
    for (const list of Object.values(d.cards || {})) if (Array.isArray(list)) for (const x of list) add(main, x[0], x[1]);
  }
  if (!main.length && Array.isArray(j && j.archidekt)) for (const x of j.archidekt) add(main, x && x.c, x && x.q);
  const hdr = cleanName(j && j.header).replace(/^Average Deck for\s+/i, '');
  return { name: hdr || (cmd[0] && cmd[0][0]) || 'Deck EDHREC', cmd, main };
}
function fromArchidekt(j) {
  const cmd = [], main = [];
  for (const c of (j && j.cards) || []) {
    const cats = (c.categories || []).map(x => String(x).toLowerCase()), n = cleanName(c.card && c.card.oracleCard && c.card.oracleCard.name || c.card && c.card.name);
    if (!n || cats.some(x => /maybe|sideboard|considering/.test(x))) continue;
    (cats.includes('commander') ? cmd : main).push([n, qn(c.quantity)]);
  }
  return { name: cleanName(j && j.name) || 'Deck Archidekt', cmd, main };
}
async function importApi(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  let u; try { u = new URL(String(url.searchParams.get('url') || '').trim()); } catch (e) { return json(res, 400, { error: 'bad_request', message: 'Lien invalide.' }); }
  const host = u.hostname.replace(/^www\./, '').toLowerCase(), segs = u.pathname.split('/').filter(Boolean);
  if (u.protocol !== 'https:' || u.username || u.password || (u.port && u.port !== '443')) return json(res, 400, { error: 'bad_request', message: 'Lien https attendu.' });
  const slug = /^[a-z0-9][a-z0-9-]{0,120}$/i, num = /^\d{1,10}$/;
  let site, target, parse;
  if (host === 'edhrec.com' && ['average-decks', 'commanders'].includes(segs[0]) && slug.test(segs[1] || '') && segs.length <= 3 && (!segs[2] || slug.test(segs[2]))) {
    site = 'EDHREC'; parse = fromEdhrec;
    target = (IMPORT_UP ? IMPORT_UP + '/edhrec' : 'https://json.edhrec.com') + '/pages/average-decks/' + segs[1] + (segs[0] === 'average-decks' && segs[2] ? '/' + segs[2] : '') + '.json';
  } else if (host === 'archidekt.com' && segs[0] === 'decks' && num.test(segs[1] || '')) {
    site = 'Archidekt'; parse = fromArchidekt; target = (IMPORT_UP ? IMPORT_UP + '/archidekt' : 'https://archidekt.com') + '/api/decks/' + segs[1] + '/';
  } else if (host === 'moxfield.com') return json(res, 400, { error: 'unsupported', site: 'Moxfield', message: 'Liens Moxfield non lus : exporte la liste depuis Moxfield et colle-la.' });
  else return json(res, 400, { error: 'unsupported', message: 'Lien non pris en charge : EDHREC (average-decks) ou Archidekt.' });
  if (OFF.includes(site.toLowerCase())) return json(res, 403, { error: 'off', site, message: `Import depuis ${site} désactivé : colle la liste à la place.` });      // interrupteur (EDHREC_OFF, ARCHIDEKT_OFF)
  const wait = rateWait(req, 'import', IMPORT_RATE, 3600e3); if (wait) return tooMany(res, wait);       // route publique : IMPORT_RATE_PER_H lectures par heure et par IP (un lien refusé d'office ne compte pas)
  try {
    const r = parse(await getJsonLimited(target));
    if (!r.main.length && !r.cmd.length) return json(res, 422, { error: 'empty', message: 'Aucune carte trouvée dans cette liste.' });
    return json(res, 200, { site, name: r.name, count: r.cmd.length + r.main.length, text: toText(r.cmd.slice(0, 4), r.main.slice(0, IMPORT_LINES)) });
  } catch (e) { return json(res, e.status || 502, { error: 'import_failed', message: e.message }); }
}

/* ── Decks publics (« Communauté ») : GET /api/pubdecks ─────────────────────────────────────────────────────────────────────
   Les comptes publient leurs decks dans Firestore (pubdecks/{empreinte}_{0…9}, voir firestore.rules). Le serveur les relit avec le compte de service
   des notifications (FCM_SERVICE_ACCOUNT, portée datastore : hors des règles), garde ceux au bon format (core.js › pubClean : 100 cartes, 1 ou 2 commandants, vraies cartes
   du catalogue Scryfall seulement, aucun mot refusé),
   écarte ceux signalés PUBDECKS_REPORTS fois (3 par défaut, collection pubreports) et ceux de PUBDECKS_HIDE (identifiants séparés par des virgules),
   puis sert la liste à tous : { at, decks: [{ id, by, cmd, ci, cards: [[nom, qté]], u }] }, relue au plus toutes les 10 min (PUBDECKS_TTL_MS), plus
   tôt après une publication (?fresh=1, 30 s au moins entre deux lectures). Sans compte de service ou avec PUBDECKS=0 : coupé (liste vide, l'appli fait sans).
   Quota de lectures (gratuit : 50 000 par jour pour tout le projet) : relire tout coûte une lecture par deck et par signalement. Avant, 2 agrégations
   (nombre et somme des dates de chaque collection : 2 lectures) ; rien n'a changé depuis la dernière lecture complète → rien n'est relu (au plus 6 h). */
const FS_BASE = (process.env.FIRESTORE_BASE_URL || 'https://firestore.googleapis.com').replace(/\/+$/, '');      // surchargeable pour les tests
const DS_SCOPE = 'https://www.googleapis.com/auth/datastore';
const PUB_TTL = Number(process.env.PUBDECKS_TTL_MS) > 0 ? Number(process.env.PUBDECKS_TTL_MS) : 10 * 60e3, PUB_SOON = process.env.PUBDECKS_SOON_MS ? Math.max(0, Number(process.env.PUBDECKS_SOON_MS) || 0) : 30e3, PUB_CAP = 3000;      // PUB_SOON : écart minimal entre deux lectures (surchargeable pour les tests)
const PUB_REPORTS = Math.max(1, Math.floor(Number(process.env.PUBDECKS_REPORTS)) || 3);
const PUB_HIDE = new Set(String(process.env.PUBDECKS_HIDE || '').split(/[\s,]+/).filter(Boolean));
const PUB = { at: 0, tried: 0, raw: null, gz: null, etag: '', run: null, n: 0, hid: 0, err: '', names: null, sig: '', full: 0, same: 0 };
const PUB_FULL = 6 * 3600e3;      // relecture complète au moins toutes les 6 h (catalogue des noms relu, PUBDECKS_HIDE…)
/** Noms de cartes existants : catalogue complet de Scryfall (/catalog/card-names, relu une fois par jour), face avant des cartes doubles comprise ;
 *  un deck public n'a que de vraies cartes. Scryfall injoignable : pas de contrôle des noms (le filtre de mots reste), nouvel essai dans 1 h. */
async function pubNames() {
  const p = PUB.names; if (p && Date.now() - p.at < (p.set.size ? 86400e3 : 3600e3)) return p.set;
  const set = new Set();
  try {
    const r = await fetch(SCRY_UP + '/catalog/card-names', { signal: AbortSignal.timeout(20000), redirect: 'manual', headers: { Accept: 'application/json', 'User-Agent': UA } });
    const j = r.ok ? await r.json() : null;
    if (j && Array.isArray(j.data)) for (const n of j.data) if (typeof n === 'string') { set.add(NM_CORE.ownKey(n)); if (n.includes('//')) set.add(NM_CORE.ownKey(n.split('//')[0])); }
  } catch (e) { /* Scryfall injoignable */ }
  if (set.size >= 20000) PUB.names = { at: Date.now(), set };
  else if (p && p.set.size) PUB.names = { set: p.set, at: Date.now() - 86400e3 + 3600e3 };      // échec : l'ancien catalogue sert encore une heure
  else { PUB.names = { at: Date.now(), set: new Set() }; console.warn('Decks publics : catalogue des cartes Scryfall illisible, noms non contrôlés pour l\'instant'); }
  return PUB.names.set;
}
/** Une valeur de l'API REST Firestore en JS (chaînes, nombres, booléens, listes, objets, null ; le reste : undefined). */
const fsVal = v => (!v || typeof v !== 'object' ? undefined : 'stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'doubleValue' in v ? Number(v.doubleValue)
  : 'booleanValue' in v ? v.booleanValue : 'arrayValue' in v ? (v.arrayValue.values || []).map(fsVal) : 'mapValue' in v ? fsFields(v.mapValue) : 'nullValue' in v ? null : undefined);
const fsFields = d => { const o = {}; for (const [k, v] of Object.entries((d && d.fields) || {})) o[k] = fsVal(v); return o; };
/** Tous les documents d'une collection racine (par pages de 300, 30 000 au plus). */
async function fsList(col, tok) {
  const out = []; let page = '';
  for (let i = 0; i < 100; i++) {
    const r = await fetch(`${FS_BASE}/v1/projects/${fcmSa.project}/databases/(default)/documents/${col}?pageSize=300${page ? '&pageToken=' + encodeURIComponent(page) : ''}`,
      { headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'manual' });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j) { const e = new Error(col + ' : HTTP ' + r.status + (j && j.error && j.error.message ? ' ' + String(j.error.message).slice(0, 120) : '')); e.http = r.status; throw e; }
    if (Array.isArray(j.documents)) out.push(...j.documents);
    if (!j.nextPageToken) break; page = String(j.nextPageToken);
  }
  return out;
}
/** Nombre de documents d'une collection racine et somme d'un champ (une agrégation : une lecture facturée par tranche de 1 000 documents). */
async function fsAgg(col, field, tok) {
  const r = await fetch(`${FS_BASE}/v1/projects/${fcmSa.project}/databases/(default)/documents:runAggregationQuery`, { method: 'POST',
    headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'manual',
    body: JSON.stringify({ structuredAggregationQuery: { structuredQuery: { from: [{ collectionId: col }] }, aggregations: [{ alias: 'n', count: {} }, { alias: 's', sum: { field: { fieldPath: field } } }] } }) });
  const j = await r.json().catch(() => null), f = r.ok && Array.isArray(j) && j[0] && j[0].result && j[0].result.aggregateFields;
  if (!f || fsVal(f.n) === undefined) { const e = new Error(col + ' (agrégation) : HTTP ' + r.status); e.http = r.status; throw e; }
  return fsVal(f.n) + ':' + fsVal(f.s);
}
/** Empreinte des decks publics et des signalements : la même qu'à la dernière lecture complète = rien d'ajouté, de modifié ni de retiré. */
const pubSig = tok => Promise.all([fsAgg('pubdecks', 'updatedAt', tok), fsAgg('pubreports', 'at', tok)]).then(x => x.join('|'));
/** Relit les decks publics et les signalements, puis prépare la liste servie (JSON et sa version gzip). Une seule lecture à la fois. */
function pubRefresh() {
  if (!PUB.run) PUB.run = (async () => {
    PUB.tried = Date.now();
    let tok = await fcmAccess(DS_SCOPE), docs, reps;
    const sig = await pubSig(tok).catch(() => '');      // agrégation impossible (jeton révoqué, panne) : relecture complète, comme avant
    if (sig && sig === PUB.sig && PUB.raw && Date.now() - PUB.full < PUB_FULL) { PUB.at = Date.now(); PUB.err = ''; PUB.same++; return; }      // rien de changé : liste gardée (même ETag)
    try { [docs, reps] = await Promise.all([fsList('pubdecks', tok), fsList('pubreports', tok)]); }
    catch (e) { if (e.http !== 401) throw e; fcmAuth.get(DS_SCOPE).tok = ''; tok = await fcmAccess(DS_SCOPE); [docs, reps] = await Promise.all([fsList('pubdecks', tok), fsList('pubreports', tok)]); }      // jeton révoqué : un nouveau, un seul essai
    const known = await pubNames(), flags = new Map();
    for (const r of reps) { const d = fsFields(r).d; if (typeof d === 'string') flags.set(d, (flags.get(d) || 0) + 1); }
    const decks = []; let hid = 0;
    for (const doc of docs) {
      const id = String(doc.name || '').split('/').pop(), x = fsFields(doc);
      if (!/^[0-9a-f]{64}_[0-9]$/.test(id) || x.o !== id.slice(0, 64)) continue;
      if (PUB_HIDE.has(id) || (flags.get(id) || 0) >= PUB_REPORTS) { hid++; continue; }
      const c = NM_CORE.pubClean(x, known); if (c) decks.push([Number(x.updatedAt) || 0, { id, ...c }]);
    }
    decks.sort((a, b) => b[0] - a[0]);
    const raw = Buffer.from(JSON.stringify({ at: Date.now(), decks: decks.slice(0, PUB_CAP).map(d => d[1]) }));
    Object.assign(PUB, { raw, gz: await gzipA(raw), etag: '"' + sha1Of(raw) + '"', at: Date.now(), n: Math.min(decks.length, PUB_CAP), hid, err: '', sig, full: Date.now() });
  })().catch(e => { PUB.err = String(e && e.message || e).slice(0, 200); console.warn('Decks publics : ' + PUB.err); }).finally(() => { PUB.run = null; });
  return PUB.run;
}
async function pubApi(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  if (!PUB_ON) return json(res, 200, { at: 0, decks: [], off: true }, { 'Cache-Control': 'public, max-age=3600' });
  const now = Date.now(), fresh = url.searchParams.get('fresh') === '1';
  if (!PUB.raw && now - PUB.tried > PUB_SOON) await pubRefresh();      // premier appel (ou serveur injoignable il y a plus de 30 s) : on attend la liste
  else if (fresh && now - PUB.tried > PUB_SOON) { const w = rateWait(req, 'pub', 6, 10 * 60e3); if (w) return tooMany(res, w); await pubRefresh(); }      // juste après une publication : relue tout de suite
  else if (now - PUB.at > PUB_TTL && now - PUB.tried > PUB_SOON) pubRefresh();      // trop ancienne : relue en arrière-plan, l'ancienne part tout de suite
  if (!PUB.raw) return json(res, 503, { error: 'unavailable', message: 'Decks publics momentanément indisponibles.' }, { 'Retry-After': '60' });
  const gz = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || '')), hd = { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache', ETag: PUB.etag, Vary: 'Accept-Encoding' };
  if (notModified(req, PUB.etag)) { delete hd['Content-Type']; res.writeHead(304, hd); return res.end(); }
  const body = gz ? PUB.gz : PUB.raw; if (gz) hd['Content-Encoding'] = 'gzip';
  hd['Content-Length'] = body.length; res.writeHead(200, hd);
  return res.end(req.method === 'HEAD' ? undefined : body);
}

/* ── Amis : /api/friends… (demandes, liste, page d'un ami, notifications de chaque compte) ──────────────────────────────────────
   Un ami s'ajoute depuis sa liste d'échange publique (lien ou QR code) : « Ajouter en ami » → demande, acceptée ou refusée dans « Compte et réglages › Amis ».
   Deux amis voient l'un chez l'autre la liste d'échange (doublons et cartes recherchées), les decks, et la collection si son propriétaire l'autorise.
   Tout passe par ce serveur (compte de service, portée datastore : hors des règles Firestore) : l'appli ne lit ni n'écrit jamais les collections amis,
   amisdata et amisys (firestore.rules : refus par défaut). Un compte y est noté par l'empreinte SHA-256 de son UID (comme le champ o des partages) :
   aucun UID n'y est écrit, aucun n'est renvoyé. Jeton Firebase exigé (x-firebase-token) : tout compte du projet, sans la liste ALLOWED_UIDS.
   · amis/{empreinte} { j: JSON, at } : pseudo et miniature (64 px) du profil, langue, amis (f : empreinte → depuis), demandes reçues (i) et envoyées (o),
     refus (x : plus aucune demande de ce compte pendant 30 jours, sans le lui dire), appareils (d : cibles push, 8 au plus, retirées quand le service
     les refuse), empreintes courtes des cartes à échanger (hk) et cherchées (wk), file du résumé « un ami a une carte que tu cherches » (w),
     demandes du jour (r), parties envoyées (has : date, empreinte, nombre).
   · amisdata/{empreinte}_t | _d | _c { j, at } : liste d'échange (contenu du lien public), decks, collection (seulement si partagée) ; envoyées par les
     appareils du compte quand elles changent, tant qu'il a un ami ou une demande envoyée ; lues par ses amis seulement ; effacées sinon.
   · amisys/due { j } : résumés en attente (empreinte → heure d'envoi), relus au premier appel après un démarrage.
   Un seul processus écrit : les modifications d'un compte passent l'une après l'autre (amLock) ; documents gardés 10 min en mémoire.
   notifyUser(compte, message) : notification sur tous les appareils enregistrés d'un compte, dans la langue de chacun (demandes, acceptations,
   cartes cherchées, invitations à un échange en direct : /api/troc). Toucher : ./?amis=1 (feuille Amis), ./?ami=<empreinte> (page de l'ami) ou ./?troc=<code>, voir push.js.
   « Un ami a une carte que tu cherches » : calculé ici quand sa liste d'échange gagne des cartes que tu cherches ; une notification par jour au plus,
   la suivante regroupe tout ce qui est arrivé entre-temps.
   Bornes : 200 amis (FRIENDS_MAX), 100 demandes reçues, 50 envoyées, 40 demandes par jour et par compte, 30 par heure et par réseau, pas soi-même.
   FRIENDS=0, ou sans compte de service : coupé (/__ping amis: false, l'appli cache tout). */
const AM_ON = FCM_ON && process.env.FRIENDS !== '0';
const AM_MAX = Math.max(1, Number(process.env.FRIENDS_MAX) || 200), AM_INC = 100, AM_OUT = 50, AM_DEVS = 8, AM_X = 300, AM_KEYS = 8000;
const AM_DECLINE = Number(process.env.FRIENDS_DECLINE_MS ?? 30 * 86400e3), AM_ASK_DAY = Number(process.env.FRIENDS_ASK_PER_DAY) || 40, AM_ASK_H = Number(process.env.FRIENDS_ASK_PER_H ?? 30);
const AM_GAP = Number(process.env.FRIENDS_WANT_GAP_MS ?? 86400e3);      // « un ami a une carte que tu cherches » : une notification par jour au plus
const AM_PART = 1000000, AM_BODY = 1100 * 1024, AM_TTL = 10 * 60e3, AM_CACHE = 3000, AM_CACHE_MB = (Number(process.env.FRIENDS_CACHE_MB) || 24) * 1024 * 1024;
const AM_LANGS = ['fr', 'en', 'de', 'es', 'it', 'pt'], AM_TAG = /^[0-9a-f]{64}$/, AM_PARTS = ['t', 'd', 'c'], AM_SID = /^[A-Za-z0-9]{12,40}$/, AM_URL = /^\.\/(\?[\w=&.%-]{0,160})?$/;
const AMI = { cache: new Map(), bytes: 0, locks: new Map(), shares: new Map(), due: new Map(), timers: new Map(), dueT: null, booted: false };
const amTag = uid => createHash('sha256').update(String(uid)).digest('hex');
const amN = o => Object.keys(o || {}).length;
/** Empreinte courte d'une carte (nom comparé comme ownKey de l'appli) : « il a ce que tu cherches » sans garder les listes en clair dans le document du compte. */
const amKey = n => createHash('sha1').update(NM_CORE && NM_CORE.ownKey ? NM_CORE.ownKey(String(n)) : String(n).toLowerCase().trim()).digest('base64url').slice(0, 9);
/** Pseudo : nettoyé comme profClean (decks.js), refusé (vide) s'il contient un mot du filtre des decks publics. */
const amName = v => { const s = typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30).trim() : ''; return s && !(NM_CORE && NM_CORE.pubBad && NM_CORE.pubBad(s)) ? s : ''; };
const amPic = v => (typeof v === 'string' && v.length <= 8000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : '');
const amLang = v => (AM_LANGS.includes(v) ? v : 'fr');
const amNew = () => ({ v: 1, n: '', p: '', l: 'fr', c: 0, s: '', f: {}, i: {}, o: {}, x: {}, d: [], hk: [], wk: [], has: {}, w: null, r: null });
function amRead(j) {
  let o; try { o = JSON.parse(j); } catch (e) { return null; }
  if (!o || typeof o !== 'object') return null;
  const s = amNew();
  for (const k of Object.keys(s)) if (o[k] != null && typeof o[k] === typeof s[k] && Array.isArray(o[k]) === Array.isArray(s[k])) s[k] = o[k];
  for (const k of ['w', 'r']) if (o[k] && typeof o[k] === 'object') s[k] = o[k];
  return s;
}

/* Documents Firestore (API REST, compte de service) : un champ j (JSON) et sa date. */
const fsPath = p => `${FS_BASE}/v1/projects/${fcmSa.project}/databases/(default)/documents/${p}`;
const fsStr = (j, at) => ({ j: { stringValue: j }, at: { integerValue: String(at) } });
/** GET → document ou null (absent) ; PATCH → crée ou remplace ; DELETE. Jeton révoqué : un nouveau, un seul essai. Erreur : e.http. */
async function fsDoc(method, path, fields) {
  for (let a = 0; ; a++) {
    const tok = await fcmAccess(DS_SCOPE);
    const r = await fetch(fsPath(path), { method, signal: AbortSignal.timeout(15000), redirect: 'manual',
      headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', ...(fields ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) }, ...(fields ? { body: JSON.stringify({ fields }) } : {}) });
    if (r.status === 401 && a === 0) { await r.arrayBuffer().catch(() => {}); fcmAuth.get(DS_SCOPE).tok = ''; continue; }
    if (r.status === 404 && method !== 'PATCH') { await r.arrayBuffer().catch(() => {}); return null; }
    const j = await r.json().catch(() => null);
    if (!r.ok) { const e = new Error(path.split('/')[0] + ' : HTTP ' + r.status + (j && j.error && j.error.message ? ' ' + String(j.error.message).slice(0, 120) : '')); e.http = r.status; throw e; }
    return j || {};
  }
}
/** Cache des comptes (3 000 au plus, 24 Mo de JSON au plus : FRIENDS_CACHE_MB) ; les plus anciens partent d'abord. */
function amMem(tag, s, size = 0) {
  const old = AMI.cache.get(tag); if (old) { AMI.bytes -= old.b; AMI.cache.delete(tag); }
  AMI.cache.set(tag, { s, at: Date.now(), b: size }); AMI.bytes += size;
  while (AMI.cache.size > AM_CACHE || (AMI.bytes > AM_CACHE_MB && AMI.cache.size > 1)) { const [k, v] = AMI.cache.entries().next().value; AMI.bytes -= v.b; AMI.cache.delete(k); }
}
/** État d'un compte (null : aucun document). fresh : relu dans Firestore (toute modification part de là). */
async function amGet(tag, fresh = false) {
  const c = AMI.cache.get(tag);
  if (!fresh && c && Date.now() - c.at < AM_TTL) return c.s;
  const d = await fsDoc('GET', 'amis/' + tag), j = d ? String(fsFields(d).j || '') : '', s = d ? amRead(j) : null;
  amMem(tag, s, j.length); return s;
}
async function amSave(tag, s) {
  const j = s ? JSON.stringify(s) : '';
  if (s) await fsDoc('PATCH', 'amis/' + tag, fsStr(j, Date.now())); else await fsDoc('DELETE', 'amis/' + tag);
  amMem(tag, s, j.length);
}
/** Modifications d'un ou deux comptes l'une après l'autre (un seul processus serveur : une file par compte suffit ; deux comptes : les deux files). */
function amLock(keys, fn) {
  keys = [...new Set(keys)];
  const run = Promise.all(keys.map(k => AMI.locks.get(k))).then(fn), tail = run.then(() => {}, () => {});
  for (const k of keys) AMI.locks.set(k, tail);
  tail.then(() => { for (const k of keys) if (AMI.locks.get(k) === tail) AMI.locks.delete(k); });
  return run;
}
/** Relit les comptes dans Firestore, applique fn(états) (peut créer : st[t] = amNew(), ou effacer : st[t] = null), enregistre ceux qui ont changé. */
function amEdit(tags, fn) {
  return amLock(tags, async () => {
    const st = {}, was = {};
    for (const t of new Set(tags)) { st[t] = await amGet(t, true); was[t] = JSON.stringify(st[t]); }
    const out = await fn(st);
    for (const t of Object.keys(st)) if (JSON.stringify(st[t]) !== was[t]) await amSave(t, st[t]);
    return out;
  });
}
async function amEach(list, fn, conc = 12) { let i = 0; await Promise.all(Array.from({ length: Math.min(conc, list.length) }, async () => { while (i < list.length) await fn(list[i++]); })); }
/** Plus d'ami ni de demande envoyée : ses parties (liste, decks, collection) ne servent plus, à effacer. Vrai si c'est le cas. */
function amIdle(s) {
  if (!s || amN(s.f) || amN(s.o) || !amN(s.has)) return false;
  s.has = {}; s.hk = []; s.wk = []; return true;
}
const amDropParts = tag => Promise.all(AM_PARTS.map(p => fsDoc('DELETE', `amisdata/${tag}_${p}`).catch(e => console.warn('Amis : ' + e.message))));
/** Plus rien entre a et b (amitié, demandes, résumé en attente) ; drop : comptes qui n'ont plus d'ami (parties à effacer). */
function amUnlink(st, a, b, drop) {
  for (const [x, y] of [[a, b], [b, a]]) {
    const s = st[x]; if (!s) continue;
    delete s.f[y]; delete s.i[y]; delete s.o[y];
    if (s.w && Array.isArray(s.w.q)) s.w.q = s.w.q.filter(e => e.f !== y);
    if (amIdle(s)) drop.push(x);
  }
}

/** Propriétaire d'un partage (lien public) : son empreinte (champ o) et le pseudo du lien, gardés 10 min. null : lien absent. */
async function amOwner(sid) {
  const c = AMI.shares.get(sid); if (c && Date.now() - c.at < AM_TTL) return c;
  const d = await fsDoc('GET', 'shares/' + sid); let o = null;
  if (d) {
    const f = fsFields(d);
    if (typeof f.o === 'string' && AM_TAG.test(f.o)) { let by = ''; try { by = amName(JSON.parse(f.d || '{}').by); } catch (e) { /* pseudo illisible */ } o = { o: f.o, by, at: Date.now() }; }
  }
  if (AMI.shares.size > 2000) AMI.shares.clear();
  if (o) AMI.shares.set(sid, o); else AMI.shares.delete(sid);
  return o;
}

/* ── Notifications d'un compte ─────────────────────────────────────────────────────────────────── */
/**
 * Notification sur tous les appareils enregistrés d'un compte (Web Push ou FCM), dans la langue de chacun (amis, invitations à un échange en direct : trocNew).
 * who : UID Firebase ou empreinte (64 hex). msg : { title, body, url, tag, ttl? } ou lang => { … } (texte dans la langue de l'appareil : fr, en, de, es, it, pt).
 * url : « ./?… » (ouvert par l'appli au toucher, push.js › pushOpen) ; tag : sujet (une notification du même sujet remplace la précédente).
 * Cible refusée par le service (404 / 410) : retirée du compte. Retourne le nombre d'appareils prévenus.
 */
async function notifyUser(who, msg) {
  if (!AM_ON) return 0;
  const tag = AM_TAG.test(String(who)) ? String(who) : amTag(who);
  let s; try { s = await amGet(tag); } catch (e) { return 0; }
  if (!s || !s.d.length) return 0;
  let sent = 0; const dead = [];
  for (const d of s.d) {
    const m = typeof msg === 'function' ? msg(amLang(d.l || s.l)) : msg; if (!m || !m.title) continue;
    const tg = String(m.tag || 'mo-amis').replace(/[^\w-]/g, '').slice(0, 32) || 'mo-amis';
    const st = await sendPush({ sub: d.sub, title: String(m.title).slice(0, 80), body: String(m.body || '').slice(0, 200), url: AM_URL.test(m.url) ? m.url : './', kind: 'open', tag: tg, topic: tg, ttl: m.ttl || 86400, urgency: 'normal' });
    if (st && st < 300) sent++; else if (st === 404 || st === 410) dead.push(d.k); else console.warn('Amis : notification refusée (' + (st || 'réseau') + ')');
  }
  if (dead.length) amEdit([tag], st => { const o = st[tag]; if (o) o.d = o.d.filter(x => !dead.includes(x.k)); }).then(() => console.warn('Amis : ' + dead.length + ' appareil(s) périmé(s) retiré(s)'), () => {});
  return sent;
}
// Textes des notifications, dans la langue de l'appareil (français par défaut).
const AM_TXT = {
  fr: { anon: 'Un joueur', and: ' et ', ask: n => ['Demande d\'ami', `${n} veut t'ajouter en ami sur Mana Orbit.`], ok: n => ['Demande acceptée', `${n} a accepté ta demande d'ami.`],
    w1: n => `${n} a une carte que tu cherches`, wN: n => `${n} a des cartes que tu cherches`, wM: 'Tes amis ont des cartes que tu cherches',
    b1: (n, c) => `${n} vient d'ajouter ${c}, que tu cherches.`, bN: (n, c, k) => `${n} vient d'ajouter ${c} et ${k} autre${k > 1 ? 's' : ''} carte${k > 1 ? 's' : ''} que tu cherches.`, bM: (ns, k) => `${ns} ont ajouté ${k} cartes que tu cherches.` },
  en: { anon: 'A player', and: ' and ', ask: n => ['Friend request', `${n} wants to add you as a friend on Mana Orbit.`], ok: n => ['Request accepted', `${n} accepted your friend request.`],
    w1: n => `${n} has a card you want`, wN: n => `${n} has cards you want`, wM: 'Your friends have cards you want',
    b1: (n, c) => `${n} just added ${c}, which you're looking for.`, bN: (n, c, k) => `${n} just added ${c} and ${k} more card${k > 1 ? 's' : ''} you're looking for.`, bM: (ns, k) => `${ns} added ${k} cards you're looking for.` },
  de: { anon: 'Ein Spieler', and: ' und ', ask: n => ['Freundschaftsanfrage', `${n} möchte dich auf Mana Orbit als Freund hinzufügen.`], ok: n => ['Anfrage angenommen', `${n} hat deine Freundschaftsanfrage angenommen.`],
    w1: n => `${n} hat eine Karte, die du suchst`, wN: n => `${n} hat Karten, die du suchst`, wM: 'Deine Freunde haben Karten, die du suchst',
    b1: (n, c) => `${n} hat gerade ${c} hinzugefügt – die Karte suchst du.`, bN: (n, c, k) => `${n} hat gerade ${c} und ${k} weitere Karte${k > 1 ? 'n' : ''} hinzugefügt, die du suchst.`, bM: (ns, k) => `${ns} haben ${k} Karten hinzugefügt, die du suchst.` },
  es: { anon: 'Un jugador', and: ' y ', ask: n => ['Solicitud de amistad', `${n} quiere añadirte como amigo en Mana Orbit.`], ok: n => ['Solicitud aceptada', `${n} ha aceptado tu solicitud de amistad.`],
    w1: n => `${n} tiene una carta que buscas`, wN: n => `${n} tiene cartas que buscas`, wM: 'Tus amigos tienen cartas que buscas',
    b1: (n, c) => `${n} acaba de añadir ${c}, que estás buscando.`, bN: (n, c, k) => `${n} acaba de añadir ${c} y ${k} carta${k > 1 ? 's' : ''} más que estás buscando.`, bM: (ns, k) => `${ns} han añadido ${k} cartas que buscas.` },
  it: { anon: 'Un giocatore', and: ' e ', ask: n => ['Richiesta di amicizia', `${n} vuole aggiungerti come amico su Mana Orbit.`], ok: n => ['Richiesta accettata', `${n} ha accettato la tua richiesta di amicizia.`],
    w1: n => `${n} ha una carta che cerchi`, wN: n => `${n} ha delle carte che cerchi`, wM: 'I tuoi amici hanno carte che cerchi',
    b1: (n, c) => `${n} ha appena aggiunto ${c}, che stai cercando.`, bN: (n, c, k) => `${n} ha appena aggiunto ${c} e ${k > 1 ? `altre ${k} carte` : 'un\'altra carta'} che stai cercando.`, bM: (ns, k) => `${ns} hanno aggiunto ${k} carte che cerchi.` },
  pt: { anon: 'Um jogador', and: ' e ', ask: n => ['Pedido de amizade', `${n} quer adicionar você como amigo no Mana Orbit.`], ok: n => ['Pedido aceito', `${n} aceitou seu pedido de amizade.`],
    w1: n => `${n} tem uma carta que você procura`, wN: n => `${n} tem cartas que você procura`, wM: 'Seus amigos têm cartas que você procura',
    b1: (n, c) => `${n} acabou de adicionar ${c}, que você procura.`, bN: (n, c, k) => `${n} acabou de adicionar ${c} e mais ${k} carta${k > 1 ? 's' : ''} que você procura.`, bM: (ns, k) => `${ns} adicionaram ${k} cartas que você procura.` },
};
const amJoin = (L, ns) => (ns.length < 2 ? ns[0] || '' : ns.slice(0, -1).join(', ') + L.and + ns[ns.length - 1]);
/** Nom d'une carte pour la langue de l'appareil : nom imprimé (f, langue fl, français sans elle) s'il est dans cette langue, sinon l'anglais. */
const amCard = (c, l) => (c.f && l === (c.fl || 'fr') ? c.f : c.n);
/** Demande reçue (ask) ou acceptée (ok) : prévient « to » ; from : celui qui agit (sa page s'ouvre au toucher d'une acceptation). */
function amNote(kind, to, from, name) {
  notifyUser(to, l => { const L = AM_TXT[l], [title, body] = L[kind](name || L.anon); return { title, body, url: kind === 'ask' ? './?amis=1' : './?ami=' + from, tag: 'mo-amis-' + kind }; }).catch(() => {});
}

/* ── « Un ami a une carte que tu cherches » : une notification par jour au plus, regroupée ─────────── */
/** Sa liste d'échange vient de gagner des cartes (added : empreinte → { n, f?, fl? }) : chaque ami qui en cherche une est prévenu (ou mis en file). */
async function amFan(from, added) {
  const s = await amGet(from).catch(() => null); if (!s) return;
  for (const to of Object.keys(s.f)) {
    let o; try { o = await amGet(to); } catch (e) { continue; }
    if (!o || !o.f[from] || !o.wk.length) continue;
    const wk = new Set(o.wk), hit = [...added].filter(([k]) => wk.has(k)).map(([, c]) => c);
    if (hit.length) await amWant(to, from, hit.slice(0, 12)).catch(e => console.warn('Amis : ' + e.message));
  }
}
async function amWant(to, from, cards) {
  let send = null, due = 0;
  await amEdit([to], st => {
    const o = st[to]; if (!o || !o.f[from]) return;
    const w = o.w && Array.isArray(o.w.q) ? o.w : { at: 0, q: [] };
    let e = w.q.find(x => x.f === from); if (!e) { e = { f: from, c: [] }; w.q.push(e); }
    for (const c of cards) if (!e.c.some(y => y.n === c.n)) e.c.push(c);
    e.c = e.c.slice(-12); w.q = w.q.slice(-10);
    const now = Date.now();
    if (now - (Number(w.at) || 0) >= AM_GAP) { send = w.q; w.q = []; w.at = now; w.due = 0; } else w.due = due = Number(w.at) + AM_GAP;
    o.w = w;
  });
  if (send) await amWantSend(to, send); else if (due) amDue(to, due);
}
async function amWantSend(to, q) {
  const names = new Map();
  for (const e of q) { const s = await amGet(e.f).catch(() => null); if (s && s.n) names.set(e.f, s.n); }
  const n = q.reduce((a, e) => a + e.c.length, 0);
  return notifyUser(to, l => {
    const L = AM_TXT[l], who = e => names.get(e.f) || L.anon, e = q[0];
    const m = q.length > 1 ? { title: L.wM, body: L.bM(amJoin(L, q.slice(0, 3).map(who)), n) } : e.c.length > 1 ? { title: L.wN(who(e)), body: L.bN(who(e), amCard(e.c[0], l), e.c.length - 1) } : { title: L.w1(who(e)), body: L.b1(who(e), amCard(e.c[0], l)) };
    return { ...m, url: q.length > 1 ? './?amis=1' : './?ami=' + e.f, tag: 'mo-amis-want' };
  });
}
/** Résumé à envoyer à l'heure at (0 : rien) : minuteur en mémoire, copie dans amisys/due (relue au démarrage). quiet : sans réécrire la copie. */
function amDue(tag, at, quiet) {
  clearTimeout(AMI.timers.get(tag)); AMI.timers.delete(tag);
  if (at) { AMI.due.set(tag, at); const t = setTimeout(() => amDueFire(tag), Math.max(1000, Math.min(at - Date.now(), 2 ** 31 - 1))); t.unref(); AMI.timers.set(tag, t); } else AMI.due.delete(tag);
  if (quiet) return;
  clearTimeout(AMI.dueT);
  AMI.dueT = setTimeout(() => amLock(['~due'], () => fsDoc('PATCH', 'amisys/due', fsStr(JSON.stringify(Object.fromEntries(AMI.due)), Date.now()))).catch(e => console.warn('Amis : ' + e.message)), 800);
  AMI.dueT.unref();
}
async function amDueFire(tag) {
  AMI.timers.delete(tag);
  let send = null, later = 0;
  try {
    await amEdit([tag], st => {
      const o = st[tag]; if (!o || !o.w || !Array.isArray(o.w.q) || !o.w.q.length) return;
      const at = Number(o.w.at) || 0; if (Date.now() - at < AM_GAP - 1000) { later = at + AM_GAP; return; }
      send = o.w.q.filter(e => o.f[e.f] && e.c.length); o.w = { at: send.length ? Date.now() : at, q: [], due: 0 };
    });
  } catch (e) { amDue(tag, Date.now() + 600e3); return; }      // Firestore injoignable : nouvel essai dans 10 min
  amDue(tag, later);
  if (send && send.length) await amWantSend(tag, send).catch(() => {});
}
/** Premier appel de /api/friends après le démarrage (jamais avant : aucun accès à Firestore tant que personne ne s'en sert) : résumés en attente relus,
    ceux dont l'heure est passée partent à quelques secondes d'écart. */
async function amBoot() {
  if (AMI.booted) return; AMI.booted = true;
  try {
    const d = await fsDoc('GET', 'amisys/due'); let o = {}; try { o = d ? JSON.parse(fsFields(d).j || '{}') : {}; } catch (e) { o = {}; }
    let i = 0; for (const [t, at] of Object.entries(o || {})) if (AM_TAG.test(t) && Number(at) > 0) amDue(t, Math.max(Number(at), Date.now() + 5000 + 2000 * i++), true);
  } catch (e) { console.warn('Amis : résumés en attente illisibles (' + e.message + ')'); }
}

/* ── Routes ──────────────────────────────────────────────────────────────────────────────────────── */
/** Compte connecté ({ uid, tag }) ou réponse d'erreur envoyée (null). */
async function amAuth(req, res, msg = 'Connecte-toi pour utiliser les amis.') {      // msg : aussi pour l'échange en direct (/api/troc)
  const tok = String(req.headers['x-firebase-token'] || '');
  if (!tok) { json(res, 401, { error: 'auth_required', message: msg }); return null; }
  if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' }); return null; }
  try { const u = await verifyIdToken(tok, true); return { uid: u.uid, tag: amTag(u.uid) }; }
  catch (e) {
    const code = e && e.authCode;
    if (code === 'expired') json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
    else if (code === 'unavailable') json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { 'Retry-After': '5' });
    else await badKey(req, res, 'bad_token', 401);
    return null;
  }
}
/** Réponse JSON, compressée quand elle est grosse (liste d'échange, collection d'un ami). */
async function amSend(req, res, obj) {
  const b = Buffer.from(JSON.stringify(obj));
  if (b.length < 8192 || !/\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''))) return json(res, 200, obj);
  const z = await gzipA(b);
  res.writeHead(200, { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding', 'Content-Length': z.length });
  res.end(z);
}
async function amBody(req, res, max = 64 * 1024) {
  try { const b = JSON.parse((await readBody(req, max)).toString('utf8') || '{}'); return b && typeof b === 'object' && !Array.isArray(b) ? b : {}; }
  catch (e) { if (e.status === 413) tooLarge(res); else json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); return null; }
}
/** Profil envoyé avec une demande, une réponse ou PUT me : pseudo (filtré), miniature, langue. */
function amProfile(s, b) { if ('n' in b) s.n = amName(b.n); if ('p' in b) s.p = amPic(b.p); if ('l' in b) s.l = amLang(b.l); }
const AM_ERR = { max: [409, 'Liste d\'amis pleine.'], full: [409, 'Demande impossible pour l\'instant.'], out_full: [409, 'Trop de demandes en attente.'], rate: [429, 'Trop de demandes aujourd\'hui.'] };
const amFail = (res, code) => json(res, AM_ERR[code][0], { error: code, message: AM_ERR[code][1] });

/** GET /api/friends : amis (pseudo, miniature, cartes qu'il a pour toi m, que tu as pour lui g, lien d'échange s, collection partagée c, nombres de decks nd et de cartes nc),
    demandes reçues et envoyées, réglage de la collection. need : les parties de ce compte servent (un ami ou une demande envoyée). */
async function amList(req, res, me) {
  const s = await amGet(me.tag);
  if (!s) return json(res, 200, { on: true, me: { c: 0, dev: 0 }, friends: [], inc: [], out: [], need: false, max: AM_MAX });
  const ids = [...new Set([...Object.keys(s.f), ...Object.keys(s.i), ...Object.keys(s.o)])], docs = new Map();
  await amEach(ids, async t => { try { docs.set(t, await amGet(t)); } catch (e) { /* injoignable : passé cette fois */ } });
  const wk = new Set(s.wk), hk = new Set(s.hk), cnt = (a, set) => a.reduce((n, k) => n + (set.has(k) ? 1 : 0), 0);
  const who = (t, at) => { const o = docs.get(t); return o ? { id: t, n: o.n, ...(o.p ? { p: o.p } : {}), at: Number(at) || 0 } : null; };
  const friends = Object.entries(s.f).map(([t, at]) => {
    const o = docs.get(t), w = who(t, at); if (!w || !o.f[me.tag]) return null;
    return { ...w, m: cnt(o.hk, wk), g: cnt(o.wk, hk), s: o.s || '', c: o.c ? 1 : 0, u: Number(o.has.t) || 0, nd: o.has.d ? Number(o.has.dn) || 0 : 0, nc: o.c && o.has.c ? Number(o.has.cn) || 0 : 0 };
  }).filter(Boolean).sort((a, b) => b.m - a.m || a.n.localeCompare(b.n));
  const side = m => Object.entries(m).map(([t, at]) => who(t, at)).filter(Boolean).sort((a, b) => b.at - a.at);
  const gone = ids.filter(t => docs.has(t) && docs.get(t) === null);      // compte supprimé : retiré de la liste
  if (gone.length) amEdit([me.tag], st => { const o = st[me.tag]; if (o) for (const t of gone) { delete o.f[t]; delete o.i[t]; delete o.o[t]; } }).catch(() => {});
  return amSend(req, res, { on: true, me: { c: s.c, dev: s.d.length, has: { t: Number(s.has.t) || 0, d: Number(s.has.d) || 0, c: Number(s.has.c) || 0 } }, friends, inc: side(s.i), out: side(s.o), need: !!(amN(s.f) || amN(s.o)), max: AM_MAX, tr: trocInvFor(me.tag) });      // tr : invitations à un échange en direct qui l'attendent
}
/** PUT /api/friends/me : profil, réglage de la collection, lien d'échange, appareil (dev : cible push ; off : clé d'un appareil à retirer), une partie (part, j : son JSON, k : nombre de cartes ou de decks). */
async function amPutMe(req, res, me) {
  const wait = rateWait(req, 'amput', 600, 3600e3); if (wait) return tooMany(res, wait);      // l'appli envoie après 20 s sans changement : une maison entière derrière une même adresse y tient
  const b = await amBody(req, res, AM_BODY); if (!b) return;
  const dev = b.dev ? parseTarget(b.dev) : null;
  if (b.dev && !dev) return json(res, 400, { error: 'bad_subscription', message: 'Abonnement push invalide ou refusé.' });
  const part = AM_PARTS.includes(b.part) && typeof b.j === 'string' ? b.part : '';
  if (part && Buffer.byteLength(b.j) > AM_PART) return tooLarge(res);
  let tj = null;
  try { const v = part ? JSON.parse(b.j) : null; if (part === 't') { if (!v || !Array.isArray(v.have) || !Array.isArray(v.want)) throw new Error('t'); tj = v; } else if (part && !Array.isArray(v)) throw new Error(part); }
  catch (e) { return json(res, 400, { error: 'bad_request', message: 'Partie illisible.' }); }
  let added = null, dk = '', drop = false;
  const out = await amEdit([me.tag], async st => {
    let s = st[me.tag];
    if (!s) { if (!dev && !('c' in b)) return { need: false }; s = st[me.tag] = amNew(); }      // compte sans document : créé seulement pour un appareil ou le réglage de la collection
    amProfile(s, b);
    if ('s' in b) s.s = typeof b.s === 'string' && AM_SID.test(b.s) ? b.s : '';
    if ('c' in b) { s.c = b.c ? 1 : 0; if (!s.c && s.has.c) { delete s.has.c; delete s.has.ch; delete s.has.cn; drop = true; } }      // collection plus partagée : effacée tout de suite
    if (dev) { dk = alId(pushKey(dev)); s.d = [{ k: dk, sub: dev, l: amLang(b.l || s.l), at: Date.now() }, ...s.d.filter(x => x.k !== dk)].slice(0, AM_DEVS); }
    if (typeof b.off === 'string') s.d = s.d.filter(x => x.k !== b.off);
    const need = !!(amN(s.f) || amN(s.o));
    if (part && need && !(part === 'c' && !s.c)) {
      const h = createHash('sha1').update(b.j).digest('base64url').slice(0, 16);
      if (s.has[part + 'h'] !== h) {
        await fsDoc('PATCH', `amisdata/${me.tag}_${part}`, fsStr(b.j, Date.now()));
        if (tj) {
          const keys = a => [...new Set(a.map(x => (x && typeof x.n === 'string' && x.n ? amKey(x.n) : '')).filter(Boolean))].slice(0, AM_KEYS);
          if (s.has.th) {      // déjà une liste avant : les cartes nouvelles (la toute première liste ne prévient personne)
            const old = new Set(s.hk); added = new Map();
            for (const x of tj.have) { const k = x && typeof x.n === 'string' && x.n ? amKey(x.n) : ''; if (k && !old.has(k) && !added.has(k) && added.size < 60) added.set(k, { n: String(x.n).slice(0, 80), ...(typeof x.f === 'string' && x.f ? { f: x.f.slice(0, 80) } : {}), ...(AM_LANGS.includes(x.fl) ? { fl: x.fl } : {}) }); }
          }
          s.hk = keys(tj.have); s.wk = keys(tj.want);
        }
        s.has[part] = Date.now(); s.has[part + 'h'] = h; s.has[part + 'n'] = Math.max(0, Math.min(1e6, Math.floor(Number(b.k)) || 0));
      }
    }
    return { need, c: s.c, dev: s.d.length, has: { t: s.has.t || 0, d: s.has.d || 0, c: s.has.c || 0 } };
  });
  if (drop) await fsDoc('DELETE', `amisdata/${me.tag}_c`).catch(e => console.warn('Amis : ' + e.message));
  if (added && added.size) amFan(me.tag, added).catch(e => console.warn('Amis : ' + e.message));
  return json(res, 200, { ok: true, ...out, ...(dk ? { dk } : {}) });
}
/** GET /api/friends/state?share=<id> : où en est ce compte avec le propriétaire de ce lien (self, friend, sent, asked : il t'a fait une demande, none) et son empreinte. */
async function amState(req, res, me, url) {
  const sid = String(url.searchParams.get('share') || ''); if (!AM_SID.test(sid)) return json(res, 400, { error: 'bad_request', message: 'Lien invalide.' });
  const ow = await amOwner(sid); if (!ow) return json(res, 404, { error: 'share_gone', message: 'Ce lien ne marche plus.' });
  if (ow.o === me.tag) return json(res, 200, { state: 'self' });
  const s = await amGet(me.tag);
  return json(res, 200, { state: !s ? 'none' : s.f[ow.o] ? 'friend' : s.i[ow.o] ? 'asked' : s.o[ow.o] ? 'sent' : 'none', id: ow.o });
}
/** POST /api/friends/ask { share, n, p, l } : demande au propriétaire du lien (il t'avait déjà fait une demande : vous voilà amis). Refusée il y a moins de 30 jours :
    « envoyée » quand même, mais rien n'arrive chez l'autre (un refus n'est jamais révélé). */
async function amAsk(req, res, me) {
  const wait = rateWait(req, 'amask', AM_ASK_H, 3600e3); if (wait) return tooMany(res, wait);
  const b = await amBody(req, res); if (!b) return;
  const sid = String(b.share || ''); if (!AM_SID.test(sid)) return json(res, 400, { error: 'bad_request', message: 'Lien invalide.' });
  const ow = await amOwner(sid); if (!ow) return json(res, 404, { error: 'share_gone', message: 'Ce lien ne marche plus.' });
  if (ow.o === me.tag) return json(res, 200, { state: 'self' });
  const to = ow.o, now = Date.now(); let note = '';
  const r = await amEdit([me.tag, to], st => {
    const a = st[me.tag] || (st[me.tag] = amNew()), t = st[to] || Object.assign(amNew(), { n: ow.by });
    amProfile(a, b);
    if (a.f[to] && t.f[me.tag]) return { state: 'friend', id: to };
    if (a.i[to] && t.o[me.tag]) {      // l'autre avait déjà fait une demande : acceptée
      if (amN(a.f) >= AM_MAX || amN(t.f) >= AM_MAX) return { error: 'max' };
      delete a.i[to]; delete t.o[me.tag]; a.f[to] = t.f[me.tag] = now; st[to] = t; note = 'ok'; return { state: 'friend', id: to, accepted: true };
    }
    if (amN(a.f) >= AM_MAX) return { error: 'max' };
    const blocked = (Number(t.x[me.tag]) || 0) > now;
    if (a.o[to] && (t.i[me.tag] || blocked)) return { state: 'sent', id: to };
    const day = new Date(now).toISOString().slice(0, 10); if (!a.r || a.r.d !== day) a.r = { d: day, n: 0 };
    if (a.r.n >= AM_ASK_DAY) return { error: 'rate' };
    if (!a.o[to] && amN(a.o) >= AM_OUT) return { error: 'out_full' };
    if (!blocked && (amN(t.i) >= AM_INC || amN(t.f) >= AM_MAX)) return { error: 'full' };
    a.r.n++; a.o[to] = now;
    if (!blocked) { t.i[me.tag] = now; st[to] = t; note = 'ask'; }
    return { state: 'sent', id: to };
  });
  if (r.error) return amFail(res, r.error);
  if (note) amNote(note, to, me.tag, ((await amGet(me.tag).catch(() => null)) || {}).n);
  return json(res, 200, r);
}
/** POST /api/friends/answer { id, ok, n, p, l } : accepte (vous voilà amis, il est prévenu) ou refuse (sans rien lui dire ; plus de demande de sa part pendant 30 jours). */
async function amAnswer(req, res, me) {
  const b = await amBody(req, res); if (!b) return;
  const id = String(b.id || ''); if (!AM_TAG.test(id) || id === me.tag) return json(res, 400, { error: 'bad_request', message: 'Compte invalide.' });
  const now = Date.now(); let note = false;
  const r = await amEdit([me.tag, id], st => {
    const a = st[me.tag], t = st[id];
    if (!a) return { state: 'none' };
    amProfile(a, b);
    if (a.f[id]) return { state: 'friend' };
    if (!a.i[id]) return { state: 'none' };
    if (b.ok && t && (amN(a.f) >= AM_MAX || amN(t.f) >= AM_MAX)) return { error: 'max' };
    delete a.i[id];
    if (!t) return { state: 'none' };
    if (b.ok) { delete t.o[me.tag]; a.f[id] = t.f[me.tag] = now; note = true; return { state: 'friend' }; }
    // refus : sa demande reste « envoyée » de son côté (le refus n'est jamais révélé), et plus aucune ne passe pendant 30 jours
    a.x[id] = now + AM_DECLINE;
    a.x = Object.fromEntries(Object.entries(a.x).filter(([, u]) => Number(u) > now).sort((p, q) => q[1] - p[1]).slice(0, AM_X));
    return { state: 'none' };
  });
  if (r.error) return amFail(res, r.error);
  if (note) amNote('ok', id, me.tag, ((await amGet(me.tag).catch(() => null)) || {}).n);
  return json(res, 200, r);
}
/** POST /api/friends/remove { id } : plus amis (ou demande annulée, dans un sens ou dans l'autre) ; ni l'un ni l'autre ne voit plus rien de l'autre. */
async function amRemove(req, res, me) {
  const b = await amBody(req, res); if (!b) return;
  const id = String(b.id || ''); if (!AM_TAG.test(id) || id === me.tag) return json(res, 400, { error: 'bad_request', message: 'Compte invalide.' });
  const drop = [];
  await amEdit([me.tag, id], st => amUnlink(st, me.tag, id, drop));
  await Promise.all(drop.map(amDropParts));
  return json(res, 200, { state: 'none' });
}
/** GET /api/friends/view?id=<empreinte>&part=t|d|c : une partie d'un ami (amitié dans les deux sens exigée ; collection seulement s'il la partage). */
async function amView(req, res, me, url) {
  const wait = rateWait(req, 'amview', 600, 3600e3); if (wait) return tooMany(res, wait);
  const id = String(url.searchParams.get('id') || ''), part = String(url.searchParams.get('part') || '');
  if (!AM_TAG.test(id) || !AM_PARTS.includes(part)) return json(res, 400, { error: 'bad_request', message: 'Demande invalide.' });
  const [a, t] = await Promise.all([amGet(me.tag), amGet(id)]);
  if (!a || !t || !a.f[id] || !t.f[me.tag]) return json(res, 403, { error: 'not_friend', message: 'Vous n\'êtes pas (ou plus) amis.' });
  if (part === 'c' && !t.c) return json(res, 403, { error: 'private', message: 'Collection non partagée.' });
  const d = await fsDoc('GET', `amisdata/${id}_${part}`), f = d ? fsFields(d) : {};
  return amSend(req, res, { at: Number(f.at) || 0, j: typeof f.j === 'string' ? f.j : '' });
}
/** DELETE /api/friends/me (suppression du compte) : retiré de chez tous ses amis et de leurs demandes, puis ses documents effacés. */
async function amWipe(req, res, me) {
  const s = await amGet(me.tag, true), drop = [];
  for (const t of new Set(s ? [...Object.keys(s.f), ...Object.keys(s.i), ...Object.keys(s.o)] : [])) {
    await amEdit([t], st => { amUnlink(st, t, me.tag, drop); if (st[t]) delete st[t].x[me.tag]; });
  }
  await amEdit([me.tag], st => { st[me.tag] = null; });
  await Promise.all([amDropParts(me.tag), ...drop.filter(t => t !== me.tag).map(amDropParts)]);
  if (AMI.due.has(me.tag)) amDue(me.tag, 0);
  return json(res, 200, { ok: true });
}
async function friendsApi(req, res, path, url) {
  if (!AM_ON) return json(res, 404, { error: 'friends_disabled', message: 'Amis désactivés sur ce serveur.' });
  const sub = path.replace(/^friends\/?/, ''), me = await amAuth(req, res); if (!me) return;
  amBoot();
  try {
    if (req.method === 'GET' && !sub) { const w = rateWait(req, 'amget', 600, 3600e3); if (w) return tooMany(res, w); return await amList(req, res, me); }
    if (req.method === 'PUT' && sub === 'me') return await amPutMe(req, res, me);
    if (req.method === 'DELETE' && sub === 'me') return await amWipe(req, res, me);
    if (req.method === 'GET' && sub === 'state') return await amState(req, res, me, url);
    if (req.method === 'GET' && sub === 'view') return await amView(req, res, me, url);
    if (req.method === 'POST' && sub === 'ask') return await amAsk(req, res, me);
    if (req.method === 'POST' && sub === 'answer') return await amAnswer(req, res, me);
    if (req.method === 'POST' && sub === 'remove') return await amRemove(req, res, me);
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    if (res.headersSent) throw e;
    console.warn('Amis : ' + String(e && e.message || e).slice(0, 200));
    return json(res, 503, { error: 'unavailable', message: 'Amis momentanément indisponibles.' }, { 'Retry-After': '30' });
  }
}

/* ── Échange en direct : /api/troc… (deux joueurs, chacun sur son téléphone : la « fenêtre d'échange » des RPG) ─────────────────────────────
   L'hôte crée la session (POST /api/troc) : un code de 6 caractères (31 symboles sans 0, O, 1, I ni L : ≈ 887 millions de codes, tirés sans biais)
   montré en QR code (./?troc=<code>) ou dicté ; l'invité la rejoint (POST /api/troc/join). Ou un ami est invité (inv : son empreinte, amitié vérifiée
   dans les deux sens) : notifyUser « Invitation à un échange » (./?troc=<code>), et l'invitation figure dans GET /api/friends (tr) tant que la session l'attend.
   Jeton Firebase exigé pour créer et rejoindre (tout compte du projet, sans ALLOWED_UIDS) ; chaque joueur reçoit une clé de siège (x-troc-key, 144 bits)
   qui sert ensuite à tout : relevé (GET /api/troc/s), listes (GET /api/troc/list), actions (POST /api/troc/op). Aucun UID ni empreinte n'est renvoyé :
   chacun voit « moi » et « l'autre » (pseudo, miniature du profil).
   Sessions EN MÉMOIRE seulement (un seul processus) : un redémarrage les termine (l'appli dit « Session terminée »), rien n'est écrit nulle part.
   · Chaque joueur envoie sa liste d'échange (doublons, une entrée par ligne langue|édition) ; l'autre y demande des cartes (op ask : elles arrivent dans
     « Tu donnes » de celui qui les a, marquées demandées, à accepter ou retirer). Chacun choisit ce qu'il donne (op give : sa liste ou toute sa collection).
   · Prix : ceux du fichier de prix du serveur (tendance Cardmarket, celui que lit l'appli), posés sur chaque carte à son arrivée dans la session ; carte
     absente du fichier (ou serveur sans fichier) : le prix de l'appareil qui l'ajoute. Les deux joueurs voient donc exactement les mêmes valeurs.
   · Version v (tout changement : un relevé sans nouveauté répond « same ») et version du contenu cv : « Prêt » et « Valider » portent la cv que le joueur
     a vue (refusés si le contenu a bougé entre-temps : 409 stale). Tout changement du contenu retire « Prêt » aux deux (règle des RPG).
   · Les deux « Prêt » → confirmation ; les deux « Valider » → done : la session est figée et chaque appli applique SA collection (retire ce qu'elle donne,
     ajoute ce qu'elle reçoit). done n'arrive qu'une fois les deux validés : un joueur parti avant, et rien ne change. Session done gardée 24 h
     (TROC_KEEP_MS) : une appli tuée juste après applique à son retour.
   · Bornes : TROC_MAX sessions ouvertes (300), une à la fois par compte, TROC_NEW_PER_H créations par compte et par heure (20), TROC_BAD_PER_H codes faux
     par compte et par heure (20 ; le double par réseau), 30 min sans requête (TROC_IDLE_MS) ou 3 h en tout : terminée ; listes de 3 000 entrées,
     24 Mo pour toutes les sessions (TROC_MB : au-delà, les listes sont tronquées) ; 100 cartes par côté ; 12 requêtes d'avance par siège (6 par seconde).
   Rien au démarrage : minuterie et prix chargés à la première session, libérés quand il n'y en a plus. TROC=0 : coupé (/__ping troc: false). */
const TROC_ON = process.env.TROC !== '0';
const TROC_MAX = Math.max(1, Number(process.env.TROC_MAX) || 300), TROC_IDLE = Number(process.env.TROC_IDLE_MS ?? 30 * 60e3), TROC_LIFE = Number(process.env.TROC_LIFE_MS ?? 3 * 3600e3);
const TROC_KEEP = Number(process.env.TROC_KEEP_MS ?? 86400e3), TROC_AWAY = Number(process.env.TROC_AWAY_MS ?? 15e3), TROC_TICK = Number(process.env.TROC_TICK_MS ?? 15e3);
const TROC_NEW_H = Number(process.env.TROC_NEW_PER_H ?? 20), TROC_BAD_H = Number(process.env.TROC_BAD_PER_H ?? 20), TROC_MB = (Number(process.env.TROC_MB) || 24) * 1024 * 1024;
const TROC_LIST = 3000, TROC_ITEMS = 100, TROC_BODY = 700 * 1024, TROC_ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', TROC_CODE = /^[A-HJKMNP-Z2-9]{6}$/, TROC_KEY = /^[\w-]{24}$/;
const TROC_LANGS = new Set(['fr', 'en', 'de', 'es', 'it', 'pt', 'jp', 'zh-CN', 'kr', 'ru', 'zh-TW']), TROC_IMG = 'https://cards.scryfall.io/';
const TROC = { s: new Map(), u: new Map(), lim: new Map(), bytes: 0, px: null, pxP: null, t: null };
// Texte de l'invitation, dans la langue de l'appareil de l'ami (notifyUser).
const TROC_TXT = {
  fr: ['Invitation à un échange', n => `${n} t'invite à un échange en direct sur Mana Orbit.`],
  en: ['Trade invitation', n => `${n} invites you to a live trade on Mana Orbit.`],
  de: ['Einladung zum Tausch', n => `${n} lädt dich zu einem Live-Tausch auf Mana Orbit ein.`],
  es: ['Invitación a un intercambio', n => `${n} te invita a un intercambio en directo en Mana Orbit.`],
  it: ['Invito a uno scambio', n => `${n} ti invita a uno scambio dal vivo su Mana Orbit.`],
  pt: ['Convite para uma troca', n => `${n} convidou você para uma troca ao vivo no Mana Orbit.`],
};
const trocStr = (v, n) => (typeof v === 'string' ? v.replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim().slice(0, n) : '');
const trocKey = n => (NM_CORE && NM_CORE.ownKey ? NM_CORE.ownKey(String(n)) : String(n).toLowerCase().trim());
/** Ligne d'un exemplaire (langue|édition, comme core.js › lineKey) ; '' si rien de lisible. */
function trocG(g) {
  const s = typeof g === 'string' ? g.slice(0, 40) : '', i = s.indexOf('|'), l = i < 0 ? s : s.slice(0, i), e = i < 0 ? '' : s.slice(i + 1);
  return (TROC_LANGS.has(l) ? l : '') + (/^[a-z0-9]{2,6}\|[^\s()|*,;"]{1,12}$/.test(e) ? '|' + e : '');
}
/** Image Scryfall (adresse complète ou courte, comme les partages) → forme courte « small/front/… » ; '' sinon. */
function trocImg(v) {
  const s = typeof v === 'string' ? v.slice(0, 300) : '', full = /^https:/.test(s) ? s : TROC_IMG + s;
  return s && NM_CORE && NM_CORE.SHARE_IMG_RE && NM_CORE.SHARE_IMG_RE.test(full) ? full.slice(TROC_IMG.length).replace(/\?\d+$/, '') : '';
}
/** Carte envoyée par une appli → { n, q, g, f?, fl?, i?, u? } (u : prix de l'appareil, centimes) ; null si illisible. qmax : exemplaires au plus. */
function trocCard(x, qmax = 99) {
  if (!x || typeof x !== 'object') return null;
  const n = trocStr(x.n, 160), q = Math.floor(Number(x.q)); if (!n || !trocKey(n) || !(q >= 1)) return null;
  const c = { n, q: Math.min(qmax, q), g: trocG(x.g) }, f = trocStr(x.f, 160), i = trocImg(x.i), u = Math.round(Number(x.u));
  if (f && f !== n) { c.f = f; if (TROC_LANGS.has(x.fl)) c.fl = x.fl; }
  if (i) c.i = i;
  if (u > 0 && u <= 1e7) c.u = u;
  return c;
}
/** Prix du serveur : fichier de prix (le même que /prices.tsv) lu à la première session, en tranches (le serveur continue de répondre). */
async function trocPxLoad() {
  if (!PX_LIVE || !NM_CORE) return null;
  if (TROC.px && TROC.px.buf === PX_LIVE.buf) return TROC.px;
  if (!TROC.pxP) {
    const { buf, at } = PX_LIVE;
    TROC.pxP = (async () => {
      const rows = (await gunzipA(buf)).toString('utf8').split('\n'), map = new Map();
      for (let i = 1; i < rows.length; i += 4000) {
        for (let j = i, end = Math.min(rows.length, i + 4000); j < end; j++) {      // nom \t centimes € \t centimes $ : l'impression la moins chère de chaque nom (comme pxParse de l'appli)
          const a = rows[j].split('\t'), e = Number(a[1]) || 0; if (!a[0] || !(e > 0)) continue;
          const k = trocKey(a[0]), cur = map.get(k); if (!cur || e < cur) map.set(k, e);
        }
        await new Promise(r => setImmediate(r));
      }
      TROC.px = { buf, at, map }; return TROC.px;
    })().catch(e => { console.warn('Échange : prix illisibles (' + e.message + ')'); return null; }).finally(() => { TROC.pxP = null; });
  }
  return TROC.pxP;
}
const trocPrice = n => { const e = TROC.px && TROC.px.map.get(trocKey(n)); return e > 0 ? e : null; };
/** Seau de jetons par compte ou par réseau (créations, codes faux) : 0 si permis (un jeton pris si take), sinon secondes à attendre. */
function trocLim(name, who, cap, per, take = true) {
  if (!who || !(cap > 0)) return 0;
  const k = name + ' ' + who, now = Date.now(); let b = TROC.lim.get(k);
  if (!b) { if (TROC.lim.size > 20000) for (const [kk, v] of TROC.lim) if (now - v.t > v.per) TROC.lim.delete(kk); b = { n: cap, t: now, per }; TROC.lim.set(k, b); }
  b.n = Math.min(cap, b.n + (now - b.t) * cap / per); b.t = now;
  if (b.n >= 1) { if (take) b.n--; return 0; }
  return Math.max(1, Math.ceil((1 - b.n) * per / cap / 1000));
}
/** Siège : 12 requêtes d'avance, 6 de plus par seconde (l'appli en fait une par seconde au plus). */
function trocPace(p) { const now = Date.now(); p.rn = Math.min(12, p.rn + (now - p.rt) * 6 / 1000); p.rt = now; if (p.rn < 1) return false; p.rn--; return true; }
function trocCode() {
  for (;;) {
    let c = ''; while (c.length < 6) for (const x of randomBytes(8)) if (x < 248 && c.length < 6) c += TROC_ABC[x % 31];      // 248 = 8 × 31 : aucun symbole plus probable qu'un autre
    if (!TROC.s.has(c)) return c;
  }
}
const trocSeat = (me, b) => ({ tag: me.tag, key: randomBytes(18).toString('base64url'), n: amName(b.n), p: amPic(b.p), list: [], lb: 0, lv: 0, cut: false, give: [], ready: false, ok: false, seen: Date.now(), got: false, rn: 12, rt: Date.now() });
/** Liste d'échange d'un joueur (une entrée par ligne), prix du serveur posés ; bornée par TROC_LIST et par la mémoire de toutes les sessions (tronquée : cut). */
function trocSetList(p, raw) {
  TROC.bytes -= p.lb; p.list = []; p.lb = 0; p.cut = false; p.lv++;
  const a = Array.isArray(raw) ? raw : []; let room = Math.max(0, TROC_MB - TROC.bytes);
  for (const x of a.slice(0, TROC_LIST + 1)) {
    if (p.list.length >= TROC_LIST) { p.cut = true; break; }
    const c = trocCard(x, 9999); if (!c) continue;
    const pu = trocPrice(c.n); if (pu) c.u = pu;
    const sz = JSON.stringify(c).length + 1; if (sz > room) { p.cut = true; break; }
    room -= sz; p.lb += sz; p.list.push(c);
  }
  TROC.bytes += p.lb;
}
function trocFree(s) { for (const p of s.p) if (p) { TROC.bytes -= p.lb; p.list = []; p.lb = 0; } }
const trocOpen = s => s.st === 'wait' || s.st === 'live';
function trocUnmap(s) { for (const p of s.p) if (p && TROC.u.get(p.tag) === s.code) TROC.u.delete(p.tag); }
/** Fin sans échange : un joueur est parti (left, by : son siège), ou plus personne (idle). */
function trocEnd(s, why, by = -1) { if (!trocOpen(s)) return; s.st = 'end'; s.why = why; s.by = by; s.endAt = Date.now(); s.v++; trocFree(s); trocUnmap(s); }
/** Ce compte quitte sa session ouverte (il en crée ou en rejoint une autre). */
function trocLeave(tag) { const s = TROC.s.get(TROC.u.get(tag)); if (s) trocEnd(s, 'left', s.p.findIndex(p => p && p.tag === tag)); TROC.u.delete(tag); }
function trocTick() {
  const now = Date.now(), old = [];
  for (const [c, s] of TROC.s) {
    if (trocOpen(s) && (now - s.act > TROC_IDLE || now - s.at > TROC_LIFE)) trocEnd(s, 'idle');
    if ((s.st === 'end' && now - s.endAt > 10 * 60e3) || (s.st === 'done' && (now - s.endAt > TROC_KEEP || (s.p.every(p => p.got) && now - s.endAt > 60e3)))) TROC.s.delete(c);
    else if (!trocOpen(s)) old.push(c);
  }
  for (const c of old.slice(0, Math.max(0, old.length - TROC_MAX * 8))) TROC.s.delete(c);      // terminées en surnombre : les plus anciennes partent
  if (!TROC.s.size) { clearInterval(TROC.t); TROC.t = null; TROC.px = null; }      // plus personne : minuterie et prix libérés
}
function trocWake() { if (!TROC.t) { TROC.t = setInterval(trocTick, TROC_TICK); TROC.t.unref(); } }
/** La session vue du siège i : « me » et « ot » (l'autre, null tant que personne n'a rejoint ; on : il a donné signe de vie il y a moins de 15 s). */
function trocView(s, i) {
  const me = s.p[i], ot = s.p[1 - i];
  const side = p => ({ n: p.n, ...(p.p ? { p: p.p } : {}), ready: p.ready, ok: p.ok, got: p.got, give: p.give, lv: p.lv, nl: p.list.length, ...(p.cut ? { cut: true } : {}) });
  return { c: s.code, v: s.v, cv: s.cv, st: s.st, why: s.why, by: s.by < 0 ? '' : s.by === i ? 'me' : 'ot', host: i === 0, px: s.px,
    me: side(me), ot: ot ? { ...side(ot), on: Date.now() - ot.seen < TROC_AWAY } : null, ...(i === 0 && s.inv ? { inv: s.invN || '' } : {}) };
}
/** Invitations en attente pour ce compte (GET /api/friends › tr) : sessions qui l'attendent encore. */
function trocInvFor(tag) {
  if (!TROC_ON) return [];
  const out = []; for (const s of TROC.s.values()) if (s.st === 'wait' && s.inv === tag) out.push({ c: s.code, n: s.p[0].n, ...(s.p[0].p ? { p: s.p[0].p } : {}), at: s.at });
  return out.slice(-5);
}
/** Session et siège d'après le code et la clé (x-troc-key) ; sinon réponse d'erreur envoyée (null). Chaque requête compte comme signe de vie. */
function trocSeatOf(req, res, code) {
  const key = String(req.headers['x-troc-key'] || ''), s = TROC_CODE.test(code) ? TROC.s.get(code) : null;
  const i = s && TROC_KEY.test(key) ? s.p.findIndex(p => p && safeEq(p.key, key)) : -1;
  if (i < 0) { json(res, 404, { error: 'gone', message: 'Session terminée.' }); return null; }
  const p = s.p[i]; if (!trocPace(p)) { json(res, 429, { error: 'rate_limited', message: 'Trop de requêtes.', retry: 1 }, { 'Retry-After': '1' }); return null; }
  p.seen = Date.now(); if (trocOpen(s)) s.act = p.seen;
  return { s, i, p };
}
/** POST /api/troc { n, p, l, list, inv? } : nouvelle session (l'ancienne de ce compte se termine). → { key, s, sent? (appareils de l'ami prévenus ; -1 : inconnu) } */
async function trocNew(req, res, me) {
  const w = trocLim('new', me.tag, TROC_NEW_H, 3600e3) || rateWait(req, 'trocnew', 3 * TROC_NEW_H, 3600e3); if (w) return tooMany(res, w);
  const b = await amBody(req, res, TROC_BODY); if (!b) return;
  let open = 0; for (const s of TROC.s.values()) if (trocOpen(s) && s.code !== TROC.u.get(me.tag)) open++;      // sa propre session ouverte, remplacée, ne compte pas
  if (open >= TROC_MAX) return json(res, 503, { error: 'busy', message: 'Trop d\'échanges en cours : réessaie dans un moment.' }, { 'Retry-After': '60' });
  let inv = '', invN = '';
  if (b.inv != null) {
    inv = String(b.inv); if (!AM_TAG.test(inv) || inv === me.tag) return json(res, 400, { error: 'bad_request', message: 'Ami invalide.' });
    if (!AM_ON) return json(res, 404, { error: 'friends_disabled', message: 'Amis désactivés sur ce serveur.' });
    const [a, t] = await Promise.all([amGet(me.tag), amGet(inv)]);
    if (!a || !t || !a.f[inv] || !t.f[me.tag]) return json(res, 403, { error: 'not_friend', message: 'Vous n\'êtes pas (ou plus) amis.' });
    invN = t.n || '';
  }
  await trocPxLoad();
  trocLeave(me.tag);
  const now = Date.now(), s = { code: trocCode(), v: 1, cv: 1, at: now, act: now, st: 'wait', why: '', by: -1, inv, invN, n: 0, px: (TROC.px && TROC.px.at) || '', p: [trocSeat(me, b), null] };
  trocSetList(s.p[0], b.list);
  TROC.s.set(s.code, s); TROC.u.set(me.tag, s.code); trocWake();
  let sent;
  if (inv) {
    const host = s.p[0].n;
    sent = await Promise.race([notifyUser(inv, l => { const L = TROC_TXT[l] || TROC_TXT.fr; return { title: L[0], body: L[1](host || AM_TXT[l].anon), url: './?troc=' + s.code, tag: 'mo-troc', ttl: 1800 }; }).catch(() => 0), sleepMs(4000).then(() => -1)]);
  }
  return json(res, 200, { key: s.p[0].key, ...(inv ? { sent } : {}), s: trocView(s, 0) });
}
/** POST /api/troc/join { c, n, p, l, list } : rejoint une session qui attend (ou reprend sa place : rechargement, autre appareil du même compte). */
async function trocJoin(req, res, me) {
  const net = clientOf(req), w = trocLim('bad', me.tag, TROC_BAD_H, 3600e3, false) || trocLim('badnet', net, 2 * TROC_BAD_H, 3600e3, false);
  if (w) return tooMany(res, w);
  const b = await amBody(req, res, TROC_BODY); if (!b) return;
  const code = String(b.c || '').toUpperCase().replace(/[\s-]/g, ''), s = TROC_CODE.test(code) ? TROC.s.get(code) : null;
  const mine = s ? s.p.findIndex(p => p && p.tag === me.tag) : -1;
  if (mine >= 0) {
    const p = s.p[mine]; p.seen = Date.now();
    if (trocOpen(s) && Array.isArray(b.list)) { trocSetList(p, b.list); s.v++; }
    return json(res, 200, { key: p.key, s: trocView(s, mine) });
  }
  if (!s || s.st !== 'wait') {      // code inconnu, session pleine ou finie : compté (deviner un code coûte vite un blocage)
    trocLim('bad', me.tag, TROC_BAD_H, 3600e3); trocLim('badnet', net, 2 * TROC_BAD_H, 3600e3);
    return s && s.st === 'live' ? json(res, 409, { error: 'full', message: 'Cet échange a déjà deux joueurs.' }) : json(res, 404, { error: 'not_found', message: 'Code inconnu, ou échange terminé.' });
  }
  await trocPxLoad();
  if (s.st !== 'wait') return json(res, 409, { error: 'full', message: 'Cet échange a déjà deux joueurs.' });      // rejoint par un autre pendant la lecture des prix
  trocLeave(me.tag);
  const p = s.p[1] = trocSeat(me, b); trocSetList(p, b.list);
  s.st = 'live'; s.v++; s.act = Date.now(); TROC.u.set(me.tag, s.code);
  return json(res, 200, { key: p.key, s: trocView(s, 1) });
}
/** GET /api/troc/s?c=<code>&v=<version> : la session (rien de neuf : { same, on }). */
function trocPoll(req, res, url) {
  const x = trocSeatOf(req, res, String(url.searchParams.get('c') || '')); if (!x) return;
  const { s, i } = x, ot = s.p[1 - i];
  if (Number(url.searchParams.get('v')) === s.v) return json(res, 200, { v: s.v, same: 1, on: !!ot && Date.now() - ot.seen < TROC_AWAY });
  return json(res, 200, trocView(s, i));
}
/** GET /api/troc/list?c=<code>&w=me|ot : liste d'échange d'un joueur (prix de la session). */
async function trocListGet(req, res, url) {
  const x = trocSeatOf(req, res, String(url.searchParams.get('c') || '')); if (!x) return;
  const p = x.s.p[url.searchParams.get('w') === 'me' ? x.i : 1 - x.i];
  return amSend(req, res, { lv: p ? p.lv : 0, list: p ? p.list : [], ...(p && p.cut ? { cut: true } : {}) });
}
/** POST /api/troc/op { c, op, … } : give { card } · ask { card } (dans sa liste) · set { id, q } · accept { id | all } · unask { id } · ready { on, cv } ·
    confirm { cv } · list { list } · leave · got (appliqué chez moi). Répond la session vue de ce siège (erreur : { error, message, s }). */
async function trocOp(req, res) {
  const b = await amBody(req, res, TROC_BODY); if (!b) return;
  const x = trocSeatOf(req, res, String(b.c || '')); if (!x) return;
  const { s, i, p } = x, ot = s.p[1 - i], op = String(b.op || '');
  const done = () => json(res, 200, trocView(s, i)), fail = (st, error, message) => json(res, st, { error, message, s: trocView(s, i) });
  const touch = () => { s.cv++; s.v++; for (const q of s.p) if (q) { q.ready = false; q.ok = false; } return done(); };      // contenu changé : plus personne n'est prêt
  if (op === 'leave') { trocEnd(s, 'left', i); return done(); }
  if (op === 'got') { if (s.st === 'done' && !p.got) { p.got = true; s.v++; } return done(); }
  if (!trocOpen(s)) return fail(409, 'closed', 'Échange terminé.');
  if (op === 'list') { trocSetList(p, b.list); s.v++; return done(); }
  if (op === 'give' || op === 'ask') {
    const side = op === 'give' ? p : ot; if (!side) return fail(409, 'alone', 'Personne n\'a encore rejoint l\'échange.');
    const c = trocCard(b.card); if (!c) return fail(400, 'bad_request', 'Carte illisible.');
    const k = trocKey(c.n), same = y => y.g === c.g && trocKey(y.n) === k, asked = op === 'ask';
    let cap = 99;
    if (asked) {      // seulement une carte de sa liste, et pas plus d'exemplaires qu'il n'en propose (données de sa liste : nom, image, prix)
      const e = side.list.find(same); if (!e) return fail(404, 'not_listed', 'Cette carte n\'est pas dans sa liste.');
      cap = e.q - side.give.filter(y => same(y) && !y.a).reduce((t, y) => t + y.q, 0);
      delete c.f; delete c.fl; delete c.i; Object.assign(c, { n: e.n, ...(e.f ? { f: e.f } : {}), ...(e.fl ? { fl: e.fl } : {}), ...(e.i ? { i: e.i } : {}), u: e.u });
    }
    const cur = side.give.find(y => same(y) && !!y.a === asked);
    if (cur) { const q = Math.min(cap, cur.q + c.q); if (q <= cur.q) return fail(409, 'max', 'Pas plus d\'exemplaires.'); cur.q = q; if (asked) cur.r = 1; return touch(); }
    if (side.give.length >= TROC_ITEMS) return fail(409, 'items', 'Trop de cartes de ce côté.');
    const q = Math.min(cap, c.q); if (q < 1) return fail(409, 'max', 'Pas plus d\'exemplaires.');
    side.give.push({ id: (++s.n).toString(36), ...c, q, u: trocPrice(c.n) || c.u || null, ...(asked ? { a: 1, r: 1 } : {}) });
    return touch();
  }
  if (op === 'set' || op === 'unask') {      // set : mes cartes (0 : retirée ; une carte demandée ne monte pas au-delà) · unask : ma demande chez l'autre, retirée
    const side = op === 'set' ? p : ot, it = side && side.give.find(y => y.id === String(b.id || ''));
    if (!it || (op === 'unask' && !it.a)) return fail(404, 'no_item', 'Carte introuvable.');
    const q = op === 'unask' ? 0 : Math.max(0, Math.min(it.a ? it.q : 99, Math.floor(Number(b.q)) || 0));
    if (q === it.q) return done();
    if (q) it.q = q; else side.give.splice(side.give.indexOf(it), 1);
    return touch();
  }
  if (op === 'accept') {
    const list = p.give.filter(y => y.r && (b.all || y.id === String(b.id || ''))); if (!list.length) return done();
    for (const y of list) delete y.r;
    return touch();
  }
  if (op === 'ready') {
    if (!b.on) { if (p.ready || s.p.some(q => q && q.ok)) { p.ready = false; for (const q of s.p) if (q) q.ok = false; s.v++; } return done(); }
    if (!ot) return fail(409, 'alone', 'Personne n\'a encore rejoint l\'échange.');
    if (Number(b.cv) !== s.cv) return fail(409, 'stale', 'L\'échange vient de changer : vérifie-le.');
    if (p.give.some(y => y.r)) return fail(409, 'pending', 'Réponds d\'abord à ses demandes.');
    if (!p.give.length && !ot.give.length) return fail(409, 'empty', 'Rien à échanger pour l\'instant.');
    if (!p.ready) { p.ready = true; s.v++; }
    return done();
  }
  if (op === 'confirm') {
    if (!ot || !p.ready || !ot.ready) return fail(409, 'not_ready', 'Vous devez être prêts tous les deux.');
    if (Number(b.cv) !== s.cv) return fail(409, 'stale', 'L\'échange vient de changer : vérifie-le.');
    if (!p.ok) { p.ok = true; s.v++; }
    if (ot.ok) { s.st = 'done'; s.endAt = Date.now(); trocFree(s); trocUnmap(s); }      // les deux ont validé : figé, chaque appli applique sa collection
    return done();
  }
  return fail(400, 'bad_request', 'Action inconnue.');
}
async function trocApi(req, res, path, url) {
  if (!TROC_ON) return json(res, 404, { error: 'troc_disabled', message: 'Échange en direct désactivé sur ce serveur.' });
  const sub = path.replace(/^troc\/?/, '');
  try {
    if (req.method === 'GET' && sub === 's') return trocPoll(req, res, url);
    if (req.method === 'GET' && sub === 'list') return await trocListGet(req, res, url);
    if (req.method === 'POST' && sub === 'op') return await trocOp(req, res);
    if (req.method === 'POST' && (!sub || sub === 'join')) { const me = await amAuth(req, res, 'Connecte-toi pour échanger en direct.'); if (!me) return; return await (sub ? trocJoin(req, res, me) : trocNew(req, res, me)); }
    return json(res, 405, { error: 'method_not_allowed' });
  } catch (e) {
    if (res.headersSent) throw e;
    console.warn('Échange : ' + String(e && e.message || e).slice(0, 200));
    return json(res, 503, { error: 'unavailable', message: 'Échange momentanément indisponible.' }, { 'Retry-After': '10' });
  }
}

/* ── Partie de Commander : /api/partie… (salle d'attente en mémoire, résultats dans l'historique de chaque compte) ─────────────────────────────
   Le compteur ne tourne que sur le téléphone du créateur (src/partie.js, chargé aussi ici : mêmes règles de lecture des résultats). Le serveur sert à deux choses :
   · Salle d'attente, EN MÉMOIRE (comme l'échange en direct : un redémarrage la termine, rien n'est écrit) : le créateur (compte connecté) l'ouvre pour SA partie
     (POST /api/partie, id de la partie) : code de 6 caractères (mêmes symboles que l'échange en direct), montré en QR code (./?table=<code>). Chacun regarde
     la table sans compte (GET /api/partie/peek), puis la rejoint (POST /api/partie/join) sur une place libre (1 à 8) avec son deck (nom, commandant, image
     Scryfall seulement) : connecté (jeton Firebase, place « compte ») ou en invité sans compte (prénom, commandant facultatif : place « invite », budgets
     par réseau plus stricts, rien d'enregistré sur le serveur pour lui). Chaque téléphone reçoit une clé de place (x-partie-key, 144 bits) : relevé versionné
     (GET /api/partie/s : rien de neuf → réponse courte avec les places présentes), actions (POST /api/partie/op). Le créateur déplace, retire, ajoute des
     invités sans téléphone, règle le format, puis « commence » : liste figée, et pour chaque place « compte » un jeton (AES-256-GCM, clé tirée du compte de
     service, lié à la partie et au créateur), seul moyen d'enregistrer la partie chez ce compte. Aucun UID ni empreinte n'est jamais renvoyé.
   · Résultats, dans Firestore par le compte de service (collection parties : l'appli n'y a pas accès, refus par défaut des règles, rien à publier) :
     parties/{empreinte SHA-256 de l'UID} { j: JSON { v: 1, h: [entrées, la partie la plus récente d'abord] }, at } ; entrée = résultat (partieResClean, sans jetons)
     + moi (place de ce compte, 0 : aucune) + src ('h' : il l'a créée, 's' : salle d'attente, 'q' : QR code du résultat) + at (enregistrée) ; PARTIE_HIST_MAX parties
     (500) et 900 Ko par compte au plus, les plus anciennes partent. POST /api/partie/result (le créateur) : chez lui et chez chaque compte de la partie
     (jetons valides), notification « Partie enregistrée » à chacun (notifyUser, ./?parties=1) ; la salle, si elle existe encore, reçoit le résultat (les
     téléphones encore sur la page le gardent, invités compris). POST /api/partie/claim (QR code du résultat) : chez lui seul. Même partie déjà là : une
     seule entrée (idempotent). GET /api/partie/hist (paginé), DELETE /api/partie/hist?id= (une partie), DELETE /api/partie/me (suppression du compte).
   Bornes : PARTIE_MAX salles ouvertes (500), une salle en attente par créateur, PARTIE_NEW_PER_H créations par compte et par heure (20), PARTIE_BAD_PER_H codes
   faux par compte et par heure (20 ; le double par réseau ; moitié moins par réseau pour un invité ou un coup d'œil), PARTIE_GUEST_PER_H invités par réseau et
   par heure (30), PARTIE_RES_PER_H résultats et réclamations par compte et par heure (30) ; salle en attente : 30 min sans activité ou 3 h en tout
   (PARTIE_IDLE_MS, PARTIE_LIFE_MS) ; commencée ou finie : gardée PARTIE_KEEP_MS (12 h) pour remettre le résultat ; 12 requêtes d'avance par place
   (6 par seconde) ; corps de 32 Ko. PARTIE=0, ou sans compte de service : coupé (/__ping partie: false). */
let PT_CORE = null; try { PT_CORE = createRequire(import.meta.url)('./src/partie.js'); } catch (e) { /* sources absentes : partie coupée */ }
const PT_ON = process.env.PARTIE !== '0' && FCM_ON && !!(PT_CORE && PT_CORE.partieResClean);
const PT_MAX = Math.max(1, Number(process.env.PARTIE_MAX) || 500), PT_LIFE = Number(process.env.PARTIE_LIFE_MS ?? 3 * 3600e3), PT_IDLE = Number(process.env.PARTIE_IDLE_MS ?? 30 * 60e3);
const PT_KEEP = Number(process.env.PARTIE_KEEP_MS ?? 12 * 3600e3), PT_AWAY = Number(process.env.PARTIE_AWAY_MS ?? 15e3), PT_TICK = Number(process.env.PARTIE_TICK_MS ?? 30e3);
const PT_NEW_H = Number(process.env.PARTIE_NEW_PER_H ?? 20), PT_BAD_H = Number(process.env.PARTIE_BAD_PER_H ?? 20), PT_GUEST_H = Number(process.env.PARTIE_GUEST_PER_H ?? 30), PT_RES_H = Number(process.env.PARTIE_RES_PER_H ?? 30);
const PT_HIST_MAX = Math.max(1, Number(process.env.PARTIE_HIST_MAX) || 500), PT_HIST_B = 900 * 1024, PT_BODY = 32 * 1024, PT_SEATS = 8, PT_TTL = 10 * 60e3, PT_KICKS = 50;
const PT_CACHE_B = (Number(process.env.PARTIE_CACHE_MB) || 16) * 1024 * 1024;      // historiques gardés en mémoire (les plus anciens partent d'abord)
const PT_KEY_RE = /^[\w-]{24}$/, PT_ID_RE = /^[0-9a-z]{8,24}$/, PT_FMTS = [40, 30, 25, 20];
const PT = { s: new Map(), u: new Map(), hist: new Map(), hb: 0, t: null, k: null };
// Notification « Partie enregistrée », dans la langue de l'appareil (h : pseudo du créateur, w : vainqueurs, me : ce compte a gagné).
const PT_TXT = {
  fr: ['Partie enregistrée', (h, w, me) => (me ? `Partie de ${h} : tu as gagné !` : w ? `Partie de ${h} : victoire de ${w}.` : `Partie de ${h} : pas de vainqueur.`)],
  en: ['Game saved', (h, w, me) => (me ? `${h}'s game: you won!` : w ? `${h}'s game: ${w} won.` : `${h}'s game: no winner.`)],
  de: ['Partie gespeichert', (h, w, me) => (me ? `Partie von ${h}: Du hast gewonnen!` : w ? `Partie von ${h}: Sieg für ${w}.` : `Partie von ${h}: kein Sieger.`)],
  es: ['Partida guardada', (h, w, me) => (me ? `Partida de ${h}: ¡has ganado!` : w ? `Partida de ${h}: victoria de ${w}.` : `Partida de ${h}: sin ganador.`)],
  it: ['Partita salvata', (h, w, me) => (me ? `Partita di ${h}: hai vinto!` : w ? `Partita di ${h}: vittoria di ${w}.` : `Partita di ${h}: nessun vincitore.`)],
  pt: ['Partida salva', (h, w, me) => (me ? `Partida de ${h}: você venceu!` : w ? `Partida de ${h}: vitória de ${w}.` : `Partida de ${h}: sem vencedor.`)],
};
/** Prénom ou pseudo d'une place : 24 caractères, refusé (vide) s'il contient un mot du filtre des decks publics. */
const ptName = v => { const s = trocStr(v, 24); return s && !(NM_CORE && NM_CORE.pubBad && NM_CORE.pubBad(s)) ? s : ''; };
/** Deck envoyé : null (aucun), false (image qui n'est pas une adresse Scryfall), sinon { nom?, commandant?, image? } (textes filtrés comme les pseudos). */
function ptDeckIn(d) {
  if (d == null || typeof d !== 'object') return null;
  const raw = typeof d.image === 'string' ? d.image.trim().slice(0, 300) : '', full = !raw || /^https:/.test(raw) ? raw : TROC_IMG + raw;
  if (raw && !PT_CORE.PRT_IMG_RE.test(full)) return false;
  const c = PT_CORE.partieDeck({ nom: d.nom, commandant: d.commandant, image: full }); if (!c) return null;
  for (const k of ['nom', 'commandant']) if (c[k] && NM_CORE && NM_CORE.pubBad && NM_CORE.pubBad(c[k])) delete c[k];
  return Object.keys(c).length ? c : null;
}
const ptNewKey = () => randomBytes(18).toString('base64url');
const ptSeat = o => ({ pos: 1, k: 'invite', tag: '', key: '', n: '', p: '', deck: null, h: false, tk: '', seen: Date.now(), rn: 12, rt: Date.now(), ...o });
const ptOpen = r => r.st === 'wait' || r.st === 'live';
const ptFree = r => { const out = []; for (let i = 1; i <= r.size; i++) if (!r.seats.some(s => s.pos === i)) out.push(i); return out; };
const ptOn = r => r.seats.filter(s => s.key && Date.now() - s.seen < PT_AWAY).map(s => s.pos).sort((a, b) => a - b);
const ptCodeOf = v => String(v || '').toUpperCase().replace(/[\s-]/g, '');
function ptCode() {
  for (;;) {
    let c = ''; while (c.length < 6) for (const x of randomBytes(8)) if (x < 248 && c.length < 6) c += TROC_ABC[x % 31];      // comme trocCode : aucun symbole plus probable qu'un autre
    if (!PT.s.has(c)) return c;
  }
}
/* Jeton d'une place « compte » : empreinte du compte chiffrée (AES-256-GCM), liée à la partie et au créateur (données associées). Clé tirée de la clé privée du
   compte de service (HKDF) : rien de plus à configurer, et un jeton reste valable après un redémarrage (résultat envoyé des heures plus tard). */
function ptKey() { if (!PT.k) PT.k = Buffer.from(hkdfSync('sha256', fcmSa.key.export({ type: 'pkcs8', format: 'der' }), 'mana-orbit', 'partie/jeton/v1', 32)); return PT.k; }
function ptTicket(tag, id, host) {
  const iv = randomBytes(12), c = createCipheriv('aes-256-gcm', ptKey(), iv); c.setAAD(Buffer.from(id + '|' + host));
  const ct = Buffer.concat([c.update(Buffer.from(tag, 'hex')), c.final()]);
  return Buffer.concat([iv, ct, c.getAuthTag()]).toString('base64url');
}
/** Jeton → empreinte du compte, si ce jeton a bien été donné pour cette partie à ce créateur ; '' sinon. */
function ptTicketOpen(t, id, host) {
  try {
    const b = Buffer.from(String(t), 'base64url'); if (b.length !== 60) return '';
    const d = createDecipheriv('aes-256-gcm', ptKey(), b.subarray(0, 12)); d.setAAD(Buffer.from(id + '|' + host)); d.setAuthTag(b.subarray(44));
    const tag = Buffer.concat([d.update(b.subarray(12, 44)), d.final()]).toString('hex');
    return AM_TAG.test(tag) ? tag : '';
  } catch (e) { return ''; }
}
/** Fin de la salle sans résultat : créateur parti ou remplacée (host, replaced), inactive ou trop vieille (idle). */
/** Salle finie : les miniatures des profils ne servent plus (mémoire rendue). */
const ptLight = r => { for (const s of r.seats) s.p = ''; };
function ptEnd(r, why) { if (r.st === 'end') return; r.st = 'end'; r.why = why; r.endAt = Date.now(); r.v++; ptLight(r); if (PT.u.get(r.host) === r.code) PT.u.delete(r.host); }
function ptTick() {
  const now = Date.now(), old = [];
  for (const [c, r] of PT.s) {
    if (r.st === 'wait' && (now - r.act > PT_IDLE || now - r.at > PT_LIFE)) ptEnd(r, 'idle');
    if (r.st === 'live' && now - r.startAt > PT_KEEP) ptEnd(r, 'idle');
    if ((r.st === 'end' && now - r.endAt > 10 * 60e3) || (r.st === 'done' && now - r.endAt > PT_KEEP)) PT.s.delete(c);
    else if (!ptOpen(r)) old.push(c);
  }
  for (const c of old.slice(0, Math.max(0, old.length - PT_MAX * 2))) PT.s.delete(c);      // finies en surnombre : les plus anciennes partent
  if (!PT.s.size) { clearInterval(PT.t); PT.t = null; }
}
function ptWake() { if (!PT.t) { PT.t = setInterval(ptTick, PT_TICK); PT.t.unref(); } }
/** La salle vue d'une place (le créateur voit aussi les jetons des places « compte », une fois la partie commencée). */
function ptView(r, me) {
  const now = Date.now(), host = !!(me && me.h);
  return { c: r.code, v: r.v, st: r.st, why: r.why, id: r.id, format: r.format, size: r.size, at: r.at, me: me ? me.pos : 0, host,
    places: r.seats.slice().sort((a, b) => a.pos - b.pos).map(s => ({ pos: s.pos, n: s.n, k: s.k, ...(s.h ? { h: 1 } : {}), dev: s.key ? 1 : 0, on: s.key && now - s.seen < PT_AWAY ? 1 : 0,
      ...(s.p ? { p: s.p } : {}), ...(s.deck ? { deck: s.deck } : {}), ...(host && s.tk ? { t: s.tk } : {}) })), ...(r.res ? { res: r.res } : {}) };
}
/** Coup d'œil avant d'entrer (sans clé) : places prises (pseudo ou prénom, compte ou invité), libres, format. */
function ptPublic(r) {
  const h = r.seats.find(s => s.h);
  return { c: r.code, st: r.st, format: r.format, size: r.size, host: h ? h.n : '', free: r.st === 'wait' ? ptFree(r) : [], places: r.seats.slice().sort((a, b) => a.pos - b.pos).map(s => ({ pos: s.pos, n: s.n, k: s.k, ...(s.h ? { h: 1 } : {}) })) };
}
/** Salle et place d'après le code et la clé (x-partie-key) ; sinon réponse d'erreur envoyée (null). Chaque requête compte comme signe de vie. */
function ptSeatOf(req, res, code) {
  const key = String(req.headers['x-partie-key'] || ''), r = TROC_CODE.test(code) ? PT.s.get(code) : null, okKey = PT_KEY_RE.test(key);
  if (r && okKey && r.kick.has(key)) { json(res, 410, { error: 'kicked', message: 'Le créateur de la partie t\'a retiré de la table.' }); return null; }
  const me = r && okKey ? r.seats.find(s => s.key && safeEq(s.key, key)) : null;
  if (!me) { json(res, 404, { error: 'gone', message: 'Partie introuvable ou terminée.' }); return null; }
  if (!trocPace(me)) { json(res, 429, { error: 'rate_limited', message: 'Trop de requêtes.', retry: 1 }, { 'Retry-After': '1' }); return null; }
  me.seen = Date.now(); if (ptOpen(r)) r.act = me.seen;
  return { r, me };
}
/** POST /api/partie { id, n, p, l, pos, deck, format, size } : salle d'attente de la partie id (déjà ouverte par ce compte pour cette partie : la même, rechargement ;
    sa salle précédente encore en attente se termine). → { key, s } */
async function ptNew(req, res, me) {
  const b = await amBody(req, res, PT_BODY); if (!b) return;
  const id = typeof b.id === 'string' && PT_ID_RE.test(b.id) ? b.id : PT_CORE.partieId(), cur = PT.s.get(PT.u.get(me.tag));
  if (cur && ptOpen(cur) && cur.id === id) { const s = cur.seats.find(x => x.h); s.seen = Date.now(); return json(res, 200, { key: s.key, s: ptView(cur, s) }); }
  const w = trocLim('ptnew', me.tag, PT_NEW_H, 3600e3) || rateWait(req, 'ptnew', 3 * PT_NEW_H, 3600e3); if (w) return tooMany(res, w);
  let open = 0; for (const r of PT.s.values()) if (ptOpen(r) && r !== cur) open++;
  if (open >= PT_MAX) return json(res, 503, { error: 'busy', message: 'Trop de parties en cours : réessaie dans un moment.' }, { 'Retry-After': '60' });
  const deck = ptDeckIn(b.deck); if (deck === false) return json(res, 400, { error: 'bad_image', message: 'Image Scryfall attendue.' });
  const size = Number.isInteger(b.size) && b.size >= 2 && b.size <= PT_SEATS ? b.size : PT_SEATS, pos = Number.isInteger(b.pos) && b.pos >= 1 && b.pos <= size ? b.pos : 1;
  if (cur && cur.st === 'wait') ptEnd(cur, 'replaced');
  const now = Date.now(), r = { code: ptCode(), id, host: me.tag, at: now, act: now, st: 'wait', why: '', v: 1, format: PT_FMTS.includes(b.format) ? b.format : 40, size, seats: [], kick: new Set(), res: null, startAt: 0, endAt: 0 };
  const s = ptSeat({ pos, k: 'compte', tag: me.tag, key: ptNewKey(), n: ptName(b.n), p: amPic(b.p), deck, h: true });
  r.seats.push(s); PT.s.set(r.code, r); PT.u.set(me.tag, r.code); ptWake();
  return json(res, 200, { key: s.key, s: ptView(r, s) });
}
/** POST /api/partie/join { c, pos?, n, p?, deck? } : avec un jeton Firebase, place « compte » (ou sa place reprise : rechargement, autre appareil) ; sans, place
    « invite » (prénom exigé). Place prise : 409 taken (+ free) ; table pleine : 409 full ; partie commencée : 409 started. */
async function ptJoin(req, res) {
  let me = null;
  if (req.headers['x-firebase-token']) { me = await amAuth(req, res, 'Connecte-toi, ou entre en invité.'); if (!me) return; }
  const net = clientOf(req), badCap = Math.max(1, Math.ceil(PT_BAD_H / 2));
  const w = me ? trocLim('ptbad', me.tag, PT_BAD_H, 3600e3, false) || trocLim('ptbadnet', net, 2 * PT_BAD_H, 3600e3, false) : trocLim('ptbadg', net, badCap, 3600e3, false);
  if (w) return tooMany(res, w);
  const b = await amBody(req, res, PT_BODY); if (!b) return;
  const code = ptCodeOf(b.c), r = TROC_CODE.test(code) ? PT.s.get(code) : null;
  if (me && r && r.kick.has(me.tag)) return json(res, 410, { error: 'kicked', message: 'Le créateur de la partie t\'a retiré de la table.' });
  const mine = me && r ? r.seats.find(s => s.tag === me.tag) : null;
  if (mine && ptOpen(r)) { mine.seen = Date.now(); return json(res, 200, { key: mine.key, s: ptView(r, mine) }); }
  if (!r || r.st !== 'wait') {      // code inconnu, partie commencée ou finie : compté (deviner un code coûte vite un blocage)
    if (me) { trocLim('ptbad', me.tag, PT_BAD_H, 3600e3); trocLim('ptbadnet', net, 2 * PT_BAD_H, 3600e3); } else trocLim('ptbadg', net, badCap, 3600e3);
    return r && ptOpen(r) ? json(res, 409, { error: 'started', message: 'La partie a déjà commencé.' }) : json(res, 404, { error: 'not_found', message: 'Code inconnu, ou partie terminée.' });
  }
  if (!me) { const g = trocLim('ptguest', net, PT_GUEST_H, 3600e3); if (g) return tooMany(res, g); }
  const n = ptName(b.n); if (!me && !n) return json(res, 400, { error: 'name', message: 'Prénom requis (sans mot grossier).' });
  const deck = ptDeckIn(b.deck); if (deck === false) return json(res, 400, { error: 'bad_image', message: 'Image Scryfall attendue.' });
  let pos = b.pos == null || b.pos === 0 ? 0 : b.pos;
  if (pos) {
    if (!Number.isInteger(pos) || pos < 1 || pos > r.size) return json(res, 400, { error: 'bad_place', message: 'Place invalide.' });
    if (r.seats.some(s => s.pos === pos)) return json(res, 409, { error: 'taken', message: 'Place déjà prise.', free: ptFree(r) });
  } else { pos = ptFree(r)[0] || 0; if (!pos) return json(res, 409, { error: 'full', message: 'Table complète.' }); }
  const s = ptSeat({ pos, k: me ? 'compte' : 'invite', tag: me ? me.tag : '', key: ptNewKey(), n, p: me ? amPic(b.p) : '', deck });
  r.seats.push(s); r.v++; r.act = Date.now();
  return json(res, 200, { key: s.key, s: ptView(r, s) });
}
/** GET /api/partie/peek?c=<code> : la table avant d'y entrer (sans compte ni clé ; code faux compté par réseau). */
function ptPeek(req, res, url) {
  const net = clientOf(req), badCap = Math.max(1, Math.ceil(PT_BAD_H / 2));
  const w = trocLim('ptbadg', net, badCap, 3600e3, false) || rateWait(req, 'ptpeek', 600, 3600e3); if (w) return tooMany(res, w);
  const code = ptCodeOf(url.searchParams.get('c')), r = TROC_CODE.test(code) ? PT.s.get(code) : null;
  if (!r || r.st === 'end') { trocLim('ptbadg', net, badCap, 3600e3); return json(res, 404, { error: 'not_found', message: 'Code inconnu, ou partie terminée.' }); }
  return json(res, 200, ptPublic(r));
}
/** GET /api/partie/s?c=<code>&v=<version> : la salle (rien de neuf : { v, same, on : places présentes }). */
function ptPoll(req, res, url) {
  const x = ptSeatOf(req, res, ptCodeOf(url.searchParams.get('c'))); if (!x) return;
  if (Number(url.searchParams.get('v')) === x.r.v) return json(res, 200, { v: x.r.v, same: 1, on: ptOn(x.r) });
  return json(res, 200, ptView(x.r, x.me));
}
/** POST /api/partie/op { c, op, … } : seat { pos } · me { n?, p?, deck? } · leave ; créateur seulement : add { pos?, n, deck? } · move { from, to } · kick { pos } ·
    opts { format?, size? } · start · end. Changements de places : seulement en attente. Répond la salle vue de cette place (erreur : { error, message, s }). */
async function ptOp(req, res) {
  const b = await amBody(req, res, PT_BODY); if (!b) return;
  const x = ptSeatOf(req, res, ptCodeOf(b.c)); if (!x) return;
  const { r, me } = x, op = String(b.op || ''), wait = r.st === 'wait';
  const done = () => json(res, 200, ptView(r, me)), bump = () => { r.v++; r.act = Date.now(); return done(); };
  const fail = (st, error, message, extra = {}) => json(res, st, { error, message, ...extra, s: ptView(r, me) });
  const posOk = p => Number.isInteger(p) && p >= 1 && p <= r.size, at = p => r.seats.find(s => s.pos === p);
  if (op === 'leave') {
    if (me.h) { ptEnd(r, 'host'); return json(res, 200, { ok: true }); }      // le créateur part : plus de partie
    if (wait) r.seats.splice(r.seats.indexOf(me), 1); else me.key = '';      // commencée : sa place reste (liste figée), ce téléphone ne suit plus
    r.v++; return json(res, 200, { ok: true });
  }
  if (op === 'end') { if (!me.h) return fail(403, 'not_host', 'Réservé au créateur de la partie.'); ptEnd(r, 'host'); return done(); }
  if (!wait) return fail(409, r.st === 'live' ? 'started' : 'closed', r.st === 'live' ? 'La partie a déjà commencé.' : 'Partie terminée.');
  if (op === 'me') {
    if ('n' in b) { const n = ptName(b.n); if (!n && me.k === 'invite') return fail(400, 'name', 'Prénom requis (sans mot grossier).'); me.n = n; }
    if ('deck' in b) { const d = ptDeckIn(b.deck); if (d === false) return fail(400, 'bad_image', 'Image Scryfall attendue.'); me.deck = d; }
    if ('p' in b && me.k === 'compte') me.p = amPic(b.p);
    return bump();
  }
  if (op === 'seat') {
    const p = b.pos; if (!posOk(p)) return fail(400, 'bad_place', 'Place invalide.');
    if (p === me.pos) return done();
    if (at(p)) return fail(409, 'taken', 'Place déjà prise.', { free: ptFree(r) });
    me.pos = p; return bump();
  }
  if (!me.h) return fail(403, 'not_host', 'Réservé au créateur de la partie.');
  if (op === 'add') {      // invité sans téléphone (prénom, commandant facultatif)
    const n = ptName(b.n); if (!n) return fail(400, 'name', 'Prénom requis (sans mot grossier).');
    const deck = ptDeckIn(b.deck); if (deck === false) return fail(400, 'bad_image', 'Image Scryfall attendue.');
    let p = b.pos || 0;
    if (p) { if (!posOk(p)) return fail(400, 'bad_place', 'Place invalide.'); if (at(p)) return fail(409, 'taken', 'Place déjà prise.', { free: ptFree(r) }); }
    else { p = ptFree(r)[0] || 0; if (!p) return fail(409, 'full', 'Table complète.'); }
    r.seats.push(ptSeat({ pos: p, k: 'invite', n, deck })); return bump();
  }
  if (op === 'move') {      // vers une place libre, ou échange avec celle qui l'occupe
    const s = at(b.from); if (!s || !posOk(b.to)) return fail(400, 'bad_place', 'Place invalide.');
    const o = at(b.to); if (o) o.pos = s.pos; s.pos = b.to; return bump();
  }
  if (op === 'kick') {
    const s = at(b.pos); if (!s || s.h) return fail(400, 'bad_place', 'Place invalide.');
    for (const k of [s.key, s.tag]) if (k) { r.kick.add(k); if (r.kick.size > PT_KICKS) r.kick.delete(r.kick.values().next().value); }      // sa clé, et son compte : il ne revient pas par le code
    r.seats.splice(r.seats.indexOf(s), 1); return bump();
  }
  if (op === 'opts') {
    if ('format' in b) { if (!PT_FMTS.includes(b.format)) return fail(400, 'bad_request', 'Format invalide.'); r.format = b.format; }
    if ('size' in b) { if (!Number.isInteger(b.size) || b.size < 2 || b.size > PT_SEATS || r.seats.some(s => s.pos > b.size)) return fail(400, 'bad_request', 'Nombre de places invalide.'); r.size = b.size; }
    return bump();
  }
  if (op === 'start') {      // liste figée ; un jeton par place « compte » (autre que le créateur) : la partie s'enregistrera chez ces comptes
    r.st = 'live'; r.startAt = Date.now();
    for (const s of r.seats) if (s.k === 'compte' && !s.h && s.tag) s.tk = ptTicket(s.tag, r.id, r.host);
    return bump();
  }
  return fail(400, 'bad_request', 'Action inconnue.');
}

/* Historique d'un compte : parties/{empreinte} (gardé 10 min en mémoire, PARTIE_CACHE_MB pour tous les comptes ; toute écriture relit d'abord Firestore, une à la fois par compte). */
function ptHistRead(j) { try { const o = JSON.parse(j); return o && Array.isArray(o.h) ? o.h.filter(x => x && typeof x.id === 'string') : []; } catch (e) { return []; } }
function ptHistForget(tag) { const o = PT.hist.get(tag); if (o) { PT.hb -= o.b; PT.hist.delete(tag); } }
function ptHistMem(tag, h, b) {
  ptHistForget(tag); PT.hist.set(tag, { h, at: Date.now(), b }); PT.hb += b;
  while (PT.hist.size > 2000 || (PT.hb > PT_CACHE_B && PT.hist.size > 1)) ptHistForget(PT.hist.keys().next().value);
}
async function ptHistLoad(tag, fresh) {
  const c = PT.hist.get(tag); if (!fresh && c && Date.now() - c.at < PT_TTL) return c.h;
  const d = await fsDoc('GET', 'parties/' + tag), j = d ? String(fsFields(d).j || '') : '', h = ptHistRead(j);
  ptHistMem(tag, h, j.length); return h;
}
/** Range une partie dans l'historique d'un compte. mode 'upsert' (le créateur : remplace la même partie) ou 'insert' (réclamation : jamais de remplacement).
    → 'new' (ajoutée) | 'upd' (remplacée) | 'same' (identique, rien d'écrit) | 'dup' (déjà là). */
function ptHistPut(tag, e, mode) {
  return amLock(['p:' + tag], async () => {
    const h = (await ptHistLoad(tag, true)).slice(), i = h.findIndex(x => x.id === e.id);
    if (i >= 0) {
      if (mode === 'insert') return 'dup';
      const ne = { ...e, at: h[i].at || e.at };
      if (JSON.stringify(ne) === JSON.stringify(h[i])) return 'same';
      h[i] = ne;
    } else h.push(e);
    h.sort((a, b) => (b.date - a.date) || (a.id < b.id ? -1 : 1));
    let out = h.slice(0, PT_HIST_MAX), j = JSON.stringify({ v: 1, h: out });
    while (Buffer.byteLength(j) > PT_HIST_B && out.length > 1) { out = out.slice(0, -Math.max(1, Math.ceil(out.length / 20))); j = JSON.stringify({ v: 1, h: out }); }      // 900 Ko au plus : les plus anciennes partent
    await fsDoc('PATCH', 'parties/' + tag, fsStr(j, Date.now()));
    ptHistMem(tag, out, j.length);
    return i >= 0 ? 'upd' : 'new';
  });
}
const ptStrip = r => ({ ...r, places: r.places.map(p => { const { uid, ...q } = p; return q; }) });
/** POST /api/partie/result { r, c?, key? } (le créateur) : chez lui (sa place « moi ») et chez chaque compte dont le jeton est valide ; notification aux nouveaux.
    → { ok, n (comptes), skip (jetons refusés) }. Une panne de Firestore : 503, rien de doublé au nouvel essai. */
async function ptResult(req, res, me) {
  const w = trocLim('ptres', me.tag, PT_RES_H, 3600e3) || rateWait(req, 'ptres', 3 * PT_RES_H, 3600e3); if (w) return tooMany(res, w);
  const b = await amBody(req, res, PT_BODY); if (!b) return;
  const r = PT_CORE.partieResClean(b.r, { tickets: true }); if (!r) return json(res, 400, { error: 'bad_result', message: 'Résultat illisible.' });
  const who = new Map([[me.tag, (r.places.find(p => p.sorte === 'moi') || {}).pos || 0]]); let skip = 0;
  for (const p of r.places) if (p.uid) { const t = ptTicketOpen(p.uid, r.id, me.tag); if (!t) skip++; else if (!who.has(t)) who.set(t, p.pos); }
  const pub = ptStrip(r), now = Date.now(), fresh = [];
  for (const [t, moi] of who) { const st = await ptHistPut(t, { ...pub, moi, src: t === me.tag ? 'h' : 's', at: now }, 'upsert'); if (st === 'new' && t !== me.tag) fresh.push([t, moi]); }
  const room = TROC_CODE.test(ptCodeOf(b.c)) ? PT.s.get(ptCodeOf(b.c)) : null, key = String(b.key || '');
  if (room && room.id === r.id && room.host === me.tag && PT_KEY_RE.test(key) && room.seats.some(s => s.h && s.key && safeEq(s.key, key)) && room.st !== 'end') {
    room.res = pub; if (room.st !== 'done') { room.st = 'done'; room.endAt = now; ptLight(room); } room.v++;      // les téléphones encore sur la page le reçoivent (invités compris)
  }
  if (fresh.length) {
    const host = (pub.places.find(p => p.sorte === 'moi') || {}).nom || '', wins = pub.places.filter(p => p.vainqueur);
    for (const [t, moi] of fresh) notifyUser(t, l => { const L = PT_TXT[l] || PT_TXT.fr, A = AM_TXT[l] || AM_TXT.fr; return { title: L[0], body: L[1](host || A.anon, amJoin(A, wins.map(p => p.nom || A.anon)), wins.some(p => p.pos === moi)), url: './?parties=1', tag: 'mo-partie', ttl: 7 * 86400 }; }).catch(() => {});
  }
  return json(res, 200, { ok: true, n: who.size, skip });
}
/** POST /api/partie/claim { r, pos } : « c'était moi : place pos » (QR code du résultat) ; dans son seul historique. → { ok, dup (déjà là : rien de changé) }. */
async function ptClaim(req, res, me) {
  const w = trocLim('ptres', me.tag, PT_RES_H, 3600e3) || rateWait(req, 'ptres', 3 * PT_RES_H, 3600e3); if (w) return tooMany(res, w);
  const b = await amBody(req, res, PT_BODY); if (!b) return;
  const r = PT_CORE.partieResClean(b.r); if (!r) return json(res, 400, { error: 'bad_result', message: 'Résultat illisible.' });
  if (!r.places.some(p => p.pos === b.pos)) return json(res, 400, { error: 'bad_place', message: 'Place invalide.' });
  const st = await ptHistPut(me.tag, { ...r, moi: b.pos, src: 'q', at: Date.now() }, 'insert');
  return json(res, 200, { ok: true, dup: st === 'dup' });
}
/** GET /api/partie/hist?from=0&n=20 : { total, from, items } (la plus récente d'abord, 50 par page au plus). */
async function ptHistGet(req, res, me, url) {
  const w = rateWait(req, 'pthist', 600, 3600e3); if (w) return tooMany(res, w);
  const from = Math.max(0, Math.floor(Number(url.searchParams.get('from'))) || 0), n = Math.max(1, Math.min(50, Math.floor(Number(url.searchParams.get('n'))) || 20));
  const h = await ptHistLoad(me.tag);
  return amSend(req, res, { total: h.length, from, items: h.slice(from, from + n) });
}
/** DELETE /api/partie/hist?id=<partie> : retirée de son historique. */
async function ptHistDel(req, res, me, url) {
  const id = String(url.searchParams.get('id') || ''); if (!PT_ID_RE.test(id)) return json(res, 400, { error: 'bad_request', message: 'Partie invalide.' });
  const total = await amLock(['p:' + me.tag], async () => {
    const h = await ptHistLoad(me.tag, true), out = h.filter(x => x.id !== id);
    if (out.length !== h.length) { const j = out.length ? JSON.stringify({ v: 1, h: out }) : ''; if (j) await fsDoc('PATCH', 'parties/' + me.tag, fsStr(j, Date.now())); else await fsDoc('DELETE', 'parties/' + me.tag); ptHistMem(me.tag, out, j.length); }
    return out.length;
  });
  return json(res, 200, { ok: true, total });
}
/** DELETE /api/partie/me (suppression du compte) : tout son historique effacé. */
async function ptWipe(req, res, me) {
  await amLock(['p:' + me.tag], async () => { await fsDoc('DELETE', 'parties/' + me.tag); ptHistForget(me.tag); });
  return json(res, 200, { ok: true });
}
async function partieApi(req, res, path, url) {
  if (!PT_ON) return json(res, 404, { error: 'partie_disabled', message: 'Partie de Commander désactivée sur ce serveur.' });
  const sub = path.replace(/^partie\/?/, '');
  try {
    if (req.method === 'GET' && sub === 's') return ptPoll(req, res, url);
    if (req.method === 'GET' && sub === 'peek') return ptPeek(req, res, url);
    if (req.method === 'POST' && sub === 'op') return await ptOp(req, res);
    if (req.method === 'POST' && sub === 'join') return await ptJoin(req, res);
    const route = req.method === 'POST' && !sub ? ptNew : req.method === 'POST' && sub === 'result' ? ptResult : req.method === 'POST' && sub === 'claim' ? ptClaim
      : req.method === 'GET' && sub === 'hist' ? ptHistGet : req.method === 'DELETE' && sub === 'hist' ? ptHistDel : req.method === 'DELETE' && sub === 'me' ? ptWipe : null;
    if (!route) return json(res, 405, { error: 'method_not_allowed' });
    const me = await amAuth(req, res, sub ? 'Connecte-toi pour enregistrer tes parties.' : 'Connecte-toi pour créer une partie.'); if (!me) return;
    return await route(req, res, me, url);
  } catch (e) {
    if (res.headersSent) throw e;
    console.warn('Partie : ' + String(e && e.message || e).slice(0, 200));
    return json(res, 503, { error: 'unavailable', message: 'Partie momentanément indisponible.' }, { 'Retry-After': '30' });
  }
}

/* ── Noms imprimés des autres langues (scan) : GET /api/names/find?q=<ligne lue>[&q=…]&skip=<langue>[,…] ──────────────────────────────
   L'appli compare le nom lu au catalogue de SA langue (gardé sur l'appareil) puis à l'anglais, puis aux autres langues si elle a names-all.tsv sur l'appareil ;
   sinon une carte d'une autre langue (italienne lue avec l'appli en français) est cherchée ici dans les catalogues names-*.tsv déjà servis, avec la même
   comparaison tolérante et le même arbitrage entre langues que l'appli (core.js › nmPut, nmMatch, nmPick).
   Public comme les catalogues eux-mêmes, lecture seule, budget par IP. Index construit à la première recherche, par tranches (le serveur continue de
   répondre) : ≈ 7 Mo de tas par langue, ≈ 35 Mo pour les cinq latines (japonais, coréen, chinois : chargés seulement si une ligne lue est dans leur écriture) (mesuré : le processus prend ≈ 100 à 170 Mo de plus à la première recherche, tas réservé
   par V8 compris) ; libéré après NAMES_IDLE_MIN minutes sans recherche (30), relu si le fichier change. NAMES_FIND=0 : coupé. NAMES_RATE_PER_MIN : 60 par IP. */
const NM_FILES = { fr: 'fr-names.tsv', de: 'names-de.tsv', es: 'names-es.tsv', it: 'names-it.tsv', pt: 'names-pt.tsv', ru: 'names-ru.tsv',
  jp: 'names-ja.tsv', kr: 'names-ko.tsv', 'zh-CN': 'names-zhs.tsv', 'zh-TW': 'names-zht.tsv' };      // liste fermée : aucun chemin construit depuis la requête ; clés : codes de l'appli
const NM_ASIA = new Set(['jp', 'kr', 'zh-CN', 'zh-TW']);      // cherchées seulement pour une ligne en écriture d'Asie (et les autres jamais pour elle) : pas de catalogue chargé pour rien
let NM_CORE = null; try { NM_CORE = createRequire(import.meta.url)('./src/core.js'); } catch (e) { /* sources absentes : recherche coupée (503), l'appli fait sans */ }
const NM_ON = process.env.NAMES_FIND !== '0' && !!(NM_CORE && NM_CORE.nmCat && NM_CORE.nmPick);
const PUB_ON = process.env.PUBDECKS !== '0' && FCM_ON && !!(NM_CORE && NM_CORE.pubClean);      // decks publics : compte de service et lecteur (core.js) présents
const NM_RATE = Number(process.env.NAMES_RATE_PER_MIN ?? 60), NM_IDLE = (Number(process.env.NAMES_IDLE_MIN) || 30) * 60e3, NM_Q = 4, NM_LEN = 100, NM_BUSY = 4;
const NM = new Map();                        // langue → { p: Promise<catalogue | null>, mt, at }
let nmBusy = 0, nmUsed = 0, nmTimer = null;
const nmTick = () => new Promise(r => setImmediate(r));
/** Catalogue d'une langue (core.js › nmCat : mêmes règles que l'appli) ; null sans fichier ou s'il est tronqué (< 500 noms). Chaque nom de l'index porte
 *  « imprimé \t anglais \t image » (une seule chaîne par carte : ≈ 7 Mo par langue au lieu de 12) ; amb : noms imprimés partagés par deux cartes (jamais « sûrs »). */
async function nmLoad(l) {
  const f = join(PWA, NM_FILES[l]); let mt;
  try { mt = (await stat(f)).mtimeMs; } catch (e) { return { cat: null, mt: 0 }; }
  const rows = (await readFile(f, 'utf8')).split('\n'), C = NM_CORE, cat = C.nmCat();
  for (let i = 0; i < rows.length; i += 3000) {
    for (let j = i, end = Math.min(rows.length, i + 3000); j < end; j++) {      // 1re ligne d'un nom gardée, nom partagé par deux cartes noté (core.js › nmPut)
      const r = rows[j]; if (!r || r[0] === '#') continue;
      const t = r.split('\t'), p = (t[0] || '').trim(), en = (t[1] || '').trim(); if (!p || !en) continue;
      C.nmPut(cat, p, en, (t[2] || '').trim());
    }
    await nmTick();
  }
  return { cat: C.nmDone(cat), mt };
}
/** Catalogue prêt d'une langue : chargé à la première demande ; date du fichier contrôlée au plus toutes les 10 min (déploiement, mise à jour hebdomadaire). */
function nmGet(l) {
  let e = NM.get(l); const now = Date.now();
  if (e && now - e.at > 600e3) { e.at = now; stat(join(PWA, NM_FILES[l])).then(s => s.mtimeMs, () => 0).then(mt => { if (NM.get(l) === e && mt !== e.mt) NM.delete(l); }); }      // relu à la recherche suivante
  if (!e) { e = { at: now, mt: 0, p: null }; e.p = nmLoad(l).then(r => { e.mt = r.mt; return r.cat; }, () => null); NM.set(l, e); }
  return e.p;
}
/** Mémoire rendue après NAMES_IDLE_MIN sans recherche. */
function nmTouch() {
  nmUsed = Date.now(); if (nmTimer) return;
  nmTimer = setInterval(() => { if (Date.now() - nmUsed > NM_IDLE && !nmBusy) { NM.clear(); clearInterval(nmTimer); nmTimer = null; } }, Math.min(NM_IDLE, 60e3)); nmTimer.unref();
}
async function namesApi(req, res, url) {
  if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' });
  if (!NM_ON) return json(res, 503, { error: 'unavailable', message: 'Recherche des noms des autres langues coupée sur ce serveur.' });
  const qs = url.searchParams.getAll('q').map(s => s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim()).filter(Boolean);
  if (!qs.length || qs.length > NM_Q || qs.some(s => s.length > NM_LEN)) return json(res, 400, { error: 'bad_request', message: `De 1 à ${NM_Q} lignes lues (q), ${NM_LEN} caractères au plus.` });
  const asia = qs.some(q => NM_CORE.CJK_RE.test(q)), skip = new Set(String(url.searchParams.get('skip') || '').split(',')), langs = Object.keys(NM_FILES).filter(l => !skip.has(l) && NM_ASIA.has(l) === asia);      // skip : comparé à la liste fermée, jamais utilisé comme chemin
  if (!langs.length) return json(res, 200, { hit: null, tried: [] });
  const wait = rateWait(req, 'names', NM_RATE, 60e3); if (wait) return tooMany(res, wait);
  if (nmBusy >= NM_BUSY) return json(res, 503, { error: 'busy', message: 'Serveur occupé.' }, { 'Retry-After': '2' });
  nmBusy++; nmTouch();
  try {
    const lines = qs.map(text => ({ text })), found = [], tried = [];
    for (const l of langs) {
      const cat = await nmGet(l); if (!cat) continue;
      tried.push(l); const m = NM_CORE.nmMatch(cat, lines); if (m) found.push({ ...m, lang: l });      // mêmes règles que core.js › matchFr
      await nmTick();                                                       // une langue à la fois : les autres requêtes passent entre deux
    }
    if (!tried.length) return json(res, 503, { error: 'unavailable', message: 'Aucun catalogue des autres langues sur ce serveur.' });
    if (!found.length) return json(res, 200, { hit: null, tried });
    const h = NM_CORE.nmPick(found);                                       // même nom lu, cartes différentes selon la langue : accents lus tels quels, sinon à vérifier ; alt : même carte, même nom ailleurs (core.js › nmPick, comme l'appli)
    const hit = h ? { name: h.name, printed: h.printed, lang: h.lang, score: h.score, raw: h.raw, img: !h.img ? '' : /^https:\/\//.test(h.img) ? h.img : NM_CORE.FR_IMG + h.img, ...(h.amb ? { amb: true, ...(Array.isArray(h.alts) ? { alts: h.alts.slice(0, 6) } : {}) } : {}), ...(h.alt ? { alt: h.alt } : {}) } : null;      // alts : cartes anglaises qui portent ce nom (le scan tranche)
    return json(res, 200, { hit, tried });
  } finally { nmBusy--; nmUsed = Date.now(); }
}

/* ── Panneau d'administration : page /admin, données /api/admin ───────────────────────────────────────────────────────────────────
   Réservé à l'éditeur. À CHAQUE appel : jeton Firebase vérifié (tout compte du projet, sans la liste ALLOWED_UIDS), adresse vérifiée (email_verified),
   empreinte SHA-256 de l'adresse (minuscules) dans la liste ADMIN_SET ; sinon 403 sans aucune donnée. Le dépôt est public : aucune adresse en clair,
   seulement son empreinte (ADMIN_DEFAULT) ; ADMIN_EMAILS (adresses séparées par des virgules, lues ici seulement) la remplace. ADMIN=0 : coupé (404).
   La page (pwa/admin.html, admin.js, admin.css) ne contient aucune donnée : elle connecte le compte (SDK Firebase, comme l'appli) puis appelle l'API.
   Jamais en cache (no-store), jamais indexée (X-Robots-Tag), CSP stricte ; le service worker ne la garde pas (il ne garde que la page de l'appli).
   Données, lues avec le compte de service (FCM_SERVICE_ACCOUNT) :
   · comptes Firebase Authentication : Identity Toolkit accounts:batchGet (1 000 par page, ne coûte aucune lecture Firestore). Refusé (rôle IAM
     manquant) : Firestore seul (comptes tirés des documents users/…, sans e-mail ni dates), avec un avis sur la page ;
   · Firestore : documents meta de tous les comptes (une requête « groupe de collections », masque de champs : jamais la photo du profil, la liste
     gardée, les decks montés ni le scan), decks (champ updatedAt seulement), pubdecks (champs o, by, cmd, updatedAt : ce que la Communauté montre déjà),
     pubreports (champ d), amis (pseudo, amis, demandes).
     Coût d'un calcul : une lecture par document meta existant (7 au plus par compte), par deck, deck public, signalement et compte « amis ».
   Calcul gardé ADMIN_TTL_MS en mémoire (10 min) ; « Rafraîchir » le refait (une fois par minute au plus, ADMIN_REFRESH_PER_H par heure et par réseau).
   Minimisation : seul le serveur voit les données brutes, le temps du calcul ; il garde en mémoire l'UID de chaque identifiant opaque (pour les actions),
   jamais envoyé. La page reçoit prénom + initiale (« Jeanne D. »), e-mail masqué (« ma•••@gmail.com »), un identifiant opaque (HMAC d'une clé tirée
   au démarrage) ; jamais d'UID, d'e-mail complet, de photo ni de nom complet. Rien de tout cela dans le journal du serveur (erreurs : statut HTTP seulement).
   Pagination, tri et recherche côté serveur (50 comptes par page) ; GET /api/admin/export : la même liste (tri et recherche en cours) en CSV, mêmes champs réduits.
   Actions (seules écritures ; POST en JSON, même origine, ADMIN_ACTIONS_PER_H par heure et par réseau, confirmées sur la page) : désactiver / réactiver
   un compte (Identity Toolkit accounts:update, disableUser ; rôle IAM « Administrateur Firebase Authentication », roles/firebaseauth.admin) et retirer
   un deck public (pubdecks/… effacé, enlevé aussitôt de la liste servie). Chaque essai est noté dans ADMIN_DIR/journal.json (500 derniers : date, action,
   nom réduit, e-mail masqué, deck, résultat, éditeur masqué ; jamais d'UID). Comptes actifs par jour : ADMIN_DIR/actifs.json, relevés à chaque calcul
   et toutes les ADMIN_ACTIVE_EVERY_MS (1 h ; Identity Toolkit seulement, aucune lecture Firestore) ; « actif » = même sens que les chiffres (activité). */
const ADMIN_ON = process.env.ADMIN !== '0';
// Empreinte SHA-256 (adresse en minuscules, sans espaces) de l'adresse e-mail de l'éditeur : la seule forme écrite dans le dépôt.
const ADMIN_DEFAULT = ['6cad6e34ef574c9753e50865ff00a51d139de86223ae96dc9cb07856c4210a05'];
const admHash = e => createHash('sha256').update(String(e || '').trim().toLowerCase()).digest('hex');
const ADMIN_SET = new Set(String(process.env.ADMIN_EMAILS || '').trim() ? csv(process.env.ADMIN_EMAILS).map(admHash) : ADMIN_DEFAULT);
const IT_BASE = (process.env.IDENTITY_TOOLKIT_BASE_URL || 'https://identitytoolkit.googleapis.com').replace(/\/+$/, '');      // surchargeable pour les tests
const IT_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';      // portée de accounts:batchGet (comme le SDK Admin de Firebase)
const ADM_TTL = Number(process.env.ADMIN_TTL_MS) > 0 ? Number(process.env.ADMIN_TTL_MS) : 10 * 60e3;
const ADM_GAP = Number(process.env.ADMIN_REFRESH_GAP_MS ?? 60e3), ADM_REF_H = Number(process.env.ADMIN_REFRESH_PER_H ?? 10);
const ADM_DOCS = Math.max(100, Number(process.env.ADMIN_MAX_DOCS) || 40000), ADM_ACCTS = 50000, ADM_PER = 50;      // plafonds : documents lus par collection, comptes listés
const ADM_SORTS = ['created', 'login', 'seen', 'cards', 'decks'];
const ADM = { snap: null, run: null, tried: 0, key: randomBytes(32) };
const ADM_DIR = process.env.ADMIN_DIR || join(EDH_DIR, 'admin'), ADM_LOG_FILE = join(ADM_DIR, 'journal.json'), ADM_ACT_FILE = join(ADM_DIR, 'actifs.json');
const ADM_ACT_H = Number(process.env.ADMIN_ACTIONS_PER_H ?? 30), ADM_EXP_H = 20, ADM_LOG_MAX = 500, ADM_LOG_SHOW = 30, ADM_DAYS_KEPT = 120;      // actions et exports CSV par heure et par réseau ; journal ; jours d'actifs gardés
const ADM_EVERY = Number(process.env.ADMIN_ACTIVE_EVERY_MS ?? 3600e3);      // relevé des comptes actifs du jour (0 : seulement à chaque calcul)
const ADM_LOG = { list: null, chain: Promise.resolve() }, ADM_ACT = { days: null, bad: false, err: -1, chain: Promise.resolve() };
const ADM_HD = { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'no-referrer' };
// Page : aucun script en ligne ; SDK Firebase (gstatic) et fenêtre de connexion Google (apis.google.com, domaine d'authentification du projet) seulement.
const ADM_CSP = `default-src 'none'; script-src 'self' https://www.gstatic.com https://apis.google.com; style-src 'self' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; `
  + `connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com; frame-src https://${FB_PROJECT}.firebaseapp.com https://accounts.google.com; `
  + `base-uri 'none'; form-action 'none'; frame-ancestors 'none'; object-src 'none'`;
const ADM_FILES = new Map([['/admin', ['admin.html', 'text/html; charset=utf-8']], ['/admin/', ['admin.html', 'text/html; charset=utf-8']], ['/admin/app.js', ['admin.js', 'text/javascript; charset=utf-8']], ['/admin/app.css', ['admin.css', 'text/css; charset=utf-8']]]);
const admId = uid => createHmac('sha256', ADM.key).update(String(uid)).digest('base64url').slice(0, 12);
const admDay = (() => { let f = null; try { f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' }); } catch (e) { /* sans ICU : UTC */ } return t => (f ? f.format(t) : new Date(t).toISOString().slice(0, 10)); })();
/** Date et heure de Paris, « 2026-10-19 14:03 » (CSV) ; 0 : vide. */
const admStamp = (() => { let f = null; try { f = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); } catch (e) { /* sans ICU : UTC */ } return t => (!(t > 0) ? '' : f ? f.format(t) : new Date(t).toISOString().slice(0, 16).replace('T', ' ')); })();
/** Les 30 derniers jours de Paris (« AAAA-MM-JJ »), aujourd'hui en dernier ; comptés depuis midi UTC du jour de Paris : aucun saut ni doublon aux changements d'heure. */
const admDays = (now, n = 30) => { const noon = Date.parse(admDay(now) + 'T12:00:00Z'); return Array.from({ length: n }, (_, i) => new Date(noon - (n - 1 - i) * 86400e3).toISOString().slice(0, 10)); };
/** Une modification d'un fichier du panneau à la fois (journal, actifs). */
const admRun = (o, fn) => { const p = o.chain.then(fn); o.chain = p.catch(() => {}); return p; };
async function admSave(f, obj) { await mkdir(dirname(f), { recursive: true }); const tmp = f + '.tmp'; await writeFile(tmp, JSON.stringify(obj)); await rename(tmp, f); }      // écriture atomique
// Messageries grand public : le domaine reste lisible (« ma•••@gmail.com ») ; un autre domaine (souvent le nom de quelqu'un) est masqué aussi.
const ADM_MAILS = /^(gmail|googlemail|outlook|hotmail|live|msn|yahoo|ymail|icloud|me|mac|aol|proton|protonmail|pm|gmx|web|orange|wanadoo|free|sfr|neuf|laposte|bbox|numericable|libero|virgilio|tiscali|t-online|freenet|yandex|zoho|uol|bol|terra)\.[a-z.]{2,9}$/;
/** « martin.dupont@gmail.com » → « ma•••@gmail.com » ; domaine privé : « ma•••@s•••.fr ». */
function admMail(e) {
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(String(e || '').trim().toLowerCase()); if (!m) return '';
  const loc = [...m[1]], dom = m[2], d = ADM_MAILS.test(dom) ? dom : [...dom][0] + '•••' + dom.slice(dom.lastIndexOf('.'));
  return loc.slice(0, loc.length > 4 ? 2 : 1).join('') + '•••@' + d;
}
/** Nom affiché réduit : « Jeanne Dupont » → « Jeanne D. » (premier mot, initiale du dernier mot qui a une lettre ; ce qui est entre parenthèses
 *  ou crochets est retiré : « Jean Dupont (JeanD) » → « Jean D. ») ; un pseudo d'un seul mot reste tel quel ; une adresse est masquée. */
function admName(s) {
  s = String(s || '').replace(/[\p{Cc}\p{Cf}<>]/gu, '').replace(/\s+/g, ' ').trim(); if (!s) return '';
  if (s.includes('@')) return admMail(s);
  const w = (s.replace(/[([{][^)\]}]*[)\]}]/g, ' ').replace(/\s+/g, ' ').trim() || s).split(' '), lw = w.filter(x => /\p{L}/u.test(x));
  if (w.length > 1 && lw.length > 1) return [...w[0]].slice(0, 20).join('') + ' ' + [...lw[lw.length - 1].replace(/^[^\p{L}]+/u, '')][0].toUpperCase() + '.';
  return [...w.join(' ')].slice(0, 24).join('');
}
/** Collection (texte « 3 Sol Ring (CMM) 400 *FR* », une ligne par langue et édition) : cartes distinctes (champ count de l'appli) et exemplaires. */
function admColl(text, count) {
  let copies = 0; const names = Number.isFinite(count) && count >= 0 ? null : new Set();
  for (const ln of String(text || '').split('\n')) {
    const m = /^\s*(\d{1,4})\s*x?\s+(.+?)\s*$/i.exec(ln); if (!m) continue;
    copies += Number(m[1]);
    if (names) names.add(m[2].replace(/\s*\*[\w-]+\*$/, '').replace(/\s*\(D[0-9a-z]+\)$/i, '').replace(/\s*\([A-Za-z0-9]{2,6}\)\s+\S+$/, '').toLowerCase());
  }
  return { cards: names ? names.size : count, copies };
}
/** Requête REST vers Google avec le jeton du compte de service (portée scope) ; jeton refusé (401) : un nouveau, un seul essai. Erreur : e.http (statut). */
async function admFetch(url, scope, init = {}) {
  for (let a = 0; ; a++) {
    const tok = await fcmAccess(scope);
    const r = await fetch(url, { ...init, signal: AbortSignal.timeout(30000), redirect: 'manual', headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json; charset=utf-8' } : {}) } });
    if (r.status === 401 && a === 0) { await r.arrayBuffer().catch(() => {}); fcmAuth.get(scope).tok = ''; continue; }
    const j = await r.json().catch(() => null);
    if (!r.ok || j == null) throw Object.assign(new Error('HTTP ' + r.status), { http: r.status });      // jamais le corps de la réponse (pourrait contenir des données)
    return j;
  }
}
/** Comptes Firebase Authentication, réduits aussitôt à ce qui sert (ni hachage du mot de passe, ni photo, ni téléphone). */
async function admAccounts() {
  const out = []; let page = '';
  for (let i = 0; i < ADM_ACCTS / 1000; i++) {
    const j = await admFetch(`${IT_BASE}/v1/projects/${fcmSa.project}/accounts:batchGet?maxResults=1000${page ? '&nextPageToken=' + encodeURIComponent(page) : ''}`, IT_SCOPE);
    for (const u of Array.isArray(j.users) ? j.users : []) {
      if (!u || typeof u.localId !== 'string' || !u.localId) continue;
      out.push({ uid: u.localId, email: typeof u.email === 'string' ? u.email : '', ver: u.emailVerified === true, dn: typeof u.displayName === 'string' ? u.displayName : '', dis: u.disabled === true,
        prov: [...new Set((Array.isArray(u.providerUserInfo) ? u.providerUserInfo : []).map(p => String(p && p.providerId || '')).filter(Boolean))],
        created: Number(u.createdAt) || 0, login: Number(u.lastLoginAt) || 0, refresh: Date.parse(u.lastRefreshAt || '') || 0 });
    }
    if (!j.nextPageToken) break; page = String(j.nextPageToken);
  }
  return out;
}
const admDocs = () => `${FS_BASE}/v1/projects/${fcmSa.project}/databases/(default)/documents`;
/** Documents d'un groupe de collections (toutes les collections « col » du projet), champs choisis, par pages (curseur sur le nom) ; each(doc) les traite
 *  au fil de l'eau (le texte d'une collection n'est pas gardé). Retourne le nombre lu ; plafond ADM_DOCS. */
async function admGroup(col, fields, size, each) {
  let n = 0, last = '';
  for (;;) {
    const q = { from: [{ collectionId: col, allDescendants: true }], select: { fields: (fields.length ? fields : ['__name__']).map(f => ({ fieldPath: f })) },
      orderBy: [{ field: { fieldPath: '__name__' }, direction: 'ASCENDING' }], limit: size, ...(last ? { startAt: { values: [{ referenceValue: last }], before: false } } : {}) };
    const j = await admFetch(admDocs() + ':runQuery', DS_SCOPE, { method: 'POST', body: JSON.stringify({ structuredQuery: q }) });
    const docs = (Array.isArray(j) ? j : []).map(x => x && x.document).filter(d => d && typeof d.name === 'string');
    for (const d of docs) each(d);
    n += docs.length;
    if (docs.length < size || n >= ADM_DOCS) return n;
    last = docs[docs.length - 1].name;
  }
}
/** Tous les documents d'une collection racine, champs choisis (masque). */
async function admList(col, fields) {
  const out = []; let page = '';
  for (let i = 0; i * 300 < ADM_DOCS; i++) {
    const j = await admFetch(`${admDocs()}/${col}?pageSize=300${fields.map(f => '&mask.fieldPaths=' + f).join('')}${page ? '&pageToken=' + encodeURIComponent(page) : ''}`, DS_SCOPE);
    if (Array.isArray(j.documents)) out.push(...j.documents);
    if (!j.nextPageToken) break; page = String(j.nextPageToken);
  }
  return out;
}
const ADM_PROV = { 'google.com': 'google', password: 'mail', 'apple.com': 'apple', phone: 'phone', 'facebook.com': 'facebook', 'github.com': 'github', 'twitter.com': 'twitter', 'microsoft.com': 'microsoft' };
/** Calcul complet (comptes, Firestore, totaux) : une seule fois à la fois. Rien de brut ne survit à la fonction : seules les lignes réduites sont gardées. */
function admRefresh() {
  if (!ADM.run) ADM.run = (async () => {
    ADM.tried = Date.now();
    const notes = []; let src = 'none', accts = null;
    const per = new Map(), P = uid => { let x = per.get(uid); if (!x) per.set(uid, x = { decks: 0, act: 0 }); return x; };
    const amis = new Map(), pubs = new Map(), pdl = [], flags = new Map(); let reports = 0, fsOk = false, capped = false;
    if (!FCM_ON) notes.push({ k: 'sa', t: 'Compte de service absent (FCM_SERVICE_ACCOUNT) : comptes et statistiques indisponibles ; seul l\'état du serveur est affiché.' });
    else {
      try { accts = await admAccounts(); src = 'auth'; }
      catch (e) {
        const st = e.http || 0; console.warn('Admin : liste des comptes Firebase impossible (' + (st ? 'HTTP ' + st : 'réseau') + ')');
        notes.push({ k: 'auth', t: st === 403 || st === 401
          ? 'Liste des comptes Firebase refusée au compte de service (HTTP ' + st + ') : comptes tirés de Firestore seulement, sans e-mail, dates d\'inscription ni de connexion. Rôle IAM à ajouter au compte de service : « Lecteur Firebase Authentication » (roles/firebaseauth.viewer).'
          : 'Liste des comptes Firebase injoignable (' + (st ? 'HTTP ' + st : 'réseau') + ') : comptes tirés de Firestore seulement.' });
      }
      try {
        const RE = /\/documents\/users\/([^/]+)\/(meta|decks)\/([^/]+)$/;
        const nm = await admGroup('meta', ['updatedAt', 'text', 'count', 'share', 'dsh', 'wish', 'pts', 'name'], 60, d => {
          const m = RE.exec(d.name); if (!m || m[2] !== 'meta') return;      // autre appli du projet : ignorée
          const x = P(decodeURIComponent(m[1])), f = fsFields(d), at = Number(f.updatedAt) || 0; if (at > x.act) x.act = at;
          if (m[3] === 'collection') Object.assign(x, admColl(f.text, f.count));
          else if (m[3] === 'trade') { x.trade = typeof f.share === 'string' && !!f.share; x.dlinks = f.dsh && typeof f.dsh === 'object' ? Object.keys(f.dsh).length : 0; x.wish = f.wish && typeof f.wish === 'object' ? Object.keys(f.wish).length : 0; }
          else if (m[3] === 'history' && Array.isArray(f.pts)) { const p = f.pts.filter(o => o && Number(o.t) > 0).sort((a, b) => b.t - a.t)[0]; if (p) { x.value = Math.max(0, Math.round(Number(p.v) || 0)); x.valAt = Number(p.t); } }
          else if (m[3] === 'profile' && typeof f.name === 'string') x.pseudo = f.name;
        });
        const nd = await admGroup('decks', ['updatedAt'], 300, d => {
          const m = RE.exec(d.name); if (!m || m[2] !== 'decks') return;
          const x = P(decodeURIComponent(m[1])), at = Number(fsFields(d).updatedAt) || 0; x.decks++; if (at > x.act) x.act = at;
        });
        const [pd, pr, am] = await Promise.all([admList('pubdecks', ['o', 'by', 'cmd', 'updatedAt']), admList('pubreports', ['d']), admList('amis', ['j'])]);
        for (const d of pr) { const x = fsFields(d).d; if (typeof x === 'string') flags.set(x, (flags.get(x) || 0) + 1); }
        for (const d of pd) {      // decks publics : gardés ici (serveur seulement) pour les lister par compte, les signalés et les retirer
          const id = String(d.name || '').split('/').pop(), f = fsFields(d), o = f.o; if (!/^[0-9a-f]{64}_[0-9]$/.test(id) || o !== id.slice(0, 64)) continue;
          pubs.set(o, (pubs.get(o) || 0) + 1); const rep = flags.get(id) || 0;
          pdl.push({ k: admId('pub:' + id), id, o, slot: Number(id.slice(65)), by: typeof f.by === 'string' ? f.by.slice(0, 30) : '', cmd: Array.isArray(f.cmd) ? f.cmd.filter(c => typeof c === 'string').slice(0, 2).map(c => c.slice(0, 150)) : [],
            at: Number(f.updatedAt) || 0, rep, hid: PUB_HIDE.has(id) || rep >= PUB_REPORTS });
        }
        reports = pr.length;
        for (const d of am) { const t = String(d.name || '').split('/').pop(), s = AM_TAG.test(t) ? amRead(String(fsFields(d).j || '')) : null; if (s) amis.set(t, { n: s.n, l: s.l, f: amN(s.f), i: amN(s.i), o: amN(s.o) }); }
        capped = nm >= ADM_DOCS || nd >= ADM_DOCS || pd.length >= ADM_DOCS || am.length >= ADM_DOCS;
        fsOk = true; if (src === 'none') src = 'firestore';
      } catch (e) {
        const st = e.http || 0; console.warn('Admin : Firestore illisible (' + (st ? 'HTTP ' + st : 'réseau') + ')');
        notes.push({ k: 'fs', t: 'Firestore illisible (' + (st ? 'HTTP ' + st : 'réseau') + ') : statistiques par compte indisponibles.' + (st === 400 || st === 412 ? ' Requête « groupe de collections » (meta, decks) refusée : index manquant ?' : '') });
      }
      if (capped) notes.push({ k: 'cap', t: 'Plus de ' + ADM_DOCS + ' documents dans une collection : statistiques partielles (ADMIN_MAX_DOCS).' });
    }
    // Lignes réduites : un compte Firebase (ou, sans la liste des comptes, un compte trouvé dans Firestore) par ligne
    const list = accts || [...per.keys()].map(uid => ({ uid, email: '', ver: null, dn: '', dis: false, prov: [], created: 0, login: 0, refresh: 0 }));
    const who = new Map(), byTag = new Map();      // identifiant opaque → UID (actions), empreinte → identifiant (decks publics) : serveur seulement, jamais envoyés
    const now = Date.now(), rows = list.map(a => {
      const x = per.get(a.uid), tag = amTag(a.uid), m = amis.get(tag), pb = pubs.get(tag) || 0, id = admId(a.uid);
      who.set(id, { uid: a.uid, adm: !!(a.ver && a.email && ADMIN_SET.has(admHash(a.email))) }); byTag.set(tag, id);
      return { id, name: admName(x && x.pseudo) || admName(m && m.n) || admName(a.dn), mail: admMail(a.email), created: a.created, login: a.login,
        seen: Math.min(now, Math.max(a.login, a.refresh, x ? x.act : 0)), prov: a.prov.map(p => ADM_PROV[p] || 'autre'), verified: a.ver, disabled: a.dis,
        cards: x && Number.isFinite(x.cards) ? x.cards : 0, copies: x && x.copies || 0, decks: x ? x.decks : 0, pub: pb, trade: !!(x && x.trade), dlinks: x && x.dlinks || 0, wish: x && x.wish || 0,
        friends: m ? m.f : 0, inc: m ? m.i : 0, out: m ? m.o : 0, lang: m ? m.l : '', value: x && x.value || 0, mo: !!(x || m || pb) };
    });
    // Totaux, inscriptions des 30 derniers jours (heure de Paris), activité
    const sum = k => rows.reduce((t, r) => t + (Number(r[k]) || 0), 0), cnt = fn => rows.reduce((t, r) => t + (fn(r) ? 1 : 0), 0);
    const days = admDays(now), byDay = new Map(days.map(d => [d, 0]));
    for (const r of rows) if (r.created) { const d = admDay(r.created); if (byDay.has(d)) byDay.set(d, byDay.get(d) + 1); }
    const prov = {}, langs = {};
    for (const r of rows) { for (const p of r.prov) prov[p] = (prov[p] || 0) + 1; if (r.lang) langs[r.lang] = (langs[r.lang] || 0) + 1; }
    const ov = { users: rows.length, mo: cnt(r => r.mo), verified: src === 'auth' ? cnt(r => r.verified) : null, disabled: cnt(r => r.disabled), prov, langs,
      new7: cnt(r => r.created > now - 7 * 86400e3), new30: cnt(r => r.created > now - 30 * 86400e3), days: days.map(d => [d, byDay.get(d)]),
      act7: cnt(r => r.seen > now - 7 * 86400e3), act30: cnt(r => r.seen > now - 30 * 86400e3), log7: cnt(r => r.login > now - 7 * 86400e3), log30: cnt(r => r.login > now - 30 * 86400e3),
      cards: sum('cards'), copies: sum('copies'), colls: cnt(r => r.copies > 0), decks: sum('decks'), pub: [...pubs.values()].reduce((t, n) => t + n, 0), reports,
      trade: cnt(r => r.trade), dlinks: sum('dlinks'), wish: sum('wish'), friendships: Math.round([...amis.values()].reduce((t, m) => t + m.f, 0) / 2), pending: [...amis.values()].reduce((t, m) => t + m.i, 0), amis: amis.size,
      value: sum('value'), valued: cnt(r => r.value > 0), fs: fsOk };
    ADM.snap = { at: now, src, notes, ov, rows, who, byTag, decks: pdl };
    if (rows.length) await admNote(rows.map(r => r.seen), now).catch(() => {});      // comptes actifs du jour (courbe)
  })().catch(e => { console.warn('Admin : calcul impossible (' + String(e && e.message || e).slice(0, 80) + ')'); }).finally(() => { ADM.run = null; });
  return ADM.run;
}
/** État du serveur, relu à chaque appel (mémoire seulement : rien à lire ailleurs). */
/** Dossier des données (EDH_DATA_DIR) gardé d'un démarrage à l'autre ? Repère .data/boot.json : date de sa création et nombre de démarrages. Un dossier
 *  recréé à chaque déploiement (parties, classements, testeurs, signalements perdus) se voit au panneau : « créé à ce démarrage » après un redéploiement. */
const DATA_BOOT = { first: 0, boots: 0, err: '' };
(async () => {
  const f = join(EDH_DIR, 'boot.json');
  try { const j = JSON.parse(await readFile(f, 'utf8')); DATA_BOOT.first = Number(j.first) || 0; DATA_BOOT.boots = Number(j.boots) || 0; } catch (e) { /* premier démarrage avec ce dossier */ }
  if (!DATA_BOOT.first) DATA_BOOT.first = Date.now(); DATA_BOOT.boots++;
  try { await mkdir(EDH_DIR, { recursive: true }); await writeFile(f, JSON.stringify({ first: DATA_BOOT.first, boots: DATA_BOOT.boots, last: Date.now() })); } catch (e) { DATA_BOOT.err = String(e && e.code || e); }
})();
async function admServer() {
  const troc = { wait: 0, live: 0, done: 0, all: TROC.s.size }; for (const s of TROC.s.values()) if (s.st in troc) troc[s.st]++;
  const partie = { wait: 0, live: 0, done: 0, all: PT.s.size }; for (const r of PT.s.values()) if (r.st in partie) partie[r.st]++;
  let run = 0; for (const j of jobs.values()) if (j.status === 'running') run++;
  return { build: await pageBuild(), up: Math.round(process.uptime()), node: process.version, rss: Math.round(process.memoryUsage().rss / 1048576),
    flags: { token: !!TOKEN, login: AUTH_FB, key: !!APP_KEY, jobs: JOBS_ON, alerts: ALERTS_ON, push: PUSH_ON, fcm: FCM_ON, pub: PUB_ON, amis: AM_ON, troc: TROC_ON, partie: PT_ON, names: NM_ON, ads: !!ADMOB_BANNER, scans: SR_ON }, off: OFF,
    prices: { on: !!PX_SRC, at: PX_ST.at, cards: PX_ST.cards, check: PX_ST.check, err: PX_ST.err }, edh: { on: !!EDH_SRC, at: EDH_ST.at, decks: EDH_ST.decks, cmds: EDH_ST.cmds, from: EDH_ST.from, check: EDH_ST.check, err: EDH_ST.err },
    troc, partie, jobs: { run, all: jobs.size }, alerts: { devices: AL.subs.size, last: Number(AL.last.at) || 0, hits: Number(AL.last.hits) || 0 },
    pub: { n: PUB.n, hid: PUB.hid, at: PUB.at, err: PUB.err ? 'erreur' : '' }, amis: { cache: AMI.cache.size, due: AMI.due.size },
    data: { dir: EDH_DIR, env: !!process.env.EDH_DATA_DIR, first: DATA_BOOT.first, boots: DATA_BOOT.boots, err: DATA_BOOT.err } };
}
const admFold = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
/** Comptes de l'instantané comme la liste affichée : recherche (nom réduit, e-mail masqué), tri et sens de ?q, sort, dir. */
function admPick(s, url) {
  const q = admFold(String(url.searchParams.get('q') || '').slice(0, 60).trim());
  const sort = ADM_SORTS.includes(url.searchParams.get('sort')) ? url.searchParams.get('sort') : 'created', asc = url.searchParams.get('dir') === 'asc';
  let rows = s ? s.rows : [];
  if (q) rows = rows.filter(r => admFold(r.name).includes(q) || admFold(r.mail).includes(q));
  rows = rows.slice().sort((a, b) => ((Number(a[sort]) || 0) - (Number(b[sort]) || 0)) * (asc ? 1 : -1) || (a.id < b.id ? -1 : 1));
  return { rows, q, sort, asc };
}
/** Deck public tel que la page le reçoit : clé opaque (jamais l'identifiant du document, qui contient l'empreinte du compte), pseudo et commandants
 *  (déjà publics), date, signalements, masqué (PUBDECKS_HIDE ou PUBDECKS_REPORTS signalements), compte (identifiant opaque, nom réduit, e-mail masqué). */
function admDeckOut(s, d) {
  const id = s.byTag.get(d.o) || '', r = id ? s.rows.find(x => x.id === id) : null;
  return { k: d.k, slot: d.slot, by: d.by, cmd: d.cmd, at: d.at, rep: d.rep, hid: d.hid, owner: id, name: r ? r.name : '', mail: r ? r.mail : '' };
}
const admReported = s => (s ? s.decks.filter(d => d.rep > 0).sort((a, b) => b.rep - a.rep || b.at - a.at).slice(0, 100).map(d => admDeckOut(s, d)) : []);
/** Journal des actions : liste chargée une fois ; fichier présent mais illisible : erreur (jamais réécrit par-dessus). */
async function admLogList() {
  if (ADM_LOG.list) return ADM_LOG.list;
  try { const j = JSON.parse(await readFile(ADM_LOG_FILE, 'utf8')); ADM_LOG.list = (Array.isArray(j.list) ? j.list : []).filter(x => x && Number.isFinite(x.t)); }
  catch (e) { if (e && e.code !== 'ENOENT') throw e; ADM_LOG.list = []; }
  return ADM_LOG.list;
}
const admLogShow = () => admLogList().then(l => l.slice(-ADM_LOG_SHOW).reverse(), () => null);
/** Note une action (réussie ou non) : { t, a: off | on | pub, n: nom réduit, m: e-mail masqué, d: deck, ok, e: erreur, by: éditeur masqué }. */
function admLog(rec) {
  return admRun(ADM_LOG, async () => { const l = await admLogList(); l.push(rec); if (l.length > ADM_LOG_MAX) l.splice(0, l.length - ADM_LOG_MAX); await admSave(ADM_LOG_FILE, { v: 1, list: l }); })
    .catch(e => { console.warn('Admin : journal des actions impossible à écrire (' + (e && e.code || 'erreur') + ')'); });
}
/** Comptes actifs par jour gardés ({ 'AAAA-MM-JJ': { a, at } }) ; fichier illisible : historique vide, jamais réécrit par-dessus. */
async function admActLoad() {
  if (ADM_ACT.days) return ADM_ACT.days;
  try { const j = JSON.parse(await readFile(ADM_ACT_FILE, 'utf8')); ADM_ACT.days = j && j.days && typeof j.days === 'object' && !Array.isArray(j.days) ? j.days : {}; }
  catch (e) { if (e && e.code !== 'ENOENT') { ADM_ACT.bad = true; console.warn('Admin : ' + ADM_ACT_FILE + ' illisible, comptes actifs non relevés'); } ADM_ACT.days = {}; }
  return ADM_ACT.days;
}
/** Relevé des comptes actifs (dates de dernière activité) : nombre de comptes actifs aujourd'hui (heure de Paris), le plus haut relevé du jour gardé (il ne
 *  fait que monter jusqu'à minuit). La veille n'est complétée que si elle a déjà un relevé (le lendemain, un compte revenu n'y compte plus : jamais un
 *  jour commencé par un relevé du lendemain). */
function admNote(seen, now = Date.now()) {
  return admRun(ADM_ACT, async () => {
    const days = await admActLoad(); if (ADM_ACT.bad) return;
    const [yday, today] = admDays(now, 2), n = { [today]: 0, [yday]: 0 };
    for (const t of seen) { const d = t > 0 ? admDay(t) : ''; if (d in n) n[d]++; }
    let ch = false;
    for (const d of [yday, today]) if ((d === today || days[d]) && (!days[d] || n[d] > days[d].a)) { days[d] = { a: n[d], at: now }; ch = true; }
    const keys = Object.keys(days).sort(); for (const k of keys.slice(0, Math.max(0, keys.length - ADM_DAYS_KEPT))) { delete days[k]; ch = true; }
    if (ch) await admSave(ADM_ACT_FILE, { v: 1, days });
  });
}
/** Relevé régulier (ADMIN_ACTIVE_EVERY_MS) : liste des comptes Firebase seulement (aucune lecture Firestore) ; sauté juste après un calcul complet. */
async function admTick() {
  if (!FCM_ON || ADM.run || (ADM.snap && Date.now() - ADM.snap.at < ADM_EVERY / 2)) return;
  try { const l = await admAccounts(), now = Date.now(); await admNote(l.map(a => Math.min(now, Math.max(a.login, a.refresh))), now); ADM_ACT.err = 0; }
  catch (e) { const st = e && e.http || 0; if (ADM_ACT.err !== st) console.warn('Admin : relevé des comptes actifs impossible (' + (st ? 'HTTP ' + st : 'réseau') + ')'); ADM_ACT.err = st; }
}
/** Courbe des actifs : les 30 derniers jours (null : pas de relevé ce jour-là), premier jour relevé. */
async function admActive(now = Date.now()) {
  let days = {}; try { days = await admActLoad(); } catch (e) { /* vide */ }
  return { days: admDays(now).map(d => [d, days[d] ? days[d].a : null]), since: Object.keys(days).sort()[0] || '', every: ADM_EVERY };
}
/** Réponse : instantané (âge), avis, totaux, état du serveur, une page de comptes (tri, recherche sur le nom réduit et l'e-mail masqué), actifs par jour,
 *  decks publics signalés, dernières actions. */
async function admSend(res, url) {
  const s = ADM.snap, { rows, q, sort, asc } = admPick(s, url);
  const pages = Math.max(1, Math.ceil(rows.length / ADM_PER)), page = Math.min(pages, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
  let testers = null; try { testers = (await tsList()).length; } catch (e) { /* fichier illisible : la carte l'indique */ }
  return json(res, 200, { at: s ? s.at : 0, ttl: ADM_TTL, testers, scans: await srSummary(), src: s ? s.src : 'none', notes: s ? s.notes : [{ k: 'none', t: 'Statistiques momentanément indisponibles.' }], ov: s ? s.ov : null, srv: await admServer(),
    active: await admActive(), reported: admReported(s), pubMax: PUB_REPORTS, log: await admLogShow(), acts: FCM_ON,
    users: { total: rows.length, page, pages, per: ADM_PER, sort, dir: asc ? 'asc' : 'desc', q, rows: rows.slice((page - 1) * ADM_PER, page * ADM_PER) } }, ADM_HD);
}
/** CSV (point-virgule, BOM : Excel en français l'ouvre tel quel) : les mêmes champs réduits que la liste, tri et recherche en cours. Une cellule qui
 *  commence par = + - @ (pseudo libre) est précédée d'une apostrophe : jamais lue comme une formule par le tableur. */
const admCell = v => { let x = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(x)) x = '\'' + x; return /[;"\r\n]/.test(x) ? '"' + x.replace(/"/g, '""') + '"' : x; };
const ADM_PROV_FR = { google: 'Google', mail: 'E-mail', apple: 'Apple', phone: 'Téléphone', facebook: 'Facebook', github: 'GitHub', twitter: 'X', microsoft: 'Microsoft', autre: 'Autre' };      // comme la page
const ADM_CSV = [['Nom', r => r.name], ['E-mail (masqué)', r => r.mail], ['Connexion', r => r.prov.map(p => ADM_PROV_FR[p] || p).join(' + ')], ['Adresse vérifiée', r => (r.verified == null ? '' : r.verified ? 'oui' : 'non')],
  ['Désactivé', r => (r.disabled ? 'oui' : 'non')], ['Données Mana Orbit', r => (r.mo ? 'oui' : 'non')], ['Inscription', r => admStamp(r.created)], ['Dernière connexion', r => admStamp(r.login)],
  ['Dernière activité', r => admStamp(r.seen)], ['Cartes', r => r.cards], ['Exemplaires', r => r.copies], ['Decks', r => r.decks], ['Decks publics', r => r.pub], ['Lien d\'échange', r => (r.trade ? 'oui' : 'non')],
  ['Decks partagés', r => r.dlinks], ['Cartes recherchées', r => r.wish], ['Amis', r => r.friends], ['Demandes reçues', r => r.inc], ['Demandes envoyées', r => r.out], ['Langue', r => r.lang.toUpperCase()],
  ['Valeur (€)', r => (r.value ? (r.value / 100).toFixed(2).replace('.', ',') : '0')]];
function admCsv(res, url) {
  const { rows } = admPick(ADM.snap, url), body = Buffer.from('﻿' + [ADM_CSV.map(c => c[0]), ...rows.map(r => ADM_CSV.map(c => c[1](r)))].map(l => l.map(admCell).join(';')).join('\r\n') + '\r\n');
  res.writeHead(200, { ...SEC, ...ADM_HD, 'Content-Type': 'text/csv; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Length': body.length, 'Content-Disposition': `attachment; filename="comptes-mana-orbit-${admDay(Date.now())}.csv"` });
  return res.end(body);
}
/** Deck public retiré par le panneau : enlevé tout de suite de la liste servie (/api/pubdecks), sans relecture ; la relecture suivante ne le trouve plus. */
async function pubForget(id) {
  if (!PUB.raw) return;
  try {
    const j = JSON.parse(PUB.raw.toString('utf8')), n = j.decks.length; j.decks = j.decks.filter(d => !d || d.id !== id); if (j.decks.length === n) return;
    const raw = Buffer.from(JSON.stringify(j)); Object.assign(PUB, { raw, gz: await gzipA(raw), etag: '"' + sha1Of(raw) + '"', n: j.decks.length });
  } catch (e) { /* liste illisible : relue au prochain passage */ }
}
/** Actions (POST, compte de l'éditeur déjà vérifié) : disable { id, on } désactive (on: true) ou réactive un compte, pubdel { k } retire un deck public.
 *  Contre les requêtes d'une autre page : jeton dans un en-tête (jamais un cookie), JSON exigé (un formulaire ne peut pas en envoyer), Sec-Fetch-Site
 *  same-origin quand le navigateur l'envoie. ADMIN_ACTIONS_PER_H par heure et par réseau. Chaque essai est noté au journal (jamais d'UID). */
async function admAct(req, res, sub, u) {
  const sf = String(req.headers['sec-fetch-site'] || '');
  if (sf && sf !== 'same-origin' && sf !== 'none') return json(res, 403, { error: 'cross_site', message: 'Action refusée : demande venue d\'une autre page.' }, ADM_HD);
  if (!/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' }, ADM_HD);
  const w = rateWait(req, 'adminact', ADM_ACT_H, 3600e3); if (w) return tooMany(res, w);
  let b; try { b = JSON.parse((await readBody(req, 1024)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, ADM_HD); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'bad_request', message: 'JSON invalide' }, ADM_HD);
  const s = ADM.snap; if (!FCM_ON || !s) return json(res, 503, { error: 'unavailable', message: FCM_ON ? 'Statistiques pas encore calculées : recharge la page.' : 'Compte de service absent (FCM_SERVICE_ACCOUNT) : action impossible.' }, ADM_HD);
  const by = admMail(u.email), fail = (e, rec, what) => {
    const st = e && e.http || 0; console.warn('Admin : ' + what + ' impossible (' + (st ? 'HTTP ' + st : 'réseau') + ')');
    return admLog({ ...rec, ok: false, e: st ? 'HTTP ' + st : 'réseau' }).then(admLogShow).then(log => ({ st, log }));
  };
  if (sub === 'disable') {
    const id = typeof b.id === 'string' ? b.id : '', on = b.on, x = s.who.get(id), row = x && s.rows.find(r => r.id === id);
    if (typeof on !== 'boolean') return json(res, 400, { error: 'bad_request', message: 'on (true : désactiver, false : réactiver) attendu.' }, ADM_HD);
    if (!row) return json(res, 404, { error: 'not_found', message: 'Compte introuvable : recharge la page.' }, ADM_HD);
    if (x.uid === u.uid || x.adm) return json(res, 400, { error: 'admin_account', message: 'Compte administrateur : jamais désactivé depuis ce panneau.' }, ADM_HD);
    const rec = { t: Date.now(), a: on ? 'off' : 'on', n: row.name, m: row.mail, by };
    try { await admFetch(`${IT_BASE}/v1/projects/${fcmSa.project}/accounts:update`, IT_SCOPE, { method: 'POST', body: JSON.stringify({ localId: x.uid, disableUser: on }) }); }
    catch (e) {
      const { st, log } = await fail(e, rec, on ? 'désactivation' : 'réactivation'), iam = st === 403 || st === 401, what = on ? 'Désactivation' : 'Réactivation';
      return json(res, 502, { error: iam ? 'iam' : 'upstream', log, message: iam ? what + ' refusée au compte de service (HTTP ' + st + '). Rôle IAM à ajouter au compte de service : « Administrateur Firebase Authentication » (roles/firebaseauth.admin).'
        : what + ' impossible (' + (st ? 'HTTP ' + st : 'réseau') + ') : réessaie plus tard.' }, ADM_HD);
    }
    row.disabled = on; s.ov.disabled = s.rows.reduce((t, r) => t + (r.disabled ? 1 : 0), 0);
    await admLog({ ...rec, ok: true });
    return json(res, 200, { ok: true, row, ov: s.ov, log: await admLogShow() }, ADM_HD);
  }
  // pubdel : document pubdecks/… effacé (s'il existe encore) ; ses signalements restent (republié au même emplacement, il reste masqué s'il l'était)
  const k = typeof b.k === 'string' ? b.k : '', i = s.decks.findIndex(d => d.k === k), d = s.decks[i];
  if (!d) return json(res, 404, { error: 'not_found', message: 'Deck introuvable : recharge la page.' }, ADM_HD);
  const oid = s.byTag.get(d.o) || '', row = oid ? s.rows.find(r => r.id === oid) : null;
  const rec = { t: Date.now(), a: 'pub', n: row ? row.name : '', m: row ? row.mail : '', d: [d.cmd.join(' + '), d.by ? 'par ' + d.by : ''].filter(Boolean).join(' · '), by };
  let gone = false;
  try { await admFetch(`${admDocs()}/pubdecks/${encodeURIComponent(d.id)}?currentDocument.exists=true`, DS_SCOPE, { method: 'DELETE' }); }
  catch (e) {
    if (e.http === 404) gone = true;      // déjà retiré (par son propriétaire, ou ailleurs)
    else { const { st, log } = await fail(e, rec, 'retrait d\'un deck public'); return json(res, 502, { error: 'upstream', log, message: 'Retrait impossible (' + (st ? 'HTTP ' + st : 'réseau') + ') : réessaie plus tard.' }, ADM_HD); }
  }
  s.decks.splice(i, 1); if (row) row.pub = Math.max(0, row.pub - 1); s.ov.pub = Math.max(0, s.ov.pub - 1); await pubForget(d.id);
  await admLog({ ...rec, ok: true, ...(gone ? { e: 'déjà retiré' } : {}) });
  return json(res, 200, { ok: true, gone, ov: s.ov, reported: admReported(s), log: await admLogShow() }, ADM_HD);
}
/** Compte de l'éditeur ? Oui : le compte vérifié ({ uid, email… }) ; sinon réponse d'erreur envoyée (sans aucune donnée) et false. Un compte authentique
 *  mais non autorisé est compté comme un essai invalide. */
async function admAuth(req, res) {
  const tok = String(req.headers['x-firebase-token'] || '');
  if (!tok) { json(res, 401, { error: 'auth_required', message: 'Connecte-toi.' }, ADM_HD); return false; }
  if (isLocked(req)) { json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { ...ADM_HD, 'Retry-After': '300' }); return false; }
  let u;
  try { u = await verifyIdToken(tok, true); }
  catch (e) {
    const code = e && e.authCode;
    if (code === 'expired') json(res, 401, { error: 'token_expired', message: 'Session expirée.' }, ADM_HD);
    else if (code === 'unavailable') json(res, 503, { error: 'auth_unavailable', message: 'Vérification du compte impossible pour le moment.' }, { ...ADM_HD, 'Retry-After': '5' });
    else await badKey(req, res, 'bad_token', 401);
    return false;
  }
  if (u.email && u.emailVerified && ADMIN_SET.has(admHash(u.email))) return u;
  await badHit(req);
  json(res, 403, { error: 'forbidden', message: 'Accès réservé.' }, ADM_HD); return false;
}
async function adminApi(req, res, path, url) {
  if (!ADMIN_ON) return json(res, 404, { error: 'not_found' }, ADM_HD);
  const img = /^admin\/scans\/[0-9a-z-]+\.jpg$/.test(path), w = img ? rateWait(req, 'adminimg', 600, 600e3) : rateWait(req, 'admin', 120, 600e3); if (w) return tooMany(res, w);      // photos des scans signalés : leur propre budget (une par signalement affiché)
  const u = await admAuth(req, res); if (!u) return;
  const sub = path.replace(/^admin\/?/, '');
  if (sub === 'scans' || sub.startsWith('scans/')) return srAdmin(req, res, sub, url);      // scans signalés depuis l'appli
  if (sub === 'daily' || sub.startsWith('daily/')) return DLY ? DLY.admin(req, res, sub, url) : json(res, 404, { error: 'not_found' }, ADM_HD);      // Carte mystère : joueurs des 7 derniers jours, pseudo masqué
  if (req.method === 'GET' && !sub) {
    if (!ADM.snap || Date.now() - ADM.snap.at > ADM_TTL) await admRefresh();      // trop ancien : recalculé (la page attend : c'est l'éditeur qui l'a demandé)
    return admSend(res, url);
  }
  if (req.method === 'GET' && sub === 'testeurs') {      // inscrits au test fermé : adresses complètes (données pour cet usage), de la plus récente à la plus ancienne
    let list; try { list = await tsList(); } catch (e) { return json(res, 503, { error: 'unavailable', message: 'Fichier des testeurs illisible.' }, ADM_HD); }
    return json(res, 200, { total: list.length, rows: list.slice().sort((a, b) => b.t - a.t) }, ADM_HD);
  }
  if (req.method === 'POST' && sub === 'refresh') {
    const gap = ADM.tried + ADM_GAP - Date.now(); if (gap > 0) return json(res, 429, { error: 'rate_limited', message: 'Déjà rafraîchi il y a moins d\'une minute.', retry: Math.ceil(gap / 1000) }, { ...ADM_HD, 'Retry-After': String(Math.ceil(gap / 1000)) });
    const w2 = rateWait(req, 'adminref', ADM_REF_H, 3600e3); if (w2) return tooMany(res, w2);
    await admRefresh(); return admSend(res, url);
  }
  if (req.method === 'GET' && sub === 'export') {      // liste des comptes en CSV (tri et recherche en cours) : le même instantané, aucune lecture de plus
    const w2 = rateWait(req, 'adminexp', ADM_EXP_H, 3600e3); if (w2) return tooMany(res, w2);
    if (!ADM.snap || Date.now() - ADM.snap.at > ADM_TTL) await admRefresh();
    return admCsv(res, url);
  }
  if (req.method === 'GET' && sub === 'pubdecks') {      // decks publics d'un compte (identifiant opaque de la liste), tirés de l'instantané
    const s = ADM.snap, id = String(url.searchParams.get('id') || '');
    if (!s || !s.who.has(id)) return json(res, 404, { error: 'not_found', message: 'Compte introuvable : recharge la page.' }, ADM_HD);
    return json(res, 200, { rows: s.decks.filter(d => s.byTag.get(d.o) === id).sort((a, b) => a.slot - b.slot).map(d => admDeckOut(s, d)) }, ADM_HD);
  }
  if (req.method === 'POST' && (sub === 'disable' || sub === 'pubdel')) return admAct(req, res, sub, u);
  return json(res, 405, { error: 'method_not_allowed' }, ADM_HD);
}

/* ── Inscriptions au test fermé : formulaire de la page /testeurs ──────────────────────────────────────────────────────────────
   POST /api/testeurs {email, site} : l'adresse (minuscules) et la date sont gardées dans .data/testeurs.json, rien d'autre (ni IP, ni navigateur).
   « site » est un champ caché que seuls les robots remplissent : réponse « ok » sans rien garder. Même réponse qu'une adresse soit nouvelle ou déjà
   inscrite (on ne révèle pas qui est inscrit). Bornée : TESTERS_RATE_PER_H inscriptions par heure et par réseau (5), TS_MAX adresses au total.
   Lecture : panneau /admin seulement (GET /api/admin/testeurs, compte de l'éditeur), qui les exporte en CSV pour la liste de testeurs de la Play Console.
   Retrait sur demande (contact@manaorbit.app) : enlever la ligne du fichier ; supprimer le fichier à la fin du test. Écriture atomique, une à la fois. */
const TS_FILE = process.env.TESTERS_FILE || join(EDH_DIR, 'testeurs.json'), TS_MAX = Number(process.env.TESTERS_MAX) || 5000, TS_RATE = Number(process.env.TESTERS_RATE_PER_H ?? 5);
const TS = { list: null, chain: Promise.resolve() };
/** Liste chargée une fois ; fichier présent mais illisible : erreur (jamais réécrit par-dessus avec une liste vide). */
async function tsList() {
  if (TS.list) return TS.list;
  try { const j = JSON.parse(await readFile(TS_FILE, 'utf8')); TS.list = (Array.isArray(j.list) ? j.list : []).filter(r => r && typeof r.e === 'string' && Number.isFinite(r.t)); }
  catch (e) { if (e && e.code !== 'ENOENT') throw e; TS.list = []; }
  return TS.list;
}
async function tsSave() {
  await mkdir(dirname(TS_FILE), { recursive: true });
  const tmp = TS_FILE + '.tmp';
  await writeFile(tmp, JSON.stringify({ v: 1, list: TS.list }));
  await rename(tmp, TS_FILE);
}
/** Adresse plausible, en minuscules ; '' sinon. */
function tsMail(x) {
  const e = String(x || '').trim().toLowerCase();
  if (e.length > 254 || !/^[a-z0-9._%+'-]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,24}$/.test(e) || /\.\.|^\.|\.@/.test(e)) return '';
  return e;
}
async function testersApi(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const w = rateWait(req, 'testeurs', TS_RATE, 3600e3); if (w) return tooMany(res, w);
  let b; try { b = JSON.parse((await readBody(req, 2048)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'bad_request', message: 'JSON invalide' });
  if (b.site) return json(res, 200, { ok: true });      // piège à robots
  const e = tsMail(b.email);
  if (!e) return json(res, 400, { error: 'bad_email', message: 'Adresse e-mail invalide.' });
  const run = TS.chain.then(async () => {
    const list = await tsList();
    if (list.some(r => r.e === e)) return 'ok';
    if (list.length >= TS_MAX) return 'full';
    list.push({ e, t: Date.now() });
    try { await tsSave(); } catch (err) { list.pop(); throw err; }
    return 'ok';
  });
  TS.chain = run.catch(() => {});
  let r;
  try { r = await run; } catch (err) { console.warn('Testeurs : enregistrement impossible (' + (err && err.code || 'erreur') + ')'); return json(res, 503, { error: 'unavailable', message: 'Inscription impossible pour le moment : réessaie plus tard.' }, { 'Retry-After': '60' }); }
  if (r === 'full') return json(res, 507, { error: 'full', message: 'Les inscriptions sont complètes pour le moment.' });
  return json(res, 200, { ok: true });
}

/* ── Scans signalés : « Signaler un problème de scan » dans l'appli (src/scanreport.js) ──────────────────────────────────────────
   POST /api/scan-report { img, what, note, meta }, envoyé seulement quand l'utilisateur le demande. img : photo réduite de la carte (data URL JPEG, 350 Ko au plus
   une fois décodée, en-tête FFD8 et dimensions lues dans l'image) ; what : ce qui ne va pas (card, lang, ed, miss, other) ; note : commentaire (300 caractères) ;
   meta : ce que l'appli a lu (texte du nom, ligne du bas, carte retenue, diagnostic, moteur OCR, cadrage, réglages du scan, version, appli ou navigateur, langue),
   nettoyé (8 Ko, 5 niveaux, textes de 300 caractères). Sans compte ; avec un jeton Firebase (x-firebase-token, vérifié), seule une empreinte de l'UID est gardée
   (16 premiers caractères de son SHA-256, comme amTag). Ni adresse IP, ni navigateur, ni e-mail. Bornes : SCAN_REPORTS_PER_H par heure et par réseau (20), autant par compte.
   Disque : SCAN_REPORTS_DIR (défaut .data/scan-reports), <id>.jpg puis <id>.json (id : date en base 36 + 8 caractères aléatoires ; sans son .json, un signalement
   n'existe pas). Au plus SCAN_REPORTS_MAX signalements (1 000) et SCAN_REPORTS_MB (200 Mo) : les plus anciens partent ; effacés après SCAN_REPORTS_DAYS (90 jours ;
   vérifié à chaque envoi, à chaque lecture du panneau et toutes les 6 h). Index en mémoire (id, date, taille), relu du disque au premier besoin.
   Lecture : panneau /admin seulement (GET /api/admin/scans, GET /api/admin/scans/<id>.jpg, DELETE /api/admin/scans/<id> ; compte de l'éditeur, admAuth).
   SCAN_REPORTS=0 : coupé (404 partout, /__ping scanrep: false : l'appli cache le bouton). Effacement sur demande : supprimer le signalement dans le panneau. */
const SR_ON = process.env.SCAN_REPORTS !== '0';
const SR_DIR = process.env.SCAN_REPORTS_DIR || join(EDH_DIR, 'scan-reports');
const SR_MAX = Number(process.env.SCAN_REPORTS_MAX) > 0 ? Math.floor(Number(process.env.SCAN_REPORTS_MAX)) : 1000;
const SR_BYTES = (Number(process.env.SCAN_REPORTS_MB) > 0 ? Number(process.env.SCAN_REPORTS_MB) : 200) * 1048576;
const SR_TTL = (Number(process.env.SCAN_REPORTS_DAYS) > 0 ? Number(process.env.SCAN_REPORTS_DAYS) : 90) * 86400e3;
const SR_RATE = Number(process.env.SCAN_REPORTS_PER_H ?? 20);
const SR_IMG = 350 * 1024, SR_BODY = 520 * 1024, SR_META = 8 * 1024, SR_NOTE = 300, SR_PER = 20;      // image décodée, corps de la requête, données de lecture, commentaire, signalements par page du panneau
const SR_WHAT = ['card', 'lang', 'ed', 'miss', 'other'], SR_ID = /^[0-9a-z]{8,10}-[0-9a-f]{8}$/;
const SR = { list: null, loading: null, chain: Promise.resolve(), lim: new Map() };
/** Une modification de l'index ou du dossier à la fois (envoi, purge, suppression). */
const srRun = fn => { const p = SR.chain.then(fn); SR.chain = p.catch(() => {}); return p; };
const srTime = id => parseInt(id.split('-')[0], 36) || 0;
/** Index des signalements du disque, du plus ancien au plus récent : [{ id, t, size }]. Restes d'un envoi interrompu (sans .json, .tmp) effacés après 10 min. */
function srLoad() {
  if (SR.list) return Promise.resolve(SR.list);
  if (!SR.loading) SR.loading = (async () => {
    let names = [];
    try { names = await readdir(SR_DIR); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    const set = new Set(names), list = [], stale = Date.now() - 600e3;
    for (const f of names) {
      const m = /^(.+)\.(json|jpg)(\.tmp)?$/.exec(f), id = m && m[1];
      if (!m || !SR_ID.test(id)) continue;
      if (m[2] === 'json' && !m[3] && set.has(id + '.jpg')) {
        try { const [a, b] = await Promise.all([stat(join(SR_DIR, f)), stat(join(SR_DIR, id + '.jpg'))]); list.push({ id, t: srTime(id), size: a.size + b.size }); } catch (e) { /* effacé entre-temps */ }
      } else if ((m[3] || !set.has(id + '.json') || !set.has(id + '.jpg')) && srTime(id) < stale) await unlink(join(SR_DIR, f)).catch(() => {});
    }
    SR.list = list.sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1));
    return SR.list;
  })().finally(() => { SR.loading = null; });
  return SR.loading;
}
async function srDrop(id) { for (const ext of ['.json', '.jpg']) { try { await unlink(join(SR_DIR, id + ext)); } catch (e) { if (e.code !== 'ENOENT') throw e; } } }      // .json d'abord : un reste n'est jamais un signalement à moitié
/** Plus vieux que SCAN_REPORTS_DAYS, puis au-delà de SCAN_REPORTS_MAX ou de SCAN_REPORTS_MB : effacés, les plus anciens d'abord. Retourne le nombre effacé. */
async function srPurge() {
  const list = await srLoad(), old = Date.now() - SR_TTL; let bytes = list.reduce((a, x) => a + x.size, 0), n = 0;
  while (list.length && (list[0].t < old || list.length > SR_MAX || bytes > SR_BYTES)) { const x = list.shift(); bytes -= x.size; await srDrop(x.id); n++; }
  return n;
}
/** Enregistre un signalement (image, puis sa fiche) et fait la place. */
async function srSave(rec, img) {
  const list = await srLoad(), base = join(SR_DIR, rec.id), js = JSON.stringify(rec);
  await mkdir(SR_DIR, { recursive: true });
  try {
    await writeFile(base + '.jpg.tmp', img); await rename(base + '.jpg.tmp', base + '.jpg');
    await writeFile(base + '.json.tmp', js); await rename(base + '.json.tmp', base + '.json');
  } catch (e) { for (const f of ['.jpg.tmp', '.json.tmp', '.json', '.jpg']) await unlink(base + f).catch(() => {}); throw e; }
  list.push({ id: rec.id, t: rec.t, size: img.length + Buffer.byteLength(js) });
  await srPurge();
}
/** Dimensions d'une image JPEG (marqueur SOF), ou null si ce n'en est pas une. */
function jpegSize(b) {
  if (b.length < 128 || b[0] !== 0xff || b[1] !== 0xd8 || b[2] !== 0xff) return null;
  for (let i = 2; i + 9 < b.length;) {
    if (b[i] !== 0xff) return null;
    const mk = b[i + 1];
    if (mk === 0xff) { i++; continue; }                                                    // remplissage
    if (mk === 0x01 || (mk >= 0xd0 && mk <= 0xd8)) { i += 2; continue; }                  // marqueurs sans longueur
    if (mk === 0xd9 || mk === 0xda) return null;                                           // fin, ou données de l'image avant les dimensions
    const len = b.readUInt16BE(i + 2); if (len < 2) return null;
    if (mk >= 0xc0 && mk <= 0xcf && mk !== 0xc4 && mk !== 0xc8 && mk !== 0xcc) { const h = b.readUInt16BE(i + 5), w = b.readUInt16BE(i + 7); return w > 0 && h > 0 ? { w, h } : null; }
    i += 2 + len;
  }
  return null;
}
/** Données de lecture envoyées par l'appli : rien que du JSON simple (5 niveaux, 40 clés et 20 éléments par niveau, textes de 300 caractères sans caractère de contrôle). */
function srClean(v, d = 0) {
  if (typeof v === 'string') return v.replace(/[\p{Cc}\p{Cf}]/gu, ' ').slice(0, 300);
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'boolean' || v === null) return v;
  if (d >= 5 || !v || typeof v !== 'object') return null;
  if (Array.isArray(v)) return v.slice(0, 20).map(x => srClean(x, d + 1));
  const o = {}; let n = 0;
  for (const [k, x] of Object.entries(v)) { if (n >= 40) break; if (k === '__proto__' || !/^[A-Za-z0-9_.-]{1,32}$/.test(k)) continue; o[k] = srClean(x, d + 1); n++; }
  return o;
}
/** Budget d'un compte (SCAN_REPORTS_PER_H par heure) : 0 si permis, sinon secondes à attendre. */
function srLim(k) {
  if (!(SR_RATE > 0)) return 0;
  const now = Date.now(); let b = SR.lim.get(k);
  if (!b) { if (SR.lim.size > 5000) for (const [kk, v] of SR.lim) if (now - v.t > 3600e3) SR.lim.delete(kk); b = { n: SR_RATE, t: now }; SR.lim.set(k, b); }
  b.n = Math.min(SR_RATE, b.n + (now - b.t) * SR_RATE / 3600e3); b.t = now;
  if (b.n >= 1) { b.n--; return 0; }
  return Math.max(1, Math.ceil((1 - b.n) * 3600 / SR_RATE));
}
async function scanReportApi(req, res) {
  if (!SR_ON) return json(res, 404, { error: 'not_found' });
  if (req.method !== 'POST') return json(res, 405, { error: 'method_not_allowed' });
  const w = rateWait(req, 'scanrep', SR_RATE, 3600e3); if (w) return tooMany(res, w);
  let acct = '';
  const tok = String(req.headers['x-firebase-token'] || '');
  if (tok) {      // connecté : empreinte du compte (jamais l'UID) et budget du compte
    if (isLocked(req)) return json(res, 429, { error: 'too_many_attempts', message: 'Trop d\'essais invalides : réessaie dans quelques minutes.' }, { 'Retry-After': '300' });
    try { acct = amTag((await verifyIdToken(tok, true)).uid).slice(0, 16); }
    catch (e) {
      const code = e && e.authCode;
      if (code === 'expired') return json(res, 401, { error: 'token_expired', message: 'Session expirée : le navigateur va la renouveler.' });
      if (code !== 'unavailable') return badKey(req, res, 'bad_token', 401);      // clés Google injoignables : gardé sans empreinte
    }
    const w2 = acct ? srLim(acct) : 0; if (w2) return json(res, 429, { error: 'rate_limited', message: 'Trop de signalements depuis ce compte : réessaie plus tard.', retry: w2 }, { 'Retry-After': String(w2) });
  }
  let b; try { b = JSON.parse((await readBody(req, SR_BODY)).toString('utf8') || '{}'); } catch (e) { return e.status === 413 ? tooLarge(res) : json(res, 400, { error: 'bad_request', message: 'JSON invalide' }); }
  if (!b || typeof b !== 'object' || Array.isArray(b)) return json(res, 400, { error: 'bad_request', message: 'JSON invalide' });
  if (!SR_WHAT.includes(b.what)) return json(res, 400, { error: 'bad_what', message: 'Type de problème inconnu.' });
  if (b.note != null && typeof b.note !== 'string') return json(res, 400, { error: 'bad_note', message: 'Commentaire invalide.' });
  const note = String(b.note || '').replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim();
  if ([...note].length > SR_NOTE) return json(res, 400, { error: 'bad_note', message: 'Commentaire trop long (' + SR_NOTE + ' caractères au plus).' });
  if (!b.meta || typeof b.meta !== 'object' || Array.isArray(b.meta)) return json(res, 400, { error: 'bad_meta', message: 'Données de lecture manquantes.' });
  if (JSON.stringify(b.meta).length > SR_META) return json(res, 413, { error: 'too_large', message: 'Données de lecture trop longues.' });
  const m = typeof b.img === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(b.img) : null;
  if (!m) return json(res, 400, { error: 'bad_image', message: 'Photo JPEG attendue.' });
  const img = Buffer.from(m[1], 'base64');
  if (img.length > SR_IMG) return json(res, 413, { error: 'too_large', message: 'Photo trop lourde (350 Ko au plus).' });
  const dim = jpegSize(img); if (!dim || dim.w > 4096 || dim.h > 4096) return json(res, 400, { error: 'bad_image', message: 'Photo JPEG attendue.' });
  const now = Date.now(), id = now.toString(36) + '-' + randomBytes(4).toString('hex');
  const rec = { v: 1, id, t: now, what: b.what, note, acct, img: { w: dim.w, h: dim.h, bytes: img.length }, meta: srClean(b.meta) };
  try { await srRun(() => srSave(rec, img)); }
  catch (e) { console.warn('Scans signalés : enregistrement impossible (' + (e && e.code || 'erreur') + ')'); return json(res, 503, { error: 'unavailable', message: 'Signalement impossible pour le moment : réessaie plus tard.' }, { 'Retry-After': '60' }); }
  return json(res, 200, { ok: true, id });
}
/** Résumé du panneau : nombre, 7 derniers jours, place prise (Mo) ; null : fonction coupée. Fait la place d'abord (signalements trop vieux). */
async function srSummary() {
  if (!SR_ON) return null;
  try { await srRun(srPurge); const l = SR.list || [], w = Date.now() - 7 * 86400e3; return { n: l.length, n7: l.filter(x => x.t > w).length, mb: Math.round(l.reduce((a, x) => a + x.size, 0) / 104857.6) / 10, max: SR_MAX, days: Math.round(SR_TTL / 86400e3) }; }
  catch (e) { return { n: 0, n7: 0, mb: 0, max: SR_MAX, days: Math.round(SR_TTL / 86400e3), err: true }; }
}
/** /api/admin/scans… (compte de l'éditeur déjà vérifié) : liste par pages (plus récents d'abord), photo, suppression. */
async function srAdmin(req, res, sub, url) {
  if (!SR_ON) return json(res, 404, { error: 'not_found' }, ADM_HD);
  const rest = sub.replace(/^scans\/?/, '');
  if (!rest) {
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, ADM_HD);
    const sum = await srSummary(); if (sum.err) return json(res, 503, { error: 'unavailable', message: 'Dossier des signalements illisible.' }, ADM_HD);
    const all = (SR.list || []).slice().reverse(), pages = Math.max(1, Math.ceil(all.length / SR_PER)), page = Math.min(pages, Math.max(1, Math.floor(Number(url.searchParams.get('page'))) || 1));
    const rows = (await Promise.all(all.slice((page - 1) * SR_PER, page * SR_PER).map(async x => { try { return JSON.parse(await readFile(join(SR_DIR, x.id + '.json'), 'utf8')); } catch (e) { return null; } })))
      .filter(r => r && typeof r.id === 'string' && SR_ID.test(r.id));
    return json(res, 200, { ...sum, total: all.length, page, pages, per: SR_PER, rows }, ADM_HD);
  }
  const m = /^([0-9a-z]{8,10}-[0-9a-f]{8})(\.jpg)?$/.exec(rest);
  if (!m) return json(res, 404, { error: 'not_found' }, ADM_HD);
  if (m[2]) {      // photo : jamais publique, jamais en cache
    if (req.method !== 'GET') return json(res, 405, { error: 'method_not_allowed' }, ADM_HD);
    let buf; try { buf = await readFile(join(SR_DIR, m[1] + '.jpg')); } catch (e) { return json(res, 404, { error: 'not_found' }, ADM_HD); }
    res.writeHead(200, { ...SEC, ...ADM_HD, 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store', 'Content-Length': buf.length, 'Content-Disposition': `inline; filename="scan-${m[1]}.jpg"` });
    return res.end(buf);
  }
  if (req.method !== 'DELETE') return json(res, 405, { error: 'method_not_allowed' }, ADM_HD);
  const done = await srRun(async () => { const l = await srLoad(), i = l.findIndex(x => x.id === m[1]); if (i < 0) return false; l.splice(i, 1); await srDrop(m[1]); return true; }).catch(() => null);
  if (done === null) return json(res, 503, { error: 'unavailable', message: 'Suppression impossible pour le moment.' }, ADM_HD);
  if (!done) return json(res, 404, { error: 'not_found' }, ADM_HD);
  return json(res, 200, { ok: true, ...(await srSummary()) }, ADM_HD);
}

/* ── Carte mystère : le jeu du jour (daily-srv.mjs) ────────────────────────────────────────────────────────────────────────────────────
   Une carte par jour à DAILY_HOUR (18 h) heure de DAILY_TZ (Europe/Paris), la même pour tous ; images des étapes fabriquées ici, score et classements
   vérifiés ici (README › « Carte mystère »). Jeton Firebase de n'importe quel compte pour jouer classé (sans compte : partie pour le plaisir, non classée).
   Stockage : DAILY_DIR (défaut .data/daily). DAILY=0 coupe tout (404, /__ping daily: false : l'appli cache le bouton).
   Notification « nouvelle Carte mystère » (daily-srv.mjs › pushRun) : sendPush et parseTarget ci-dessus, comme les amis ; seulement avec le compte de service
   (FCM_SERVICE_ACCOUNT), DAILY_PUSH=0 la coupe ; DAILY_PUSH_WINDOW_MS : rattrapage après un redémarrage (2 h après l'heure de la carte). */
const DLY_ON = process.env.DAILY !== '0';
let DLY = null;
const DLY_ACCT = new Map();      // UID → { v: { created } | null, at } : date de création du compte Firebase, gardée 12 h
/** Date de création d'un compte (Identity Toolkit, compte de service, comme le panneau /admin) ; sans compte de service ou en panne : null (le jeu prend alors la première fois qu'il a vu ce compte). */
async function dlyAccount(uid) {
  if (!fcmSa) return null;
  const hit = DLY_ACCT.get(uid); if (hit && Date.now() - hit.at < 12 * 3600e3) return hit.v;
  let v = null;
  try { const j = await admFetch(`${IT_BASE}/v1/projects/${fcmSa.project}/accounts:lookup`, IT_SCOPE, { method: 'POST', body: JSON.stringify({ localId: [uid] }) }); const u = j && Array.isArray(j.users) ? j.users[0] : null; if (u) v = { created: Number(u.createdAt) || 0 }; }
  catch (e) { return null; }      // panne : rien de gardé, nouvel essai à la partie suivante
  if (DLY_ACCT.size > 5000) DLY_ACCT.clear();
  DLY_ACCT.set(uid, { v, at: Date.now() }); return v;
}
if (DLY_ON) {
  try {
    const { dailyMake } = await import('./daily-srv.mjs');
    let PG = null; try { PG = createRequire(import.meta.url)('./src/progress.js'); } catch (e) { /* courbe de daily-srv.mjs */ }
    const scryHost = SCRY_UP === 'https://api.scryfall.com' ? [] : [new URL(SCRY_UP).origin + '/'];      // tests : images du faux Scryfall
    DLY = dailyMake({ dir: process.env.DAILY_DIR || join(EDH_DIR, 'daily'), scry: SCRY_UP, imgHosts: ['https://cards.scryfall.io/', ...scryHost],
      hour: Math.max(0, Math.min(23, Math.floor(Number(process.env.DAILY_HOUR ?? 18)))) || (Number.isFinite(Number(process.env.DAILY_HOUR)) ? 0 : 18), tz: String(process.env.DAILY_TZ || 'Europe/Paris').trim(), secret: String(process.env.DAILY_SECRET || '').trim(),
      firstMs: process.env.DAILY_FIRST_MS === undefined ? 3000 : Number(process.env.DAILY_FIRST_MS), gapMs: process.env.DAILY_GAP_MS === undefined ? 110 : Number(process.env.DAILY_GAP_MS),
      verify: tok => verifyIdToken(tok, true), bad: v => !!(NM_CORE && NM_CORE.pubBad && NM_CORE.pubBad(v)), json, readBody, rateWait, tooMany, tooLarge, isLocked, badKey, adminHeaders: ADM_HD,
      levelOf: PG && PG.prgLevel ? xp => PG.prgLevel(xp).lv : null, levelsFile: process.env.LEVELS_FILE || join(EDH_DIR, 'levels.json'), reportHide: Number(process.env.DAILY_REPORT_HIDE) >= 1 ? Math.floor(Number(process.env.DAILY_REPORT_HIDE)) : 3, stepMs: Number(process.env.DAILY_STEP_MS) > 0 ? Number(process.env.DAILY_STEP_MS) : undefined,
      levelDayCap: Number.isFinite(Number(process.env.LEVEL_DAY_CAP)) && process.env.LEVEL_DAY_CAP !== '' && process.env.LEVEL_DAY_CAP !== undefined ? Math.max(0, Number(process.env.LEVEL_DAY_CAP)) : 20000,
      push: FCM_ON && process.env.DAILY_PUSH !== '0' ? { send: sendPush, target: parseTarget } : null,      // notification « nouvelle Carte mystère » (rien sans compte de service, comme les amis)
      pushWindowMs: process.env.DAILY_PUSH_WINDOW_MS !== undefined && process.env.DAILY_PUSH_WINDOW_MS !== '' && Number.isFinite(Number(process.env.DAILY_PUSH_WINDOW_MS)) ? Math.max(0, Number(process.env.DAILY_PUSH_WINDOW_MS)) : undefined,
      account: dlyAccount, net: req => netOf(ipOf(req)), minAgeDays: process.env.DAILY_MIN_AGE_DAYS === undefined || process.env.DAILY_MIN_AGE_DAYS === '' || !Number.isFinite(Number(process.env.DAILY_MIN_AGE_DAYS)) ? 0 : Math.max(0, Number(process.env.DAILY_MIN_AGE_DAYS)) });      // net : empreinte du réseau (HMAC salé du jour, dans daily-srv.mjs)
  } catch (e) { console.warn('Carte mystère : module illisible (' + (e && e.message || e) + '), jeu coupé'); DLY = null; }
}

async function api(req, res, url) {
  const path = url.pathname.replace(/^\/api\//, '').replace(/\/+$/, '');
  // Serveur local sans compte : un POST d'une autre page (formulaire, text/plain : pas de pré-vérification CORS) ne doit rien déclencher.
  if (LOCAL && req.method === 'POST' && !/^application\/json\b/i.test(String(req.headers['content-type'] || ''))) return json(res, 415, { error: 'bad_content_type', message: 'Content-Type: application/json attendu.' });
  // Ouvert à tous : import d'une liste depuis un lien, alertes de prix (Scryfall + push). Ni l'un ni l'autre n'utilise de token CardTrader.
  if (path === 'import') return importApi(req, res, url);
  if (path === 'names/find') return namesApi(req, res, url);      // scan : noms imprimés des autres langues (catalogues publics)
  if (path === 'pubdecks') return pubApi(req, res, url);      // decks publics (« Communauté ») : liste ouverte à tous, sans token
  if (path === 'alerts' || path.startsWith('alerts/')) return alertsApi(req, res, path, url);
  if (path === 'testeurs') return testersApi(req, res);      // inscription au test fermé (page /testeurs), ouverte à tous, bornée
  if (path === 'scan-report') return scanReportApi(req, res);      // « Signaler un problème de scan » : photo et lecture envoyées par l'utilisateur, sans compte exigé, bornées
  if (path === 'friends' || path.startsWith('friends/')) return friendsApi(req, res, path, url);      // amis : jeton Firebase de n'importe quel compte, pas le token CardTrader
  if (path === 'troc' || path.startsWith('troc/')) return trocApi(req, res, path, url);      // échange en direct : jeton Firebase (création, entrée), puis clé de siège
  if (path === 'partie' || path.startsWith('partie/')) return partieApi(req, res, path, url);      // partie de Commander : salle d'attente (jeton Firebase, ou invité sans compte), résultats des comptes
  if (path === 'admin' || path.startsWith('admin/')) return adminApi(req, res, path, url);      // panneau d'administration : compte de l'éditeur seulement
  if (path === 'daily' || path.startsWith('daily/')) return DLY ? DLY.api(req, res, path, url) : json(res, 404, { error: 'not_found' });
  if (path === 'level' || path.startsWith('level/')) return DLY ? DLY.level(req, res, path, url) : json(res, 404, { error: 'not_found' });      // classement des niveaux de compte : XP envoyée par l'appli, plafonnée par jour      // Carte mystère : jeton Firebase (classé) ou sans compte (pour le plaisir), clé de partie ensuite
  // CardTrader : avec le token de l'utilisateur (X-CT-Token), ou celui du serveur pour les comptes autorisés (ALLOWED_UIDS / APP_KEY).
  const ut = userTok(req);
  if (!ut && !(await authorize(req, res))) return;
  const tok = ut || TOKEN, th = ut ? tokHash(ut) : '';
  if (!tok) return json(res, 401, { error: 'no_token', message: 'Token CardTrader requis : ajoute le tien dans les réglages.' });
  if (path === 'jobs' || path.startsWith('jobs/')) return jobsApi(req, res, path, url, tok, th);
  const allowed = ALLOW[req.method];
  if (!allowed) return json(res, 405, { error: 'method_not_allowed' });
  if (!allowed.has(path)) return json(res, 403, { error: 'blocked', message: 'Route non autorisée par le proxy : ' + path });
  if (th) { const wait = rateWait(req, 'ct', 2 * USER_RATE, 120e3); if (wait) return tooMany(res, wait); }      // token d'un utilisateur : relais plafonnés par IP (USER_RATE par minute, rafale de 2 min)

  const target = UPSTREAM + path + url.search;
  const cacheable = req.method === 'GET' && (path === 'expansions' || path === 'blueprints/export');
  if (cacheable && tokOk(th)) {
    const hit = cache.get(target);
    if (hit && Date.now() - hit.t < CACHE_TTL) {
      res.writeHead(200, { ...SEC, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'x-cache': 'HIT' });
      return res.end(hit.body);
    }
  }

  const init = { method: req.method, headers: { Authorization: 'Bearer ' + tok, Accept: 'application/json' } };
  if (req.method === 'POST') {
    init.body = await readBody(req);
    init.headers['Content-Type'] = 'application/json';
  }
  if (upQueue.length >= UP_QUEUE_MAX) return json(res, 503, { error: 'busy', message: 'Trop de requêtes en attente.' }, { 'Retry-After': '2' });
  if (path === 'marketplace/products') await pace(tok); // même budget que les tâches de fond
  await upGate();
  init.signal = AbortSignal.timeout(30000); // armé après l'attente en file, pas avant
  let up, body;
  try {
    try { up = await fetch(target, init); body = Buffer.from(await up.arrayBuffer()); }
    catch (e) { return json(res, 502, { error: 'upstream_unreachable', message: String(e && e.message || e) }); }
  } finally { upDone(); }
  const headers = { ...SEC, 'Content-Type': up.headers.get('content-type') || 'application/json', 'Cache-Control': 'no-store' };
  const ra = up.headers.get('retry-after'); if (ra) headers['Retry-After'] = ra;
  if (up.ok) tokSeen(th);
  if (cacheable && up.ok) cacheSet(target, body);
  res.writeHead(up.status, headers);
  res.end(body);
}

/* ── Fichiers servis : lus et compressés une seule fois (gzip + brotli, hors du fil principal), ETag → 304 ──────────────────────
   Relus seulement si la date de modification change (un « git pull » de déploiement est pris en compte sans redémarrage).
   Brotli (≈ 20 % plus léger que gzip) n'est servi qu'une fois prêt : en attendant, gzip. */
const FILES = new Map();
const sha1Of = (() => { const memo = new WeakMap(); return buf => { let h = memo.get(buf); if (!h) { h = createHash('sha1').update(buf).digest('hex').slice(0, 20); memo.set(buf, h); } return h; }; })();
const notModified = (req, etag) => String(req.headers['if-none-match'] || '').split(',').some(t => t.trim().replace(/^W\//, '') === etag);
async function fileEntry(f, compress) {
  const mt = (await stat(f)).mtimeMs, cur = FILES.get(f);
  if (cur && cur.mt === mt) return cur;
  const raw = await readFile(f), e = { mt, raw, tag: sha1Of(raw), gz: null, br: null, gzP: null };
  if (compress) {
    e.gzP = gzipA(raw, { level: 9 }).then(b => (e.gz = b), () => null);
    brotliA(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 11, [zc.BROTLI_PARAM_SIZE_HINT]: raw.length, [zc.BROTLI_PARAM_MODE]: zc.BROTLI_MODE_TEXT } }).then(b => { e.br = b; }, () => {});
  }
  FILES.set(f, e); return e;
}
/** Version de la page servie (DD_BUILD de deck-deal.html), relue quand le fichier change : /__ping la donne à l'appli, qui se met à jour d'elle-même (pwa.js). */
async function pageBuild() {
  if (!PAGE) return '';
  try { const e = await fileEntry(PAGE, true); if (e.build === undefined) { const m = /const DD_BUILD = '([\w-]+)'/.exec(e.raw.toString('utf8')); e.build = m ? m[1] : ''; } return e.build; } catch (err) { return ''; }
}
async function sendFile(req, res, f, headers, compress) {
  const e = await fileEntry(f, compress), hd = { ...SEC, ...headers };
  const ae = String(req.headers['accept-encoding'] || ''), wantBr = compress && /\bbr\b/i.test(ae), wantGz = compress && /\bgzip\b/i.test(ae);
  if (wantGz && !e.gz && !(wantBr && e.br)) await e.gzP;
  const enc = wantBr && e.br ? 'br' : wantGz && e.gz ? 'gzip' : '', data = enc === 'br' ? e.br : enc ? e.gz : e.raw;
  if (compress) hd.Vary = 'Accept-Encoding';
  hd.ETag = '"' + e.tag + (enc ? '-' + enc : '') + '"';
  if (notModified(req, hd.ETag)) { delete hd['Content-Type']; res.writeHead(304, hd); return res.end(); }
  if (enc) hd['Content-Encoding'] = enc;
  hd['Content-Length'] = data.length; res.writeHead(200, hd);
  res.end(req.method === 'HEAD' ? undefined : data);
}
/** Prépare la page et les gros fichiers dès le démarrage : le premier visiteur n'attend pas la compression. */
function warmFiles() {
  if (PAGE) fileEntry(PAGE, true).catch(() => {});
  for (const st of STATIC.values()) if (st[3] === true) fileEntry(join(PWA, st[0]), true).catch(() => {});      // 'lazy' (catalogues des autres langues) : à la première demande
}

/* ── Ancienne adresse (OLD_HOSTS) : déménagement vers SITE_URL ─────────────────────────────────────────────────────────────── */
const txt = (res, body, type = 'text/plain; charset=utf-8', hd = {}) => { res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', ...hd }); res.end(body); return true; };
/** Ancienne APK (WebView Android) : son appli reste servie ici tant qu'elle n'est pas mise à jour (aller ailleurs l'ouvrirait dans Chrome). */
const isWebView = req => /;\s*wv\)/.test(String(req.headers['user-agent'] || ''));
// sw.js de l'ancienne adresse : vide les caches, se désinstalle et recharge les onglets, qui reçoivent alors la page de déménagement.
const OLD_SW = `self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => { for (const k of await caches.keys()) await caches.delete(k); await self.registration.unregister(); for (const c of await self.clients.matchAll({ type: 'window' })) c.navigate(c.url); })()));
`;
/** Page de déménagement : les données de Mana Orbit gardées par le navigateur sur l'ancienne adresse (localStorage « deckdeal:* », sauf ce qui tient à l'appareil)
 *  partent dans l'adresse de la nouvelle page (#mig=, jamais envoyé au serveur), qui les reprend sans rien écraser (src/migrate.js) ; ?p=… et le chemin suivent. */
function oldPage(app) {      // app : aller-retour de l'appli Android (?mig=app), sans texte à l'écran (un instant, sur le fond de l'appli)
  const site = JSON.stringify(SITE_URL).replace(/</g, '\\u003c');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="origin"><title>Mana Orbit déménage</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;padding:16px;box-sizing:border-box;background:#0b0f1c;color:#eaeefb;font:16px/1.5 system-ui,sans-serif;text-align:center}a{color:#929cff}.app p{visibility:hidden}</style></head>
<body${app ? ' class="app"' : ''}><p>Mana Orbit déménage sur <a id="go" href=${site}>manaorbit.app</a>…<br><small>Mana Orbit is moving to manaorbit.app…</small></p>
<script>(function () {
  var q = new URLSearchParams(location.search); q.delete('mig');
  var to = ${site} + location.pathname + (q.toString() ? '?' + q : ''), data = '';
  try {
    var skip = /^deckdeal:(fcm|pending|scry-until|cam2?|scpref|install-x|migtry|migrated)$/, o = {}, n = 0;
    for (var i = 0; i < localStorage.length; i++) { var k = localStorage.key(i); if (k && k.indexOf('deckdeal:') === 0 && !skip.test(k)) { o[k] = localStorage.getItem(k); n++; } }
    var enc = function (x) { var b = new TextEncoder().encode(JSON.stringify(x)), s = ''; for (var j = 0; j < b.length; j += 32768) s += String.fromCharCode.apply(null, b.subarray(j, j + 32768)); return btoa(s).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, ''); };
    if (n) {
      data = enc(o);
      var keep = /^deckdeal:(coll:v1|decks:v1|trade:v1)$/;      // trop long pour une adresse (≈ 1,5 Mo) : les plus gros caches restent derrière, jamais la collection, les decks ni l'échange
      while (data.length > 1500000) { var big = '', bl = 0; for (var k2 in o) if (!keep.test(k2) && o[k2].length > bl) { big = k2; bl = o[k2].length; } if (!big) break; delete o[big]; data = enc(o); }
    }
  } catch (e) { data = ''; }
  document.getElementById('go').href = to;
  location.replace(to + (data ? '#mig=' + data : ''));
})();</script></body></html>`;
}
/** Lien de test (/test) : deck-deal.html avec <base href="/"> (adresses relatives lues à la racine : api/, sw.js, catalogues) et window.MO_TEST (nouveautés à essayer :
 *  niveau et badges, Carte mystère) ; relu quand le fichier change. TEST_PAGE=0 : coupé (404). */
const TEST_ON = process.env.TEST_PAGE !== '0', TESTP = { mt: 0, html: '' };
async function testPage() {
  let mt = 0; try { mt = (await stat(PAGE)).mtimeMs; } catch (e) { /* fichier absent : dernière version lue */ }
  if (TESTP.html && TESTP.mt === mt) return TESTP.html;
  const html = await readFile(PAGE, 'utf8');
  TESTP.html = html.replace('<head>', '<head>\n<base href="/"><meta name="robots" content="noindex, nofollow"><script>window.MO_TEST = true;</script>'); TESTP.mt = mt;
  return TESTP.html;
}
/** Requête reçue sur une ancienne adresse : true si elle a été servie ici (déménagement), false : traitement habituel. */
function oldHost(req, res, url) {
  const get = req.method === 'GET' || req.method === 'HEAD', wv = isWebView(req);
  if (get && url.pathname === '/__mig') return txt(res, '{"ok":true}', 'application/json; charset=utf-8', { 'Access-Control-Allow-Origin': SITE_URL });      // le nouveau site vérifie que l'ancienne adresse répond avant d'y envoyer l'APK
  if (get && url.pathname === '/sw.js' && !wv) return txt(res, OLD_SW, 'text/javascript; charset=utf-8');
  if (get && (url.pathname === '/' || url.pathname === '/index.html') && (!wv || url.searchParams.get('mig') === 'app')) return txt(res, oldPage(url.searchParams.get('mig') === 'app'), 'text/html; charset=utf-8', { 'Content-Security-Policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'" });
  return false;
}

/** /.well-known/assetlinks.json (Digital Asset Links, lu par Android pour vérifier les App Links) : Content-Type exactement application/json, réponse directe
 *  (aucune redirection, aucun cookie ni compte exigé), GET ou HEAD ; 404 sans ASSETLINKS_SHA256 valide. */
function assetLinks(req, res) {
  if (!ASSETLINKS || (req.method !== 'GET' && req.method !== 'HEAD')) return json(res, 404, { error: 'not_found' });
  res.writeHead(200, { ...SEC, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600', 'Content-Length': Buffer.byteLength(ASSETLINKS) });
  res.end(req.method === 'HEAD' ? undefined : ASSETLINKS);
}

/** Connexion Google sur le web avec manaorbit.app comme domaine d'authentification (authDomain de src/cloud.js) : la fenêtre Google dit « continuer vers
 *  manaorbit.app » au lieu de m2s-mtg.firebaseapp.com, et l'iframe du SDK est sur le site de la page (stockage tiers bloqué : Safari, Chrome). Méthode « proxy »
 *  de Firebase : /__/auth/* et /__/firebase/init.json relayés tels quels vers <projet>.firebaseapp.com (GET et HEAD ; ni cookie ni compte lu ou gardé ici ;
 *  sans X-Frame-Options : /__/auth/iframe est chargée dans la page). FB_AUTH=0 : coupé (404). FB_AUTH_UPSTREAM : autre origine (tests). */
const FB_AUTH_ON = process.env.FB_AUTH !== '0';
const FB_AUTH_UP = (process.env.FB_AUTH_UPSTREAM || `https://${FB_PROJECT}.firebaseapp.com`).replace(/\/+$/, '');
const FB_AUTH_PATH = /^\/__\/(auth\/[\w.-]+|firebase\/init\.json)$/;
const FB_AUTH_KEEP = ['content-type', 'cache-control', 'expires', 'etag', 'last-modified', 'location', 'content-security-policy', 'cross-origin-opener-policy'];
const FB_AUTH_MAX = 4 << 20;      // 4 Mo : les pages et scripts de Firebase en font quelques centaines de Ko
async function fbAuthRelay(req, res, url) {
  if (!FB_AUTH_ON) return json(res, 404, { error: 'not_found' });
  if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
  const hd = { accept: String(req.headers.accept || '*/*') };
  for (const k of ['accept-language', 'user-agent', 'if-none-match', 'if-modified-since']) if (req.headers[k]) hd[k] = String(req.headers[k]);
  let r, body;
  try {
    r = await fetch(FB_AUTH_UP + url.pathname + url.search, { method: req.method, headers: hd, redirect: 'manual', signal: AbortSignal.timeout(10e3) });
    body = req.method === 'HEAD' ? Buffer.alloc(0) : Buffer.from(await r.arrayBuffer());
  } catch (e) { return json(res, 502, { error: 'auth_upstream' }); }
  if (body.length > FB_AUTH_MAX) return json(res, 502, { error: 'auth_upstream' });
  const out = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
  for (const k of FB_AUTH_KEEP) { const v = r.headers.get(k); if (v) out[k] = v; }
  if (body.length > 1024 && /\bgzip\b/i.test(String(req.headers['accept-encoding'] || '')) && /text|javascript|json/.test(out['content-type'] || '')) {
    body = await gzipA(body); out['Content-Encoding'] = 'gzip'; out.Vary = 'Accept-Encoding';
  }
  if (req.method !== 'HEAD') out['Content-Length'] = body.length;
  res.writeHead(r.status, out);
  res.end(req.method === 'HEAD' ? undefined : body);
}

const server = http.createServer(async (req, res) => {
  try {
    if (LOCAL && !LOCAL_HOSTS.test(String(req.headers.host || ''))) return json(res, 403, { error: 'bad_host', message: 'Serveur local : ouvre-le par http://localhost.' });
    // Servi en https par le reverse proxy de l'hébergeur : le navigateur s'en souvient 180 jours (jamais en http, où l'en-tête n'aurait pas de sens).
    if (String(req.headers['x-forwarded-proto'] || '').split(',').pop().trim().toLowerCase() === 'https') res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    const url = new URL(String(req.url).replace(/^\/+/, '/'), 'http://x'); // « // » ou « //hôte/chemin » ne doivent pas être lus comme une URL absolue
    if (OLD_HOSTS.length && OLD_HOSTS.includes(String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase()) && oldHost(req, res, url)) return;
    if (url.pathname === '/app-ads.txt') return ADMOB_PUB ? txt(res, 'google.com, ' + ADMOB_PUB + ', DIRECT, f08c47fec0942fa0\n') : json(res, 404, { error: 'not_found' });
    if (url.pathname === '/.well-known/assetlinks.json') return assetLinks(req, res);      // App Links de l'appli Android
    if (FB_AUTH_PATH.test(url.pathname)) return await fbAuthRelay(req, res, url);      // fenêtre de connexion Google (domaine d'authentification manaorbit.app)
    if (url.pathname === '/__me') return json(res, 200, { server: await serverOk(req) });
    if (url.pathname === '/__prices') return json(res, 200, { source: PX_SRC ? 'GitHub' : '', ...PX_ST });
    if (url.pathname === '/__ping') return json(res, 200, { ok: true, app: 'deckdeal', userToken: true, prices: !!PX_LIVE, needsKey: !!APP_KEY, needsLogin: AUTH_FB, hasToken: !!TOKEN, jobs: JOBS_ON, alerts: ALERTS_ON, push: PUSH_ON ? VAPID_PUB : '', adUnit: ADMOB_BANNER, fcm: FCM_ON, pub: PUB_ON, amis: AM_ON, troc: TROC_ON, partie: PT_ON, scanrep: SR_ON, daily: !!DLY, off: OFF, apk: APK_LATEST, build: await pageBuild() });
    if (url.pathname === '/__edh') return json(res, 200, { source: EDH_SRC ? 'GitHub' : '', ...EDH_ST });
    if (url.pathname.startsWith('/api/')) return await api(req, res, url);
    if (ADM_FILES.has(url.pathname)) {      // panneau d'administration : page sans données, jamais en cache ni indexée, CSP stricte
      if (!ADMIN_ON || (req.method !== 'GET' && req.method !== 'HEAD')) return json(res, 404, { error: 'not_found' });
      const [f, type] = ADM_FILES.get(url.pathname); if (!existsSync(join(PWA, f))) return json(res, 404, { error: 'asset_missing' });
      return await sendFile(req, res, join(PWA, f), { 'Content-Type': type, 'Cache-Control': 'no-store', 'Content-Security-Policy': ADM_CSP, ...ADM_HD, 'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()' }, false);
    }
    if ((url.pathname === '/test' || url.pathname === '/test/') && TEST_ON) {      // lien de test : la même page, nouveautés visibles (window.MO_TEST), jamais indexée
      if (!PAGE) return json(res, 404, { error: 'page_missing', message: 'Place deck-deal.html à côté de proxy.mjs.' });
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
      return txt(res, await testPage(), 'text/html; charset=utf-8', { 'X-Robots-Tag': 'noindex, nofollow', 'Referrer-Policy': 'same-origin' });
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (!PAGE) return json(res, 404, { error: 'page_missing', message: 'Place deck-deal.html à côté de proxy.mjs.' });
      return await sendFile(req, res, PAGE, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' }, true);
    }
    const st = (req.method === 'GET' || req.method === 'HEAD') && STATIC.get(url.pathname);
    if (st && st[0].startsWith('edh.') && (OFF.includes('edhrec') || (OFF.includes('archidekt') && (st[0] !== 'edh.bin.gz' || !EDHB || !EDHB.edhFilter)))) return json(res, 410, { error: 'off', message: 'Données EDHREC coupées sur ce serveur.' });      // Archidekt coupé : seul le binaire filtré est servi
    if (st) {
      const src = st[4] === 'px' ? PX_LIVE : EDH_LIVE, f = join(PWA, st[0]), live = st[3] === 'pre' && src;
      if (!live && !existsSync(f)) return json(res, 404, { error: 'asset_missing', message: 'Dossier pwa/ absent à côté de proxy.mjs.' });
      const hd = { 'Content-Type': st[1], 'Cache-Control': st[2] };
      if (st[3] !== 'pre') return await sendFile(req, res, f, hd, !!st[3]);
      let data = live ? src.buf : await readFile(f); Object.assign(hd, SEC);
      if (st[0] === 'edh.bin.gz' && OFF.includes('archidekt')) data = edhNoArchidekt(data);
      hd.Vary = 'Accept-Encoding';
      const gz = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || ''));
      hd.ETag = '"' + sha1Of(data) + (gz ? '' : '-i') + '"';       // le navigateur revalide (304) au lieu de retélécharger
      if (notModified(req, hd.ETag)) { delete hd['Content-Type']; res.writeHead(304, hd); return res.end(); }
      if (gz) hd['Content-Encoding'] = 'gzip'; else { try { data = gunzipSync(data); } catch (e) { /* pas du gzip : tel quel */ } }
      hd['Content-Length'] = data.length; res.writeHead(200, hd);
      return res.end(req.method === 'HEAD' ? undefined : data);
    }
    json(res, 404, { error: 'not_found' });
  } catch (e) {
    const st = e && e.status || 500;                                    // 500 : détail (chemins, erreurs système) dans le journal seulement
    if (st >= 500) console.error('Erreur ' + req.method + ' ' + String(req.url).split('?')[0].slice(0, 200) + ' :', e);
    if (res.headersSent) res.end();
    else if (st === 413) tooLarge(res);
    else json(res, st, { error: 'proxy_error', message: st >= 500 ? 'Erreur interne du serveur.' : String(e && e.message || e) });
  }
});

// Ne jamais laisser une erreur isolée faire tomber le site (l'hébergeur ne relance pas toujours le process).
process.on('unhandledRejection', e => console.error('unhandledRejection:', e));
process.on('uncaughtException', e => console.error('uncaughtException:', e));

if (ALERTS_ON) await alLoad();                                  // abonnements et relevés avant d'accepter la première requête
server.listen(PORT, HOST, () => {
  warmFiles();
  console.log(`Mana Orbit → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(TOKEN ? 'Token CardTrader : OK' : '⚠ CARDTRADER_TOKEN manquant : mode démo uniquement');
  if (AUTH_FB) console.log(`Accès : compte Firebase « ${FB_PROJECT} » (${ALLOWED_UIDS.size} UID, ${ALLOWED_EMAILS.size} email${ALLOWED_EMAILS.size > 1 ? 's' : ''} vérifié${ALLOWED_EMAILS.size > 1 ? 's' : ''}).`);
  if (APP_KEY) console.log(AUTH_FB ? 'APP_KEY encore acceptée en secours : supprime-la une fois la connexion par compte validée.' : 'Clé d\'accès requise (APP_KEY) — à saisir dans Réglages.');
  if (APP_KEY && APP_KEY.length < 12) console.warn('⚠ APP_KEY courte (' + APP_KEY.length + ' caractères) : prends 16 caractères ou plus.');
  if (!PAGE) console.log('⚠ deck-deal.html introuvable à côté du proxy.');
  if (ADMOB_RAW && !ADMOB_BANNER) console.warn('⚠ ADMOB_BANNER_ID ignoré : attendu « ca-app-pub-…/… » (identifiant du bloc d\'annonces, pas celui de l\'appli).');
  { const bad = ASSETLINKS_RAW.filter(x => !/^[0-9A-F]{64}$/i.test(x.replace(/:/g, ''))).length;
    if (ASSETLINKS) console.log(`App Links Android : /.well-known/assetlinks.json, ${ASSETLINKS_FP.length} empreinte${ASSETLINKS_FP.length > 1 ? 's' : ''} SHA-256.`);
    if (bad) console.warn(`⚠ ASSETLINKS_SHA256 : ${bad} empreinte${bad > 1 ? 's' : ''} ignorée${bad > 1 ? 's' : ''} (attendu 32 octets en hexadécimal, « AB:CD:… », séparés par des virgules).`); }
  if (FCM_ON) console.log(`Notifications de l'appli Android (FCM) : projet Firebase « ${fcmSa.project} ».`);
  if (AM_ON) { console.log(`Amis : ${AM_MAX} au plus par compte, « un ami a une carte que tu cherches » toutes les ${Math.round(AM_GAP / 360000) / 10} h au plus.`); }
  if (TROC_ON) console.log(`Échange en direct : ${TROC_MAX} sessions au plus, en mémoire (terminées après ${Math.round(TROC_IDLE / 60e3)} min sans activité).`);
  if (PT_ON) console.log(`Partie de Commander : ${PT_MAX} salles d'attente au plus, en mémoire ; historiques des comptes dans Firestore (parties).`);
  if (SR_ON) {      // scans signalés : trop vieux ou au-delà des plafonds, effacés au démarrage puis toutes les 6 h
    const purge = () => srRun(srPurge).then(n => { if (n) console.log(`Scans signalés : ${n} effacé${n > 1 ? 's' : ''} (durée ou place).`); }, e => console.warn('Scans signalés : dossier illisible (' + (e && e.code || 'erreur') + ')'));
    setTimeout(purge, 20e3).unref(); setInterval(purge, 6 * 3600e3).unref();
    console.log(`Scans signalés : ${SR_MAX} au plus, ${Math.round(SR_BYTES / 1048576)} Mo, gardés ${Math.round(SR_TTL / 86400e3)} jours.`);
  }
  if (DLY) { DLY.start(); console.log(`Carte mystère : nouvelle carte chaque jour à ${DLY.clock.hour} h (${DLY.clock.tz})${DLY.pushOn ? ', annoncée par une notification aux appareils qui l\'acceptent' : ''}.`); }
  if (ADMIN_ON) console.log(`Administration : /admin, ${ADMIN_SET.size} adresse${ADMIN_SET.size > 1 ? 's' : ''} autorisée${ADMIN_SET.size > 1 ? 's' : ''}${String(process.env.ADMIN_EMAILS || '').trim() ? ' (ADMIN_EMAILS)' : ''}.`);      // jamais les adresses elles-mêmes
  if (ADMIN_ON && FCM_ON && ADM_EVERY > 0) setInterval(() => { admTick().catch(() => {}); }, Math.max(1000, ADM_EVERY)).unref();      // comptes actifs du jour (courbe du panneau) : premier relevé après un intervalle, jamais au démarrage
  if (PUB_ON) console.log(`Decks publics : lus dans Firestore au plus toutes les ${Math.round(PUB_TTL / 60e3)} min, retirés après ${PUB_REPORTS} signalement${PUB_REPORTS > 1 ? 's' : ''}${PUB_HIDE.size ? ', ' + PUB_HIDE.size + ' masqué' + (PUB_HIDE.size > 1 ? 's' : '') + ' (PUBDECKS_HIDE)' : ''}.`);
  if (ALERTS_ON) {
    const wait = Math.max(AL_FIRST, (AL.last.at || 0) + AL_EVERY - Date.now());
    setTimeout(() => { alTick(); setInterval(alTick, AL_EVERY).unref(); }, wait).unref();
    console.log(`Alertes de prix : ${AL.subs.size} appareil${AL.subs.size > 1 ? 's' : ''}, contrôle toutes les ${Math.round(AL_EVERY / 360000) / 10} h.`);
  }
  if (PX_SRC) pxBoot().then(() => { setTimeout(pxSync, EDH_FIRST + 2000).unref(); setInterval(pxSync, EDH_EVERY).unref(); });
  else pxBoot();
  if (EDH_SRC) edhBoot().catch(() => {}).then(() => { setTimeout(edhSync, EDH_FIRST).unref(); setInterval(edhSync, EDH_EVERY).unref(); });
});
