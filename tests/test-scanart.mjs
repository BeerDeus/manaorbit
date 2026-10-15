// Empreinte d'illustration (scanart.js) : invariante à la lumière et à la balance des blancs, sensible à l'illustration. Sans navigateur ni réseau.
import './setup-env.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { artSigData, artDist, ART_W, ART_H, ART_RATIO, ART_MAX } = require('../src/scanart.js');

let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
/** Image ART_W × ART_H : taches de couleur (une « illustration »), puis transformée (gain, décalage, bruit). */
const art = () => Array.from({ length: ART_W * ART_H }, () => [rnd() * 255, rnd() * 255, rnd() * 255]);
const px = (a, { gain = [1, 1, 1], off = [0, 0, 0], noise = 0 } = {}) => {
  const d = new Uint8ClampedArray(ART_W * ART_H * 4);
  a.forEach((c, i) => { for (let k = 0; k < 3; k++) d[i * 4 + k] = c[k] * gain[k] + off[k] + (rnd() - 0.5) * 2 * noise; d[i * 4 + 3] = 255; });
  return d;
};
const sig = (a, o) => artSigData(px(a, o), ART_W, ART_H);

test('même illustration sous une autre lumière : proche ; autre illustration : loin', () => {
  const A = art(), B = art();
  const ref = sig(A), lit = sig(A, { gain: [0.7, 0.75, 0.9], off: [30, 20, -10], noise: 12 }), other = sig(B);
  const dSame = artDist(ref, lit), dOther = artDist(ref, other);
  assert.ok(dSame < ART_MAX, 'même illustration : ' + dSame.toFixed(3));
  assert.ok(dOther > dSame * ART_RATIO * 2, `autre illustration nettement plus loin (${dOther.toFixed(3)} / ${dSame.toFixed(3)})`);
  assert.equal(artDist(ref, null), Infinity); assert.equal(artDist(ref, ref), 0);
});
test('image uniforme : pas de division par zéro', () => {
  const d = new Uint8ClampedArray(ART_W * ART_H * 4).fill(128), s = artSigData(d, ART_W, ART_H);
  assert.ok([...s].every(Number.isFinite));
});
