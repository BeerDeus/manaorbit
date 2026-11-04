// ── Base de l'assistant de deck Commander (« coach », src/deckwiz.js) : agrégats générés par gen-deckdb.mjs (GitHub Actions, branche deck-corpus) ──
// Le serveur récupère dkw.json.gz au démarrage puis toutes les 6 h (ETag), le garde en mémoire et dans .data/ (redémarrage sans réseau), et le sert découpé :
//   GET /api/dkw            → le cœur : table des cartes (rôles, coût, couleurs, prix, mécaniques et sous-types), cibles par catégorie, vocabulaire des mécaniques (mech), liste des commandants et des thèmes couverts
//   GET /api/dkw?c=<slug>   → un commandant : cartes EDHREC (inclusion, synergie), thèmes approfondis, statistiques du corpus
//   GET /api/dkw?t=<thème>  → un thème général : ses cartes et ses commandants
// Chaque morceau est compressé une fois (gzip), avec son ETag : un appareil qui l'a déjà reçoit un 304. Le corpus brut (corpus.json.gz) reste sur la branche :
// il n'est ni lu ni servi ici. Aucune donnée personnelle, ouvert à tous (comme edh.bin.gz). DKW_SOURCE_URL='' coupe la synchronisation ; DKW_FILE : fichier local (tests).
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const SLUG = /^[a-z0-9][a-z0-9-]{0,120}$/;
const etagOf = b => '"' + createHash('sha1').update(b).digest('hex').slice(0, 20) + '"';
/** Découpe l'objet dkw en morceaux compressés : { at, core, cmd: Map, th: Map, n }. Lève une erreur si l'objet n'a pas la bonne forme. */
export function dkwSplit(D) {
  if (!D || D.v !== 1 || !Array.isArray(D.cards) || !D.tg) throw new Error('pas un fichier dkw v1');
  const pack = o => { const raw = Buffer.from(JSON.stringify(o)), gz = gzipSync(raw, { level: 9 }); return { gz, etag: etagOf(gz), n: raw.length }; };
  const cmds = Object.keys(D.cmd || {}).filter(s => SLUG.test(s)), ths = Object.keys(D.themes || {}).filter(s => SLUG.test(s));
  const core = pack({ v: 1, at: D.at, roles: D.roles, cards: D.cards, tg: D.tg, combos: Array.isArray(D.combos) ? D.combos : [], pairs: Array.isArray(D.pairs) ? D.pairs : [], w: D.w && typeof D.w === 'object' ? D.w : undefined, bench: D.bench || undefined, mech: D.mech && Array.isArray(D.mech.tags) ? D.mech : undefined, cmds, themes: ths.map(s => [s, D.themes[s].n || 0]), src: D.src || {} });
  const cmd = new Map(cmds.map(s => [s, pack({ at: D.at, slug: s, ...D.cmd[s] })]));
  const th = new Map(ths.map(s => [s, pack({ at: D.at, slug: s, ...D.themes[s] })]));
  return { at: String(D.at || ''), core, cmd, th, cards: D.cards.length };
}

export function dkwMake({ src, file, dir, json, sec = {}, firstMs = 7000, everyMs = 6 * 3600e3, log = console }) {
  const ST = { from: 'none', at: '', cards: 0, cmds: 0, themes: 0, bytes: 0, check: '', err: '' };
  let LIVE = null, etag = '', busy = false, retry = 0, timer = null;
  const copy = dir ? join(dir, 'dkw.json.gz') : '';
  function take(buf, from) {
    const D = JSON.parse(gunzipSync(buf).toString('utf8')), s = dkwSplit(D);
    if (s.cards < 1000 && !process.env.DKW_SMALL) throw new Error(`fichier trop maigre (${s.cards} cartes) : ignoré`);
    if (LIVE && s.at && LIVE.at && s.at <= LIVE.at) return false;
    LIVE = s; Object.assign(ST, { from, at: s.at, cards: s.cards, cmds: s.cmd.size, themes: s.th.size, bytes: buf.length, err: '' });
    return true;
  }
  async function boot() {
    for (const [f, from] of [[file, 'fichier'], [copy, 'copie']]) {
      if (!f) continue;
      try { take(await readFile(f), from); } catch (e) { if (e.code !== 'ENOENT') log.warn('Coach : ' + f + ' illisible (' + e.message + ')'); }
    }
  }
  async function sync() {
    if (!src || busy) return; busy = true; ST.check = new Date().toISOString(); let got = false;
    try {
      const r = await fetch(src, { headers: { 'User-Agent': 'deckdeal-proxy', ...(etag ? { 'If-None-Match': etag } : {}) }, signal: AbortSignal.timeout(120000) });
      if (r.status === 304) { ST.err = ''; retry = 0; return; }
      if (!r.ok) throw new Error('HTTP ' + r.status);
      got = true; retry = 0;
      const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 90e6) throw new Error('fichier trop gros');
      const fresh = take(buf, 'GitHub'); etag = r.headers.get('etag') || '';
      if (fresh) {
        log.log(`Coach : base du ${ST.at} récupérée (${ST.cards} cartes, ${ST.cmds} commandants, ${(buf.length / 1048576).toFixed(2)} Mo)`);
        if (copy) { try { await mkdir(dir, { recursive: true }); await writeFile(copy + '.tmp', buf); await rename(copy + '.tmp', copy); } catch (e) { /* dossier en lecture seule : la mémoire suffit */ } }
      }
    } catch (e) {
      ST.err = String(e && e.message || e); log.warn('Coach : mise à jour impossible (' + ST.err + ')');
      if (!got && !timer) { timer = setTimeout(() => { timer = null; sync(); }, Math.min(60, 2 ** retry++) * 60000); timer.unref?.(); }
    } finally { busy = false; }
  }
  function start() {
    boot().then(() => { if (!src) return; setTimeout(sync, firstMs).unref?.(); setInterval(sync, everyMs).unref?.(); }).catch(() => {});
  }
  /** GET /api/dkw[?c=slug | ?t=thème] */
  function api(req, res, url) {
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method_not_allowed' });
    if (!LIVE) return json(res, 503, { error: 'unavailable', message: 'Base du coach pas encore disponible.' }, { 'Retry-After': '300' });
    const c = url.searchParams.get('c'), t = url.searchParams.get('t');
    let p = LIVE.core;
    if (c != null) { if (!SLUG.test(c)) return json(res, 400, { error: 'bad_slug' }); p = LIVE.cmd.get(c); }
    else if (t != null) { if (!SLUG.test(t)) return json(res, 400, { error: 'bad_slug' }); p = LIVE.th.get(t); }
    if (!p) return json(res, 404, { error: 'not_found' });
    const hd = { ...sec, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=3600', ETag: p.etag, Vary: 'Accept-Encoding' };
    if (String(req.headers['if-none-match'] || '').split(',').some(x => x.trim().replace(/^W\//, '') === p.etag)) { delete hd['Content-Type']; res.writeHead(304, hd); return res.end(); }
    const gz = /\bgzip\b/i.test(String(req.headers['accept-encoding'] || '')), body = gz ? p.gz : gunzipSync(p.gz);
    if (gz) hd['Content-Encoding'] = 'gzip';
    hd['Content-Length'] = body.length; res.writeHead(200, hd);
    return res.end(req.method === 'HEAD' ? undefined : body);
  }
  return { start, sync, api, status: () => ({ ...ST }), live: () => LIVE };
}
