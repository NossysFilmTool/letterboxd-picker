// TMDB-proxy voor Nossy's Letterboxd Watchlist Picker.
//
// Wat dit doet: de tool praat met deze Worker in plaats van rechtstreeks met
// TMDB, en de Worker plakt er serverzijde de geheime sleutel aan vast.
// Vrienden hoeven daardoor niets in te stellen; de sleutel staat nergens in
// de browser en kan dus niet uit de site geplukt worden.
//
// Ingebouwde bescherming:
// - Alleen GET-verzoeken naar TMDB v3-paden (/3/...), niets anders.
// - CORS-allowlist: alleen de eigen site (en localhost voor ontwikkelen) mag
//   de Worker vanuit een browser aanroepen.
// - Edge-cache van 5 minuten: populaire opvragingen (zelfde film bij meerdere
//   vrienden) raken TMDB maar één keer en zijn bliksemsnel.
// - Simpele rate-drempel per IP. Eerlijkheid gebiedt: dit is in-memory en
//   per datacenter, dus een drempel tegen scrapers — geen fort. Voor een
//   vriendenkring ruim voldoende.

const ALLOWED_ORIGINS = [
  'https://nossysfilmtool.github.io',
  'http://localhost:5173',
];

// Ruim genoeg voor een volledige verrijking (8 parallelle ophalers),
// krap genoeg om bulk-scrapen onaantrekkelijk te maken.
const RATE_LIMIT = 2000; // verzoeken per minuut per IP: ruim voor een verrijking, krap voor scrapers
const hits = new Map(); // ip -> { count, windowStart }

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);
    if (request.method !== 'GET' && !(request.method === 'POST' && (url.pathname.startsWith('/session') || url.pathname.startsWith('/sync/')))) return new Response('Alleen GET of sessie-POST', { status: 405, headers: cors });

    // Rate-drempel per IP (glijdend venster van 1 minuut)
    const ip = request.headers.get('CF-Connecting-IP') || 'onbekend';
    const now = Date.now();
    const slot = hits.get(ip);
    if (!slot || now - slot.windowStart > 60000) {
      hits.set(ip, { count: 1, windowStart: now });
    } else if (++slot.count > RATE_LIMIT) {
      return new Response(JSON.stringify({ error: 'Rustig aan' }), {
        status: 429, headers: { ...cors, 'Content-Type': 'application/json', 'Retry-After': '30' },
      });
    }

    // --- Stemrondes (Filmavond op afstand) --------------------------------
    // Vereist een KV-namespace gebonden als SESSIONS (zie README.md hiernaast).
    // Sessies verlopen na 24 uur. Elke speler schrijft naar een eigen sleutel,
    // dus gelijktijdig stemmen kan elkaar nooit overschrijven.
    if (url.pathname.startsWith('/session')) {
      if (!env.SESSIONS) {
        return new Response(JSON.stringify({ error: 'NO_KV' }), {
          status: 501, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { ...cors, 'Content-Type': 'application/json' },
      });
      const TTL = { expirationTtl: 86400 };

      if (url.pathname === '/session/new' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
        // Twee soorten: 'stem' (films aantikken, tot 20) en 'samen' ("Voor
        // ons": elke gast scoort tot 60 films op eigen smaak, op het eigen
        // toestel). Een 'samen'-film draagt wat daarvoor nodig is.
        const samen = body.type === 'samen';
        const getal = (v) => (Number.isFinite(+v) ? +v : null);
        const films = (body.films || []).slice(0, samen ? 60 : 20).map((f) => {
          const film = {
            key: String(f.key || '').slice(0, 120),
            name: String(f.name || '').slice(0, 120),
            year: parseInt(f.year) || null,
            poster: typeof f.poster === 'string' ? f.poster.slice(0, 60) : null,
          };
          if (samen) {
            film.id = parseInt(f.id) || null;
            film.genres = (Array.isArray(f.genres) ? f.genres : []).slice(0, 6).map((g) => String(g).slice(0, 30));
            film.keywords = (Array.isArray(f.keywords) ? f.keywords : []).slice(0, 15).map((k) => parseInt(k)).filter(Boolean);
            film.vote = getal(f.vote);
            film.votes = parseInt(f.votes) || null;
            film.runtime = parseInt(f.runtime) || null;
            film.lang = typeof f.lang === 'string' ? f.lang.slice(0, 5) : null;
          }
          return film;
        }).filter((f) => f.key && f.name);
        const host = String(body.host || '').slice(0, 24) || 'host';
        if (films.length < 2) return json({ error: 'TOO_FEW_FILMS' }, 400);
        const alfabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        const rnd = crypto.getRandomValues(new Uint8Array(6));
        const code = [...rnd].map((b) => alfabet[b % alfabet.length]).join('');
        await env.SESSIONS.put(`s:${code}`, JSON.stringify({ type: samen ? 'samen' : 'stem', films, host, at: Date.now(), winner: null }), TTL);
        // versie: zo ziet de tool of deze Worker "Voor ons" al kent
        return json({ code, versie: 2 });
      }

      const m = url.pathname.match(/^\/session\/([A-Z2-9]{6})(\/vote|\/scores|\/close)?$/);
      if (!m) return json({ error: 'NOT_FOUND' }, 404);
      const code = m[1];
      const raw = await env.SESSIONS.get(`s:${code}`);
      if (!raw) return json({ error: 'NOT_FOUND' }, 404);
      const sessie = JSON.parse(raw);

      if (!m[2] && request.method === 'GET') {
        // Stemmen zitten in het sessie-object zelf: één get(), geen list().
        // Dat houdt de 5-seconden-poll ruim binnen de KV-limieten.
        return json({ ...sessie, votes: sessie.votes || {}, scores: sessie.scores || {} });
      }

      if (m[2] === '/vote' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
        const speler = String(body.player || '').slice(0, 24).trim();
        if (!speler) return json({ error: 'NO_PLAYER' }, 400);
        const geldig = new Set(sessie.films.map((f) => f.key));
        const picks = (body.picks || []).filter((k) => geldig.has(k)).slice(0, 20);
        if (!picks.length) return json({ error: 'NO_PICKS' }, 400);
        // Read-modify-write met een korte retry: als twee stemmers elkaar net
        // kruisen, herlezen we de verse sessie en voegen opnieuw toe, zodat
        // niemands stem verloren gaat.
        for (let poging = 0; poging < 3; poging++) {
          const versRaw = poging === 0 ? raw : await env.SESSIONS.get(`s:${code}`);
          const vers = JSON.parse(versRaw);
          vers.votes = { ...(vers.votes || {}), [speler]: picks };
          await env.SESSIONS.put(`s:${code}`, JSON.stringify(vers), TTL);
          // korte controle of onze stem bleef staan; zo niet, opnieuw
          const check = JSON.parse(await env.SESSIONS.get(`s:${code}`));
          if (JSON.stringify(check.votes?.[speler]) === JSON.stringify(picks)) break;
        }
        return json({ ok: true });
      }

      // "Voor ons": een gast stuurt per film een score (0-100) die zijn eigen
      // toestel uitrekende, plus of de film op zijn watchlist staat (w) of
      // al gezien is (g). Geen export, geen ratings: alleen deze getallen.
      if (m[2] === '/scores' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
        const speler = String(body.player || '').slice(0, 24).trim();
        if (!speler) return json({ error: 'NO_PLAYER' }, 400);
        const geldig = new Set(sessie.films.map((f) => f.key));
        const scores = {};
        Object.entries(body.scores || {}).forEach(([k, v]) => {
          if (!geldig.has(k) || !v || typeof v !== 'object') return;
          const s = Number.isFinite(+v.s) ? Math.max(0, Math.min(100, Math.round(+v.s))) : null;
          scores[k] = { s, w: !!v.w, g: !!v.g };
        });
        if (!Object.keys(scores).length) return json({ error: 'NO_SCORES' }, 400);
        for (let poging = 0; poging < 3; poging++) {
          const vers = JSON.parse(poging === 0 ? raw : await env.SESSIONS.get(`s:${code}`));
          const alle = vers.scores || {};
          if (!(speler in alle) && Object.keys(alle).length >= 12) return json({ error: 'FULL' }, 400);
          vers.scores = { ...alle, [speler]: scores };
          await env.SESSIONS.put(`s:${code}`, JSON.stringify(vers), TTL);
          const check = JSON.parse(await env.SESSIONS.get(`s:${code}`));
          if (check.scores?.[speler]) break;
        }
        return json({ ok: true });
      }

      if (m[2] === '/close' && request.method === 'POST') {
        let body;
        try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
        // Herlees vers zodat een laatste stem niet verloren gaat.
        const vers = JSON.parse((await env.SESSIONS.get(`s:${code}`)) || raw);
        vers.winner = String(body.winner || '').slice(0, 120) || null;
        await env.SESSIONS.put(`s:${code}`, JSON.stringify(vers), TTL);
        return json({ ok: true });
      }
      return json({ error: 'NOT_FOUND' }, 404);
    }

    // --- Sync tussen je apparaten ------------------------------------------
    // Elk apparaat versleutelt je gegevens zelf met een geheime code; hier
    // komt alleen onleesbare data binnen, onder een id dat ook uit die code
    // is afgeleid. De Worker kan er niets mee behalve bewaren en teruggeven.
    // Wie schrijft, zegt op welke versie hij voortbouwde (basis); is er
    // intussen een nieuwere, dan 409 en voegt het apparaat eerst samen.
    // Schrijven kan alleen met de schrijfsleutel (ook uit de code afgeleid);
    // de Worker bewaart daar alleen een vingerafdruk van. Zo kan wie alleen
    // het id kent je kopie niet overschrijven of intrekken. Een ingetrokken
    // code (na "code wisselen") is leeg en blijft dicht.
    const sync = url.pathname.match(/^\/sync\/([a-f0-9]{64})$/);
    if (sync) {
      const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
      if (!env.SESSIONS) return json({ error: 'NO_KV' }, 501);
      const sleutel = `sync:${sync[1]}`;
      const ruw = await env.SESSIONS.get(sleutel);
      const nu = ruw ? JSON.parse(ruw) : null;
      if (request.method === 'GET') {
        if (!nu) return json({ error: 'NOT_FOUND' }, 404);
        if (nu.ingetrokken) return json({ error: 'INGETROKKEN' }, 410);
        return json({ at: nu.at, data: nu.data });
      }
      let body;
      try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
      if (typeof body.token !== 'string' || !/^[a-f0-9]{64}$/.test(body.token)) return json({ error: 'GEEN_TOEGANG' }, 403);
      const tokenHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(body.token)))]
        .map((b) => b.toString(16).padStart(2, '0')).join('');
      if (nu?.schrijf && nu.schrijf !== tokenHash) return json({ error: 'GEEN_TOEGANG' }, 403);
      if (nu?.ingetrokken) return json({ error: 'INGETROKKEN' }, 410);
      const at = Math.max(Date.now(), (nu?.at || 0) + 1);
      const TTL = { expirationTtl: 182 * 86400 }; // een half jaar zonder sync en het verdwijnt vanzelf
      if (body.intrekken) {
        // De versleutelde kopie weg; alleen een dichte deur blijft staan
        await env.SESSIONS.put(sleutel, JSON.stringify({ at, ingetrokken: true, schrijf: tokenHash }), TTL);
        return json({ ok: true, at });
      }
      if (typeof body.data !== 'string' || !body.data || body.data.length > 5_000_000) return json({ error: 'BAD_DATA' }, 400);
      if (nu && body.basis !== nu.at) return json({ error: 'CONFLICT', at: nu.at }, 409);
      await env.SESSIONS.put(sleutel, JSON.stringify({ at, data: body.data, schrijf: nu?.schrijf || tokenHash }), TTL);
      return json({ ok: true, at });
    }

    // --- Letterboxd live: je openbare dagboek-feed meelezen ---------------
    // Een browser mag letterboxd.com niet zelf lezen (CORS). De Worker haalt
    // de openbare RSS-feed van één gebruiker op en geeft hem ongewijzigd door.
    // Alleen een gebruikersnaam gaat erin. Een minuut gecachet: vers genoeg voor
    // het ontdekmoment, en al je apparaten samen vragen Letterboxd zo hooguit
    // eens per minuut.
    const lb = url.pathname.match(/^\/lb\/([A-Za-z0-9_]{1,40})$/);
    if (lb) {
      const res = await fetch(`https://letterboxd.com/${lb[1]}/rss/`, {
        headers: {
          'User-Agent': 'NossyPicker/1.0 (+https://nossysfilmtool.github.io/letterboxd-picker/)',
          Accept: 'application/rss+xml, application/xml;q=0.9',
        },
        cf: { cacheTtl: 60, cacheEverything: true },
      });
      if (!res.ok) {
        return new Response(JSON.stringify({ error: `LB_${res.status}` }), {
          status: res.status === 404 ? 404 : 502, headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
      return new Response(await res.text(), {
        status: 200,
        headers: { ...cors, 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': 'public, max-age=60' },
      });
    }

    if (!url.pathname.startsWith('/3/')) {
      return new Response(JSON.stringify({ error: 'Alleen TMDB v3-paden' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }


    // Doorsturen naar TMDB met de geheime sleutel; een eventueel meegestuurde
    // api_key wordt genegeerd (de Worker bepaalt de sleutel, niemand anders).
    const upstream = new URL(`https://api.themoviedb.org${url.pathname}`);
    url.searchParams.forEach((v, k) => { if (k !== 'api_key') upstream.searchParams.set(k, v); });
    upstream.searchParams.set('api_key', env.TMDB_KEY);

    // Zoekopdrachten NIET cachen. Bij druk verrijken (8 parallelle ophalers,
    // soms met korte of lege query-varianten) kan een gecachte zoekrespons
    // aan de verkeerde film worden gekoppeld, wat stille mismatches oplevert.
    // Detail- en lijst-calls (vast film-id) cachen we wél: veilig en zuinig.
    const cachebaar = !upstream.pathname.startsWith('/3/search/');
    const res = await fetch(upstream.toString(), {
      cf: cachebaar ? { cacheTtl: 300, cacheEverything: true } : { cacheTtl: 0 },
    });

    const out = new Response(res.body, { status: res.status, statusText: res.statusText });
    out.headers.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
    out.headers.set('Cache-Control', cachebaar ? 'public, max-age=300' : 'no-store');
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
