// Présentation de l'appli, à épingler en haut du profil : ce qu'on y fait, en une diapo par usage.
export default {
  id: '01-bienvenue',
  titre: 'Mana Orbit, c\'est quoi ?',
  resume: 'Post de présentation, à épingler : pourquoi l\'appli existe, puis ses cinq usages (scanner, chiffrer, échanger, monter un deck, jouer). Pour qui arrive sur le profil sans connaître.',
  type: 'Présentation',
  quand: 'Semaine 1, lundi (le premier, à épingler)',
  epingle: true,
  diapos: [
    { g: 'couverture', kicker: 'Mana Orbit', titre: 'L\'appli que je voulais *en tant que joueur de Magic*', sous: 'Ta collection, ses prix, tes échanges et tes parties, au même endroit', sousL: 520,
      visuel: { tel: { ecran: 'accueil', x: 560, y: 600, l: 470, rot: 6 } } },
    { g: 'texte', kicker: 'Pourquoi', titre: 'Trois applis pour *une seule collection*',
      texte: 'Une pour scanner, une pour les prix, une pour les decks. Et un tableur pour les échanges, jamais à jour.\n\nAlors j\'ai codé celle qui fait tout ça d\'un coup, en partant de ce qui m\'agaçait à la table.',
      signature: 'Martin, joueur et développeur de Mana Orbit',
      pastilles: [{ t: '{W}{U}{B}{R}{G}', x: 640, y: 1060, rot: -4 }] },
    { g: 'ecran', kicker: 'Mana Orbit', num: '1', titre: 'Tu *scannes*', texte: 'Tu cadres le nom, l\'appli trouve la carte. En français, en japonais, en russe : 11 langues.',
      tel: { ecran: 'scan-6' } },
    { g: 'ecran', kicker: 'Mana Orbit', num: '2', titre: 'Tu sais *ce qu\'elle vaut*', texte: 'La cote Cardmarket de chaque carte, la courbe de ta collection, ce qui a bougé cette semaine.',
      tel: { ecran: 'valeur' } },
    { g: 'ecran', kicker: 'Mana Orbit', num: '3', titre: 'Tu *échanges*', texte: 'Tes doublons et ce que tu cherches, dans un lien ou un QR code qui suit ta collection.',
      tel: { ecran: 'qr', ty: 300 } },
    { g: 'ecran', kicker: 'Mana Orbit', num: '4', titre: 'Tu *montes* tes decks', texte: 'Les decks Commander que ta collection permet presque, et ce qu\'il te manque pour les finir.',
      tel: { ecran: 'decks' } },
    { g: 'ecran', kicker: 'Mana Orbit', num: '5', titre: 'Et tu *joues*', texte: 'Un téléphone au milieu de la table : points de vie, blessures de commandant, poison, monarque.',
      tel: { ecran: 'partie' } },
    { g: 'fin', texte: 'Sur Android, et dans le navigateur sur iPhone et ordinateur.' },
  ],
  legende: `Si tu tombes ici pour la première fois : salut, moi c'est Martin, et Mana Orbit c'est l'appli que je code depuis des mois pour mes propres cartes.

L'idée de départ était simple : arrêter de jongler entre trois applis et un tableur pour savoir ce que j'ai, ce que ça vaut et avec quoi je peux jouer ce soir.

Elle est gratuite, en français, et je lis tous les commentaires. Si un truc manque, dis-le, c'est souvent comme ça que les nouvelles fonctions arrivent.`,
  hashtags: ['#mtg', '#magicthegathering', '#mtgfrance', '#mtgcollection', '#commander'],
  commentaire: 'Tu gères ta collection comment aujourd\'hui : appli, tableur, ou « je sais à peu près ce que j\'ai » ?',
  alt: [
    'Couverture : « L\'appli que je voulais en tant que joueur de Magic », téléphone ouvert sur l\'accueil de Mana Orbit avec la valeur de la collection.',
    'Texte : trois applis pour une seule collection, pourquoi Mana Orbit existe, signé Martin.',
    'Scan : l\'écran de scan avec six cartes reconnues, chacune dans sa langue.',
    'Valeur : la valeur de la collection au prix Cardmarket et sa courbe dans le temps.',
    'Échange : le QR code de la liste d\'échange.',
    'Decks : les decks Commander à monter avec la part des cartes déjà possédées.',
    'Partie : le compteur de vie pour quatre joueurs.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'À épingler sur le profil juste après la publication (… › Épingler sur le profil).',
    'Diapo 2 et légende : c\'est ta voix. Relis et change ce qui ne te ressemble pas (le « depuis des mois » vient de la vidéo de lancement).',
  ],
};
