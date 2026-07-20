import { imdbLink } from '../lib/links.js';
import { fetchExternalIds } from '../lib/tmdb.js';

// IMDb-link die altijd direct op de filmpagina uitkomt. Kennen we het
// IMDb-id al, dan is het een gewone link. Zo niet, dan halen we het bij de
// klik op (één kleine aanvraag) en sturen het al geopende venster door.
// Het venster gaat synchroon open, anders grijpen popup-blokkers in.
const idCache = new Map();

export default function ImdbA({ meta, film, tmdbId, tmdbKey, style }) {
  const bekend = meta?.imdbId || idCache.get(tmdbId);
  const href = bekend ? `https://www.imdb.com/title/${bekend}/` : imdbLink(meta, film);

  const onClick = (e) => {
    if (bekend || !tmdbId || !tmdbKey) return; // gewone link volstaat
    e.preventDefault();
    const w = window.open('about:blank', '_blank');
    if (w) w.opener = null;
    fetchExternalIds(tmdbId, tmdbKey)
      .then((id) => {
        idCache.set(tmdbId, id || null);
        if (w) w.location = id ? `https://www.imdb.com/title/${id}/` : imdbLink(meta, film);
      })
      .catch(() => { if (w) w.location = imdbLink(meta, film); });
  };

  return <a href={href} target="_blank" rel="noreferrer" onClick={onClick} style={style}>IMDb</a>;
}
