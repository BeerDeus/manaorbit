/* ── « Envoyer sur CardTrader » : un deck devient une liste de souhaits privée sur le compte CardTrader de l'utilisateur ───────────────
   POST /wishlists (API CardTrader : deck_items_from_text_deck, une ligne « 1 Sol Ring » par carte), relayé par le proxy avec SON token
   (ou le compte du serveur pour un compte autorisé) : jamais avec la lecture publique. CardTrader y cherche ensuite les offres (Optimiseur). */
const CTW_MAX = 500;      // lignes par liste (un deck Commander en compte 100 au plus ; garde-fou contre un texte collé démesuré)
const ctwText = items => items.slice(0, CTW_MAX).map(x => x.q + ' ' + x.n).join('\n');
const ctwUrl = id => ctShare('https://www.cardtrader.com/' + (I18N.lang === 'fr' ? 'fr-FR/' : '') + 'wishlists' + (id ? '/' + encodeURIComponent(id) : ''));

/** o : { text (decklist), name, owned (k → exemplaires possédés, facultatif) }. */
function ctWishSheet(o) {
  if (typeof mkUs === 'function' && mkUs()) return;
  if (!ctOwn()) { ctGetSheet(() => ctWishSheet(o), T('Envoyer un deck sur CardTrader demande ton token CardTrader : la liste de souhaits est créée sur ton compte.')); return; }
  const all = deckMissing(o.text, null), miss = o.owned ? deckMissing(o.text, o.owned) : all;
  if (!all.length) { toast(T('Rien à envoyer : ce deck n\'a aucune carte (hors terrains de base).')); return; }
  const both = miss.length > 0 && miss.length < all.length, sum = l => l.reduce((a, x) => a + x.q, 0);
  let pick = miss.length ? 'miss' : 'all';
  openSheet(T('Envoyer sur CardTrader'), T('Liste de souhaits'), api => {
    const b = api.body;
    b.innerHTML = `${both ? `<div class="seg" id="ctwSeg"></div>` : ''}
      <label class="label" for="ctwName">${T('Nom de la liste')}</label><input id="ctwName" maxlength="80" value="${esc(String(o.name || T('Deck')).slice(0, 80))}">
      <p class="hint" id="ctwHint"></p>
      <div class="status" data-ok="0" hidden><span class="dot"></span><span class="ctw-m"></span></div>`;
    const hint = () => { const l = pick === 'miss' ? miss : all; $('#ctwHint', b).textContent = TN(sum(l), '{n} carte sera ajoutée à une liste de souhaits privée de ton compte CardTrader (terrains de base exclus). CardTrader y cherche ensuite les meilleures offres.', '{n} cartes seront ajoutées à une liste de souhaits privée de ton compte CardTrader (terrains de base exclus). CardTrader y cherche ensuite les meilleures offres.'); };
    if (both) mountSeg($('#ctwSeg', b), [{ v: 'miss', label: T('À acheter ({n})', { n: sum(miss) }) }, { v: 'all', label: T('Tout le deck ({n})', { n: sum(all) }) }], pick, v => { pick = v; hint(); });
    hint();
    api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Annuler')}</button><button class="btn" type="button" id="ctwGo">${T('Envoyer')}</button>`);
    const go = $('#ctwGo', api.foot), st = $('.status', b), m = $('.ctw-m', b);
    go.onclick = async () => {
      const name = ($('#ctwName', b).value || '').trim() || T('Deck'), l = pick === 'miss' ? miss : all;
      go.disabled = true; go.textContent = T('Envoi…'); st.hidden = false; st.dataset.ok = '0'; m.textContent = T('Envoi…');
      try {
        const r = await ct('wishlists', { method: 'POST', body: { deck: { game_id: 1, name: name.slice(0, 80), public: false, deck_items_from_text_deck: ctwText(l) } } });
        const id = r && (r.id || (r.deck && r.deck.id) || (r.wishlist && r.wishlist.id));
        st.dataset.ok = '1'; m.textContent = T('Liste de souhaits « {name} » créée sur CardTrader.', { name }); haptic('ok');
        api.setFoot(`<button class="btn ghost" type="button" data-close>${T('Fermer')}</button><a class="btn" style="text-decoration:none" href="${esc(ctwUrl(id))}" target="_blank" rel="noopener">${T('Ouvrir sur CardTrader')}</a>`);
      } catch (e) {
        st.dataset.ok = '0'; haptic('bad');
        m.textContent = e.code === 'auth' ? (S.token ? T('CardTrader refuse ce token : vérifie-le sur la page API de CardTrader.') : authHint(e).msg) : e.code === 'network' ? T('CardTrader est injoignable.') : (e.message || T('Erreur'));
        go.disabled = false; go.textContent = T('Réessayer');
      }
    };
  });
}
