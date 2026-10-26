/* ── data.js : réseau (Scryfall, CardTrader), cache, pipelines live et démo ─────────────────── */

const CTX = { proxy: false, needsKey: false, needsLogin: false, jobs: false, alerts: false, vapid: "", token: '', appKey: '', idToken: null, off: [], build: '' };      // off : sources coupées par le serveur ('edhrec', 'archidekt') ; build : version de la page qu'il sert (pwa.js)

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal && signal.aborted) return rej(abortErr());
  const t = setTimeout(res, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(t); rej(abortErr()); }, { once: true });
});
function abortErr() { const e = new Error(T('Annulé')); e.name = 'AbortError'; return e; }
function netErr(code, msg, extra) { const e = new Error(msg); e.code = code; Object.assign(e, extra || {}); return e; }

/** File d'attente cadencée : `rate` requêtes/s, `conc` en parallèle, ralentit seule sur 429/503. */
class Limiter {
  constructor({ rate = 6, conc = 4, min = 1, max = 10 } = {}) {
    Object.assign(this, { rate, conc, min, max, queue: [], active: 0, next: 0, count: 0, stamps: [], cool: 0, waitEnd: 0, waitKind: '' });
  }
  /** prio : requête demandée par un geste (aperçu d'une carte…) : passe devant les lectures de fond (collection, catalogue) qui attendent. */
  schedule(fn, signal, prio) {
    return new Promise((res, rej) => {
      const job = { fn, res, rej, signal, prio: !!prio };
      if (prio) { let i = 0; while (i < this.queue.length && this.queue[i].prio) i++; this.queue.splice(i, 0, job); } else this.queue.push(job);
      this.pump();
    });
  }
  pump() {
    while (this.queue.length && this.active < this.conc) {
      const job = this.queue.shift(); this.active++;
      const now = performance.now(); const at = Math.max(now, this.next);
      this.next = at + 1000 / this.rate;
      setTimeout(() => this.run(job), Math.max(0, at - now));
    }
  }
  async run(job) {
    try {
      if (job.signal && job.signal.aborted) throw abortErr();
      const r = await job.fn();
      this.count++; this.stamps.push(performance.now());
      job.res(r);
    } catch (e) { job.rej(e); }
    finally { this.active--; this.pump(); }
  }
  slow() { this.rate = Math.max(this.min, this.rate * 0.5); this.cool = performance.now() + 5000; }
  /** Pause globale : aucune requête de cette file ne part avant `ms` (429 → toutes les requêtes en attente respectent le délai). */
  pause(ms) { this.next = Math.max(this.next, performance.now() + ms); }
  speedUp() { if (performance.now() > this.cool) this.rate = Math.min(this.max, this.rate + 0.3); }
  rps() { const t = performance.now(); this.stamps = this.stamps.filter(s => t - s < 5000); return this.stamps.length / 5; }
}
const limCT = new Limiter({ rate: 6, conc: 5, max: 9 });
const limJob = new Limiter({ rate: 4, conc: 2, min: 2, max: 4 });   // suivi des tâches du serveur (léger : une requête toutes les ~0,7 s)
const limScry = new Limiter({ rate: 1.8, conc: 1, min: 0.5, max: 1.8 }); // Scryfall : /cards/search et /named limités à 2 req/s

const hostOf = u => { try { return new URL(u, typeof location !== 'undefined' ? location.href : 'http://x').host; } catch (e) { return ''; } };
/** Attentes (ms) avant nouvel essai. Scryfall bloque 30 s après un 429 : inutile (et risqué) de réessayer plus vite. */
const BACKOFF = { net: [700, 1400, 2100], scry: [1500, 6000, 31000], cool429: 30000, coolNet: 120000, maxGate: 130000 };
/** Cooldown Scryfall mémorisé (localStorage) : relancer pendant un blocage prolongerait la sanction. */
const SCRY_KEY = 'deckdeal:scry-until';
const scryUntil = () => { try { return Number(localStorage.getItem(SCRY_KEY)) || 0; } catch (e) { return 0; } };
const setScryUntil = t => { try { localStorage.setItem(SCRY_KEY, String(Math.min(t, Date.now() + BACKOFF.maxGate))); } catch (e) { /* stockage indisponible */ } };
const scryLeft = () => Math.max(0, Math.min(scryUntil() - Date.now(), BACKOFF.maxGate));

/** Délai maximal d'une requête Scryfall, réponse comprise : sans lui, une requête pendue bloquait toute la file (une à la fois) sans erreur ni fin. Dépassé → erreur réseau : même ralentissement, mêmes nouveaux essais. Modifiable par les tests. */
const HTTP_TIMEOUT = { scry: 20000 };
/** Signal d'une tentative : suit celui de l'appelant, et coupe la requête si rien n'arrive dans les ms qui suivent arm() (départ de la requête, pas l'attente dans la file ; puis de nouveau pour lire la réponse). Sans AbortSignal.any (absent des WebView avant la 116). late : coupée par le délai. */
function reqTimer(signal, ms) {
  if (!ms) return { late: false, arm: () => signal, end() {} };
  const ctrl = new AbortController(), stop = () => ctrl.abort(), t = { late: false, id: 0 };
  if (signal) { if (signal.aborted) ctrl.abort(); else signal.addEventListener('abort', stop, { once: true }); }
  t.arm = () => { clearTimeout(t.id); t.id = setTimeout(() => { t.late = true; ctrl.abort(); }, ms); return ctrl.signal; };
  t.end = () => { clearTimeout(t.id); if (signal) signal.removeEventListener('abort', stop); };
  return t;
}
/** Attente annoncée à l'écran qui lit (onWait) et gardée sur la file (waitEnd : ligne « Scryfall en pause » de la collection). */
function limWait(lim, ms, kind) { lim.waitEnd = Date.now() + ms; lim.waitKind = kind; if (lim.onWait) lim.onWait(ms, kind); }

async function httpJson(lim, url, init, signal, retries = 4, prio = false) {
  const host = hostOf(url), scry = /scryfall/.test(host);
  let n = 0;
  // Coupure passagère (réseau mobile, 429 sans en-têtes CORS, délai dépassé…) : on ralentit puis on retente, sauf si l'appareil est hors ligne.
  const netFail = async (e, timeout) => {
    lim.slow();
    const waits = scry ? BACKOFF.scry : BACKOFF.net;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (n < waits.length && !offline) { const w = waits[n++]; limWait(lim, w, 'net'); await sleep(w, signal); return; }
    if (scry && !offline) setScryUntil(Date.now() + BACKOFF.coolNet); // blocage probable : on évite de marteler à la relance
    throw netErr('network', T('Connexion impossible'), { cause: e, host, offline, timeout });
  };
  for (let a = 0; ;) {
    const tm = reqTimer(signal, scry ? HTTP_TIMEOUT.scry : 0), mine = e => e && e.name === 'AbortError' && tm.late && !(signal && signal.aborted);      // coupée par le délai, pas par l'appelant
    let r;
    try { r = await lim.schedule(() => fetch(url, Object.assign({}, init, { signal: tm.arm() })), signal, prio); }
    catch (e) {
      tm.end();
      if (e.name === 'AbortError' && !mine(e)) throw e;
      await netFail(e, mine(e)); continue;
    }
    try {
      tm.arm();
      if (r.status === 429 || r.status === 503) {
        lim.slow();
        if (a >= (scry ? 2 : retries)) throw netErr('rate', T('Trop de requêtes, réessaie dans un instant'), { status: r.status, host });
        const ra = Number(r.headers.get('retry-after'));
        const wait = r.status === 429 && scry ? (Number.isFinite(ra) && r.headers.has('retry-after') ? Math.min(60000, ra * 1000) : BACKOFF.cool429) : 900 * (a + 1);
        tm.end(); lim.pause(wait); if (scry) setScryUntil(Date.now() + wait); limWait(lim, wait, 'rate');
        await sleep(wait, signal); a++; continue;
      }
      if (r.status === 401 || r.status === 403) {
        let reason = ''; try { const b = await r.json(); reason = (b && b.error) || ''; } catch (e) { /* corps absent */ }
        throw netErr('auth', T('Accès refusé'), { status: r.status, host, reason });   // reason : auth_required · forbidden · bad_token · token_expired · bad_app_key
      }
      if (r.status === 404) throw netErr('404', T('Introuvable'), { status: 404 });
      if (!r.ok) {
        if (r.status >= 500 && a < retries) { tm.end(); await sleep(700 * (a + 1), signal); a++; continue; }
        let detail = '';
        try { const b = await r.json(); const m = b && (b.error || b.message || b.errors); detail = m ? (typeof m === 'string' ? m : JSON.stringify(m)).slice(0, 160) : ''; } catch (e) { /* corps absent */ }
        throw netErr('http', detail ? T('Erreur {status} : {detail}', { status: r.status, detail }) : T('Erreur {status}', { status: r.status }), { status: r.status, host, detail });
      }
      lim.speedUp();
      return await r.json();
    } catch (e) { if (!mine(e)) throw e; }                 // réponse coupée en cours de lecture par le délai : comme une coupure
    finally { tm.end(); }
    await netFail(new Error('timeout'), true);
  }
}

/* ── Cache (IndexedDB, repli mémoire) ─────────────────────────────────────────────────────── */
const Cache = (() => {
  const mem = new Map(); let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise(res => {
      try {
        if (typeof indexedDB === 'undefined') return res(null);
        const r = indexedDB.open('deckdeal', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('kv');
        r.onsuccess = () => res(r.result); r.onerror = () => res(null); r.onblocked = () => res(null);
      } catch (e) { res(null); }
    });
    return dbp;
  }
  // noMem : gros texte relu de l'appareil quand il sert (catalogue de toutes les langues, ≈ 7 Mo en mémoire), jamais gardé ici ; set renvoie alors true une fois écrit
  async function get(k, maxAge, noMem) {
    const m = mem.get(k); if (m && Date.now() - m.t < maxAge) return m.v;
    const d = await db(); if (!d) return null;
    return new Promise(res => {
      try {
        const rq = d.transaction('kv').objectStore('kv').get(k);
        rq.onsuccess = () => { const v = rq.result; if (v && Date.now() - v.t < maxAge) { if (!noMem) mem.set(k, v); res(v.v); } else res(null); };
        rq.onerror = () => res(null);
      } catch (e) { res(null); }
    });
  }
  async function set(k, v, noMem) {
    const rec = { v, t: Date.now() }; if (noMem) mem.delete(k); else mem.set(k, rec);
    const d = await db(); if (!d) return false;
    if (!noMem) { try { d.transaction('kv', 'readwrite').objectStore('kv').put(rec, k); } catch (e) { /* quota */ } return true; }
    return new Promise(res => {
      try { const tx = d.transaction('kv', 'readwrite'); tx.objectStore('kv').put(rec, k); tx.oncomplete = () => res(true); tx.onerror = tx.onabort = () => res(false); } catch (e) { res(false); }      // quota : rien d'écrit
    });
  }
  async function clear() {
    mem.clear(); const d = await db(); if (!d) return;
    try { d.transaction('kv', 'readwrite').objectStore('kv').clear(); } catch (e) { /* ignore */ }
  }
  return { get, set, clear };
})();
const DAY = 86400000;

/* ── Scryfall : toutes les impressions papier d'une carte ─────────────────────────────────── */
const imgOf = c => (c.image_uris && c.image_uris.small) || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris && c.card_faces[0].image_uris.small) || null;

/** Données de la carte (communes à toutes ses impressions) : coût converti, coût de mana, type, couleurs — pour le deck viewer. */
const eurOf = c => ({ eu: eurCents(c.prices && c.prices.eur), ef: eurCents(c.prices && c.prices.eur_foil) });   // prix de référence Cardmarket (euros → centimes), null si Scryfall n'en a pas
const metaOf = c => { const f0 = (c.card_faces && c.card_faces[0]) || {}; return { cmc: Number.isFinite(c.cmc) ? c.cmc : 0, mc: String(c.mana_cost || f0.mana_cost || '').slice(0, 60), tl: String(c.type_line || '').slice(0, 120), cl: (c.colors || f0.colors || []).join('') }; };

async function scryPrints(name, signal, exactDone = false) { // exactDone : la recherche exacte a déjà eu lieu dans un lot réussi → inutile de la refaire
  const search = async n => {
    const q = '!"' + n.replace(/"/g, '') + '" game:paper';
    let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=released&include_extras=true&include_variations=true';
    const out = [];
    while (url && out.length < 600) {
      let j;
      try { j = await httpJson(limScry, url, { headers: { Accept: 'application/json' } }, signal); }
      catch (e) { if (e.code === '404') return out; throw e; }
      for (const c of j.data || []) {
        if (c.oversized || c.set_type === 'memorabilia') continue;
        out.push({ id: c.id, set: c.set, setName: c.set_name, num: c.collector_number, img: imgOf(c), name: c.name, ...eurOf(c), ...metaOf(c) });
      }
      url = j.has_more ? j.next_page : null;
    }
    return out;
  };
  let prints = exactDone ? [] : await search(name);
  if (!prints.length) { // nom approximatif (virgule oubliée, accent…) : on demande à Scryfall le nom exact
    try {
      const j = await httpJson(limScry, 'https://api.scryfall.com/cards/named?fuzzy=' + encodeURIComponent(name), { headers: { Accept: 'application/json' } }, signal);
      if (j && j.name) prints = await search(j.name);
    } catch (e) { if (e.name === 'AbortError' || e.code === 'network') throw e; }
  }
  return prints;
}

/** Plusieurs cartes en une seule recherche : (!"A" or !"B" …). Retourne Map(clé de deck → impressions) ; une carte
 *  absente du résultat n'est pas dans la Map (l'appelant la cherche alors seule, avec repli sur le nom approchant). */
const SCRY_JSON = { headers: { Accept: 'application/json' } };
const SCRY_BATCH = { names: 12, chars: 800, pages: 14 };
async function scryPrintsBatch(cards, signal) {
  const q = '(' + cards.map(c => '!"' + c.name.replace(/"/g, '') + '"').join(' or ') + ') game:paper';
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=released&include_extras=true&include_variations=true';
  // nom de face (normalisé) → clés de deck concernées : « Fire // Ice », « Fire » ou « Ice » retombent tous sur la bonne carte
  const byFace = new Map();
  for (const c of cards) for (const f of new Set([c.key, frontName(c.key)])) { const a = byFace.get(f); if (a) a.push(c.key); else byFace.set(f, [c.key]); }
  const keysOf = name => {
    const out = new Set();
    for (const f of [normName(name), ...String(name).split('//').map(normPart)]) for (const k of byFace.get(f) || []) out.add(k);
    return out;
  };
  const got = new Map();
  for (let pages = 1; url; pages++) {
    if (pages > SCRY_BATCH.pages) throw netErr('batch', T('Lot trop volumineux')); // résultats tronqués : on se replie sur la recherche carte par carte
    let j;
    try { j = await httpJson(limScry, url, SCRY_JSON, signal); }
    catch (e) { if (e.code === '404') break; throw e; }
    for (const c of j.data || []) {
      if (c.oversized || c.set_type === 'memorabilia') continue;
      const pr = { id: c.id, set: c.set, setName: c.set_name, num: c.collector_number, img: imgOf(c), name: c.name, ...eurOf(c), ...metaOf(c) };
      for (const k of keysOf(c.name)) { let a = got.get(k); if (!a) got.set(k, a = []); if (a.length < 600) a.push(pr); }
    }
    url = j.has_more ? j.next_page : null;
  }
  return got;
}
/** Découpe en lots : ≤ 12 noms et ≤ 800 caractères de requête (l'URL reste courte). */
function scryChunks(cards) {
  const out = []; let cur = [], len = 0;
  for (const c of cards) {
    const l = c.name.length + 8;
    if (cur.length && (cur.length >= SCRY_BATCH.names || len + l > SCRY_BATCH.chars)) { out.push(cur); cur = []; len = 0; }
    cur.push(c); len += l;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Image de carte en grand, dans la langue de l'offre (Scryfall ne l'a pas toujours : repli sur l'anglais, signalé par `missing`). */
const SCRY_LANG = { fr: 'fr', en: 'en', de: 'de', es: 'es', it: 'it', pt: 'pt', jp: 'ja', kr: 'ko', ru: 'ru', 'zh-CN': 'zhs', 'zh-TW': 'zht' };
const bigOf = u => u && (u.large || u.normal || u.small);
const facesOf = c => c.image_uris ? [bigOf(c.image_uris)].filter(Boolean) : (c.card_faces || []).map(f => bigOf(f.image_uris)).filter(Boolean);
async function scryImage({ set, num, lang }, signal) {
  const sl = SCRY_LANG[lang] || 'en';
  if (!set || !num) return null;
  const key = 'im:' + set + ':' + num + ':' + sl;
  const hit = await Cache.get(key, 7 * DAY); if (hit) return hit;
  const base = 'https://api.scryfall.com/cards/' + encodeURIComponent(set) + '/' + encodeURIComponent(num);
  const get = async l => {
    try { const j = await httpJson(limScry, base + (l === 'en' ? '' : '/' + l), SCRY_JSON, signal, 4, true); const urls = facesOf(j); return urls.length ? { urls, lang: j.lang || l } : null; }
    catch (e) { if (e.code === '404') return null; throw e; }
  };
  let r = await get(sl);
  if (!r && sl !== 'en') { r = await get('en'); if (r) r.missing = sl; }
  if (r) await Cache.set(key, r);
  return r;
}

/** Une impression par son extension et son numéro (ligne du bas lue au scan) : { name (anglais), printed (nom imprimé dans sa langue), lang (code Scryfall), set, num, img (petite image) },
 *  null si Scryfall ne la connaît pas. lang (langue de l'appli) : l'impression dans cette langue, à défaut l'anglaise ; '' : l'anglaise. Gardée 30 jours (une impression ne change pas). */
async function scryBySetNum(set, num, lang, signal) {
  const sl = lang ? SCRY_LANG[lang] || '' : '', s = String(set || '').toLowerCase(), n = String(num || '').toLowerCase();
  if (!/^[a-z0-9]{2,6}$/.test(s) || !/^[0-9a-z★-]{1,8}$/.test(n)) return null;
  const key = 'sn:' + s + ':' + n + ':' + (sl || 'en');
  const hit = await Cache.get(key, 30 * DAY); if (hit) return hit.none ? null : hit;
  const base = 'https://api.scryfall.com/cards/' + encodeURIComponent(s) + '/' + encodeURIComponent(n);
  const get = async l => { try { return await httpJson(limScry, base + (l && l !== 'en' ? '/' + l : ''), SCRY_JSON, signal, 4, true); } catch (e) { if (e.code === '404') return null; throw e; } };
  let j = await get(sl); if ((!j || !j.name) && sl && sl !== 'en') j = await get('');
  const f0 = j && Array.isArray(j.card_faces) ? j.card_faces[0] || {} : {}, iu = (j && j.image_uris) || f0.image_uris || {};
  const r = j && j.name ? { name: j.name, printed: j.printed_name || f0.printed_name || (j.lang === 'en' || !j.lang ? j.name : ''), lang: j.lang || 'en', set: j.set || s, num: j.collector_number || n, img: iu.small || '' } : null;
  await Cache.set(key, r || { none: 1 });
  return r;
}

/** Toutes les impressions papier d'une carte dans une langue, les plus récentes d'abord : [{ set, num, sn (extension), y (année), th (vignette), urls (grande image de chaque face), fx (particularités),
 *  eu / ef (prix Cardmarket de l'édition, non foil / foil, centimes, null si inconnu), r (rareté) }]. [] si Scryfall n'en a pas dans cette langue. Gardées 2 jours (les prix suivent). */
async function scryArtPrints(name, lang, signal, prio = true) {      // prio : devant les lectures de fond (écran qui attend) ; false : dans la file (scan)
  const sl = SCRY_LANG[lang] || 'en', n = String(name || '').split('//')[0].trim();
  if (!n || n.includes('"')) return [];
  const key = (BASIC_NAMES.has(ownKey(n)) ? 'pr5:' : 'pr4:') + ownKey(n) + ':' + sl, hit = await Cache.get(key, 2 * DAY); if (hit) return hit;
  const out = await scryPrintsIn(n, sl, signal, prio);
  if (sl !== 'en') {
    const en = await scryPrintsIn(n, 'en', signal, prio), by = new Map(en.map(p => [p.set + '/' + p.num, p])), have = new Set(out.map(p => p.set + '/' + p.num));
    for (const p of out) { const e = by.get(p.set + '/' + p.num); if (e) { p.eu = e.eu; p.ef = e.ef; } }      // Scryfall ne chiffre que l'impression anglaise : la tendance Cardmarket est celle de l'édition, toutes langues confondues
    for (const p of en) if (!have.has(p.set + '/' + p.num)) out.push({ ...p, l: 'en', fx: [...p.fx, T('anglais')] });      // impressions qui n'existent qu'en anglais (promos, séries spéciales…) : après celles de la langue affichée, marquées « anglais »
  }
  await Cache.set(key, out);
  return out;
}
/** Impressions d'une carte cherchées sur Scryfall d'après la recherche « Chercher une extension » quand la liste lue n'en a aucune (liste tronquée : terrains de
 *  base aux centaines d'impressions) : chaque mot qui ressemble à un code d'extension (« neo ») ou à un numéro (« 295 », « 295a ») devient set:… ou cn:… ;
 *  langue de la carte, puis anglais (impressions marquées « anglais » comme dans scryArtPrints), puis toutes langues (impression d'une seule langue : « JP »). [] : rien à chercher ou rien trouvé. */
async function scryPrintsFind(name, lang, q, signal) {
  const sl = SCRY_LANG[lang] || 'en', n = String(name || '').split('//')[0].trim(), w = String(q || '').toLowerCase().split(/[\s,#·]+/).filter(Boolean);
  if (!n || n.includes('"') || !w.length || w.length > 4) return [];
  const sets = w.filter(x => /^[a-z0-9]{2,6}$/.test(x) && /[a-z]/.test(x)), nums = w.filter(x => /^\d{1,4}[a-z★]?$/.test(x));
  if (!sets.length && !nums.length) return [];
  const crit = ' ' + [sets.length ? '(' + sets.map(x => 'set:' + x).join(' or ') + ')' : '', nums.length ? '(' + nums.map(x => 'cn:' + x).join(' or ') + ')' : ''].filter(Boolean).join(' ');
  const out = await scryPrintsIn(n, sl, signal, true, crit, 1), have = new Set(out.map(p => p.set + '/' + p.num));
  if (sl !== 'en') for (const p of await scryPrintsIn(n, 'en', signal, true, crit, 1)) if (!have.has(p.set + '/' + p.num)) { have.add(p.set + '/' + p.num); out.push({ ...p, l: 'en', fx: [...p.fx, T('anglais')] }); }
  // impressions d'une seule autre langue (terrain plein art NEO 295 : japonais seulement) : toutes langues, marquées de leur langue (« JP »)
  const back = Object.fromEntries(Object.entries(SCRY_LANG).map(([a, s]) => [s, a]));
  for (const p of await scryPrintsIn(n, 'any', signal, true, crit, 1)) if (!have.has(p.set + '/' + p.num)) { have.add(p.set + '/' + p.num); out.push({ ...p, fx: [...p.fx, langCode(back[p.l] || p.l)] }); }
  return out;
}
async function scryPrintsIn(n, sl, signal, prio = true, extra = '', maxPages = 0) {      // extra : critères en plus (scryPrintsFind : « (set:neo or cn:295) »)
  let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent('!"' + n + '" lang:' + sl + ' game:paper' + extra) + '&unique=prints&order=released&dir=desc&include_variations=true';      // variantes comprises (terrains plein art d'une même extension…)
  const out = [], seen = new Set();
  const pages = maxPages || (BASIC_NAMES.has(ownKey(n)) ? 8 : 3);      // terrains de base : des centaines d'impressions (toutes, pour les retrouver par extension)
  for (let pg = 0; url && pg < pages; pg++) {
    let j; try { j = await httpJson(limScry, url, SCRY_JSON, signal, 4, prio); } catch (e) { if (e.code === '404') j = { data: [] }; else throw e; }
    for (const c of j.data || []) {
      const urls = facesOf(c), im = c.image_uris || (c.card_faces && c.card_faces[0] && c.card_faces[0].image_uris) || {}, id = c.set + '/' + c.collector_number;
      if (!urls.length || seen.has(id)) continue; seen.add(id);
      const fe = c.frame_effects || [], fx = [c.full_art ? T('plein art') : '', c.border_color === 'borderless' ? T('sans bordure') : '', fe.includes('extendedart') ? T('étendue') : '', fe.includes('showcase') ? 'showcase' : '', c.promo ? 'promo' : ''].filter(Boolean);
      out.push({ set: c.set, num: c.collector_number, sn: c.set_name || '', y: String(c.released_at || '').slice(0, 4), th: im.small || urls[0], urls, fx, l: sl === 'any' ? c.lang || 'en' : sl, ...eurOf(c), r: c.rarity || '' });
    }
    url = j.has_more ? j.next_page : '';
  }
  return out;
}

/** Infos Scryfall d'une liste de cartes par leur nom (75 par requête) : Map(clé de collection → { cm, mc, tl, cl, ci, cd, im, eu, ar, rr, lg, la } | null si inconnue). ar : artiste de l'illustration (crédit des orbes de l'accueil) ;
 *  rr : rareté de l'impression que Scryfall renvoie pour ce nom (filtre « Rareté » des cartes sans édition, search.js). */
async function scryCollection(names, signal, onProgress, prio = false) {
  const out = new Map(), uniq = [...new Map(names.map(n => [ownKey(n), n])).entries()];
  for (let i = 0; i < uniq.length; i += 75) {
    const chunk = uniq.slice(i, i + 75);
    const body = JSON.stringify({ identifiers: chunk.map(([, n]) => ({ name: String(n).split('//')[0].trim() })) });
    const j = await httpJson(limScry, 'https://api.scryfall.com/cards/collection', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body }, signal, 4, prio);
    for (const c of j.data || []) { const m = metaOf(c); out.set(ownKey(c.name), { cm: m.cmc, mc: m.mc, tl: m.tl, cl: m.cl, ci: (c.color_identity || []).join(''), cd: canBeCommander(c), im: imgOf(c) || '', eu: eurCents(c.prices && c.prices.eur), ef: eurCents(c.prices && c.prices.eur_foil), ar: c.artist || '', rr: String(c.rarity || '').slice(0, 12), lg: lgOf(c.legalities), la: Math.floor(Date.now() / 864e5) }); }      // ef : prix foil (exemplaires foil sans édition) ; lg, la : formats où elle est légale, jour de la lecture (filtre « Format »)
    for (const [k] of chunk) if (!out.has(k)) out.set(k, null);
    if (onProgress) onProgress(Math.min(uniq.length, i + 75), uniq.length);
  }
  return out;
}
/** Éditions précises ('cmm|400' : code d'extension et numéro de collection, 75 par requête) : Map(édition → { eu, ef (prix Cardmarket non foil / foil, centimes, null si inconnu),
 *  im (petite image anglaise), sn (nom de l'extension), r (rareté) } | null si Scryfall ne la connaît pas). */
async function scryEditions(eds, signal, onProgress) {
  const out = new Map(), uniq = [...new Set((eds || []).filter(Boolean))];
  for (let i = 0; i < uniq.length; i += 75) {
    const chunk = uniq.slice(i, i + 75);
    const body = JSON.stringify({ identifiers: chunk.map(e => ({ set: edSet(e), collector_number: edNum(e) })) });
    const j = await httpJson(limScry, 'https://api.scryfall.com/cards/collection', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body }, signal);
    for (const c of j.data || []) { const e = edKey(c.set, c.collector_number); if (e) out.set(e, { ...eurOf(c), im: imgOf(c) || '', sn: String(c.set_name || '').slice(0, 80), r: c.rarity || '' }); }
    for (const e of chunk) if (!out.has(e)) out.set(e, null);
    if (onProgress) onProgress(Math.min(uniq.length, i + 75), uniq.length);
  }
  return out;
}
/** Petites images d'éditions précises ('cmm|400') dans une autre langue que l'anglais : Map(édition → url, '' si Scryfall n'a pas cette impression dans cette langue).
 *  Une recherche pour 25 éditions au plus (« (set:cmm cn:400 or …) lang:fr », ≤ 900 caractères) : /cards/collection ne prend pas de langue. */
async function scryEdLangImages(eds, lang, signal, prio = false) {
  const sl = SCRY_LANG[lang], out = new Map();
  if (!sl || sl === 'en') return out;
  const uniq = [...new Set((eds || []).filter(e => edKey(edSet(e), edNum(e))))], cn = n => (/^[0-9a-z]+$/i.test(n) ? n : '"' + n.replace(/"/g, '') + '"'), chunks = [];
  let cur = [], len = 0;
  for (const e of uniq) { const t = '(set:' + edSet(e) + ' cn:' + cn(edNum(e)) + ')'; if (cur.length && (cur.length >= 25 || len + t.length + 4 > 900)) { chunks.push(cur); cur = []; len = 0; } cur.push([e, t]); len += t.length + 4; }
  if (cur.length) chunks.push(cur);
  for (const ch of chunks) {
    const by = new Map(ch.map(([e]) => [edNorm(e), e])), q = '(' + ch.map(x => x[1]).join(' or ') + ') lang:' + sl;
    let j; try { j = await httpJson(limScry, 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&include_extras=true&include_variations=true', SCRY_JSON, signal, 4, prio); }
    catch (e) { if (e.code === '404') j = { data: [] }; else throw e; }
    for (const c of j.data || []) { const e = by.get(edNorm(edKey(c.set, c.collector_number))), u = imgOf(c); if (e && u && (!c.lang || c.lang === sl)) out.set(e, u); }
    for (const [e] of ch) if (!out.has(e)) out.set(e, '');
  }
  return out;
}
/** Parmi ces noms, les cartes imprimées une seule fois en papier (Scryfall « paperprints=1 », ≈ 30 noms par requête) :
 *  { found: Map(clé → { set, num, eu, ef, im, sn, r }), seen: Set(clés lues) }. Une carte présente deux fois dans la réponse est écartée (prudence). */
async function scrySolo(names, signal) {
  const found = new Map(), seen = new Set(), uniq = [...new Map(names.map(n => [ownKey(n), String(n).replace(/"/g, '')])).entries()], chunks = [];
  let cur = [], len = 0;
  for (const e of uniq) { const l = e[1].length + 8; if (cur.length && (cur.length >= 30 || len + l > 1200)) { chunks.push(cur); cur = []; len = 0; } cur.push(e); len += l; }
  if (cur.length) chunks.push(cur);
  for (const ch of chunks) {
    const q = '(' + ch.map(([, n]) => '!"' + n + '"').join(' or ') + ') paperprints=1 game:paper', cnt = new Map(), info = new Map();
    let url = 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=prints&order=name';
    for (let pg = 0; url && pg < 3; pg++) {
      let j; try { j = await httpJson(limScry, url, SCRY_JSON, signal); } catch (e) { if (e.code === '404') break; throw e; }
      for (const c of j.data || []) { const k = ownKey(c.name); cnt.set(k, (cnt.get(k) || 0) + 1); info.set(k, { set: c.set, num: c.collector_number, ...eurOf(c), im: imgOf(c) || '', sn: String(c.set_name || '').slice(0, 80), r: c.rarity || '' }); }
      url = j.has_more ? j.next_page : '';
    }
    for (const [k] of ch) { seen.add(k); if (cnt.get(k) === 1 && edKey(info.get(k).set, info.get(k).num)) found.set(k, info.get(k)); }
  }
  return { found, seen };
}
/** Tous les noms de cartes (anglais) : sert à reconnaître un nom lu par OCR. Gardé 14 jours sur l'appareil (~1 Mo). */
async function scryCatalogNames(signal) {
  const hit = await Cache.get('sc:names', 14 * DAY); if (hit && hit.length > 1000) return hit;
  const j = await httpJson(limScry, 'https://api.scryfall.com/catalog/card-names', SCRY_JSON, signal, 4, true);      // attendu à l'écran (saisie, scan) : devant les lectures de fond
  const list = Array.isArray(j && j.data) ? j.data.filter(x => typeof x === 'string') : [];
  if (list.length > 1000) await Cache.set('sc:names', list);
  return list;
}
/** Cartes imprimées en langue `lang` dont le nom contient ces mots (2 au plus, lettres seules) : [{ name (anglais), printed }]. Expérimental : sert aux cartes françaises. */
async function scryForeign(words, lang, signal) {
  const w = (words || []).map(x => String(x).replace(/[^\p{L}]/gu, '')).filter(x => x.length >= 3).slice(0, 2);
  if (!w.length) return [];
  const q = 'lang:' + lang + ' ' + w.map(x => 'name:' + x).join(' ');
  let j;
  try { j = await httpJson(limScry, 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=cards&order=name', SCRY_JSON, signal); }
  catch (e) { if (e.code === '404') return []; throw e; }
  return (j.data || []).slice(0, 30).map(c => ({ name: c.name, printed: c.printed_name || c.name, img: imgOf(c) || '' }));
}
/* ── Catalogue des noms français (reconnaissance des cartes françaises, hors ligne et tolérante aux fautes de lecture) ──────────
   Scryfall n'a pas de liste de noms imprimés : on parcourt la recherche « lang:fr » (175 cartes par page, ~180 pages (≈ 31 000 cartes mesurées), 2 requêtes/s). Fait une seule fois,
   gardé sur l'appareil (« nom imprimé \t nom anglais \t image », ~2,5 Mo), repris là où il en était si interrompu, puis complété des nouveautés tous les 14 jours. */
const FR_KEY = 'sc:fr', FR_PART = 'sc:fr:part', FR_FRESH = 14 * DAY, FR_PAGES = 180, FR_STATIC = 'fr-names.tsv';
// Autres langues (l : code de l'appli, de es it pt) : même catalogue, sous sa propre clé et son propre fichier (names-de.tsv…) ; le français garde les siens (rien à retélécharger).
const nmKey = l => (!l || l === 'fr' ? FR_KEY : 'sc:nm:' + l), nmPart = l => (!l || l === 'fr' ? FR_PART : 'sc:nm:' + l + ':part'), nmFile = l => (!l || l === 'fr' ? FR_STATIC : 'names-' + (SCRY_LANG[l] || l) + '.tsv');
/** Une carte Scryfall imprimée en français (sl : autre langue Scryfall) → « nom imprimé \t nom anglais \t image » (image : chemin après /small/, sans paramètre), ou '' sans nom imprimé. */
function frRow(c, sl = 'fr') {
  if (!c || (c.lang && c.lang !== sl)) return '';
  const f = c.card_faces || [], p = c.printed_name || (f.length > 1 && f.every(x => x.printed_name) ? f.map(x => x.printed_name).join(' // ') : '');      // carte double sans nom traduit chez Scryfall : ignorée (l'anglais n'est pas une traduction)
  if (!p || !c.name) return '';
  const u = imgOf(c) || '', m = /\/small\/([^?]+)/.exec(u);
  return p + '\t' + c.name + '\t' + (m ? m[1] : '');
}
const frRowKey = r => r.split('\t').slice(0, 2).join('\t');
/** Suit les pages d'une recherche (next_page) : onPage(lignes de la page, total annoncé, page suivante) après chaque page. Retourne toutes les lignes. */
async function scryFrPages(url, signal, onPage, sl = 'fr') {
  const rows = [];
  while (url) {
    let j; try { j = await httpJson(limScry, url, SCRY_JSON, signal); } catch (e) { if (e.code === '404') break; throw e; }   // 404 : aucune carte (mise à jour sans nouveauté)
    const got = (j.data || []).map(c => frRow(c, sl)).filter(Boolean); for (const r of got) rows.push(r);
    url = j.has_more && typeof j.next_page === 'string' && /^https:\/\/api\.scryfall\.com\//.test(j.next_page) ? j.next_page : '';
    if (onPage) await onPage(got, j.total_cards || 0, url);
  }
  return rows;
}
const frSearchUrl = q => 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=cards&order=name';
/** Catalogue français (l : autre langue) sur l'appareil, s'il est complet : { rows, at } ou null. */
async function scryFrCached(l = 'fr') { const c = await Cache.get(nmKey(l), 3650 * DAY); return c && Array.isArray(c.rows) && c.rows.length > 500 ? c : null; }
/** Catalogue prêt à l'emploi servi par le site (fr-names.tsv, régénéré chaque semaine par GitHub Actions : mêmes lignes « imprimé \t anglais \t image », ≈ 1,3 Mo compressé) :
 *  1 requête au lieu de ≈ 180 chez Scryfall. null s'il manque ou s'il est trop court (appli ouverte hors http, fichier pas encore généré) → on pagine chez Scryfall. */
async function scryFrStatic(signal, l = 'fr') {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return null;
  let r; try { r = await fetch(new URL(nmFile(l), location.href).href, { signal, cache: 'no-cache' }); } catch (e) { if (e.name === 'AbortError') throw e; return null; }
  if (!r.ok) return null;
  let t; try { t = await r.text(); } catch (e) { if (e.name === 'AbortError') throw e; return null; }
  const rows = t.split('\n').map(l => l.replace(/\r$/, '')).filter(l => l && l[0] !== '#' && l.split('\t').length >= 2);
  if (rows.length < 500) return null;
  const rec = { rows, at: Date.now() }; await Cache.set(nmKey(l), rec); await Cache.set(nmPart(l), null); return rec;
}
/** Télécharge (ou reprend, ou met à jour) le catalogue : retourne { rows, at }. onProgress(fait, total). Une mise à jour qui échoue garde l'ancien catalogue. */
async function scryFrCatalog(signal, onProgress, l = 'fr') {
  const sl = SCRY_LANG[l] || 'fr', hit = await scryFrCached(l);
  if (hit && Date.now() - hit.at < FR_FRESH) return hit;
  const pre = await scryFrStatic(signal, l); if (pre) return pre;                     // fichier du site d'abord (rapide), Scryfall seulement s'il manque
  if (hit) {
    const since = new Date(hit.at - 30 * DAY).toISOString().slice(0, 10);          // nouveautés : impressions françaises sorties depuis le dernier passage (30 jours de marge)
    try {
      const add = await scryFrPages(frSearchUrl('lang:' + sl + ' date>=' + since), signal, null, sl);
      const by = new Map(hit.rows.map(r => [frRowKey(r), r])); for (const r of add) by.set(frRowKey(r), r);
      const rec = { rows: [...by.values()], at: Date.now() }; await Cache.set(nmKey(l), rec); return rec;
    } catch (e) { if (e.name === 'AbortError') throw e; return hit; }
  }
  const part = await Cache.get(nmPart(l), 30 * DAY);                               // reprise d'un téléchargement interrompu
  let rows = part && Array.isArray(part.rows) ? part.rows : [], url = part && part.next ? part.next : frSearchUrl('lang:' + sl), pages = 0, total = part && part.total || 0;
  if (part && part.next === '') url = '';
  if (url) {
    await scryFrPages(url, signal, async (got, t, next) => {
      for (const r of got) rows.push(r); if (t) total = t; pages++;
      if (onProgress) onProgress(rows.length, total || FR_PAGES * 175);
      if (pages % 8 === 0 && next) await Cache.set(nmPart(l), { rows: rows.slice(), next, total });      // copie : le point de reprise ne grossit pas avec les pages suivantes
    }, sl);
  }
  const seen = new Set(); rows = rows.filter(r => { const k = frRowKey(r); if (seen.has(k)) return false; seen.add(k); return true; });
  if (rows.length < 500) throw netErr('http', l === 'fr' ? T('Catalogue français incomplet') : T('Catalogue des noms incomplet ({lang})', { lang: LANGS[l] || l }));
  const rec = { rows, at: Date.now() }; await Cache.set(nmKey(l), rec); await Cache.set(nmPart(l), null);
  return rec;
}
/* ── Noms imprimés de toutes les langues (scan d'une carte d'une autre langue que celle de l'appli, sans le serveur) : names-all.tsv (gen-names-all.mjs),
   « anglais \t fr \t de \t es \t it \t pt », ≈ 3,5 Mo de texte, ≈ 1,4 Mo compressé. Gardé sur l'appareil (jamais en mémoire : relu quand le scan en a besoin) ; date à part. */
const NA_KEY = 'sc:nm:all', NA_AT = 'sc:nm:all:at', NA_FILE = 'names-all.tsv';
/** Date du fichier gardé sur l'appareil (ms), 0 s'il n'y en a pas. */
async function namesAllAt() { const c = await Cache.get(NA_AT, 3650 * DAY); return c && c.at > 0 ? c.at : 0; }
/** Texte gardé sur l'appareil, ou null. */
/* ── Noms alternatifs (names-flavor.tsv, gen-flavor-names.mjs ; ≈ 40 Ko) : gardés sur l'appareil 14 jours, relus à l'ouverture du scan ── */
const FV_KEY = 'sc:fv', FV_FILE = 'names-flavor.tsv';
/** Lignes du fichier (appareil d'abord, sinon le site ; vieux de 14 jours : relu) ou null. */
async function flavorRows(signal) {
  const c = await Cache.get(FV_KEY, 3650 * DAY);
  if (c && Array.isArray(c.rows) && Date.now() - c.at < 14 * DAY) return c.rows;
  if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol)) {
    try {
      const r = await fetch(new URL(FV_FILE, location.href).href, { signal, cache: 'no-cache' });
      if (r.ok) { const rows = (await r.text()).split('\n').filter(l => l && l.split('\t').length >= 3); if (rows.length >= 100) { await Cache.set(FV_KEY, { rows, at: Date.now() }); return rows; } }
    } catch (e) { if (e.name === 'AbortError') throw e; }
  }
  return c && Array.isArray(c.rows) ? c.rows : null;      // hors ligne : l'ancienne copie
}
async function namesAllText() { const t = await Cache.get(NA_KEY, 3650 * DAY, true); return typeof t === 'string' && t.length > 1000 ? t : null; }
/** Télécharge le fichier du site et le garde : date (ms), ou 0 (absent, illisible, trop court, hors ligne, appareil plein). */
async function namesAllFetch(signal) {
  if (typeof location === 'undefined' || !/^https?:$/.test(location.protocol)) return 0;
  let r; try { r = await fetch(new URL(NA_FILE, location.href).href, { signal, cache: 'no-cache' }); } catch (e) { if (e.name === 'AbortError') throw e; return 0; }
  if (!r.ok) return 0;
  let t; try { t = await r.text(); } catch (e) { if (e.name === 'AbortError') throw e; return 0; }
  if (!/^#[^\n]*\t/.test(t) || t.split('\n', 502).length < 502) return 0;      // 1re ligne : langues des colonnes ; au moins 500 noms (sinon : page d'erreur, fichier tronqué)
  if (!(await Cache.set(NA_KEY, t, true))) return 0;
  const at = Date.now(); await Cache.set(NA_AT, { at }); return at;
}
/** Images (petites) de cartes dans une autre langue que l'anglais : Map(clé de collection → url, '' si Scryfall n'a pas la carte dans cette langue). Une recherche pour 12 noms. */
async function scryLangImages(names, lang, signal, onProgress, prio = false) {
  const sl = SCRY_LANG[lang], out = new Map();
  if (!sl || sl === 'en') return out;
  const uniq = [...new Map(names.map(n => [ownKey(n), String(n).split('//')[0].trim()])).entries()].filter(([, n]) => n && !n.includes('"'));
  for (let i = 0; i < uniq.length; i += 12) {
    const chunk = uniq.slice(i, i + 12), q = '(' + chunk.map(([, n]) => '!"' + n + '"').join(' or ') + ') lang:' + sl;
    let j; try { j = await httpJson(limScry, 'https://api.scryfall.com/cards/search?q=' + encodeURIComponent(q) + '&unique=cards', SCRY_JSON, signal, 4, prio); }
    catch (e) { if (e.code === '404') j = { data: [] }; else throw e; }
    for (const c of j.data || []) { const u = imgOf(c); if (u) out.set(ownKey(c.name), u); }
    for (const [k] of chunk) if (!out.has(k)) out.set(k, '');
    if (onProgress) onProgress(Math.min(uniq.length, i + 12), uniq.length);
  }
  return out;
}

/* ── CardTrader ───────────────────────────────────────────────────────────────────────────── */
async function ct(path, { method = 'GET', params, body, signal, lim = limCT, hdr } = {}) {      // hdr : en-têtes en plus (alertes : jeton Firebase pour le MP Discord)
  if (!CTX.proxy && !CTX.token) throw netErr('notoken', T('Token CardTrader manquant'));
  const qs = params ? '?' + new URLSearchParams(params).toString() : '';
  const url = CTX.proxy ? 'api/' + path + qs : 'https://api.cardtrader.com/api/v2/' + path + qs;
  const call = async force => {
    const headers = { Accept: 'application/json', ...(CTX.proxy && hdr ? hdr : {}) };
    if (CTX.proxy) {
      if (CTX.token && !/^(import|alerts)(\/|$)/.test(path)) headers['x-ct-token'] = CTX.token;  // ton token : seulement là où le serveur interroge CardTrader avec ton compte (relais, recherches) ; ni import ni alertes
      if (CTX.appKey) headers['x-app-key'] = CTX.appKey;
      if (CTX.needsLogin && CTX.idToken) { const t = await CTX.idToken(force); if (t) headers['x-firebase-token'] = t; } // jeton Firebase : le proxy vérifie que c'est bien ton compte
    } else headers.Authorization = 'Bearer ' + CTX.token;
    if (body) headers['Content-Type'] = 'application/json';
    return httpJson(lim, url, { method, headers, body: body ? JSON.stringify(body) : undefined }, signal);
  };
  try { return await call(false); }
  catch (e) { if (e.code === 'auth' && e.reason === 'token_expired' && CTX.idToken) return call(true); throw e; } // jeton périmé : on force son renouvellement, une seule fois
}

async function getExpansions(signal) {
  let list = await Cache.get('ct:expansions', 3 * DAY);
  if (!list) {
    const j = await ct('expansions', { signal });
    list = (Array.isArray(j) ? j : []).filter(e => e.game_id === 1).map(e => ({ id: e.id, code: String(e.code || '').toLowerCase(), name: e.name }));
    await Cache.set('ct:expansions', list);
  }
  return expIndexOf(list);
}
/**
 * Index des extensions CardTrader : par code, par nom, et les extensions « sœurs » de chacune (même nom suivi d'autres mots : « Reality Fracture Collectors »,
 * « … Promos »…). CardTrader y range souvent les vitrines et sans bordure que Scryfall garde dans l'extension principale (Denzilore Fatehold 349 vitrine).
 */
function expIndexOf(list) {
  const byCode = new Map(), byName = new Map(), byId = new Map(), sib = new Map(), nm = new Map();
  for (const e of list) { const n = normPart(e.name); byCode.set(e.code, e.id); byName.set(n, e.id); byId.set(e.id, e); nm.set(e.id, n); }
  for (const e of list) {
    const n = nm.get(e.id); if (n.length < 4) continue;
    const s = list.filter(x => x.id !== e.id && nm.get(x.id).startsWith(n + ' ')).map(x => x.id); if (s.length) sib.set(e.id, s);
  }
  return { byCode, byName, byId, sib };
}

/** Numéro de collection comparable (« 0128 » = « 128 », casse ignorée) ; '' : inconnu. */
const bpNum = v => String(v ?? '').trim().toLowerCase().replace(/^0+(?=[0-9a-z])/, '');
/** Index d'un catalogue d'extension CardTrader : par identifiant Scryfall et par nom (plusieurs blueprints du même nom : variantes, sans bordure, vitrine…). */
function bpIndexOf(list) {
  const byScry = new Map(), byName = new Map();
  for (const b of list) {
    if (b.sid) byScry.set(b.sid, b);
    const f = frontName(b.name);
    if (!byName.has(f)) byName.set(f, []);
    byName.get(f).push(b);
  }
  return { byScry, byName, list };
}
async function getBlueprints(expId, signal) {
  let list = await Cache.get('ct:bp2:' + expId, 7 * DAY);      // v2 : numéro de collection et image CardTrader de chaque blueprint
  if (!list) {
    const j = await ct('blueprints/export', { params: { expansion_id: expId }, signal });
    list = (Array.isArray(j) ? j : []).map(b => ({ id: b.id, name: b.name, sid: b.scryfall_id || null, num: bpNum(b.fixed_properties && b.fixed_properties.collector_number),
      im: typeof b.image_url === 'string' && /^https:\/\//.test(b.image_url) ? b.image_url : '' }));
    await Cache.set('ct:bp2:' + expId, list);
  }
  return bpIndexOf(list);
}

/**
 * Blueprints CardTrader de la carte, chacun avec l'impression Scryfall qui lui correspond (extension, numéro, image, prix de référence).
 * Identifiant Scryfall donné par CardTrader (et numéro concordant) : cette impression. Sinon le nom ET le numéro de collection : sans le numéro, la variante
 * sans bordure (418) prenait l'étiquette et l'image de l'impression normale (128) du même nom, et l'inverse. Blueprint du nom restant sans impression
 * (numéro propre à CardTrader) : gardé avec son numéro et l'image de CardTrader, pour que ses offres soient lues quand même.
 */
function mapBlueprints(card, prints, exps, bpIndex) {
  const out = new Map(), front = frontName(card.name), sets = new Map();
  const add = (b, p) => { if (!out.has(b.id)) out.set(b.id, { id: b.id, set: p.set, setName: p.setName, num: p.num, img: p.img, eu: p.eu ?? null, ef: p.ef ?? null }); };
  for (const p of prints) {
    const eid = exps.byCode.get(p.set) || exps.byName.get(normPart(p.setName)), pn = bpNum(p.num);
    for (const sid of (eid && exps.sib && exps.sib.get(eid)) || []) {      // extensions sœurs : même nom et même numéro → cette impression (vitrine rangée à part chez CardTrader)
      const sIdx = bpIndex.get(sid), e = exps.byId.get(sid); if (!sIdx || !e) continue;
      if (!sets.has(sIdx)) sets.set(sIdx, { set: e.code, setName: e.name });
      if (pn) for (const b of sIdx.byName.get(front) || []) if (b.num === pn) add(b, p);
    }
    const idx = eid && bpIndex.get(eid); if (!idx) continue;
    if (!sets.has(idx)) sets.set(idx, p);
    const direct = idx.byScry.get(p.id);
    if (direct && (!direct.num || !pn || direct.num === pn)) { add(direct, p); continue; }
    const named = idx.byName.get(front) || [];
    const same = pn ? named.filter(b => b.num === pn) : [];
    if (same.length) { for (const b of same) add(b, p); continue; }
    if (named.length && named.every(b => !b.num)) for (const b of named) add(b, p);      // catalogue sans numéros : le nom seul, comme avant
  }
  for (const [idx, p] of sets) for (const b of idx.byName.get(front) || []) if (!out.has(b.id) && b.num) out.set(b.id, { id: b.id, set: p.set, setName: p.setName, num: b.num, img: b.im || null, eu: null, ef: null });
  return [...out.values()];
}

async function fetchBpRaw(id, lang, foil, signal) {
  const params = { blueprint_id: id };
  if (lang) params.language = lang;
  if (foil === 'no') params.foil = 'false'; else if (foil === 'yes') params.foil = 'true';
  const j = await ct('marketplace/products', { params, signal });
  return Array.isArray(j) ? j : Object.values(j || {}).flat();
}
async function fetchBpOffers(bp, lang, foil, signal) { return (await fetchBpRaw(bp.id, lang, foil, signal)).map(p => normalizeProduct(p, bp)); }

/**
 * Lecture des offres de plusieurs blueprints par une TÂCHE DU SERVEUR : une seule cadence vers CardTrader (≤ 10 req/s),
 * la boucle continue même si l'application passe en arrière-plan ou se ferme, et un cache court évite de relire deux fois.
 * Relancer la même recherche se rattache à la tâche en cours (ou terminée). onItem(g, {bp, products|error}) · onInfo(état de la tâche).
 * gs : [{ lang, foil, ids }] : un groupe par requête (langue, foil) ; le premier part dans lang / foil / bps (un serveur d'avant les groupes ne lit que lui : le reste
 * est alors lu depuis l'appareil), les autres dans more, leurs résultats marqués g (rang dans la requête envoyée).
 */
async function jobOffers(gs, { fresh = false, signal, onItem, onInfo, push = null }) {
  const want = new Set(gs.flatMap((g, i) => g.ids.map(id => i + ':' + id))), kill = id => { ct('jobs/' + id, { method: 'DELETE', lim: limJob }).catch(() => {}); };
  const down = (e, why) => Object.assign(netErr('jobs', why || T('Tâches du serveur indisponibles'), { cause: e }), { jobsDown: true });
  const q = g => ({ lang: g.lang || '', foil: g.foil === 'no' || g.foil === 'yes' ? g.foil : 'any', bps: g.bps });
  for (let attempt = 0; want.size; attempt++) {
    if (attempt >= 3) throw down(null, T('Recherche serveur interrompue à plusieurs reprises'));
    const sent = gs.map((g, i) => ({ i, lang: g.lang, foil: g.foil, bps: g.ids.filter(id => want.has(i + ':' + id)) })).filter(g => g.bps.length), [g0, ...more] = sent;      // relance : ce qui manque encore
    let st;
    try { st = await ct('jobs', { method: 'POST', body: { type: 'offers', ...q(g0), ...(more.length ? { more: more.map(q) } : {}), fresh: !!fresh && attempt === 0, push: push || undefined }, signal, lim: limJob }); }
    catch (e) { if (e.name === 'AbortError' || e.code === 'auth' || e.code === 'network') throw e; throw down(e); }   // 404 (désactivées) · 429 (serveur occupé) · 400 : on retombe sur la lecture depuis l'appareil
    const onAbort = () => kill(st.id); signal && signal.addEventListener('abort', onAbort, { once: true });
    let from = 0, lost = false, bad = 0;
    try {
      for (;;) {
        let r;
        try { r = await ct('jobs/' + st.id, { params: { from }, signal, lim: limJob }); bad = 0; }
        catch (e) {
          if (e.name === 'AbortError' || e.code === 'auth') throw e;
          if (e.code === '404') { lost = true; break; }                              // serveur redémarré : on relance pour ce qui manque
          if (++bad > 8) throw e;                                                    // réseau mobile capricieux : la tâche continue côté serveur, on retente
          await sleep(2000, signal); continue;
        }
        for (const it of r.items) { const g = sent[it.g || 0]; if (g && want.delete(g.i + ':' + it.bp)) onItem(g.i, it); }
        from = r.next; if (onInfo) onInfo(r, !!st.attached);
        if (r.status === 'failed' && r.fatal) throw netErr('auth', T('Accès refusé'), { status: r.fatal, host: '', reason: '' });
        if (r.status !== 'running' && from >= r.count) { if (r.status === 'cancelled' || r.status === 'failed') lost = true; break; }
        if (from >= r.count) await sleep(650, signal);                               // plus rien de nouveau : on laisse le serveur avancer
      }
    } finally { signal && signal.removeEventListener('abort', onAbort); }
    if (!lost) return;                                                               // tâche terminée : ce qui manquerait encore sera lu depuis l'appareil
  }
}

/**
 * Une passe d'offres pour un groupe de cartes dans une langue : tâche serveur si le serveur la propose, sinon blueprint par blueprint.
 * entries : [{ c, bps, img, qs? }] ; qs : requêtes de la carte ([{ lang, foil }], foil et langue de ses lignes : lnQueries), sinon la langue de la passe et le foil
 * de la recherche. Une unité = une requête × un blueprint. onCard(entry, offers) quand TOUTES les offres d'une carte sont arrivées · onTick(done, total, info) · retourne { total, cacheAge, mode }
 */
async function offersPass(entries, lang, opts, signal, onCard, onTick) {
  const owners = new Map(), units = [], gs = [], gi = new Map(), pend = new Map(), acc = new Map(), seen = new Set(); let done = 0, cacheAge = 0, firstInfo = true, mode = 'client';
  const gOf = q => { const k = q.lang + '|' + q.foil; if (!gi.has(k)) { gi.set(k, gs.length); gs.push({ lang: q.lang, foil: q.foil, ids: [] }); } return gi.get(k); };
  for (const e of entries) {
    const qs = e.qs || [{ lang, foil: opts.foil }]; pend.set(e, e.bps.length * qs.length); acc.set(e, []);
    for (const q of qs) { const g = gOf(q); for (const bp of e.bps) { const u = g + ':' + bp.id; if (!owners.has(u)) { owners.set(u, []); units.push(u); gs[g].ids.push(bp.id); } owners.get(u).push({ e, bp }); } }
  }
  const total = units.length;
  for (const e of entries) if (!pend.get(e)) onCard(e, []);
  const got = (u, raw) => {
    if (seen.has(u)) return; seen.add(u); done++;
    for (const { e, bp } of owners.get(u)) { if (raw) acc.get(e).push(...raw.map(p => normalizeProduct(p, bp))); const n = pend.get(e) - 1; pend.set(e, n); if (n === 0) onCard(e, acc.get(e)); }
  };
  if (total && CTX.proxy && CTX.jobs) {
    try {
      mode = 'job';
      await jobOffers(gs, { fresh: opts.fresh, push: opts.push, signal, onItem: (g, it) => { got(g + ':' + it.bp, it.error ? null : it.products); },
        onInfo: (r, attached) => {
          // Âge des prix servis « d'avance » : cache lu au lancement ; ou, si on se rattache à une tâche existante, âge de ses données à cet instant (relevé une seule fois).
          const a = attached ? (firstInfo ? r.dataAge : 0) : r.cacheAge; firstInfo = false; cacheAge = Math.max(cacheAge, a || 0);
          onTick(done, total, { mode, sent: r.sent, cached: r.cached, rps: r.rps, cacheAge });
        } });
    } catch (e) { if (!e.jobsDown) throw e; CTX.jobs = false; mode = 'client'; }   // tâches indisponibles : on continue depuis l'appareil
  }
  const rest = units.filter(u => !seen.has(u));
  if (rest.length) {
    if (mode === 'job') mode = 'client';
    await pool(rest, 5, async u => {
      const i = u.indexOf(':'), g = gs[+u.slice(0, i)]; let raw = null;
      try { raw = await fetchBpRaw(+u.slice(i + 1), g.lang, g.foil, signal); }
      catch (e) { if (e.name === 'AbortError' || e.code === 'auth' || e.code === 'network' || e.code === 'notoken') throw e; }
      got(u, raw); onTick(done, total, { mode: 'client' });
    });
  }
  return { total, cacheAge, mode };
}

async function pool(items, n, fn) {
  let i = 0; const errs = [];
  const worker = async () => { while (i < items.length) { const it = items[i++]; await fn(it); } };
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, worker));
  return errs;
}

/**
 * Pipeline live. hooks : step(id,state,detail) · progress(frac) · rate(rps,total) · card(key,payload)
 * payload : {offers, bps, img, notFound, fellBack}
 */
async function runLive(cards, opts, hooks, signal) {
  const total = cards.length;
  // Éditions exactes (opts.exactEd, carte avec ses éditions « (CMM) 400 ») : seules ces impressions sont gardées, et leurs blueprints CardTrader (même numéro).
  const edWant = c => (opts.exactEd && c.eds && c.eds.length ? new Set(c.eds.map(edNorm)) : null);
  const printsUse = c => { const w = edWant(c), pr = printsOf[c.key] || []; return w ? pr.filter(p => w.has(edNorm(edKey(p.set, p.num)))) : pr; };
  hooks.step('prints', 'run', '0 / ' + total);
  const printsOf = {}; let done = 0;
  const label = () => done + ' / ' + total;
  // Pause visible quand Scryfall demande de ralentir (429) ou ne répond plus, au lieu d'un écran qui semble figé.
  limScry.onWait = (ms, kind) => hooks.step('prints', 'run', T(kind === 'rate' ? 'Scryfall demande une pause · {n} s' : 'Nouvelle tentative · {n} s', { n: Math.ceil(ms / 1000) }));
  // Cooldown mémorisé d'un essai précédent : on attend au lieu de relancer pendant le blocage.
  let gate = null;
  const scryGate = () => {
    if (!scryLeft()) return null;
    return gate || (gate = (async () => {
      try { for (let l; (l = scryLeft()) > 0;) { hooks.step('prints', 'run', T('Scryfall en pause · {n} s', { n: Math.ceil(l / 1000) })); await sleep(Math.min(1000, l), signal); } }
      finally { gate = null; hooks.step('prints', 'run', label()); }
    })());
  };
  try {
    // 1) cache (3 jours) · 2) recherche groupée par lots · 3) carte par carte pour les absentes (nom approximatif, lot en échec)
    await pool(cards, 6, async c => { const pr = await Cache.get('sc:' + c.key, 3 * DAY); if (pr && pr.length && pr[0].cmc !== undefined && pr[0].eu !== undefined) { printsOf[c.key] = pr; done++; } });   // 3 jours (les prix de référence bougent) ; anciennes entrées sans coût de mana ou sans prix : relues une fois
    hooks.step('prints', 'run', label()); hooks.progress(0.15 * done / total);
    const single = [];
    for (const chunk of scryChunks(cards.filter(c => !printsOf[c.key]))) {
      await scryGate();
      let got = null;
      if (chunk.length > 1) { // une carte seule : inutile de passer par un lot
        try { got = await scryPrintsBatch(chunk, signal); }
        catch (e) { if (e.name === 'AbortError' || e.code === 'network' || e.code === 'rate' || e.code === 'auth') throw e; }
      }
      for (const c of chunk) {
        const pr = got && got.get(c.key);
        if (pr && pr.length) { printsOf[c.key] = pr; done++; await Cache.set('sc:' + c.key, pr); } else single.push([c, !!got]);
      }
      hooks.step('prints', 'run', label()); hooks.progress(0.15 * done / total);
    }
    await pool(single, 3, async ([c, exactDone]) => {
      await scryGate();
      const pr = await scryPrints(c.name, signal, exactDone); if (pr.length) await Cache.set('sc:' + c.key, pr);
      printsOf[c.key] = pr; done++;
      hooks.step('prints', 'run', label()); hooks.progress(0.15 * done / total);
    });
  } finally { limScry.onWait = null; }
  hooks.step('prints', 'done', T('{n} cartes', { n: total }));

  hooks.step('catalog', 'run', T('Extensions…'));
  const exps = await getExpansions(signal);
  const skip = opts.skip || new Set();                     // cartes déjà possédées en totalité : on lit leurs impressions (image, coût) mais pas leurs offres
  const needed = new Set();
  for (const c of cards) if (!skip.has(c.key)) for (const p of printsUse(c)) {
    const eid = exps.byCode.get(p.set) || exps.byName.get(normPart(p.setName)); if (eid) { needed.add(eid); for (const s of exps.sib.get(eid) || []) needed.add(s); }      // et ses extensions sœurs (vitrines « … Collectors »)
  }
  const bpIndex = new Map(); let bd = 0; const ids = [...needed];
  await pool(ids, 4, async id => {
    bpIndex.set(id, await getBlueprints(id, signal)); bd++;
    hooks.step('catalog', 'run', T('{done} / {total} extensions', { done: bd, total: ids.length })); hooks.progress(0.15 + 0.25 * bd / ids.length);
  });
  hooks.step('catalog', 'done', T('{n} extensions', { n: ids.length }));

  const plan = cards.map(c => {
    const w = edWant(c), bps = mapBlueprints(c, printsUse(c), exps, bpIndex);
    if (!w) return { c, bps };
    const nums = new Set([...w].map(e => edNum(e)));      // blueprints de ces numéros seulement (l'extension et ses sœurs : les seules lues)
    return { c, bps: bps.filter(b => !b.num || nums.has(bpNum(b.num))) };      // num : celui de l'impression rattachée (Scryfall), sinon celui de CardTrader
  });
  const store = {}; const entries = [];
  for (const { c, bps } of plan) {
    const pu = printsUse(c), p0 = pu[0] || printsOf[c.key][0] || {}, img = p0.img || null, meta = p0.cmc !== undefined ? { cm: p0.cmc, mc: p0.mc, tl: p0.tl, cl: p0.cl } : null;      // éditions exactes : l'illustration de l'édition demandée
    if (!pu.length) { hooks.card(c.key, { offers: [], bps: [], img, notFound: true }); continue; }      // carte inconnue, ou édition demandée introuvable
    if (skip.has(c.key)) { hooks.card(c.key, { offers: [], bps: [], img, meta, skipped: true }); continue; }
    store[c.key] = { bps, img }; entries.push({ c, bps, img, meta });
  }
  const reqTotal = entries.reduce((a, e) => a + e.bps.length, 0) || 1, t0 = performance.now();
  hooks.step('offers', 'run', '0 / ' + reqTotal);
  // Progression : en mode serveur, la cadence et le nombre de requêtes sont ceux du serveur ; sinon ceux de cet appareil.
  const tick = base => (done, total, info) => {
    hooks.step('offers', 'run', done + ' / ' + total); hooks.progress(base.from + (base.to - base.from) * done / Math.max(1, total));
    if (info && info.mode === 'job') { hooks.hint(true); hooks.rate(info.rps || 0, info.sent || 0, info.cached ? T('{n} depuis le cache', { n: info.cached }) : ''); } else { hooks.hint(false); hooks.rate(limCT.rps(), limCT.count); }
  };
  // Foil et langue par ligne (c.ln : « *F* », « *N* », « *FR* ») : la carte cherche les offres de chacune de ses lignes (lnQueries), les autres ceux de la recherche
  const first = await offersPass(entries.map(e => (e.c.ln ? { ...e, qs: lnQueries(e.c, opts) } : e)), opts.lang, opts, signal, (e, offers) => hooks.card(e.c.key, { offers, bps: e.bps, img: e.img, meta: e.meta }), tick({ from: 0.4, to: 0.95 }));
  hooks.cacheAge(first.cacheAge);
  hooks.step('offers', 'done', first.mode === 'job' ? T('sur le serveur · {n} s', { n: Math.max(1, Math.round((performance.now() - t0) / 1000)) }) : T('{n} requêtes · {s} s', { n: first.total, s: Math.max(1, Math.round((performance.now() - t0) / 1000)) }));

  if (opts.fallbackEn && opts.lang !== 'en') {
    const miss = entries.filter(e => e.bps.length && hooks.needsEn(e.c.key, e.c));      // une ligne qui impose sa langue n'a pas de repli
    if (miss.length) {
      hooks.step('fallback', 'run', '0 / ' + miss.length); let fd = 0;
      const second = await offersPass(miss.map(e => (e.c.ln ? { ...e, qs: lnQueries(e.c, opts, true) } : e)), 'en', opts, signal, (e, offers) => {
        fd++; hooks.step('fallback', 'run', fd + ' / ' + miss.length);
        hooks.card(e.c.key, { offers, bps: e.bps, img: e.img, meta: e.meta, fellBack: true });
      }, (done, total, info) => { hooks.progress(0.95 + 0.05 * fd / miss.length); if (info && info.mode === 'job') hooks.rate(info.rps || 0, info.sent || 0, info.cached ? T('{n} depuis le cache', { n: info.cached }) : ''); });
      hooks.cacheAge(second.cacheAge);
      hooks.step('fallback', 'done', T('{n} cartes', { n: miss.length }));
    } else hooks.step('fallback', 'skip', T('Inutile'));
  } else hooks.step('fallback', 'skip', T('Désactivé'));
  hooks.hint(false);
  hooks.progress(1);
}

/** Recherche en anglais pour une seule carte (depuis la fiche carte) ; foil de ses lignes sans langue imposée (lnQueries), sinon celui de la recherche. */
async function searchOneEnglish(card, st, opts, signal) {
  const all = [], qs = lnQueries(card, opts, true);
  await Promise.all((st.bps || []).flatMap(bp => qs.map(async q => { try { all.push(...await fetchBpOffers(bp, 'en', q.foil, signal)); } catch (e) { if (e.name === 'AbortError') throw e; } })));
  return all;
}

/* ── Pipeline démo : mêmes hooks, données simulées ────────────────────────────────────────── */
async function runDemo(cards, opts, hooks, signal) {
  const total = cards.length;
  hooks.step('prints', 'run', '0 / ' + total);
  for (let i = 0; i < total; i++) { await sleep(14 + (hash32(cards[i].key) % 16), signal); hooks.step('prints', 'run', (i + 1) + ' / ' + total); hooks.progress(0.15 * (i + 1) / total); }
  hooks.step('prints', 'done', T('{n} cartes', { n: total }));
  hooks.step('catalog', 'run', T('Extensions…'));
  const nExp = 9; for (let i = 1; i <= nExp; i++) { await sleep(70, signal); hooks.step('catalog', 'run', T('{done} / {total} extensions', { done: i, total: nExp })); hooks.progress(0.15 + 0.25 * i / nExp); }
  hooks.step('catalog', 'done', T('{n} extensions', { n: nExp }));
  hooks.step('offers', 'run', '0 / ' + total);
  let reqs = 0; const t0 = performance.now();
  const skip = opts.skip || new Set();
  for (let i = 0; i < total; i++) {
    const c = cards[i];
    if (skip.has(c.key)) { hooks.card(c.key, { offers: [], bps: [], img: null, skipped: true }); hooks.step('offers', 'run', (i + 1) + ' / ' + total); hooks.progress(0.4 + 0.55 * (i + 1) / total); continue; }
    await sleep(38 + (hash32(c.key + 'z') % 70), signal);
    reqs += 4 + (hash32(c.key) % 7);
    hooks.card(c.key, { offers: c.ln ? lnQueries(c, opts).flatMap(q => makeDemoOffers(c, q.lang)) : makeDemoOffers(c, opts.lang), bps: [{ id: 1 }], img: null });      // langues des lignes (« *DE* »)
    hooks.step('offers', 'run', (i + 1) + ' / ' + total);
    hooks.progress(0.4 + 0.55 * (i + 1) / total);
    hooks.rate(reqs / Math.max(1, (performance.now() - t0) / 1000), reqs);
  }
  hooks.step('offers', 'done', T('{n} requêtes simulées', { n: reqs }));
  if (opts.fallbackEn && opts.lang !== 'en') {
    const miss = cards.filter(c => !skip.has(c.key) && hooks.needsEn(c.key, c));
    if (miss.length) {
      hooks.step('fallback', 'run', '0 / ' + miss.length);
      for (let i = 0; i < miss.length; i++) {
        await sleep(160, signal);
        hooks.card(miss[i].key, { offers: makeDemoOffers(miss[i], 'en'), bps: [{ id: 1 }], img: null, fellBack: true });
        hooks.step('fallback', 'run', (i + 1) + ' / ' + miss.length); hooks.progress(0.95 + 0.05 * (i + 1) / miss.length);
      }
      hooks.step('fallback', 'done', T('{n} cartes', { n: miss.length }));
    } else hooks.step('fallback', 'skip', T('Inutile'));
  } else hooks.step('fallback', 'skip', T('Désactivé'));
  hooks.progress(1);
}

/* ── Prix Cardmarket (sans token CardTrader) ──────────────────────────────────────────────────
   Prix « à partir de » de chaque carte : tendance Cardmarket de l'impression papier la moins chère (et TCGplayer en dollars).
   Le serveur sert un fichier généré chaque jour depuis Scryfall (prices.tsv, ≈ 400 Ko compressé), gardé 12 h sur l'appareil ;
   sans serveur, ou pour une carte absente du fichier, Scryfall est interrogé directement (prix de l'impression par défaut). */
const TAB_TTL = 12 * 3600e3;
let PXT = null;
/** Texte du fichier de prix → { at, map: ownKey → { e, u } } (centimes). */
function pxParse(txt) {
  const lines = String(txt || '').split('\n'), m = /^#MOPX1 (\S+)/.exec(lines[0] || ''); if (!m) return null;
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i]; if (!l) continue; const a = l.split('\t'); if (a.length < 3) continue;
    const k = ownKey(a[0]), e = Number(a[1]) || 0, u = Number(a[2]) || 0, cur = map.get(k);
    if (!cur) map.set(k, { e, u }); else { if (e && (!cur.e || e < cur.e)) cur.e = e; if (u && (!cur.u || u < cur.u)) cur.u = u; }
  }
  return { at: m[1], map };
}
async function pxTable(signal) {
  if (PXT && Date.now() - PXT.t < TAB_TTL) return PXT;
  let txt = await Cache.get('px:tab', TAB_TTL);
  if (!txt && CTX.proxy) {
    try { const r = await fetch('prices.tsv', { signal }); if (r.ok) { txt = await r.text(); if (pxParse(txt.slice(0, 200))) await Cache.set('px:tab', txt); else txt = null; } }
    catch (e) { if (e.name === 'AbortError') throw e; }
  }
  const t = txt && pxParse(txt); if (!t) return null;
  PXT = { t: Date.now(), ...t }; return PXT;
}
/** Recherche au prix Cardmarket : une « offre » par carte, au prix tendance. Mêmes étapes et mêmes crochets que runLive. */
async function runCm(cards, opts, hooks, signal) {
  const skip = opts.skip || new Set(), todo = cards.filter(c => !skip.has(c.key)), price = new Map(), notFound = new Set(), imgs = new Map(), edOf = new Map();
  // Éditions exactes (opts.exactEd, carte avec ses éditions « (CMM) 400 ») : le prix Cardmarket de cette impression (la moins chère si la ligne en donne plusieurs), pas celui de la carte
  const exact = opts.exactEd ? todo.filter(c => c.eds && c.eds.length) : [], byName = opts.exactEd ? todo.filter(c => !(c.eds && c.eds.length)) : todo;
  hooks.step('prints', 'run', T('Relevé du jour…')); hooks.progress(0.05);
  const tab = byName.length ? await pxTable(signal) : null;
  if (tab) for (const c of byName) { const p = tab.map.get(ownKey(c.name)); if (p && p.e) price.set(c.key, p.e); }
  if (exact.length) {
    const got = await scryEditions(exact.flatMap(c => c.eds), signal);
    for (const c of exact) {
      let best = null;
      for (const e of c.eds) { const x = got.get(e), u = x ? (x.eu > 0 ? x.eu : x.ef > 0 ? x.ef : 0) : 0; if (u && (!best || u < best.u)) best = { u, e, x }; }
      if (best) { price.set(c.key, best.u); edOf.set(c.key, best); if (best.x.im) imgs.set(c.key, best.x.im); }
      else if (c.eds.every(e => got.get(e) === null)) notFound.add(c.key);      // édition inconnue de Scryfall ; connue sans prix : « sans offre »
    }
  }
  hooks.step('prints', tab || exact.length ? 'done' : 'skip', tab ? new Date(tab.at).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' }) : exact.length ? T('éditions exactes') : T('Indisponible')); hooks.progress(0.15);
  const miss = byName.filter(c => !price.has(c.key)), mem = await cmImgMap();
  if (miss.length) {
    hooks.step('catalog', 'run', '0 / ' + miss.length);
    const got = await scryCollection(miss.map(c => c.name), signal, (d, t) => { hooks.step('catalog', 'run', d + ' / ' + t); hooks.progress(0.15 + 0.75 * d / t); hooks.rate(0, Math.ceil(d / 75)); });
    for (const c of miss) { const m = got.get(ownKey(c.name)); if (m && m.eu) price.set(c.key, m.eu); else if (!m) notFound.add(c.key); if (m && m.im) { imgs.set(c.key, m.im); mem.set(ownKey(c.key), m.im); } }
    hooks.step('catalog', 'done', TN(miss.length, '{n} carte', '{n} cartes', { n: miss.length }));
  } else hooks.step('catalog', 'skip', T('Inutile'));
  const late = await cmImages(cards.filter(c => !notFound.has(c.key) && !edOf.has(c.key)), imgs, opts.lang);      // éditions exactes : l'image de l'édition, déjà là
  hooks.step('offers', 'run', '');
  const sent = new Map();
  for (const c of cards) {
    const img = imgs.get(c.key) || null, ed = edOf.get(c.key), o = price.has(c.key) ? cmOffer(c, price.get(c.key), opts) : null;
    if (o && ed) Object.assign(o, { set: edSet(ed.e), num: edNum(ed.e), setName: ed.x.sn || '' });      // la ligne montre l'édition demandée
    const p = skip.has(c.key) ? { offers: [], bps: [], img, skipped: true } : o ? { offers: [o], bps: [], img } : { offers: [], bps: [], img, notFound: notFound.has(c.key) };
    sent.set(c.key, p); hooks.card(c.key, p);
  }
  hooks.step('offers', 'done', price.size === 1 ? T('1 prix') : T('{n} prix', { n: price.size }));      // « prix » : invariable en français, pas en anglais
  hooks.step('fallback', 'skip', T('Inutile')); hooks.progress(1);
  cmImagesLate(late, sent, hooks, signal);      // prix déjà affichés : les vignettes encore inconnues arrivent ensuite, sans retarder la fin de la recherche
}
/* Vignettes des lignes au prix Cardmarket. Images anglaises lues sur Scryfall gardées sur l'appareil (« cm:img », 60 jours) : la vérification suivante ne coûte rien. */
const CMIMG = { m: null, p: null, t: 0 };
async function cmImgMap() {
  if (CMIMG.m) return CMIMG.m;
  if (!CMIMG.p) CMIMG.p = (async () => { const m = new Map(); try { const o = await Cache.get('cm:img', 60 * DAY); if (o && typeof o === 'object' && !Array.isArray(o)) for (const k in o) if (typeof o[k] === 'string') m.set(k, o[k]); } catch (e) { /* cache absent */ } CMIMG.m = m; return m; })();
  return CMIMG.p;
}
function cmImgSave() {
  clearTimeout(CMIMG.t);
  CMIMG.t = setTimeout(() => { if (!CMIMG.m) return; const o = {}; for (const [k, v] of [...CMIMG.m].slice(-4000)) o[k] = v; Cache.set('cm:img', o).catch(() => {}); }, 600);      // les 4 000 dernières (≈ 300 Ko)
}
/** Vignettes sans requête : dans la langue de la recherche si on l'a (miniature du catalogue des noms pour une recherche dans sa langue), sinon l'anglaise
 *  (lue avec les prix, collection, images gardées, impressions d'une recherche CardTrader). imgs : Map clé → url, complétée sur place. Retourne les cartes encore sans image. */
async function cmImages(cards, imgs, lang) {
  const meta = typeof COLL !== 'undefined' ? COLL.meta : {}, fr = typeof FRX !== 'undefined' && FRX.ix ? FRX.ix.img : null, mem = await cmImgMap();
  const frImg = k => { const f = fr && fr.get(k); return f ? (/^https?:/.test(f) ? f : FR_IMG + f) : ''; };
  const rest = [];
  for (const c of cards) {
    const k = ownKey(c.key), en = imgs.get(c.key) || (meta[k] && meta[k].im) || mem.get(k) || '', u = (fr && lang === FRX.l && frImg(k)) || en;      // catalogue chargé dans la langue de la recherche (français, allemand…) : sa miniature
    if (u) imgs.set(c.key, u); else rest.push(c);
  }
  await pool(rest, 6, async c => {
    const pr = await Cache.get('sc:' + c.key, 30 * DAY).catch(() => null), u = (pr && pr[0] && pr[0].img) || frImg(ownKey(c.key));      // autre langue : l'impression française vaut mieux qu'une lettre
    if (u) imgs.set(c.key, u);
  });
  return rest.filter(c => !imgs.has(c.key));
}
/** Images encore inconnues, lues en arrière-plan sur Scryfall (75 par requête : 2 pour un deck de 100 cartes), puis lignes repeintes (même réponse, avec l'image) et images gardées. */
function cmImagesLate(cards, sent, hooks, signal) {
  if (!cards.length) return;
  (async () => {
    const mem = await cmImgMap();
    for (let i = 0; i < cards.length && !(signal && signal.aborted); i += 75) {
      const chunk = cards.slice(i, i + 75), got = await scryCollection(chunk.map(c => c.name), signal);
      for (const c of chunk) {
        const m = got.get(ownKey(c.name)), p = sent.get(c.key); if (!m || !m.im) continue;
        mem.set(ownKey(c.key), m.im); if (p && !(signal && signal.aborted)) hooks.card(c.key, { ...p, img: m.im });
      }
      cmImgSave();
    }
  })().catch(() => { /* hors ligne, Scryfall en pause : les lettres restent, la prochaine vérification réessaie */ });
}

/* ── Panier ───────────────────────────────────────────────────────────────────────────────── */
/** Contenu du panier CardTrader : lignes {productId, quantity, name} + sous-total. Aucun achat, lecture seule. */
async function cartRead(signal) {
  const cart = await ct('cart', { signal });
  const items = [];
  for (const sc of (cart && cart.subcarts) || []) for (const it of sc.cart_items || []) {
    const pid = Number(it.product && it.product.id), q = Number(it.quantity);
    if (Number.isFinite(pid) && pid > 0 && q > 0) items.push({ productId: pid, quantity: q, name: (it.product && it.product.name_en) || String(pid) });
  }
  return { items, subtotal: cart && cart.subtotal };
}

/** Vide le panier : l'API n'a pas de « tout supprimer », on retire chaque ligne (quantité exacte lue dans le panier). */
async function cartClear(items, signal, onItem) {
  const failed = []; let ok = 0;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    try { await ct('cart/remove', { method: 'POST', body: { product_id: it.productId, quantity: it.quantity }, signal }); ok++; }
    catch (e) {
      if (e.name === 'AbortError' || e.code === 'auth' || e.code === 'network') throw e;
      failed.push({ name: it.name, reason: e.message });
    }
    if (onItem) onItem(i + 1, items.length);
  }
  return { ok, failed };
}

/**
 * Ajoute les offres au panier. Si une offre n'est plus disponible, essaie des offres de remplacement (part.alt(exclus, besoin) → [{offer,n}]).
 * Retourne {ok, failed:[{name,reason}], replaced:[{name, from, n, to:[{offer,n}], missing}], gone:[productId]}.
 * Garde-fou : si les remplacements échouent à leur tour avec le même message sur 2 lignes de suite, l'erreur n'est pas propre à l'offre
 * (adresse, compte…) : on arrête d'en essayer d'autres et on la signale telle quelle.
 */
async function cartFill(parts, mode, address, signal, onItem, demo) {
  const failed = [], replaced = [], gone = [], added = []; let ok = 0, streak = 0, noAlt = false;
  const fatal = e => e.name === 'AbortError' || e.code === 'auth' || e.code === 'network' || e.code === 'notoken';
  const add = async (offer, n) => {
    if (demo) { await sleep(70, signal); if (hash32(String(offer.id)) % 23 === 0) throw netErr('gone', T('Plus disponible')); return; }
    const body = { product_id: offer.productId, quantity: n, via_cardtrader_zero: mode === 'zero' };
    if (address) { body.shipping_address = address; body.billing_address = address; }
    await ct('cart/add', { method: 'POST', body, signal });
  };
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i], { offer, n, name } = part;
    try { await add(offer, n); ok++; added.push({ k: part.key, n: name, q: n, l: offer.lang || '' }); }
    catch (e) {
      if (fatal(e)) throw e;
      let handled = false;
      if (part.alt && !noAlt) {
        const tried = new Set([offer.productId]), used = []; let need = n, lastMsg = null, altFailed = 0;
        for (let round = 0; round < 4 && need > 0; round++) {
          const cand = part.alt(tried, need); if (!cand.length) break;
          for (const c of cand) {
            tried.add(c.offer.productId);
            try { await add(c.offer, c.n); used.push(c); need -= c.n; added.push({ k: part.key, n: name, q: c.n, l: c.offer.lang || '' }); }
            catch (e2) { if (fatal(e2)) throw e2; lastMsg = e2.message; altFailed++; break; }   // on recalcule avec ce qui reste
          }
        }
        if (used.length) {
          gone.push(offer.productId); handled = true;
          replaced.push({ name, from: offer, n, to: used, missing: Math.max(0, need) });
          if (need > 0) failed.push({ name, reason: TN(need, '{n} exemplaire sans remplacement disponible', '{n} exemplaires sans remplacement disponible', { n: need }) });
          else ok++;
          streak = 0;
        } else if (altFailed && lastMsg === e.message) { if (++streak >= 2) noAlt = true; }   // même erreur partout : probablement pas l'offre
        else streak = 0;
      }
      if (!handled) failed.push({ name, reason: e.message });
    }
    onItem(i + 1, parts.length);
  }
  return { ok, failed, replaced, gone, added };
}
if (typeof module !== 'undefined' && module.exports) module.exports = { ...(module.exports || {}), bpNum, bpIndexOf, expIndexOf, mapBlueprints };
