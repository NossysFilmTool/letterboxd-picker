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

- Voor een veto-ronde krijgt elke film eerst een korte pitch
  (`Pitch.jsx`), zoals de trailers voor de hoofdfilm. Per film: het
  filmbeeld als doek, de slogan erop, de titel, regie, jaar, duur en genre,
  waar hij over gaat (een paar hele zinnen, `src/lib/pitch.js`), wie erin
  spelen, de cijfers en waar hij te zien is. Het vlak eronder heeft de
  kleur van de film.
- Alles is echt: geen verzonnen stemmen of quotes. Een opgeblazen
  TMDB-cijfer staat er grijs bij, met "verdacht hoog".
- De balk bovenin loopt mee en zet de volgende film in beeld; hoe lang hangt
  af van de leestijd. Tik rechts voor de volgende, links voor de vorige,
  spatie pauzeert, "Meteen naar de veto" slaat ze over. Uit te zetten bij de
  veto-rondes ("Eerst de trailers").

## Beweging

- Twee eigen momenten. Het aftellen (filmleader) bij een pick, waarna het
  kaartje uit een sleuf schuift. En de trailers voor een veto-ronde: het
  doek zoomt langzaam in, de titel komt op uit een sleuf, de woorden van
  het verhaal verschijnen een voor een, de cijfers tellen op, en tussen
  twee films zit een korte lichtflits zoals bij een filmlas. Met "beperk
  beweging" aan ligt alles er gewoon en loopt niets vanzelf door.
- Verder beweegt alleen wat je zelf aanraakt. Geen invlieg-animaties op lijsten.
