// Marché des prix (core.js › MK) : Cardmarket en euros (Europe) ou TCGplayer en dollars (États-Unis et autres pays) — marché deviné, choix gardé,
// prix Scryfall du marché, textes réécrits pour TCGplayer dans chaque langue, liens, devise des relevés gardés, prix publiés dans un partage.
// Sans navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../src/core.js');

const DICT = {}, dict = l => DICT[l] || (DICT[l] = Object.assign({}, ...readdirSync(new URL('../src/i18n/', import.meta.url)).filter(f => f.startsWith(l + '.') && f.endsWith('.json')).map(f => JSON.parse(readFileSync(new URL('../src/i18n/' + f, import.meta.url), 'utf8')))));
const lang = (l, fn) => { const was = { lang: C.I18N.lang, dict: C.I18N.dict }; C.I18N.lang = l; C.I18N.dict = l === 'fr' ? null : dict(l); try { return fn(); } finally { Object.assign(C.I18N, was); } };
const market = (id, fn) => { const was = { ...C.MK }; C.MK.id = id; try { return fn(); } finally { Object.assign(C.MK, was); } };

test('mkGuess : fuseau horaire d\'abord, puis région de la langue du téléphone, sinon Europe', () => {
  const g = C.mkGuess;
  assert.equal(g({ tz: 'Europe/Paris', navs: ['en-US'] }), 'eu', 'Français avec un téléphone en anglais américain : Europe');
  assert.equal(g({ tz: 'America/New_York', navs: ['fr-FR'] }), 'us', 'Français en voyage à New York au premier lancement : TCGplayer');
  for (const tz of ['Europe/London', 'Europe/Zurich', 'Atlantic/Canary', 'Atlantic/Reykjavik', 'Indian/Reunion', 'America/Guadeloupe']) assert.equal(g({ tz }), 'eu', tz);
  for (const tz of ['America/Los_Angeles', 'America/Toronto', 'America/Sao_Paulo', 'Asia/Tokyo', 'Australia/Sydney', 'Africa/Casablanca']) assert.equal(g({ tz }), 'us', tz);
  assert.equal(g({ tz: 'UTC', navs: ['en-US'] }), 'us', 'fuseau UTC (inconnu) : la région de la langue');
  assert.equal(g({ tz: 'Etc/GMT+1', navs: ['de-DE'] }), 'eu');
  for (const [nav, want] of [['fr-FR', 'eu'], ['en-GB', 'eu'], ['de-AT', 'eu'], ['pt-PT', 'eu'], ['pt-BR', 'us'], ['es-419', 'us'], ['es-MX', 'us'], ['en-US', 'us'], ['zh-Hans-CN', 'us'], ['fr_CA', 'us'], ['it-CH', 'eu']])
    assert.equal(g({ tz: '', navs: [nav] }), want, nav);
  assert.equal(g({ tz: '', navs: ['en', 'fr'] }), 'eu', 'aucune région : Europe (ce que faisait l\'appli)');
  assert.equal(g({ tz: '', navs: ['en', 'en-US'] }), 'us', 'première langue qui donne une région');
  assert.equal(g({ tz: '', navs: [] }), 'eu');
});

test('mkPick : choix gardé, ?mkt=, marché figé, appareil déjà utilisé, tests', () => {
  const was = { ...C.MK };
  try {
    assert.equal(C.mkPick({ saved: 'us', tz: 'Europe/Paris' }), 'us'); assert.equal(C.MK.pick, 'us'); assert.equal(C.MK.guess, 'eu');
    assert.equal(C.mkPick({ query: 'us', tz: 'Europe/Paris' }), 'us');
    assert.equal(C.mkPick({ saved: 'xx', tz: 'America/Chicago' }), 'us', 'choix illisible : automatique'); assert.equal(C.MK.pick, '');
    assert.equal(C.mkPick({ frozen: 'eu', tz: 'America/Chicago' }), 'eu', 'deviné au premier lancement puis figé : un voyage ne change rien');
    assert.equal(C.mkPick({ old: true, tz: 'America/Chicago' }), 'eu', 'appareil déjà utilisé avant le marché (prix en euros) : Europe');
    assert.equal(C.mkPick({ robot: true, tz: 'America/Chicago' }), 'eu', 'navigateur piloté par les tests : Europe');
    assert.equal(C.mkPick({ robot: true, saved: 'us' }), 'us');
  } finally { Object.assign(C.MK, was); }
});

test('mkPx : prix Scryfall du marché (centimes), foil puis etched pour TCGplayer', () => {
  const p = { eur: '1.20', eur_foil: '3.50', usd: '1.65', usd_foil: null, usd_etched: '4.10' };
  assert.deepEqual(market('eu', () => C.mkPx(p)), { eu: 120, ef: 350 });
  assert.deepEqual(market('us', () => C.mkPx(p)), { eu: 165, ef: 410 }, 'pas de prix foil : celui de l\'etched');
  assert.deepEqual(market('us', () => C.mkPx({ usd: '0.25', usd_foil: '0.80', usd_etched: '2' })), { eu: 25, ef: 80 });
  assert.deepEqual(market('us', () => C.mkPx(null)), { eu: null, ef: null });
  assert.equal(market('us', () => C.mkCur()), 'USD'); assert.equal(market('eu', () => C.mkCur()), 'EUR');
  assert.equal(market('us', () => C.mkName()), 'TCGplayer'); assert.equal(market('us', () => C.mkAb()), 'TCG'); assert.equal(market('eu', () => C.mkAb()), 'CM');
  assert.equal(market('us', () => C.mkSfx()), ':us'); assert.equal(market('eu', () => C.mkSfx()), '');
});

test('T : textes réécrits pour TCGplayer dans chaque langue, jamais en Europe ni les valeurs passées', () => {
  const cases = {
    fr: [['valeur · tendance Cardmarket', 'valeur · prix du marché TCGplayer'], ['prix tendance Cardmarket', 'prix du marché TCGplayer'], ['Tendance Cardmarket', 'Prix du marché TCGplayer'], ['Copier pour Cardmarket', 'Copier pour TCGplayer'], ['Tendance', 'Prix du marché'], ['{n} sans prix CM', '{n} sans prix TCG']],
    en: [['valeur · tendance Cardmarket', 'value · TCGplayer market price'], ['prix tendance Cardmarket', 'TCGplayer market price'], ['Tendance', 'Market price'], ['Copier pour Cardmarket', 'Copy for TCGplayer'], ['Prix Cardmarket', 'TCGplayer prices']],
    de: [['prix tendance Cardmarket', 'TCGplayer-Marktpreis'], ['Tendance', 'Marktpreis']],
    es: [['prix tendance Cardmarket', 'precio de mercado de TCGplayer'], ['Tendance', 'Precio de mercado']],
    it: [['prix tendance Cardmarket', 'prezzo di mercato TCGplayer'], ['Tendance', 'Prezzo di mercato']],
    pt: [['Tendance', 'Preço de mercado']],
  };
  for (const [l, list] of Object.entries(cases)) for (const [k, want] of list) {
    assert.equal(lang(l, () => market('us', () => C.T(k))), want, l + ' : ' + k);
    assert.equal(lang(l, () => market('eu', () => C.T(k))), lang(l, () => C.T(k)), l + ' : Europe inchangée');
  }
  // aucune trace de Cardmarket ni d'euro dans les textes réécrits, langue par langue (les noms de marchés à choisir sont lus sans réécriture : T(…, null, true))
  for (const l of ['fr', 'en', 'de', 'es', 'it', 'pt']) {
    const d = l === 'fr' ? null : dict(l), keys = Object.keys(d || dict('en'));
    for (const k of keys) {
      const out = lang(l, () => market('us', () => C.T(k)));
      assert.ok(!/Cardmarket|€/.test(out), `${l} : « ${k} » → « ${out} »`);
    }
  }
  assert.equal(market('us', () => C.T('Seules comptent les hausses de {t} %', { t: 'Cardmarket €' })), 'Seules comptent les hausses de Cardmarket € %', 'valeur passée : jamais réécrite');
  assert.equal(market('us', () => C.T('Europe, Cardmarket en euros', null, true)), 'Europe, Cardmarket en euros', 'raw : texte tel quel');
  assert.equal(lang('en', () => market('us', () => C.mkLabel('eu'))), 'Europe, Cardmarket in euros');
});

test('Liens du marché : recherche Cardmarket dans la langue, TCGplayer sinon ; liste à coller', () => {
  assert.equal(market('eu', () => C.mkUrl('Sol Ring', 'de')), 'https://www.cardmarket.com/de/Magic/Products/Search?searchString=Sol%20Ring');
  assert.equal(market('us', () => C.mkUrl('Fire // Ice', 'de')), 'https://www.tcgplayer.com/search/magic/product?productLineName=magic&q=Fire&view=grid');
  assert.equal(market('eu', () => C.mkWantsUrl('fr')), 'https://www.cardmarket.com/fr/Magic/Wants');
  assert.equal(market('us', () => C.mkWantsUrl('fr')), 'https://www.tcgplayer.com/massentry');
  const o = market('us', () => C.cmOffer({ key: 'sol ring' }, 150, { cond: 'Near Mint', foil: 'no', lang: 'en' }));
  assert.equal(o.cur, 'USD'); assert.equal(o.seller, 'TCGplayer');
});

test('Relevés gardés : mode « us » accepté, devise par mode, jamais comparé à un relevé en euros', () => {
  assert.equal(C.modeCur('us'), 'USD'); for (const m of ['cm', 'zero', 'direct', undefined]) assert.equal(C.modeCur(m), 'EUR');
  assert.equal(market('us', () => C.mkMode()), 'us'); assert.equal(market('eu', () => C.mkMode()), 'cm');
  const snap = C.sanitizeSnap({ at: 1, mode: 'us', lang: 'en', sig: 's', items: [{ k: 'sol ring', n: 'Sol Ring', q: 1, s: 'ok', c: 150 }] });
  assert.equal(snap.mode, 'us');
  const eu = { at: 1, total: 1000, mode: 'cm', found: 3, count: 3, sig: 'x' }, us = { ...eu, at: 2, total: 1300, mode: 'us' };
  assert.equal(C.sameKind(eu, us), false);
  assert.equal(C.priceDelta([eu, us]).prev, null, 'pas d\'écart entre euros et dollars');
  assert.deepEqual(C.readDeck('d1', { name: 'D', text: '1 Sol Ring', history: [us] }).history.map(e => e.mode), ['us']);
});

test('Partage : prix publiés en dollars (pu, pfu) gardés à part des euros (p, pf)', () => {
  const it = C.shareCard({ n: 'Sol Ring', q: 2, fo: 1, p: 120, pf: 300, pu: 160, pfu: 420 });
  assert.equal(it.p, 120); assert.equal(it.pf, 300); assert.equal(it.pu, 160); assert.equal(it.pfu, 420);
  const x = C.shareCard({ n: 'Sol Ring', q: 2, pu: 160, pfu: 420 });
  assert.equal(x.pu, 160); assert.equal(x.pfu, undefined, 'sans foil : pas de prix foil');
});
