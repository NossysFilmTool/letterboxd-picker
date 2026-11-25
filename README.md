# ShutterBox

Can't decide what to watch tonight? Load your Letterboxd watchlist and let the
tool pick. By mood, together with friends (veto rounds and brackets), or
weighted by score and your own taste profile.

Everything runs in your browser, and your data stays on your device. A few
optional features use a small server; see Privacy for exactly what they send.

## Features

- **The guided tour**: Guide, top right, walks you through the tool in seven
  short chapters, from loading your export to the house vote and sync. Each
  chapter keeps to the essentials, with "More about this" when you want the
  details. The light falls on the real button, the examples use your own
  films (or the demo list), and you can let the tour show you or tap it
  yourself. It leaves no trace by itself: a real pick or a real house
  is your choice, and it never erases anything. Search it ("export", "code", "sync"), or tap
  How does this work? next to the cards with the most setup.
- **Tonight**: the box office. Choose a mood ("short evening", "hidden gem"),
  see how many films are in the pot, decide what goes on the table (length,
  genres, language, period, score, your streaming services) and pick. Your
  film gets a trailer, then its ticket slides out of the box office. Above
  it, the main feature: one feature film a day from your list, chosen on a
  score you can trust and your taste, with the reason and a short film to
  go before it. A smart
  mode favours higher-rated films and avoids recent picks. You can also pick
  from your own Letterboxd lists.
- **Archive**: your watchlist, watch history and tickets, filtered with a
  sentence ("show drama from the '90s, up to 120 minutes") and laid out per
  decade, with scores and streaming availability for your region.
- **Programme**: recommendations from outside your list, based on a taste
  profile built from your own ratings. Plus a full search engine over the
  TMDB catalogue.
- **Movie night**: pick together. Pass-the-phone veto rounds, where the
  lights go down and every film first gets a trailer (shots, title card,
  story, cast, scores, projector sound), or a bracket tournament. Decide
  what goes on the table first: no short films, a maximum length, genres
  you're in the mood for or rather skip, language, period, score. Load a
  friend's watchlist to play on your overlap.
- **For us**: everyone opens a link on their own phone, their taste is scored
  there, and the tool picks the film the whole group will like.
- **House vote**: one screen is the cinema, everyone votes on their own phone
  with a four-letter code or by scanning the QR code. Everyone picks a 1st
  and 2nd genre, the smart pick puts five films from the list on the table
  plus three recommendations from outside it, the room watches their YouTube
  trailers, and everyone picks a 1st and 2nd film. Ties settle themselves.
  The host chooses how the room plays (a genre round or straight to the
  films, how many films, how many recommendations, whether guests may
  nominate a film of their own, closing by hand), and guests can let their
  own Letterboxd count: films someone has seen are left out and the room's
  taste weighs in. Optional, in three guided steps, or one tap on a phone
  that already knows you. During the trailers every phone shows which one
  is playing and you can vote early; afterwards everyone takes the ticket
  home, to keep in their own ticket box or share as an image.
- **Tickets**: every pick prints a cinema ticket. Once you have really
  watched it (logged on Letterboxd, answered the tool, or rated it), the stub
  is torn off and goes into your ticket box, with a film year to share.
  Films the tool helped you find count too.
- **Letterboxd live**: enter your Letterboxd username and the tool reads your
  public diary, so a film you log shows up within minutes.
- **Yearbook**: your taste, read from your list. Genres, decades, directors,
  your watching rhythm, and how obscure you really are.
- **Just arrived**: films from your list that recently landed on your
  streaming services.
- **Sync** between your laptop, computer and phone, encrypted on your device.
- Multiple profiles on one device: housemates each get their own
  watchlist, history and taste profile.
- Fully bilingual (Dutch/English), streaming region selectable, installable
  as an app, JSON backup and restore.

## New in version 6

Version 6 gets the tool ready to be hosted for everyone.

- **A new name**: ShutterBox, with the ShutterScore as its own score. Your
  list, tickets and settings move along by themselves, and if you already
  used the tool, it tells you once.
- **Every screen has its own address** (`#archive`, `#programme`,
  `#movie-night`, `#yearbook`, `#setup`), so Back, bookmarks and shared
  links work.
- **Movie night asks how you choose**: on the couch with one phone, in the
  room with a screen and everyone's phone, or by link, each at home.
- **Lighter to load**: a guest who scans the QR code loads only the voting
  screen, and everyone loads only their own language. After the first
  visit, the installed app also starts without a network.
- **What went wrong**: Setup lists what failed in the background, on this
  device only, ready to copy when you ask for help.
- **A fairer ShutterScore** (6.1): Metacritic is first converted to the same
  scale as IMDb and TMDB, so a film no longer drops just because critics
  score out of a hundred. The score is the same for everyone (the adjustable
  recipe is gone), and with fewer than a thousand votes behind it, it says
  "provisional".

## New in version 5

Version 5 turns the tool into a cinema around your watchlist.

- **The cinema**: a dark design where the posters and the film on screen
  carry the page.
- **The box office and your tickets**: every pick prints a real cinema
  ticket, and what you really watched goes into your ticket box, with your
  film year to share.
- **For you**: recommendations from beyond your list, in rows with a
  reason, tuned on your own ratings.
- **Movie night**: trailers with sound before the veto, and one card for
  what goes on the table.
- **For us, Letterboxd live and sync**: choose together on everyone's
  taste, see your diary come in by itself, keep your devices in step.
- **Calm messages**: no more browser pop-ups.
- **A premiere**: the first time you open version 5, your ticket is torn at
  the door and a trailer of your own time with the tool plays.

## Getting started

New here? The first time you open the tool, it offers a guided tour. It is
always under Guide, top right.

1. Export your Letterboxd data: Letterboxd → Settings → Data → Export.
   You get a ZIP. Drop the whole thing onto the tool.
2. That's it. Posters, scores and streaming info work out of the box.
3. Optional: add free [OMDb keys](https://www.omdbapi.com/apikey.aspx) in
   Setup for IMDb, Rotten Tomatoes and Metacritic scores (1000 films per day
   per key; the tool rotates through multiple keys automatically). Don't
   forget the activation link in the confirmation email.

## Privacy

Your watchlist, ratings and history live in your browser. There are no
accounts, no analytics and no tracking. A few features go through a small
server (a Cloudflare Worker, see `worker/`), and each one sends only what it
needs:

- **Film data**: TMDB requests run through it, so you don't need an API key.
  It forwards them and stores nothing.
- **Letterboxd live**: only your Letterboxd username, to read your public
  diary feed.
- **For us and remote voting**: the films on the table, the names you enter,
  and for For us one score per film, worked out on each phone. Never your
  export or your ratings. Deleted after 24 hours.
- **House vote**: the names you enter, your votes, the films guests
  nominate (title, year, TMDB id), and the genres and films on the table. A guest who lets their Letterboxd count sends, per film the
  screen sets out, only: seen or not, on their watchlist or not, and a
  score for how well it fits. Never the export or the ratings; those stay
  on the phone. Deleted after 12 hours.
- **Sync** (off until you turn it on): your data is encrypted on your device
  with a secret code before it is sent. The server only holds unreadable
  data.

Moving between versions? Browser storage is tied to the web address. Use
Setup → Export everything (JSON) on the old version and Restore backup on
the new one. This also applies when you switch from a local file to the
hosted site.

## Development

```bash
npm install
npm run dev        # dev server
npm test           # test suite in tests/ (vitest + jsdom + fake-indexeddb)
npm run lint       # ESLint
npm run build      # the hosted site, in dist/
npm run build:los  # everything in one HTML file, in dist-los/index.html
```

The hosted build is split into files: a guest loads only their own screen,
and everyone loads only their own language. On install, the service worker
stores every file listed in `bestanden.json`, so the installed app starts
offline after the first visit. `build:los` makes one self-contained HTML
file to open without a server or pass along. Pushes to `main` deploy to
GitHub Pages via Actions; lint and tests must pass first. Needs Node 20.19+
or 22.12+.

The name lives in `src/lib/merk.js` (plus `index.html` and
`public/manifest.webmanifest`, which the browser reads before the app
starts). Storage uses its own neutral prefix, so a new name never moves
anyone's data.

## The Worker

The `worker/` folder contains the Cloudflare Worker behind the TMDB proxy,
Letterboxd live, For us, remote voting, house votes and sync. See `worker/README.md` for
what it does, what it keeps and how to run your own. Without it, the tool
asks each user for their own free TMDB key.

## Credits

Fan-made tool, not affiliated with Letterboxd. This product uses the TMDB API
but is not endorsed or certified by TMDB. Streaming availability comes from
TMDB/JustWatch data and may differ. Licensed under MIT.

---

## Nederlands

Geen zin om te kiezen wat je vanavond kijkt? Laad je Letterboxd-watchlist en
laat de tool kiezen. Op mood, samen met vrienden (veto-rondes en brackets),
of gewogen op score en je eigen smaakprofiel. Alles draait in je browser en
je gegevens blijven op je apparaat. Een paar functies gaan via een kleine
server (Letterboxd live, Voor ons, de zaalstemming, sync); onder Privacy
staat precies wat ze versturen. Sync versleutelt alles eerst op je eigen
apparaat.

Zaalstemming: één scherm is de zaal, iedereen stemt op de eigen telefoon met
een code van vier letters of via de QR-code. Iedereen kiest een 1e en 2e
genre, de slimme pick legt vijf films van de lijst op tafel plus drie
aanraders van buiten (gekozen op wat er op tafel ligt, de genrestemming en
je smaak, en niet twee van hetzelfde soort), de zaal kijkt de trailers en
iedereen kiest een 1e en 2e film. Gelijkspel lost zichzelf op. De gastheer
kiest hoe de zaal speelt (ook of gasten zelf een film mogen voordragen), en
gasten kunnen hun eigen Letterboxd laten meetellen: wat iemand al zag gaat
eruit en de smaak van de zaal weegt mee. Het hoeft niet; wie het wil, doet
het in drie stappen, of met één tik op een telefoon die je al kent. Je
export blijft op je telefoon. Tijdens de trailers zie je op je telefoon
welke er draait en kun je alvast stemmen, en na afloop gaat iedereen naar
huis met het kaartje: te bewaren in de eigen kaartjesdoos of te delen als
plaatje.

Nieuw in 6.1: een eerlijkere ShutterScore. Metacritic rekent de tool eerst
om naar dezelfde schaal als IMDb en TMDB, zodat een film niet meer zakt
alleen omdat critici op honderd punten rekenen. De score is voor iedereen
hetzelfde (het instelbare recept is weg), en zitten er nog geen duizend
stemmen achter, dan staat er voorlopig bij.

Nieuw in 6.0: de tool heet voortaan ShutterBox, en de eigen score de
ShutterScore. Je lijst, kaartjes en instellingen gaan vanzelf mee, en wie
de tool al gebruikte, hoort het één keer. Elk scherm heeft een eigen adres
(#archive, #setup, ...), zodat Terug en bladwijzers werken. Bij Filmavond
kies je eerst hoe jullie kiezen: op de bank met één telefoon, in de zaal
met een scherm en ieders telefoon, of met een link, ieder thuis. Een gast
die de QR-code scant, laadt alleen het stemscherm, en iedereen alleen de
eigen taal. Na het eerste bezoek start de geïnstalleerde app ook zonder
netwerk. En onder Setup staat wat er op de achtergrond misging, om mee te
sturen als je hulp vraagt.

Nieuw in 5.8: de hoofdfilm van vanavond kiest slimmer, op een betrouwbaar
cijfer en je smaak, nooit meer een korte film (die staat eronder als
voorfilm), en met afwisseling over de dagen. En de rondleiding is dunner.
Onder Uitleg, rechtsboven, neemt de tool je in zeven korte hoofdstukken mee,
van je export laden tot de zaalstemming en sync. Elk hoofdstuk houdt het bij
de kern; onder Meer hierover staat de rest. Het licht valt op de echte knop, de
voorbeelden komen uit je eigen films (of de demo-lijst), en je laat het
voordoen of tikt het zelf. Uit zichzelf laat hij geen sporen na: een echte
pick of een echte zaal is je eigen keuze, en wissen doet hij nooit. Zoek erin ("export", "code",
"sync"), of tik op Hoe werkt dit? bij de kaarten met de meeste opzet. Wie
de tool voor het eerst opent, krijgt hem aangeboden.

Versie 5 maakt er een bioscoop van: een kassa met echte kaartjes, een
kaartjesdoos voor wat je echt keek, Voor jou, trailers bij de filmavond,
Voor ons, Letterboxd live en sync. Wie versie 5 voor het eerst opent,
krijgt een première.

Snel starten: exporteer je data op Letterboxd (Settings → Data → Export) en
sleep de ZIP de tool in. Posters, scores en streaminginfo werken meteen.
Wil je ook IMDb-, Rotten Tomatoes- en Metacritic-scores, haal dan gratis
OMDb-sleutels op via Setup. Vergeet de activatielink in de bevestigingsmail
niet.

Stap je over van de lokale versie naar de site? Je data verhuist niet
vanzelf mee. Maak op de oude versie een back-up via Setup → Exporteer alles
(JSON) en zet die op de nieuwe versie terug via Herstel back-up.
