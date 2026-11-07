// Jeu : devine la carte en 5 indices (une diapo par indice, réponse à la fin), puis la Carte mystère de 18 h.
export default {
  id: '07-devine-la-carte',
  titre: 'Devine la carte en 5 indices',
  resume: 'Post « jeu » : un indice par diapo, la réponse à la fin, les gens commentent à quel indice ils ont trouvé. Se termine sur la Carte mystère de 18 h dans l\'appli. Format à refaire avec d\'autres cartes.',
  type: 'Jeu',
  quand: 'Semaine 3, mercredi vers 17 h 30 (avant la carte de 18 h)',
  diapos: [
    { g: 'couverture', kicker: 'Devine la carte', titre: 'Tu la trouves *en combien d\'indices* ?', sous: 'Un indice par image. La réponse est à la fin : pas de triche.', sousL: 470,
      visuel: { dos: true, x: 600, y: 600, l: 380, rot: 7 } },
    { g: 'indice', kicker: 'Devine la carte', num: '1', texte: 'Je coûte *un seul* mana.' },
    { g: 'indice', kicker: 'Devine la carte', num: '2', texte: 'Je suis *incolore*.' },
    { g: 'indice', kicker: 'Devine la carte', num: '3', texte: 'Je suis là *depuis 1993*.' },
    { g: 'indice', kicker: 'Devine la carte', num: '4', texte: 'On me croise dans *presque tous* les decks Commander.' },
    { g: 'indice', kicker: 'Devine la carte', num: '5', texte: 'Je donne *deux fois plus* que je ne coûte.' },
    { g: 'carte', kicker: 'Devine la carte', titre: 'Anneau solaire *(Sol Ring)*', texte: 'Trouvé à quel indice ? Dis-le en commentaire.',
      carte: { scry: 'Sol Ring', lang: 'fr' }, x: 300, y: 450, l: 490, rot: -4 },
    { g: 'ecran', kicker: 'Carte mystère', titre: 'La vraie, c\'est *tous les soirs à 18 h*', texte: 'Une carte dévoilée petit à petit, un indice toutes les 12 secondes. Plus tu trouves vite, plus tu marques.',
      tel: { ecran: 'mystere-3' } },
    { g: 'fin' },
  ],
  legende: `Petit jeu. Une carte, cinq indices, et tu t'arrêtes dès que tu penses l'avoir.

Celle-là est facile pour les joueurs de Commander, je sais. Les prochaines seront moins gentilles.

Si t'aimes ce genre de truc, il y a une Carte mystère tous les soirs à 18 h dans l'appli, avec un classement.`,
  hashtags: ['#mtg', '#mtgquiz', '#magicthegathering', '#mtgfrance', '#commander'],
  commentaire: 'Moi je dis indice 4. Et toi ? (pas de spoil pour ceux qui n\'ont pas fini)',
  alt: [
    'Couverture : « Tu la trouves en combien d\'indices ? », le dos d\'une carte avec un point d\'interrogation.',
    'Indice 1 : je coûte un seul mana.',
    'Indice 2 : je suis incolore.',
    'Indice 3 : je suis là depuis 1993.',
    'Indice 4 : on me croise dans presque tous les decks Commander.',
    'Indice 5 : je donne deux fois plus que je ne coûte.',
    'Réponse : la carte Anneau solaire (Sol Ring).',
    'La Carte mystère de Mana Orbit, chaque soir à 18 h, avec le chrono et les points.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'Format à décliner : copier ce fichier, changer les 5 indices et la carte de la réponse (scry : son nom anglais, l\'image Scryfall est téléchargée toute seule).',
    'Répondre aux commentaires sans donner la réponse dans les premières heures.',
  ],
};
