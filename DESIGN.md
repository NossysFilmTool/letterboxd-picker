# Ontwerp: Het programma

De tool is je eigen filmhuis, iets voor de avond, vlak voor de film. Sinds
versie 5.1 is elk scherm een bladzijde uit het programma van vanavond, zoals
het gedrukte maandprogramma van een filmhuis: grote filmbeelden, titels met
schaal, korte bijschriften, en de kleur van de film als groot vlak. De zaal
blijft donker; de posters en de film in beeld praten.

Een aantal regels wordt bewaakt door `stijl.test.js` (ontwerp: geen AI-clichés).
Wil je er een breken, pas dan eerst dit document aan.

## Waarom zo

Een interface ziet er door AI gemaakt uit als niemand iets koos: een kaart om
elk blok, knopjes voor alles, standaardpictogrammen, overal dezelfde afstand.
Alleen clichés weghalen is niet genoeg; dan blijft er een smaakvol donker
niets over. Elke keuze hier komt daarom uit de wereld van de film: het
programmaboekje, het titelblok van een filmposter, het kaartje.

De toets voor elk nieuw scherm: zou het met een ander logo ook van een andere
app kunnen zijn? Dan is het nog niet af.

## Het programma

- Bovenaan elk scherm de kop van het huis: "Nossy's bioscoop" en de datum van
  vandaag, zoals op een gedrukt programma.
- Een scherm opent waar het kan met een filmbeeld uit je eigen lijst, groot
  en met een bijschrift. Echte beelden, nooit decoratie.
- Titels zijn groot en smal; bijschriften klein en breed. Het contrast in
  maat doet het werk, niet kaders of kleur.
- Lijsten zijn programmaregels (datum of jaar, titel, gegevens) of een raster
  van posters, geen stapels kaarten.
- Filters zijn een zin: "Toon *drama* uit *de jaren 90*, *tot 120 minuten*."
  Je tikt op een onderstreept woord; daaronder ligt een gewone keuzelijst, dus
  het werkt ook met toetsenbord en schermlezer. Geen muren van knopjes.
- Tussenkoppen mogen groot en gedempt zijn, zoals de jaartallen in het
  archief.
- Het wordt scherm voor scherm opnieuw gebouwd. Wat er al staat: de kop, de
  navigatie en het archief (5.1), de voorpagina (5.2). De rest volgt.

## Navigatie

- Vijf plekken met namen uit het filmhuis: Vanavond, Archief, Programma,
  Filmavond, Jaarboek. Setup (het kantoor) staat apart rechts in de kop.
- Op een breed scherm staan ze als woorden in de kop. Op een telefoon onderin,
  met zes eigen getekende pictogrammen (`Pictogram` in `Shell.jsx`): gevulde
  vormen, één gewicht. Geen standaardset.

## Kleur

- Ondergrond warm zwart `--ink` (#121110), tekst gebroken wit `--paper` (#ece6dc),
  secundaire tekst `--fog` (#a69f94). Geen blauwgrijs.
- Het accent is de kleur van de film in beeld: `--film`, uit de poster gelezen
  (`src/lib/filmkleur.js`) en diep gemaakt zodat wit erop leesbaar blijft. Het
  Vanavond-blok en de kop van de filmkaart nemen die kleur aan.
- Functionele kleuren zijn gedempt: `--dot-o` (waarschuwing), `--dot-g` (ja,
  te streamen), `--dot-b` (koel). Geen neonaccenten.
- Eén programmakleur, gedempt amber `--programma` (#e8b75c), alleen voor het
  bovenschrift op een vlak in de kleur van de film (de hoofdfilm van
  vanavond, de uitslag van de zaalstemming), zoals de steunkleur van een
  gedrukt programma. Nergens anders.
- Letterboxds drie kleuren horen bij Letterboxd; ze staan nergens in de tool.

## Letters

- Eén familie, Archivo, in drie breedtes: smal en zwaar (62%, gewicht 800)
  voor titels en tussenkoppen (`--font-kop`), gewoon voor tekst, breed (125%)
  en klein voor bijschriften (`.label-breed`). Archivo Narrow
  (`--font-display`) voor kleinere titels in de oudere schermen. Geen Inter,
  geen redactionele serif.
- Paginatitels zijn groot (84 px, op een telefoon 68 px), zoals de kop van een
  programmablad.
- Cijfers in gelijke breedte (`font-variant-numeric: tabular-nums`) waar ze
  onder of naast elkaar staan.
- Kopjes in gewone zinsletters, nooit in spatiërende hoofdletters.
- Gegevens naast elkaar met ruimte ertussen, niet als "A · B · C"-reeks.
- Twee uitzonderingen. Het kaartje (zie hieronder) is gedrukt, in hoofdletters
  en met DotGothic16 (`--font-ticket`) voor de gegevens, zoals een echt
  bioscoopkaartje. En het titelblok onder de hoofdfilm staat in hoofdletters,
  zoals de aftiteling onderaan een filmposter ("EEN FILM VAN WIM WENDERS MET
  ..."), met de kleine woorden kleiner tussen de namen. Schermlezers krijgen
  het in gewone letters. De hoofdletters staan in de tekst zelf
  (`drukletters` uit `src/lib/kaartje.js`), niet via CSS. Nergens anders.

## Het archief

- Watchlist, Gezien en Kaartjes als woorden met hun aantal erboven, geen
  knoppen.
- Bovenaan de filterzin en een zoekregel (alleen een streep eronder).
- Zolang je niet zoekt of filtert, staat de film met het hoogste cijfer die je
  nog niet zag uitgelicht, met zijn filmbeeld.
- Op jaar gesorteerd staan de films per decennium, met het jaartal groot en
  gedempt als tussenkop.

## Het kaartje

- Wie een film kiest (Vanavond, de winnaar bij Filmavond), krijgt een bioscoopkaartje:
  papier in de donkere zaal, rechts een afscheurstrook in de filmkleur met de
  poster.
- Alles op het kaartje is echt: aanvang (nu, afgerond op vijf minuten), einde
  (uit de speelduur), jaar, het cijfer, de dienst en of hij daar inbegrepen
  is, de aftiteling en een streepjescode uit het TMDB-nummer. Geen verzonnen
  zaal, rij of stoel.
- Het deelplaatje is hetzelfde kaartje, met het filmbeeld als doek erboven.
- Een gekeken pick wordt een afgescheurde strook in de kaartjesdoos (Bieb,
  tab Kaartjes): poster, kijkdatum, titel, eventueel een notitie, en je
  sterren als rode stempel. Wanneer een kaartje als gekeken telt, staat in
  `src/lib/kaartjesdoos.js`.
- Het afscheuren is een moment: de strook scheurt schuin los en schuift in
  beeld met "Kaartje 12 in de doos" (`Afgescheurd.jsx`). Met "beperk
  beweging" aan verschijnt hij gewoon.
- Bovenaan de doos staat je filmjaar; het deelbare beeld is een raster van
  dezelfde stroken.
- Ontdekt de app zelf dat je een gekozen film keek (je Letterboxd-dagboek,
  of je markeerde hem als gezien), dan is dat het grote moment
  (`Ontdekt.jsx`), op welk scherm je ook bent: het kaartje komt in beeld,
  een rode stempel "Gekeken" slaat erop met een dreun, en de strook scheurt
  af. Wat je zelf beantwoordt, krijgt het kleine moment.
- Films die de tool voor je vond (je opende hun kaart in Verken, zette ze op
  je shortlist of klikte door) en die je daarna keek, worden een
  Gevonden-kaartje ("Gevonden met Zoeken"). Regels in `src/lib/vondsten.js`.

## De voorpagina

- Vanavond is het eerste scherm, de voorpagina van het programma. Van boven
  naar beneden: de hoofdfilm van vanavond, de vraag over gisteren, de kassa,
  wat er net binnen is en je laatste kaartjes. Op een breed scherm een
  dubbele bladzijde: links de hoofdfilm en Net binnen, rechts de kassa, de
  vraag en je doos.
- De hoofdfilm komt uit je eigen lijst (`src/lib/voorpagina.js`): een
  speelfilm die je nog niet zag. Korter dan 40 minuten is een korte film, en
  die is nooit de hoofdfilm. Wat telt: een cijfer dat je kunt vertrouwen
  (gedempt bij weinig stemmen, nooit opgeblazen), je smaak (het
  matchpercentage van Voor jou, zwaarder zodra je profiel genoeg sterren
  heeft), op je diensten, net binnen, vanavond nog uit en een filmbeeld.
  Doordeweeks liever geen lange zit, op vrijdag en zaterdag juist wel.
- Afwisseling over de dagen: niet dezelfde regisseur of hetzelfde genre als
  gisteren, niet wat de afgelopen week al hoofdfilm was of wat je de
  afgelopen twee weken pickte. Een film die je op drie dagen wegklikte, zakt.
  Alles gaat over eerdere dagen; wat je vandaag doet, verandert de keuze van
  vandaag niet. Het lot van de dag beslist tussen films die dicht bij elkaar
  liggen, dus de voorpagina is elke dag anders maar springt niet bij elke
  keer openen.
- Hij staat er met zijn filmbeeld, daaronder een vlak in de kleur van de film:
  de tijd van nu tot het einde, de titel groot, het titelblok, en één echte
  reden ("Net binnen op MUBI.", "Van Wim Wenders, net als Perfect Days, die je
  5 sterren gaf.", "Het hoogste cijfer op je lijst dat je nog niet zag.",
  "Past bij je smaak: 88%. Je valt op drama uit de jaren 70."). Nooit een
  verzonnen reden; de smaak is pas een reden als je profiel sterk genoeg is.
- De voorfilm: in de bioscoop draaide er een korte film voor de hoofdfilm.
  Een korte film van je lijst staat als regel onder de reden; een tik opent
  zijn filmkaart, zonder kaartje.
- "Pak dit kaartje" is de hoofdknop: het aftellen, de trailer en het kaartje
  uit de sleuf, net als bij het lot. "Een andere film" schuift door en geldt
  de rest van de dag.
- De vraag over gisteren is een strook papier, als een briefje bij de kassa.
- Net binnen staat als programmaregels (dag, titel, gegevens, een kleine
  poster). Tik op een regel en die film wordt de hoofdfilm.
- Je laatste drie kaartjes liggen als losse stroken in een waaier, met een
  beeld uit de film; ze openen de doos.

## De kassa

- De kassa staat op de voorpagina, voor wie liever het lot laat kiezen.
- De kassa toont hoeveel films er in de pot zitten (groot getal), de
  aanvang van nu en in een paar woorden wat er op tafel komt. Onderaan zit
  de sleuf, met het randje papier van het volgende kaartje erin. Na de pick
  schuift het kaartje uit diezelfde sleuf.
- "Laat het lot kiezen" is de knop van de kassa. Met een hoofdfilm erboven is
  hij de tweede keus (alleen een rand); zonder hoofdfilm is hij de hoofdknop.
- De stemmingen zijn woorden met een streep eronder, geen knopjes. Een
  stemming kiest niet meteen een film, maar vult de pot; het getal loopt mee.
- Wat er op tafel komt, schuift als een la van onderen open. Het is dezelfde
  kaart als bij Filmavond (één filtertaal in de hele tool), plus waar je uit
  kiest en of gezien meedoet. Pick en Filmavond onthouden elk hun eigen
  keuzes. "Alleen op streaming" betekent op jouw diensten als je die in
  Verken koos.
- Geen uitnodigingen boven elk scherm. Wie meer cijfers wil, vindt dat bij
  Setup en als stil chipje bij de cijfers van een film.

## Doek en korrel

- Waar een filmbeeld (TMDB-backdrop) is, staat het als doek in breedbeeld
  (2.39:1) tussen zwarte balken: in het Vanavond-blok en op de filmkaart.
- Over het hele scherm ligt een vaste, heel lichte filmkorrel (5%). Hij
  beweegt niet.

## Vlakken en knoppen

- Weinig dozen: rijen posters staan los op de pagina, zonder kader of schaduw.
- Ronding klein (2-3 px). Geen zwevende schaduwen, geen matglas.
- Een melding is een rustig vlak, zonder gekleurde streep aan één kant.
- Eén hoofdknop per scherm (`.btn.primary`: papier op zwart). De rest is
  gewone tekst of een rustige knop.
- Geen emoji als pictogram; lijnpictogrammen (lucide) of woorden.

## Meldingen

- Nooit een pop-up van de browser (alert, confirm): die is grijs, houdt
  alles tegen en hoort niet in de zaal. Bewaakt door `stijl.test.js`; alles
  loopt via `src/lib/melding.js`.
- Een melding staat bovenin als rustig vlak en gaat na zes seconden vanzelf
  weg. Een fout blijft twaalf seconden staan en krijgt een warme rand. Je
  kunt ze altijd wegtikken.
- Een vraag (iets wissen, een code vervangen) is een eigen venster met twee
  knoppen die zeggen wat ze doen: "Wis de bibliotheek", niet "OK". Kan het
  niet terug, dan krijgt die knop de waarschuwingskleur en staat annuleren
  klaar. Escape of naast het venster tikken is annuleren.

## De trailers

- Voor een veto-ronde krijgt elke film eerst een trailer (`Pitch.jsx`), zoals
  de trailers voor de hoofdfilm. Het moet voelen als een zaal, niet als een
  venster: het zaallicht dimt, de projector slaat aan met een lichtbundel
  waar stof in hangt, het doek werpt zijn licht op de zaal (een wazige gloed
  van het filmbeeld), en onderin staan stoelruggen met een randje licht.
- Elke trailer volgt een draaiboek (`trailerPlan` in `src/lib/pitch.js`): een
  shot met de slogan, een zwarte kaart "Een film van", een shot met de
  namen, dan slaat de titel in beeld met een flits. Daarna schuift het vlak
  eronder op, in de kleur van de film: regie, jaar, duur en genre, waar hij
  over gaat (een paar hele zinnen), wie erin spelen, de cijfers en waar hij
  te zien is. De shots zijn andere beelden uit de film (TMDB, zonder tekst);
  zijn die er niet, dan een andere uitsnede van het filmbeeld.
- Op het doek mag het filmisch: korrel die beweegt, een licht flikkeren, een
  beeld dat een fractie danst, donkere hoeken. Alleen daar; de vaste korrel
  over de rest van de tool blijft stil. Het doek is 2.39:1, op een telefoon
  16:9, anders wordt het een streep.
- Alles is echt: geen verzonnen stemmen of quotes. Een opgeblazen
  TMDB-cijfer staat er grijs bij, met "verdacht hoog".
- De balk bovenin loopt mee en zet de volgende film in beeld; hoe lang hangt
  af van de akten en de leestijd. Tik op het doek om de akten over te slaan,
  nog eens voor de volgende film, links voor de vorige. Spatie pauzeert,
  "Meteen naar de veto" slaat alles over. Na de laatste trailer gaat het
  zaallicht weer aan. Uit te zetten bij de veto-rondes ("Eerst de trailers").
- Ook een pick krijgt zijn trailer, als voorprogramma: na het aftellen,
  voordat het kaartje uit de sleuf schuift ("Jouw film van vanavond."). Uit
  te zetten op de kassa ("Eerst de trailer"). Het kaartje bestaat al zodra
  het aftellen klaar is, ook als je de trailer wegtikt.

## De zaalstemming

- Op Filmavond wordt één scherm de zaal (de tv, de laptop) en stemt iedereen
  op de eigen telefoon. Het scherm heeft de watchlist, zet de rondes en telt;
  een telefoon heeft alleen een naam nodig. Wie bij het scherm zit, kan zelf
  meedoen ("Ik doe zelf ook mee, op dit scherm").
- Meedoen: de code (vier letters, zonder I en O) staat groot als op een
  aanplakbiljet, met het adres eronder, een QR-code met de link (papier met
  inkt, zelf getekend in `src/lib/qr.js`, geen bibliotheek) en een link om te
  delen. Op het startscherm en bij Filmavond kun je een code intikken. De
  namen verschijnen als een rolverdeling.
- Het verloop: iedereen kiest een 1e en een 2e genre, de slimme pick kiest
  daar vijf films uit de pot (films met een trailer gaan voor), plus drie
  aanraders van buiten de lijst. De zaal kijkt de
  echte trailers van YouTube (na de laatste begint de stemming vanzelf), en
  dan kiest iedereen een 1e en een 2e film. De uitslag staat groot in de
  kleur van de film, met waarom en de punten. "Pak het kaartje" geeft een
  kaartje met alle namen. Elke telefoon krijgt hetzelfde kaartje mee naar
  huis: bewaren zet het in de kaartjesdoos op die telefoon (de tool vraagt
  later of je hem keek), delen maakt er een plaatje van. De regie, de
  rolverdeling en waar hij te zien is, haalt de telefoon zelf bij TMDB.
- Zo speelt de zaal: in de lobby kiest de gastheer hoe de avond loopt, in
  dezelfde rijen als de avondfilters, onthouden op het toestel. Eerst samen
  een genre kiezen of meteen naar de films; drie, vier of vijf films van de
  lijst; geen tot drie aanraders; geen tot drie voordrachten van gasten; of
  gasten hun Letterboxd mogen laten meetellen, en zo ja wat dat doet (al
  gezien gaat eruit, hun smaak weegt mee); en of een ronde vanzelf sluit of
  met de hand.
- Voordragen (`ZaalVoordracht.jsx`): staat het aan, dan kan elke gast op de
  telefoon zelf een film voordragen, tot de films op tafel komen (in de
  lobby en tijdens de genrestemming). Zoeken op titel, één tik, en een
  andere kiezen of intrekken kan altijd. Het scherm laat onder de namen
  zien wie wat voordraagt. De voordrachten komen als eigen groep op tafel
  ("Voorgedragen door gasten"), met de naam erbij; ligt de film al op tafel
  van de lijst, dan krijgt die de naam. Zijn er meer voordrachten dan plek,
  dan gaat voor wat meer gasten voordroegen, dan wat bij het genre past, en
  verder beslist het lot; het scherm zegt dat erbij. Een voordracht hoeft
  niet bij het genre te passen: het is de eigen keus van een gast. Geen
  aanrader die iemand al voordroeg.
- Gasten met Letterboxd (`src/lib/zaalgasten.js`, `ZaalLetterboxd.jsx`):
  staat het aan, dan vraagt de telefoon "Mag de zaal rekening houden met
  jou?". Het hoeft niet, en nee is één tik. Kent de telefoon je al (een
  onthouden export, of de tool zelf met je gegevens), dan is ja ook één tik.
  Anders drie genummerde stappen: een knop die Letterboxd opent op de
  pagina van de export, dat het zip-bestand in je downloads komt (uitpakken
  hoeft niet), en een knop om het te kiezen. De telefoon leest de smaak
  (dezelfde als bij Voor ons) en onthoudt alleen sleutels en het
  smaakprofiel, als je dat wilt. Daarna oordeelt hij vanzelf over de films
  die het scherm klaarzet: per film al gezien of niet, op je watchlist of
  niet, en hoe goed hij bij je past. Meer gaat er niet heen; de export
  blijft op de telefoon. Op het scherm staat "met Letterboxd" onder je naam.
- Wat het scherm ermee doet: wat iemand al zag, gaat uit de pot (als er
  genoeg overblijft); wat iemand echt niet ziet zitten (onder de ondergrens
  van Voor ons) ook, als het kan; dan de beter passende helft, waarbinnen de
  slimme pick kiest. Bij de aanraders zakt wat iemand al zag ver, telt de
  smaak van de zaal mee en helpt een plek op iemands watchlist. Het scherm
  wacht hooguit acht seconden op de telefoons, en zegt erbij met wiens
  Letterboxd het koos.
- Stemmen gaat met twee knoppen per optie, "1e" en "2e", als kleine
  kaartjesgaten: gekozen is papier. Nog eens tikken haalt de keus weg; 1e
  tikken bij je 2e keus (of andersom) wisselt ze. Zo kun je altijd van
  gedachten veranderen, tot de ronde sluit.
- Tellen: een 1e keus is 2 punten, een 2e keus 1 punt. Het scherm legt dat
  uit, en zegt bij de uitslag hoe het besliste:
  - de meeste punten wint. Bij het genre komt het genre erna er alleen bij
    als het ook brede steun heeft: het staat bij minstens twee mensen en
    de helft van de stemmers op het lijstje, en heeft minstens twee derde
    van de punten. Dan worden het films die allebei zijn, als dat er genoeg
    zijn. Staat het maar bij één persoon op het lijstje, dan wordt het
    alleen de winnaar (1e Sci-fi 2e Fantasy, en 1e Fantasy 2e Drama: alleen
    Fantasy);
  - gelijk op punten? Dan wat op de meeste lijstjes staat: waar de zaal het
    breedst achter staat. Kiezen twee mensen elk een andere favoriet maar
    dezelfde 2e keus, dan wint die 2e keus;
  - ook gelijk op lijstjes (dan zijn ook de 1e keuzes gelijk)? Bij het genre
    worden het films die allebei zijn, als dat er genoeg zijn, en anders van
    elk wat. Bij de film beslist het lot: het licht springt tussen de gelijke
    films en blijft op één staan.
- Aanraders (`src/lib/aanraders.js`): films die niet op de lijst staan maar
  er wel bij passen, binnen het gekozen genre en de avondfilters. Ze komen
  uit de aanbevelingen die TMDB al gaf: bij de vijf films op tafel (die
  wegen het zwaarst, de zaal koos ze net), bij de rest van de lijst (hoe
  meer films hem aanraden, hoe sterker), bij films met 4 of 5 sterren, en
  uit wat in Verken bewaard is. Daarnaast TMDB Discover: gedragen films
  (bekend, maar niet de klassiekers die iedereen al zag), parels met weinig
  stemmen (gezocht op de meeste stemmen binnen die band, niet op het hoogste
  cijfer, want daar staan de fanclubs bovenaan), en wat er op de eigen
  diensten staat. Wat je al kent of in Voor jou afwees, en elk opgeblazen
  cijfer (fans of bots), valt af. Wat TMDB aanraadt bij films van 2 sterren
  of minder, zakt.
- De score: een cijfer waarop een groep kan bouwen (gedempt naar het aantal
  stemmen), hoe sterk en langs hoeveel wegen een film werd aangeraden, de
  genres van de uitslag (een genre dat het niet haalde, stuurt niet), de
  films op tafel, het
  smaakprofiel, en of het vanavond kan: een trailer, op de eigen diensten,
  een lengte die op een avond past. Een film die vrijwel iedereen al zag,
  zakt, net als een aanrader die de zaal de afgelopen drie weken al zag (het
  scherm onthoudt dat). Dan de drie samen: telkens de beste die het minst
  lijkt op wat er al ligt, dus niet twee van dezelfde regisseur of reeks, en
  bij "van elk wat" elk genre aan bod. De laatste plek houdt ruimte voor een
  parel, als er een goede is. Een beetje toeval houdt twee avonden
  verschillend als het verschil klein is.
- Ze staan apart, met waarom: bij welke films op de lijst TMDB hem aanraadt
  (die op tafel eerst: "TMDB raadt hem aan bij Parasite, op de lijst"), of
  dat het een parel is. Wint er een, dan telt hij als vondst ("Gevonden in
  de zaal").
- Op een breed scherm pakt de zaal de hele breedte: de films van de lijst,
  de aanraders en de voordrachten staan naast elkaar in één rij, met de
  knoppen in beeld.
- Tijdens de trailers kijken de telefoons mee: "Nu op het scherm: trailer 3
  van 8", met de film en de twee knoppen. Wie het al weet, stemt alvast;
  dat telt zodra het stemmen begint en gaat dan meteen de deur uit. Het
  scherm meldt alleen de laatste stand (wie snel doortikt, stuurt niet elke
  trailer apart) en maakt die af voor de stemming opengaat.
- Een ronde sluit vanzelf vier seconden nadat iedereen een 1e en een 2e keus
  heeft (genoeg om nog te wisselen), of eerder met "Sluit de stemming" (koos
  de gastheer "Sluiten met de hand", dan alleen zo). Heeft
  iemand alleen een 1e keus, dan wacht het scherm vijftien seconden ("Nog
  even tijd voor een 2e"). Vlak voor het tellen haalt het scherm de verse
  stand op, zodat een 2e keus van het laatste moment niet wegvalt: anders
  kan er een gelijkspel ontstaan dat er niet was. Wie nog niet stemde,
  staat er als een open rondje bij.
- De telefoon: één kolom, grote woorden met de twee knoppen ernaast, je stem
  in woorden eronder ("1e Drama, 2e Thriller"), en wat er gekozen wordt
  alleen op het grote scherm. Na herladen ben je nog binnen. Stemmen gaan
  één voor één de deur uit (alleen de nieuwste wacht), zodat een snelle 2e
  keus nooit door een trage 1e wordt overschreven.
- Techniek: de zaal leeft twaalf uur in de Worker (`/zaal`, KV). Elke speler
  schrijft in een eigen sleutel, dus stemmen overschrijven elkaar nooit; het
  scherm leest ze elke twee seconden. Geen `list()`. De films voor de gasten
  met Letterboxd staan in één sleutel die groeit (`/vraag`), elk oordeel in
  een eigen sleutel (`/smaak`); alleen het scherm leest de oordelen. Elke
  voordracht staat ook in een eigen sleutel (`/voordracht`), zodat hij nooit
  botst met een stem of een oordeel van dezelfde telefoon.

## De première

- Wie versie 5 voor het eerst opent en de tool al gebruikte, krijgt één
  keer een première (`Premiere.jsx`, `src/lib/premiere.js`). Niet in een
  beta, niet in de demo, en niet op een apparaat dat leeg begon: wie op 5
  instapt, heeft niets te vieren. Gezien staat in de instellingen en reist
  mee met sync, dus je ziet hem niet op elk apparaat opnieuw.
- Eerst je kaartje bij de deur. Het is echt: de aanvang van nu, de datum,
  hoeveel kaartjes er in je doos zitten en hoeveel films er op je lijst
  staan. Tik erop en de strook scheurt af. Die tik zet ook het geluid aan,
  want een browser wil eerst een tik.
- Dan gaat het licht uit en volgt een trailer met de bestaande
  trailermachine, met jouw tijd met Nossy als film: hoe vaak je koos en
  echt keek, "Met in de hoofdrol" je watchlist, je filmjaar, de titel die
  inslaat, en eronder wat er nieuw is met je eigen getallen. De beelden
  komen uit je eigen kaartjes. Een zin zonder gegevens valt weg.
- Overslaan kan altijd. Met "beperk beweging" ga je van het kaartje meteen
  naar het eindbeeld, zonder geluid. Bij Setup kun je hem nog eens zien.

## De rondleiding

- De ouvreuse met de zaklamp: in de donkere zaal bracht zij je met een
  lichtbundel naar je stoel. De rondleiding (`Rondleiding.jsx`, de
  hoofdstukken in `src/lib/rondleiding.js`) doet hetzelfde. Het scherm dimt
  en een zachte bundel valt op het echte onderdeel. De bundel is een SVG
  met een masker en een zachte rand, geen schaduw of vervaging van de
  browser. Alleen wat in het licht staat, kun je aantikken.
- De uitleg staat op een tussentitel, zoals in de stomme film: een donkere
  kaart met een dun kader en een kop in `--font-kop`. Op een breed scherm
  staat hij naast het onderdeel, op een telefoon onderin, als ondertiteling
  boven de navigatie. Een stap zonder onderdeel staat midden in beeld.
- Kort, en de rest als je hem zoekt. Zeven hoofdstukken, elk een paar
  minuten. Een hoofdstuk uit het programma loopt alleen langs de kern: een
  stap of vijf, elk met hooguit twee zinnen. Wil je meer, dan klap je
  "Meer hierover" open. De rest is naslag: die staat in hetzelfde
  hoofdstuk, maar je komt er via de zoekregel of Hoe werkt dit?. Dan loopt
  de rondleiding langs alles van dat onderwerp (het deel), met de langere
  tekst al open. Een opgezocht deel telt niet als een gezien hoofdstuk.
- Niet duwen. Het welkom leidt rond langs Welkom en Vanavond, een minuut
  of drie, en zegt dan dat de rest onder Uitleg staat. Aan het eind van
  een hoofdstuk gaat Klaar voor nu voor; het volgende hoofdstuk mag, maar
  als tweede knop.
- Twee soorten stappen. Een kijkstap legt uit, en je gaat verder met
  Volgende. Een doestap vraagt je iets te doen ("Tik op Aanpassen") en gaat
  vanzelf verder als je het deed; "Laat zien" tikt de echte knop aan.
- De voorbeelden zijn je eigen gegevens. Een getal of titel in de uitleg
  leest de stap van het onderdeel zelf (`data-uitleg-*`), dus de rondleiding
  zegt wat er op het scherm staat en rekent nooit apart. Zonder eigen lijst
  oefen je met de demo-lijst. Wat je alleen niet kunt proberen, oefen je
  met een voorbeeld: de stemoefening rekent met de echte code van de zaal.
- Geen sporen. De rondleiding pakt geen kaartje, opent geen zaal en wist
  niets. Een echte pick of een echte zaal is een keuze in de tussentitel,
  met het gevolg erbij, en Sla over staat ernaast. Ontbreekt een onderdeel
  (nog geen kaartjes, Net binnen leeg), dan zegt de stap wat er komt, of
  valt hij weg. Hij loopt nooit vast op een leeg scherm.
- Momenten gaan voor. Tijdens het aftellen, een trailer, de première, het
  ontdekmoment of het afscheuren (`data-uitleg-moment`) wacht de
  rondleiding, en daarna gaat hij verder.
- De ingang is Uitleg, rechts in de kop; op een telefoon een eigen getekende
  zaklamp. Daar staat het programma: de hoofdstukken als programmaregels,
  het hoofdstuk van je scherm bovenaan, en een zoekregel ("Waar wil je
  uitleg over?"). Bij een paar kaarten met veel opzet staat een stil
  linkje, Hoe werkt dit?, dat meteen de goede stap opent. Geen banners.
- Vanzelf alleen in een uitgebrachte versie, en één keer. Een leeg apparaat
  krijgt een welkom met de vraag of je rondgeleid wilt worden, en met de
  code voor wie alleen komt meestemmen. Wie de tool al gebruikte, krijgt
  één rustige melding. Gasten via een link zien niets. De voortgang staat
  in de instellingen en reist mee met sync.
- Beweging uit de bioscoop. De zaklamp zwaait: bij een nieuwe stap glijdt
  de bundel van het vorige onderdeel naar het volgende. Een hoofdstuk opent
  met een iris, een cirkel die opengaat, en sluit met een iris die tot een
  stip krimpt; daarna komt de eindkaart uit het donker. Een nieuwe
  tussentitel flikkert zacht aan, als een projector die aanslaat. Bij een
  doestap klopt een ring om het onderdeel tot je tikt, en lukt het, dan
  klapt de klapper. De voortgang is een filmstrook: een raampje per stap,
  wat je zag belicht.
- Toegankelijk: de tussentitel is een venster dat de focus krijgt en zijn
  tekst voorleest; bij een doestap gaat de focus naar de knop zelf. De
  pijltjes gaan vooruit en terug, Escape stopt en onthoudt waar je was. De
  teksten zeggen waar iets staat; de filmstrook leest voor als "stap 2 van
  5". Met "beperk beweging" schuift er niets: geen zwaai, iris, flikker of
  kloppende ring, de tussentitel staat er meteen en het scherm springt naar
  het onderdeel.
- `smoke.test.jsx` bewaakt dat elk doel een anker heeft en elk anker bij een
  stap hoort, dat elke tekst in beide talen bestaat met dezelfde
  plekhouders, en dat het dun blijft: zeven hoofdstukken, hooguit zeven
  kernstappen per hoofdstuk, en kernteksten van hooguit dertig woorden.

## Geluid

- Alleen bij de trailers, en alleen gemaakt in de browser (Web Audio, geen
  bestanden): de ratel van de projector, een klak als hij aanslaat, een zoef
  bij een snit, een dreun onder een zwarte kaart, een diepe hoorn als de
  titel in beeld slaat. Zacht genoeg om overheen te praten.
- Een knop bovenin zet het uit, en dat blijft onthouden. Met "beperk
  beweging" aan is er geen geluid.

## Beweging

- Twee eigen momenten. Het aftellen (filmleader) bij een pick, waarna het
  kaartje uit de sleuf van de kassa schuift. En de trailers voor een
  veto-ronde en voor een pick (zie boven): het licht dat dimt, harde snitten tussen de akten, de titel die in
  beeld slaat, de woorden van het verhaal die een voor een verschijnen, de
  cijfers die optellen. Met "beperk beweging" aan ligt alles er gewoon, is
  er geen voorprogramma en loopt niets vanzelf door.
- De rondleiding heeft zijn eigen beweging (zie De rondleiding): de zaklamp
  die zwaait, de iris, de projector, de kloppende ring, de klapper.
- Verder beweegt alleen wat je zelf aanraakt. Geen invlieg-animaties op lijsten.
