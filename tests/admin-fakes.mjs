// Faux services du panneau d'administration (test-admin.mjs, admin-e2e.mjs) : faux Identity Toolkit (accounts:batchGet, par pages) et faux Firestore
// REST (requêtes « groupe de collections » runQuery avec select, curseur et limite ; liste d'une collection racine avec masque), plus un jeu de comptes
// fictifs. Jetons Firebase, OAuth2 du compte de service et JWKS : amis-fakes.mjs. Aucune adresse ni nom réel ; aucun accès réseau.
import http from 'node:http';
import { createHash } from 'node:crypto';

export const tag = uid => createHash('sha256').update(uid).digest('hex');
const sv = v => (Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === 'number' ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v }) : typeof v === 'boolean' ? { booleanValue: v }
  : v === null ? { nullValue: null } : typeof v === 'object' ? { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sv(x)])) } } : { stringValue: String(v) });
const DAY = 86400e3;

/** Comptes fictifs : 4 nommés (cas particuliers) + n générés (pages, tri). Adresse de l'administrateur : ADMIN (elle passe par ADMIN_EMAILS). */
export const ADMIN = 'admin@example.org';
export function fixture(now = Date.now(), n = 120) {
  const acct = (uid, o) => ({ localId: uid, email: o.email, emailVerified: o.ver !== false, displayName: o.dn, photoUrl: 'https://lh3.googleusercontent.com/a/photo-' + uid, passwordHash: 'SECRETHASH-' + uid, salt: 'SECRETSALT', phoneNumber: '+33600000000',
    providerUserInfo: (o.prov || ['google.com']).map(p => ({ providerId: p, email: o.email, rawId: 'raw-' + uid, displayName: o.dn, photoUrl: 'https://lh3.googleusercontent.com/a/photo-' + uid })),
    createdAt: String(o.created), lastLoginAt: String(o.login), ...(o.refresh ? { lastRefreshAt: new Date(o.refresh).toISOString() } : {}), ...(o.dis ? { disabled: true } : {}) });
  const users = [
    acct('uid-jeanne-01', { email: 'jeanne.dupont@gmail.com', dn: 'Jeanne Dupont', created: now - 2 * DAY, login: now - 3600e3, refresh: now - 600e3 }),
    acct('uid-bob-02', { email: 'bob@exemple-perso.fr', dn: '', ver: false, prov: ['password'], created: now - 10 * DAY, login: now - 9 * DAY }),
    acct('uid-carol-03', { email: 'carol.martin@outlook.com', dn: 'Carol Ann Martin', created: now - 20 * DAY, login: now - 20 * DAY }),
    acct('uid-dave-04', { email: 'dave@icloud.com', dn: 'Dave', created: now - 40 * DAY, login: now - 40 * DAY, dis: true }),
  ];
  for (let i = 0; i < n; i++) users.push(acct('uid-gen-' + String(i).padStart(3, '0'), { email: 'gen' + i + '@gmail.com', dn: 'Gen' + i, created: now - (i % 60) * DAY - 1000 * i, login: now - (i % 45) * DAY - 500 }));
  const T = tag;
  const docs = new Map([
    ['users/uid-jeanne-01/meta/collection', { text: '3 Sol Ring (CMM) 400 *FR*\n1 Sol Ring\n2 Forest', count: 2, updatedAt: now - 300e3 }],
    ['users/uid-jeanne-01/meta/trade', { keep: 1, kept: ['Sol Ring'], wish: { a: { n: 'Ancestral Recall', q: 1 }, b: { n: 'Black Lotus', q: 1 }, c: { n: 'Mox Pearl', q: 2 } }, share: 'ShareJeanne1', dsh: { d1: 'LinkA', d2: 'LinkB' }, updatedAt: now - 400e3 }],
    ['users/uid-jeanne-01/meta/history', { pts: [{ t: now - 3 * DAY, v: 1000, n: 2, q: 5 }, { t: now - DAY, v: 12345, n: 2, q: 6 }], updatedAt: now - DAY }],
    ['users/uid-jeanne-01/meta/profile', { name: 'Jeanne Dupont', photo: 'data:image/png;base64,UFJJVkFURVBIT1RP', updatedAt: now - 5 * DAY }],
    ['users/uid-jeanne-01/meta/prefs', { scan: { lang: 'fr' }, updatedAt: now - 60e3 }],
    ['users/uid-jeanne-01/decks/d1', { name: 'Atraxa secret', text: '1 Sol Ring', updatedAt: now - 7200e3 }],
    ['users/uid-jeanne-01/decks/d2', { name: 'Edgar', text: '1 Sol Ring', updatedAt: now - 8000e3 }],
    ['users/uid-jeanne-01/decks/d3', { name: 'Krenko', text: '1 Sol Ring', updatedAt: now - 9000e3 }],
    ['users/uid-bob-02/meta/collection', { text: '4 Island\n4 Island (M21) 250\n1 Counterspell', updatedAt: now - 9 * DAY }],
    ['users/uid-bob-02/meta/profile', { name: 'BobLeMage', updatedAt: now - 9 * DAY }],
    ['users/uid-ghost-98/meta/prefs', { scan: {}, updatedAt: now - 2 * DAY }],      // compte absent de Firebase Authentication (supprimé) : visible seulement sans la liste des comptes
    ['users/uid-ghost-98/decks/g1', { name: 'x', text: '', updatedAt: now - 2 * DAY }],
    ['games/g1/meta/state', { updatedAt: now }],                                           // autre appli du projet : ignorée
    ['users/uid-carol-03/binder/lands', { owned: {}, updatedAt: now }],                    // Classeur Full Art (autre appli) : rien pour Mana Orbit
    [`pubdecks/${T('uid-jeanne-01')}_0`, { o: T('uid-jeanne-01'), by: 'Jeanne', cards: ['99 Forest'], updatedAt: now }],
    [`pubdecks/${T('uid-jeanne-01')}_1`, { o: T('uid-jeanne-01'), by: 'Jeanne', cards: ['99 Forest'], updatedAt: now }],
    [`pubdecks/${T('uid-bob-02')}_1`, { o: T('uid-jeanne-01'), by: 'Faux', cards: ['99 Forest'], updatedAt: now }],      // propriétaire faux : pas compté
    [`pubreports/${T('uid-jeanne-01')}_0~${T('r1')}`, { d: T('uid-jeanne-01') + '_0', at: now }],
    [`amis/${T('uid-jeanne-01')}`, { j: JSON.stringify({ v: 1, n: 'Jeanne Dupont', p: 'data:image/png;base64,QU1JUw==', l: 'fr', f: { [T('uid-bob-02')]: now }, i: { [T('uid-carol-03')]: now }, o: {}, x: {}, d: [], hk: [], wk: [], has: {} }), at: now }],
    [`amis/${T('uid-bob-02')}`, { j: JSON.stringify({ v: 1, n: 'Bob', l: 'en', f: { [T('uid-jeanne-01')]: now }, i: {}, o: { [T('uid-carol-03')]: now }, x: {}, d: [], hk: [], wk: [], has: {} }), at: now }],
    [`amis/${T('uid-carol-03')}`, { j: JSON.stringify({ v: 1, n: '', l: 'de', f: {}, i: { [T('uid-bob-02')]: now }, o: { [T('uid-jeanne-01')]: now }, x: {}, d: [], hk: [], wk: [], has: {} }), at: now }],
  ]);
  for (let i = 0; i < n; i++) { const uid = 'uid-gen-' + String(i).padStart(3, '0'); docs.set(`users/${uid}/meta/collection`, { text: i + ' Forest', count: i ? 1 : 0, updatedAt: now - (i % 45) * DAY }); for (let k = 0; k < i % 4; k++) docs.set(`users/${uid}/decks/k${k}`, { name: 'd', text: '', updatedAt: now - (i % 45) * DAY }); }
  return { users, docs };
}

export async function startAdminFakes() {
  // Identity Toolkit : it.users (comptes bruts), it.page (taille de page), it.deny (403), it.calls (requêtes reçues)
  const it = { users: [], page: 50, deny: 0, calls: [], auth: [] };
  const upIt = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    it.calls.push(req.method + ' ' + u.pathname + (u.searchParams.get('nextPageToken') ? '#' + u.searchParams.get('nextPageToken') : '')); it.auth.push(String(req.headers.authorization || ''));
    if (req.method !== 'GET' || u.pathname !== '/v1/projects/mana-test/accounts:batchGet') return send(404, { error: { code: 404, message: 'not found' } });
    if (it.deny) return send(403, { error: { code: 403, message: 'The caller does not have permission', status: 'PERMISSION_DENIED' } });
    const from = Number(u.searchParams.get('nextPageToken') || 0), size = Math.min(Number(u.searchParams.get('maxResults')) || 20, it.page), users = it.users.slice(from, from + size);
    send(200, { kind: 'identitytoolkit#DownloadAccountResponse', users, ...(from + size < it.users.length ? { nextPageToken: String(from + size) } : {}) });
  });
  // Firestore : fs.docs (chemin → champs), fs.deny (403), fs.down (503) ; fs.queries (runQuery reçues : collection, champs, nombre rendu), fs.lists (listes)
  const fs = { docs: new Map(), deny: 0, down: 0, queries: [], lists: [] };
  const BASE = 'projects/mana-test/databases/(default)/documents/';
  const doc = (path, sel) => { const f = fs.docs.get(path), keep = sel && sel.length ? Object.fromEntries(Object.entries(f).filter(([k]) => sel.includes(k))) : f; return { name: BASE + path, fields: Object.fromEntries(Object.entries(keep).map(([k, v]) => [k, sv(v)])), createTime: '2026-10-10T10:00:00Z', updateTime: '2026-10-10T10:00:00Z' }; };
  const upFs = http.createServer((req, res) => {
    const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (fs.down) return send(503, { error: { code: 503, message: 'The service is currently unavailable.' } });
      if (fs.deny) return send(403, { error: { code: 403, message: 'Missing or insufficient permissions.', status: 'PERMISSION_DENIED' } });
      if (req.method === 'POST' && u.pathname === '/v1/projects/mana-test/databases/(default)/documents:runQuery') {
        const q = JSON.parse(Buffer.concat(c).toString() || '{}').structuredQuery || {}, from = (q.from || [])[0] || {}, sel = ((q.select || {}).fields || []).map(f => f.fieldPath);
        let names = [...fs.docs.keys()].filter(p => { const s = p.split('/'); return s.length % 2 === 0 && s[s.length - 2] === from.collectionId && (from.allDescendants || s.length === 2); }).sort();
        const after = q.startAt && q.startAt.values && q.startAt.values[0].referenceValue; if (after) names = names.filter(p => BASE + p > after);
        names = names.slice(0, q.limit || 1e9);
        fs.queries.push({ col: from.collectionId, all: !!from.allDescendants, sel, n: names.length, order: JSON.stringify(q.orderBy || []) });
        return send(200, names.length ? names.map(p => ({ document: doc(p, sel), readTime: '2026-10-13T10:00:00Z' })) : [{ readTime: '2026-10-13T10:00:00Z' }]);
      }
      const m = /^\/v1\/projects\/mana-test\/databases\/\(default\)\/documents\/([a-z]+)$/.exec(u.pathname);
      if (req.method === 'GET' && m) {
        const sel = u.searchParams.getAll('mask.fieldPaths'), all = [...fs.docs.keys()].filter(p => p.split('/').length === 2 && p.startsWith(m[1] + '/')).sort();
        const from = Number(u.searchParams.get('pageToken') || 0), size = Math.min(Number(u.searchParams.get('pageSize')) || 300, 2), page = all.slice(from, from + size);      // pages de 2 : pagination exercée
        fs.lists.push({ col: m[1], sel, n: page.length });
        return send(200, { ...(page.length ? { documents: page.map(p => doc(p, sel)) } : {}), ...(from + size < all.length ? { nextPageToken: String(from + size) } : {}) });
      }
      send(404, { error: { code: 404, message: 'not found' } });
    });
  });
  for (const s of [upIt, upFs]) await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s => s.address().port;
  /** Remplit les deux faux services avec le jeu de comptes fictifs. */
  const seed = (now, n) => { const fx = fixture(now, n); it.users = fx.users; fs.docs = fx.docs; return fx; };
  return { it, fs, seed, env: { IDENTITY_TOOLKIT_BASE_URL: `http://127.0.0.1:${port(upIt)}`, FIRESTORE_BASE_URL: `http://127.0.0.1:${port(upFs)}/` }, stop: () => { upIt.close(); upFs.close(); } };
}

/* ── Page /admin dans le navigateur : faux SDK Firebase (app et auth) servi à l'adresse du vrai (gstatic, autorisée par la CSP de la page) ──
   Compte déjà connecté : window.__fbUser ; prochain compte choisi dans la « fenêtre Google » : window.__nextUser ({ uid, email, tok }) ; aucun : fenêtre fermée. */
const FAKE_APP = `const apps = [];
export const getApps = () => apps; export const getApp = () => apps[0];
export const initializeApp = c => { const a = { name: '[DEFAULT]', options: c }; apps.push(a); window.__fbCfg = c; return a; };`;
const FAKE_AUTH = `const auth = { languageCode: '', currentUser: null }; let cb = null;
const mk = u => u && { uid: u.uid, email: u.email, getIdToken: async force => { window.__tokCalls = (window.__tokCalls || 0) + 1; return u.tok; } };
export const getAuth = () => auth;
export const onAuthStateChanged = (a, f) => { cb = f; setTimeout(() => f(auth.currentUser = mk(window.__fbUser || null)), 0); return () => { cb = null; }; };
export class GoogleAuthProvider { setCustomParameters(p) { this.p = p; } }
export const signInWithPopup = async (a, p) => { window.__popups = (window.__popups || 0) + 1; const u = window.__nextUser; if (!u) throw Object.assign(new Error('closed'), { code: 'auth/popup-closed-by-user' }); window.__fbUser = u; auth.currentUser = mk(u); if (cb) cb(auth.currentUser); return { user: auth.currentUser }; };
export const signOut = async () => { window.__fbUser = null; auth.currentUser = null; if (cb) cb(null); };`;
export async function routeAdminPage(ctx) {
  const js = body => r => r.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'content-type': 'text/javascript' }, body });
  await ctx.route('https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js', js(FAKE_APP));
  await ctx.route('https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js', js(FAKE_AUTH));
  const { routeFonts } = await import('./fonts.mjs'); await routeFonts(ctx);
}
