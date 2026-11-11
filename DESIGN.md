# Ontwerp: De zaal

De tool is iets voor de avond, vlak voor de film. Het scherm gedraagt zich als
een donkere zaal: de posters en de film in beeld praten, de rest treedt terug.

Een aantal regels wordt bewaakt door `stijl.test.js` (ontwerp: geen AI-clichés).
Wil je er een breken, pas dan eerst dit document aan.

## Kleur

- Ondergrond warm zwart `--ink` (#121110), tekst gebroken wit `--paper` (#ece6dc),
  secundaire tekst `--fog` (#a69f94). Geen blauwgrijs.
- Het accent is de kleur van de film in beeld: `--film`, uit de poster gelezen
  (`src/lib/filmkleur.js`) en diep gemaakt zodat wit erop leesbaar blijft. Het
  Vanavond-blok en de kop van de filmkaart nemen die kleur aan.
- Functionele kleuren zijn gedempt: `--dot-o` (waarschuwing), `--dot-g` (ja,
  te streamen), `--dot-b` (koel). Geen neonaccenten.
- Letterboxds drie punten (oranje, groen, blauw) alleen als logo.

## Letters

- Archivo voor tekst, Archivo Narrow (`--font-display`) voor titels: smal en
  vet, zoals aftiteling. Geen Inter, geen redactionele serif.
- Cijfers in gelijke breedte (`font-variant-numeric: tabular-nums`) waar ze
  onder of naast elkaar staan.
- Kopjes in gewone zinsletters, nooit in spatiërende hoofdletters.
- Gegevens naast elkaar met ruimte ertussen, niet als "A · B · C"-reeks.
- Eén uitzondering: het kaartje (zie hieronder) is gedrukt, in hoofdletters en
  met DotGothic16 (`--font-ticket`) voor de gegevens, zoals een echt
  bioscoopkaartje. De hoofdletters staan in de tekst zelf
  (`toLocaleUpperCase`), niet via CSS. Nergens anders.

## Het kaartje

- Wie een film kiest (Pick, de winnaar bij Avond), krijgt een bioscoopkaartje:
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

## De kassa

- Pick is de kassa van de zaal, het eerste scherm dat je ziet. Van boven
  naar beneden: waar je zin in hebt (de stemmingen), de kassa, de knop, en
  daaronder de vraag over gisteren en je laatste kaartjes uit de doos.
- De kassa toont hoeveel films er in de pot zitten (groot getal), de
  aanvang van nu en in een paar woorden wat er op tafel komt. Onderaan zit
  de sleuf, met het randje papier van het volgende kaartje erin. Na de pick
  schuift het kaartje uit diezelfde sleuf.
- "Pick een film" staat altijd in beeld, ook op een telefoon. Niets boven de
  kassa mag hem onder de rand van het scherm duwen: de vraag over gisteren
  staat op Pick onder de knop, niet erboven.
- Een stemming kiest niet meteen een film, maar vult de pot; het getal loopt
  mee. Er is één knop die kiest.
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
- Verder beweegt alleen wat je zelf aanraakt. Geen invlieg-animaties op lijsten.
