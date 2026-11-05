// Fiches des commandants (tools/cmd-brief-merge.mjs › cleanPlan) : texte du plan coupé à une fin de phrase (jamais au milieu d'un mot), carte hors couleurs ou
// interdite retirée de sa liste (sinon sa phrase), nom court du commandant et mots courants jamais pris pour une carte. Sans réseau.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPlan, cardsOf } from '../tools/cmd-brief-merge.mjs';

const D = { cards: [['Propaganda', 'U', 3, 8, 0, 100, 0, '', 50], ['Ghostly Prison', 'W', 3, 8, 0, 100, 0, '', 40], ['Windborn Muse', 'W', 4, 2, 0, 100, 0, '', 400], ['Necropotence', 'B', 3, 8, 0, 3000, 0, '', 90],
  ['Mana Crypt', '', 0, 4, 0, 20000, 16, 'C', 1], ['Abomination', 'B', 5, 2, 0, 10, 0, '', 30000], ['The Howling Abomination', 'G', 4, 258, 0, 100, 0, '', 9000]] };
const cards = cardsOf(D), W = new Set(['W']);

test('plan coupé net à 600 caractères par une ancienne fusion : jusqu\'à la dernière fin de phrase', () => {
  const t = 'Tu poses des taxes et tu attaques. '.repeat(16) + 'Puis tu finis avec une grosse vague de sacrific';
  const r = cleanPlan(t.slice(0, 600)); assert.equal(r.cut, true); assert.match(r.plan, /attaques\.$/); assert.ok(r.plan.length < 600);
  assert.equal(cleanPlan('Un plan court sans point final').plan, 'Un plan court sans point final', 'plan court : gardé tel quel');
});
test('carte hors couleurs ou interdite : retirée de sa liste, sinon sa phrase', () => {
  const r = cleanPlan('Tu te protèges derrière Ghostly Prison, Propaganda et Windborn Muse. Tu pioches avec Necropotence pour tout trouver. Puis tu gagnes.', { cards, ci: W });
  assert.equal(r.plan, 'Tu te protèges derrière Ghostly Prison et Windborn Muse. Puis tu gagnes.'); assert.deepEqual(r.dropped.sort(), ['Necropotence', 'Propaganda']);
  assert.equal(cleanPlan('Mana Crypt, Ghostly Prison et Windborn Muse.', { cards, ci: W }).plan, 'Ghostly Prison et Windborn Muse.', 'interdite en Commander');
});
test('nom court du commandant, mots courants : pas une autre carte', () => {
  const self = new Set(['the howling abomination']);
  assert.equal(cleanPlan('Abomination attaque chaque tour. Ghostly Prison protège.', { cards, ci: new Set(['G', 'W']), self }).dropped.length, 0);
});
import { applyReview } from '../tools/cmd-brief-review.mjs';
test('relecture ciblée : note 0 relevée, piège retiré, verdict « garder » sans effet', () => {
  const cmds = new Map([['squee', { syn: [['Goblin Chirurgeon', 0], ['Sol Ring', 1]], trap: ['Cursed Totem', 'Ashnod\'s Altar'] }]]);
  const st = applyReview(cmds, [{ slug: 'squee', card: 'Goblin Chirurgeon', kind: 'note 0', verdict: 'changer', note: 3 }, { slug: 'squee', card: 'Cursed Totem', kind: 'piège', verdict: 'changer', trap: false, note: 1 },
    { slug: 'squee', card: "Ashnod's Altar", kind: 'piège', verdict: 'garder' }, { slug: 'absent', card: 'X', kind: 'note 0', verdict: 'changer', note: 2 }]);
  const b = cmds.get('squee'); assert.deepEqual(b.syn, [['Goblin Chirurgeon', 3], ['Sol Ring', 1], ['Cursed Totem', 1]]); assert.deepEqual(b.trap, ["Ashnod's Altar"]);
  assert.deepEqual([st.kept, st.notes, st.traps, st.missing], [1, 2, 1, ['absent']]);
});
