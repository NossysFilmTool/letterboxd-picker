# De TMDB-proxy live zetten (Cloudflare Worker)

Dit is het stappenplan om de proxy uit `worker.js` online te krijgen.
Reken op een minuut of tien, alles gratis. Na afloop werkt de tool voor
iedereen zonder TMDB-sleutel.

## Vooraf: het TMDB-tool-account (±5 min)

1. Ga naar https://www.themoviedb.org/signup en maak een **nieuw** account
   aan, los van je persoonlijke (een e-mailalias zoals jenaam+tool@... werkt
   prima). Verifieer de mail.
2. Log in → Settings → API → vraag een sleutel aan ("Developer").
   Vul bij de vragen gewoon eerlijk in: personal/hobby project, de URL van
   je tool. Je krijgt direct de **API Key (v3 auth)**. dat korte ding heb
   je zo nodig. Bewaar hem even in je notities.

## Cloudflare-account + Worker (±5 min)

1. Ga naar https://dash.cloudflare.com/sign-up en maak een gratis account
   (alleen e-mail + wachtwoord; je hoeft géén domein of creditcard toe te
   voegen). Verifieer de mail.
2. In het dashboard, linkermenu: **Workers & Pages** → knop
   **Create** → **Create Worker**.
3. Geef hem een naam, bijv. `nossy-tmdb`. Die naam komt in je URL:
   `https://nossy-tmdb.<jouw-account>.workers.dev`. Klik **Deploy**
   (er staat nu een voorbeeldje, dat gaan we vervangen).
4. Klik **Edit code**, gooi alle voorbeeldcode weg en plak de volledige
   inhoud van `worker.js` erin. Klik rechtsboven **Deploy**.
5. Nu de geheime sleutel erin, dit is de kern. Ga terug naar het
   Worker-overzicht → tabblad **Settings** → **Variables and Secrets** →
   **Add** → type **Secret**, naam exact `TMDB_KEY`, waarde = je
   v3-sleutel van het tool-account. Opslaan (de Worker herstart vanzelf).

## Testen (±1 min)

Open in je browser:

    https://nossy-tmdb.<jouw-account>.workers.dev/3/movie/550

Zie je JSON over Fight Club, dan leeft de proxy. Zie je een foutmelding
over een ongeldige key, check dan de Secret-naam (exact `TMDB_KEY`).

## Status: LIVE ✓

De Worker draait op https://nossy-tmdb.songason1-nossytool.workers.dev
en is sinds V4.0.1 ingevuld als `PROXY_URL` in `src/lib/tmdb.js`.
De site werkt daarmee voor iedereen zonder sleutel; een eigen sleutel
invullen blijft mogelijk als override.

## Stemrondes aanzetten (Filmavond op afstand)

De Worker bewaart stemrondes in Cloudflare KV. Dat is een gratis
opslaglaag die je eenmalig aanzet:

1. Dashboard, linkermenu: Storage & databases, dan KV.
2. Create namespace, naam: `nossy-sessies`. Aanmaken.
3. Naar je Worker: Settings, Variables and Secrets (of Bindings),
   Add binding, type KV namespace. Variable name exact `SESSIONS`,
   namespace `nossy-sessies`. Opslaan.
4. Plak de nieuwste worker.js opnieuw in Edit code en Deploy.

Testen: start in de tool bij Avond een stemronde. Krijg je de melding
dat de Worker nog geen stemrondes kent, check dan de binding-naam
(exact SESSIONS). Sessies verlopen na 24 uur vanzelf.

## Goed om te weten

- De sleutel staat alléén als Secret bij Cloudflare, nooit in de code of
  de browser. De repo mag dus gewoon publiek blijven.
- De allowlist in `worker.js` staat op jouw site (nossysfilmtool.github.io)
  plus localhost. Verhuist de site ooit, pas dan die lijst aan.
- Gratis tier: 100.000 verzoeken per dag. Een verrijking van 1000 films
  kost er ±2000, dus dat zit ruim.
- De offline LAUNCHER blijft met eigen sleutels werken en gebruikt de
  proxy niet.
