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
    // Calendrier de l'Avent (evadvent.js) : une porte (un booster) par jour du 1er au 24, ouverte quand les {per} cadeaux du jour sont trouvés ; le 25 et le 26,
    // rattrapage : jusqu'à catchup cadeaux par jour, qui ouvrent les portes manquées dans l'ordre. Le badge compte les portes ouvertes.
    advent: {
      doors: 24, catchup: 8,
      // Couleurs de classeur rares (binder.js › BND_COVERS) : chaque porte, sauf la dernière, a rare.p de chance d'en donner une (tirage du serveur, propre à chaque
      // joueur et à chaque porte : event-srv.mjs › evRare) ; elles restent acquises pour de bon. Jamais toutes en un seul Noël.
      rare: { p: 0.01, covers: ['sapin', 'neige', 'houx', 'nuitdoree'] },
      // Contenu de chaque porte : c = carte du jour (nom anglais exact, Scryfall), r = récompense : xp (points), cover (couleur de classeur, sûre : la dernière
      // porte, la couleur animée de Noël), orb (orbe de Noël sur l'accueil, jusqu'au 6 janvier), fact (anecdote, clé de T).
      list: [
        { c: 'Snow-Covered Plains', r: { fact: 'Les terrains de base enneigés sont apparus en 1995 avec Ère glaciaire, la première extension à mettre la neige au cœur du jeu.' } },
        { c: 'Gift of Paradise', r: { xp: 100 } },
        { c: 'Icy Manipulator', r: { fact: 'Icy Manipulator était déjà là en 1993, dans Alpha, la toute première édition de Magic.' } },
        { c: 'Snow-Covered Island', r: { xp: 100 } },
        { c: 'Boreal Druid', r: { fact: 'Coldsnap (2006) a complété le bloc Ère glaciaire… onze ans après sa sortie.' } },
        { c: 'Gift of Estates', r: { xp: 100 } },
        { c: 'Snow-Covered Swamp', r: { fact: 'Kaldheim (2021) a ramené la neige : des terrains enneigés dans chaque booster.' } },
        { c: 'Frozen Solid', r: { xp: 150 } },
        { c: 'Icehide Troll', r: { fact: 'Alpha est sortie en août 1993 et s\'est vendue en quelques semaines.' } },
        { c: 'Snow-Covered Mountain', r: { xp: 150 } },
        { c: 'Into the North', r: { fact: 'Magic a été inventé par Richard Garfield, un mathématicien.' } },
        { c: 'Glacial Fortress', r: { xp: 150 } },
        { c: 'Snow-Covered Forest', r: { fact: 'Le Commander est né d\'une variante de juges appelée « Elder Dragon Highlander » (EDH).' } },
        { c: 'Arcum\'s Astrolabe', r: { xp: 200 } },
        { c: 'Rimescale Dragon', r: { fact: 'Les cartes foil sont arrivées dans les boosters en 1999, avec L\'Héritage d\'Urza.' } },
        { c: 'Snow Day', r: { xp: 200 } },
        { c: 'Ice-Fang Coatl', r: { fact: 'Le mana a cinq couleurs, toujours dans le même ordre sur le cercle : blanc, bleu, noir, rouge, vert.' } },
        { c: 'Gift of the Gargantuan', r: { xp: 200 } },
        { c: 'Winter Orb', r: { fact: 'Le Black Lotus d\'Alpha est la carte la plus célèbre du jeu : ses meilleurs exemplaires se vendent des centaines de milliers d\'euros.' } },
        { c: 'Gifts Ungiven', r: { xp: 300 } },
        { c: 'Frost Titan', r: { fact: 'Depuis 2024, les boosters de jeu remplacent les boosters de draft et d\'extension.' } },
        { c: 'Star of Extinction', r: { xp: 300 } },
        { c: 'Glacial Chasm', r: { fact: 'Il existe plus de 25 000 cartes Magic différentes.' } },
        { c: 'Mishra\'s Bauble', r: { cover: 'noel', orb: 1, xp: 500 } },
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
  { id: 'nouvelan', ready: false, name: 'Nouvel an', when: y => ({ from: `${y}-12-27`, to: evAdd(`${y}-12-27`, 14) }), total: 30, perDay: 5,
    obj: { one: 'étoile filante', many: 'étoiles filantes', emoji: '🎆', fem: true, art: 'star' },
    pal: { a: '#f2c230', b: '#3b3fd8', c: '#ff5fa2', ink: '#0b0d24' }, font: 'gala',
    badge: { t: 'Nouvel an {y}', tiers: [1, 10, 20, 30], names: ['Fêtard', 'Noctambule', 'Maître des feux', 'Étoile de l\'année'] },
    txt: { title: 'La chasse aux étoiles filantes est ouverte', short: 'Étoiles filantes' } },
  { id: 'paques', ready: false, name: 'Pâques', when: y => evAround(evEaster(y)), total: 30, perDay: 5,
    obj: { one: 'œuf', many: 'œufs', emoji: '🥚', fem: false, art: 'egg' },
    pal: { a: '#ffb3d1', b: '#8fd6a8', c: '#ffd36b', ink: '#2a1d2e' }, font: 'bloom',
    badge: { t: 'Œufs de Pâques {y}', tiers: [1, 10, 20, 30], names: ['Cueilleur', 'Dénicheur', 'Gardien du nid', 'Lapin d\'or'] },
    txt: { title: 'La chasse aux œufs est ouverte', short: 'Chasse aux œufs' } },
  { id: 'magic', ready: false, name: 'Anniversaire de Magic', when: y => evAround(`${y}-08-05`), total: 30, perDay: 5,
    obj: { one: 'bougie', many: 'bougies', emoji: '🕯️', fem: true, art: 'candle' },
    pal: { a: '#f2c230', b: '#7fb0ff', c: '#ff7a5c', ink: '#12142a' }, font: 'arcane',
    badge: { t: 'Anniversaire de Magic {y}', tiers: [1, 10, 20, 30], names: ['Invité', 'Fidèle', 'Archiviste', 'Arpenteur légendaire'] },
    txt: { title: 'La chasse aux bougies est ouverte', short: 'Chasse aux bougies' } },
];

/* ── Cachettes : une quarantaine d'endroits de l'appli (event.js › EV_HIDE dit où les poser). Le serveur tire celles du jour de chaque joueur parmi celles qu'il peut voir.
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
/** Jour (« AAAA-MM-JJ ») de la porte i (1…doors) d'une édition. */
const evDoorDay = (e, i) => evAdd(e.from, i - 1);
/** Jour de rattrapage (après la dernière porte) ? */
const evCatchup = (e, day) => { const p = evPack(e.pack); return !!(p && p.advent && evDiff(e.from, day) >= p.advent.doors); };
/** Quota d'un jour : celui de l'édition ; jours de rattrapage d'un calendrier : advent.catchup (le total borne de toute façon : seulement les portes manquées). */
const evQuota = (e, day) => (evCatchup(e, day) ? evPack(e.pack).advent.catchup : e.per);
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
    if (p.advent) {      // calendrier : une porte par jour, puis au moins un jour de rattrapage ; tout le total tient dans les portes
      if (p.advent.doors * e.per !== p.total) bad.push(p.id + ' : ' + p.advent.doors + ' portes × ' + e.per + ' ≠ ' + p.total);
      if (e.days <= p.advent.doors || e.days > p.advent.doors + 3) bad.push(p.id + ' : ' + e.days + ' jours pour ' + p.advent.doors + ' portes');
      if (!Array.isArray(p.advent.list) || p.advent.list.length !== p.advent.doors) bad.push(p.id + ' : contenu des portes');
      continue;
    }
    if (need < EV_MIN_DAYS) bad.push(p.id + ' : tout trouvable en ' + need + ' jours');
    if (e.days < need || e.days < 12 || e.days > 18) bad.push(p.id + ' : ' + e.days + ' jours');
  }
  return bad;
}

if (typeof module !== 'undefined' && module.exports) module.exports = { EV_PACKS, EV_SPOTS, EV_CAPS, EV_LVL_MAX, EV_MIN_DAYS, EV_TZ, evAdd, evDiff, evEaster, evAround, evParts, evDay, evNextMidnight, evPerDay, evPack, evEdition, evById, evAt, evActive, evUpcoming, evCheck, evDoorDay, evCatchup, evQuota, evDoors };
