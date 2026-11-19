import { useEffect, useId, useState } from 'react';
import { useT } from '../lib/i18n.js';
import { IMG, searchMovies, effectiveTmdbKey } from '../lib/tmdb.js';
import { leesOpslag, schrijfOpslag } from '../lib/storage.js';
import { stuurVoordracht, trekVoordrachtIn } from '../lib/zaalstemming.js';

// Zelf een film voordragen, op de telefoon (ZaalTelefoon.jsx). Alleen als de
// gastheer dat toestaat (zaal.vd: hoeveel voordrachten er op tafel kunnen),
// en tot de films op tafel komen: in de lobby en tijdens de genrestemming.
// Je zoekt een film bij TMDB (via de Worker) en tikt hem aan; een nieuwe
// vervangt de vorige. Het scherm zet hem bij de films op tafel, met je naam
// erbij (ZaalScherm.jsx).
const OPSLAG = 'zaalVoordracht'; // { [code]: film }: wat je in welke zaal voordroeg

export function useZaalVoordracht({ code, ik, zaal, binnen, zoekMs = 350 }) {
  const { t: tr } = useT();
  const [mijn, setMijn] = useState(() => (leesOpslag(OPSLAG, {}) || {})[code] || null);
  const [zoek, setZoek] = useState('');
  const [uitslag, setUitslag] = useState(null); // null: nog niet gezocht
  const [zoekt, setZoekt] = useState(false);
  const [melding, setMelding] = useState('');
  const [bezig, setBezig] = useState(false);
  const [open, setOpen] = useState(false); // klein: uitgeklapt om te zoeken
  const kan = !!zaal?.vd && !!ik && binnen && (zaal.fase === 'lobby' || zaal.fase === 'genre');

  const onthoud = (film) => {
    const alle = leesOpslag(OPSLAG, {}) || {};
    const rest = Object.entries(alle).filter(([c]) => c !== code).slice(-4);
    schrijfOpslag(OPSLAG, Object.fromEntries(film ? [...rest, [code, film]] : rest));
    setMijn(film);
  };

  // Zoeken bij TMDB, even na het tikken
  useEffect(() => {
    const q = zoek.trim();
    if (q.length < 2) { setUitslag(null); setZoekt(false); return undefined; }
    let weg = false;
    setZoekt(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchMovies(effectiveTmdbKey(''), q);
        if (!weg) { setUitslag(r.filter((f) => f.id && f.title).slice(0, 6)); setMelding(''); }
      } catch {
        if (!weg) { setUitslag(null); setMelding(tr('zaal.vdZoekFout')); }
      } finally {
        if (!weg) setZoekt(false);
      }
    }, zoekMs);
    return () => { weg = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoek]);

  const fout = (e) => setMelding(e.message === 'DICHT' ? tr('zaal.vdDicht') : tr('zaal.vdFout', { msg: e.message }));

  const kies = async (r) => {
    const film = { id: r.id, name: r.title, year: r.year || null, poster: r.poster || null };
    setBezig(true);
    setMelding('');
    try {
      await stuurVoordracht(code, ik.naam, ik.token, film);
      onthoud(film);
      setZoek('');
      setOpen(false);
    } catch (e) { fout(e); }
    setBezig(false);
  };

  const trekIn = async () => {
    setBezig(true);
    setMelding('');
    try {
      await trekVoordrachtIn(code, ik.naam, ik.token);
      onthoud(null);
    } catch (e) { fout(e); }
    setBezig(false);
  };

  return { kan, mijn, zoek, setZoek, uitslag, zoekt, melding, bezig, open, setOpen, kies, trekIn, ruimte: zaal?.vd || 0 };
}

const jaartal = (jaar) => (jaar ? <span> {jaar}</span> : null);

export default function ZaalVoordracht({ vd, compact = false }) {
  const { t: tr } = useT();
  const id = useId();
  if (!vd.kan) return null;

  // Je voordracht staat: wat het is, en een andere kiezen of intrekken
  if (vd.mijn && !vd.open) {
    return (
      <section className={`zs-lb zs-vd${compact ? ' zs-lb-kort' : ''}`} aria-label={tr('zaal.vdKop')}>
        <div className="zs-vd-mijn">
          {vd.mijn.poster ? <img src={IMG(vd.mijn.poster, 'w154')} alt="" /> : <span className="zs-vd-poster" aria-hidden="true" />}
          <div>
            <p className="zs-lb-klein">{tr('zaal.vdMijn')}</p>
            <p className="zs-vd-titel">{vd.mijn.name}{jaartal(vd.mijn.year)}</p>
          </div>
        </div>
        <div className="zs-lb-knoppen">
          <button type="button" className="linkbtn" onClick={() => vd.setOpen(true)} disabled={vd.bezig}>{tr('zaal.vdAnder')}</button>
          <button type="button" className="linkbtn" onClick={vd.trekIn} disabled={vd.bezig}>{tr('zaal.vdIntrekken')}</button>
        </div>
        {vd.melding && <p className="zs-melding" role="alert">{vd.melding}</p>}
      </section>
    );
  }

  // Klein (tijdens de genrestemming): eerst alleen de vraag
  if (compact && !vd.open) {
    return (
      <section className="zs-lb zs-lb-kort zs-vd" aria-label={tr('zaal.vdKop')}>
        <button type="button" className="linkbtn" onClick={() => vd.setOpen(true)}>{tr('zaal.vdOpen')}</button>
      </section>
    );
  }

  return (
    <section className={`zs-lb zs-vd${compact ? ' zs-lb-kort' : ''}`} aria-label={tr('zaal.vdKop')}>
      {!compact && <h2 className="zs-lb-kop">{tr('zaal.vdKop')}</h2>}
      <p className="zs-lb-klein">{tr('zaal.vdUitleg', { count: vd.ruimte })}</p>
      <div className="zs-vd-zoek">
        <label className="label-breed" htmlFor={id}>{tr('zaal.vdZoekLabel')}</label>
        <input id={id} className="field" type="search" value={vd.zoek} onChange={(e) => vd.setZoek(e.target.value)}
          placeholder={tr('zaal.vdZoek')} autoComplete="off" enterKeyHint="search" />
        {vd.zoekt && <p className="zs-lb-klein" role="status">{tr('zaal.vdZoekt')}</p>}
        {!vd.zoekt && vd.uitslag?.length === 0 && <p className="zs-lb-klein" role="status">{tr('zaal.vdNiets')}</p>}
        {vd.uitslag?.length > 0 && (
          <ul className="zs-vd-uitslag">
            {vd.uitslag.map((r) => (
              <li key={r.id}>
                <button type="button" className="zs-vd-film" onClick={() => vd.kies(r)} disabled={vd.bezig}
                  aria-label={tr('zaal.vdKies', { name: r.year ? `${r.title} (${r.year})` : r.title })}>
                  <span className="zs-vd-poster" aria-hidden="true">{r.poster && <img src={IMG(r.poster, 'w92')} alt="" />}</span>
                  <span className="zs-vd-titel">{r.title}{jaartal(r.year)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {(vd.mijn || compact) && (
        <div className="zs-lb-knoppen">
          <button type="button" className="linkbtn" onClick={() => { vd.setOpen(false); vd.setZoek(''); }}>{tr('zaal.lbTerug')}</button>
        </div>
      )}
      {vd.melding && <p className="zs-melding" role="alert">{vd.melding}</p>}
    </section>
  );
}
