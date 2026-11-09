#!/usr/bin/env node
// SCANS SIGNALÉS, CÔTÉ AGENT (Claude) : récupère les signalements du serveur (photo + données de lecture) pour enquêter puis les rejouer (tools/scan-replay.mjs).
// Lecture seule : GET /api/agent/scans (proxy.mjs), clé SCAN_REPORTS_AGENT_KEY envoyée en « Authorization: Bearer ». Dans une session cloud de Claude Code, la clé est
// un secret réseau de l'environnement pour manaorbit.app : le proxy de la session la pose lui-même (la valeur envoyée ici n'est qu'un bouche-trou).
//   node tools/scan-reports.mjs              → les nouveaux depuis la dernière fois (premier lancement : les 20 derniers)
//   node tools/scan-reports.mjs --last 50    → les 50 derniers · --since <id> : ceux d'après cet id · --id <id> : un seul
//   options : --out <dossier> (défaut .data/scan-pull, hors dépôt) · --base <adresse du site> (défaut SITE_URL, sinon https://manaorbit.app)
// Écrit <out>/<id>.jpg et <id>.json, <out>/state.json (dernier id vu) et affiche un résumé par signalement (date, type, commentaire, lu, ligne du bas, carte retenue).
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

// Session cloud : Node ne passe par le proxy de la session (et son certificat) que si on le lui dit au démarrage. Relancé une fois avec ces réglages.
const CA = '/root/.ccr/ca-bundle.crt';
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1', ...(existsSync(CA) && !process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: CA } : {}) } });
  process.exit(r.status ?? 1);
}

for (const ev of ['uncaughtException', 'unhandledRejection']) process.on(ev, e => { console.error('Scans signalés : ' + (e && e.message || e)); process.exit(1); });      // message seul, sans pile
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '.data/scan-pull'), BASE = String(arg('base', process.env.SITE_URL || 'https://manaorbit.app')).replace(/\/+$/, '');
const KEY = process.env.SCAN_REPORTS_AGENT_KEY || 'proxy-injected-placeholder-key-000000000000';      // session cloud : remplacée par le proxy
const ID = /^[0-9a-z]{8,10}-[0-9a-f]{8}$/;
mkdirSync(OUT, { recursive: true });
const stateFile = join(OUT, 'state.json'), state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};

async function get(path, bin) {
  for (let i = 0; i < 4; i++) {
    let r; try { r = await fetch(BASE + '/api/agent/scans' + path, { headers: { Authorization: 'Bearer ' + KEY, Accept: bin ? 'image/jpeg' : 'application/json', 'User-Agent': 'ManaOrbit-agent/1.0' } }); }
    catch (e) { if (i === 3) throw new Error('réseau : ' + (e.cause && e.cause.code || e.message)); await new Promise(s => setTimeout(s, 2000 * 2 ** i)); continue; }
    if (r.status === 404 && !path) throw new Error('404 : accès agent coupé sur le serveur (SCAN_REPORTS_AGENT_KEY absente ou de moins de 32 caractères) ou ancienne version du serveur');
    if (r.status === 401) {
      const b = await r.json().catch(() => ({}));
      if (b.error === 'auth_required') throw new Error('401 auth_required : le serveur n\'a pas encore l\'accès agent (version d\'avant le 9 novembre 2026 déployée)');
      throw new Error('401 : clé refusée (secret réseau de la session pour ' + new URL(BASE).host + ', ou SCAN_REPORTS_AGENT_KEY du serveur différente)');
    }
    if (r.status === 403) throw new Error('403 : ' + (await r.text()).slice(0, 200) + ' (hôte pas autorisé par le réseau de la session ?)');
    if (r.status === 429 || r.status >= 500) { await new Promise(s => setTimeout(s, 3000 * (i + 1))); continue; }
    if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + path);
    return bin ? Buffer.from(await r.arrayBuffer()) : r.json();
  }
  throw new Error('serveur indisponible');
}
/** Une ligne lisible d'un signalement. */
function line(r) {
  const m = r.meta || {}, rd = m.read || {}, h = rd.hit, f = rd.foot || {}, ln = m.line || {};
  const got = h ? `${h.name} (${h.card}) ${Math.round((h.score || 0) * 100)} %${h.via ? ' via ' + h.via : ''}` : 'rien';
  return [`${r.id} · ${new Date(r.t).toISOString().replace('T', ' ').slice(0, 16)} · ${r.what}${r.note ? ' · « ' + r.note + ' »' : ''}`,
    `   lu « ${rd.first || rd.raw || ''} » · bas « ${f.raw || ''} »${f.ft ? ' ' + JSON.stringify({ codes: f.ft.codes, nums: f.ft.nums, lang: f.ft.lang }) : ''}`,
    `   retenu : ${got}${ln.e ? ' · édition ' + ln.e : ''}${ln.maybe ? ' · à vérifier' : ''} · ${rd.ocr || '?'} ${rd.frame || ''} ${m.app || ''}${m.apk ? ' APK ' + m.apk : ''} ${m.build || ''}${rd.turn ? ' · tournée ' + rd.turn : ''}`].join('\n');
}

const one = arg('id', '');
let rows = [];
if (one) { if (!ID.test(one)) throw new Error('--id : identifiant attendu'); rows = [await get('/' + one)]; }
else {
  const since = arg('since', arg('last', '') ? '' : state.last || ''), lim = Number(arg('last', 20)) || 20;
  if (since && !ID.test(since)) throw new Error('--since : identifiant attendu');
  for (let s = since, n = 0; n < 20; n++) {      // par pages de 100 au plus
    const j = await get(s ? `?since=${s}&limit=100` : `?limit=${Math.min(100, lim)}`);
    rows.push(...j.rows); state.total = j.total;
    if (!s || !j.more || !j.rows.length) break;
    s = j.rows[j.rows.length - 1].id;
  }
}
for (const r of rows) {
  if (!r || !ID.test(r.id)) continue;
  writeFileSync(join(OUT, r.id + '.json'), JSON.stringify(r, null, 1));
  if (!existsSync(join(OUT, r.id + '.jpg'))) writeFileSync(join(OUT, r.id + '.jpg'), await get('/' + r.id + '.jpg', true));
  console.log(line(r) + '\n');
}
if (!one && rows.length) state.last = rows[rows.length - 1].id;
state.at = new Date().toISOString(); writeFileSync(stateFile, JSON.stringify(state, null, 1));
console.log(`${rows.length} signalement(s) → ${OUT}${state.total != null ? ` (${state.total} sur le serveur)` : ''}. Rejouer : node tools/scan-replay.mjs ${OUT}${rows.length ? ' --ids ' + rows.map(r => r.id).join(',') : ''}`);
