// Importé en premier par chaque test : le proxy lancé par les tests lit un dossier pwa/ temporaire (manifeste, sw.js, icônes)
// SANS les fichiers générés par GitHub Actions (fr-names.tsv, edh.bin.gz) : les tests les créent eux-mêmes et ne touchent jamais au vrai pwa/.
// Le dossier courant devient la racine du dépôt (les tests lancent « node proxy.mjs » et lisent deck-deal.html).
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = new URL('../', import.meta.url).pathname;
process.chdir(root);
if (process.env.PRICES_SOURCE_URL === undefined) process.env.PRICES_SOURCE_URL = '';      // le proxy des tests ne va jamais chercher les prix sur GitHub
if (!process.env.SCAN_REPORTS_DIR) {      // scans signalés (proxy.mjs) : dossier temporaire, jamais le vrai .data/ du dépôt
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-scanrep-')); process.env.SCAN_REPORTS_DIR = join(d, 'scan-reports');
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
// Carte mystère (daily-srv.mjs) : coupée par défaut sous les tests (le proxy tirerait sinon la carte du jour chez le vrai Scryfall), dossier temporaire ;
// test-daily.mjs et daily-e2e.mjs l'allument (DAILY=1) avec leur faux Scryfall (daily-fakes.mjs). Classement des niveaux (LEVELS_FILE) : même dossier temporaire.
if (process.env.DAILY === undefined) process.env.DAILY = '0';
if (!process.env.DAILY_DIR) {
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-daily-')); process.env.DAILY_DIR = join(d, 'daily');
  if (!process.env.LEVELS_FILE) process.env.LEVELS_FILE = join(d, 'levels.json');      // classement des niveaux : jamais le vrai .data/levels.json
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
if (!process.env.ADMIN_DIR) {      // panneau d'administration (journal des actions, comptes actifs par jour) : dossier temporaire, jamais le vrai .data/admin
  const d = mkdtempSync(join(tmpdir(), 'deckdeal-admin-')); process.env.ADMIN_DIR = join(d, 'admin');
  process.on('exit', () => { try { rmSync(d, { recursive: true, force: true }); } catch { /* ignore */ } });
}
if (!process.env.PWA_DIR) {
  const dir = mkdtempSync(join(tmpdir(), 'deckdeal-pwa-'));
  for (const f of ['manifest.webmanifest', 'sw.js', 'privacy.html', 'legal.html', 'passer-de-manabox.html', 'admin.html', 'admin.js', 'admin.css', 'icons']) cpSync(join(root, 'pwa', f), join(dir, f), { recursive: true });
  process.env.PWA_DIR = dir;
  process.on('exit', () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
