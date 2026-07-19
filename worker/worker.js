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
    if (request.method !== 'GET') return new Response('Alleen GET', { status: 405, headers: cors });

    const url = new URL(request.url);
    if (!url.pathname.startsWith('/3/')) {
      return new Response(JSON.stringify({ error: 'Alleen TMDB v3-paden' }), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

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

    // Doorsturen naar TMDB met de geheime sleutel; een eventueel meegestuurde
    // api_key wordt genegeerd (de Worker bepaalt de sleutel, niemand anders).
    const upstream = new URL(`https://api.themoviedb.org${url.pathname}`);
    url.searchParams.forEach((v, k) => { if (k !== 'api_key') upstream.searchParams.set(k, v); });
    upstream.searchParams.set('api_key', env.TMDB_KEY);

    const res = await fetch(upstream.toString(), {
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    const out = new Response(res.body, { status: res.status, statusText: res.statusText });
    out.headers.set('Content-Type', res.headers.get('Content-Type') || 'application/json');
    out.headers.set('Cache-Control', 'public, max-age=300');
    Object.entries(cors).forEach(([k, v]) => out.headers.set(k, v));
    return out;
  },
};
