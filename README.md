# Nossy's Letterboxd Watchlist Picker

Can't decide what to watch tonight? Load your Letterboxd watchlist and let the
tool pick. By mood, together with friends (veto rounds and brackets), or
weighted by score and your own taste profile.

Everything runs in your browser, and your data stays on your device. A few
optional features use a small server; see Privacy for exactly what they send.

## Features

- **Pick**: the box office. Choose a mood ("short evening", "hidden gem"),
  see how many films are in the pot, decide what goes on the table (length,
  genres, language, period, score, your streaming services) and pick. Your
  film gets a trailer, then its ticket slides out of the box office. A smart
  mode favours higher-rated films and avoids recent picks. You can also pick
  from your own Letterboxd lists.
- **Library**: browse your watchlist and watch history with posters, scores
  and streaming availability for your region, with clickable JustWatch links.
- **Explore**: recommendations from outside your list, based on a taste
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
- **Tickets**: every pick prints a cinema ticket. Once you have really
  watched it (logged on Letterboxd, answered the tool, or rated it), the stub
  is torn off and goes into your ticket box, with a film year to share.
  Films the tool helped you find count too.
- **Letterboxd live**: enter your Letterboxd username and the tool reads your
  public diary, so a film you log shows up within minutes.
- **Insights**: your taste, read from your list. Genres, decades, directors,
  your watching rhythm, and how obscure you really are.
- **Just arrived**: films from your list that recently landed on your
  streaming services.
- **Sync** between your laptop, computer and phone, encrypted on your device.
- Multiple profiles on one device: housemates each get their own
  watchlist, history and taste profile.
- Fully bilingual (Dutch/English), streaming region selectable, installable
  as an app, JSON backup and restore.

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
npm run dev     # dev server
npm test        # test suite (vitest + jsdom + fake-indexeddb)
npm run build   # single-file build in dist/index.html
```

The build is one self-contained HTML file (vite-plugin-singlefile). Host it
anywhere or just double-click it. Pushes to `main` deploy to GitHub Pages
via Actions. Tests must pass first.

## The Worker

The `worker/` folder contains the Cloudflare Worker behind the TMDB proxy,
Letterboxd live, For us, remote voting and sync. See `worker/README.md` for
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
server (Letterboxd live, Voor ons, sync); onder Privacy staat precies wat ze
versturen. Sync versleutelt alles eerst op je eigen apparaat.

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
