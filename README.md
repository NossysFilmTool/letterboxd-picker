# Nossy's Letterboxd Watchlist Picker

Can't decide what to watch tonight? Load your Letterboxd watchlist and let the
tool pick. By mood, together with friends (veto rounds and brackets), or
weighted by score and your own taste profile.

Everything runs locally in your browser. Nothing is uploaded.

## Features

- **Pick**: one tap, one film. Filter by mood ("short evening", "hidden gem"),
  genre, year, runtime or your streaming services. A smart mode favours
  higher-rated films and avoids recent picks. You can also pick from your own
  Letterboxd lists.
- **Library**: browse your watchlist and watch history with posters, scores
  and streaming availability for your region, with clickable JustWatch links.
- **Explore**: recommendations from outside your list, based on a taste
  profile built from your own ratings. Plus a full search engine over the
  TMDB catalogue.
- **Movie night**: pick together. Pass-the-phone veto rounds or a bracket
  tournament. Load a friend's watchlist to play on your overlap.
- **Insights**: your taste, read from your list. Genres, decades, directors,
  your watching rhythm, and how obscure you really are.
- The tool follows up on picks ("Did you watch it? Give it stars") and feeds
  your answers straight into the taste profile.
- Multiple profiles on one device: housemates each get their own
  watchlist, history and taste profile.
- Fully bilingual (Dutch/English), streaming region selectable, installable
  as an app, JSON backup and restore.

## Getting started

1. Export your Letterboxd data: Letterboxd → Settings → Data → Export.
   You get a ZIP. Drop the whole thing onto the tool.
2. That's it. Posters, scores and streaming info work out of the box.
3. Optional: add free [OMDb keys](https://www.omdbapi.com/apikey.aspx) in
   Setup for IMDb, Rotten Tomatoes and Metacritic scores (1000 films per day
   per key; the tool rotates through multiple keys automatically). Don't
   forget the activation link in the confirmation email.

## Privacy

Your watchlist, ratings and history live in your browser and never leave
your machine. There is no server with your data, no analytics, no tracking.
TMDB requests run through a small proxy so you don't need an API key; the
proxy forwards requests and stores nothing.

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

## TMDB proxy (optional)

The `worker/` folder contains a Cloudflare Worker that proxies TMDB with a
server-side key, so visitors need zero setup. See `worker/OPZETTEN.md` for
the deployment guide. Without it, the tool asks each user for their own free
TMDB key.

## Credits

Fan-made tool, not affiliated with Letterboxd. This product uses the TMDB API
but is not endorsed or certified by TMDB. Streaming availability comes from
TMDB/JustWatch data and may differ. Licensed under MIT.

---

## Nederlands

Geen zin om te kiezen wat je vanavond kijkt? Laad je Letterboxd-watchlist en
laat de tool kiezen. Op mood, samen met vrienden (veto-rondes en brackets),
of gewogen op score en je eigen smaakprofiel. Alles draait lokaal in je
browser; er wordt niets geüpload.

Snel starten: exporteer je data op Letterboxd (Settings → Data → Export) en
sleep de ZIP de tool in. Posters, scores en streaminginfo werken meteen.
Wil je ook IMDb-, Rotten Tomatoes- en Metacritic-scores, haal dan gratis
OMDb-sleutels op via Setup. Vergeet de activatielink in de bevestigingsmail
niet.

Stap je over van de lokale versie naar de site? Je data verhuist niet
vanzelf mee. Maak op de oude versie een back-up via Setup → Exporteer alles
(JSON) en zet die op de nieuwe versie terug via Herstel back-up.
