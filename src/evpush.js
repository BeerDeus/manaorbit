/* ── evpush.js : notifications des événements (serveur : event-push.mjs, routes POST /api/event/push et /api/admin/events/push ; README › « Événements saisonniers ») ──
   · Proposées quand le serveur l'annonce (/__ping › evpush : compte de service FCM, EVENT_PUSH ≠ 0) ; sinon rien n'apparaît.
   · Appareil enregistré avec ou sans compte : jeton d'appareil des événements (x-event-device, event.js › evCall) et, s'il est connecté, le compte ; une fois par
     semaine, ou quand le jeton push, la langue ou le compte change. Activées d'office là où les notifications le sont déjà (interrupteur « Événements » de Compte
     et réglages › Notifications pour les couper), jamais ailleurs ; retiré en coupant l'interrupteur, quand les notifications de l'appareil sont coupées ou bloquées.
   · Premier lancement (onboard.js) : après « Sauvegarde ta collection », une étape demande l'autorisation avec la fenêtre native (plugin PushNotifications dans
     l'appli Android, Notification.requestPermission dans le navigateur ; iPhone : seulement l'app installée), si elle a un sens ici (evpAskable) ; « Plus tard » :
     jamais redemandé. Interrupteur, clé et date gardés sur l'appareil (deckdeal:ev:push).
   · Notification touchée (./?fete=1 : push.js › pushOpen, app.js › handleLaunch) : l'accueil, puis la feuille de la fête (ou, avant la fête, sa date). */
const EVP_KEY = 'deckdeal:ev:push', EVP_TTL = 7 * 86400e3, EVPS = { t: 0 };
const evpOn = () => CTX.evpush === true;
function evpLs() { try { const o = JSON.parse(localStorage.getItem(EVP_KEY) || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
function evpSet(o) { try { localStorage.setItem(EVP_KEY, JSON.stringify(o)); } catch (e) { /* stockage plein ou refusé */ } }
/** Cet appareil est enregistré pour les événements : son abonnement push reste quand on coupe les autres notifications (push.js, alerts.js, friends.js, daily.js). */
function evpHolds() { const o = evpLs(); return !!(o.k && o.push !== false); }
function evpDevSoon(ms = 1500) { clearTimeout(EVPS.t); EVPS.t = setTimeout(() => evpDev().catch(() => {}), ms); }
/** POST /api/event/push ; sans jeton d'appareil, le serveur en donne un (event.js › evCall le garde) : un nouvel essai avec lui. */
async function evpCall(body) {
  if (typeof EV !== 'undefined' && !EV.dev) { try { const t = localStorage.getItem(EV_DEV) || ''; if (/^[\w-]{22}\.[\w-]{16}$/.test(t)) EV.dev = t; } catch (e) { /* refusé */ } }
  try { return await evCall('/push', { method: 'POST', body }); }
  catch (e) { if (e.code === 'device' && EV.dev) return evCall('/push', { method: 'POST', body }); throw e; }
}
/** Enregistre cet appareil (notifications actives, interrupteur allumé), ou le retire (interrupteur coupé, notifications coupées ou bloquées ici). */
async function evpDev(force) {
  if (!evpOn()) return;
  const o = evpLs(), k = String(o.k || '');
  const off = async () => { await evpCall({ off: k }); evpSet({ ...evpLs(), k: '', sig: '' }); };
  if (o.push === false) { if (k) await off(); return; }
  const st = await pushState().catch(() => '');
  if (st === 'off' || st === 'denied') { if (k) await off(); return; }      // notifications coupées sur cet appareil : plus rien ne doit y arriver
  if (st !== 'on') return;
  const sub = await pushTarget(); if (!sub) return;
  const uid = (typeof D !== 'undefined' && D.user && D.uid) || '', sig = String(hash32(JSON.stringify(sub) + '|' + I18N.lang + '|' + uid));
  if (!force && k && sig === o.sig && Date.now() - (Number(o.at) || 0) < EVP_TTL) return;
  const r = await evpCall({ sub, l: I18N.lang });
  if (k && r.k && r.k !== k) evpCall({ off: k }).catch(() => {});      // jeton renouvelé : l'ancien ne doit plus rien recevoir
  evpSet({ ...evpLs(), k: r.k || '', sig, at: Date.now() });
}
/** Effacement de l'appareil (decks.js › deviceForget) : plus de notification des événements ici. Jamais bloquant. */
async function evpOut() {
  const o = evpLs();
  if (o.k && evpOn()) { try { await Promise.race([evpCall({ off: o.k }), sleep(2500)]); } catch (e) { /* hors ligne : le serveur retirera la cible à son premier refus */ } }
  evpSet({ push: o.push, asked: o.asked });
}
/** Interrupteur allumé : autorisation demandée si besoin (push.js › pushEnable), puis appareil enregistré. */
async function evpPushOn() {
  evpSet({ ...evpLs(), push: true });
  const r = await pushEnable();
  if (!r.ok) { toast(alWhy(r)); return false; }
  try { await evpDev(true); } catch (e) { toast(e && e.code === 'net' ? T('Hors ligne : réessaie dans un instant.') : T('Activation impossible.')); return false; }
  toast(T('Tu seras prévenu des événements')); return true;
}
/** Réglages › Notifications : rubrique « Événements » (app.js › openNotifSettings). */
async function evpBox(box) {
  if (!box) return;
  const st = await pushState().catch(() => ''); if (!box.isConnected) return;
  if (st !== 'on' && st !== 'off') { box.innerHTML = `<p class="hint">${esc(st === 'denied' ? pushDeniedMsg() : st === 'ios' ? T('Sur iPhone et iPad, installe d\'abord Mana Orbit sur l\'écran d\'accueil (Réglages › Application).') : T('Notifications indisponibles sur cet appareil.'))}</p>`; return; }
  if (st === 'on' && evpLs().push !== false) await Promise.race([evpDev().catch(() => {}), sleep(2500)]); if (!box.isConnected) return;      // activées d'office : enregistré avant d'afficher l'interrupteur
  const o = evpLs(), on = st === 'on' && o.push !== false && !!o.k;
  box.innerHTML = `<label class="switch-row" for="evpSw"><span class="t"><b>${esc(T('Annonces des fêtes'))}</b><span class="hint">${esc(T('Le début d\'une fête (comme la chasse aux citrouilles d\'Halloween), un rappel à mi-parcours et le dernier jour : une notification par jour au plus, vers 10 h.'))}</span></span><span class="switch"><input type="checkbox" id="evpSw"${on ? ' checked' : ''}><i></i></span></label>`;
  const cb = $('#evpSw', box);
  cb.onchange = async () => {
    cb.disabled = true;
    if (cb.checked) { if (!(await evpPushOn())) cb.checked = false; }
    else { evpSet({ ...evpLs(), push: false }); try { await evpDev(); } catch (e) { /* hors ligne : retiré à la prochaine relecture */ } if (!S.push && !(typeof AC !== 'undefined' && AC.on) && !amHoldsPush() && !(typeof dlyHoldsPush === 'function' && dlyHoldsPush())) await pushDisable(); }      // l'abonnement reste tant qu'une autre notification s'en sert
    cb.disabled = false;
  };
}

/* ── Premier lancement : l'étape « Notifications » (onboard.js) ─────────────────────────────────────────────────────── */
/** L'étape a-t-elle un sens ici ? Serveur qui les propose, jamais demandé sur cet appareil, et une fenêtre d'autorisation possible (pas bloquées, pas déjà
    actives ; iPhone hors app installée, navigateur sans notifications, appli trop ancienne : non). */
async function evpAskable() {
  if (!evpOn() || evpLs().asked) return false;
  return (await pushState().catch(() => '')) === 'off';
}
/** Exemple montré à l'étape : l'annonce de la fête en cours ou à venir (textes du pack, dans la langue de l'appli), sinon une phrase générale. */
function evpSample() {
  try {
    const today = evDay(Date.now()), cur = (typeof EV !== 'undefined' && EV.cal && evById(EV.cal.id)) || (CTX.event && evById(CTX.event.id)), up = !cur && evUpcoming(today, 30);
    const ed = cur || up, p = ed && evPack(ed.pack), src = p && p.push && p.push[cur ? 'open' : 'soon'];
    const pair = src && (src[I18N.lang] || src.en || src.fr);
    if (pair) {
      const dt = k => new Date(k + 'T12:00:00Z').toLocaleDateString(LOC(), { day: 'numeric', month: 'long', timeZone: 'UTC' });
      const v = { from: dt(ed.from), to: dt(ed.to), total: nf0(ed.total), per: nf0(ed.per), y: String(ed.year), d: nf0(Math.max(1, evDiff(today, ed.to) + 1)) };
      return pair.map(s => String(s).replace(/\{(\w+)\}/g, (a, k) => (Object.hasOwn(v, k) ? v[k] : a)));
    }
  } catch (e) { /* packs absents : phrase générale */ }
  return [T('🎉 Une nouvelle fête commence'), T('Des objets se cachent dans l\'appli : trouve-les pour gagner des badges collector.')];
}
/** HTML de l'étape (fond sombre fixe du premier lancement). */
function evpStepHtml() {
  const [t1, b1] = evpSample(), now = T('maintenant'), card = (t, b, w, cls) => `<div class="ob-nc ${cls}"><span class="ob-nc-ic"><svg class="logo"><use href="#i-logo"/></svg></span><span class="ob-nc-t"><small>Mana Orbit · ${esc(w)}</small><b>${esc(t)}</b><span>${esc(b)}</span></span></div>`;
  const daily = typeof dlyOn === 'function' && dlyOn();
  return `<section class="ob-s ob-push" aria-label="${esc(T('Notifications'))}">
      <div class="ob-np" aria-hidden="true">${card(t1, b1, now, 'a')}${daily ? card(T('La Carte mystère du jour est là'), T('Devine-la avant les autres.'), '18:00', 'b') : ''}</div>
      <h2>${T('Ne rate aucune fête')}</h2>
      <p>${esc(daily ? T('Active les notifications : on te prévient quand un événement commence, avant qu\'il se termine, et quand la nouvelle Carte mystère est là.') : T('Active les notifications : on te prévient quand un événement commence et avant qu\'il se termine.'))}</p>
      <div class="ob-acts">
        <button class="btn block" type="button" data-ob="push">${T('Activer les notifications')}</button>
        <button class="btn ghost block" type="button" data-ob="done">${T('Plus tard')}</button>
        <p class="ob-np-h">${T('Jamais la nuit. Tu changes d\'avis quand tu veux dans Compte et réglages › Notifications.')}</p>
      </div>
    </section>`;
}
/** « Activer les notifications » : la fenêtre native (push.js › pushEnable), puis l'appareil s'enregistre de lui-même (événements, Carte mystère). → { ok, why } */
async function evpAskNow() {
  evpSet({ ...evpLs(), asked: Date.now() });
  const r = await pushEnable();
  if (r.ok) { evpDevSoon(800); if (typeof dlyDevSoon === 'function') dlyDevSoon(1200); }
  return r;
}
const evpAskLater = () => evpSet({ ...evpLs(), asked: Date.now() });

/* ── Notification touchée : ./?fete=1 ──────────────────────────────────────────────────────────────────────────── */
/** L'accueil, puis la feuille de la fête dès que son état est là ; avant la fête (annonce J-3) : sa date. */
function evPushOpen() {
  try { if (typeof navCloseSections === 'function') navCloseSections(); if (S.view !== 'home') showView('home'); } catch (e) { /* accueil déjà là */ }
  const t0 = Date.now(), go = async () => {
    if (typeof evOn === 'function' && evOn()) {
      if (!EV.st && !EV.busy) await evStatus(true);
      if (!EV.st) { if (Date.now() - t0 < 8000) setTimeout(go, 400); return; }
      if (!document.querySelector('.sheet-wrap.open.ev-sheet')) evSheetOpen();
      return;
    }
    if (Date.now() - t0 < 2500 && typeof CTX !== 'undefined' && !CTX.proxy) { setTimeout(go, 400); return; }      // lancement à froid : le serveur n'a pas encore répondu
    const up = typeof evUpcoming === 'function' ? evUpcoming(evDay(Date.now()), 14) : null, p = up && evPack(up.pack);
    if (p && p.txt) toast(T('{name} : rendez-vous le {d} !', { name: T(p.txt.short), d: new Date(up.from + 'T12:00:00Z').toLocaleDateString(LOC(), { day: 'numeric', month: 'long', timeZone: 'UTC' }) }));
  };
  setTimeout(go, 450);
}
