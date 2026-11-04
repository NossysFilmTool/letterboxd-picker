import { useMemo, useState } from 'react';
import { Search, X, Plus, ArrowUp, ArrowDown, Trash2, Wand2 } from 'lucide-react';
import { GENRES, genreLabel, searchMovies, searchPersons, searchKeywords } from '../lib/tmdb.js';
import { normaliseer, isBruikbaar, autoNaam, LANDEN } from '../lib/eigenrijen.js';
import { useT } from '../lib/i18n.js';

// Stel een eigen rij samen (of bewerk er een): waar gaat hij over (criteria,
// lijkt op een film, van een maker), plus bouwstenen als genre, onderwerp,
// land, periode, kort en dienst. Bovenaan voorstellen uit je smaak.
export default function EigenRijMaker({
  start = null, tmdbKey, mijnDiensten = [], diensten = [], voorstellen = [],
  onOpslaan, onAnnuleer, onVerwijder, onOmhoog, onOmlaag,
}) {
  const { t: tr, lang } = useT();
  const [b, setB] = useState(() => normaliseer(start));
  const [naam, setNaam] = useState(start?.naam || '');
  const [zoekTekst, setZoekTekst] = useState('');
  const [zoekRes, setZoekRes] = useState([]);
  const [themaTekst, setThemaTekst] = useState('');
  const [themaRes, setThemaRes] = useState([]);
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState('');
  const zet = (veld, waarde) => setB((x) => ({ ...x, [veld]: waarde }));
  const landNaam = useMemo(() => {
    let dn; try { dn = new Intl.DisplayNames([lang], { type: 'region' }); } catch { dn = null; }
    return (c) => { try { return (dn && dn.of(c)) || c; } catch { return c; } };
  }, [lang]);
  const landen = useMemo(() => [...LANDEN].sort((x, y) => landNaam(x).localeCompare(landNaam(y), lang)), [landNaam, lang]);
  const naamVoor = (r) => autoNaam(r, { tr, landNaam });

  const zoek = async () => {
    if (!tmdbKey || !zoekTekst.trim()) return;
    setBezig(true);
    try {
      if (b.basis === 'film') setZoekRes((await searchMovies(tmdbKey, zoekTekst.trim())).map((f) => ({ id: f.id, label: `${f.title}${f.year ? ` (${f.year})` : ''}`, waarde: { id: f.id, title: f.title, year: f.year } })));
      else setZoekRes((await searchPersons(tmdbKey, zoekTekst.trim())).map((p) => ({ id: p.id, label: `${p.name}${p.dept === 'Directing' ? ` (${tr('zoek.director')})` : p.dept === 'Acting' ? ` (${tr('zoek.actor')})` : ''}`, waarde: { id: p.id, naam: p.name, rol: p.dept === 'Acting' ? 'cast' : 'regie' } })));
    } catch { setZoekRes([]); }
    setBezig(false);
  };
  const zoekThema = async () => {
    if (!tmdbKey || !themaTekst.trim()) return;
    try { setThemaRes(await searchKeywords(tmdbKey, themaTekst.trim())); } catch { setThemaRes([]); }
  };
  const wisselGenre = (id) => zet('genres', b.genres.includes(id) ? b.genres.filter((g) => g !== id) : [...b.genres, id].slice(-3));

  const opslaan = () => {
    if (!isBruikbaar(b)) { setMelding(tr('verken.eigenKiesIets')); return; }
    onOpslaan({ ...b, id: start?.id || `e${Date.now().toString(36)}`, naam: naam.trim() || naamVoor(b) });
  };

  return (
    <section className="card eigen-maker" aria-label={start ? tr('verken.eigenBewerkTitel') : tr('verken.eigenTitel')}>
      <p className="label" style={{ marginBottom: 10 }}>{start ? tr('verken.eigenBewerkTitel') : tr('verken.eigenTitel')}</p>

      {!start && voorstellen.length > 0 && (
        <div className="eigen-sectie">
          <p className="eigen-kop"><Wand2 size={13} style={{ verticalAlign: -2 }} /> {tr('verken.eigenVoorstellen')}</p>
          <div className="eigen-chips">
            {voorstellen.map((v) => (
              <button key={naamVoor(v)} type="button" className="chip" onClick={() => onOpslaan({ ...v, id: `e${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, naam: naamVoor(v) })}>
                <Plus size={12} /> {naamVoor(v)}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="eigen-sectie">
        <p className="eigen-kop">{tr('verken.eigenBasis')}</p>
        <div className="eigen-chips" role="radiogroup" aria-label={tr('verken.eigenBasis')}>
          {[['criteria', 'eigenBasisCriteria'], ['film', 'eigenBasisFilm'], ['maker', 'eigenBasisMaker']].map(([v, k]) => (
            <button key={v} type="button" role="radio" aria-checked={b.basis === v} className={`chip ${b.basis === v ? 'on-b' : ''}`}
              onClick={() => { setB((x) => ({ ...x, basis: v })); setZoekRes([]); setZoekTekst(''); }}>
              {tr(`verken.${k}`)}
            </button>
          ))}
        </div>
        {(b.basis === 'film' || b.basis === 'maker') && (
          <div style={{ marginTop: 10 }}>
            {(b.basis === 'film' ? b.film : b.maker) ? (
              <span className="chip on-b">
                {b.basis === 'film' ? `${b.film.title}${b.film.year ? ` (${b.film.year})` : ''}` : b.maker.naam}
                <button type="button" aria-label={tr('zoek.wis')} onClick={() => zet(b.basis, null)} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, display: 'inline-flex' }}><X size={13} /></button>
              </span>
            ) : (
              <>
                <div className="eigen-zoek">
                  <input className="field" value={zoekTekst} onChange={(e) => setZoekTekst(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && zoek()}
                    placeholder={b.basis === 'film' ? tr('verken.eigenZoekFilm') : tr('verken.eigenZoekMaker')} aria-label={b.basis === 'film' ? tr('verken.eigenZoekFilm') : tr('verken.eigenZoekMaker')} />
                  <button type="button" className="btn" onClick={zoek} disabled={bezig}><Search size={14} /> {tr('common.search')}</button>
                </div>
                {zoekRes.length > 0 && (
                  <div className="eigen-chips" style={{ marginTop: 8 }}>
                    {zoekRes.map((r) => (
                      <button key={r.id} type="button" className="chip" onClick={() => { zet(b.basis, r.waarde); setZoekRes([]); }}>{r.label}</button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div className="eigen-sectie">
        <p className="eigen-kop">{tr('verken.eigenGenres')}</p>
        <div className="eigen-chips">
          {GENRES.map((g) => (
            <button key={g.id} type="button" className={`chip ${b.genres.includes(g.id) ? 'on' : ''}`} style={{ fontSize: 12, padding: '5px 10px' }} onClick={() => wisselGenre(g.id)} aria-pressed={b.genres.includes(g.id)}>{genreLabel(g)}</button>
          ))}
        </div>
      </div>

      {b.basis === 'criteria' && (
        <div className="eigen-sectie">
          <p className="eigen-kop">{tr('verken.eigenThemas')}</p>
          {b.themas.length > 0 && (
            <div className="eigen-chips" style={{ marginBottom: 8 }}>
              {b.themas.map((t) => (
                <span key={t.id} className="chip on-b">
                  {t.name}
                  <button type="button" aria-label={tr('zoek.wis')} onClick={() => zet('themas', b.themas.filter((x) => x.id !== t.id))} style={{ background: 'none', border: 'none', color: 'inherit', padding: 0, display: 'inline-flex' }}><X size={13} /></button>
                </span>
              ))}
            </div>
          )}
          <div className="eigen-zoek">
            <input className="field" value={themaTekst} onChange={(e) => setThemaTekst(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && zoekThema()}
              placeholder={tr('verken.eigenZoekThema')} aria-label={tr('verken.eigenZoekThema')} />
            <button type="button" className="btn" onClick={zoekThema}><Search size={14} /> {tr('common.search')}</button>
          </div>
          {themaRes.length > 0 && (
            <div className="eigen-chips" style={{ marginTop: 8 }}>
              {themaRes.map((t) => (
                <button key={t.id} type="button" className="chip" onClick={() => { if (!b.themas.some((x) => x.id === t.id)) zet('themas', [...b.themas, t].slice(-3)); setThemaRes([]); setThemaTekst(''); }}>{t.name}</button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="eigen-sectie eigen-rij-velden">
        {b.basis === 'criteria' && (
          <select className="field" value={b.land} onChange={(e) => zet('land', e.target.value)} aria-label={tr('verken.eigenLand')}>
            <option value="">{tr('verken.eigenLandAlle')}</option>
            {landen.map((c) => <option key={c} value={c}>{landNaam(c)}</option>)}
          </select>
        )}
        <input className="field" type="number" min="1880" max="2100" value={b.jaarVan} onChange={(e) => zet('jaarVan', e.target.value === '' ? '' : +e.target.value)} placeholder={tr('avond.from')} aria-label={tr('avond.yearFrom')} style={{ width: 96 }} />
        <span style={{ color: 'var(--fog-dim)' }}>{'–'}</span>
        <input className="field" type="number" min="1880" max="2100" value={b.jaarTot} onChange={(e) => zet('jaarTot', e.target.value === '' ? '' : +e.target.value)} placeholder={tr('avond.to')} aria-label={tr('avond.yearTot')} style={{ width: 96 }} />
        <select className="field" value={b.dienst} onChange={(e) => zet('dienst', e.target.value)} aria-label={tr('verken.serviceFilter')}>
          <option value="">{tr('verken.serviceAny')}</option>
          <option value="*">{tr('verken.serviceStreaming')}</option>
          {mijnDiensten.length > 0 && <option value="~mijn">{tr('verken.serviceMine')}</option>}
          {diensten.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <button type="button" className={`chip ${b.kort ? 'on-o' : ''}`} onClick={() => zet('kort', !b.kort)} aria-pressed={b.kort}>{tr('verken.filterShort')}</button>
      </div>

      <div className="eigen-sectie">
        <p className="eigen-kop">{tr('verken.eigenNaam')}</p>
        <input className="field" value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={isBruikbaar(b) ? naamVoor(b) : tr('verken.eigenNaamLeeg')} aria-label={tr('verken.eigenNaam')} />
      </div>

      {melding && <p style={{ color: 'var(--dot-o)', fontSize: 13, marginBottom: 10 }}>{melding}</p>}
      <div className="eigen-knoppen">
        <button type="button" className="btn green" onClick={opslaan}>{tr('verken.eigenOpslaan')}</button>
        <button type="button" className="btn ghost" onClick={onAnnuleer}>{tr('verken.eigenAnnuleer')}</button>
        {start && (
          <span className="eigen-beheer">
            {onOmhoog && <button type="button" className="btn ghost" onClick={onOmhoog} aria-label={tr('verken.eigenOmhoog')} title={tr('verken.eigenOmhoog')}><ArrowUp size={14} /></button>}
            {onOmlaag && <button type="button" className="btn ghost" onClick={onOmlaag} aria-label={tr('verken.eigenOmlaag')} title={tr('verken.eigenOmlaag')}><ArrowDown size={14} /></button>}
            <button type="button" className="btn ghost" onClick={onVerwijder}><Trash2 size={14} /> {tr('verken.eigenVerwijder')}</button>
          </span>
        )}
      </div>
    </section>
  );
}
