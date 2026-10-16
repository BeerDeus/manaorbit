/* ── me.js : « Compte et réglages », une seule fiche du bas (bouton du compte, dans l'en-tête), qui se ferme en la tirant vers le bas ─────────────
   En haut, le compte : connecté, photo, pseudo, e-mail, état de la synchro et « Modifier » ; sinon « Se connecter ». Puis cartes · decks · valeur.
   Mon compte (connecté) : gérer le compte, decks publiés, lien d'échange, amis (friends.js) · Préférences : langue, thème, vibrations, astuces (tour.js) (changés sur place), notifications,
   scan, widget (appli Android) · Prix : CardTrader · Plus : aide et avis, données de l'appareil, application (navigateur), confidentialité et mentions ·
   version, « Se déconnecter ». Les rubriques ouvrent leur propre fiche par-dessus (app.js › setPrixSheet, setDataSheet…). */
const ME = { api: null, sig: '', raf: 0 };
const meOpen = () => !!(ME.api && sheets.indexOf(ME.api) >= 0);
/** Ouvre la fiche (ou la garde si elle l'est déjà) ; sub : rubrique à ouvrir par-dessus ('prix', 'donnees', 'conf', 'app', 'aide', 'scan', 'widget', 'compte', 'pub', 'notif', 'amis'). */
function openSettings(sub) {
  if (!meOpen()) openSheet(T('Compte et réglages'), null, api => {
    ME.api = api; ME.sig = ''; api.wrap.classList.add('me-sheet');
    api.body.addEventListener('click', meClick);
    api.body.addEventListener('change', meChange);
    mePaint();
    if (cloudOn()) pdMine().then(() => meSoon(), () => {});      // « Decks publiés : 2 / 10 »
    if (cloudOn()) amRefresh();      // « Amis : 2 demandes »
  });
  if (sub) meSub(sub);
}
const meSoon = () => { if (!ME.raf) ME.raf = requestAnimationFrame(() => { ME.raf = 0; mePaint(); }); };
const meName = u => PROF.name || (u && (u.displayName || u.email)) || '';
const meGroup = (title, rows) => `<div class="me-h">${title}</div><div class="me-g">${rows.join('')}</div>`;
const meChev = '<svg class="i me-chev" aria-hidden="true"><use href="#i-chev"/></svg>';
const meRow = (me, title, value, warn, id) => `<button type="button" class="me-row"${id ? ` id="${id}"` : ''} data-me="${me}"><span class="me-t">${title}</span>${value ? `<span class="me-v${warn ? ' warn' : ''}">${value}</span>` : ''}${meChev}</button>`;
/** Ce qui change l'affichage de la fiche : elle n'est repeinte que si ceci change (une synchro ne doit pas fermer la liste des langues qu'on parcourt). */
function meSigNow() {
  const u = D.user;
  return [u ? u.uid : '', u ? meName(u) + '|' + (u.email || '') + '|' + acctVerified(u) : D.state + (D.hint && !D.authReady ? 'h' : ''), PROF.photo ? PROF.photo.length : 0, D.pending, D.listErr, allDecks().length, collCount(), Math.round(homeValue() / 100),
    PD.mine && PD.mineUid === (u && u.uid) ? PD.mine.size : -1, TR.share ? 1 : 0, amSig(), S.token ? 1 : 0, typeof ctReady === 'function' && ctReady() ? 1 : 0, typeof scsEdLabel === 'function' ? scsEdLabel() : '', I18N.lang,
    typeof opnSv === 'function' ? JSON.stringify(opnSv()) : ''].join('§');      // mode streamer (opening.js) : la fiche ne montre que la session
}
function mePaint() {
  if (!meOpen()) return;
  const sig = meSigNow(); if (sig === ME.sig) return; ME.sig = sig;
  const b = ME.api.body, u = D.user, nat = typeof isNativeApp === 'function' && isNativeApp(), sv = typeof opnSv === 'function' ? opnSv() : null;      // sv : mode streamer (opening.js) : ni e-mail ni identifiants, la session seule
  const who = u && sv && meName(u) === u.email ? T('Compte') : meName(u);
  const top = u
    ? `<div class="me-who"><span class="who-av me-av" id="meAv">${esc((who.trim()[0] || '?').toUpperCase())}</span>
        <span class="me-wt"><b>${esc(who || T('Compte'))}${typeof prgPill === 'function' ? prgPill() : ''}</b>${u.email && u.email !== who && !sv ? `<span>${esc(u.email)}</span>` : ''}<span class="me-sync${D.listErr ? ' warn' : ''}">${esc(D.listErr || (D.pending ? T('Synchronisation…') : T('Synchronisé')))}</span></span>
        <button class="btn ghost small" type="button" data-me="profil" id="meProfile">${T('Modifier')}</button></div>`
    : D.hint && !D.authReady ? `<div class="me-in"><p class="hint">${T('Connexion au compte…')}</p></div>`
    : `<div class="me-in"><b>${T('Connecte-toi')}${typeof prgPill === 'function' ? prgPill() : ''}</b><span class="hint">${T('Sauvegarde ta collection, tes decks et ta liste d\'échange, et retrouve-les sur tous tes appareils.')}</span><button class="btn small" type="button" data-me="compte" id="meLogin">${T('Se connecter')}</button></div>`;
  const n = sv ? sv.n : collCount(), v = sv ? sv.v : homeValue();
  const stats = `<div class="me-stats"><button type="button" data-me="coll"><b>${nf0(n)}</b><span>${T(n > 1 ? 'cartes' : 'carte')}</span></button><button type="button" data-me="decks"><b>${nf0(allDecks().length)}</b><span>${T(allDecks().length > 1 ? 'decks' : 'deck')}</span></button><button type="button" data-me="valeur"><b>${v ? '≈ ' + esc(fmt(Math.round(v / 100) * 100)).replace(/[,.]00(?=\s|$| )/, '') : '—'}</b><span>${T('valeur')}</span></button></div>`;
  const mine = PD.mine && u && PD.mineUid === u.uid ? PD.mine.size : -1;
  const acct = sv ? meGroup(T('Mode streamer'), [meRow('opn', T('Session d\'ouverture'), esc(opnPillTxt(OPN.cur)))]) : u ? meGroup(T('Mon compte'), [
    meRow('compte', T('Gérer le compte'), acctVerified(u) ? '' : T('Adresse à vérifier'), !acctVerified(u), 'meAcct'),
    meRow('pub', T('Decks publiés'), mine >= 0 ? esc(`${nf0(mine)} / ${PUB_MAX}`) : ''),
    meRow('trade', T('Lien d\'échange'), TR.share ? T('Actif') : T('Aucun')),
    amMeRow(),      // amis (friends.js) : vide si le serveur ne les a pas
  ]) : '';
  const prefs = meGroup(T('Préférences'), [
    `<label class="me-row" for="setLang"><span class="me-t">${T('Langue')}</span><span class="sel me-sel"><select id="setLang">${i18nLangs().map(([c, nm]) => `<option value="${c}" ${c === I18N.lang ? 'selected' : ''}>${esc(nm)}</option>`).join('')}</select></span></label>`,
    `<div class="me-row me-th"><span class="me-t" id="meThL">${T('Thème')}</span><div class="seg" id="segTheme" role="radiogroup" aria-labelledby="meThL"></div></div>`,
    `<label class="me-row switch-row" for="setHaptic"><span class="me-t">${T('Vibrations')}${typeof navigator !== 'undefined' && navigator.vibrate ? '' : `<small>${T('Indisponible sur cet appareil')}</small>`}</span><span class="switch"><input type="checkbox" id="setHaptic" ${S.haptic ? 'checked' : ''}><i></i></span></label>`,
    ...(typeof tipPrefRow === 'function' ? [tipPrefRow()] : []),      // astuces (tour.js)
    `<button type="button" class="me-row" id="btnNotif"><span class="me-t">${T('Notifications')}</span><span class="me-v">${T('Fin de recherche, alertes')}</span>${meChev}</button>`,
    meRow('scan', T('Scan'), typeof scsEdLabel === 'function' ? esc(scsEdLabel()) : ''),
    ...(nat ? [meRow('widget', T('Widget'), '')] : []),
  ]);
  const price = meGroup(T('Prix'), [meRow('prix', 'CardTrader', S.token ? T('Ton token') : typeof ctReady === 'function' && ctReady() ? T('Compte du serveur') : T('Sans token'))]);
  const more = meGroup(T('Plus'), [
    meRow('aide', T('Aide et avis'), ''),
    meRow('donnees', T('Données de l\'appareil'), ''),
    ...(nat ? [] : [meRow('app', T('Application'), PWA.state() === 'standalone' || PWA.state() === 'installed' ? T('Installée') : '')]),
    meRow('conf', T('Confidentialité et mentions'), ''),
  ]);
  const ver = `<p class="hint set-ver">${T('Version {v}', { v: esc(typeof DD_BUILD === 'string' ? DD_BUILD : 'dev') })}${nat ? ' · APK<span class="set-apkv"></span> : ' + NAT_PLUGINS.map(([nn, l]) => (natPlugin(nn) ? '✓' : '✗') + l).join(' ') + '<span class="set-fb"></span>' : ''}</p>`;
  b.innerHTML = top + stats + acct + prefs + price + more + ver + (u ? `<button class="btn ghost-danger small me-out" type="button" data-me="out">${T('Se déconnecter')}</button>` : '');
  if (u) profImg($('#meAv', b), profAvatar());
  mountSeg($('#segTheme', b), [{ v: 'auto', label: T('Auto') }, { v: 'light', label: T('Clair') }, { v: 'dark', label: T('Sombre') }], S.theme, val => { S.theme = val; applyTheme(); saveStore(); });
  // APK : sa version et Firebase (google-services.json), lus auprès de la coque ; APK sans plugin ManaOrbit ou info() refusé : la ligne reste telle quelle
  const mo = nat && typeof natPlugin === 'function' && natPlugin('ManaOrbit');
  if (mo) Promise.resolve().then(() => mo.info()).then(i => { const vv = $('.set-apkv', b), f = $('.set-fb', b); if (!i || !vv || !f) return; if (i.version) vv.textContent = ' ' + i.version + (i.build ? ' (' + i.build + ')' : ''); f.textContent = ' ' + (i.firebase ? '✓' : '✗') + 'Firebase'; }).catch(() => {});
}
function meChange(e) {
  const t = e.target;
  if (t.id === 'setLang') { try { localStorage.setItem('deckdeal:lang', t.value); } catch (x) { /* ignore */ } location.reload(); }
  else if (t.id === 'setHaptic') { S.haptic = t.checked; saveStore(); haptic('ok'); }
  else if (t.id === 'setTips' && typeof tipPref === 'function') tipPref(t.checked);
}
function meClick(e) {
  if (e.target.closest('#btnNotif')) { haptic('tap'); openNotifSettings(); return; }
  const b = e.target.closest('[data-me]'); if (!b) return;
  haptic('tap'); meSub(b.dataset.me);
}
/** Une rubrique de la fiche (ou un raccourci : cartes, decks, valeur, lien d'échange — la fiche se ferme alors). */
function meSub(k) {
  const leave = fn => { if (meOpen()) ME.api.close(); setTimeout(fn, reduceMotion() ? 0 : 200); };
  if (k === 'compte') openAccount();
  else if (k === 'profil') openProfile();
  else if (k === 'niveau' && typeof prgSheet === 'function') prgSheet();      // niveau et badges (progress.js, lien de test)
  else if (k === 'pub') pdListSheet();
  else if (k === 'amis') amSheet();
  else if (k === 'scan') scsSheet();
  else if (k === 'widget') setWidgetSheet();
  else if (k === 'notif') openNotifSettings();
  else if (k === 'prix') setPrixSheet();
  else if (k === 'aide') setHelpSheet();
  else if (k === 'donnees') setDataSheet();
  else if (k === 'app') setAppSheet();
  else if (k === 'conf') setConfSheet();
  else if (k === 'trade') leave(() => navGo('trade'));
  else if (k === 'coll') leave(() => navGo('coll'));
  else if (k === 'decks') leave(() => navGo('decks'));
  else if (k === 'valeur') leave(() => navOpen(() => openCollection('stats')));
  else if (k === 'opn' && typeof opnSheet === 'function') opnSheet();
  else if (k === 'out') meSignOut();
}
async function meSignOut() {
  const b = ME.api && $('.me-out', ME.api.body); if (b) b.disabled = true;
  try { await syncFlush(); await amOut(); await D.cloud.signOut(); if (meOpen()) ME.api.close(); toast(T('Déconnecté')); }      // syncFlush : ce qui attend part d'abord ; amOut : cet appareil ne reçoit plus les notifications des amis de ce compte
  catch (err) { if (b) b.disabled = false; toast(T('Déconnexion impossible')); }
}
