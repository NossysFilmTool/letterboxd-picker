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

## Vlakken en knoppen

- Weinig dozen: rijen posters staan los op de pagina, zonder kader of schaduw.
- Ronding klein (2-3 px). Geen zwevende schaduwen, geen matglas.
- Een melding is een rustig vlak, zonder gekleurde streep aan één kant.
- Eén hoofdknop per scherm (`.btn.primary`: papier op zwart). De rest is
  gewone tekst of een rustige knop.
- Geen emoji als pictogram; lijnpictogrammen (lucide) of woorden.

## Beweging

- Eén eigen moment: het aftellen (filmleader) bij een pick.
- Verder beweegt alleen wat je zelf aanraakt. Geen invlieg-animaties op lijsten.
