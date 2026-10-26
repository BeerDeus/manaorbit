/* ── Mana Orbit — santé du serveur pour le panneau d'administration (/admin › Serveur) ──────────────────────────────────────────────
   Sans dépendance, chargé par proxy.mjs. Tout est fait pour coûter presque rien au serveur :
   · reqMeter : requêtes par minute, par grande famille de routes, en fenêtre glissante de 60 s (une case par seconde, coût O(1) par requête :
     un compteur incrémenté, une case remise à zéro au plus) et pic de la dernière heure (une case par minute). Jamais d'adresse, de chemin complet
     ni de compte : seulement des nombres par famille ;
   · loadMeter : processeur (process.cpuUsage) et retard de la boucle d'événements (perf_hooks.monitorEventLoopDelay) relevés une fois par minute
     (une minuterie, unref), dernière minute et pire minute de l'heure ;
   · dirStat : taille, nombre de fichiers et date du plus ancien fichier d'un dossier (.data/), parcouru seulement quand le panneau le demande
     (proxy.mjs garde le résultat 10 min) ;
   · memLimit : plafond de mémoire connu (SERVER_MEM_MB, sinon la limite du cgroup quand l'hébergeur en pose une), lu une seule fois. */
import { readdir, stat } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { totalmem } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { getHeapStatistics } from 'node:v8';

/** Familles de routes (ordre d'affichage du panneau). */
export const REQ_FAMS = ['page', 'prix', 'alertes', 'troc', 'partie', 'mystere', 'discord', 'admin', 'autres'];
const FAM_IX = Object.fromEntries(REQ_FAMS.map((f, i) => [f, i]));
const API_FAM = { alerts: 'alertes', troc: 'troc', partie: 'partie', daily: 'mystere', level: 'mystere', discord: 'discord', feedback: 'discord', admin: 'admin',
  friends: 'autres', pubdecks: 'autres', import: 'autres', names: 'autres', testeurs: 'autres', 'scan-report': 'autres' };
/** Famille d'une requête d'après son chemin seulement (quelques comparaisons de chaînes). /api/… inconnu : CardTrader (relais, recherches) ou l'historique des prix. */
export function reqFam(p) {
  p = String(p || '/');
  if (p.startsWith('/api/')) { const s = p.slice(5), i = s.indexOf('/'), k = i < 0 ? s : s.slice(0, i); return API_FAM[k] || 'prix'; }
  if (p === '/admin' || p.startsWith('/admin/')) return 'admin';
  if (p.startsWith('/__/')) return 'autres';      // relais de la connexion Google
  return 'page';      // page, fichiers, catalogues, /__ping, QR imprimés
}

/** Compteur de requêtes : hit(famille) à chaque requête ; snap() → { win, fams, total, peak: { n, at }, since, all }. now injectable (tests). */
export function reqMeter(now = Date.now) {
  const F = REQ_FAMS.length, S = 60, M = 60;
  const secAt = new Float64Array(S).fill(-1), sec = new Uint32Array(S * F);      // case i : la seconde secAt[i], une colonne par famille
  const minAt = new Float64Array(M).fill(-1), min = new Uint32Array(M);      // case j : la minute minAt[j], toutes familles
  const since = now(); let all = 0;
  return {
    hit(fam) {
      const f = FAM_IX[fam] ?? FAM_IX.autres, t = now(), s = Math.floor(t / 1000), i = s % S, m = Math.floor(t / 60e3), j = m % M;
      if (secAt[i] !== s) { secAt[i] = s; sec.fill(0, i * F, i * F + F); }
      sec[i * F + f]++;
      if (minAt[j] !== m) { minAt[j] = m; min[j] = 0; }
      min[j]++; all++;
    },
    snap() {
      const t = now(), s = Math.floor(t / 1000), m = Math.floor(t / 60e3), fams = {};
      for (const f of REQ_FAMS) fams[f] = 0;
      for (let i = 0; i < S; i++) if (secAt[i] > s - S && secAt[i] <= s) for (let f = 0; f < F; f++) fams[REQ_FAMS[f]] += sec[i * F + f];
      const total = Object.values(fams).reduce((a, b) => a + b, 0);
      let peak = { n: total, at: t };      // la fenêtre en cours compte aussi
      for (let j = 0; j < M; j++) if (minAt[j] > m - M && minAt[j] <= m && min[j] > peak.n) peak = { n: min[j], at: minAt[j] * 60e3 };
      return { win: Math.min(60, Math.max(1, Math.round((t - since) / 1000))), fams, total, peak, since, all };
    },
  };
}

/** Processeur et boucle d'événements, relevés par minute (une minuterie unref) ; snap() → { cpu, lag, cpuMax, lagMax, n } (minute écoulée, pire de l'heure). */
export function loadMeter({ every = 60e3, keep = 60 } = {}) {
  let h = null; try { h = monitorEventLoopDelay({ resolution: 20 }); h.enable(); } catch (e) { h = null; }      // absent (vieux Node) : seulement le processeur
  let cpu0 = process.cpuUsage(), t0 = process.hrtime.bigint();
  const ring = [];
  const take = () => {
    const c = process.cpuUsage(cpu0), t = process.hrtime.bigint(), wall = Number(t - t0) / 1e3;      // microsecondes
    const r = { at: Date.now(), cpu: wall > 0 ? Math.round((c.user + c.system) / wall * 1000) / 10 : 0, lag: h ? Math.round(h.percentile(99) / 1e5) / 10 : 0, lagMax: h ? Math.round(h.max / 1e5) / 10 : 0 };
    return { r, reset: () => { cpu0 = process.cpuUsage(); t0 = t; if (h) h.reset(); } };
  };
  const timer = setInterval(() => { const { r, reset } = take(); reset(); ring.push(r); if (ring.length > keep) ring.shift(); }, every);
  if (timer.unref) timer.unref();
  return {
    snap() {
      const last = ring.length ? ring[ring.length - 1] : take().r;      // pas encore une minute : depuis le démarrage
      return { cpu: last.cpu, lag: last.lag, lagMax: last.lagMax, cpuMax: Math.max(last.cpu, ...ring.map(x => x.cpu)), lagHour: Math.max(last.lag, ...ring.map(x => x.lag)), n: ring.length, every };
    },
    stop() { clearInterval(timer); if (h) h.disable(); },
  };
}

/** Dossier parcouru (sous-dossiers compris, 20 000 entrées et 8 niveaux au plus) → { exists, files, bytes, oldest, newest, cut }. oldest : la plus
 *  ancienne date de création (sinon de modification) d'un fichier : un dossier vidé à chaque déploiement n'a que des fichiers récents. */
export async function dirStat(dir, { max = 20000, depth = 8 } = {}) {
  const out = { exists: false, files: 0, bytes: 0, oldest: 0, newest: 0, cut: false };
  try { if (!(await stat(dir)).isDirectory()) return out; } catch (e) { return out; }
  out.exists = true;
  let seen = 0;
  const walk = async (d, lv) => {
    let es; try { es = await readdir(d, { withFileTypes: true }); } catch (e) { return; }
    for (const e of es) {
      if (++seen > max) { out.cut = true; return; }
      const f = join(d, e.name);
      if (e.isDirectory()) { if (lv < depth) await walk(f, lv + 1); continue; }
      if (!e.isFile()) continue;
      try {
        const s = await stat(f), born = Math.min(s.mtimeMs, s.birthtimeMs > 0 ? s.birthtimeMs : Infinity);
        out.files++; out.bytes += s.size;
        if (!out.oldest || born < out.oldest) out.oldest = Math.round(born);
        if (s.mtimeMs > out.newest) out.newest = Math.round(s.mtimeMs);
      } catch (err) { /* effacé entre-temps */ }
    }
  };
  await walk(dir, 0);
  return out;
}

/** Plafond de mémoire du processus en octets, et d'où il vient : SERVER_MEM_MB (réglé à la main d'après l'offre de l'hébergeur), sinon la limite du cgroup
 *  (v2 : memory.max, v1 : memory.limit_in_bytes) quand elle est plus petite que la mémoire de la machine ; sinon { bytes: 0 } (inconnu). Lu une fois. */
let MEM_LIM = null;
export function memLimit(env = process.env) {
  if (MEM_LIM) return MEM_LIM;
  const mb = Number(env.SERVER_MEM_MB);
  if (mb > 0) return (MEM_LIM = { bytes: Math.round(mb * 1048576), from: 'env' });
  for (const f of ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes']) {
    try { const v = Number(readFileSync(f, 'utf8').trim()); if (v > 0 && v < totalmem()) return (MEM_LIM = { bytes: v, from: 'cgroup' }); } catch (e) { /* absent ou « max » */ }
  }
  return (MEM_LIM = { bytes: 0, from: '' });
}

/** Mémoire du processus en octets : rss, tas utilisé / réservé / plafond de V8 (au-delà, le processus s'arrête), external (tampons). */
export function memNow() {
  const m = process.memoryUsage();
  let max = 0; try { max = getHeapStatistics().heap_size_limit; } catch (e) { /* inconnu */ }
  return { rss: m.rss, heapUsed: m.heapUsed, heapTotal: m.heapTotal, heapMax: max, external: m.external, buffers: m.arrayBuffers || 0 };
}

/** Niveau d'un taux (0 à 1) : 'ok', 'warn' à partir de warn, 'bad' à partir de bad ; inconnu : ''. */
export const level = (x, warn, bad) => (!(x >= 0) || !Number.isFinite(x) ? '' : x >= bad ? 'bad' : x >= warn ? 'warn' : 'ok');
