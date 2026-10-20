# Fiche Google Play : Mana Orbit

Tout ce qu'il faut copier dans la Play Console, dans les 6 langues de l'appli : français, anglais, allemand, espagnol, italien et portugais du Brésil (**Présence sur le Play Store › Fiche principale › Gérer les traductions › Ajouter vos propres traductions** : fr-FR, en-US, de-DE, es-ES, it-IT, pt-BR). Textes remis à jour le 20 octobre 2026 pour la production (masterset, Carte mystère, niveau et badges, ordinateur ; partie de Commander corrigée).
Les textes à coller sont dans les blocs gris : copie le bloc entier. Les longueurs sont vérifiées (limites de Google entre parenthèses).

Visuels (piste A, 6 langues, 20 octobre) : dans ce dossier, générés par `node tools/store-assets.mjs` (§ 9).

---

## 0. Langue par défaut : l'anglais (à changer avant la production)

La langue par défaut est celle que voient **toutes les langues sans traduction** (néerlandais, polonais, japonais, coréen, chinois, russe…). En français, un joueur néerlandais ou japonais tombe sur une fiche qu'il ne lit pas, alors que l'appli, elle, s'ouvre en anglais quand la langue du téléphone n'est pas disponible. Un téléphone réglé en français garde la traduction fr-FR.
- Play Console › Présence sur le Play Store › Fiche principale › **Gérer les traductions › Modifier la langue par défaut** › **Anglais (États-Unis) – en-US**, puis vérifie que le français reste dans les traductions.
- Les visuels anglais (`feature-graphic-en.png`, `en/`) deviennent ceux par défaut ; les visuels français restent attachés à fr-FR (« Ajouter des éléments graphiques localisés »).

## 1. Titre de l'appli (30 caractères au plus)

Ni « MTG » ni « Magic: The Gathering » dans le titre : ce sont des marques de Wizards of the Coast, que la Fan Content Policy interdit d'utiliser sans accord écrit. Le nom suivi de ce que fait l'appli suffit (les trois grands concurrents mettent « scanner » dans leur titre). « Cote » est le mot des collectionneurs français pour la valeur d'une carte.

| Langue | Titre | Longueur |
|---|---|---|
| Français (fr-FR) | `Mana Orbit – Scan, cote, decks` | 30 |
| Anglais (en-US, par défaut) | `Mana Orbit: Scan, Value, Decks` | 30 |
| Allemand (de-DE) | `Mana Orbit: Scan, Wert, Decks` | 29 |
| Espagnol (es-ES) | `Mana Orbit: escáner, valor` | 26 |
| Italien (it-IT) | `Mana Orbit: scanner, valore` | 27 |
| Portugais (Brésil, pt-BR) | `Mana Orbit: scan, valor, decks` | 30 |

**Variante « compteur de vie » (à essayer, décidé le 15 octobre)** : « life counter » / « compteur de vie » est sans doute l'une des recherches les plus courantes pour une appli compagnon, à vérifier avec les statistiques de la Play Console (Mythic Tools s'appelle « MTG Life Counter: Mythic Tools »). Sans « MTG » ni « Magic » dans le titre (marques de Wizards) :

| Langue | Titre B | Longueur | Description courte B | Longueur |
|---|---|---|---|---|
| Anglais (en-US) | `Mana Orbit: Life Counter, Scan` | 30 | `Life counter for your table, Magic card scanner in 11 languages, card values.` | 77 |
| Français (fr-FR) | `Mana Orbit – compteur de vie` | 28 | `Compteur de vie de la table, scan de cartes Magic en 11 langues, cote, échange.` | 79 |

Comment comparer : la Play Console ne teste pas le titre en A/B (les tests de fiche portent sur l'icône, les visuels et les descriptions). Garde le titre A au lancement ; après 3 à 4 semaines, passe au titre B pendant 3 à 4 semaines et compare dans **Statistiques › Acquisition** les visiteurs venus de la recherche et le taux d'installation. La description courte B, elle, se teste en A/B (« Tests de la fiche Play Store »), en même temps que le titre A.

Repli dans toutes les langues : `Mana Orbit` (10). Google déconseille les titres chargés de mots-clés : si le titre descriptif est refusé, reviens au nom seul.

## 2. Description courte (80 caractères au plus)

Elle ne parle pas d'EDHREC : elle reste valable si EDHREC refuse. Le scan dans 11 langues d'abord (aucun concurrent ne lit le japonais, le coréen et le chinois sur le téléphone), puis la cote, le rangement, l'échange et la partie.

Français (fr-FR) (78) :

```
Scanne tes cartes Magic en 11 langues, suis leur cote, range, échange et joue.
```

Anglais (en-US, par défaut) (80) :

```
Scan your Magic cards in 11 languages, track their value, organize, trade, play.
```

Allemand (de-DE) (79) :

```
Scanne Magic-Karten in 11 Sprachen, verfolge ihren Wert, ordne, tausche, spiel.
```

Espagnol (es-ES) (79) :

```
Escanea tus cartas Magic en 11 idiomas, sigue su valor, ordénalas, intercambia.
```

Italien (it-IT) (79) :

```
Scansiona le carte Magic in 11 lingue, seguine il valore, sistemale, scambiale.
```

Portugais (Brésil, pt-BR) (80) :

```
Escaneie cartas Magic em 11 idiomas, acompanhe o valor, organize, troque, jogue.
```

## 3. Description complète (4 000 caractères au plus)

Google n'affiche ni gras ni titres : les majuscules et les puces « • » servent de repères. « Magic » seul, pour dire à qui s'adresse l'appli, est admis ; jamais le logo ni « Magic: The Gathering » en accroche.
Seules les premières lignes s'affichent avant « Plus » : elles disent l'essentiel (scan, cote, rangement, masterset, échange, partie de Commander, decks, gratuit). Le scanner passe en premier.
La Play Console n'a pas de champ de mots-clés : ils sont dans le texte (scanner de cartes, cartes Magic, cote, Commander, liste d'échange, doublons, classeur, masterset, alerte de prix). Les noms des fonctions sont ceux de l'appli dans chaque langue (« À vérifier », « À aller chercher », « Pour toi », « Échange en direct », « Carte mystère »…).
Remis à jour le 20 octobre d'après le README : masterset, Carte mystère, niveau et badges, ordinateur, Delver Lens ; partie de Commander corrigée (un seul téléphone tient les compteurs, les autres rejoignent la table par QR code) ; ce qui demande un compte est dit (synchro, decks à monter, partage, classements) ; « jamais pendant le scan ni les parties » pour la pub.
Avant de coller : toutes les fonctions citées doivent être en ligne (Google refuse une fiche qui promet ce que l'appli ne fait pas).

### Français (fr-FR) (3831 caractères)

```
Scanne tes cartes Magic dans 11 langues, suis la cote de ta collection au prix Cardmarket, range-la, complète tes mastersets, échange tes doublons en un lien ou un QR code, joue tes parties de Commander et trouve les decks que tu peux déjà monter. Gratuit, sans compte obligatoire.

LE SCANNER DE CARTES
• Cadre la carte et appuie, ou laisse le scan automatique ajouter chaque carte posée devant l'objectif.
• L'édition exacte est lue en bas de la carte ; pour les plus anciennes, l'illustration et le symbole d'extension la retrouvent.
• 11 langues : français, anglais, allemand, espagnol, italien, portugais, russe, japonais, coréen, chinois simplifié et traditionnel.
• En cas de doute, la carte est « à vérifier », avec ta photo pour comparer. La lecture se fait sur ton téléphone.
• Prix rapide, et session d'ouverture de boosters avec son bilan gain ou perte.

TA COLLECTION ET SA COTE
• Importe tes cartes : CSV de ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens, ou une liste « 3 Sol Ring ».
• Chaque exemplaire garde sa langue, son édition, son foil et, si tu veux, son état.
• La cote jour après jour : courbe, variations à 7 et 30 jours, cartes dont le prix a bougé.
• Classeurs, boîtes, decks : chaque carte sait où elle est. « À aller chercher » te dit où trouver les cartes d'un deck.

LE MASTERSET
• Une extension dans l'ordre des numéros : tes cartes en couleur, les manquantes en noir et blanc, ta progression et le prix de ce qui manque.

TES ÉCHANGES
• Ta liste d'échange se fait toute seule : tes doublons et tes recherches, avec leur valeur, en liste ou en classeur à feuilleter.
• Partage-la en un lien ou un QR code : ton ami la voit sans appli ni compte. « Pour toi » : ce qui t'intéresse chez lui, et l'inverse.
• Échange en direct, face à face : vous validez, vos collections se mettent à jour. Et une liste d'amis.

TES PARTIES DE COMMANDER
• Points de vie, blessures de commandant, poison, monarque : un téléphone tient la table, les autres joueurs la rejoignent par QR code et reçoivent le résultat.

TES DECKS
• Les decks Commander que ta collection monte presque (EDHREC), avec les cartes qui manquent et leur prix ; filtres par couleurs, budget, thème et bracket.
• Crée un deck ou colle une decklist : images, courbe de mana, main de départ, valeur. Et les decks publiés par les joueurs.
• Prix d'une liste : le total au prix Cardmarket, sans les cartes que tu as déjà. Avec ton token CardTrader : le panier le moins cher, port compris.

LA CARTE MYSTÈRE ET TES BADGES
• Chaque jour, une carte à deviner pendant qu'elle se dévoile, avec ses classements.
• Un niveau et 78 badges, du bronze au diamant : scan, collection, decks, parties, échanges…

ALERTES ET WIDGETS
• Alerte de forte baisse sur les cartes qui manquent à tes decks ou que tu suis.
• Widgets : la cote de ta collection et ton QR code d'échange sur l'écran d'accueil.

ET AUSSI
• Hors ligne : ta collection reste sur ton téléphone. Compte facultatif (e-mail ou Google) : synchro avec tes autres appareils et l'ordinateur (manaorbit.app), decks à monter, partage, classements.
• Prochaines extensions, interface en 6 langues, aide intégrée et « Envoyer un avis » : je lis tout.

CONFIDENTIALITÉ
Sans compte, tout reste sur ton appareil. Aucune donnée n'est vendue. La photo d'un scan n'est envoyée que si tu signales un scan raté. Un petit bandeau publicitaire, jamais pendant le scan ni les parties, paie l'hébergement.
Politique de confidentialité : https://manaorbit.app/privacy

Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy. Il n'est ni approuvé ni soutenu par Wizards of the Coast. Certains éléments utilisés sont la propriété de Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit n'est lié à aucun des sites et applis cités. Données et images des cartes : Scryfall.
```

### Anglais (en-US, langue par défaut) (3513 caractères)

```
Scan your Magic cards in 11 languages, track your collection's value at Cardmarket prices, organize it, complete your master sets, trade your spares with a link or a QR code, play your Commander games and find the decks you can already build. Free, no account required.

THE CARD SCANNER
• Frame the card and tap, or let auto scan add each card you place in front of the camera.
• The exact printing is read at the bottom of the card; for older cards, the artwork and the set symbol find it.
• 11 languages: English, French, German, Spanish, Italian, Portuguese, Russian, Japanese, Korean, Simplified and Traditional Chinese.
• When in doubt, the card is marked "to check", with your photo to compare. Recognition runs on your phone.
• Quick price, and booster opening sessions with their profit or loss.

YOUR COLLECTION AND ITS VALUE
• Import your cards: CSV from ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens, or a simple "3 Sol Ring" list.
• Every copy keeps its language, printing, foil and, if you like, its condition.
• Its value day after day: chart, 7- and 30-day changes, cards whose price moved.
• Binders, boxes, decks: every card knows where it is. "To fetch" tells you where to find a deck's cards.

MASTER SET
• A set in collector number order: your cards in color, missing ones in black and white, your progress and the price of what's missing.

YOUR TRADES
• Your trade list builds itself: your spares and your wants, with their value, as a list or a binder to flip through.
• Share it with a link or a QR code: your friend sees it with no app and no account. "For you": what you want from them, and the other way around.
• Live trade, face to face: you both confirm, your collections update. Plus a friends list.

YOUR COMMANDER GAMES
• Life, commander damage, poison, monarch: one phone runs the table, the other players join with a QR code and get the result.

YOUR DECKS
• The Commander decks your collection almost builds (EDHREC), with the missing cards and their price; filter by colors, budget, theme and bracket.
• Build a deck or paste a decklist: images, mana curve, sample hand, value. Plus decks published by players.
• Price a list: the Cardmarket total, minus the cards you own. With your CardTrader token: the cheapest cart, shipping included.

MYSTERY CARD AND BADGES
• Every day, a card to guess as it reveals itself, with leaderboards.
• A level and 78 badges, from bronze to diamond: scanning, collection, decks, games, trades…

ALERTS AND WIDGETS
• Alerts when cards your decks are missing, or cards you follow, drop sharply.
• Widgets: your collection's value and your trade QR code on your home screen.

ALSO
• Offline: your collection stays on your phone. Optional account (email or Google): sync with your other devices and your computer (manaorbit.app), decks to build, sharing, leaderboards.
• Upcoming sets, app in 6 languages, built-in help and "Send feedback": I read everything.

PRIVACY
Without an account, everything stays on your device. No data is ever sold. A scan photo is only sent if you report a failed scan. A small ad banner, never while scanning or playing, pays for hosting.
Privacy policy: https://manaorbit.app/privacy

Mana Orbit is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit is not affiliated with any of the sites and apps named here. Card data and images: Scryfall.
```

### Allemand (de-DE) (3812 caractères)

```
Scanne deine Magic-Karten in 11 Sprachen, verfolge den Wert deiner Sammlung zu Cardmarket-Preisen, ordne sie, vervollständige deine Master-Sets, tausche deine Doppelten per Link oder QR-Code, spiel deine Commander-Partien und finde die Decks, die du schon bauen kannst. Kostenlos, ohne Konto.

DER KARTENSCANNER
• Karte ins Bild halten und tippen – oder der Auto-Scan fügt jede Karte hinzu, die du vor die Kamera legst.
• Die genaue Ausgabe wird unten auf der Karte gelesen; bei älteren Karten finden Illustration und Editionssymbol sie.
• 11 Sprachen: Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Russisch, Japanisch, Koreanisch, Chinesisch (vereinfacht und traditionell).
• Im Zweifel steht die Karte auf „Prüfen“, mit deinem Foto zum Vergleich. Die Erkennung läuft auf deinem Handy.
• Schnellpreis und Booster-Öffnungen mit Gewinn- oder Verlustbilanz.

DEINE SAMMLUNG UND IHR WERT
• Importiere deine Karten: CSV aus ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens oder eine Liste „3 Sol Ring“.
• Jedes Exemplar behält Sprache, Ausgabe, Foil und, wenn du willst, seinen Zustand.
• Der Wert Tag für Tag: Kurve, Änderung über 7 und 30 Tage, Karten mit Preisbewegung.
• Ordner, Boxen, Decks: Jede Karte weiß, wo sie liegt. „Zum Holen“ zeigt dir, wo die Karten eines Decks liegen.

MASTER-SET
• Eine Edition in Nummernfolge: deine Karten in Farbe, fehlende in Schwarz-Weiß, dein Fortschritt und der Preis dessen, was fehlt.

DEINE TAUSCHGESCHÄFTE
• Deine Tauschliste entsteht von selbst: deine Doppelten und deine gesuchten Karten, mit Wert, als Liste oder als Ordner zum Blättern.
• Teile sie per Link oder QR-Code: Dein Freund sieht sie ohne App und ohne Konto. „Für dich“: was du bei ihm suchst, und umgekehrt.
• Live-Tausch von Angesicht zu Angesicht: Ihr bestätigt beide, eure Sammlungen werden aktualisiert. Dazu eine Freundesliste.

DEINE COMMANDER-PARTIEN
• Lebenspunkte, Commander-Schaden, Gift, Monarch: Ein Handy führt den Tisch, die anderen treten per QR-Code bei und erhalten das Ergebnis.

DEINE DECKS
• Die Commander-Decks, die deine Sammlung fast baut (EDHREC), mit fehlenden Karten und Preis; Filter nach Farben, Budget, Thema und Bracket.
• Baue ein Deck oder füge eine Deckliste ein: Bilder, Manakurve, Starthand, Wert. Dazu die von Spielern veröffentlichten Decks.
• Preis einer Liste: der Cardmarket-Gesamtpreis ohne die Karten, die du schon hast. Mit deinem CardTrader-Token: der günstigste Warenkorb inklusive Versand.

MYSTERYKARTE UND ABZEICHEN
• Jeden Tag eine Karte zum Erraten, während sie sich nach und nach zeigt, mit Ranglisten.
• Eine Stufe und 78 Abzeichen von Bronze bis Diamant: Scan, Sammlung, Decks, Partien, Tausch…

ALARME UND WIDGETS
• Alarm, wenn Karten, die deinen Decks fehlen oder die du beobachtest, stark im Preis fallen.
• Widgets: der Wert deiner Sammlung und dein Tausch-QR-Code auf dem Startbildschirm.

AUSSERDEM
• Offline: Deine Sammlung bleibt auf deinem Handy. Optionales Konto (E-Mail oder Google): Synchronisierung mit deinen anderen Geräten und dem Computer (manaorbit.app), baubare Decks, Teilen, Ranglisten.
• Kommende Sets, App in 6 Sprachen, integrierte Hilfe und „Feedback senden“: Ich lese alles.

DATENSCHUTZ
Ohne Konto bleibt alles auf deinem Gerät. Keine Daten werden verkauft. Ein Scan-Foto wird nur gesendet, wenn du einen fehlgeschlagenen Scan meldest. Ein kleines Werbebanner, nie beim Scannen oder Spielen, bezahlt das Hosting.
Datenschutzerklärung: https://manaorbit.app/privacy

Mana Orbit ist inoffizieller Fan-Content gemäß der Fan Content Policy. Nicht von Wizards genehmigt oder unterstützt. Teile der verwendeten Materialien sind Eigentum von Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit ist mit keiner der genannten Seiten und Apps verbunden. Kartendaten und -bilder: Scryfall.
```

### Espagnol (es-ES) (3832 caractères)

```
Escanea tus cartas Magic en 11 idiomas, sigue el valor de tu colección a precio de Cardmarket, organízala, completa tus colecciones maestras, intercambia tus repetidas con un enlace o un código QR, juega tus partidas de Commander y encuentra los mazos que ya puedes montar. Gratis, sin cuenta obligatoria.

EL ESCÁNER DE CARTAS
• Encuadra la carta y toca, o deja que el escaneo automático añada cada carta que pongas delante de la cámara.
• La edición exacta se lee en la parte inferior de la carta; en las más antiguas, la ilustración y el símbolo de expansión la encuentran.
• 11 idiomas: español, inglés, francés, alemán, italiano, portugués, ruso, japonés, coreano, chino simplificado y tradicional.
• Si hay dudas, la carta queda «por revisar», con tu foto para comparar. El reconocimiento se hace en tu teléfono.
• Precio rápido y sesiones de apertura de sobres con su balance de ganancia o pérdida.

TU COLECCIÓN Y SU VALOR
• Importa tus cartas: CSV de ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens o una lista «3 Sol Ring».
• Cada copia conserva su idioma, su edición, su foil y, si quieres, su estado.
• Su valor día a día: gráfica, variaciones a 7 y 30 días, cartas cuyo precio ha cambiado.
• Carpetas, cajas, mazos: cada carta sabe dónde está. «Por buscar» te dice dónde encontrar las cartas de un mazo.

COLECCIÓN MAESTRA
• Una expansión en orden de número: tus cartas en color, las que faltan en blanco y negro, tu progreso y el precio de lo que falta.

TUS INTERCAMBIOS
• Tu lista de intercambio se hace sola: tus repetidas y las cartas que buscas, con su valor, en lista o en carpeta para hojear.
• Compártela con un enlace o un código QR: tu amigo la ve sin app y sin cuenta. «Para ti»: lo que te interesa de él, y al revés.
• Intercambio en directo, cara a cara: ambos confirmáis y vuestras colecciones se actualizan. Y una lista de amigos.

TUS PARTIDAS DE COMMANDER
• Vidas, daño de comandante, veneno, monarca: un teléfono lleva la mesa, los demás jugadores se unen con un código QR y reciben el resultado.

TUS MAZOS
• Los mazos Commander que tu colección casi monta (EDHREC), con las cartas que faltan y su precio; filtros por colores, presupuesto, tema y bracket.
• Crea un mazo o pega una lista: imágenes, curva de maná, mano inicial, valor. Y los mazos publicados por los jugadores.
• Precio de una lista: el total a precio de Cardmarket, sin las cartas que ya tienes. Con tu token de CardTrader: la cesta más barata, envío incluido.

CARTA MISTERIOSA E INSIGNIAS
• Cada día, una carta que adivinar mientras se va desvelando, con sus clasificaciones.
• Un nivel y 78 insignias, del bronce al diamante: escaneo, colección, mazos, partidas, intercambios…

ALERTAS Y WIDGETS
• Alerta cuando las cartas que les faltan a tus mazos, o las que sigues, bajan mucho.
• Widgets: el valor de tu colección y tu código QR de intercambio en la pantalla de inicio.

ADEMÁS
• Sin conexión: tu colección se queda en tu teléfono. Cuenta opcional (correo o Google): sincronización con tus otros dispositivos y el ordenador (manaorbit.app), mazos por montar, compartir, clasificaciones.
• Próximas expansiones, app en 6 idiomas, ayuda integrada y «Enviar una opinión»: lo leo todo.

PRIVACIDAD
Sin cuenta, todo se queda en tu dispositivo. Nunca se venden datos. La foto de un escaneo solo se envía si informas de un escaneo fallido. Un pequeño banner publicitario, nunca al escanear ni al jugar, paga el alojamiento.
Política de privacidad: https://manaorbit.app/privacy

Mana Orbit es contenido de fans no oficial permitido por la Fan Content Policy. No está aprobado ni respaldado por Wizards. Parte de los materiales utilizados son propiedad de Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit no está vinculado a ninguno de los sitios y apps citados. Datos e imágenes de las cartas: Scryfall.
```

### Italien (it-IT) (3920 caractères)

```
Scansiona le tue carte Magic in 11 lingue, segui il valore della tua collezione ai prezzi Cardmarket, sistemala, completa i tuoi master set, scambia i tuoi doppioni con un link o un codice QR, gioca le tue partite di Commander e trova i mazzi che puoi già costruire. Gratis, senza account obbligatorio.

LO SCANNER DI CARTE
• Inquadra la carta e tocca, oppure lascia che la scansione automatica aggiunga ogni carta che metti davanti alla fotocamera.
• L'edizione esatta viene letta in fondo alla carta; per quelle più vecchie la trovano l'illustrazione e il simbolo dell'espansione.
• 11 lingue: italiano, inglese, francese, tedesco, spagnolo, portoghese, russo, giapponese, coreano, cinese semplificato e tradizionale.
• Nel dubbio la carta resta «Da verificare», con la tua foto per confrontare. Il riconoscimento avviene sul telefono.
• Prezzo rapido e sessioni di apertura delle buste con il bilancio di guadagno o perdita.

LA TUA COLLEZIONE E IL SUO VALORE
• Importa le tue carte: CSV di ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens o una lista «3 Sol Ring».
• Ogni copia conserva lingua, edizione, foil e, se vuoi, condizione.
• Il valore giorno per giorno: grafico, variazioni a 7 e 30 giorni, carte il cui prezzo è cambiato.
• Raccoglitori, scatole, mazzi: ogni carta sa dov'è. «Da prendere» ti dice dove trovare le carte di un mazzo.

MASTER SET
• Un'espansione in ordine di numero: le tue carte a colori, quelle mancanti in bianco e nero, i tuoi progressi e il prezzo di ciò che manca.

I TUOI SCAMBI
• La tua lista scambi si crea da sola: i tuoi doppioni e le carte che cerchi, con il loro valore, in lista o in un raccoglitore da sfogliare.
• Condividila con un link o un codice QR: il tuo amico la vede senza app e senza account. «Per te»: ciò che ti interessa da lui, e viceversa.
• Scambio dal vivo, faccia a faccia: confermate entrambi e le vostre collezioni si aggiornano. E una lista di amici.

LE TUE PARTITE DI COMMANDER
• Punti vita, danni da comandante, veleno, monarca: un telefono gestisce il tavolo, gli altri giocatori si uniscono con un codice QR e ricevono il risultato.

I TUOI MAZZI
• I mazzi Commander che la tua collezione costruisce quasi (EDHREC), con le carte mancanti e il loro prezzo; filtri per colori, budget, tema e bracket.
• Crea un mazzo o incolla una lista: immagini, curva di mana, mano iniziale, valore. E i mazzi pubblicati dai giocatori.
• Prezzo di una lista: il totale ai prezzi Cardmarket, senza le carte che hai già. Con il tuo token CardTrader: il carrello più economico, spedizione compresa.

CARTA MISTERIOSA E BADGE
• Ogni giorno una carta da indovinare mentre si svela, con le sue classifiche.
• Un livello e 78 badge, dal bronzo al diamante: scansione, collezione, mazzi, partite, scambi…

AVVISI E WIDGET
• Un avviso quando le carte che mancano ai tuoi mazzi, o quelle che segui, calano molto.
• Widget: il valore della tua collezione e il tuo codice QR di scambio nella schermata Home.

E INOLTRE
• Offline: la tua collezione resta sul telefono. Account facoltativo (e-mail o Google): sincronizzazione con gli altri dispositivi e il computer (manaorbit.app), mazzi da costruire, condivisione, classifiche.
• Prossime espansioni, app in 6 lingue, guida integrata e «Invia un feedback»: leggo tutto.

PRIVACY
Senza account tutto resta sul tuo dispositivo. Nessun dato viene venduto. La foto di una scansione viene inviata solo se segnali una scansione non riuscita. Un piccolo banner pubblicitario, mai durante la scansione né le partite, paga l'hosting.
Informativa sulla privacy: https://manaorbit.app/privacy

Mana Orbit è un contenuto di fan non ufficiale consentito dalla Fan Content Policy. Non è approvato né sostenuto da Wizards. Parte dei materiali utilizzati è di proprietà di Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit non è collegato a nessuno dei siti e delle app citati. Dati e immagini delle carte: Scryfall.
```

### Portugais (Brésil, pt-BR) (3750 caractères)

```
Escaneie suas cartas Magic em 11 idiomas, acompanhe o valor da sua coleção pelo preço da Cardmarket, organize tudo, complete seus master sets, troque suas repetidas com um link ou um QR code, jogue suas partidas de Commander e encontre os decks que você já pode montar. Grátis, sem conta obrigatória.

O ESCÂNER DE CARTAS
• Enquadre a carta e toque, ou deixe o escaneamento automático adicionar cada carta colocada na frente da câmera.
• A edição exata é lida na parte de baixo da carta; nas mais antigas, a ilustração e o símbolo da coleção a encontram.
• 11 idiomas: português, inglês, francês, alemão, espanhol, italiano, russo, japonês, coreano, chinês simplificado e tradicional.
• Na dúvida, a carta fica «A verificar», com a sua foto para comparar. O reconhecimento é feito no seu celular.
• Preço rápido e sessões de abertura de boosters com o balanço de lucro ou prejuízo.

SUA COLEÇÃO E SEU VALOR
• Importe suas cartas: CSV do ManaBox, Moxfield, Archidekt, Deckbox, Dragon Shield, Delver Lens ou uma lista «3 Sol Ring».
• Cada cópia guarda o idioma, a edição, o foil e, se você quiser, o estado.
• O valor dia após dia: gráfico, variações em 7 e 30 dias, cartas cujo preço mudou.
• Fichários, caixas, decks: cada carta sabe onde está. «Para buscar» diz onde encontrar as cartas de um deck.

MASTER SET
• Uma expansão na ordem dos números: suas cartas em cores, as que faltam em preto e branco, seu progresso e o preço do que falta.

SUAS TROCAS
• Sua lista de trocas se monta sozinha: suas repetidas e as cartas que você procura, com o valor, em lista ou em fichário para folhear.
• Compartilhe com um link ou um QR code: seu amigo vê sem app e sem conta. «Para você»: o que te interessa na lista dele, e vice-versa.
• Troca ao vivo, cara a cara: vocês dois confirmam e as coleções são atualizadas. E uma lista de amigos.

SUAS PARTIDAS DE COMMANDER
• Vida, dano de comandante, veneno, monarca: um celular cuida da mesa, os outros jogadores entram com um QR code e recebem o resultado.

SEUS DECKS
• Os decks Commander que sua coleção quase monta (EDHREC), com as cartas que faltam e o preço; filtros por cores, orçamento, tema e bracket.
• Crie um deck ou cole uma lista: imagens, curva de mana, mão inicial, valor. E os decks publicados pelos jogadores.
• Preço de uma lista: o total pelo preço da Cardmarket, sem as cartas que você já tem. Com seu token da CardTrader: o carrinho mais barato, frete incluído.

CARTA MISTÉRIO E DISTINTIVOS
• Todo dia, uma carta para adivinhar enquanto ela se revela, com classificações.
• Um nível e 78 distintivos, do bronze ao diamante: escaneamento, coleção, decks, partidas, trocas…

ALERTAS E WIDGETS
• Um alerta quando as cartas que faltam nos seus decks, ou as que você acompanha, caem muito.
• Widgets: o valor da sua coleção e o seu QR code de troca na tela inicial.

E AINDA
• Offline: sua coleção fica no seu celular. Conta opcional (e-mail ou Google): sincronização com seus outros aparelhos e o computador (manaorbit.app), decks para montar, compartilhamento, classificações.
• Próximas expansões, app em 6 idiomas, ajuda integrada e «Enviar feedback»: eu leio tudo.

PRIVACIDADE
Sem conta, tudo fica no seu aparelho. Nenhum dado é vendido. A foto de um escaneamento só é enviada se você relatar um escaneamento que falhou. Um pequeno banner de anúncio, nunca durante o escaneamento nem as partidas, paga a hospedagem.
Política de privacidade: https://manaorbit.app/privacy

Mana Orbit é conteúdo de fã não oficial permitido pela Fan Content Policy. Não é aprovado nem endossado pela Wizards. Parte dos materiais utilizados é propriedade da Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit não tem vínculo com nenhum dos sites e apps citados. Dados e imagens das cartas: Scryfall.
```

**Si EDHREC ou Archidekt refusent** : retire le premier point du bloc « TES DECKS », "YOUR DECKS" (first bullet), „DEINE DECKS“ (erster Punkt), «TUS MAZOS» (primer punto), «I TUOI MAZZI» (primo punto), «SEUS DECKS» (primeiro item), et « decks à monter » du bloc « ET AUSSI » (et ses traductions). Titre et description courte ne changent pas.

## 4. Notes de version de la production (500 caractères au plus par langue)

Pour la première version publique (1.0.6 promue du test fermé, ou la suivante). Play Console › Production › Créer une version › « Notes de version » : colle le bloc entier, les balises disent la langue (fr-FR 387 · en-US 354 · de-DE 386 · es-ES 421 · it-IT 392 · pt-BR 385).

```
<fr-FR>
Mana Orbit sort en version publique ! Scan des cartes en 11 langues (japonais, coréen et chinois lus sur le téléphone), cote de ta collection au prix Cardmarket, rangement et masterset, liste d'échange en un lien ou un QR code, échange en direct, parties de Commander, decks à monter, Carte mystère chaque jour, badges, alertes de prix et widgets. Merci aux testeurs pour leurs retours !
</fr-FR>
<en-US>
Mana Orbit is now public! Card scanning in 11 languages (Japanese, Korean and Chinese read on your phone), your collection's value at Cardmarket prices, storage and master sets, a trade list by link or QR code, live trades, Commander games, decks to build, a daily Mystery card, badges, price alerts and widgets. Thanks to our testers for their feedback!
</en-US>
<de-DE>
Mana Orbit ist jetzt öffentlich! Kartenscan in 11 Sprachen (Japanisch, Koreanisch und Chinesisch direkt auf dem Handy gelesen), Wert deiner Sammlung zu Cardmarket-Preisen, Aufbewahrung und Master-Sets, Tauschliste per Link oder QR-Code, Live-Tausch, Commander-Partien, baubare Decks, jeden Tag eine Mysterykarte, Abzeichen, Preisalarme und Widgets. Danke an die Tester für ihr Feedback!
</de-DE>
<es-ES>
¡Mana Orbit ya es pública! Escaneo de cartas en 11 idiomas (japonés, coreano y chino leídos en el teléfono), valor de tu colección a precio de Cardmarket, almacenamiento y colección maestra, lista de intercambio con un enlace o un código QR, intercambio en directo, partidas de Commander, mazos por montar, una Carta misteriosa cada día, insignias, alertas de precio y widgets. ¡Gracias a los testers por sus comentarios!
</es-ES>
<it-IT>
Mana Orbit è ora pubblica! Scansione delle carte in 11 lingue (giapponese, coreano e cinese letti sul telefono), valore della collezione ai prezzi Cardmarket, sistemazione e master set, lista scambi con un link o un codice QR, scambio dal vivo, partite di Commander, mazzi da costruire, una Carta misteriosa ogni giorno, badge, avvisi di prezzo e widget. Grazie ai tester per i loro feedback!
</it-IT>
<pt-BR>
Mana Orbit agora é pública! Escaneamento de cartas em 11 idiomas (japonês, coreano e chinês lidos no celular), valor da sua coleção pelo preço da Cardmarket, organização e master set, lista de trocas com link ou QR code, troca ao vivo, partidas de Commander, decks para montar, uma Carta mistério por dia, distintivos, alertas de preço e widgets. Obrigado aos testadores pelo feedback!
</pt-BR>
```

## 5. Catégorie, tags, coordonnées

- **Type** : Application (pas Jeu). **Gratuite.**
- **Catégorie** : **Divertissement** (appli compagnon d'un jeu de cartes). **Outils** convient aussi.
- **Tags** (5 au plus, liste fermée de la Play Console, rien sur les cartes ni les jeux pour une appli) : **Divertissement**, **Shopping** (prix et paniers Cardmarket / CardTrader), **Outils**. Pas « Lecteur de code-barres » ni « Appareil photo » : le scan lit des cartes, pas des codes-barres, et ne fait pas de photos ; un tag trompeur peut valoir un refus.
- **Site web** : `https://manaorbit.app` · **E-mail** : `contact@manaorbit.app` (obligatoire, visible sur la fiche ; c'est aussi le contact de la politique de confidentialité) · **Règles de confidentialité** : `https://manaorbit.app/privacy`.

## 6. Classification du contenu (questionnaire IARC)

Catégorie à choisir : **Utilitaires, productivité, communication ou autres** (ce n'est pas un jeu : l'appli ne fait que gérer des cartes réelles).

| Question | Réponse | Pourquoi |
|---|---|---|
| Violence | **Oui** · objet principal : Non · représentations visuelles : Oui · images dégoûtantes ou sanglantes : **Oui** · références dans le texte : Oui | Les images de cartes (Scryfall) sont des illustrations de fantasy, dont certaines montrent du sang ou de l'horreur (Phyrexians, Innistrad, Duskmourn…) ; les textes parlent de détruire, blesser, sacrifier. Un classement trop haut ne fait jamais refuser une appli, un classement trop bas oui. |
| Peur, horreur | Non | Pas de contenu destiné à effrayer. |
| Sexualité, nudité | Non | |
| Langage grossier | Non | |
| Drogues, alcool, tabac | Non | |
| Humour grossier | Non | |
| Jeux d'argent (réels ou simulés) | Non | Aucun pari, aucune loterie, aucune boîte à surprise : les prix affichés sont ceux de cartes physiques. |
| Les utilisateurs peuvent-ils interagir ou échanger du contenu ? | **Oui** | Liens publics de liste d'échange et de deck, avec le pseudo et la photo choisis (lecture seule, ni messagerie ni commentaires) ; « Signaler ce partage » sur chaque lien reçu (e-mail prérempli). |
| Partage de la position de l'utilisateur | Non | |
| Achats de biens numériques | Non | Pas d'achat intégré. Le panier CardTrader concerne des cartes physiques, sur le site de CardTrader. Passe à Oui le jour où l'achat « Soutenir » arrive (phase 2, `docs/a-faire.md`). |
| Accès à Internet sans filtre (navigateur intégré) | Non | Les liens externes (EDHREC, Cardmarket, CardTrader) s'ouvrent dans le navigateur du téléphone. |

Classification obtenue (12 octobre 2026) : **PEGI « Accord parental »** (ce que PEGI donne à une appli qui n'est pas un jeu), **ESRB Teen**, **IARC 12+**, **USK 16**, **ClassInd 16** (Brésil), Russie 12+, avec « Interactivité des utilisateurs ». USK et ClassInd à 16 viennent de « sanglantes : Oui » ; cela ne joue que sur le contrôle parental de ces deux pays.


## 6 bis. Accès aux applis (Contenu de l'appli)

- **Certaines fonctionnalités sont limitées** : la synchronisation, les decks EDHREC (Decks › À monter : compte Google ou adresse vérifiée), le partage (liste d'échange, decks publiés), l'échange en direct, le QR code de la table d'une partie et le classement de la Carte mystère demandent un compte ; tout le reste marche sans compte.
- Compte de vérification pour Google : une adresse dédiée (par exemple `review@manaorbit.app`, boîte Hostinger), inscrite dans l'appli par **Compte** (icône en haut à droite) › E-mail + Mot de passe › **Créer mon compte**, puis le lien de vérification reçu dans la boîte ouvert. Le propriétaire saisit l'adresse et le mot de passe directement dans la Play Console (jamais dans le dépôt ni dans une conversation).
- Instructions à coller : « Toucher l'avatar en haut à droite › Se connecter › saisir l'e-mail et le mot de passe ci-dessus › Me connecter. Decks EDHREC : barre du bas › Decks › À monter. Carte mystère : icône en haut de l'accueil. »
- Instructions en anglais : “Tap the avatar (top right) › Sign in › enter the email and password above › Sign in. EDHREC decks: bottom bar › Decks › To build. Mystery card: icon at the top of the home screen.”

## 7. Public cible et annonces

- **Tranches d'âge** : 13 à 15 ans, 16 à 17 ans, 18 ans et plus. Ne coche aucune tranche de moins de 13 ans (sinon le programme Familles s'applique, incompatible avec le bandeau AdMob tel qu'il est réglé).
- **L'appli peut-elle attirer les enfants ?** Non : outil de collection pour un jeu de cartes destiné aux 13 ans et plus.
- **Annonces** : **Oui, l'appli contient des annonces.** Bandeau Google AdMob en haut de l'écran, dans l'appli Android seulement, sur les écrans de consultation (accueil, collection, decks) ; aucun bandeau pour les comptes autorisés (`ALLOWED_UIDS`, seulement si le serveur a `CARDTRADER_TOKEN`), ni pendant la saisie, la recherche et les résultats, l'éditeur de deck, l'accueil du premier lancement, le scan et la carte en grand.
- **Identifiant publicitaire** : **Oui**, utilisé pour la **publicité ou le marketing** (SDK Google Mobile Ads).

## 8. Sécurité des données (résumé pour le formulaire)

Réponses générales :

| Question | Réponse |
|---|---|
| L'appli collecte-t-elle ou partage-t-elle des données ? | **Oui** |
| Données chiffrées en transit ? | **Oui** (HTTPS partout : site, serveur, Firebase, Google) |
| Les utilisateurs peuvent-ils demander la suppression ? | **Oui** : dans l'appli (Compte › Supprimer mon compte) et sur le web : `https://manaorbit.app/?delete-account`. La suppression arrête aussi les alertes et notifications sur le serveur. |
| Compte | Facultatif : **e-mail et mot de passe, ou Google** (Firebase Authentication). L'appli marche sans compte. Méthodes à cocher : **Nom d'utilisateur et mot de passe** + **OAuth**. |
| Lien de suppression du compte (rubrique dédiée) | `https://manaorbit.app/?delete-account` |
| Données vendues ? | Jamais |

Types de données à cocher :

| Type (catégorie Play) | Collectée | Partagée | Facultative | Finalité | Détail |
|---|---|---|---|---|---|
| Infos personnelles › **Adresse e-mail** | Oui | Non | Oui (compte) | Fonctionnalités de l'appli, gestion du compte | Firebase Authentication. |
| Infos personnelles › **Nom** | Oui | Non | Oui | Gestion du compte, fonctionnalités de l'appli | Nom du profil Google (Firebase Authentication, connexion Google) et pseudo choisi dans Compte › Modifier le profil (Firestore), affiché sur les liens partagés. |
| Photos et vidéos › **Photos** | Oui | Non | Oui | Fonctionnalités de l'appli, gestion du compte | Photo de profil choisie par l'utilisateur (réduite à 128 px), gardée dans le compte et affichée sur ses liens partagés. |
| Infos personnelles › **ID utilisateur** | Oui | Non | Oui (compte) | Fonctionnalités de l'appli, gestion du compte | Identifiant Firebase du compte. |
| Activité dans l'appli › **Autre contenu généré par l'utilisateur** | Oui | Non | Oui (compte) | Fonctionnalités de l'appli | Collection, decks, historique de valeur, liste d'échange, dans le compte (Firestore). Les liens publics sont créés par l'utilisateur lui-même : ce n'est pas un « partage » au sens de Google. |
| Activité dans l'appli › **Autres actions** | Oui | Non | Oui | Fonctionnalités de l'appli | Alertes de prix : cartes surveillées, seuils et nom des decks concernés, gardés sur le serveur tant que l'alerte est active. |
| Identifiants › **ID de l'appareil ou autres** | Oui | **Oui** (publicité) | Non (pub) / Oui (notifications) | Collecte : publicité ou marketing, statistiques, prévention des fraudes, fonctionnalités de l'appli. Partage : publicité ou marketing, statistiques, prévention des fraudes | Identifiant publicitaire (SDK AdMob) ; jeton Firebase Cloud Messaging des notifications, gardé sur le serveur tant qu'elles sont actives (le texte des notifications, noms de cartes et de decks, passe par FCM chez Google, prestataire d'envoi). |
| Position › **Position approximative** | Oui | **Oui** | Non | Publicité ou marketing, statistiques, prévention des fraudes | Déduite de l'adresse IP par le SDK AdMob. |
| Activité dans l'appli › **Interactions avec l'appli** | Oui | **Oui** | Non | Publicité ou marketing, statistiques, prévention des fraudes | SDK AdMob (affichages et clics sur les annonces). |
| Infos et performances de l'appli › **Journaux de plantage, Diagnostics, Autres données de performances** | Oui | **Oui** | Non | Statistiques, publicité, prévention des fraudes | SDK AdMob. |
| Infos personnelles › **Autres infos** | Oui, **traitement éphémère** | Non | Oui | Fonctionnalités de l'appli | Avec un token CardTrader seulement : envoyé au serveur avec les seules recherches CardTrader (jamais les alertes ni l'import), utilisé en mémoire le temps de la recherche ; le serveur n'en garde qu'une empreinte SHA-256 pour espacer les requêtes et ne l'écrit jamais sur disque, dans les journaux ni dans le compte. Cas limite : un token n'est pas une donnée personnelle classique, mais le déclarer ne coûte rien. |
| Photos et vidéos › **Photos** (2e usage) | Oui | Non | Oui | Fonctionnalités de l'appli, statistiques | « Signaler un problème de scan » : seulement si l'utilisateur appuie sur Envoyer, la photo de la carte ratée (réduite, ≈ 900 px) part au serveur avec son commentaire ; gardée 90 jours au plus, visible du seul éditeur (`/admin`), supprimable sur demande. Dans le formulaire, coche « Photos » une seule fois avec les deux finalités. |
| Infos et performances de l'appli › **Diagnostics** (2e usage) | Oui | Non | Oui | Fonctionnalités de l'appli, statistiques | Même envoi : ce que l'appli a lu (texte du nom, ligne du bas, carte retenue, moteur de lecture, version) ; avec un compte, une empreinte de l'identifiant (jamais l'e-mail ni l'IP). Dans le formulaire : la même case « Diagnostics » que pour AdMob, avec la finalité « Fonctionnalités de l'appli » en plus. |
| Activité dans l'appli › **Autres actions** (2e usage) | Oui | Non | Oui | Fonctionnalités de l'appli, prévention des fraudes | Carte mystère et niveau (depuis le 16 octobre) : parties (heure, étapes, propositions, score), XP retenue pour le classement des niveaux ; pseudo du profil, score et niveau **affichés dans les classements** (l'utilisateur le choisit en jouant : pas un « partage » au sens de Google). Coche la même case « Autres actions » avec la finalité « Prévention des fraudes » en plus. |
| Identifiants › **ID de l'appareil ou autres** (2e usage) | Oui | Non | Oui | Prévention des fraudes, fonctionnalités de l'appli | Carte mystère : identifiant aléatoire propre à l'appareil (anti-triche des comptes secondaires) et empreinte de l'adresse IP salée chaque jour, effacée à la fin de la journée de jeu (jamais l'adresse elle-même). Même case que AdMob et FCM, finalité « Prévention des fraudes » déjà cochée. |

Non collecté : vidéos, photos du scan hors signalement (lues sur le téléphone, jamais envoyées), contacts, position précise, données financières, santé, messages, fichiers, historique de navigation.

Photo de profil : celle que l'utilisateur choisit (Compte › Modifier le profil) est gardée dans son compte, d'où la ligne « Photos » ci-dessus ; la photo Google (lien gardé par Firebase Authentication) s'affiche seulement sur le bouton Compte, sans être copiée.

Vérifié, rien de plus à déclarer pour les derniers ajouts :
- « Envoyer un avis » (Réglages › Aide et avis) et « Signaler ce partage » : lien `mailto`, le message part de l'appli mail de l'utilisateur, qui voit tout avant d'envoyer ; Mana Orbit n'envoie rien (la collection n'est jamais jointe).
- « Pour toi » (liste d'échange reçue) et QR code : calculés sur l'appareil.
- « Prochaines extensions » : liste publique lue chez Scryfall par le téléphone, sans donnée de l'utilisateur.
- Widget (valeur estimée appli fermée) : télécharge le fichier de prix du serveur et calcule sur le téléphone ; la liste des cartes ne quitte pas l'appareil.
- Demande de note : la carte de note de Google Play dans l'appli (In-App Review, APK 1.0.6 : c'est Google qui l'affiche et reçoit la note) ou la fiche Play Store ; Mana Orbit n'envoie rien.

Avant d'envoyer le formulaire, compare avec les pages officielles (elles changent parfois) et ajoute ce qui manque :
- AdMob : https://developers.google.com/admob/android/privacy/play-data-disclosure
- ML Kit (reconnaissance de texte du scan, via les services Google Play ; latin, et depuis l'APK 1.0.6 chinois, japonais, coréen) : https://developers.google.com/ml-kit/android-data-disclosure

À garder en tête :
- La politique de confidentialité (`/privacy`) doit déjà parler du bandeau AdMob le jour de la publication. C'est le cas dans la version qui ajoute AdMob ; vérifie qu'elle est bien en ligne.
- EDHREC et Archidekt (`docs/mails-partenaires.md`) : toujours sans réponse au 20 octobre. Décision (`docs/a-faire.md`) : sans réponse à la production, publier avec crédit et lien (déjà là), lecture hebdomadaire par le serveur seulement, interrupteurs `EDHREC_OFF` / `ARCHIDEKT_OFF` prêts ; en cas de refus, plan B.

## 9. Visuels (piste A « Orbite continue », choisie le 20 octobre)

Une seule orbite foil, avec les cinq orbes de mana, traverse les 8 captures d'un bout à l'autre (l'espace entre deux captures compris) : en faisant défiler la fiche, l'image continue d'une capture à la suivante. Téléphones inclinés tour à tour à gauche et à droite, légende en haut. Maquettes des trois pistes : canvas « Mana Orbit – visuels Play Store » (claude.ai).

| Fichier | Format | Usage |
|---|---|---|
| `feature-graphic-<langue>.png` (fr, en, de, es, it, pt) | 1024 × 500, sans transparence | Image de présentation de chaque fiche |
| `<langue>/01-scan` … `<langue>/08-valeur` (.png, ou .jpg au-delà de 1 Mo) | 1080 × 1920 (9:16) | Les 8 captures du téléphone de chaque fiche, dans cet ordre |
| `../../pwa/icons/icon-512.png` | 512 × 512 | Icône de l'appli |
| `developer-header.jpg` | 4096 × 2304, JPEG | Image d'en-tête de la page de développeur ; icône de développeur : celle de l'appli |

Play Console › Fiche principale › chaque langue › « Captures d'écran du téléphone » : envoie les 8 fichiers **dans l'ordre des numéros** (l'orbite ne se raccorde que dans cet ordre) ; « Image de présentation » : la bannière de la langue.

| # | Fichier | Écran | Légende FR | Légende EN |
|---|---|---|---|---|
| 1 | `01-scan` | Scan | Scanne en 11 langues · Même le japonais, lu sur ton téléphone | Scan in 11 languages · Even Japanese, read right on your phone |
| 2 | `02-cote` | Accueil | La cote de ta collection · Au prix Cardmarket, mise à jour chaque jour | Your collection, valued · Cardmarket prices, updated every day |
| 3 | `03-classeur` | Classeur d'échange | Ton classeur en un lien · Doublons et recherches, toujours à jour | Your binder, one link · Spares and wants, always up to date |
| 4 | `04-masterset` | Masterset | Complète tes extensions · Ce qui manque, en noir et blanc, avec son prix | Complete your sets · Missing cards in black and white, with their price |
| 5 | `05-partie` | Compteur de la partie | Ta table de Commander · Vie, blessures de commandant, poison, monarque | Your Commander table · Life, commander damage, poison, monarch |
| 6 | `06-decks` | Decks à monter | Les decks que tu peux monter · Decks Commander comparés à ta collection | Decks you can build · Commander decks matched to your collection |
| 7 | `07-carte-mystere` | Carte mystère (étape 4) | La Carte mystère du jour · Devine-la avant les autres, chaque soir à 18 h | The daily Mystery card · Guess it before everyone else, every evening |
| 8 | `08-valeur` | Stats, courbe de valeur | Sa valeur, jour après jour · Courbe, variations à 7 et 30 jours, alertes de prix | Its value, day by day · Chart, 7- and 30-day changes, price alerts |

Allemand, espagnol, italien, portugais : légendes dans `SHOTS` (`tools/store-assets.mjs`), écrans de l'appli dans la langue.

Les captures sont celles de la vraie appli (thème sombre), vue par un visiteur sans token CardTrader, comme la plupart des utilisateurs : prix Cardmarket seulement, aucune offre CardTrader (Google refuse les visuels qui promettent ce que l'appli ne donne pas). Collection d'exemple : 505 cartes, environ 2 330 €, quatre decks. Les images des cartes sont des cartes factices dessinées par le script (aucune illustration réelle), Carte mystère comprise (servie par le vrai serveur du jeu, compte connecté par le faux Firebase des tests) ; les vrais téléphones affichent les images Scryfall. Ni logo ni symbole de Wizards of the Coast. Aucune capture ne montre le bandeau publicitaire.

Si EDHREC ou Archidekt refusent : remplace la capture 6 par l'éditeur de deck (`SHOTS` dans `tools/store-assets.mjs`).
Après le lancement : teste la description courte et la première capture avec les tests de fiche de la Play Console (« Store listing experiments » en anglais).

### Refaire les visuels

```
node tools/store-assets.mjs              # tout : 8 captures + bannière, 6 langues (≈ 1 min par langue)
node tools/store-assets.mjs shots de     # une langue
node tools/store-assets.mjs feature      # bannières seulement
RAW=1 node tools/store-assets.mjs shots  # garde aussi les écrans bruts (shots/store/, non versionné)
node tools/store-assets.mjs raw fr       # écrans bruts seulement (maquettes)
```

Prérequis : `tests/node_modules` installé (Playwright), Chromium dans `/opt/pw-browsers/chromium` (ou la variable `CHROMIUM`), port 18980 libre. Aucune connexion Internet : le script sert l'appli avec le monde des tests (token CardTrader du serveur réservé à un compte, comme en production, Carte mystère allumée avec son faux Scryfall) et simule Scryfall côté navigateur. Les polices de l'appli (Bricolage Grotesque, Instrument Sans, licence OFL) sont dans `tools/fonts/` ; sans elles, le script prend les polices du système.
Les légendes, les données d'exemple (collection, decks, historique, extension du masterset, carte du jour) et l'ordre des écrans sont dans `tools/store-assets.mjs` (`SHOTS`, `DB_TXT`, `DECKS`, `MS_CARDS`, `DLY_CARD`).
