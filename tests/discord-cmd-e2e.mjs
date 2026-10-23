// E2E du lien des annonces /partie du bot Discord (discord-cmd.mjs) : ?compteur=<format> ouvre le compteur de vie de l'appli, prêt pour une nouvelle partie dans
// ce format (standard, libre ; 1 ou inconnu : le format de la dernière fois), adresse nettoyée ; une partie en cours est reprise telle quelle. Port 18933.
import './setup-env.mjs';
import assert from 'node:assert/strict';
import { chromium, startWorld, newPage, ok } from './e2e-world.mjs';

const world = await startWorld({ port: 18933 });
const browser = await chromium.launch({ executablePath: (process.env.CHROMIUM || '/opt/pw-browsers/chromium'), args: ['--no-sandbox'] });
const open = async path => { const x = await newPage(browser, world, { path }); await x.p.waitForSelector('.pu.on .pu-setup', { timeout: 10000 }); return x; };
const jeu = p => p.evaluate(() => [partieJeu(PU.st), PU.st.format, location.search]);

let { p, errs } = await open('?compteur=standard');
assert.deepEqual(await jeu(p), ['standard', 20, ''], 'Standard, 20 PV, adresse nettoyée');
await p.close();
({ p } = await open('?compteur=libre'));
assert.deepEqual((await jeu(p)).slice(0, 1), ['libre']);
await p.close();
({ p } = await open('?compteur=1'));
assert.deepEqual(await jeu(p), ['commander', 40, ''], 'sans format : celui de la dernière fois (Commander au premier lancement)');
await p.evaluate(() => { puSet(partieAddPlace(PU.st, { nom: 'Léa' })); });      // partie en préparation, gardée sur l'appareil
await p.reload(); await p.evaluate(() => { history.replaceState(null, '', '/?compteur=standard'); handleLaunch(); });
await p.waitForFunction(() => PU.st && PU.st.places.length === 2, null, { timeout: 5000 });
assert.equal((await jeu(p))[0], 'commander', 'partie en cours : reprise, pas remplacée');
assert.deepEqual(errs, []);
ok('?compteur=<format> (bouton des annonces /partie du bot Discord) : compteur de vie ouvert dans ce format (standard, libre ; 1 : le dernier), partie en cours reprise');
await browser.close(); await world.stop?.();
process.exit(0);
