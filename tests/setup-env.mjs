// Importé en premier par chaque test : le proxy lancé par les tests lit un dossier pwa/ temporaire (manifeste, sw.js, icônes)
// SANS les fichiers générés par GitHub Actions (fr-names.tsv, edh.bin.gz) : les tests les créent eux-mêmes et ne touchent jamais au vrai pwa/.
// Le dossier courant devient la racine du dépôt (les tests lancent « node server/proxy.mjs » et lisent deck-deal.html).
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
process.chdir(root);
if (process.env.PRICES_SOURCE_URL === undefined) process.env.PRICES_SOURCE_URL = '';      // le proxy des tests ne va jamais chercher les prix sur GitHub
if (!process.env.EDH_DATA_DIR) {      // copies du serveur (prices.tsv.gz, edh.bin.gz, boot.json) : dossier temporaire ; un .data/ laissé par un « node server/proxy.mjs » lancé à la main changeait les prix des tests
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-data-')); process.env.EDH_DATA_DIR = d;
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
if (!process.env.SCAN_REPORTS_DIR) {      // scans signalés (proxy.mjs) : dossier temporaire, jamais le vrai .data/ du dépôt
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-scanrep-')); process.env.SCAN_REPORTS_DIR = join(d, 'scan-reports');
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
// Carte mystère (daily-srv.mjs) : coupée par défaut sous les tests (le proxy tirerait sinon la carte du jour chez le vrai Scryfall), dossier temporaire ;
// test-daily.mjs et daily-e2e.mjs l'allument (DAILY=1) avec leur faux Scryfall (daily-fakes.mjs). Classement des niveaux (LEVELS_FILE) : même dossier temporaire.
if (process.env.DAILY === undefined) process.env.DAILY = '0';
// Sorties d'extensions dans #spoilers (discord-sets.mjs) : coupées par défaut (le proxy d'un test avec bot lirait sinon le vrai Scryfall /sets) ; test-discord-sets.mjs les allume
if (process.env.DISCORD_SETS === undefined) process.env.DISCORD_SETS = '0';
// Annonces des événements dans #annonces (discord-events.mjs) : coupées par défaut (un faux Discord avec #annonces recevrait sinon l'annonce du jour) ; test-discord-events.mjs les allume
if (process.env.DISCORD_EVENTS === undefined) process.env.DISCORD_EVENTS = '0';
// Notifications push des événements (event-push.mjs) : coupées par défaut (un proxy avec faux compte de service enverrait sinon l'annonce du jour) ; test-event-push.mjs et evpush-e2e.mjs les allument
if (process.env.EVENT_PUSH === undefined) process.env.EVENT_PUSH = '0';
if (!process.env.DAILY_DIR) {
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-daily-')); process.env.DAILY_DIR = join(d, 'daily');
  if (!process.env.LEVELS_FILE) process.env.LEVELS_FILE = join(d, 'levels.json');      // classement des niveaux : jamais le vrai .data/levels.json
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
// Événements saisonniers (event-srv.mjs) : coupés par défaut sous les tests (sinon la chasse d'Halloween s'ouvre selon la date du jour), dossier temporaire ;
// test-event.mjs et event-e2e.mjs les allument (EVENT_FORCE=halloween-2026).
if (process.env.EVENT === undefined && process.env.EVENT_FORCE === undefined) process.env.EVENT = '0';
if (!process.env.EVENT_DIR) {
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-event-')); process.env.EVENT_DIR = join(d, 'events');
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
if (!process.env.ADMIN_DIR) {      // panneau d'administration (journal des actions, comptes actifs par jour) : dossier temporaire, jamais le vrai .data/admin
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-admin-')); process.env.ADMIN_DIR = join(d, 'admin');
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
if (!process.env.PWA_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'deckdeal-pwa-'));
  for (const f of ['manifest.webmanifest', 'sw.js', 'privacy.html', 'legal.html', 'passer-de-manabox.html', 'robots.txt', 'sitemap.xml', 'admin.html', 'admin.js', 'admin.css', 'icons']) cpSync(join(root, 'pwa', f), join(dir, f), { recursive: true });
  process.env.PWA_DIR = dir;
  process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
