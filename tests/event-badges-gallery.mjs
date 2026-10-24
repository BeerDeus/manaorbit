// Planche de contrôle des badges d'événement (tools/gen-event-badges.mjs) : les 4 paliers de chaque pack (année 2026, ou EVB_YEAR), en 128 px puis en 44 px,
// sur fond clair puis sombre → shots/event-badges.png. Badges posés tels quels dans la page (SVG en ligne : vérifie aussi que leurs ids ne se gênent pas).
// Ni serveur ni réseau. Outil de relecture, hors run-tests.sh. EVB_BIG=128, EVB_SMALL=44, EVB_PACKS=halloween,noel, EVB_OUT=dossier, EVB_DPR=1.
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { badgeSvgFor } from '../tools/gen-event-badges.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright-core');
const { EV_PACKS, evEdition } = require('../src/evpacks.js');
const root = new URL('../', import.meta.url).pathname;

const YEAR = Number(process.env.EVB_YEAR) || 2026, BIG = Number(process.env.EVB_BIG) || 128, SMALL = Number(process.env.EVB_SMALL) || 44;
const OUT = process.env.EVB_OUT || join(root, 'shots'), sel = process.env.EVB_PACKS ? process.env.EVB_PACKS.split(',') : null;
const packs = EV_PACKS.filter(p => !sel || sel.includes(p.id));
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const panel = theme => `<section class="pn ${theme}">${packs.map(p => {
  const e = evEdition(p, YEAR), svgs = [0, 1, 2, 3].map(t => badgeSvgFor(e, t));
  return `<div class="row"><div class="nm"><b>${esc(p.name)}</b><small>${esc(e.id)} · ${esc(p.font)}${p.ready ? '' : ' · pas prêt'}</small></div>`
    + svgs.map(s => `<span class="ic big">${s}</span>`).join('') + '<span class="sep"></span>' + svgs.map(s => `<span class="ic sm">${s}</span>`).join('') + '</div>';
}).join('')}</section>`;
const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>
body{margin:0;display:flex;font:13px/1.3 system-ui,sans-serif}
.pn{padding:16px;display:flex;flex-direction:column;gap:10px}.light{background:#f4f5f8;color:#1b1f2a}.dark{background:#0e1320;color:#e8ebf3}
.row{display:flex;align-items:center;gap:12px}.nm{width:150px;display:flex;flex-direction:column}.nm small{opacity:.65}
.ic svg{display:block}.big svg{width:${BIG}px;height:${BIG}px}.sm svg{width:${SMALL}px;height:${SMALL}px}.sep{width:1px;align-self:stretch;background:currentColor;opacity:.2}
</style></head><body>${panel('light')}${panel('dark')}</body></html>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 800, height: 400 }, deviceScaleFactor: Number(process.env.EVB_DPR) || 1 });
await page.setContent(html);
const { w, h } = await page.evaluate(() => ({ w: Math.ceil(document.body.scrollWidth), h: Math.ceil(document.body.scrollHeight) }));
await page.setViewportSize({ width: w, height: h });
const file = join(OUT, 'event-badges.png');
await page.screenshot({ path: file, fullPage: true });
console.log(file, w + '×' + h);
await browser.close();
