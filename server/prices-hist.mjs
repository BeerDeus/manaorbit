// Historique des prix « à partir de » sur 30 jours (prices-hist.bin.gz) : un relevé par jour et par carte, tendance Cardmarket en centimes d'euro et
// TCGplayer en centimes de dollar (les mêmes valeurs que prices.tsv : l'impression papier la moins chère, non foil sauf carte qui n'existe qu'en foil).
// Fabriqué chaque jour par gen-prices.mjs (GitHub Actions) à partir du fichier de la veille (branche data) et du relevé du jour, roulant sur 30 jours ;
// relu par proxy.mjs comme prices.tsv, servi carte par carte sur /api/hist (fiche d'une carte). Aucune dépendance ; importé par les deux.
//
// Format MOPH1 (le tout compressé en gzip) :
//   'MOPH' · u8 version (1) · u8 devises (1 : € ; 2 : € puis $) · u16 jours D · u32 premier jour (jours depuis le 1er janvier 1970, UTC) · u32 cartes N
//   · u32 longueur des noms · noms UTF-8 séparés par '\n' (triés) · puis pour chaque devise, carte après carte, ses D valeurs (centimes, 0 = pas de prix ce jour-là)
//   écrites comme l'écart avec la veille (la première : avec 0) en varint zigzag. Rangées carte par carte, les écarts sont presque tous nuls ou petits :
//   ≈ 1 octet par relevé avant gzip (mesuré sur le relevé réel de 33 000 cartes et 30 jours simulés, 30 à 70 % des prix qui bougent
//   chaque jour : 0,6 à 0,8 Mo compressés avec les deux devises, 0,4 à 0,5 Mo en euros seuls ; ≈ 50 ms pour le relire).
import { gzipSync, gunzipSync } from 'node:zlib';

export const HIST_DAYS = 30;
const MAGIC = 'MOPH', HEAD = 20, DAY_MS = 86400e3;
/** '2026-10-24…' → numéro du jour (UTC) ; NaN si la date est illisible. */
export const histDay = iso => Math.floor(Date.parse(String(iso || '').slice(0, 10) + 'T00:00:00Z') / DAY_MS);
export const histIso = n => new Date(n * DAY_MS).toISOString().slice(0, 10);

/** { d0, days, names, e, u? } → fichier gzip. e, u : Uint32Array(N × D), carte par carte (valeur du jour j de la carte i : [i × D + j]). */
export function histPack(h) {
  const N = h.names.length, D = h.days, cols = h.u ? [h.e, h.u] : [h.e], nb = Buffer.from(h.names.join('\n'), 'utf8');
  const out = Buffer.allocUnsafe(HEAD + nb.length + cols.length * N * D * 5); let o = 0;
  o += out.write(MAGIC, o, 'latin1'); out[o++] = 1; out[o++] = cols.length; out.writeUInt16LE(D, o); o += 2;
  out.writeUInt32LE(h.d0, o); o += 4; out.writeUInt32LE(N, o); o += 4; out.writeUInt32LE(nb.length, o); o += 4;
  o += nb.copy(out, o);
  for (const c of cols) for (let i = 0; i < N; i++) {
    let prev = 0;
    for (let j = 0, b = i * D; j < D; j++) {
      const v = c[b + j], d = v - prev; prev = v;
      let z = d >= 0 ? d * 2 : -d * 2 - 1;                                   // zigzag (nombres jusqu'à 2^32 : calcul en flottants, pas en bits)
      while (z >= 128) { out[o++] = (z % 128) | 128; z = Math.floor(z / 128); }
      out[o++] = z;
    }
  }
  return gzipSync(out.subarray(0, o), { level: 9 });
}
/** Fichier (gzip, ou déjà décompressé) → { d0, days, names, e, u (null : sans dollars) } ; lève une erreur s'il est illisible. */
export function histUnpack(buf) {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf) : buf;
  if (raw.length < HEAD || raw.toString('latin1', 0, 4) !== MAGIC || raw[4] !== 1) throw new Error('pas un historique de prix');
  const nc = raw[5], D = raw.readUInt16LE(6), d0 = raw.readUInt32LE(8), N = raw.readUInt32LE(12), nl = raw.readUInt32LE(16);
  if (nc < 1 || nc > 2 || D < 1 || D > 400 || HEAD + nl > raw.length) throw new Error('historique de prix tronqué');
  const names = nl ? raw.toString('utf8', HEAD, HEAD + nl).split('\n') : [];
  if (names.length !== N) throw new Error('historique de prix : noms incohérents');
  let o = HEAD + nl; const cols = [];
  for (let c = 0; c < nc; c++) {
    const a = new Uint32Array(N * D);
    for (let i = 0, k = 0; i < N; i++) {
      let prev = 0;
      for (let j = 0; j < D; j++) {
        let z = 0, m = 1, x;
        do { if (o >= raw.length) throw new Error('historique de prix tronqué'); x = raw[o++]; z += (x & 127) * m; m *= 128; } while (x & 128);
        prev += z % 2 ? -(z + 1) / 2 : z / 2; a[k++] = prev;
      }
    }
    cols.push(a);
  }
  return { d0, days: D, names, e: cols[0], u: cols[1] || null };
}
/** Historique de la veille (ou null) + relevé du jour (Map nom → { e, u }, centimes) daté `at` → historique du jour : les jours de plus de `keep` jours
 *  partent, un jour manqué (relevé raté) reste vide, un 2e relevé le même jour remplace le premier ; une carte sans aucun prix sur la période disparaît.
 *  Un relevé plus ancien que la fin de l'historique est refusé (erreur). */
export function histRoll(prev, map, at, keep = HIST_DAYS) {
  const day = histDay(at); if (!Number.isFinite(day)) throw new Error('date du relevé illisible : ' + at);
  if (prev && prev.d0 + prev.days - 1 > day) throw new Error(`relevé du ${histIso(day)} plus ancien que l'historique (${histIso(prev.d0 + prev.days - 1)})`);
  const d0 = prev ? Math.max(day - keep + 1, prev.d0) : day, D = day - d0 + 1, usd = !prev || !!prev.u;
  const vals = new Map();      // nom → [e(D), u(D)]
  const row = n => { let r = vals.get(n); if (!r) { r = [new Uint32Array(D), usd ? new Uint32Array(D) : null]; vals.set(n, r); } return r; };
  if (prev) {
    const sh = d0 - prev.d0, PD = prev.days;      // jour j du nouveau = jour j + sh de l'ancien
    for (let i = 0; i < prev.names.length; i++) {
      let any = false; const b = i * PD;
      for (let j = Math.max(0, sh); j < PD && j - sh < D - 1; j++) if (prev.e[b + j] || (prev.u && prev.u[b + j])) { any = true; break; }
      if (!any) continue;
      const r = row(prev.names[i]);
      for (let j = Math.max(0, sh); j < PD && j - sh < D - 1; j++) { r[0][j - sh] = prev.e[b + j]; if (r[1] && prev.u) r[1][j - sh] = prev.u[b + j]; }
    }
  }
  for (const [n, v] of map) {
    if (!(v.e > 0) && !(v.u > 0)) { const r = vals.get(n); if (r) { r[0][D - 1] = 0; if (r[1]) r[1][D - 1] = 0; } continue; }
    const r = row(n); r[0][D - 1] = v.e > 0 ? v.e : 0; if (r[1]) r[1][D - 1] = v.u > 0 ? v.u : 0;
  }
  const names = [...vals.keys()].sort((a, b) => a < b ? -1 : a > b ? 1 : 0), N = names.length, e = new Uint32Array(N * D), u = usd ? new Uint32Array(N * D) : null;
  names.forEach((n, i) => { const r = vals.get(n); e.set(r[0], i * D); if (u) u.set(r[1], i * D); });
  return { d0, days: D, names, e, u };
}
/** Relevés d'une carte (indice i) : { e: [centimes | null] × D, u } ; plusieurs indices (même carte sous deux noms) : le plus bas de chaque jour. */
export function histRow(h, idx) {
  const D = h.days, pick = c => { if (!c) return null; const out = []; for (let j = 0; j < D; j++) { let best = 0; for (const i of idx) { const v = c[i * D + j]; if (v && (!best || v < best)) best = v; } out.push(best || null); } return out; };
  return { e: pick(h.e), u: pick(h.u) };
}
