// Stemrondes voor Filmavond op afstand. De sessies leven in de Worker
// (Cloudflare KV, 24 uur geldig); dit is de dunne client-kant.
import { PROXY_URL } from './tmdb.js';

export const remoteAvailable = () => !!PROXY_URL;

async function call(path, opts) {
  const res = await fetch(`${PROXY_URL}${path}`, opts);
  let data = null;
  try { data = await res.json(); } catch { /* lege body */ }
  if (!res.ok) throw new Error(data?.error || `HTTP_${res.status}`);
  return data;
}

export function createSession(films, host) {
  return call('/session/new', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ films, host }),
  });
}

export function getSession(code) {
  return call(`/session/${code}`);
}

export function sendVote(code, player, picks) {
  return call(`/session/${code}/vote`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ player, picks }),
  });
}

export function closeSession(code, winner) {
  return call(`/session/${code}/close`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ winner }),
  });
}

// Winnaar bepalen: meeste stemmen wint; bij gelijkspel de hoogste score,
// daarna het lot. Puur en testbaar.
export function computeWinner(films, votes, scoreOf = () => 0) {
  const telling = Object.fromEntries(films.map((f) => [f.key, 0]));
  Object.values(votes || {}).forEach((picks) => {
    (picks || []).forEach((k) => { if (k in telling) telling[k] += 1; });
  });
  const max = Math.max(...Object.values(telling));
  const top = films.filter((f) => telling[f.key] === max);
  top.sort((a, b) => (scoreOf(b) ?? 0) - (scoreOf(a) ?? 0) || Math.random() - 0.5);
  return { winner: top[0], counts: telling };
}
