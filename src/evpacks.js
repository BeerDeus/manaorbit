/* ── evpacks.js : événements saisonniers, les « packs » (données pures, sans rien du navigateur) ─────────────────────────────────────────────
   Un pack par fête : dates (calcul de Pâques compris), objets à trouver (nombre, quota par jour), palette, textes, badges, messages Discord.
   Ajouter une fête = ajouter un pack ici (et son dessin : evart.js, css/ev-<pack>.css, logos, police des badges) ; le moteur (event.js, event-srv.mjs) ne change pas.
   Lu tel quel par le serveur (event-srv.mjs, discord-events.mjs, tools/gen-event-badges.mjs : createRequire), comme sets.js et progress.js.
   Identifiant d'une édition : `<pack>-<année>` (halloween-2026) ; l'année est celle du début. Jour : heure de Paris, bascule à minuit (comme la Carte mystère).
   Règle des quotas : au moins EV_MIN_DAYS (6) jours de jeu pour tout trouver (total / quota par jour), sur une période d'environ deux semaines (15 jours).
   ready: false : pack préparé mais pas encore dessiné : jamais ouvert tout seul (seulement EVENT_FORCE=<id>, pour l'essayer sur /test). */
const EV_MIN_DAYS = 6, EV_TZ = 'Europe/Paris';
const EV_DAY_MS = 86400000;
/** Date « AAAA-MM-JJ » + n jours. */
const evAdd = (key, n) => new Date(Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10)) + n * EV_DAY_MS).toISOString().slice(0, 10);
/** Jours entre deux dates « AAAA-MM-JJ » (b − a). */
const evDiff = (a, b) => Math.round((Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10))) / EV_DAY_MS);
/** Dimanche de Pâques (calendrier grégorien, algorithme anonyme de Meeus/Jones/Butcher) : « AAAA-MM-JJ ». */
function evEaster(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return `${y}-${String(mo).padStart(2, '0')}-${String(da).padStart(2, '0')}`;
}
/** Période d'environ deux semaines centrée sur une date (« AAAA-MM-JJ ») : 7 jours avant, 7 après (15 jours). */
const evAround = (key, before = 7, after = 7) => ({ from: evAdd(key, -before), to: evAdd(key, after) });

/* Pack : { id, ready, name (français, clé de T), when (année → { from, to } inclus), total, perDay, obj (objet à trouver : one / many, emoji, fem, art (evart.js)),
   pal (couleurs : a principale, b secondaire, c accent ; css/ev-<id>.css les reprend), badge ({ t : nom de la série, tiers : seuils, names : nom de chaque palier }),
   font (police des chiffres de l'année : tools/gen-event-badges.mjs), txt (textes de l'appli, français : clés de T), dsc (messages Discord FR et EN),
   push (notifications push : étape → langue → [titre, texte] ; sans lui, ou incomplet, aucune annonce push pour ce pack : event-push.mjs › evPushReady) }.
   Textes : {n} nombre, {obj} / {objs} nom de l'objet, {y} année, {d} jours. */
const EV_PACKS = [
  { id: 'halloween', ready: true, name: 'Halloween', when: y => ({ from: `${y}-10-25`, to: `${y}-11-08` }), total: 30, perDay: 5,
    obj: { one: 'citrouille', many: 'citrouilles', emoji: '🎃', fem: true, art: 'pumpkin' },
    pal: { a: '#ff7a1a', b: '#7b3fe4', c: '#7ddc4a', ink: '#1a0f2e' }, font: 'spooky',
    badge: { t: 'Chasse aux citrouilles {y}', tiers: [1, 10, 20, 30], names: ['Apprenti chasseur', 'Traqueur de citrouilles', 'Maître des citrouilles', 'Seigneur d\'Halloween'] },
    txt: {
      title: 'La chasse aux citrouilles est ouverte', short: 'Chasse aux citrouilles',
      rules: ['{total} citrouilles se cachent dans l\'appli jusqu\'au {to}.', '{per} par jour au plus, à de nouvelles cachettes chaque matin.', 'Touche-les pour les récolter et gagner les badges d\'Halloween {y}.'],
      found: 'Bien vu !', left: ['Il te reste <b>{n} citrouille</b> à trouver aujourd\'hui', 'Il te reste <b>{n} citrouilles</b> à trouver aujourd\'hui'],
      dayDone: 'Tu as trouvé toutes les citrouilles du jour, reviens demain', allDone: 'Les {total} citrouilles sont à toi', allSub: 'Tu es Seigneur d\'Halloween {y} : un badge que peu de chasseurs auront.',
      label: 'Une citrouille cachée : touche-la pour la récolter', tip: 'Une citrouille ! Touche-la pour la récolter : {per} se cachent dans l\'appli chaque jour.',
      join: 'Crée un compte pour garder tes citrouilles sur tous tes appareils.', deco: 'Décorations d\'Halloween',
    },
    dsc: {
      soon: ['🎃 **La chasse aux citrouilles arrive dans 3 jours !** Du {from} au {to}, {total} citrouilles se cachent dans Mana Orbit : {per} par jour, des badges collector d\'Halloween {y} à la clé.', '🎃 **The pumpkin hunt starts in 3 days!** From {fromEn} to {toEn}, {total} pumpkins hide in Mana Orbit: {per} a day, with collectible Halloween {y} badges.'],
      open: ['🎃 **La chasse aux citrouilles est ouverte !** {total} citrouilles se cachent dans l\'appli jusqu\'au {to}, {per} par jour. Qui aura le grade ultime ?', '🎃 **The pumpkin hunt is on!** {total} pumpkins hide in the app until {toEn}, {per} a day. Who will reach the ultimate rank?'],
      mid: ['🕸️ **Mi-parcours de la chasse aux citrouilles** : il reste {d} jours. {h} chasseurs en piste, {full} déjà à {total}/{total}.', '🕸️ **Pumpkin hunt halfway point**: {d} days left. {h} hunters so far, {full} already at {total}/{total}.'],
      last: ['🦇 **Dernier jour de la chasse aux citrouilles !** Les dernières citrouilles disparaissent à minuit.', '🦇 **Last day of the pumpkin hunt!** The last pumpkins vanish at midnight.'],
      end: ['🎃 **La chasse aux citrouilles est terminée.** {h} chasseurs, {full} au grade ultime ({total}/{total}). Merci à tous, rendez-vous à la prochaine fête !', '🎃 **The pumpkin hunt is over.** {h} hunters, {full} reached the ultimate rank ({total}/{total}). Thanks everyone, see you at the next celebration!'],
    },
    // Notifications push (event-push.mjs) : [titre, texte] par langue de l'appareil ; rien de personnel. {from}, {to} : dates dans la langue (« 25 octobre »,
    // « October 25 »…), {total}, {per}, {y}, {d} (jours restants, aujourd'hui compris : toujours 2 ou plus à mi-parcours).
    push: {
      soon: {
        fr: ['🎃 La chasse aux citrouilles arrive', 'Du {from} au {to}, {total} citrouilles se cachent dans l\'appli : des badges d\'Halloween {y} à gagner.'],
        en: ['🎃 The pumpkin hunt is coming', 'From {from} to {to}, {total} pumpkins hide in the app: Halloween {y} badges to win.'],
        de: ['🎃 Die Kürbisjagd kommt', 'Vom {from} bis {to} verstecken sich {total} Kürbisse in der App: Halloween-Abzeichen {y} zu gewinnen.'],
        es: ['🎃 Llega la caza de calabazas', 'Del {from} al {to}, {total} calabazas se esconden en la app: insignias de Halloween {y} para ganar.'],
        it: ['🎃 Arriva la caccia alle zucche', '{from} – {to}: {total} zucche si nascondono nell\'app, con i badge di Halloween {y} in palio.'],
        pt: ['🎃 A caça às abóboras está chegando', 'De {from} a {to}, {total} abóboras se escondem no app: emblemas de Halloween {y} para ganhar.'],
      },
      open: {
        fr: ['🎃 La chasse aux citrouilles est ouverte !', '{total} citrouilles se cachent dans l\'appli jusqu\'au {to}, {per} par jour. À toi de jouer !'],
        en: ['🎃 The pumpkin hunt is on!', '{total} pumpkins are hiding in the app until {to}, {per} a day. Your turn!'],
        de: ['🎃 Die Kürbisjagd hat begonnen!', '{total} Kürbisse verstecken sich bis zum {to} in der App, {per} pro Tag. Du bist dran!'],
        es: ['🎃 ¡Empieza la caza de calabazas!', '{total} calabazas se esconden en la app hasta el {to}, {per} al día. ¡Te toca!'],
        it: ['🎃 La caccia alle zucche è aperta!', '{total} zucche si nascondono nell\'app, {per} al giorno. Tocca a te!'],
        pt: ['🎃 A caça às abóboras começou!', '{total} abóboras estão escondidas no app até {to}, {per} por dia. Sua vez!'],
      },
      mid: {
        fr: ['🕸️ Plus que {d} jours de chasse', 'Mi-parcours de la chasse aux citrouilles : {per} nouvelles cachettes t\'attendent chaque jour.'],
        en: ['🕸️ {d} days of hunting left', 'Pumpkin hunt halfway point: {per} new hiding spots await you every day.'],
        de: ['🕸️ Noch {d} Tage Kürbisjagd', 'Halbzeit der Kürbisjagd: Jeden Tag warten {per} neue Verstecke auf dich.'],
        es: ['🕸️ Quedan {d} días de caza', 'Mitad de la caza de calabazas: {per} escondites nuevos te esperan cada día.'],
        it: ['🕸️ Mancano {d} giorni di caccia', 'Metà della caccia alle zucche: ogni giorno ti aspettano {per} nuovi nascondigli.'],
        pt: ['🕸️ Faltam {d} dias de caça', 'Metade da caça às abóboras: {per} novos esconderijos te esperam todo dia.'],
      },
      last: {
        fr: ['🦇 Dernier jour de la chasse !', 'Les dernières citrouilles disparaissent à minuit. C\'est maintenant ou jamais.'],
        en: ['🦇 Last day of the hunt!', 'The last pumpkins vanish at midnight. It\'s now or never.'],
        de: ['🦇 Letzter Tag der Jagd!', 'Die letzten Kürbisse verschwinden um Mitternacht. Jetzt oder nie.'],
        es: ['🦇 ¡Último día de caza!', 'Las últimas calabazas desaparecen a medianoche. Ahora o nunca.'],
        it: ['🦇 Ultimo giorno di caccia!', 'Le ultime zucche spariscono a mezzanotte. Ora o mai più.'],
        pt: ['🦇 Último dia de caça!', 'As últimas abóboras somem à meia-noite. É agora ou nunca.'],
      },
    } },
  { id: 'noel', ready: true, name: 'Noël', when: y => ({ from: `${y}-12-01`, to: `${y}-12-26` }), total: 48, perDay: 2,
    // spare : un cadeau de secours caché en plus chaque jour (3 cachettes pour 2 cadeaux à trouver) : de la marge si l'un est introuvable ; le quota reste 2,
    // le 3e disparaît dès les 2 trouvés et ne compte pas pour le lendemain.
    spare: 1,
    // Calendrier de l'Avent (evadvent.js) : une porte (un booster) par jour du 1er au 24, ouverte quand les {per} cadeaux du jour sont trouvés ; le 25 et le 26,
    // rattrapage : jusqu'à catchup cadeaux par jour, qui ouvrent les portes manquées dans l'ordre. Le badge compte les portes ouvertes.
    advent: {
      doors: 24, catchup: 8,
      // Couleurs de classeur rares (binder.js › BND_COVERS) : chaque porte, sauf la dernière, a rare.p de chance d'en donner une (tirage du serveur, propre à chaque
      // joueur et à chaque porte : event-srv.mjs › evRare) ; elles restent acquises pour de bon. Jamais toutes en un seul Noël.
      rare: { p: 0.01, covers: ['sapin', 'neige', 'houx', 'nuitdoree'] },
      // Récompenses de chaque porte (fixes, quelle que soit la carte) : xp (points), cover (sûre : la dernière, la décoration animée de Noël), orb (orbe de Noël,
      // jusqu'au 6 janvier). La carte du jour, elle, est tirée pour chaque joueur et chaque année parmi cards (evAdvCards) : tout le monde n'a pas les mêmes.
      rw: [{}, { xp: 100 }, {}, { xp: 100 }, {}, { xp: 150 }, {}, { xp: 150 }, {}, { xp: 150 }, {}, { xp: 150 }, {}, { xp: 200 }, {}, { xp: 200 }, {}, { xp: 200 }, {}, { xp: 300 }, {}, { xp: 300 }, {}, { cover: 'noel', orb: 1, xp: 500 }],
      // Cartes du jour possibles (au moins doors) : c = nom anglais exact, s / n = l'impression choisie pour son illustration de Noël (édition, numéro Scryfall ;
      // « hho » : les cartes de vœux que Wizards crée chaque Noël depuis 2006), fact = anecdote sur la carte (clé de T).
      cards: [
        { c: 'Goblin Snowman', s: 'sld', n: '61', fact: 'Goblin Snowman vient d\'Ère glaciaire (1995) ; cette illustration a été redessinée pour un Secret Lair en 2020.' },
        { c: 'Rimefur Reindeer', s: 'woe', n: '27', fact: 'D\'après son texte d\'ambiance, des rennes se sont installés près du palais de glace de Hylda, attirés par le calme de son royaume.' },
        { c: 'Fruitcake Elemental', s: 'hho', n: '6', fact: 'La toute première carte de vœux de Wizards of the Coast (2006). Depuis, une nouvelle chaque Noël, jamais vendue en booster.' },
        { c: 'Gingerbrute', s: 'eld', n: '219', fact: 'Son texte d\'ambiance : « La fiole sans étiquette n\'était pas de l\'extrait de vanille, finalement. »' },
        { c: 'Gifts Given', s: 'hho', n: '7', fact: 'La carte de vœux 2007 répond à Gifts Ungiven : « Merci ! Fallait pas. »' },
        { c: 'Mishra\'s Factory', s: 'atq', n: '80d', fact: 'Antiquities (1994) a imprimé Mishra\'s Factory avec quatre illustrations des Foglio, une par saison : voici l\'hiver.' },
        { c: 'Evil Presents', s: 'hho', n: '8', fact: 'Carte de vœux 2008 : « Mieux vaut donner que recevoir. »' },
        { c: 'Arcum\'s Sleigh', s: 'ice', n: '309', fact: 'Un traîneau d\'Ère glaciaire (1995) : « Avec le bon équipement et de la prudence, on peut aller partout. »' },
        { c: 'Season\'s Beatings', s: 'hho', n: '9', fact: 'Carte de vœux 2009 : « De retour chez lui, il regretta soudain les champs de bataille ensanglantés laissés derrière lui. »' },
        { c: 'Snow Day', s: 'stx', n: '53', fact: 'À Strixhaven : « Les cours de manifestations élémentaires avancées sont annulés jusqu\'à ce que tous les élèves aient dégelé. »' },
        { c: 'Snow Mercy', s: 'hho', n: '10', fact: 'Carte de vœux 2010, une boule à neige : « Secouer doucement. Peut provoquer étouffement, hypothermie et/ou invasion planaire. »' },
        { c: 'Stocking Tiger', s: 'hho', n: '13', fact: 'Carte de vœux 2013 : on glisse un vrai booster scellé sous la carte, et on l\'ouvre quand le tigre inflige des blessures.' },
        { c: 'Gingerbread Cabin', s: 'eld', n: '245', fact: 'Throne of Eldraine (2019) s\'inspire des contes : la maison en pain d\'épice vient d\'Hansel et Gretel.' },
        { c: 'Goblin Sleigh Ride', s: 'hho', n: '15', fact: 'Carte de vœux 2015 : son texte d\'ambiance parodie « Jingle Bells ».' },
        { c: 'Wayfarer\'s Bauble', s: 'sld', n: '2656', fact: '« Un souvenir de l\'aventure du jour, et un jouet brillant » : une boule de sapin toute trouvée.' },
        { c: 'Swords to Plowshares', s: 'who', n: '212', fact: 'Cette illustration évoque la trêve de Noël de 1914, au cœur de l\'épisode de Noël 2017 de Doctor Who.' },
        { c: 'Yule Ooze', s: 'hho', n: '11', fact: 'Carte de vœux 2011 : « Il adore recevoir la famille… à dîner. »' },
        { c: 'Some Disassembly Required', s: 'hho', n: '17', fact: 'Carte de vœux 2017 : en décembre, elle te fait gagner des points de vie.' },
        { c: 'Rites of Flourishing', s: 'sld', n: '2805', fact: 'Illustrée par ConcernedApe, le créateur du jeu Stardew Valley.' },
        { c: 'Bog Humbugs', s: 'hho', n: '18', fact: 'Carte de vœux 2018 : il fredonne un chant de fête, et les notes sont imprimées sur la carte.' },
        { c: 'Seasonal Sequels', s: 'hho', n: '23', fact: 'Carte de vœux 2023 : l\'affiche du cinéma détourne Die Hard en « Die Hardened Scales ».' },
        { c: 'Decorated Knight // Present Arms', s: 'hho', n: '19', fact: 'Carte de vœux 2019 : une carte aventure dont le sort s\'appelle « Present Arms », un jeu de mots entre « présentez armes » et « cadeau ».' },
        { c: 'Cheer', s: 'hho', n: '25', fact: 'Carte de vœux 2025 : pour la jouer, célèbre un adversaire en lui offrant un cadeau, en lui portant un toast ou en lui disant que tu es content de jouer avec lui.' },
        { c: 'Topdeck the Halls', s: 'hho', n: '20', fact: 'Carte de vœux 2020 : si tu contrôles douze permanents décorés (promo, foil, illustration alternative…), tu gagnes la partie.' },
        { c: 'Brain Freeze', s: 'soa', n: '13', fact: 'À Strixhaven : « C\'était tellement gênant. La doyenne Veyran m\'a interrogé et je me suis figé. Trou noir. »' },
        { c: 'Twice Upon a Time // Unlikely Meeting', s: 'who', n: '61', fact: '« Twice Upon a Time » est le titre de l\'épisode de Noël 2017 de Doctor Who, qui réunit deux Docteurs.' },
        { c: 'Great Intelligence\'s Plan', s: 'who', n: '133', fact: 'La Grande Intelligence est le méchant de « The Snowmen », l\'épisode de Noël 2012 de Doctor Who, avec ses bonshommes de neige.' },
        { c: 'Nardole, Resourceful Cyborg', s: 'who', n: '655', fact: 'Nardole apparaît pour la première fois dans l\'épisode de Noël 2015 de Doctor Who.' },
        { c: 'Scrying Sheets', s: 'sld', n: '1606', fact: 'Un bonhomme de neige sur un Secret Lair : « La météo prévoit un blizzard de ballades. »' },
        { c: 'Invigorating Hot Spring', s: 'neo', n: '223', fact: 'Kamigawa s\'inspire du Japon : une source chaude sous la neige, comme celles où se baignent les singes des neiges.' },
        { c: 'Caribou Range', s: 'ice', n: '11', fact: 'Dans Ère glaciaire (1995), cette carte crée des jetons Caribou : presque des rennes.' },
        { c: 'Rowdy Snowballers', s: 'tla', n: '68', fact: 'Bataille de boules de neige chez Avatar : « L\'entraînement de Sokka n\'était pas très efficace, mais les enfants de Wolf Cove n\'ont pas eu l\'air de s\'en plaindre. »' },
        { c: 'Zombie Musher', s: 'csp', n: '75', fact: 'Un « musher » conduit un traîneau à chiens… ici, des zombies, dans Coldsnap (2006).' },
        { c: 'Tough Cookie', s: 'woe', n: '193', fact: 'Un biscuit en pain d\'épice qui se défend : Wilds of Eldraine (2023) regorge de créatures en sucreries.' },
        { c: 'Jolly Gerbils', s: 'blb', n: '19', fact: 'Bloomburrow (2024) a fait des cadeaux un mot-clé : ces gerbilles piochent une carte chaque fois que tu en offres un.' },
        { c: 'Generous Stray', s: 'grn', n: '129', fact: 'Son texte d\'ambiance : « Les chats déposent leurs cadeaux avec soin, là où un pied nu marchera dessus en pleine nuit. »' },
        { c: 'Shiny Impetus', s: 'sld', n: '7165', fact: 'Garfield, en pleine frénésie de cadeaux, sur un Secret Lair.' },
        { c: 'Tataru Taru', s: 'fic', n: '30', fact: 'Tataru, la secrétaire des Héritiers dans Final Fantasy XIV, avec un cadeau à la main.' },
        { c: 'Frostpeak Yeti', s: 'khm', n: '57', fact: '« Certains héros doublent leur manteau de fourrure de yéti. Plus de yétis encore doublent leur ventre de héros. »' },
        { c: 'Last-Minute Chopping', s: 'hho', n: '21', fact: 'Carte de vœux 2021 : elle demande à ton adversaire s\'il a pensé à t\'acheter un cadeau.' },
        { c: 'Chaos Wrap', s: 'hho', n: '22', fact: 'Carte de vœux 2022 : on « emballe » vraiment une carte, en la glissant dans une pochette pour en faire un cadeau.' },
        { c: 'Thopter Pie Network', s: 'hho', n: '16', fact: 'Carte de vœux 2016 : elle ne fonctionne que si tu es en train de manger.' },
        { c: 'Eggnogger\'s \'Stache', s: 'hho', n: '24', fact: 'Carte de vœux 2024 : « Si tu n\'as pas de tasse, va en chercher une ! C\'est les fêtes ! »' },
        { c: 'Mishra\'s Toy Workshop', s: 'hho', n: '14', fact: 'Carte de vœux 2014 : ses jetons se représentent avec de vrais jouets.' },
        { c: 'Naughty // Nice', s: 'hho', n: '12', fact: 'Carte de vœux 2012 : une carte double, une moitié sage, l\'autre pas.' },
        { c: 'Night of the Sweets\' Revenge', s: 'woe', n: '178', fact: 'Wilds of Eldraine (2023) s\'inspire des contes : ici, la revanche des friandises.' },
        { c: 'Mishra\'s Bauble', s: '2xm', n: '274', fact: 'Une babiole phyrexiane de Double Masters, qui ferait une parfaite boule de sapin.' },
        { c: 'Generous Visitor', s: 'neo', n: '185', fact: 'Son texte d\'ambiance : par modestie, on refuse trois fois un cadeau avant de l\'accepter.' },
      ],
    },
    obj: { one: 'cadeau', many: 'cadeaux', emoji: '🎁', fem: false, art: 'gift', counter: 'giftCounter', msg: 'bell' },
    pal: { a: '#e23b3b', b: '#1f8a4c', c: '#f4c542', ink: '#0d1f17' }, font: 'frost',
    badge: { t: 'Calendrier de l\'Avent {y}', tiers: [1, 8, 16, 24], unit: ['{n} booster ouvert', '{n} boosters ouverts'], names: ['Lutin', 'Renne', 'Elfe en chef', 'Esprit de Noël'] },
    txt: {
      title: 'Le calendrier de l\'Avent est ouvert', short: 'Calendrier de l\'Avent',
      rules: ['Chaque jour jusqu\'au 24 décembre, {per} cadeaux se cachent dans l\'appli.', 'Trouve-les pour ouvrir le booster du jour : une carte, et parfois une récompense.', 'Un jour manqué ? Le 25 et le 26, rattrape tes boosters.'],
      found: 'Un cadeau !', left: ['Encore <b>{n} cadeau</b> pour ouvrir le booster du jour', 'Encore <b>{n} cadeaux</b> pour ouvrir le booster du jour'],
      leftCatch: ['Encore <b>{n} cadeau</b> pour rattraper un booster', 'Encore <b>{n} cadeaux</b> pour rattraper un booster'],
      dayDone: 'Booster du jour ouvert, reviens demain', allDone: 'Les 24 boosters sont ouverts', allSub: 'Tu es Esprit de Noël {y} : le calendrier complet, un badge que peu de joueurs auront.',
      label: 'Un cadeau caché : touche-le pour le récolter', tip: 'Un cadeau ! Touche-le pour le récolter : {per} se cachent dans l\'appli chaque jour.',
      join: 'Crée un compte pour garder ton calendrier sur tous tes appareils.', deco: 'Décorations de Noël',
    },
    dsc: {
      soon: ['🎄 **Le calendrier de l\'Avent arrive dans 3 jours !** Du {from} au 24 décembre, {per} cadeaux se cachent chaque jour dans Mana Orbit : un booster à ouvrir par jour, des cartes, des récompenses et des badges de Noël {y}.', '🎄 **The Advent calendar starts in 3 days!** From {fromEn} to December 24, {per} gifts hide in Mana Orbit every day: one booster to open each day, cards, rewards and Christmas {y} badges.'],
      open: ['🎁 **Le calendrier de l\'Avent est ouvert !** Chaque jour, trouve les {per} cadeaux cachés dans l\'appli pour ouvrir le booster du jour. Qui ouvrira les 24 ?', '🎁 **The Advent calendar is open!** Every day, find the {per} gifts hidden in the app to open the day\'s booster. Who will open all 24?'],
      mid: ['❄️ **Mi-parcours du calendrier de l\'Avent** : {h} joueurs ont déjà ouvert des boosters, {full} ont un calendrier complet pour l\'instant.', '❄️ **Advent calendar halfway point**: {h} players have opened boosters so far, {full} have a complete calendar for now.'],
      last: ['🔔 **Dernier jour de rattrapage du calendrier de l\'Avent !** Les boosters manqués se ferment à minuit.', '🔔 **Last catch-up day of the Advent calendar!** Missed boosters close at midnight.'],
      end: ['🎄 **Le calendrier de l\'Avent est terminé.** {h} joueurs, {full} ont ouvert les 24 boosters. Joyeuses fêtes, et rendez-vous au Nouvel an !', '🎄 **The Advent calendar is over.** {h} players, {full} opened all 24 boosters. Happy holidays, see you at New Year!'],
    },
    push: {
      soon: {
        fr: ['🎄 Le calendrier de l\'Avent arrive', 'Dès le {from}, un booster à ouvrir chaque jour dans l\'appli : des cartes, des récompenses et des badges de Noël {y}.'],
        en: ['🎄 The Advent calendar is coming', 'From {from}, one booster to open every day in the app: cards, rewards and Christmas {y} badges.'],
        de: ['🎄 Der Adventskalender kommt', 'Ab dem {from} jeden Tag ein Booster zum Öffnen in der App: Karten, Belohnungen und Weihnachts-Abzeichen {y}.'],
        es: ['🎄 Llega el calendario de Adviento', 'Desde el {from}, un sobre que abrir cada día en la app: cartas, recompensas e insignias de Navidad {y}.'],
        it: ['🎄 Arriva il calendario dell\'Avvento', 'Dal {from}, una busta da aprire ogni giorno nell\'app: carte, ricompense e badge di Natale {y}.'],
        pt: ['🎄 O calendário do Advento está chegando', 'A partir de {from}, um booster para abrir todo dia no app: cards, recompensas e emblemas de Natal {y}.'],
      },
      open: {
        fr: ['🎁 Le calendrier de l\'Avent est ouvert !', 'Trouve les {per} cadeaux cachés dans l\'appli pour ouvrir le booster du jour.'],
        en: ['🎁 The Advent calendar is open!', 'Find the {per} gifts hidden in the app to open today\'s booster.'],
        de: ['🎁 Der Adventskalender ist offen!', 'Finde die {per} versteckten Geschenke in der App, um den Booster des Tages zu öffnen.'],
        es: ['🎁 ¡El calendario de Adviento está abierto!', 'Encuentra los {per} regalos escondidos en la app para abrir el sobre del día.'],
        it: ['🎁 Il calendario dell\'Avvento è aperto!', 'Trova i {per} regali nascosti nell\'app per aprire la busta del giorno.'],
        pt: ['🎁 O calendário do Advento está aberto!', 'Encontre os {per} presentes escondidos no app para abrir o booster do dia.'],
      },
      mid: {
        fr: ['❄️ Ton booster du jour t\'attend', 'Mi-parcours du calendrier de l\'Avent : {per} cadeaux cachés chaque jour, et le rattrapage les 25 et 26.'],
        en: ['❄️ Today\'s booster is waiting', 'Advent calendar halfway point: {per} gifts hidden every day, and catch-up on the 25th and 26th.'],
        de: ['❄️ Dein Booster des Tages wartet', 'Halbzeit beim Adventskalender: jeden Tag {per} versteckte Geschenke, Nachholen am 25. und 26.'],
        es: ['❄️ Tu sobre del día te espera', 'Mitad del calendario de Adviento: {per} regalos escondidos cada día, y recuperación el 25 y el 26.'],
        it: ['❄️ La busta del giorno ti aspetta', 'Metà del calendario dell\'Avvento: {per} regali nascosti ogni giorno, e recupero il 25 e il 26.'],
        pt: ['❄️ Seu booster do dia te espera', 'Metade do calendário do Advento: {per} presentes escondidos todo dia, e recuperação nos dias 25 e 26.'],
      },
      last: {
        fr: ['🔔 Dernier jour de rattrapage !', 'Les boosters manqués du calendrier de l\'Avent se ferment à minuit.'],
        en: ['🔔 Last catch-up day!', 'Missed Advent calendar boosters close at midnight.'],
        de: ['🔔 Letzter Tag zum Nachholen!', 'Verpasste Booster des Adventskalenders schließen um Mitternacht.'],
        es: ['🔔 ¡Último día de recuperación!', 'Los sobres perdidos del calendario de Adviento se cierran a medianoche.'],
        it: ['🔔 Ultimo giorno di recupero!', 'Le buste perse del calendario dell\'Avvento si chiudono a mezzanotte.'],
        pt: ['🔔 Último dia de recuperação!', 'Os boosters perdidos do calendário do Advento fecham à meia-noite.'],
      },
    } },
  { id: 'nouvelan', ready: true, name: 'Nouvel an', when: y => ({ from: `${y}-12-27`, to: evAdd(`${y}-12-27`, 14) }), total: 30, perDay: 5,
    // Nuit des étoiles filantes (evsky.js) : chaque étoile trouvée allume, dans l'ordre, une étoile des 5 constellations de mana (cons, per étoiles chacune) ;
    // compte à rebours jusqu'au 1er janvier, feu d'artifice à minuit, « Ton année Magic » ensuite. rare : couleur de classeur rare, rare.p de chance par jour
    // joué (tirage du serveur : event-srv.mjs › evRare) ; done : récompense sûre des 5 constellations complètes (couleur unique). Le badge compte les constellations.
    sky: { cons: ['W', 'U', 'B', 'R', 'G'], per: 6, rare: { p: 0.01, covers: ['aurore', 'comete', 'eclipse'] }, done: { cover: 'constellation' } },
    obj: { one: 'étoile filante', many: 'étoiles filantes', emoji: '🌠', fem: true, art: 'shootingStar', counter: 'starCounter', msg: 'comet' },
    pal: { a: '#f2c230', b: '#3b3fd8', c: '#ff5fa2', ink: '#0b0d24' }, font: 'gala',
    badge: { t: 'Nouvel an {y}', tiers: [1, 2, 4, 5], unit: ['{n} constellation complète', '{n} constellations complètes'], names: ['Fêtard', 'Noctambule', 'Maître des feux', 'Étoile de l\'année'] },
    txt: {
      title: 'La nuit des étoiles filantes est ouverte', short: 'Nuit des étoiles filantes',
      rules: ['{total} étoiles filantes traversent l\'appli jusqu\'au {to}, {per} par jour au plus.', 'Chacune allume une étoile des 5 constellations de mana.', 'Complète-les pour gagner les badges du Nouvel an {y}, et une couleur de classeur unique.'],
      found: 'Une étoile filante !', left: ['Encore <b>{n} étoile filante</b> à trouver aujourd\'hui', 'Encore <b>{n} étoiles filantes</b> à trouver aujourd\'hui'],
      dayDone: 'Toutes les étoiles du jour sont trouvées, reviens demain', allDone: 'Les 5 constellations brillent', allSub: 'Tu es Étoile de l\'année {y} : le ciel complet, et une couleur de classeur unique.',
      label: 'Une étoile filante cachée : touche-la pour la récolter', tip: 'Une étoile filante ! Touche-la pour la récolter : {per} traversent l\'appli chaque jour.',
      join: 'Crée un compte pour garder tes constellations sur tous tes appareils.', deco: 'Décorations du Nouvel an',
    },
    dsc: {
      soon: ['🌠 **La nuit des étoiles filantes arrive dans 3 jours !** Du {from} au {to}, {total} étoiles filantes traversent Mana Orbit : {per} par jour, 5 constellations de mana à allumer et des badges du Nouvel an {y}.', '🌠 **The shooting star night starts in 3 days!** From {fromEn} to {toEn}, {total} shooting stars cross Mana Orbit: {per} a day, 5 mana constellations to light up and New Year {y} badges.'],
      open: ['🌠 **La nuit des étoiles filantes est ouverte !** {total} étoiles filantes traversent l\'appli jusqu\'au {to}, {per} par jour. Qui allumera les 5 constellations ?', '🌠 **The shooting star night is on!** {total} shooting stars cross the app until {toEn}, {per} a day. Who will light up all 5 constellations?'],
      mid: ['✨ **Mi-parcours de la nuit des étoiles filantes** : il reste {d} jours. {h} joueurs ont levé les yeux au ciel, {full} ont déjà tout allumé.', '✨ **Shooting star night halfway point**: {d} days left. {h} players looked up to the sky, {full} have lit everything already.'],
      last: ['🎆 **Dernier jour de la nuit des étoiles filantes !** Les dernières étoiles s\'éteignent à minuit.', '🎆 **Last day of the shooting star night!** The last stars fade at midnight.'],
      end: ['🌠 **La nuit des étoiles filantes est terminée.** {h} joueurs, {full} ont allumé les 5 constellations. Bonne année à tous !', '🌠 **The shooting star night is over.** {h} players, {full} lit all 5 constellations. Happy New Year, everyone!'],
    },
    push: {
      soon: {
        fr: ['🌠 La nuit des étoiles filantes arrive', 'Du {from} au {to}, {total} étoiles filantes traversent l\'appli : 5 constellations de mana à allumer.'],
        en: ['🌠 The shooting star night is coming', 'From {from} to {to}, {total} shooting stars cross the app: 5 mana constellations to light up.'],
        de: ['🌠 Die Nacht der Sternschnuppen kommt', 'Vom {from} bis {to} ziehen {total} Sternschnuppen durch die App: 5 Mana-Sternbilder zum Erleuchten.'],
        es: ['🌠 Llega la noche de las estrellas fugaces', 'Del {from} al {to}, {total} estrellas fugaces cruzan la app: 5 constelaciones de maná que iluminar.'],
        it: ['🌠 Arriva la notte delle stelle cadenti', '{from} – {to}: {total} stelle cadenti attraversano l\'app, con 5 costellazioni di mana da illuminare.'],
        pt: ['🌠 A noite das estrelas cadentes está chegando', 'De {from} a {to}, {total} estrelas cadentes cruzam o app: 5 constelações de mana para acender.'],
      },
      open: {
        fr: ['🌠 La nuit des étoiles filantes est ouverte !', '{per} étoiles filantes traversent l\'appli chaque jour jusqu\'au {to}. Lève les yeux !'],
        en: ['🌠 The shooting star night is on!', '{per} shooting stars cross the app every day until {to}. Look up!'],
        de: ['🌠 Die Nacht der Sternschnuppen hat begonnen!', 'Bis zum {to} ziehen jeden Tag {per} Sternschnuppen durch die App. Schau nach oben!'],
        es: ['🌠 ¡Empieza la noche de las estrellas fugaces!', '{per} estrellas fugaces cruzan la app cada día hasta el {to}. ¡Mira al cielo!'],
        it: ['🌠 La notte delle stelle cadenti è iniziata!', '{per} stelle cadenti attraversano l\'app ogni giorno fino al {to}. Guarda in alto!'],
        pt: ['🌠 A noite das estrelas cadentes começou!', '{per} estrelas cadentes cruzam o app todo dia até {to}. Olhe para cima!'],
      },
      mid: {
        fr: ['✨ Plus que {d} jours d\'étoiles filantes', 'Tes constellations de mana t\'attendent : {per} nouvelles étoiles chaque jour.'],
        en: ['✨ {d} days of shooting stars left', 'Your mana constellations are waiting: {per} new stars every day.'],
        de: ['✨ Noch {d} Tage Sternschnuppen', 'Deine Mana-Sternbilder warten: jeden Tag {per} neue Sterne.'],
        es: ['✨ Quedan {d} días de estrellas fugaces', 'Tus constelaciones de maná te esperan: {per} estrellas nuevas cada día.'],
        it: ['✨ Mancano {d} giorni di stelle cadenti', 'Le tue costellazioni di mana ti aspettano: {per} nuove stelle ogni giorno.'],
        pt: ['✨ Faltam {d} dias de estrelas cadentes', 'Suas constelações de mana te esperam: {per} novas estrelas todo dia.'],
      },
      last: {
        fr: ['🎆 Dernier jour des étoiles filantes !', 'Les dernières étoiles s\'éteignent à minuit. C\'est maintenant ou jamais.'],
        en: ['🎆 Last day of shooting stars!', 'The last stars fade at midnight. It\'s now or never.'],
        de: ['🎆 Letzter Tag der Sternschnuppen!', 'Die letzten Sterne erlöschen um Mitternacht. Jetzt oder nie.'],
        es: ['🎆 ¡Último día de estrellas fugaces!', 'Las últimas estrellas se apagan a medianoche. Ahora o nunca.'],
        it: ['🎆 Ultimo giorno di stelle cadenti!', 'Le ultime stelle si spengono a mezzanotte. Ora o mai più.'],
        pt: ['🎆 Último dia de estrelas cadentes!', 'As últimas estrelas se apagam à meia-noite. É agora ou nunca.'],
      },
    } },
  { id: 'paques', ready: true, name: 'Pâques', when: y => evAround(evEaster(y)), total: 30, perDay: 5,
    // Nid de Pâques (evnest.js) : chaque œuf trouvé rejoint la couvée en cours (nest.per œufs, un par couleur du mana, dans l'ordre de nest.mana) ; au dernier,
    // elle éclot : un poussin (total / per poussins en tout). Le badge compte les poussins éclos (unit), pas les œufs.
    // Dessins (evart.js, section « Pâques ») : œuf décoré (5 teintes et décors peints selon la cachette), œufs du mana, éclosion, compteur, poussin des messages ;
    // ambiance et couleurs : css/ev-paques.css, mise en page du nid : css/event-nest.css. Prêt : s'ouvre tout seul autour de Pâques (annonces Discord, notifications).
    // gold : œuf d'or rare (gold.p de chance pour chaque cachette, tirage du serveur propre au joueur, au jour et à la cachette : event-srv.mjs › evGold) ; le trouver
    // donne la couleur de classeur rare gold.cover (binder.js), acquise pour de bon. bells : cloches de Pâques (evBells) : du Jeudi saint (away jours avant
    // Pâques) au Samedi saint, parties à Rome ; le dimanche et le lundi (days jours dès back), revenues : extra œufs de plus par jour (quota, evQuota).
    nest: { per: 5, mana: ['W', 'U', 'B', 'R', 'G'], gold: { p: 0.01, cover: 'oeufdor' }, bells: { away: -3, back: 0, days: 2, extra: 5 } },
    obj: { one: 'œuf', many: 'œufs', emoji: '🥚', fem: false, art: 'egg', counter: 'eggCounter', msg: 'chick' },
    pal: { a: '#ffb3d1', b: '#8fd6a8', c: '#ffd36b', ink: '#2a1d2e' }, font: 'bloom',
    badge: { t: 'Nid de Pâques {y}', tiers: [1, 2, 4, 6], unit: ['{n} poussin éclos', '{n} poussins éclos'], names: ['Premier poussin', 'Couveur', 'Gardien du nid', 'Lapin d\'or'] },
    txt: {
      title: 'Le nid de Pâques t\'attend', short: 'Nid de Pâques',
      rules: ['{total} œufs se cachent dans l\'appli jusqu\'au {to}, {per} par jour au plus, dans de nouvelles cachettes chaque matin.', 'Chaque œuf trouvé rejoint ton nid : 5 œufs, un par couleur du mana, et la couvée éclot.', 'Fais éclore les 6 poussins pour gagner les badges du nid de Pâques {y}.'],
      found: 'Un œuf !', left: ['Encore <b>{n} œuf</b> à dénicher aujourd\'hui', 'Encore <b>{n} œufs</b> à dénicher aujourd\'hui'],
      dayDone: 'Tous les œufs du jour sont au nid, reviens demain', allDone: 'Les {total} poussins sont nés', allSub: 'Tu es Lapin d\'or {y} : le grade ultime du nid de Pâques.',
      label: 'Un œuf caché : touche-le pour le mettre au nid', tip: 'Un œuf de Pâques ! Touche-le pour le mettre au nid : {per} se cachent dans l\'appli chaque jour.',
      join: 'Crée un compte pour garder ton nid sur tous tes appareils.', deco: 'Décorations de Pâques',
    },
    // Annonces : le mi-parcours tombe le dimanche de Pâques (8e jour sur 15) : le retour des cloches.
    dsc: {
      soon: ['🥚 **Le nid de Pâques arrive dans 3 jours !** Du {from} au {to}, {total} œufs se cachent dans Mana Orbit, {per} par jour : 6 couvées aux couleurs du mana à faire éclore, et un œuf d\'or très rare.', '🥚 **The Easter nest arrives in 3 days!** From {fromEn} to {toEn}, {total} eggs hide in Mana Orbit, {per} a day: 6 mana-colored broods to hatch, and a very rare golden egg.'],
      open: ['🐣 **Le nid de Pâques est ouvert !** {total} œufs se cachent dans l\'appli jusqu\'au {to}, {per} par jour. 5 œufs, un par couleur du mana, et la couvée éclot : qui fera naître les 6 poussins ?', '🐣 **The Easter nest is open!** {total} eggs hide in the app until {toEn}, {per} a day. 5 eggs, one per mana color, and the brood hatches: who will hatch all 6 chicks?'],
      mid: ['🔔 **Les cloches sont revenues de Rome !** Pour Pâques, elles sèment des œufs en plus aujourd\'hui et demain. Il reste {d} jours : {h} joueurs ont déjà un nid, {full} ont fait éclore les 6 poussins.', '🔔 **The bells are back from Rome!** For Easter, they drop extra eggs today and tomorrow. {d} days left: {h} players already have a nest, {full} have hatched all 6 chicks.'],
      last: ['🐣 **Dernier jour du nid de Pâques !** Les derniers œufs disparaissent à minuit.', '🐣 **Last day of the Easter nest!** The last eggs vanish at midnight.'],
      end: ['🥚 **Le nid de Pâques est terminé.** {h} joueurs, {full} ont fait éclore les 6 poussins. Merci à tous, et joyeuses Pâques !', '🥚 **The Easter nest is over.** {h} players, {full} hatched all 6 chicks. Thanks everyone, and happy Easter!'],
    },
    push: {
      soon: {
        fr: ['🥚 Le nid de Pâques arrive', 'Du {from} au {to}, {total} œufs se cachent dans l\'appli : 6 poussins à faire éclore et un œuf d\'or à dénicher.'],
        en: ['🥚 The Easter nest is coming', 'From {from} to {to}, {total} eggs hide in the app: 6 chicks to hatch and a golden egg to find.'],
        de: ['🥚 Das Osternest kommt', 'Vom {from} bis {to} verstecken sich {total} Eier in der App: 6 Küken zum Schlüpfen und ein goldenes Ei zu finden.'],
        es: ['🥚 Llega el nido de Pascua', 'Del {from} al {to}, {total} huevos se esconden en la app: 6 pollitos por eclosionar y un huevo de oro por encontrar.'],
        it: ['🥚 Arriva il nido di Pasqua', '{from} – {to}: {total} uova si nascondono nell\'app, 6 pulcini da far schiudere e un uovo d\'oro da trovare.'],
        pt: ['🥚 O ninho de Páscoa está chegando', 'De {from} a {to}, {total} ovos se escondem no app: 6 pintinhos para chocar e um ovo de ouro para achar.'],
      },
      open: {
        fr: ['🐣 Le nid de Pâques est ouvert !', '{total} œufs se cachent dans l\'appli jusqu\'au {to}, {per} par jour. Fais éclore ta première couvée !'],
        en: ['🐣 The Easter nest is open!', '{total} eggs are hiding in the app until {to}, {per} a day. Hatch your first brood!'],
        de: ['🐣 Das Osternest ist offen!', '{total} Eier verstecken sich bis zum {to} in der App, {per} pro Tag. Lass deine erste Brut schlüpfen!'],
        es: ['🐣 ¡El nido de Pascua está abierto!', '{total} huevos se esconden en la app hasta el {to}, {per} al día. ¡Haz eclosionar tu primera nidada!'],
        it: ['🐣 Il nido di Pasqua è aperto!', '{total} uova si nascondono nell\'app, {per} al giorno. Fai schiudere la tua prima covata!'],
        pt: ['🐣 O ninho de Páscoa está aberto!', '{total} ovos estão escondidos no app até {to}, {per} por dia. Choque sua primeira ninhada!'],
      },
      mid: {
        fr: ['🔔 Les cloches sont revenues de Rome !', 'Pour Pâques, elles sèment des œufs en plus aujourd\'hui et demain. Plus que {d} jours pour ton nid.'],
        en: ['🔔 The bells are back from Rome!', 'For Easter, they drop extra eggs today and tomorrow. {d} days left for your nest.'],
        de: ['🔔 Die Glocken sind aus Rom zurück!', 'Zu Ostern verstreuen sie heute und morgen zusätzliche Eier. Noch {d} Tage für dein Nest.'],
        es: ['🔔 ¡Las campanas han vuelto de Roma!', 'Por Pascua, hoy y mañana dejan caer huevos de más. Quedan {d} días para tu nido.'],
        it: ['🔔 Le campane sono tornate da Roma!', 'Per Pasqua lasciano cadere uova in più oggi e domani. Mancano {d} giorni per il tuo nido.'],
        pt: ['🔔 Os sinos voltaram de Roma!', 'Na Páscoa, eles soltam ovos a mais hoje e amanhã. Faltam {d} dias para o seu ninho.'],
      },
      last: {
        fr: ['🐣 Dernier jour du nid de Pâques !', 'Les derniers œufs disparaissent à minuit. C\'est maintenant ou jamais.'],
        en: ['🐣 Last day of the Easter nest!', 'The last eggs vanish at midnight. It\'s now or never.'],
        de: ['🐣 Letzter Tag des Osternests!', 'Die letzten Eier verschwinden um Mitternacht. Jetzt oder nie.'],
        es: ['🐣 ¡Último día del nido de Pascua!', 'Los últimos huevos desaparecen a medianoche. Ahora o nunca.'],
        it: ['🐣 Ultimo giorno del nido di Pasqua!', 'Le ultime uova spariscono a mezzanotte. Ora o mai più.'],
        pt: ['🐣 Último dia do ninho de Páscoa!', 'Os últimos ovos somem à meia-noite. É agora ou nunca.'],
      },
    } },
  { id: 'magic', ready: false, name: 'Anniversaire de Magic', when: y => evAround(`${y}-08-05`), total: 30, perDay: 5,
    obj: { one: 'bougie', many: 'bougies', emoji: '🕯️', fem: true, art: 'candle' },
    pal: { a: '#f2c230', b: '#7fb0ff', c: '#ff7a5c', ink: '#12142a' }, font: 'arcane',
    badge: { t: 'Anniversaire de Magic {y}', tiers: [1, 10, 20, 30], names: ['Invité', 'Fidèle', 'Archiviste', 'Arpenteur légendaire'] },
    txt: { title: 'La chasse aux bougies est ouverte', short: 'Chasse aux bougies' } },
];

/* ── Cachettes : près de soixante-dix endroits de l'appli (event.js › EV_HIDE dit où les poser). Le serveur tire celles du jour de chaque joueur parmi celles qu'il peut voir.
   [id, need, lvl] : need : ce qu'il faut pour que l'endroit existe (bits de EV_CAPS : envoyés par l'appli, ?c=) ; lvl : 0 en vue tout de suite (accueil), 1 à un geste
   (onglet, fiche), 2 caché dans un sous-menu (réglages, filtres avancés, feuilles des réglages…). Chaque jour : au plus EV_LVL_MAX[0] cachette de niveau 0 et
   EV_LVL_MAX[1] de niveau 1, le reste dans les sous-menus. Jamais sur le scan, l'échange en direct, le compteur de vie, une saisie de paiement ou de token, le premier
   lancement, la visite guidée ou le mode streamer. Identifiants stables (gardés dans les progressions) : ne jamais en renommer un. */
const EV_CAPS = { acct: 1, cards: 2, decks: 4, desk: 8, daily: 16, trade: 32, sets: 64, nat: 128 };
const EV_LVL_MAX = [1, 2];
const EV_SPOTS = [
  ['home-orb', 0, 0], ['home-trade', 0, 0], ['home-life', 0, 0], ['home-sets', 64, 0], ['home-stores', 8, 0],
  ['coll-list', 2, 1], ['coll-stats', 2, 1], ['trade-list', 32, 1], ['decks-mine', 0, 1], ['decks-edh', 0, 1], ['me-head', 0, 1], ['me-level', 0, 1],
  ['help-top', 0, 1], ['daily-board', 16, 1], ['card-sheet', 2, 1], ['viewer-head', 4, 1],
  ['coll-filters', 2, 2], ['coll-more', 2, 2], ['coll-view', 2, 2], ['coll-backup', 0, 2], ['coll-export', 2, 2], ['coll-proxy', 2, 2], ['coll-ms', 2, 2],
  ['trade-set', 32, 2], ['trade-binder', 32, 2], ['trade-filters', 32, 2], ['decks-filters', 0, 2], ['decks-themes', 0, 2], ['decks-pub', 1, 2],
  ['me-account', 1, 2], ['me-profile', 1, 2], ['set-notif', 0, 2], ['set-scan', 0, 2], ['set-data', 0, 2], ['set-conf', 0, 2], ['set-mentions', 0, 2],
  ['set-help', 0, 2], ['set-widget', 128, 2], ['set-alerts', 0, 2], ['help-faq', 0, 2], ['friends', 1, 2], ['partie-hist', 0, 2], ['open-hist', 0, 2],
  ['card-text', 2, 2], ['viewer-find', 4, 2], ['set-page', 64, 2],
  ['home-value', 8, 0], ['coll-places', 2, 1], ['coll-value', 2, 1], ['price-list', 0, 1], ['viewer-sum', 4, 1],
  ['badge-sheet', 0, 2], ['deck-sheet', 4, 2], ['deck-cover', 4, 2], ['viewer-hand', 4, 2], ['deck-share', 4, 2], ['deck-build', 4, 2], ['coll-import', 0, 2], ['help-switch', 0, 2],
  ['card-add', 2, 2], ['card-deck', 6, 2], ['card-ed', 2, 2], ['card-copy', 2, 2], ['filt-set', 2, 2], ['coll-image', 2, 2], ['coll-prices', 2, 2],
].map(([id, need, lvl]) => ({ id, need, lvl }));

/* ── Calendrier ─────────────────────────────────────────────────────────────────────────────────────────────────── */
let EV_FMT = null;
/** Date et heure à Paris d'un instant (ms) : [année, mois, jour, heure, minute, seconde] (sans ICU : UTC). */
function evParts(t) {
  if (EV_FMT === null) { try { EV_FMT = new Intl.DateTimeFormat('en-US', { timeZone: EV_TZ, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch (e) { EV_FMT = false; } }
  if (!EV_FMT) { const d = new Date(t); return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()]; }
  const o = {}; for (const p of EV_FMT.formatToParts(t)) o[p.type] = Number(p.value);
  return [o.year, o.month, o.day, o.hour % 24, o.minute, o.second];
}
/** Jour à Paris d'un instant (ms) : « AAAA-MM-JJ ». */
function evDay(t) { const [y, m, d] = evParts(t); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
/** Minuit (Paris) qui suit un instant : prochaine bascule du jour (ms). Deux passes : juste au changement d'heure. */
function evNextMidnight(t) {
  const key = evAdd(evDay(t), 1), wall = Date.UTC(+key.slice(0, 4), +key.slice(5, 7) - 1, +key.slice(8, 10));
  const off = x => { const [y, mo, d, h, mi, s] = evParts(x); return Date.UTC(y, mo - 1, d, h, mi, s) - Math.floor(x / 1000) * 1000; };
  let g = wall - off(wall); g = wall - off(g); return g;
}
/** Quota par jour d'un pack (règle : au moins EV_MIN_DAYS jours pour tout trouver). */
const evPerDay = p => Math.max(1, Math.min(p.perDay || Math.floor(p.total / EV_MIN_DAYS), Math.floor(p.total / EV_MIN_DAYS)));
const evPack = id => EV_PACKS.find(p => p.id === String(id).replace(/-\d{4}$/, '')) || null;
/** Édition d'un pack pour une année : { id, pack, year, from, to, days, total, per }. */
function evEdition(p, y) { const w = p.when(y); return { id: p.id + '-' + y, pack: p.id, year: y, from: w.from, to: w.to, days: evDiff(w.from, w.to) + 1, total: p.total, per: evPerDay(p) }; }
/** Édition d'un identifiant (« halloween-2026 »), ou null. */
function evById(id) { const m = /^([a-z]+)-(\d{4})$/.exec(String(id || '')); const p = m && evPack(m[1]); return p ? evEdition(p, +m[2]) : null; }
/** Éditions qui touchent un jour (« AAAA-MM-JJ ») : celles de l'année et de la précédente (Nouvel an à cheval). */
function evAt(day, o = {}) {
  const y = +day.slice(0, 4), out = [];
  for (const p of EV_PACKS) for (const yy of [y - 1, y]) { const e = evEdition(p, yy); if (day >= e.from && day <= e.to && (p.ready || o.all)) out.push(e); }
  return out;
}
/** Édition en cours à l'instant t (ou null) : off (identifiants coupés), force (identifiant d'édition ou de pack : ouverte quel que soit le jour, 1er jour si avant). */
function evActive(t, o = {}) {
  const day = evDay(t), off = o.off || [];
  if (o.force) { const f = /-\d{4}$/.test(o.force) ? evById(o.force) : evPack(o.force) && evEdition(evPack(o.force), +day.slice(0, 4)); if (f && !off.includes(f.id)) return { ...f, day: day < f.from || day > f.to ? f.from : day, forced: true }; }
  const e = evAt(day).find(x => !off.includes(x.id));
  return e ? { ...e, day } : null;
}
/** Prochaine édition à venir après le jour donné (annonces J-3) : { …édition, in (jours avant le début) } ou null (dans les 60 jours). */
function evUpcoming(day, within = 60) {
  let best = null; const y = +day.slice(0, 4);
  for (const p of EV_PACKS) if (p.ready) for (const yy of [y, y + 1]) { const e = evEdition(p, yy), d = evDiff(day, e.from); if (d > 0 && d <= within && (!best || d < best.in)) best = { ...e, in: d }; }
  return best;
}
/* ── Calendrier de l'Avent (pack.advent) : une porte par jour, ouverte avec les {per} objets du jour ; jours de rattrapage ensuite ── */
/** Cartes du jour d'un calendrier pour un joueur : doors cartes tirées parmi advent.cards, dans un ordre propre à la graine (donnée par le serveur pour chaque joueur
 *  et chaque édition) ; sans graine, celle de l'édition. Même graine → mêmes cartes, sur tous les appareils. */
function evAdvCards(e, seed) {
  const p = evPack(e.pack); if (!p || !p.advent) return [];
  let h = seed >>> 0; if (!h) for (const ch of e.id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) + 2166136261 >>> 0;
  const r = () => { h = h + 0x6D2B79F5 >>> 0; let t = h; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };      // mulberry32
  const a = p.advent.cards.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, p.advent.doors);
}
/** Jour (« AAAA-MM-JJ ») de la porte i (1…doors) d'une édition. */
const evDoorDay = (e, i) => evAdd(e.from, i - 1);
/** Jour de rattrapage (après la dernière porte) ? */
const evCatchup = (e, day) => { const p = evPack(e.pack); return !!(p && p.advent && evDiff(e.from, day) >= p.advent.doors); };
/** Quota d'un jour : celui de l'édition ; jours de rattrapage d'un calendrier : advent.catchup (le total borne de toute façon : seulement les portes manquées). */
/** Cloches de Pâques (pack.nest.bells) un jour de l'édition e : 'away' du Jeudi au Samedi saints (parties à Rome), 'bells' le dimanche et le lundi de Pâques
 *  (revenues : œufs en plus), '' sinon (ou pas de cloches). */
function evBells(e, day) {
  const p = e && evPack(e.pack), b = p && p.nest && p.nest.bells; if (!b || !day) return '';
  const d = evDiff(evEaster(+String(e.id).slice(-4)), day);
  return d >= b.back && d < b.back + b.days ? 'bells' : d >= b.away && d < b.back ? 'away' : '';
}
const evQuota = (e, day) => (evCatchup(e, day) ? evPack(e.pack).advent.catchup : evBells(e, day) === 'bells' ? e.per + evPack(e.pack).nest.bells.extra : e.per);
/** Portes d'un calendrier d'après les jours joués ({ jour: [cachettes] }) : [{ i, day, n (objets de son jour), open, late (ouverte au rattrapage) }].
 *  Les objets des jours de rattrapage ouvrent les portes manquées dans l'ordre, {per} par porte. [] : pas un calendrier. */
function evDoors(e, jours) {
  const p = evPack(e.pack); if (!p || !p.advent) return [];
  const j = jours || {}, len = d => (Array.isArray(j[d]) ? j[d].length : 0), out = [];
  let spare = 0; for (let k = p.advent.doors; k < e.days; k++) spare += len(evAdd(e.from, k));
  for (let i = 1; i <= p.advent.doors; i++) {
    const day = evDoorDay(e, i), n = len(day), need = Math.max(0, e.per - n), late = need > 0 && spare >= need;
    if (late) spare -= need;
    out.push({ i, day, n, open: n >= e.per || late, late });
  }
  return out;
}
/** Contrôle des packs (tests) : quota tenable, période d'environ deux semaines. Liste des problèmes (vide : tout va bien). */
function evCheck(y = 2026) {
  const bad = [];
  for (const p of EV_PACKS) {
    const e = evEdition(p, y), need = Math.ceil(p.total / e.per);
    if (p.sky && p.sky.cons.length * p.sky.per !== p.total) bad.push(p.id + ' : constellations ≠ total');
    if (p.nest && (p.total % p.nest.per || p.nest.mana.length !== p.nest.per || p.badge.tiers[p.badge.tiers.length - 1] !== p.total / p.nest.per)) bad.push(p.id + ' : couvées ≠ total ou badges');
    if (p.advent) {      // calendrier : une porte par jour, puis au moins un jour de rattrapage ; tout le total tient dans les portes
      if (p.advent.doors * e.per !== p.total) bad.push(p.id + ' : ' + p.advent.doors + ' portes × ' + e.per + ' ≠ ' + p.total);
      if (e.days <= p.advent.doors || e.days > p.advent.doors + 3) bad.push(p.id + ' : ' + e.days + ' jours pour ' + p.advent.doors + ' portes');
      if (!Array.isArray(p.advent.rw) || p.advent.rw.length !== p.advent.doors) bad.push(p.id + ' : récompenses des portes');
      if (!Array.isArray(p.advent.cards) || p.advent.cards.length < p.advent.doors || new Set(p.advent.cards.map(c => c.s + '/' + c.n)).size !== p.advent.cards.length) bad.push(p.id + ' : cartes du jour');
      continue;
    }
    if (need < EV_MIN_DAYS) bad.push(p.id + ' : tout trouvable en ' + need + ' jours');
    if (e.days < need || e.days < 12 || e.days > 18) bad.push(p.id + ' : ' + e.days + ' jours');
  }
  return bad;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_PACKS, EV_SPOTS, EV_CAPS, EV_LVL_MAX, EV_MIN_DAYS, EV_TZ, evAdd, evDiff, evEaster, evAround, evParts, evDay, evNextMidnight, evPerDay, evPack, evEdition, evById, evAt, evActive, evUpcoming, evCheck, evDoorDay, evCatchup, evBells, evQuota, evDoors, evAdvCards };
