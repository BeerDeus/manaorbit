// Guide : importer sa collection depuis une autre appli (pwa/passer-de-manabox.html). Comme pour la vidéo l8 : ni Archidekt ni EDHREC.
export default {
  id: '09-importer-collection',
  titre: 'Changer d\'appli sans tout ressaisir',
  resume: 'Post « guide » à enregistrer : exporter sa collection depuis ManaBox (pas à pas), le chemin d\'export des autres applis, ce qui suit et ce qui ne suit pas. Vise les joueurs déjà équipés.',
  type: 'Guide',
  quand: 'Semaine 4, mardi',
  diapos: [
    { g: 'couverture', kicker: 'Guide · Import', titre: 'Changer d\'appli *sans tout ressaisir*', sous: 'ManaBox, Moxfield, Dragon Shield, Delver Lens… en 2 minutes', sousL: 520,
      visuel: { tel: { ecran: 'manabox', x: 560, y: 600, l: 470, rot: 6 } } },
    { g: 'etapes', kicker: 'Guide · Import', titre: 'Depuis *ManaBox*', y: 360, etapes: [
      ['Exporte', 'Onglet Collection, menu en haut à droite, **Export**. Choisis **CSV** et enregistre le fichier.', '1'],
      ['Importe', 'Dans Mana Orbit : **Collection › Importer** (la flèche vers le bas), puis **Choisir un fichier**.', '2'],
      ['Vérifie', 'L\'aperçu compte tes cartes et signale les noms inconnus. **Ajouter**, puis **Importer**.', '3'],
    ] },
    { g: 'rangs', kicker: 'Guide · Import', titre: 'Depuis *une autre appli*', y: 330, rangs: [
      ['M', '#c79bff', 'Moxfield', 'site', 'Collection › More › Export CSV'],
      ['D', '#7fb0ff', 'Dragon Shield', 'appli', 'Menu du dossier › Export › CSV'],
      ['L', '#ff8fc3', 'Delver Lens', 'appli', 'Export › Create CSV file › Download'],
      ['B', '#ffd479', 'Deckbox', 'site', 'Inventory › Export (CSV)'],
      ['…', '#86d79c', 'Les autres', '', 'Tout CSV avec une colonne « Name », ou une liste « 3 Sol Ring ».'],
    ] },
    { g: 'etapes', kicker: 'Guide · Import', titre: 'Ce qui *suit*, ce qui ne suit pas', y: 340, mini: true, etapes: [
      ['Les quantités', 'Une carte en plusieurs éditions s\'additionne.', '✓'],
      ['Les éditions', 'Code d\'extension et numéro de collection.', '✓'],
      ['La langue de chaque carte', 'Français, anglais, japonais…', '✓'],
      ['Foil, état, classeurs', 'Pas encore. Les listes de souhaits non plus.', '✕'],
    ] },
    { g: 'ecran', kicker: 'Guide · Import', titre: 'Le guide est aussi *dans l\'appli*', texte: 'Les mêmes étapes, à côté du bouton d\'import. Et ta collection ManaBox ne bouge pas : l\'export est une copie.',
      tel: { ecran: 'manabox' } },
    { g: 'fin' },
  ],
  legende: `Tu as déjà passé des heures à scanner ta collection dans une autre appli ? Garde-les.

Un export CSV, un import, et tout arrive : quantités, éditions, langues. J'ai mis les chemins d'export des applis les plus courantes.

Ce qui ne suit pas encore : le foil et l'état. C'est sur ma liste.`,
  hashtags: ['#mtg', '#mtgcollection', '#manabox', '#mtgfrance', '#magicthegathering'],
  commentaire: 'Tu utilises quelle appli pour ta collection aujourd\'hui ?',
  alt: [
    'Couverture : « Changer d\'appli sans tout ressaisir », téléphone ouvert sur le guide « Venir de ManaBox ».',
    'Depuis ManaBox en trois étapes : exporter en CSV, importer dans Mana Orbit, vérifier.',
    'Le chemin d\'export de Moxfield, Dragon Shield, Delver Lens, Deckbox et des autres applis.',
    'Ce qui suit : quantités, éditions, langues. Ce qui ne suit pas encore : foil, état, classeurs.',
    'Le guide d\'import dans l\'appli Mana Orbit.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Un post à enregistrer : le republier en story avec « à garder pour le jour où tu changes d\'appli ».',
    'Les chemins d\'export viennent de la page manaorbit.app/passer-de-manabox : si une appli change son menu, corriger les deux.',
  ],
};
