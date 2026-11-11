# The Worker

A few features need something a browser cannot do on its own: keep an API key
secret, read letterboxd.com, or pass data between phones. For that the tool
talks to one small Cloudflare Worker (`worker.js`). It runs on the free tier.

## What it does

| Route | Used for | What it keeps |
| --- | --- | --- |
| `/3/...` | TMDB proxy. Adds the API key server-side, so visitors need no key. | Nothing. Film details are cached at the edge for 5 minutes; searches are never cached. |
| `/lb/<username>` | Letterboxd live. Passes on the public RSS diary feed of one user. | Nothing. The feed is cached for 1 minute. |
| `/session/...` | Remote voting rounds and For us. | The films on the table, player names, votes, and for For us one score (0 to 100) per film plus whether it is on someone's watchlist or already seen. Never an export or ratings. Deleted after 24 hours. |
| `/sync/<id>` | Sync between devices. | Data that each device encrypts itself (AES-GCM) with a key derived from the sync code, which never leaves the devices. The Worker cannot read it. Deleted after six months without a sync. |

## Protection

- CORS allowlist (`ALLOWED_ORIGINS` at the top of `worker.js`): only the site
  and `localhost:5173` can call it from a browser.
- Only GET requests, plus POST for `/session` and `/sync`.
- A rate limit per IP address (2000 requests a minute). It is kept in memory
  per data centre, so it slows scrapers down rather than stopping them.
- The TMDB key exists only as a Cloudflare secret. An `api_key` sent along
  with a request is ignored.
- Writing to a sync copy needs a write key derived from the sync code; the
  Worker keeps only its SHA-256 fingerprint. A revoked code stays closed.

## Running your own

1. Get a TMDB API key (v3): themoviedb.org, Settings, API.
2. In Cloudflare: Workers & Pages, Create, Worker. Replace the sample code
   with `worker.js` and deploy.
3. Settings, Variables and Secrets: add a secret named `TMDB_KEY` holding the
   TMDB key.
4. For voting rounds, For us and sync: Storage & databases, KV, create a
   namespace, then bind it to the Worker under the name `SESSIONS`.
5. Put your site's origin in `ALLOWED_ORIGINS` and your Worker's address in
   `PROXY_URL` in `src/lib/tmdb.js`.

To check it: `https://<your-worker>.workers.dev/3/movie/550` returns JSON
about Fight Club, and `/lb/<letterboxd-username>` returns the RSS feed.

When `worker.js` changes, paste the new version into the Worker and deploy
again. The tool notices when the Worker does not know a feature yet and shows
it as unavailable.

## Limits

The free tier allows 100,000 requests and 1,000 KV writes a day. Loading
film data for 1,000 films takes about 2,000 requests. Sync only writes when
something changed, a few times an hour at most.
