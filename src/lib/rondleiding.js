// De rondleiding (DESIGN.md, "De rondleiding"): de ouvreuse met de zaklamp
// neemt je mee langs alles wat de tool kan. Hier staan de hoofdstukken als
// gegevens; components/Rondleiding.jsx speelt ze af, en het programma
// (components/UitlegProgramma.jsx) laat ze zien en doorzoeken.
//
// Een hoofdstuk:
//   id, tab (het scherm waar het over gaat), duur (minuten),
//   nodigLijst: heeft films nodig (zonder eigen lijst: eerst de demo),
//   alleenAls(ctx): alleen als de functie bestaat, stappen
// Een stap:
//   id: de teksten staan onder uitleg.h.<hoofdstuk>.<stap> (kop, tekst, en
//       waar nodig vb, doe, leeg)
//   doel: het onderdeel in het licht, een data-uitleg-anker; zonder doel een
//         tussentitel midden in beeld
//   tab: het scherm (of een functie van ctx)
//   voor: { sluit: anker of [ankers] } eerst aantikken zolang er een is (een
//         la dicht, terug uit een filmkaart); { klik: anker } eerst
//         aantikken, en wachten tot hij er is (een tabblad, de la open). Een
//         tabblad dat al aan staat (aria-pressed) blijft zoals het is.
//   doe.kan(ctx): kan het nu niet (niets om uit te kiezen), dan een kijkstap
//   alleenAls(ctx): anders valt hij weg
//   wacht: ms (of 'lang') om op het onderdeel te wachten
//   vb(ctx): de getallen en titels voor het voorbeeld, gelezen van het
//            onderdeel zelf (data-uitleg-*), zodat de rondleiding zegt wat
//            er op het scherm staat; null: geen voorbeeld
//   doe: { klaar(ctx), toon: anker dat "Laat zien" aantikt, knop: eigen
//        woord voor die knop } een doestap: hij wacht tot je het doet
//   leeg: true als er een eigen tekst is voor als het onderdeel er niet is
//         (anders valt de stap weg)
//   oefening: true: de oefenstemming (StemOefening) in de tussentitel
//   naslag: true: niet in de korte rondgang, wel als je een deel opzoekt
//   meer: true: een kernstap met een langere tekst onder "Meer hierover"
//   deel: het onderwerp binnen het hoofdstuk (zie deel() hieronder)
// ctx: { app, tab, el (het doel), vind(anker) }
//
// Twee lagen (DESIGN.md, "De rondleiding"): een hoofdstuk uit het programma
// loopt alleen langs de kern, met korte teksten. Wie via de zoekregel of
// "Hoe werkt dit?" komt, krijgt het hele deel waar die stap in staat,
// naslag en al.

import { PROXY_URL } from './tmdb.js';
import { zaalBeschikbaar } from './zaalstemming.js';
import { remoteAvailable } from './session.js';

const metLijst = ({ app }) => app.watchlistAll.length > 0;
const zonderLijst = (ctx) => !metLijst(ctx);
// Waar de import staat: het startscherm zolang er geen lijst is, anders Setup
const importTab = (ctx) => (metLijst(ctx) ? 'instellingen' : 'pick');
const data = (el, naam) => (el ? el.getAttribute(`data-uitleg-${naam}`) : null);
const getal = (el, naam) => {
  const v = data(el, naam);
  return v == null || v === '' ? null : Number(v);
};
// Staat dit onderdeel op het scherm (een filmkaart, een open la)
const heeft = (anker) => ({ vind }) => !!vind?.(anker);
// Sta je al op dat scherm en ontbreekt het onderdeel, dan valt de stap meteen
// weg (geen tussentitel die even staat en dan doorspringt)
const opScherm = (tabId, anker) => ({ tab, vind }) => tab !== tabId || !!vind?.(anker);
// In het archief: eerst een open film dicht, dan naar de watchlist
const opWatchlist = { sluit: 'archief-terug', klik: 'archief-tab-watchlist' };
// De tekst die je ziet: zonder de keuzelijsten die onder een zinwoord liggen
const zichtbareTekst = (el) => {
  if (!el) return null;
  const kopie = el.cloneNode(true);
  kopie.querySelectorAll('select, [hidden]').forEach((x) => x.remove());
  return kopie.textContent.replace(/\s+/g, ' ').trim() || null;
};
// Een vast voorbeeld, zonder getallen van het scherm
const altijd = () => ({});
// Het programma: zoeken en eigen rijen gaan via TMDB
const metTmdb = ({ app }) => !!app.tmdbKey;
// Is de Worker er (voor TMDB zonder eigen sleutel, sync en Letterboxd live)
export const metWorker = () => !!PROXY_URL;
// Terug naar Voor jou: een filmkaart, Alles bekijken en Snel beoordelen dicht
const terugUitVoorJou = ['voorjou-terug', 'snel-klaar'];
const naarVoorJou = { sluit: terugUitVoorJou, klik: 'voorjou-tab' };
const naarZoeken = { sluit: terugUitVoorJou, klik: 'zoek-tab' };
// Filmavond: terug uit even spieken, en na een winnaar naar een nieuwe ronde
// (het kaartje is dan al gegeven). Een lopende ronde blijft staan.
const naarAvond = { sluit: ['avond-terug', 'avond-nieuw'] };
// Staat Filmavond niet op het begin (een ronde loopt), dan vallen de stappen
// over dat scherm meteen weg
const opAvond = opScherm('avond', 'avond-kop');
// De zaal staat open (je probeerde het in de rondleiding)
const zaalOpen = heeft('zaal-lobby');

// Een deel: de stappen over één onderwerp, met een voorwaarde voor allemaal
// (zonder Worker geen zaal). Hoe werkt dit? en de zoekregel openen een deel.
const en = (a, b) => (a && b ? (ctx) => a(ctx) && b(ctx) : a || b);
const deel = (id, stappen, alleenAls = null) => stappen.map((s) => ({ ...s, deel: id, alleenAls: en(alleenAls, s.alleenAls) || undefined }));
const N = { naslag: true };
const metZaal = () => zaalBeschikbaar();
const metAfstand = () => remoteAvailable();

export const HOOFDSTUKKEN = [
  {
    id: 'welkom', tab: 'pick', duur: 2,
    stappen: deel('welkom', [
      { id: 'wat', meer: true },
      { id: 'code', ...N, doel: 'zaal-code', tab: 'pick', alleenAls: (ctx) => zonderLijst(ctx) && zaalBeschikbaar() },
      { id: 'export', meer: true, doel: 'import', tab: importTab },
      {
        id: 'kiezen', meer: true, doel: 'import', tab: 'pick', alleenAls: zonderLijst,
        doe: { klaar: metLijst, toon: 'import-demo', knop: 'demo' },
      },
      { id: 'bijwerken', ...N, doel: 'import', tab: 'instellingen', alleenAls: (ctx) => metLijst(ctx) && !ctx.app.demoMode },
      {
        id: 'filmdata', meer: true, doel: 'filmdata', tab: 'pick', leeg: true, wacht: 600, alleenAls: metLijst,
        vb: ({ el }) => (el ? { klaar: getal(el, 'klaar'), totaal: getal(el, 'totaal') } : null),
      },
      { id: 'demo', meer: true, doel: 'demo-banner', tab: 'pick', alleenAls: ({ app }) => app.demoMode && app.watchlistAll.length > 0 },
      { id: 'plekken', ...N, doel: 'navigatie', tab: 'pick' },
      { id: 'knop', meer: true, doel: 'uitleg-knop' },
    ]),
  },
  {
    // Vanavond: de hoofdfilm, de vraag over gisteren en de kassa
    id: 'vanavond', tab: 'pick', duur: 3, nodigLijst: true,
    stappen: deel('vanavond', [
      {
        id: 'hoofdfilm', meer: true, doel: 'hoofdfilm', tab: 'pick', voor: { sluit: 'kassa-terug' }, leeg: true,
        vb: ({ el }) => ({ titel: data(el, 'titel'), reden: data(el, 'reden') }),
      },
      { id: 'acties', meer: true, doel: 'hoofdfilm-acties', tab: 'pick', alleenAls: opScherm('pick', 'hoofdfilm-acties') },
      { id: 'binnen', ...N, doel: 'net-binnen', tab: 'pick', leeg: true, wacht: 400 },
      { id: 'vraag', ...N, doel: 'avond-vraag', tab: 'pick', leeg: true, wacht: 400 },
      { id: 'kassa', doel: 'kassa', tab: 'pick', vb: ({ el }) => ({ aantal: getal(el, 'aantal') }) },
      // Blijft er bij Korte avond niets over (nog geen filmdata), dan geen voorbeeld
      { id: 'stemming', ...N, doel: 'kassa-moods', tab: 'pick', vb: ({ el }) => ({ n: getal(el, 'kort') || null }) },
      { id: 'aanpassen', doel: 'kassa-aanpassen', tab: 'pick', doe: { klaar: heeft('kassa-la'), toon: 'kassa-aanpassen' } },
      { id: 'la', meer: true, doel: 'kassa-la', tab: 'pick', voor: { klik: 'kassa-aanpassen' } },
      { id: 'schakelaars', ...N, doel: 'kassa-schakelaars', tab: 'pick', voor: { sluit: 'kassa-la-klaar' }, vb: altijd },
      // Na de la (de korte rondgang): eerst de la dicht
      { id: 'lot', doel: 'kassa-lot', tab: 'pick', voor: { sluit: 'kassa-la-klaar' }, doe: { klaar: heeft('winner'), toon: 'kassa-lot', knop: 'pick' } },
      { id: 'kaart', ...N, doel: 'winner', tab: 'pick', alleenAls: heeft('winner') },
      { id: 'knoppen', meer: true, doel: 'winner-acties', tab: 'pick', alleenAls: heeft('winner') },
    ]),
  },
  {
    // De kaartjes (wanneer een pick gekeken telt, de doos) en het archief
    id: 'archief', tab: 'bieb', duur: 2, nodigLijst: true,
    stappen: [
      ...deel('kaartjes', [
        { id: 'kaartje', meer: true },
        { id: 'momenten', ...N },
        { id: 'uitdoos', ...N, doel: 'doos', tab: 'pick', leeg: true, wacht: 900 },
        {
          id: 'doos', doel: 'kaartjesdoos', tab: 'bieb', voor: { sluit: 'archief-terug', klik: 'archief-tab-kaartjes' },
          vb: ({ el }) => ({ n: getal(el, 'n') }),
        },
        { id: 'filmjaar', ...N, doel: 'filmjaar', tab: 'bieb', voor: { klik: 'archief-tab-kaartjes' }, leeg: true, wacht: 400 },
        { id: 'beheer', ...N, doel: 'kaartje-strook', tab: 'bieb', voor: { klik: 'archief-tab-kaartjes' }, leeg: true, wacht: 400 },
        { id: 'buiten', ...N, doel: 'kaartjes-buiten', tab: 'bieb', voor: { klik: 'archief-tab-kaartjes' }, leeg: true, wacht: 400 },
        { id: 'gelogd', ...N, doel: 'kaartjes-gelogd', tab: 'bieb', voor: { klik: 'archief-tab-kaartjes' }, leeg: true, wacht: 400 },
      ]),
      ...deel('archief', [
        {
          id: 'tabs', ...N, doel: 'archief-tabs', tab: 'bieb', voor: { sluit: 'archief-terug', klik: 'archief-tab-watchlist' },
          vb: ({ el }) => ({ wl: getal(el, 'wl'), gezien: getal(el, 'gezien') }),
        },
        { id: 'uitgelicht', ...N, doel: 'archief-uitgelicht', tab: 'bieb', voor: opWatchlist, wacht: 900 },
        { id: 'decennia', ...N, doel: 'archief-decennium', tab: 'bieb', voor: opWatchlist, leeg: true, wacht: 900 },
        { id: 'zoeken', ...N, doel: 'archief-zoek', tab: 'bieb', voor: opWatchlist },
        {
          id: 'filter', doel: 'archief-genre', tab: 'bieb', voor: opWatchlist,
          // Zonder filmdata is er geen genre om te kiezen: dan alleen kijken
          doe: {
            klaar: ({ vind }) => !!vind?.('archief-genre')?.querySelector('select')?.value,
            kan: ({ vind }) => (vind?.('archief-genre')?.querySelector('select')?.options.length || 0) > 1,
          },
        },
        { id: 'zin', ...N, doel: 'filterzin', tab: 'bieb', voor: opWatchlist, vb: ({ el }) => ({ zin: zichtbareTekst(el) }) },
        { id: 'film', doel: 'archief-film', tab: 'bieb', doe: { klaar: heeft('winner'), toon: 'archief-film' } },
        { id: 'kaart', ...N, doel: 'winner-acties', tab: 'bieb', alleenAls: heeft('winner') },
        { id: 'sterren', ...N, doel: 'archief-tab-gezien', tab: 'bieb', voor: { sluit: 'archief-terug' } },
      ]),
    ],
  },
  {
    // Programma: Voor jou, eigen rijen en Snel beoordelen, en zoeken
    id: 'programma', tab: 'verken', duur: 3, nodigLijst: true,
    stappen: [
      ...deel('voorjou', [
        { id: 'wat', meer: true, doel: 'voorjou-kop', tab: 'verken', voor: naarVoorJou, vb: ({ el }) => ({ aantal: getal(el, 'aantal') || null }) },
        // De aanraders komen uit TMDB: even geduld voor de lege tekst
        { id: 'vanavond', ...N, doel: 'voorjou-vanavond', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 'lang', vb: ({ el }) => ({ titel: data(el, 'titel') }) },
        { id: 'binnen', ...N, doel: 'voorjou-binnen', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 400 },
        { id: 'rijen', meer: true, doel: 'voorjou-rij', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 'lang', vb: ({ el }) => ({ titel: data(el, 'titel') }) },
        { id: 'tegel', meer: true, doel: 'voorjou-tegel', tab: 'verken', voor: naarVoorJou, wacht: 400 },
        {
          id: 'alles', ...N, doel: 'voorjou-alles', tab: 'verken', voor: naarVoorJou, wacht: 400,
          doe: { klaar: heeft('voorjou-lijst'), toon: 'voorjou-alles' },
        },
        { id: 'lijst', ...N, doel: 'voorjou-lijst', tab: 'verken', alleenAls: heeft('voorjou-lijst') },
        { id: 'kaart', ...N, doel: 'voorjou-kaart', tab: 'verken', alleenAls: heeft('voorjou-lijst'), vb: ({ el }) => ({ match: getal(el, 'match') }) },
        { id: 'filters', ...N, doel: 'voorjou-filters', tab: 'verken', voor: naarVoorJou },
        { id: 'diensten', ...N, doel: 'dienst-kiezer', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 400 },
        { id: 'shortlist', ...N, doel: 'voorjou-shortlist', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 400, vb: ({ el }) => ({ n: getal(el, 'n') }) },
        { id: 'afgewezen', ...N, doel: 'voorjou-afgewezen', tab: 'verken', voor: naarVoorJou, leeg: true, wacht: 400 },
      ]),
      // Een eigen rij en zoeken gaan via TMDB
      ...deel('eigenrijen', [
        { id: 'nieuw', doel: 'eigen-nieuw', tab: 'verken', voor: naarVoorJou, doe: { klaar: heeft('eigen-maker'), toon: 'eigen-nieuw' } },
        { id: 'voorstellen', ...N, doel: 'eigen-voorstellen', tab: 'verken', alleenAls: heeft('eigen-maker'), leeg: true, wacht: 400 },
        { id: 'basis', ...N, doel: 'eigen-basis', tab: 'verken', alleenAls: heeft('eigen-maker') },
        { id: 'bouwstenen', ...N, doel: 'eigen-bouwstenen', tab: 'verken', alleenAls: heeft('eigen-maker') },
        { id: 'naam', ...N, doel: 'eigen-naam', tab: 'verken', alleenAls: heeft('eigen-maker') },
        { id: 'opslaan', doel: 'eigen-knoppen', tab: 'verken', alleenAls: heeft('eigen-maker') },
        {
          id: 'beheer', ...N, doel: 'rij-actie', tab: 'verken', voor: { sluit: ['eigen-annuleer', ...terugUitVoorJou] }, leeg: true, wacht: 400,
          vb: ({ el }) => ({ label: data(el, 'label') }),
        },
        { id: 'snel', ...N, doel: 'snel-knop', tab: 'verken', voor: naarVoorJou, doe: { klaar: heeft('snel'), toon: 'snel-knop' } },
        { id: 'vegen', ...N, doel: 'snel', tab: 'verken', alleenAls: heeft('snel') },
      ], metTmdb),
      ...deel('zoeken', [
        // Een open eigen rij gaat eerst dicht (je kwam net uit de maker)
        { id: 'zoeken', doel: 'zoek-tab', tab: 'verken', voor: { sluit: ['eigen-annuleer', ...terugUitVoorJou] }, doe: { klaar: heeft('zoekmachine'), toon: 'zoek-tab' } },
        // Zelf iets zoeken; dat kan alleen jij (er is geen Laat zien)
        { id: 'zoekveld', ...N, doel: 'zoek-veld', tab: 'verken', voor: naarZoeken, doe: { klaar: heeft('zoek-resultaten') } },
        { id: 'zoekfilters', ...N, doel: 'zoek-filters-knop', tab: 'verken', voor: naarZoeken, doe: { klaar: heeft('zoek-filters'), toon: 'zoek-filters-knop' } },
        { id: 'criteria', ...N, doel: 'zoek-filters', tab: 'verken', alleenAls: opScherm('verken', 'zoek-filters') },
        { id: 'gezien', ...N, doel: 'verberg-gezien', tab: 'verken', voor: naarZoeken },
        { id: 'resultaten', ...N, doel: 'zoek-resultaten', tab: 'verken', voor: naarZoeken, leeg: true, wacht: 400 },
      ], metTmdb),
    ],
  },
  {
    // Samen kiezen: op één telefoon, de zaalstemming en op afstand
    id: 'samen', tab: 'avond', duur: 3, nodigLijst: true,
    stappen: [
      ...deel('samen', [{ id: 'welke', meer: true, tab: 'avond' }], metAfstand),
      ...deel('filmavond', [
        { id: 'avond', ...N, doel: 'avond-kop', tab: 'avond', voor: naarAvond, vb: ({ el }) => ({ n: getal(el, 'n') }) },
        { id: 'pot', ...N, doel: 'avond-pot', tab: 'avond', alleenAls: opAvond },
        { id: 'filters', ...N, doel: 'avond-filters', tab: 'avond', alleenAls: opAvond },
        // Eerst terug naar het begin van Filmavond (na een winnaar), dan pas kijken
        { id: 'veto', meer: true, doel: 'avond-veto', tab: 'avond', voor: naarAvond },
        { id: 'trailers', ...N, doel: 'avond-trailers', tab: 'avond', alleenAls: opAvond },
        { id: 'bracket', ...N, doel: 'avond-bracket', tab: 'avond', alleenAls: opAvond },
        { id: 'winnaar', ...N },
      ]),
      // De zaal, voor wie hem opent: open hem als je wilt, dan valt het licht
      // op de lobby; het verloop van een avond met de oefenstemming
      ...deel('zaal', [
        { id: 'zaal', ...N, doel: 'zaal-kaart', tab: 'avond', voor: naarAvond },
        {
          id: 'open', meer: true, doel: 'zaal-open', tab: 'avond', voor: naarAvond, alleenAls: opScherm('avond', 'zaal-open'),
          // Te weinig films in de pot: dan kan het niet, en is het een kijkstap
          doe: { klaar: zaalOpen, toon: 'zaal-open', knop: 'zaal', kan: ({ vind }) => !vind?.('zaal-open')?.disabled },
        },
        { id: 'code', meer: true, doel: 'zaal-scan', tab: 'avond', alleenAls: zaalOpen, vb: ({ el }) => ({ code: data(el, 'code') }) },
        { id: 'zelf', ...N, doel: 'zaal-zelf', tab: 'avond', alleenAls: zaalOpen },
        { id: 'spel', ...N, doel: 'zaal-spel', tab: 'avond', alleenAls: zaalOpen },
        { id: 'gasten', ...N, doel: 'zaal-spel', tab: 'avond', alleenAls: zaalOpen },
        { id: 'begin', ...N, doel: 'zaal-begin', tab: 'avond', alleenAls: zaalOpen, vb: ({ el }) => ({ n: getal(el, 'n') }) },
        { id: 'oefenen', meer: true, oefening: true },
        { id: 'gelijk', ...N },
        { id: 'tafel', ...N },
        { id: 'zaaltrailers', ...N },
        { id: 'filmronde', ...N },
        { id: 'uitslag', ...N },
        {
          id: 'sluit', doel: 'zaal-sluit', tab: 'avond', alleenAls: zaalOpen,
          doe: { klaar: ({ vind }) => !vind?.('zaal-lobby'), toon: 'zaal-sluit' },
        },
      ], metZaal),
      // De zaal, voor wie meestemt op de eigen telefoon (de telefoon legt het
      // zelf ook uit, met een oefenkaart in de lobby)
      ...deel('zaalgast', [
        { id: 'gast', ...N, doel: 'zaal-meedoen', tab: 'avond', voor: naarAvond, leeg: true },
        { id: 'gastnaam', ...N },
        { id: 'gastletterboxd', ...N },
        { id: 'voordragen', ...N },
        { id: 'gaststemmen', ...N, oefening: true },
        { id: 'alvast', ...N },
        { id: 'gastkaartje', ...N },
      ], metZaal),
      ...deel('afstand', [
        { id: 'voorons', meer: true, doel: 'samen-host', tab: 'avond', voor: naarAvond },
        { id: 'vrienden', ...N },
        { id: 'rang', ...N },
        { id: 'afstand', ...N, doel: 'afstand', tab: 'avond', voor: naarAvond, alleenAls: opScherm('avond', 'afstand') },
        { id: 'afstandwinnaar', ...N },
      ], metAfstand),
    ],
  },
  {
    // Het jaarboek: je smaakprofiel, meten en leren; daarnaast je cijfers
    id: 'jaarboek', tab: 'inzicht', duur: 2, nodigLijst: true,
    stappen: deel('jaarboek', [
      { id: 'wat', ...N, tab: 'inzicht' },
      // Het kijkritme komt uit het dagboek: zonder dagboek de lege tekst
      { id: 'ritme', ...N, doel: 'jaarboek-ritme', tab: 'inzicht', leeg: true, wacht: 400 },
      { id: 'cijfers', ...N, doel: 'jaarboek-cijfers', tab: 'inzicht', vb: ({ el }) => ({ n: getal(el, 'n'), nog: getal(el, 'nog') }) },
      { id: 'profiel', meer: true, doel: 'jaarboek-profiel', tab: 'inzicht' },
      // Meten laat niets na: dat mag je zelf, of de rondleiding doet het voor
      { id: 'meten', meer: true, doel: 'jaarboek-meten', tab: 'inzicht', doe: { klaar: heeft('jaarboek-meting'), toon: 'jaarboek-meet-knop' } },
      { id: 'uitkomst', meer: true, doel: 'jaarboek-meting', tab: 'inzicht', alleenAls: heeft('jaarboek-meting'), vb: ({ el }) => ({ pct: getal(el, 'pct') }) },
      // Leren verandert Voor jou: alleen kijken
      { id: 'leren', meer: true, doel: 'jaarboek-leren', tab: 'inzicht' },
      { id: 'lijstjes', ...N, doel: 'jaarboek-lijstjes', tab: 'inzicht' },
      { id: 'picks', ...N, doel: 'jaarboek-picks', tab: 'inzicht', leeg: true, wacht: 400 },
    ]),
  },
  {
    // Setup: je lijst bijwerken, back-up, meer scores, sync en live; daarnaast
    // taal en land, profielen, je eigen recept en als app
    id: 'setup', tab: 'instellingen', duur: 2,
    stappen: [
      ...deel('setup', [
        { id: 'tmdb', ...N, doel: 'setup-tmdb', tab: 'instellingen', alleenAls: metWorker },
        { id: 'laden', meer: true, doel: 'setup-laden', tab: 'instellingen' },
        { id: 'match', ...N, doel: 'setup-match', tab: 'instellingen', alleenAls: metLijst, leeg: true, wacht: 400 },
        { id: 'taal', ...N, doel: 'setup-taal', tab: 'instellingen' },
        { id: 'regio', ...N, doel: 'setup-regio', tab: 'instellingen' },
        { id: 'profielen', ...N, doel: 'setup-profielen', tab: 'instellingen' },
        { id: 'backup', meer: true, doel: 'setup-backup', tab: 'instellingen' },
        { id: 'start', ...N, doel: 'setup-start', tab: 'instellingen' },
      ]),
      ...deel('extras', [
        { id: 'omdb', meer: true, doel: 'setup-omdb', tab: 'instellingen' },
        { id: 'sync', meer: true, doel: 'setup-sync', tab: 'instellingen', alleenAls: metWorker },
        { id: 'live', meer: true, doel: 'setup-live', tab: 'instellingen', alleenAls: metWorker },
        { id: 'recept', ...N, doel: 'setup-recept', tab: 'instellingen', vb: altijd },
        { id: 'thema', ...N, doel: 'setup-thema', tab: 'instellingen' },
        { id: 'installeren', ...N },
        { id: 'premiere', ...N, doel: 'setup-versie', tab: 'instellingen' },
      ]),
    ],
  },
];

// De plek in de tool waar een hoofdstuk over gaat, voor "Over dit scherm"
const PER_TAB = { pick: 'vanavond', bieb: 'archief', verken: 'programma', avond: 'samen', inzicht: 'jaarboek', instellingen: 'setup' };
export const hoofdstukVoorTab = (tab) => {
  const id = PER_TAB[tab];
  return HOOFDSTUKKEN.find((h) => h.id === id) || null;
};

export const vindHoofdstuk = (id) => HOOFDSTUKKEN.find((h) => h.id === id) || null;
export const sleutel = (h, s, deel) => `uitleg.h.${h.id}.${s.id}.${deel}`;

// Hoort een stap bij deze rondgang: zonder deel alleen de kern, met een deel
// (gevonden via de zoekregel of Hoe werkt dit?) alles van dat deel
export const telt = (s, gekozen) => (gekozen ? s.deel === gekozen : !s.naslag);

// Welke hoofdstukken er voor deze tool zijn (zonder Worker geen zaal of sync)
export function beschikbaar(ctx) {
  return HOOFDSTUKKEN.filter((h) => !h.alleenAls || h.alleenAls(ctx));
}

// Het volgende hoofdstuk dat je nog niet zag, na dit hoofdstuk
export function volgendHoofdstuk(id, gezien = [], ctx) {
  const lijst = beschikbaar(ctx);
  const i = lijst.findIndex((h) => h.id === id);
  const na = [...lijst.slice(i + 1), ...lijst.slice(0, Math.max(i, 0))];
  return na.find((h) => !gezien.includes(h.id)) || null;
}

// Zoeken in het programma: "Waar wil je uitleg over?" Elk woord moet
// ergens in het hoofdstuk staan (titel, zoekwoorden of een stap); de stap
// met de meeste woorden is waar je begint. Hoofdletters en accenten tellen
// niet mee.
const plat = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const zonderPlekken = (s) => String(s || '').replace(/\{\w+\}/g, ' ');
export function zoekUitleg(vraag, tr, ctx) {
  const woorden = plat(vraag).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
  if (!woorden.length) return [];
  const uit = [];
  beschikbaar(ctx).forEach((h) => {
    const kop = plat(`${tr(`uitleg.h.${h.id}.titel`)} ${tr(`uitleg.h.${h.id}.zoek`)}`);
    const stappen = h.stappen.map((s, i) => ({
      i, s, kop: plat(tr(sleutel(h, s, 'kop'))),
      tekst: plat(zonderPlekken(`${tr(sleutel(h, s, 'kop'))} ${tr(sleutel(h, s, 'tekst'))} ${s.meer ? tr(sleutel(h, s, 'meer')) : ''}`)),
    }));
    const alles = `${kop} ${stappen.map((x) => x.tekst).join(' ')}`;
    if (!woorden.every((w) => alles.includes(w))) return;
    let beste = null;
    stappen.forEach((x) => {
      // Een woord in de kop van een stap telt dubbel
      const n = woorden.filter((w) => x.tekst.includes(w)).length + woorden.filter((w) => x.kop.includes(w)).length;
      if (n && (!beste || n > beste.n)) beste = { ...x, n };
    });
    const inKop = woorden.filter((w) => kop.includes(w)).length;
    // Een treffer op een stap opent zijn hele deel; een treffer op het
    // hoofdstuk zelf de korte rondgang
    const opStap = beste && beste.n >= inKop;
    uit.push({
      h, stap: opStap ? beste.i : 0, kop: opStap ? tr(sleutel(h, beste.s, 'kop')) : null,
      deel: opStap ? beste.s.deel : null, score: Math.max(inKop, beste?.n || 0),
    });
  });
  return uit.sort((a, b) => b.score - a.score);
}

// Vanzelf, bij het openen (dezelfde poort als de première): alleen in een
// uitgebrachte versie (5.8.0, geen beta, niet in ontwikkeling of de tests).
// Een leeg apparaat krijgt het welkom; wie de tool al gebruikte, één keer
// een melding. Daarna nooit meer vanzelf. Het welkom staat in de
// instellingen en reist mee met sync.
export function uitlegAutomatisch({ versie, uitleg = {}, watchlist = 0, demoMode = false }) {
  if (!/^\d+\.\d+\.\d+$/.test(versie || '')) return null;
  if (uitleg.welkom) return null;
  if (!watchlist && !demoMode) return 'welkom';
  return 'melding';
}

// De voortgang in de instellingen (settings.uitleg)
export const metGezien = (u = {}, id) => ({ ...u, gezien: [...new Set([...(u.gezien || []), id])], bezig: null });
export const metBezig = (u = {}, h, s, deel = null) => ({ ...u, bezig: deel ? { h, s, deel } : { h, s } });

// Hoe lang de rondleiding wacht op een onderdeel dat later verschijnt,
// voordat hij de stap overslaat of de lege tekst geeft; lang: voor wat via
// TMDB binnenkomt (de aanraders van Voor jou). De tests zetten ze korter.
export const WACHT = { ms: 2500, lang: 6000 };
