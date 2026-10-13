// Faux services des tests « Amis » (test-amis.mjs, amis-e2e.mjs) : jetons Firebase signés par une clé de test (JWKS local), compte de service
// (faux OAuth2), faux Firestore REST (documents lus, créés, remplacés, effacés : amis, amisdata, amisys, shares), faux FCM. Aucun accès réseau réel.
import http from 'node:http';
import { generateKeyPairSync, sign as rsaSign, createHash } from 'node:crypto';

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
export const tag = uid => createHash('sha256').update(uid).digest('hex');
const sv = v => (Array.isArray(v) ? { arrayValue: { values: v.map(sv) } } : typeof v === 'number' ? { integerValue: String(v) } : typeof v === 'boolean' ? { booleanValue: v } : v === null ? { nullValue: null } : { stringValue: String(v) });

export async function startFakes() {
  const KP = generateKeyPairSync('rsa', { modulusLength: 2048 }), SAK = generateKeyPairSync('rsa', { modulusLength: 2048 });
  /** Jeton d'identité Firebase de ce compte (exp : secondes restantes ; négatif : expiré). */
  const jwt = (uid, exp = 3600) => { const n = Math.floor(Date.now() / 1000); const h = b64({ alg: 'RS256', typ: 'JWT', kid: 'k1' }), c = b64({ iss: 'https://securetoken.google.com/m2s-mtg', aud: 'm2s-mtg', auth_time: n - 10, user_id: uid, sub: uid, iat: n - 10, exp: n + exp, email: uid + '@test.dev', email_verified: true }); return [h, c, rsaSign('RSA-SHA256', Buffer.from(h + '.' + c), KP.privateKey).toString('base64url')].join('.'); };
  const jwks = http.createServer((q, r) => { r.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'max-age=3600' }); r.end(JSON.stringify({ keys: [{ ...KP.publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' }] })); });
  const SA = { type: 'service_account', project_id: 'mana-test', private_key_id: 'k1', private_key: SAK.privateKey.export({ type: 'pkcs8', format: 'pem' }), client_email: 'svc@mana-test.iam.gserviceaccount.com', client_id: '1', token_uri: 'https://oauth2.googleapis.com/token' };
  const oauth = { n: 0, scopes: [] };
  const upAuth = http.createServer((req, res) => {
    const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
      const a = String(new URLSearchParams(Buffer.concat(c).toString()).get('assertion') || ''); try { oauth.scopes.push(JSON.parse(Buffer.from(a.split('.')[1], 'base64url')).scope); } catch { /* ignore */ }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ access_token: 'ya29.am-' + (++oauth.n), expires_in: 3599 }));
    });
  });
  // Firestore : documents par chemin (« amis/<empreinte> »…) → champs JS ; fs.down : 503 ; fs.ops : journal « MÉTHODE chemin »
  const fs = { docs: new Map(), ops: [], down: 0 };
  const val = v => ('stringValue' in v ? v.stringValue : 'integerValue' in v ? Number(v.integerValue) : 'booleanValue' in v ? v.booleanValue : null);
  const upFs = http.createServer((req, res) => {
    const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
      const u = new URL(req.url, 'http://x'), m = /^\/v1\/projects\/mana-test\/databases\/\(default\)\/documents\/(.+)$/.exec(u.pathname);
      const send = (s, o) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (!m) return send(404, { error: { code: 404, message: 'bad path' } });
      const path = decodeURIComponent(m[1]); fs.ops.push(req.method + ' ' + path);
      if (fs.down) return send(503, { error: { code: 503, message: 'The service is currently unavailable.' } });
      const doc = f => ({ name: 'projects/mana-test/databases/(default)/documents/' + path, fields: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, sv(v)])), updateTime: new Date().toISOString() });
      if (req.method === 'GET') { const f = fs.docs.get(path); return f ? send(200, doc(f)) : send(404, { error: { code: 404, message: 'not found', status: 'NOT_FOUND' } }); }
      if (req.method === 'PATCH') { const b = JSON.parse(Buffer.concat(c).toString() || '{}'), f = Object.fromEntries(Object.entries(b.fields || {}).map(([k, v]) => [k, val(v)])); fs.docs.set(path, f); return send(200, doc(f)); }
      if (req.method === 'DELETE') { fs.docs.delete(path); return send(200, {}); }
      send(405, { error: { code: 405 } });
    });
  });
  // FCM : messages reçus ; un jeton qui commence par GONE est « désinscrit » (404 UNREGISTERED)
  const fcm = { msgs: [] };
  const upFcm = http.createServer((req, res) => {
    const c = []; req.on('data', x => c.push(x)); req.on('end', () => {
      let b = null; try { b = JSON.parse(Buffer.concat(c).toString()); } catch { /* ignore */ }
      const t = (b && b.message && b.message.token) || ''; fcm.msgs.push(b && b.message);
      if (t.startsWith('GONE')) { res.writeHead(404, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { code: 404, status: 'NOT_FOUND', message: 'Requested entity was not found.', details: [{ '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError', errorCode: 'UNREGISTERED' }] } })); }
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ name: 'projects/mana-test/messages/' + fcm.msgs.length }));
    });
  });
  for (const s of [jwks, upAuth, upFs, upFcm]) await new Promise(r => s.listen(0, '127.0.0.1', r));
  const port = s => s.address().port;
  const env = { FIREBASE_JWKS_URL: `http://127.0.0.1:${port(jwks)}/jwks`, FCM_SERVICE_ACCOUNT: JSON.stringify(SA), FCM_TOKEN_URL: `http://127.0.0.1:${port(upAuth)}/token`, FIRESTORE_BASE_URL: `http://127.0.0.1:${port(upFs)}/`, FCM_BASE_URL: `http://127.0.0.1:${port(upFcm)}` };
  /** Partage public (shares/{id}) d'un compte, tel que l'écrit share.js. */
  const share = (id, uid, d) => fs.docs.set('shares/' + id, { o: tag(uid), kind: 'trade', v: 1, updatedAt: Date.now(), d: JSON.stringify(d) });
  const stop = () => { for (const s of [jwks, upAuth, upFs, upFcm]) s.close(); };
  return { env, jwt, fs, fcm, oauth, share, stop, fcmFor: t => fcm.msgs.filter(m => m && m.token === t) };
}
