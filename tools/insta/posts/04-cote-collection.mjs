// Fonction : comment la valeur de la collection est calculée (README › Prix, Alertes de prix), et ce qu'elle ne dit pas.
export default {
  id: '04-cote-collection',
  titre: 'Ce que vaut vraiment ta collection',
  resume: 'Post « fonction » honnête : d\'où vient la cote (tendance Cardmarket, prix de l\'édition), la courbe, les alertes de prix, et ce que le chiffre ne compte pas (état, frais, prix de rachat).',
  type: 'Fonction',
  quand: 'Semaine 2, mardi',
  diapos: [
    { g: 'couverture', kicker: 'Ta collection', titre: 'Ton classeur vaut *combien*, vraiment ?', sous: 'D\'où vient le chiffre, et ce qu\'il ne compte pas', sousL: 520,
      visuel: { tel: { ecran: 'valeur', x: 560, y: 600, l: 470, rot: 6 } } },
    { g: 'ecran', kicker: 'Ta collection', num: '1', titre: 'Le prix *tendance*', texte: 'Chaque carte est chiffrée au prix tendance Cardmarket du jour : ce qu\'elle se vend en ce moment, pas l\'offre la plus folle.',
      tel: { ecran: 'collection', ty: 150 }, loupes: [{ crop: [560, 560, 424, 330], x: 600, y: 900, l: 420, rot: 3 }] },
    { g: 'etapes', kicker: 'Ta collection', titre: 'Chaque exemplaire *son prix*', texte: 'Deux Sol Ring ne valent pas forcément pareil.', y: 470, etapes: [
      ['Avec son édition', 'Extension et numéro posés : le prix de **cette** impression, et son prix foil si elle est foil.', '1'],
      ['Sans édition', 'Le prix de l\'impression la moins chère. Ta collection n\'est jamais surestimée.', '2'],
      ['Les terrains de base', 'Jamais chiffrés. 40 Forêts ne gonflent pas le total.', '3'],
    ] },
    { g: 'ecran', kicker: 'Ta collection', num: '2', titre: 'Jour après *jour*', texte: 'La courbe de ta collection et l\'écart sur 7 et 30 jours. Une sortie fait bouger tes cartes, tu le vois le lendemain.',
      tel: { ecran: 'valeur', ty: 120 }, pastilles: [{ t: '**▲ +86 €** en 7 jours', x: 520, y: 1020, rot: -3, c: 'ok' }] },
    { g: 'chiffre', kicker: 'Ta collection', gros: '−30 %', taille: 260, titre: 'Les *alertes* de prix', texte: 'Les cartes qui manquent à tes decks sont surveillées toutes seules. Si l\'une chute de 30 % (réglable), tu reçois une notification, même appli fermée.',
      carte: { scry: 'Smothering Tithe', x: 380, y: 760, l: 330, rot: -5 }, pastilles: [{ t: '🔔 **Alerte de prix**', x: 560, y: 1150, rot: -3 }] },
    { g: 'etapes', kicker: 'Ta collection', titre: 'Ce que le chiffre *ne compte pas*', mini: true, y: 340, etapes: [
      ['L\'état de la carte', 'Une carte jouée vaut moins qu\'une carte neuve. La cote suppose une carte en bon état.', '✕'],
      ['Les frais', 'Port, commission, enveloppe : à la revente, ils sortent de ta poche.', '✕'],
      ['Le prix de rachat', 'Une boutique t\'en donnera moins, c\'est normal. La cote, c\'est un prix entre joueurs.', '✕'],
      ['Ton attachement', 'Le foil de ton premier commandant ne se chiffre pas.', '♥'],
    ] },
    { g: 'fin' },
  ],
  legende: `« Ta collection vaut 2 420 € » : ça fait plaisir, mais ça veut dire quoi exactement ?

J'ai voulu que le chiffre soit prudent plutôt que flatteur. Une carte sans édition est comptée à son impression la moins chère, et les terrains de base ne comptent pas.

Par contre l'état des cartes, l'appli ne le devine pas : si ton classeur a fait trois déménagements, garde une marge.`,
  hashtags: ['#mtg', '#mtgcollection', '#mtgfinance', '#cardmarket', '#mtgfrance'],
  commentaire: 'Ta carte la plus chère, c\'est laquelle ? (Celle que tu ne vendras jamais compte aussi.)',
  alt: [
    'Couverture : « Ton classeur vaut combien, vraiment ? », téléphone ouvert sur les statistiques de la collection.',
    'La liste de la collection avec le prix Cardmarket de chaque carte.',
    'Chaque exemplaire son prix : avec son édition, sans édition, terrains de base jamais chiffrés.',
    'La courbe de la valeur de la collection et sa hausse sur 7 jours.',
    'Les alertes de prix : une notification quand une carte surveillée chute de 30 %, avec la carte Dîme étouffante.',
    'Ce que la cote ne compte pas : l\'état, les frais, le prix de rachat, l\'attachement.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Ne pas promettre de prix CardTrader : sans token, l\'appli donne la tendance Cardmarket (aux États-Unis, TCGplayer).',
  ],
};
