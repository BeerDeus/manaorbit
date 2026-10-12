/* ── migrate.js : déménagement de card.m2s-photo.fr vers manaorbit.app (12 octobre 2026) — lu avant tout le reste ─────────────────────
   Les données gardées par le navigateur (localStorage « deckdeal:* » : collection, decks, échange, réglages…) dépendent de l'adresse du site.
   · Navigateur : l'ancienne adresse sert une page de déménagement (proxy.mjs › oldPage) qui renvoie ici avec ses données dans l'adresse (#mig=…,
     jamais envoyé au serveur). Elles sont reprises avant le démarrage de l'appli, sans rien écraser de ce qui est déjà ici, et seulement si la page
     d'avant est bien l'ancienne adresse (un lien piégé ne peut rien remplir) ; l'adresse est aussitôt nettoyée.
   · Appli Android mise à jour (manaorbit.app) : ses données sont restées sous l'ancienne adresse, dans la même WebView. Une seule fois, si rien n'est
     encore ici et que l'ancienne adresse répond (/__mig) : passage par la page de déménagement (?mig=app), retour ici avec les données.
     Appli installée après le déménagement (info().installed de la coque, APK récente ; Play Store compris) : l'ancienne adresse n'a jamais rien gardé
     pour elle, pas de détour. Coque plus ancienne sans cette date : le détour, comme avant.
   window.__MIG_FROM : anciens hôtes acceptés · __MIG_SITE, __MIG_OLD : nouvel hôte et ancienne adresse de l'appli native (tests). */
(function () {
  if (typeof location === 'undefined' || typeof localStorage === 'undefined' || typeof window === 'undefined') return;
  const OLD = window.__MIG_OLD || 'https://card.m2s-photo.fr', SITE = window.__MIG_SITE || 'manaorbit.app', from = window.__MIG_FROM || ['card.m2s-photo.fr'];
  const MOVED = Date.UTC(2026, 9, 12);      // jour du déménagement
  try {
    if (location.hash.slice(0, 5) === '#mig=') {
      const raw = location.hash.slice(5);
      history.replaceState(history.state, '', location.pathname + location.search);      // ni dans l'historique, ni dans un lien copié
      let ref = ''; try { ref = new URL(document.referrer).host; } catch (e) { /* pas de page d'avant */ }
      if (raw && from.includes(ref)) {
        const bin = atob(raw.replace(/-/g, '+').replace(/_/g, '/')), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const o = JSON.parse(new TextDecoder().decode(bytes)), over = !!localStorage.getItem('deckdeal:migtry') && !localStorage.getItem('deckdeal:migrated');      // appli Android : rien n'était là au départ, ce que le démarrage a écrit peut être remplacé
        let n = 0;
        if (o && typeof o === 'object') for (const k of Object.keys(o)) {
          const v = o[k];
          if (/^deckdeal:[\w:.-]{1,40}$/.test(k) && !/^deckdeal:mig/.test(k) && typeof v === 'string' && v.length <= 4e6 && (over || localStorage.getItem(k) === null)) { localStorage.setItem(k, v); n++; }
        }
        localStorage.setItem('deckdeal:migrated', JSON.stringify({ at: Date.now(), n }));
        if (n) setTimeout(() => { if (typeof toast === 'function' && typeof T === 'function') toast(T('Mana Orbit a déménagé sur manaorbit.app : tes données ont suivi.')); }, 1800);
      }
    }
  } catch (e) { /* illisible : l'appli démarre sans */ }
  try {
    const cap = window.Capacitor, native = !!(cap && cap.isNativePlatform && cap.isNativePlatform());
    if (native && location.hostname === SITE && !localStorage.getItem('deckdeal:migtry') && !localStorage.getItem('deckdeal:migrated') && !localStorage.getItem('deckdeal:coll:v1') && !localStorage.getItem('deckdeal:decks:v1')) {
      localStorage.setItem('deckdeal:migtry', String(Date.now()));      // une seule tentative, même si l'ancienne adresse ne répond plus
      const mo = cap.isPluginAvailable && cap.isPluginAvailable('ManaOrbit') && cap.Plugins && cap.Plugins.ManaOrbit;
      const before = mo ? Promise.resolve().then(() => mo.info()).then(i => !(i && i.installed >= MOVED), () => true) : Promise.resolve(true);      // installée avant le déménagement (ou date inconnue)
      before.then(go => {
        if (!go) return;
        const ctl = new AbortController(); setTimeout(() => ctl.abort(), 4000);
        return fetch(OLD + '/__mig', { signal: ctl.signal, cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(j => { if (j && j.ok) location.replace(OLD + '/?mig=app'); });
      }).catch(() => {});
    }
  } catch (e) { /* pas d'appli native */ }
})();
