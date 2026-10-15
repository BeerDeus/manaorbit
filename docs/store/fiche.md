# Fiche Google Play : Mana Orbit

Tout ce qu'il faut copier dans la Play Console : en français (langue par défaut), puis en anglais, allemand, espagnol, italien et portugais du Brésil, les langues de l'appli (**Présence sur le Play Store › Fiche principale › Gérer les traductions › Ajouter vos propres traductions** : en-US, de-DE, es-ES, it-IT, pt-BR). Textes remis à jour le 15 octobre 2026 (scan dans 11 langues, édition lue en bas de la carte, rangement, partie de Commander, échange en direct) ; visuels à refaire à la fin du test fermé (`docs/a-faire.md`).
Les textes à coller sont dans les blocs gris : copie le bloc entier. Les longueurs sont vérifiées (limites de Google entre parenthèses).

Visuels : dans ce dossier, générés par `node tools/store-assets.mjs` (voir la fin de ce fichier).

---

## 1. Titre de l'appli (30 caractères au plus)

Ni « MTG » ni « Magic: The Gathering » dans le titre : ce sont des marques de Wizards of the Coast, que la Fan Content Policy interdit d'utiliser sans accord écrit. Le nom suivi de ce que fait l'appli suffit (les trois grands concurrents mettent « scanner » dans leur titre). « Cote » est le mot des collectionneurs français pour la valeur d'une carte.

| Langue | Titre | Longueur |
|---|---|---|
| Français (fr-FR, langue par défaut) | `Mana Orbit – Scan, cote, decks` | 30 |
| Anglais (en-US) | `Mana Orbit: Scan, Value, Decks` | 30 |
| Allemand (de-DE) | `Mana Orbit: Scan, Wert, Decks` | 29 |
| Espagnol (es-ES) | `Mana Orbit: escáner, valor` | 26 |
| Italien (it-IT) | `Mana Orbit: scanner, valore` | 27 |
| Portugais (Brésil, pt-BR) | `Mana Orbit: scan, valor, decks` | 30 |

Repli dans toutes les langues : `Mana Orbit` (10). Google déconseille les titres chargés de mots-clés : si le titre descriptif est refusé, reviens au nom seul.

## 2. Description courte (80 caractères au plus)

Elle ne parle pas d'EDHREC : elle reste valable si EDHREC refuse. Le scan dans 11 langues d'abord (aucun concurrent ne lit le japonais, le coréen et le chinois sur le téléphone), puis la cote, le rangement, l'échange et la partie.

Français (fr-FR, langue par défaut) (78) :

```
Scanne tes cartes Magic en 11 langues, suis leur cote, range, échange et joue.
```

Anglais (en-US) (80) :

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
Seules les premières lignes s'affichent avant « Plus » : elles disent l'essentiel (scan, cote, rangement, échange, partie de Commander, decks, gratuit). Le scanner passe en premier.
La Play Console n'a pas de champ de mots-clés : ils sont dans le texte (scanner de cartes, cartes Magic, cote, Commander, liste d'échange, doublons, classeur, alerte de prix). Les noms des fonctions sont ceux de l'appli dans chaque langue (« À vérifier », « À aller chercher », « Pour toi », « Échange en direct »…).
Avant de coller : toutes les fonctions citées doivent être en ligne (Google refuse une fiche qui promet ce que l'appli ne fait pas). Les noms japonais, coréens et chinois sont lus dès que le workflow « Catalogues des noms imprimés » a produit `names-ja/ko/zhs/zht.tsv`.

### Français (fr-FR, langue par défaut) (3830 caractères)

```
Scanne tes cartes Magic dans 11 langues, découvre la cote de ta collection au prix Cardmarket, range-la, échange tes doublons en un lien ou un QR code, joue tes parties de Commander et trouve les decks que tu peux déjà monter. Gratuit, sans compte obligatoire.

LE SCANNER DE CARTES
• Cadre la carte et appuie, ou laisse le scan automatique ajouter chaque carte posée devant l'objectif.
• L'édition exacte est lue en bas de la carte (extension, numéro, langue) ; pour les cartes plus anciennes, l'illustration et le symbole d'extension la retrouvent.
• 11 langues : français, anglais, allemand, espagnol, italien, portugais, russe, japonais, coréen, chinois simplifié et traditionnel. Les lots mélangés sont lus carte par carte.
• En cas de doute, la carte est « à vérifier », avec ta photo pour comparer.
• La lecture se fait sur ton téléphone : la photo n'est envoyée que si tu signales un scan raté.
• Prix rapide, session d'ouverture de boosters (bilan gain ou perte, image à partager), scan au téléphone vers l'ordinateur.

TA COLLECTION ET SA COTE
• Importe tes cartes en un geste : CSV de ManaBox (classeurs compris), Moxfield, Archidekt, Deckbox, Dragon Shield, ou une simple liste « 3 Sol Ring ».
• Chaque exemplaire garde sa langue, son édition, son état et son foil.
• La cote jour après jour : courbe, variations à 7 et 30 jours, cartes dont le prix a bougé, stats.

TON RANGEMENT
• Classeurs, boîtes, decks : chaque carte sait où elle est. Range-les dès le scan.
• « À aller chercher » : pour monter un deck, la liste des cartes et l'endroit où elles sont rangées.
• Tes proxys sont comptés à part.

TES ÉCHANGES
• Ta liste d'échange se fait toute seule : tes doublons et les cartes que tu recherches, avec leur valeur, en liste ou en classeur à feuilleter.
• Partage-la en un lien ou un QR code : ton ami la consulte sans appli ni compte.
• « Pour toi » : ce qui t'intéresse chez lui, et l'inverse.
• Échange en direct, face à face : chacun choisit ses cartes, vous validez, vos collections sont mises à jour. Et une liste d'amis.

TES PARTIES DE COMMANDER
• Points de vie, blessures de commandant et éliminations, sur un seul téléphone ou un par joueur (QR code pour rejoindre la table).
• Le résultat arrive chez chaque joueur, avec l'historique de tes parties.

TES DECKS
• Les decks Commander que ta collection monte presque (EDHREC), avec les cartes qui manquent et leur prix ; filtres par couleurs, budget, thème et bracket.
• Crée un deck ou colle une decklist (Moxfield, Archidekt, EDHREC…) : images, courbe de mana, main de départ, valeur. Communauté : les decks publiés par les joueurs.

LE PRIX D'UNE LISTE
• Colle une liste : le total au prix Cardmarket, sans les cartes que tu as déjà, prêt pour ta Wants list. Avec ton token CardTrader : le panier le moins cher, port compris.

ALERTES ET WIDGETS
• Alerte quand une carte qui manque à tes decks, ou une carte que tu suis, baisse fortement.
• Widgets : la cote de ta collection et ton QR code d'échange sur l'écran d'accueil.

ET AUSSI
• Hors ligne : ta collection reste sur ton téléphone. Compte facultatif (e-mail ou Google) pour la retrouver partout, synchronisée en direct.
• Visite guidée, aide intégrée et « Envoyer un avis » : je lis tout.

CONFIDENTIALITÉ
Sans compte, tout reste sur ton appareil. Aucune donnée n'est vendue. Un petit bandeau publicitaire paie l'hébergement.
Politique de confidentialité : https://manaorbit.app/privacy

Mana Orbit est un contenu de fan non officiel autorisé par la Fan Content Policy. Il n'est ni approuvé ni soutenu par Wizards of the Coast. Certains éléments utilisés sont la propriété de Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit n'est lié à aucun des sites et applis cités (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Données et images des cartes : Scryfall.
```

### Anglais (en-US) (3489 caractères)

```
Scan your Magic cards in 11 languages, see what your collection is worth at Cardmarket prices, organize it, trade your spares with a link or a QR code, play your Commander games and find the decks you can already build. Free, no account required.

THE CARD SCANNER
• Frame the card and tap, or let auto scan add each card you place in front of the camera.
• The exact printing is read at the bottom of the card (set, number, language); for older cards, the artwork and the set symbol find it.
• 11 languages: English, French, German, Spanish, Italian, Portuguese, Russian, Japanese, Korean, Simplified and Traditional Chinese. Mixed piles are read card by card.
• When in doubt, the card is marked "to check", with your photo to compare.
• Recognition runs on your phone: the photo is only sent if you report a failed scan.
• Quick price, booster opening sessions (profit or loss, an image to share), scan with your phone straight to your computer.

YOUR COLLECTION AND ITS VALUE
• Import your cards in one go: CSV from ManaBox (binders included), Moxfield, Archidekt, Deckbox, Dragon Shield, or a simple "3 Sol Ring" list.
• Every copy keeps its language, printing, condition and foil.
• Its value day after day: chart, 7- and 30-day changes, cards whose price moved, stats.

YOUR STORAGE
• Binders, boxes, decks: every card knows where it is. File them as you scan.
• "To fetch": to build a deck, the list of cards and where each one is stored.
• Your proxies are counted separately.

YOUR TRADES
• Your trade list builds itself: your spares and the cards you want, with their value, as a list or a binder to flip through.
• Share it with a link or a QR code: your friend opens it with no app and no account.
• "For you": what you want from them, and the other way around.
• Live trade, face to face: each picks their cards, you both confirm, your collections are updated. Plus a friends list.

YOUR COMMANDER GAMES
• Life totals, commander damage and eliminations, on one phone or one per player (QR code to join the table).
• The result reaches every player, with your game history.

YOUR DECKS
• The Commander decks your collection almost builds (EDHREC), with the missing cards and their price; filter by colors, budget, theme and bracket.
• Build a deck or paste a decklist (Moxfield, Archidekt, EDHREC…): images, mana curve, sample hand, value. Community: decks published by players.

PRICE A LIST
• Paste a list: the Cardmarket total, minus the cards you own, ready for your Wants list. With your CardTrader token: the cheapest cart, shipping included.

ALERTS AND WIDGETS
• An alert when a card your decks are missing, or a card you follow, drops sharply.
• Widgets: your collection's value and your trade QR code on your home screen.

ALSO
• Offline: your collection stays on your phone. Optional account (email or Google) to get it everywhere, synced live.
• Guided tour, built-in help and "Send feedback": I read everything.

PRIVACY
Without an account, everything stays on your device. No data is ever sold. A small ad banner pays for hosting.
Privacy policy: https://manaorbit.app/privacy

Mana Orbit is unofficial Fan Content permitted under the Fan Content Policy. Not approved/endorsed by Wizards. Portions of the materials used are property of Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit is not affiliated with any of the sites and apps named here (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Card data and images: Scryfall.
```

### Allemand (de-DE) (3769 caractères)

```
Scanne deine Magic-Karten in 11 Sprachen, sieh den Wert deiner Sammlung zu Cardmarket-Preisen, ordne sie, tausche deine Doppelten per Link oder QR-Code, spiel deine Commander-Partien und finde die Decks, die du schon bauen kannst. Kostenlos, ohne Konto.

DER KARTENSCANNER
• Karte ins Bild halten und tippen – oder der Auto-Scan fügt jede Karte hinzu, die du vor die Kamera legst.
• Die genaue Ausgabe wird unten auf der Karte gelesen (Edition, Nummer, Sprache); bei älteren Karten finden Illustration und Editionssymbol sie.
• 11 Sprachen: Deutsch, Englisch, Französisch, Spanisch, Italienisch, Portugiesisch, Russisch, Japanisch, Koreanisch, Chinesisch (vereinfacht und traditionell). Gemischte Stapel werden Karte für Karte gelesen.
• Im Zweifel steht die Karte auf „Prüfen“, mit deinem Foto zum Vergleich.
• Die Erkennung läuft auf deinem Handy: Das Foto wird nur gesendet, wenn du einen fehlgeschlagenen Scan meldest.
• Schnellpreis, Booster-Öffnungen (Gewinn oder Verlust, Bild zum Teilen), Scan mit dem Handy direkt auf den Computer.

DEINE SAMMLUNG UND IHR WERT
• Importiere deine Karten auf einmal: CSV aus ManaBox (mit Ordnern), Moxfield, Archidekt, Deckbox, Dragon Shield oder eine einfache Liste „3 Sol Ring“.
• Jedes Exemplar behält Sprache, Ausgabe, Zustand und Foil.
• Der Wert Tag für Tag: Kurve, Änderung über 7 und 30 Tage, Karten mit Preisbewegung, Statistiken.

DEINE ORDNUNG
• Ordner, Boxen, Decks: Jede Karte weiß, wo sie liegt. Einsortieren schon beim Scannen.
• „Zum Holen“: Für ein Deck die Liste der Karten und wo jede liegt.
• Deine Proxys werden getrennt gezählt.

DEINE TAUSCHGESCHÄFTE
• Deine Tauschliste entsteht von selbst: deine Doppelten und deine gesuchten Karten, mit Wert, als Liste oder als Ordner zum Blättern.
• Teile sie per Link oder QR-Code: Dein Freund öffnet sie ohne App und ohne Konto.
• „Für dich“: was du bei ihm suchst, und umgekehrt.
• Live-Tausch von Angesicht zu Angesicht: Jeder wählt seine Karten, ihr bestätigt beide, eure Sammlungen werden aktualisiert. Dazu eine Freundesliste.

DEINE COMMANDER-PARTIEN
• Lebenspunkte, Commander-Schaden und Ausscheiden, auf einem Handy oder einem pro Spieler (QR-Code, um dem Tisch beizutreten).
• Das Ergebnis kommt bei jedem Spieler an, mit deinem Partieverlauf.

DEINE DECKS
• Die Commander-Decks, die deine Sammlung fast baut (EDHREC), mit fehlenden Karten und Preis; Filter nach Farben, Budget, Thema und Bracket.
• Baue ein Deck oder füge eine Deckliste ein (Moxfield, Archidekt, EDHREC…): Bilder, Manakurve, Starthand, Wert. Community: von Spielern veröffentlichte Decks.

PREIS EINER LISTE
• Füge eine Liste ein: der Cardmarket-Gesamtpreis ohne die Karten, die du schon hast, bereit für deine Wants-Liste. Mit deinem CardTrader-Token: der günstigste Warenkorb inklusive Versand.

ALARME UND WIDGETS
• Ein Alarm, wenn eine Karte, die deinen Decks fehlt, oder eine beobachtete Karte stark fällt.
• Widgets: der Wert deiner Sammlung und dein Tausch-QR-Code auf dem Startbildschirm.

AUSSERDEM
• Offline: Deine Sammlung bleibt auf deinem Handy. Optionales Konto (E-Mail oder Google), um sie überall live synchronisiert zu haben.
• Rundgang, integrierte Hilfe und „Feedback senden“: Ich lese alles.

DATENSCHUTZ
Ohne Konto bleibt alles auf deinem Gerät. Keine Daten werden verkauft. Ein kleines Werbebanner bezahlt das Hosting.
Datenschutzerklärung: https://manaorbit.app/privacy

Mana Orbit ist inoffizieller Fan-Content gemäß der Fan Content Policy. Nicht von Wizards genehmigt oder unterstützt. Teile der verwendeten Materialien sind Eigentum von Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit ist mit keiner der genannten Seiten und Apps verbunden (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Kartendaten und -bilder: Scryfall.
```

### Espagnol (es-ES) (3788 caractères)

```
Escanea tus cartas Magic en 11 idiomas, descubre el valor de tu colección a precio de Cardmarket, organízala, intercambia tus repetidas con un enlace o un código QR, juega tus partidas de Commander y encuentra los mazos que ya puedes montar. Gratis, sin cuenta obligatoria.

EL ESCÁNER DE CARTAS
• Encuadra la carta y toca, o deja que el escaneo automático añada cada carta que pongas delante de la cámara.
• La edición exacta se lee en la parte inferior de la carta (expansión, número, idioma); en las cartas más antiguas, la ilustración y el símbolo de expansión la encuentran.
• 11 idiomas: español, inglés, francés, alemán, italiano, portugués, ruso, japonés, coreano, chino simplificado y tradicional. Los lotes mezclados se leen carta por carta.
• Si hay dudas, la carta queda «por revisar», con tu foto para comparar.
• El reconocimiento se hace en tu teléfono: la foto solo se envía si informas de un escaneo fallido.
• Precio rápido, sesiones de apertura de sobres (ganancia o pérdida, imagen para compartir), escaneo con el teléfono directo al ordenador.

TU COLECCIÓN Y SU VALOR
• Importa tus cartas de una vez: CSV de ManaBox (carpetas incluidas), Moxfield, Archidekt, Deckbox, Dragon Shield o una simple lista «3 Sol Ring».
• Cada copia conserva su idioma, su edición, su estado y su foil.
• Su valor día a día: gráfica, variaciones a 7 y 30 días, cartas cuyo precio ha cambiado, estadísticas.

TU ORDEN
• Carpetas, cajas, mazos: cada carta sabe dónde está. Guárdalas al escanear.
• «Por buscar»: para montar un mazo, la lista de cartas y dónde está guardada cada una.
• Tus proxies se cuentan aparte.

TUS INTERCAMBIOS
• Tu lista de intercambio se hace sola: tus repetidas y las cartas que buscas, con su valor, en lista o en carpeta para hojear.
• Compártela con un enlace o un código QR: tu amigo la abre sin app y sin cuenta.
• «Para ti»: lo que te interesa de él, y al revés.
• Intercambio en directo, cara a cara: cada uno elige sus cartas, ambos confirmáis y vuestras colecciones se actualizan. Y una lista de amigos.

TUS PARTIDAS DE COMMANDER
• Vidas, daño de comandante y eliminaciones, en un solo teléfono o uno por jugador (código QR para unirse a la mesa).
• El resultado llega a cada jugador, con el historial de tus partidas.

TUS MAZOS
• Los mazos Commander que tu colección casi monta (EDHREC), con las cartas que faltan y su precio; filtros por colores, presupuesto, tema y bracket.
• Crea un mazo o pega una lista (Moxfield, Archidekt, EDHREC…): imágenes, curva de maná, mano inicial, valor. Comunidad: mazos publicados por los jugadores.

EL PRECIO DE UNA LISTA
• Pega una lista: el total a precio de Cardmarket, sin las cartas que ya tienes, lista para tu Wants list. Con tu token de CardTrader: la cesta más barata, envío incluido.

ALERTAS Y WIDGETS
• Una alerta cuando una carta que les falta a tus mazos, o una carta que sigues, baja mucho.
• Widgets: el valor de tu colección y tu código QR de intercambio en la pantalla de inicio.

ADEMÁS
• Sin conexión: tu colección se queda en tu teléfono. Cuenta opcional (correo o Google) para tenerla en todas partes, sincronizada en directo.
• Visita guiada, ayuda integrada y «Enviar una opinión»: lo leo todo.

PRIVACIDAD
Sin cuenta, todo se queda en tu dispositivo. Nunca se venden datos. Un pequeño banner publicitario paga el alojamiento.
Política de privacidad: https://manaorbit.app/privacy

Mana Orbit es contenido de fans no oficial permitido por la Fan Content Policy. No está aprobado ni respaldado por Wizards. Parte de los materiales utilizados son propiedad de Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit no está vinculado a ninguno de los sitios y apps citados (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Datos e imágenes de las cartas: Scryfall.
```

### Italien (it-IT) (3932 caractères)

```
Scansiona le tue carte Magic in 11 lingue, scopri il valore della tua collezione ai prezzi Cardmarket, sistemala, scambia i tuoi doppioni con un link o un codice QR, gioca le tue partite di Commander e trova i mazzi che puoi già costruire. Gratis, senza account obbligatorio.

LO SCANNER DI CARTE
• Inquadra la carta e tocca, oppure lascia che la scansione automatica aggiunga ogni carta che metti davanti alla fotocamera.
• L'edizione esatta viene letta in fondo alla carta (espansione, numero, lingua); per le carte più vecchie la trovano l'illustrazione e il simbolo dell'espansione.
• 11 lingue: italiano, inglese, francese, tedesco, spagnolo, portoghese, russo, giapponese, coreano, cinese semplificato e tradizionale. I lotti misti vengono letti carta per carta.
• Nel dubbio la carta resta «Da verificare», con la tua foto per confrontare.
• Il riconoscimento avviene sul telefono: la foto viene inviata solo se segnali una scansione non riuscita.
• Prezzo rapido, sessioni di apertura delle buste (guadagno o perdita, immagine da condividere), scansione col telefono direttamente sul computer.

LA TUA COLLEZIONE E IL SUO VALORE
• Importa le tue carte in un colpo solo: CSV di ManaBox (raccoglitori compresi), Moxfield, Archidekt, Deckbox, Dragon Shield o una semplice lista «3 Sol Ring».
• Ogni copia conserva lingua, edizione, condizione e foil.
• Il valore giorno per giorno: grafico, variazioni a 7 e 30 giorni, carte il cui prezzo è cambiato, statistiche.

LA TUA SISTEMAZIONE
• Raccoglitori, scatole, mazzi: ogni carta sa dov'è. Sistemale già durante la scansione.
• «Da prendere»: per costruire un mazzo, l'elenco delle carte e dove si trova ciascuna.
• I tuoi proxy sono contati a parte.

I TUOI SCAMBI
• La tua lista scambi si crea da sola: i tuoi doppioni e le carte che cerchi, con il loro valore, in lista o in un raccoglitore da sfogliare.
• Condividila con un link o un codice QR: il tuo amico la apre senza app e senza account.
• «Per te»: ciò che ti interessa da lui, e viceversa.
• Scambio dal vivo, faccia a faccia: ognuno sceglie le sue carte, confermate entrambi e le vostre collezioni vengono aggiornate. E una lista di amici.

LE TUE PARTITE DI COMMANDER
• Punti vita, danni da comandante ed eliminazioni, su un solo telefono o uno per giocatore (codice QR per unirsi al tavolo).
• Il risultato arriva a ogni giocatore, con lo storico delle tue partite.

I TUOI MAZZI
• I mazzi Commander che la tua collezione costruisce quasi (EDHREC), con le carte mancanti e il loro prezzo; filtri per colori, budget, tema e bracket.
• Crea un mazzo o incolla una lista (Moxfield, Archidekt, EDHREC…): immagini, curva di mana, mano iniziale, valore. Community: i mazzi pubblicati dai giocatori.

IL PREZZO DI UNA LISTA
• Incolla una lista: il totale ai prezzi Cardmarket, senza le carte che hai già, pronta per la tua Wants list. Con il tuo token CardTrader: il carrello più economico, spedizione compresa.

AVVISI E WIDGET
• Un avviso quando una carta che manca ai tuoi mazzi, o una carta che segui, cala molto.
• Widget: il valore della tua collezione e il tuo codice QR di scambio nella schermata Home.

E INOLTRE
• Offline: la tua collezione resta sul telefono. Account facoltativo (e-mail o Google) per ritrovarla ovunque, sincronizzata in tempo reale.
• Tour guidato, guida integrata e «Invia un feedback»: leggo tutto.

PRIVACY
Senza account tutto resta sul tuo dispositivo. Nessun dato viene venduto. Un piccolo banner pubblicitario paga l'hosting.
Informativa sulla privacy: https://manaorbit.app/privacy

Mana Orbit è un contenuto di fan non ufficiale consentito dalla Fan Content Policy. Non è approvato né sostenuto da Wizards. Parte dei materiali utilizzati è di proprietà di Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit non è collegato a nessuno dei siti e delle app citati (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Dati e immagini delle carte: Scryfall.
```

### Portugais (Brésil, pt-BR) (3735 caractères)

```
Escaneie suas cartas Magic em 11 idiomas, descubra o valor da sua coleção pelo preço da Cardmarket, organize tudo, troque suas repetidas com um link ou um QR code, jogue suas partidas de Commander e encontre os decks que você já pode montar. Grátis, sem conta obrigatória.

O ESCÂNER DE CARTAS
• Enquadre a carta e toque, ou deixe o escaneamento automático adicionar cada carta colocada na frente da câmera.
• A edição exata é lida na parte de baixo da carta (coleção, número, idioma); nas cartas mais antigas, a ilustração e o símbolo da coleção a encontram.
• 11 idiomas: português, inglês, francês, alemão, espanhol, italiano, russo, japonês, coreano, chinês simplificado e tradicional. Lotes misturados são lidos carta por carta.
• Na dúvida, a carta fica «A verificar», com a sua foto para comparar.
• O reconhecimento é feito no seu celular: a foto só é enviada se você relatar um escaneamento que falhou.
• Preço rápido, sessões de abertura de boosters (lucro ou prejuízo, imagem para compartilhar), escaneamento com o celular direto para o computador.

SUA COLEÇÃO E SEU VALOR
• Importe suas cartas de uma vez: CSV do ManaBox (fichários incluídos), Moxfield, Archidekt, Deckbox, Dragon Shield ou uma lista simples «3 Sol Ring».
• Cada cópia guarda o idioma, a edição, o estado e o foil.
• O valor dia após dia: gráfico, variações em 7 e 30 dias, cartas cujo preço mudou, estatísticas.

SUA ORGANIZAÇÃO
• Fichários, caixas, decks: cada carta sabe onde está. Guarde já ao escanear.
• «Para buscar»: para montar um deck, a lista das cartas e onde cada uma está guardada.
• Seus proxies são contados à parte.

SUAS TROCAS
• Sua lista de trocas se monta sozinha: suas repetidas e as cartas que você procura, com o valor, em lista ou em fichário para folhear.
• Compartilhe com um link ou um QR code: seu amigo abre sem app e sem conta.
• «Para você»: o que te interessa na lista dele, e vice-versa.
• Troca ao vivo, cara a cara: cada um escolhe suas cartas, vocês dois confirmam e as coleções são atualizadas. E uma lista de amigos.

SUAS PARTIDAS DE COMMANDER
• Pontos de vida, dano de comandante e eliminações, em um só celular ou um por jogador (QR code para entrar na mesa).
• O resultado chega a cada jogador, com o histórico das suas partidas.

SEUS DECKS
• Os decks Commander que sua coleção quase monta (EDHREC), com as cartas que faltam e o preço; filtros por cores, orçamento, tema e bracket.
• Crie um deck ou cole uma lista (Moxfield, Archidekt, EDHREC…): imagens, curva de mana, mão inicial, valor. Comunidade: decks publicados pelos jogadores.

O PREÇO DE UMA LISTA
• Cole uma lista: o total pelo preço da Cardmarket, sem as cartas que você já tem, pronta para a sua Wants list. Com seu token da CardTrader: o carrinho mais barato, frete incluído.

ALERTAS E WIDGETS
• Um alerta quando uma carta que falta nos seus decks, ou uma carta que você acompanha, cai muito.
• Widgets: o valor da sua coleção e o seu QR code de troca na tela inicial.

E AINDA
• Offline: sua coleção fica no seu celular. Conta opcional (e-mail ou Google) para ter tudo em qualquer lugar, sincronizado ao vivo.
• Tour guiado, ajuda integrada e «Enviar feedback»: eu leio tudo.

PRIVACIDADE
Sem conta, tudo fica no seu aparelho. Nenhum dado é vendido. Um pequeno banner de anúncio paga a hospedagem.
Política de privacidade: https://manaorbit.app/privacy

Mana Orbit é conteúdo de fã não oficial permitido pela Fan Content Policy. Não é aprovado nem endossado pela Wizards. Parte dos materiais utilizados é propriedade da Wizards of the Coast. ©Wizards of the Coast LLC.
Mana Orbit não tem vínculo com nenhum dos sites e apps citados (Cardmarket, CardTrader, EDHREC, Archidekt, Moxfield, ManaBox, Scryfall…). Dados e imagens das cartas: Scryfall.
```

**Si EDHREC ou Archidekt refusent** : retire le premier point du bloc « LES DECKS » (premier point), "YOUR DECKS" (first bullet), „DEINE DECKS“ (erster Punkt), «TUS MAZOS» (primer punto), «I TUOI MAZZI» (primo punto), «SEUS DECKS» (primeiro item), et « EDHREC » des decklists collées. Titre et description courte ne changent pas.

## 4. Notes de version (500 caractères au plus)

Français (224) : `Première version Android : scan des cartes VF ou VO sur le téléphone, cote de ta collection au prix Cardmarket, decks Commander à monter, liste d'échange en un lien ou un QR code, alertes de prix et widget d'écran d'accueil.`

Anglais (219) : `First Android release: on-device card scanning in any language, your collection's value at Cardmarket prices, Commander decks you can build, a trade list shared by link or QR code, price alerts and a home screen widget.`

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

- **Certaines fonctionnalités sont limitées** : la synchronisation, les decks EDHREC (onglet Decks, « Deck à monter ») et le partage demandent un compte ; tout le reste marche sans compte.
- Compte de vérification pour Google : une adresse dédiée (par exemple `review@manaorbit.app`, boîte Hostinger), inscrite dans l'appli par **Compte** (icône en haut à droite) › E-mail + Mot de passe › **Créer mon compte**, puis le lien de vérification reçu dans la boîte ouvert. Le propriétaire saisit l'adresse et le mot de passe directement dans la Play Console (jamais dans le dépôt ni dans une conversation).
- Instructions à coller : « Toucher l'icône Compte en haut à droite › saisir l'e-mail et le mot de passe ci-dessus › Me connecter. Les decks EDHREC sont dans l'onglet Decks. »
- Instructions en anglais : “Tap the Account icon (top right) › enter the email and password above › Sign in. EDHREC decks are in the Decks tab.”

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

Non collecté : vidéos, photos du scan hors signalement (lues sur le téléphone, jamais envoyées), contacts, position précise, données financières, santé, messages, fichiers, historique de navigation.

Photo de profil : celle que l'utilisateur choisit (Compte › Modifier le profil) est gardée dans son compte, d'où la ligne « Photos » ci-dessus ; la photo Google (lien gardé par Firebase Authentication) s'affiche seulement sur le bouton Compte, sans être copiée.

Vérifié, rien de plus à déclarer pour les derniers ajouts :
- « Envoyer un avis » (Réglages › Aide et avis) et « Signaler ce partage » : lien `mailto`, le message part de l'appli mail de l'utilisateur, qui voit tout avant d'envoyer ; Mana Orbit n'envoie rien (la collection n'est jamais jointe).
- « Pour toi » (liste d'échange reçue) et QR code : calculés sur l'appareil.
- « Prochaines extensions » : liste publique lue chez Scryfall par le téléphone, sans donnée de l'utilisateur.
- Widget (valeur estimée appli fermée) : télécharge le fichier de prix du serveur et calcule sur le téléphone ; la liste des cartes ne quitte pas l'appareil.
- Demande de note : ouvre la fiche Play Store, rien n'est envoyé.

Avant d'envoyer le formulaire, compare avec les pages officielles (elles changent parfois) et ajoute ce qui manque :
- AdMob : https://developers.google.com/admob/android/privacy/play-data-disclosure
- ML Kit (reconnaissance de texte du scan, via les services Google Play) : https://developers.google.com/ml-kit/android-data-disclosure

À garder en tête :
- La politique de confidentialité (`/privacy`) doit déjà parler du bandeau AdMob le jour de la publication. C'est le cas dans la version qui ajoute AdMob ; vérifie qu'elle est bien en ligne.
- Ne publie qu'une fois l'accord d'EDHREC et d'Archidekt obtenu (voir `docs/mails-partenaires.md`). Avant le test fermé, envoie-leur la relance (même fichier) : voir `docs/store/test-ferme.md`.

## 9. Visuels

| Fichier | Format | Usage |
|---|---|---|
| `feature-graphic.png` | 1024 × 500, PNG sans transparence | Image de présentation (fiche française) |
| `feature-graphic-en.png` | 1024 × 500 | Image de présentation (fiche anglaise) |
| `fr/01-scan.png` … `fr/08-deck.png` | 1080 × 1920 (9:16) | Captures du téléphone, fiche française (8 au plus) |
| `en/01-scan.png` … `en/08-deck.png` | 1080 × 1920 | Captures du téléphone, fiche anglaise |
| `../../pwa/icons/icon-512.png` | 512 × 512 | Icône de l'appli |
| `developer-header.jpg` | 4096 × 2304, JPEG | Image d'en-tête de la page de développeur (sans texte, valable pour une future appli sœur) ; icône de développeur : celle de l'appli |

Les fichiers sont numérotés dans l'ordre de la fiche : envoie-les dans cet ordre. Le scan d'abord, comme chez tous les concurrents ; les deux premières comptent le plus (ce sont celles des résultats de recherche). L'échange vient en 3e : c'est ce qui distingue Mana Orbit des autres scanners.

| # | Écran | Légende FR | Légende EN |
|---|---|---|---|
| 1 | Scan | Scanne tes cartes VF ou VO · Lues sur ton téléphone, la photo n'est jamais envoyée | Scan cards in any language · Read on your phone, photos never leave it |
| 2 | Accueil | La cote de ta collection · Au prix tendance Cardmarket, mise à jour chaque jour | Your collection, valued · Cardmarket trend prices, updated daily |
| 3 | Échange | Tes échanges en un lien · Lien ou QR code, doublons et recherches toujours à jour | Trade with one link · Link or QR code, spares and wants always up to date |
| 4 | Decks à monter | Les decks que tu peux monter · Decks Commander comparés à ta collection | Decks you can build · Commander decks matched to your cards |
| 5 | Valeur dans le temps | Suis sa valeur jour après jour · Courbe, variations à 7 et 30 jours, alertes de prix | Watch its value grow · Daily chart, 7- and 30-day changes, price alerts |
| 6 | Collection (langues) | Chaque carte, sa langue · VF, VO, japonais… et son prix Cardmarket | Every copy, its language · English, French, Japanese… and its Cardmarket price |
| 7 | Prix d'une liste | Colle une liste, vois le prix · Sans les cartes que tu as déjà, prête pour Cardmarket | Paste a list, see the price · Minus the cards you own, ready for Cardmarket |
| 8 | Viewer de deck | Chaque deck en un coup d'œil · Valeur, courbe de mana, main de départ | Every deck at a glance · Value, mana curve, opening hand |

Les captures sont celles de la vraie appli (thème sombre), vue par un visiteur sans compte ni token CardTrader, comme la plupart des utilisateurs : prix Cardmarket seulement, aucune offre CardTrader (Google refuse les visuels qui promettent ce que l'appli ne donne pas). Collection d'exemple : 515 cartes (1 030 exemplaires), environ 2 340 €, quatre decks. Les images des cartes y sont des cartes factices dessinées par le script (aucune illustration réelle) ; les vrais téléphones affichent les images Scryfall. La bannière ne contient ni logo ni symbole de Wizards of the Coast, ni écran de l'appli (rien à refaire quand l'interface change). Aucune capture ne montre le bandeau publicitaire.

Si EDHREC ou Archidekt refusent : remplace la capture 4 par l'éditeur de deck (`SHOTS` dans `tools/store-assets.mjs`).
Après le lancement : teste la description courte et la première capture avec les tests de fiche de la Play Console (« Store listing experiments » en anglais).

### Refaire les visuels

```
node tools/store-assets.mjs            # tout : bannières + 16 captures (≈ 2 min)
node tools/store-assets.mjs feature    # bannières seulement
node tools/store-assets.mjs shots en   # captures anglaises seulement
RAW=1 node tools/store-assets.mjs shots   # garde aussi les écrans bruts (shots/store/, non versionné)
```

Prérequis : `tests/node_modules` installé (Playwright), Chromium dans `/opt/pw-browsers/chromium` (ou la variable `CHROMIUM`), port 18980 libre. Aucune connexion Internet : le script sert l'appli avec le monde des tests (token CardTrader du serveur réservé à un compte, comme en production) et simule Scryfall. Les polices de l'appli (Bricolage Grotesque, Instrument Sans, licence OFL) sont dans `tools/fonts/` ; sans elles, le script prend les polices du système.
Les légendes, les données d'exemple (collection, decks, historique) et l'ordre des écrans sont en tête de `tools/store-assets.mjs` (`SHOTS`, `DB_TXT`, `DECKS`).
