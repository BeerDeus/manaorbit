// Règles : les quatre façons de perdre une partie de Commander, puis le compteur de vie qui les suit.
export default {
  id: '03-perdre-en-commander',
  titre: 'Les 4 façons de perdre en Commander',
  resume: 'Post « règles » qui se partage : points de vie, 21 blessures d\'un même commandant, 10 poison, bibliothèque vide. Rappels précis (dégâts de combat seulement, total par commandant), puis le compteur de vie de l\'appli.',
  type: 'Règles',
  quand: 'Semaine 1, samedi 11 h (à épingler)',
  epingle: true,
  diapos: [
    { g: 'couverture', kicker: 'Règles · Commander', titre: 'En Commander, il y a *4 façons* de perdre', sous: 'Et la quatrième, tout le monde l\'oublie', sousL: 560,
      visuel: { gros: '4', taille: 620, droite: 90, bas: 60 } },
    { g: 'chiffre', kicker: 'Règles · Commander', gros: '0', titre: 'Plus de *points de vie*', texte: 'On part de **40**. La plus évidente, et la seule que tout le monde compte sans se tromper.', mana: 'W' },
    { g: 'chiffre', kicker: 'Règles · Commander', gros: '21', titre: 'Blessures d\'un *même* commandant', texte: '**21** blessures de **combat** infligées par le même commandant, sur toute la partie. Les dégâts d\'un sort ne comptent pas, et chaque commandant adverse a son propre total.', carte: { scry: 'Edgar Markov', lang: 'fr', x: 640, y: 110, l: 360 } },
    { g: 'chiffre', kicker: 'Règles · Commander', gros: '10', titre: 'Marqueurs *poison*', texte: 'Comme dans les autres formats : **10**, et c\'est fini, même avec 40 points de vie. L\'infection y mène plus vite qu\'on croit.', carte: { scry: 'Glistener Elf', lang: 'fr', x: 660, y: 110, l: 340 } },
    { g: 'chiffre', kicker: 'Règles · Commander', gros: '∅', titre: 'Piocher dans une *bibliothèque vide*', texte: 'Celle qu\'on oublie. Tu dois piocher et il n\'y a plus de carte : tu perds tout de suite, pas à la fin du tour. Gare aux cartes qui font piocher tout le monde.', carte: { scry: 'Windfall', lang: 'fr', x: 660, y: 110, l: 340 } },
    { g: 'ecran', kicker: 'Règles · Commander', titre: 'Le compteur *suit tout ça*', texte: 'Blessures de chaque commandant, poison, impôt, monarque. À 21 ou à 10, il propose l\'élimination.',
      tel: { ecran: 'partie' }, pastilles: [{ t: '**21** de Paul', x: 100, y: 1000, rot: -5, c: 'r' }] },
    { g: 'fin' },
  ],
  legende: `La règle des 21 blessures, on croit tous la connaître. Et pourtant à chaque soirée quelqu'un compte les dégâts d'un sort du commandant, ou additionne deux commandants différents.

Le rappel en version courte. La quatrième, on la découvre le jour où quelqu'un joue un « chaque joueur pioche 7 cartes » au mauvais moment.

Enregistre-le pour la prochaine dispute à la table.`,
  hashtags: ['#mtg', '#commander', '#edh', '#mtgfrance', '#magicthegathering'],
  commentaire: 'Chez vous, on perd le plus souvent comment ? Points de vie, commandant, poison ou bibliothèque vide ?',
  alt: [
    'Couverture : « En Commander, il y a 4 façons de perdre », un grand chiffre 4 en dégradé.',
    'Zéro point de vie : on commence à 40.',
    '21 blessures de combat infligées par un même commandant, chaque commandant a son propre total, avec la carte Edgar Markov.',
    '10 marqueurs poison, même avec 40 points de vie, avec la carte Elfe luisant (infection).',
    'Piocher dans une bibliothèque vide fait perdre tout de suite, avec la carte Aubaine qui fait piocher tout le monde.',
    'Le compteur de vie de Mana Orbit pour quatre joueurs, avec les blessures de commandant.',
    'Fin : logo Mana Orbit, gratuite sur Google Play, manaorbit.app.',
  ],
  publication: [
    'À épingler : c\'est le genre de post qu\'on envoie à son groupe de jeu.',
    'En commentaire, on te parlera sûrement des cartes qui disent « tu perds la partie » ou « tu gagnes la partie » : elles existent en plus de ces quatre règles, c\'est une bonne réponse à faire.',
  ],
};
