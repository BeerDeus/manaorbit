// Banc de mesure des lectures Firestore (lectures-e2e.mjs) : vrai SDK Firebase (bundle des tests) branché sur l'émulateur Firestore,
// lectures comptées sur le fil (documents reçus par l'écoute, lectures directes, transactions, agrégations), données semées en REST (jeton « owner »).
import { readFileSync } from 'node:fs';
import { newPage } from './e2e-world.mjs';

export const PROJECT = 'm2s-mtg';      // celui de FIREBASE_CONFIG (cloud.js) : l'appli tourne telle quelle, seul l'hôte Firestore change
let SHARED = null;      // bundle des tests (cd tests && npm run fb), lu au premier besoin : sans émulateur, le test s'ignore sans lui

export function emu() {
  const h = process.env.FIRESTORE_EMULATOR_HOST; if (!h) return null;
  const [host, port] = h.split(':');
  const root = `http://${h}`, docs = `${root}/v1/projects/${PROJECT}/databases/(default)/documents`;
  const owner = { authorization: 'Bearer owner', 'content-type': 'application/json' };
  return {
    host, port: Number(port), root, docs,
    async rules(text) { const r = await fetch(`${root}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: text }] } }) }); if (!r.ok) throw new Error('règles refusées : ' + await r.text()); },
    async clear() { await fetch(`${root}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: 'DELETE' }); },
    async put(path, obj) { const r = await fetch(`${docs}/${path}`, { method: 'PATCH', headers: owner, body: JSON.stringify({ fields: enc(obj).mapValue.fields }) }); if (!r.ok) throw new Error('écriture ' + path + ' : ' + await r.text()); },
    async del(path) { await fetch(`${docs}/${path}`, { method: 'DELETE', headers: owner }); },
    async get(path) { const r = await fetch(`${docs}/${path}`, { headers: owner }); if (r.status === 404) return null; const j = await r.json(); return dec({ mapValue: { fields: j.fields || {} } }); },
    async list(path) { const r = await fetch(`${docs}/${path}?pageSize=300`, { headers: owner }); const j = await r.json(); return (j.documents || []).map(d => ({ id: d.name.split('/').pop(), data: dec({ mapValue: { fields: d.fields || {} } }) })); },
  };
}
/** Valeur JS → valeur REST Firestore (entiers en integerValue, comme le SDK). */
export function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isSafeInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)])) } };
}
export function dec(v) {
  if ('nullValue' in v) return null; if ('booleanValue' in v) return v.booleanValue; if ('integerValue' in v) return Number(v.integerValue); if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue; if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) return Object.fromEntries(Object.entries(v.mapValue.fields || {}).map(([k, x]) => [k, dec(x)]));
  return undefined;
}

/** Compteur (côté Node) : chaque réponse de l'émulateur vue par la page est analysée, avec la facturation de Firestore :
 *  · écoute : un document envoyé = une lecture, une fois par cible et par version (l'émulateur renvoie toute une requête quand un seul de ses
 *    documents change ; Firestore n'envoie, et ne facture, que celui-là). getDocFromServer passe aussi par l'écoute (cible à part) ;
 *  · lecture groupée (transaction) : un document trouvé ou absent = une lecture ; agrégation : une lecture par lot de 1 000 entrées d'index (ici 1).
 *  Nouvelle page = nouvelle session : tout ce que l'écoute renvoie est compté (l'émulateur ignore les jetons de reprise : c'est le cas
 *  « relance après plus de 30 min », le plus cher). writes = documents écrits (flux d'écriture et validations de transaction). */
function wcMessages(t) {      // corps WebChannel en long polling : « longueur\nJSON » répétés ; chaque JSON = [[n, [message]], …]
  const out = []; let i = 0;
  while (i < t.length) {
    const nl = t.indexOf('\n', i); if (nl < 0) break;
    const len = Number(t.slice(i, nl).trim()); if (!Number.isFinite(len) || len <= 0) break;
    const chunk = t.slice(nl + 1, nl + 1 + len); i = nl + 1 + len;
    try { for (const [, msgs] of JSON.parse(chunk)) for (const m of msgs || []) if (m && typeof m === 'object') out.push(m); } catch (e) { /* morceau illisible : ignoré */ }
  }
  return out;
}
function track(p, io) {
  p.on('framenavigated', f => { if (f === p.mainFrame()) io.seen = new Set(); });
  p.on('response', async r => {
    const u = r.url(); if (!u.includes(io.host)) return;
    const q = r.request(), m = q.method(), seen = io.seen;
    if (m === 'POST' && /\/Write\/channel/.test(u)) io.writes += (decodeURIComponent(q.postData() || '').match(/"(update|delete)"/g) || []).length;
    if (m === 'POST' && /:commit/.test(u)) io.writes += ((q.postData() || '').match(/"(update|delete)"/g) || []).length;
    let t = ''; try { t = await r.text(); } catch (e) { return; }      // page fermée pendant une écoute en cours
    if (/\/Listen\/channel/.test(u) && m === 'GET') {
      for (const x of wcMessages(t)) {
        const c = x.documentChange; if (!c || !c.document) continue;
        const name = c.document.name.split('/documents/').pop();
        for (const tid of c.targetIds || []) { const k = tid + '|' + name + '|' + c.document.updateTime; if (seen.has(k)) continue; seen.add(k); io.listen++; io.names.push('L ' + name); }
      }
    }
    else if (/:batchGet/.test(u)) { io.batch += (t.match(/"(found|missing)"/g) || []).length; for (const x of t.matchAll(/"name":\s*"[^"]*?\/documents\/([^"]+)"/g)) io.names.push('B ' + x[1]); }
    else if (/:runAggregationQuery/.test(u)) { io.agg += 1; io.names.push('A ' + decodeURIComponent(u.split('/documents/').pop().split(':')[0])); }
  });
}

/** Page de l'appli branchée sur l'émulateur (vrai SDK). ctx : contexte réutilisé (cache IndexedDB gardé = relance de l'appli) ; uid : compte simulé. */
export async function fsPage(browser, world, E, { ctx, uid = 'u1', path = '' } = {}) {
  const own = !ctx;
  if (SHARED === null) SHARED = readFileSync('tests/.tmp/fb-shared.js', 'utf8');
  if (own) ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' };
  if (own) {
    for (const n of ['app', 'auth']) await ctx.route(`https://www.gstatic.com/firebasejs/12.19.0/firebase-${n}.js`, r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/javascript' }, body: "export * from 'https://fb.test/shared.js';" }));
    await ctx.route('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/javascript' }, body: `export * from 'https://fb.test/shared.js';
import { initializeFirestore as i0, connectFirestoreEmulator } from 'https://fb.test/shared.js';
export function initializeFirestore(app, s) {
  const db = i0(app, { ...s, experimentalForceLongPolling: true });
  connectFirestoreEmulator(db, ${JSON.stringify(E.host)}, ${E.port}, { mockUserToken: { sub: self.__fbUid, user_id: self.__fbUid, email: 'test@example.com' } });
  self.__db = db; return db;
}` }));
    await ctx.route('https://fb.test/shared.js', r => r.fulfill({ status: 200, headers: { ...CORS, 'content-type': 'text/javascript' }, body: SHARED }));
    await ctx.route(/identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|apis\.google\.com|firebaseapp\.com|firestore\.googleapis\.com/, r => r.abort());
    await ctx.addInitScript(u => { self.__fbUid = u; }, uid);
    ctx.__io = { host: `${E.host}:${E.port}`, listen: 0, batch: 0, agg: 0, writes: 0, names: [], noResume: false, seen: new Set() };
    // Firestore après 30 min sans écoute : la reprise ne vaut plus, tout est relu. Simulé en retirant le jeton de reprise des demandes d'écoute.
    await ctx.route(/\/Listen\/channel/, r => {
      const q = r.request(); if (q.method() !== 'POST' || !ctx.__io.noResume) return r.continue();
      const out = new URLSearchParams();
      for (const [k, v] of new URLSearchParams(q.postData() || '')) {
        if (!/^req\d+___data__$/.test(k)) { out.append(k, v); continue; }
        try { const o = JSON.parse(v); if (o.addTarget) { delete o.addTarget.resumeToken; delete o.addTarget.readTime; delete o.addTarget.expectedCount; } out.append(k, JSON.stringify(o)); } catch (e) { out.append(k, v); }
      }
      return r.continue({ postData: out.toString() });
    });
  }
  const { p, errs } = await newPage({ newContext: async () => ctx }, world, { goto: false });      // routes Scryfall et polices du monde commun, sur ce contexte
  track(p, ctx.__io);
  await p.goto(world.url + path);
  await p.waitForFunction(() => D.authReady && D.state === 'ready', null, { timeout: 20000 });
  return { ctx, p, errs, uid, io: ctx.__io };
}
/** Connexion simulée (le vrai SDK Auth ne voit personne ; Firestore s'authentifie auprès de l'émulateur avec le jeton factice de l'uid). */
export async function fsSignIn(P) {
  await P.p.evaluate(uid => onUser({ uid, email: 'test@example.com', displayName: 'Test', emailVerified: true, providerData: [{ providerId: 'password' }], reload: async () => {}, getIdToken: async () => '' }), P.uid);
}
export const reads = P => { const io = P.io; return { reads: io.listen + io.batch + io.agg, listen: io.listen, batch: io.batch, agg: io.agg, writes: io.writes, names: io.names.slice() }; };
export const resetReads = P => { const io = P.io; io.listen = io.batch = io.agg = io.writes = 0; io.names = []; };
