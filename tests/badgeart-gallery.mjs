// Galerie des icônes de badges (src/badgeart.js) : chaque badge de PRG_BADGES (et chaque glyphe de BDG_G pas encore au catalogue) à chaque palier
// (pas obtenu, bronze, argent, or, diamant ; unique), en grand puis à la taille de la fiche, thème clair puis sombre → shots/badgeart-light.png, shots/badgeart-dark.png.
// Page générée (style.css, css/badgeart.css, badgeart.js) : ni serveur ni réseau. Outil de relecture, hors run-tests.sh.
// BADGE_SIZE=96 (grande taille, 48 par défaut), BADGE_SMALL=28 (petite taille, 0 : sans), BADGE_IDS=sc_cards,co_foil (une sélection), BADGE_OUT=dossier, BADGE_COLS=2.
import { readFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
const require = createRequire(import.meta.url);
const root = new URL('../', import.meta.url).pathname;
const { PRG_BADGES } = require('../src/progress.js');
const { badgeSvg, BDG_G } = require('../src/badgeart.js');

const SIZE = Number(process.env.BADGE_SIZE) || 48, SMALL = process.env.BADGE_SMALL != null ? Number(process.env.BADGE_SMALL) : 28;
const COLS = Number(process.env.BADGE_COLS) || 2, OUT = process.env.BADGE_OUT || join(root, 'shots');
const ids = process.env.BADGE_IDS ? process.env.BADGE_IDS.split(',') : null;
const all = [...PRG_BADGES, ...Object.keys(BDG_G).filter(k => k !== '_' && !PRG_BADGES.some(b => b.id === k)).map(k => ({ id: k, t: { co_import: 'Déménageur' }[k] || k, tiers: typeof BDG_G[k] === 'string' ? [1] : [1, 2, 3, 4] }))];
const list = all.filter(b => !ids || ids.includes(b.id));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const css = [readFileSync(join(root, 'src/style.css'), 'utf8'), readFileSync(join(root, 'src/css/badgeart.css'), 'utf8')].join('\n');
const row = b => {
  const tiers = b.tiers.length === 1 ? [-1, 0] : [-1, 0, 1, 2, 3], pad = '<span class="g-ic"></span>'.repeat(5 - tiers.length);
  const ic = cls => tiers.map(t => `<span class="g-ic ${cls}">${badgeSvg(b.id, t)}</span>`).join('');
  return `<div class="g-row"><div class="g-name"><b>${esc(b.t)}</b><small>${esc(b.id)}</small></div>${ic('g-big')}${pad}${SMALL ? `<span class="g-sep"></span>${ic('g-sm')}` : ''}</div>`;
};
const html = theme => `<!doctype html><html lang="fr" data-theme="${theme}"><head><meta charset="utf-8"><style>${css}
body{margin:0;padding:16px;background:var(--bg);color:var(--ink);font:13px/1.3 system-ui,sans-serif}
.g-grid{display:grid;width:max-content;grid-template-columns:repeat(${COLS},max-content);gap:6px 24px}
.g-row{display:flex;align-items:center;gap:${Math.max(4, Math.round(SIZE / 8))}px;padding:4px 8px;border-radius:12px;background:var(--surface)}
.g-name{width:130px;display:flex;flex-direction:column}.g-name small{color:var(--ink-3);font-size:11px}
.g-big,.g-row>.g-ic:empty{width:${SIZE}px;height:${SIZE}px}.g-big .bdg-svg{width:${SIZE}px;height:${SIZE}px}
.g-sm .bdg-svg{width:${SMALL}px;height:${SMALL}px}.g-sep{width:1px;align-self:stretch;background:var(--line)}
</style></head><body><div class="g-grid">${list.map(row).join('')}</div></body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
for (const theme of ['light', 'dark']) {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: Number(process.env.BADGE_DPR) || 1, colorScheme: theme });
  await page.setContent(html(theme));
  const { w, h } = await page.evaluate(() => { const r = document.querySelector('.g-grid').getBoundingClientRect(); return { w: Math.ceil(r.width) + 32, h: Math.ceil(r.height) + 32 }; });
  await page.setViewportSize({ width: w, height: h });
  const file = join(OUT, `badgeart-${theme}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(file, w + '×' + h);
  await page.close();
}
await browser.close();
