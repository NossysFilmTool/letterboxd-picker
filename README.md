# Nossy's Letterboxd Watchlist Picker

Can't decide what to watch tonight? Load your Letterboxd watchlist and let the
tool pick — by mood, together with friends (veto rounds & brackets), or smartly
weighted by score and your own taste profile.

**Everything runs locally in your browser. Nothing is uploaded, ever.**

## Features

- **Pick** — one tap, one film. Filter by mood ("short evening", "hidden gem"),
  genre, year, runtime or your streaming services. A smart mode favours
  higher-rated films and avoids recent picks.
- **Library** — browse your watchlist and watch history with posters, scores
  and streaming availability for your region, with clickable JustWatch links.
- **Explore** — recommendations from outside your list, powered by a taste
  profile built from your own ratings (genres, eras, themes), plus a full
  search engine over the TMDB catalogue.
- **Movie night** — pick together: pass-the-phone veto rounds or a bracket
  tournament. Load a friend's watchlist to play on your overlap.
- **Insights** — your taste, read from your list: genres, decades, directors,
  how obscure you really are.
- Fully bilingual (Dutch/English), streaming region selectable (25 countries),
  installable share cards, JSON backup/restore.

## Getting started

1. **Export your Letterboxd data**: Letterboxd → Settings → Data → Export.
   You'll get a ZIP — drop the whole thing onto the tool.
2. **Get a free TMDB API key** (for posters, scores, trailers and streaming
   info): [themoviedb.org/settings/api](https://www.themoviedb.org/settings/api)
   — choose the short "API Read" v3 key and paste it in Setup.
3. Optional: add free [OMDb keys](https://www.omdbapi.com/apikey.aspx) in Setup
   for IMDb, Rotten Tomatoes and Metacritic scores (1000 films/day per key;
   the tool rotates through multiple keys automatically).

## Privacy

Your watchlist, ratings, keys and history live in your browser's localStorage
and never leave your machine. The only network traffic is your browser talking
directly to TMDB/OMDb with your own keys. There is no server, no analytics,
no tracking.

**Moving between versions?** localStorage is tied to the web address. Use
Setup → *Export everything (JSON)* on the old version and *Restore backup* on
the new one — including when you switch from a local file to the hosted site.

## Development

```bash
npm install
npm run dev     # dev server
npm test        # 74 tests (vitest + jsdom + fake-indexeddb)
npm run build   # single-file build in dist/index.html
```

The build is one self-contained HTML file (vite-plugin-singlefile) — you can
host it anywhere or just double-click it. Pushes to `main` deploy to GitHub
Pages automatically via Actions (tests must pass first).

## TMDB proxy (optional)

The `worker/` folder contains a Cloudflare Worker that proxies TMDB with a
server-side key, so visitors need zero setup. See `worker/OPZETTEN.md` for
the 10-minute deployment guide. Without it, the tool simply asks each user
for their own free TMDB key, as before.

## Credits

Fan-made tool, not affiliated with Letterboxd. This product uses the TMDB API
but is not endorsed or certified by TMDB. Streaming availability via
TMDB/JustWatch data and may differ. Licensed under MIT.

---

## Nederlands

Geen zin om te kiezen wat je vanavond kijkt? Laad je Letterboxd-watchlist en
laat de tool kiezen — op mood, samen met vrienden (veto-rondes en brackets), of
slim gewogen op score en je eigen smaakprofiel. Alles draait lokaal in je
browser; er wordt niets geüpload.

Snel starten: exporteer je data op Letterboxd (Settings → Data → Export) en
sleep de ZIP de tool in. Vraag een gratis TMDB-sleutel aan via
[themoviedb.org/settings/api](https://www.themoviedb.org/settings/api) (kies de
korte v3-sleutel) en plak hem bij Setup. Optioneel: gratis OMDb-sleutels voor
IMDb-, Rotten Tomatoes- en Metacritic-scores.

**Stap je over van de lokale versie naar de site?** Je data verhuist niet
vanzelf mee: maak op de oude versie een back-up via Setup → *Exporteer alles
(JSON)* en zet die op de nieuwe versie terug via *Herstel back-up*.
