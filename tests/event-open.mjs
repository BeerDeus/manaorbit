// Cachettes des événements (src/evpacks.js › EV_SPOTS, src/event.js › EV_HIDE) : comment ouvrir l'écran de chacune, comme le ferait le joueur.
// Partagé par event-e2e.mjs (cachettes du jour trouvées dans leur vrai écran) et spots-e2e.mjs (chaque cachette ouverte, objet posé sans couvrir de bouton).
// Code évalué dans la page (dans une fonction async) ; les decks : le premier de allDecks() (spots-e2e en crée, event-e2e n'a pas la capacité decks).
const W = ms => `await new Promise(r => setTimeout(r, ${ms}))`, DK = 'allDecks()[0].id', CS = q => `openCardSheet('sol ring'); ${W(600)}; document.querySelector('.cs-sheet ${q}').click()`;
/** Ouvre l'écran d'une cachette (ce que ferait le joueur) ; '' : l'accueil ; absente : pas d'ouverture simple ici (posée sur l'accueil pour le test du toucher). */
export const OPEN = {
  'home-orb': '', 'home-trade': '', 'home-life': '', 'coll-list': "openCollection('list')", 'coll-stats': "openCollection('stats')", 'trade-list': "openCollection('trade')", 'decks-mine': 'openDecks()',
  'decks-edh': "openCollection('decks')", 'me-head': 'openSettings()', 'me-level': 'prgSheet()', 'help-top': 'openHelp()', 'card-sheet': "openCardSheet('sol ring')", 'viewer-head': "openDeckViewer({ text: '1 Sol Ring\\n1 Arcane Signet', name: 'Test' })",
  'coll-filters': "openCollection('list'); await new Promise(r => setTimeout(r, 500)); document.querySelector('.coll .fbtn').click()",
  'coll-more': "openCollection('list'); await new Promise(r => setTimeout(r, 500)); document.querySelector('.coll .fbtn').click(); await new Promise(r => setTimeout(r, 300)); document.querySelector('.coll .fmore').click()",
  'coll-view': 'cvwSheet()', 'coll-export': 'collExport()', 'coll-proxy': 'openProxies()', 'coll-ms': 'msOptSheet()', 'trade-set': "openCollection('trade'); await new Promise(r => setTimeout(r, 500)); trSetSheet()", 'trade-binder': 'bndOpenSettings()',
  'trade-filters': "openCollection('trade'); await new Promise(r => setTimeout(r, 500)); document.querySelector('.coll .fbtn').click()", 'me-account': 'openAccount()', 'me-profile': 'openProfile()',
  'set-notif': 'openNotifSettings()', 'set-scan': 'scsSheet()', 'set-data': 'setDataSheet()', 'set-conf': 'setConfSheet()', 'set-mentions': 'openAbout()', 'set-help': 'setHelpSheet()', 'help-faq': 'openHelp()',
  'partie-hist': 'puHist()', 'card-text': "openCardSheet('sol ring')",
  // cachettes ajoutées en octobre 2026 (accueil sur ordinateur, onglets, feuilles des decks, des cartes et de la collection)
  'home-value': '', 'coll-places': "openCollection('places')", 'coll-value': `openCollection('stats'); ${W(500)}; document.querySelector('.coll .vl-box').scrollIntoView({ block: 'center' })`,
  'price-list': "dkTabGo('price')", 'viewer-sum': `openDeckViewer({ id: ${DK} })`, 'badge-sheet': `prgSheet(); ${W(600)}; document.querySelector('.prg-sheet .prg-b .prg-ic').click()`,
  'deck-sheet': `openDecks(); ${W(500)}; openDeckSheet(${DK})`, 'deck-cover': `openDeckSheet(${DK}); ${W(500)}; document.getElementById('dkCover').click()`,
  'viewer-hand': `openDeckViewer({ id: ${DK} }); ${W(900)}; document.querySelector('.dvw [data-act="hand"]').click()`, 'deck-share': `openDeckViewer({ id: ${DK} }); ${W(900)}; document.querySelector('.dvw .dv-head [data-act="share"]').click()`,
  'deck-build': `openBuilder({ id: ${DK} })`, 'coll-import': `openCollection('list'); ${W(500)}; document.querySelector('.coll [data-act="import"]').click()`, 'help-switch': `openHelp(); ${W(500)}; swgOpen({ from: 'help' })`,
  'card-add': CS('[data-cs="add"]'), 'card-deck': CS('[data-cs="adddeck"]'), 'card-ed': CS('.cs-ln [data-act="ed"]'), 'card-copy': CS('.cs-ln [data-act="cex"]'),
  'filt-set': `openCollection('list'); ${W(500)}; document.querySelector('.coll .fbtn').click(); ${W(300)}; document.querySelector('.coll .fset').click()`,
  'coll-image': `openCollection('stats'); ${W(500)}; document.querySelector('.coll [data-act="simgcoll"]').click()`, 'coll-prices': `openCollection('list'); ${W(500)}; document.querySelector('.coll [data-act="prices"]').click()`,
};
