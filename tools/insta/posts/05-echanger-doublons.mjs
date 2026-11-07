// Fonction : la liste d'échange (lien, QR, ce que voit le pote, échange en direct).
export default {
  id: '05-echanger-doublons',
  titre: 'Échanger ses doublons sans sortir le classeur',
  resume: 'Post « fonction » pas à pas : la liste d\'échange se remplit seule, un lien ou un QR code, ce que voit l\'autre joueur (onglet « Pour toi »), puis l\'échange en direct face à face.',
  type: 'Fonction',
  quand: 'Semaine 2, jeudi (avant le week-end)',
  diapos: [
    { g: 'couverture', kicker: 'Échange', titre: '« T\'as quoi *en double* ? »', sous: 'La réponse tient dans un QR code', sousL: 480,
      visuel: { tel: { ecran: 'qr', x: 560, y: 560, l: 470, rot: 6, ty: 250 } } },
    { g: 'ecran', kicker: 'Échange', num: '1', titre: 'Tes doublons, *tout seuls*', texte: 'La liste se remplit depuis ta collection : tout ce que tu as en plus de ce que tu gardes. Un exemplaire par défaut, réglable.',
      tel: { ecran: 'echange' }, loupes: [{ crop: [660, 124, 324, 120], x: 600, y: 780, l: 420, rot: 3 }] },
    { g: 'ecran', kicker: 'Échange', num: '2', titre: 'Un lien *toujours à jour*', texte: 'Tu le crées une fois. Tu ajoutes une carte, tu en échanges une : la liste suit, rien à renvoyer.',
      tel: { ecran: 'echange' }, loupes: [{ crop: [30, 250, 924, 340], x: 90, y: 840, l: 900, rot: -2 }] },
    { g: 'ecran', kicker: 'Échange', num: '3', titre: 'Ou le *QR code*', texte: 'En boutique ou en tournoi, l\'autre le scanne avec l\'appareil photo. Pas besoin qu\'il ait l\'appli : ça s\'ouvre dans son navigateur.',
      tel: { ecran: 'qr', ty: 250 } },
    { g: 'ecran', kicker: 'Échange', num: '4', titre: 'Ce qu\'il *voit*', texte: 'Tes cartes à échanger avec leur cote, et ce que tu recherches. L\'onglet « Pour toi » croise vos deux listes.',
      tel: { ecran: 'liste' }, loupes: [{ crop: [10, 280, 964, 140], x: 80, y: 820, l: 920, rot: -2 }] },
    { g: 'etapes', kicker: 'Échange', titre: 'Et face à face : *l\'échange en direct*', texte: 'Chacun sur son téléphone, comme une fenêtre d\'échange dans un jeu.', y: 500, mini: true, etapes: [
      ['Tu reçois, tu donnes', 'Les cartes de chaque côté, avec le total de chacun.', '1'],
      ['La balance', 'L\'écart en euros : vert, orange ou rouge. « Équilibrer » propose de quoi compléter.', '2'],
      ['Prêt, puis Valider', 'Les deux valident, et vos collections se mettent à jour.', '3'],
    ] },
    { g: 'fin' },
  ],
  legende: `Le moment classique en boutique : quelqu'un te demande ce que t'as à échanger, et tu sors un classeur de 400 cartes en disant « attends, je crois que j'en ai une ».

Maintenant je montre un QR code. Il voit mes doublons avec leur prix, ce que je cherche, et on discute à partir de ça.

Le lien se met à jour tout seul, donc tu peux aussi le mettre dans ta bio ou sur le Discord de ta boutique.`,
  hashtags: ['#mtg', '#mtgtrade', '#mtgfrance', '#mtgcollection', '#magicthegathering'],
  commentaire: 'Tu échanges plutôt en boutique, en tournoi, ou entre potes à la maison ?',
  alt: [
    'Couverture : « T\'as quoi en double ? », téléphone ouvert sur le QR code de la liste d\'échange.',
    'La liste d\'échange de Mana Orbit, remplie depuis la collection, en gardant un exemplaire de chaque carte.',
    'Le lien public de la liste d\'échange, avec Copier, Partager et Aperçu.',
    'Le QR code de la liste d\'échange en grand.',
    'La liste d\'échange vue par l\'autre joueur : Pour toi, À échanger, Recherchées.',
    'L\'échange en direct en trois étapes : tu reçois et tu donnes, la balance, prêt puis valider.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'À publier un jeudi ou un vendredi : les gens pensent à leurs échanges avant les soirées du week-end.',
    'Le QR code de la diapo 4 ouvre vraiment manaorbit.app/flyer (le lien fixe des flyers) : quelqu\'un qui le scanne arrive sur le site.',
  ],
};
