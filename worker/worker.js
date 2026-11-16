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
    if (request.method !== 'GET' && !(request.method === 'POST' && (url.pathname.startsWith('/session') || url.pathname.startsWith('/sync/') || url.pathname.startsWith('/zaal')))) return new Response('Alleen GET of sessie-POST', { status: 405, headers: cors });

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

    // --- Zaalstemming: stemmen met je telefoon, één scherm voor de zaal -----
    // Het scherm (de app met de watchlist) maakt een zaal en is de enige die
    // de rondes zet; dat kan alleen met het geheim dat het bij het maken
    // kreeg. Telefoons doen mee met een naam en stemmen elk in een eigen
    // sleutel, dus stemmen kunnen elkaar nooit overschrijven. Geen list():
    // het scherm weet wie er meedoen uit de zaal zelf. KV schrijft hooguit
    // één keer per seconde naar dezelfde sleutel; lukt dat niet, dan 429 en
    // probeert de app het zo opnieuw. Alles verdwijnt na 12 uur.
    //
    // Gasten kunnen hun eigen Letterboxd laten meetellen. Hun export blijft op
    // de telefoon: het scherm zet de films klaar die op tafel kunnen komen
    // (/vraag), de telefoon geeft per film alleen terug of je hem al zag, of
    // hij op je watchlist staat en hoe goed hij bij je past (/smaak).
    if (url.pathname.startsWith('/zaal')) {
      const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
        status, headers: { ...cors, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
      if (!env.SESSIONS) return json({ error: 'NO_KV' }, 501);
      const TTL = { expirationTtl: 12 * 3600 };
      const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
      const sha = async (s) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)));
      const lees = async (k) => { const r = await env.SESSIONS.get(k); return r ? JSON.parse(r) : null; };
      const schrijf = async (k, v) => { try { await env.SESSIONS.put(k, JSON.stringify(v), TTL); return true; } catch { return false; } };
      const druk = () => json({ error: 'DRUK' }, 429);
      const openbaar = (z) => { const { _geheim, ...rest } = z; return rest; };
      const naamVan = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, 20) : '');
      const slug = (naam) => naam.toLocaleLowerCase();
      const tekst = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
      const heel = (v, min, max) => { const x = parseInt(v, 10); return Number.isFinite(x) ? Math.max(min, Math.min(max, x)) : null; };
      const getal = (v, min, max) => { const x = typeof v === 'number' ? v : NaN; return Number.isFinite(x) ? Math.max(min, Math.min(max, Math.round(x * 10) / 10)) : null; };
      let body = {};
      if (request.method === 'POST') {
        try { body = await request.json(); } catch { return json({ error: 'BAD_BODY' }, 400); }
        if (!body || typeof body !== 'object') return json({ error: 'BAD_BODY' }, 400);
      }

      if (url.pathname === '/zaal/new' && request.method === 'POST') {
        const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // geen I en O: die lijken op 1 en 0
        let code = null;
        for (let i = 0; i < 6 && !code; i++) {
          const c = [...crypto.getRandomValues(new Uint8Array(4))].map((b) => LETTERS[b % LETTERS.length]).join('');
          if (!(await env.SESSIONS.get(`z:${c}`))) code = c;
        }
        if (!code) return json({ error: 'GEEN_CODE' }, 503);
        const geheim = hex(crypto.getRandomValues(new Uint8Array(16)));
        const ok = await schrijf(`z:${code}`, { type: 'zaal', v: 1, at: Date.now(), fase: 'lobby', ronde: 0, spelers: [], _geheim: await sha(geheim) });
        if (!ok) return druk();
        return json({ code, geheim, versie: 1 });
      }

      const z = url.pathname.match(/^\/zaal\/([A-Z]{4})(\/zet|\/stand|\/meedoen|\/stem|\/vraag|\/smaak)?$/);
      if (!z) return json({ error: 'NOT_FOUND' }, 404);
      const sleutel = `z:${z[1]}`;
      const zaal = await lees(sleutel);
      if (!zaal) return json({ error: 'NOT_FOUND' }, 404);
      const spelerSleutel = (naam) => `${sleutel}:p:${slug(naam)}`;
      const vraagSleutel = `${sleutel}:k`;
      const smaakSleutel = (naam) => `${sleutel}:s:${slug(naam)}`;

      if (!z[2] && request.method === 'GET') return json(openbaar(zaal));
      // De films ter beoordeling: net zo openbaar als de zaal zelf
      if (z[2] === '/vraag' && request.method === 'GET') return json((await lees(vraagSleutel)) || { v: 0, films: [] });
      if (request.method !== 'POST') return json({ error: 'NOT_FOUND' }, 404);

      // Het scherm: de volgende ronde zetten, de stemmen ophalen, of films
      // klaarzetten voor de gasten met Letterboxd
      if (z[2] === '/zet' || z[2] === '/stand' || z[2] === '/vraag') {
        if (typeof body.geheim !== 'string' || (await sha(body.geheim)) !== zaal._geheim) return json({ error: 'GEEN_TOEGANG' }, 403);
        if (z[2] === '/stand') {
          // gasten: wie de eigen Letterboxd meetelt, en welke vraag die
          // beantwoordde (v) over hoeveel films (n). Met oordeel: true ook
          // de oordelen zelf (s), voor het kiezen.
          const stemmen = {};
          const gasten = {};
          await Promise.all((zaal.spelers || []).map(async (naam) => {
            const p = await lees(spelerSleutel(naam));
            stemmen[naam] = p?.stemmen || {};
            if (p?.lb) {
              gasten[naam] = { v: p.lb.v, n: p.lb.n };
              if (body.oordeel === true) {
                const o = await lees(smaakSleutel(naam));
                gasten[naam].s = o && !o.uit ? o.s || {} : {};
              }
            }
          }));
          return json({ zaal: openbaar(zaal), stemmen, gasten });
        }
        // Films erbij zetten. De vraag groeit (hooguit 400 films, de nieuwste
        // blijven), zodat een gast die later aanhaakt alles in één keer krijgt.
        if (z[2] === '/vraag') {
          if (!Array.isArray(body.films)) return json({ error: 'BAD_FILMS' }, 400);
          const nieuw = body.films.slice(0, 200).map((f) => ({
            key: tekst(f?.key, 120),
            name: tekst(f?.name, 120),
            year: heel(f?.year, 1870, 2100),
            id: heel(f?.id, 1, 1e9),
            genres: (Array.isArray(f?.genres) ? f.genres : []).slice(0, 6).map((g) => tekst(g, 40)).filter(Boolean),
            keywords: (Array.isArray(f?.keywords) ? f.keywords : []).slice(0, 15).map((k) => heel(k, 1, 1e9)).filter((k) => k != null),
            vote: getal(f?.vote, 0, 10),
            votes: heel(f?.votes, 0, 1e8),
            lang: typeof f?.lang === 'string' && /^[a-z]{2,3}$/.test(f.lang) ? f.lang : null,
          })).filter((f) => f.key && f.name);
          const oud = (await lees(vraagSleutel))?.films || [];
          const keys = new Set(nieuw.map((f) => f.key));
          const films = [...oud.filter((f) => !keys.has(f.key)), ...nieuw].slice(-400);
          const v = (zaal.vraag || 0) + 1;
          if (!(await schrijf(vraagSleutel, { v, films }))) return druk();
          if (!(await schrijf(sleutel, { ...zaal, vraag: v }))) return druk();
          return json({ ok: true, v, n: films.length });
        }
        const s = body.staat && typeof body.staat === 'object' ? body.staat : {};
        const FASEN = ['lobby', 'genre', 'trailers', 'film', 'uitslag', 'gesloten'];
        // Wie er meedoet, houdt de Worker zelf bij (zie /meedoen)
        const nieuw = {
          type: 'zaal', v: 1, at: Date.now(),
          fase: FASEN.includes(s.fase) ? s.fase : zaal.fase,
          ronde: heel(s.ronde, 0, 99) ?? zaal.ronde,
          spelers: zaal.spelers || [],
          _geheim: zaal._geheim,
        };
        // Mogen gasten hun Letterboxd laten meetellen (lb), en de laatste
        // vraag (zie /vraag): die blijven staan tot het scherm iets anders zegt
        if (typeof s.lb === 'boolean' ? s.lb : zaal.lb === true) nieuw.lb = true;
        if (zaal.vraag) nieuw.vraag = zaal.vraag;
        if (Array.isArray(s.opties)) {
          nieuw.opties = s.opties.slice(0, 12)
            .map((o) => ({ id: tekst(o?.id, 40), naam: tekst(o?.naam, 40), n: heel(o?.n, 0, 9999) ?? 0 }))
            .filter((o) => o.id);
        }
        if (s.genre && typeof s.genre === 'object') {
          nieuw.genre = {
            namen: (Array.isArray(s.genre.namen) ? s.genre.namen : []).slice(0, 6).map((g) => tekst(g, 40)).filter(Boolean),
            wijze: ['meeste', 'breed', 'ook', 'allebei', 'elkWat', 'alles', 'vrij'].includes(s.genre.wijze) ? s.genre.wijze : 'meeste',
            punten: heel(s.genre.punten, 0, 99),
          };
        }
        // Vijf films van de lijst en tot drie aanraders van buiten
        if (Array.isArray(s.films)) {
          nieuw.films = s.films.slice(0, 8).map((f) => {
            const film = {
              key: tekst(f?.key, 120),
              name: tekst(f?.name, 120),
              year: heel(f?.year, 1870, 2100),
              poster: typeof f?.poster === 'string' && /^\/[\w.-]{1,60}$/.test(f.poster) ? f.poster : null,
              runtime: heel(f?.runtime, 1, 999),
              trailer: typeof f?.trailer === 'string' && /^[\w-]{6,20}$/.test(f.trailer) ? f.trailer : null,
              score: f?.score != null && Number.isFinite(+f.score) ? Math.round(+f.score * 10) / 10 : null,
            };
            if (f?.aanrader === true) {
              Object.assign(film, {
                aanrader: true,
                bronnen: heel(f.bronnen, 0, 99) ?? 0,
                via: (Array.isArray(f.via) ? f.via : []).slice(0, 2).map((v) => tekst(v, 80)).filter(Boolean),
                parel: f.parel === true,
                votes: heel(f.votes, 0, 1e7),
              });
            }
            return film;
          }).filter((f) => f.key && f.name);
        }
        if (s.uitslag && typeof s.uitslag === 'object' && nieuw.films) {
          const keys = new Set(nieuw.films.map((f) => f.key));
          const telling = (o) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {})
            .filter(([k]) => keys.has(k)).map(([k, v]) => [k, heel(v, 0, 99) ?? 0]));
          nieuw.uitslag = {
            key: keys.has(s.uitslag.key) ? s.uitslag.key : null,
            wijze: ['meeste', 'breed', 'lot'].includes(s.uitslag.wijze) ? s.uitslag.wijze : 'meeste',
            punten: telling(s.uitslag.punten),
            lijstjes: telling(s.uitslag.lijstjes),
            eersten: telling(s.uitslag.eersten),
            kandidaten: (Array.isArray(s.uitslag.kandidaten) ? s.uitslag.kandidaten : []).filter((k) => keys.has(k)).slice(0, 8),
          };
        }
        if (!(await schrijf(sleutel, nieuw))) return druk();
        return json({ ok: true, zaal: openbaar(nieuw) });
      }

      // Een telefoon doet mee: een naam en een eigen sleutel. Het token
      // (door de telefoon zelf gemaakt) bewijst later dat de stem van hem is;
      // hier staat alleen een vingerafdruk van.
      const naam = naamVan(body.naam);
      if (!naam) return json({ error: 'NO_NAAM' }, 400);
      if (typeof body.token !== 'string' || !/^[a-f0-9]{32}$/.test(body.token)) return json({ error: 'GEEN_TOEGANG' }, 403);
      const th = await sha(body.token);
      const speler = await lees(spelerSleutel(naam));
      const inDeZaal = (zaal.spelers || []).some((n) => slug(n) === slug(naam));

      if (z[2] === '/meedoen') {
        if (speler && speler.t !== th) return json({ error: 'NAAM_BEZET' }, 409);
        if (!inDeZaal && zaal.fase !== 'lobby') return json({ error: 'BEGONNEN' }, 409);
        if (!inDeZaal && (zaal.spelers || []).length >= 12) return json({ error: 'VOL' }, 409);
        if (!speler && !(await schrijf(spelerSleutel(naam), { naam, t: th, stemmen: {} }))) return druk();
        if (!inDeZaal) {
          zaal.spelers = [...(zaal.spelers || []), naam];
          if (!(await schrijf(sleutel, zaal))) return druk();
        }
        return json({ ok: true, naam: inDeZaal ? zaal.spelers.find((n) => slug(n) === slug(naam)) : naam, zaal: openbaar(zaal) });
      }

      // Stemmen: alleen in een open ronde, alleen op wat er op tafel ligt. Een
      // stem is [1e keus, 2e keus], elk een optie of null; allebei leeg
      // betekent: stem teruggenomen.
      if (!speler || speler.t !== th || !inDeZaal) return json({ error: 'GEEN_TOEGANG' }, 403);

      // Een gast laat de eigen Letterboxd meetellen: per film op de vraag
      // [score 0-100 of null, al gezien 0/1, op de watchlist 0/1]. v 0 met
      // niets erin: "ik doe mee, zet maar films klaar". { uit: true } trekt
      // het weer in. De export zelf komt hier nooit.
      if (z[2] === '/smaak') {
        if (zaal.fase === 'gesloten') return json({ error: 'DICHT' }, 409);
        if (body.uit === true) {
          if (!(await schrijf(smaakSleutel(naam), { uit: true }))) return druk();
          const { lb, ...zonder } = speler;
          if (lb && !(await schrijf(spelerSleutel(naam), zonder))) return druk();
          return json({ ok: true });
        }
        const v = heel(body.v, 0, 9999);
        if (v == null || !body.s || typeof body.s !== 'object' || Array.isArray(body.s)) return json({ error: 'BAD_SMAAK' }, 400);
        const geldig = new Set(v > 0 ? ((await lees(vraagSleutel))?.films || []).map((f) => f.key) : []);
        const oordeel = {};
        Object.entries(body.s).slice(0, 400).forEach(([k, o]) => {
          if (!geldig.has(k) || !Array.isArray(o)) return;
          oordeel[k] = [o[0] == null ? null : heel(o[0], 0, 100), o[1] ? 1 : 0, o[2] ? 1 : 0];
        });
        if (!(await schrijf(smaakSleutel(naam), { v, s: oordeel }))) return druk();
        const lb = { v, n: Object.keys(oordeel).length };
        if ((speler.lb?.v !== lb.v || speler.lb?.n !== lb.n) && !(await schrijf(spelerSleutel(naam), { ...speler, lb }))) return druk();
        return json({ ok: true, ...lb });
      }

      if (zaal.fase !== 'genre' && zaal.fase !== 'film') return json({ error: 'DICHT' }, 409);
      if (heel(body.ronde, 0, 99) !== zaal.ronde) return json({ error: 'OUDE_RONDE' }, 409);
      const geldig = new Set(zaal.fase === 'genre' ? (zaal.opties || []).map((o) => o.id) : (zaal.films || []).map((f) => f.key));
      if (!Array.isArray(body.keuze) || body.keuze.length > 2) return json({ error: 'BAD_KEUZE' }, 400);
      const keuze = [body.keuze[0] ?? null, body.keuze[1] ?? null];
      if (keuze.some((x) => x !== null && !geldig.has(x)) || (keuze[0] !== null && keuze[0] === keuze[1])) return json({ error: 'BAD_KEUZE' }, 400);
      const stemmen = { ...(speler.stemmen || {}) };
      if (keuze[0] === null && keuze[1] === null) delete stemmen[zaal.ronde];
      else stemmen[zaal.ronde] = keuze;
      Object.keys(stemmen).map(Number).sort((a, b) => a - b).slice(0, -10).forEach((r) => { delete stemmen[r]; });
      if (!(await schrijf(spelerSleutel(naam), { ...speler, stemmen }))) return druk();
      return json({ ok: true });
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
