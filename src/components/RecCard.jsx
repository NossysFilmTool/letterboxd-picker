import { useState } from 'react';
import { Plus, X, Eye, Clapperboard, Star, Sparkles } from 'lucide-react';
import { IMG } from '../lib/tmdb.js';
import { useT } from '../lib/i18n.js';
import { lbLink, jwLink } from '../lib/links.js';
import { hoofdreden as maakHoofdreden } from '../lib/redenen.js';
import ImdbA from './ImdbA.jsx';
import Sterren from './Sterren.jsx';

// De uitgebreide aanbevelingskaart van "Alles bekijken": waarom de film er
// staat, de match met het uitklapbare recept, en alle acties.
export default function RecCard({ r, i = 0, sterk, seededOnRatings, detail, tmdbKey, voorkeur = [], receptOpen, onToggleRecept, onOpen, onShortlist, onSkip, onSimilar, onGezien }) {
  const { t: tr, lang } = useT();
  const fmt = (v) => (lang === 'nl' ? String(v).replace('.', ',') : String(v));
  const [sterrenOpen, setSterrenOpen] = useState(false);

  // Hoofdreden: welke route bracht deze film binnen
  const hoofdreden = maakHoofdreden(r, tr, seededOnRatings);
  // De match-redenen, behalve de thema-reden die hierboven al de hoofdreden was
  const themeReason = r.viaTheme?.length ? tr('verken.foundOnThemes', { themes: r.viaTheme.slice(0, 3).join(', ') }) : null;
  const extra = (r.redenen || []).filter((x) => x !== themeReason);

  return (
    <div className="card rec rise-in" style={{ '--i': Math.min(i, 16) }}>
      <button className="rposter" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }} onClick={() => onOpen(r)} aria-label={tr('common.openAria', { title: r.title })}>
        <div className="poster">
          {r.poster ? <img src={IMG(r.poster, 'w342')} alt={tr('common.posterAlt', { name: r.title })} loading="lazy" /> : <Clapperboard size={22} strokeWidth={1.4} aria-hidden="true" />}
        </div>
      </button>
      <div style={{ flex: 1, minWidth: 0 }}>
        <button style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--paper)' }} onClick={() => onOpen(r)}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: 24, fontWeight: 400 }}>{r.title}</h2>
        </button>
        <p style={{ color: 'var(--fog)', fontSize: 13.5, marginTop: 2 }}>
          {r.year || tr('match.yearUnknown')}
          {r.runtime ? ` · ${r.runtime} min` : ''}
          {r.vote ? <> · <Star size={12} style={{ verticalAlign: -1, color: 'var(--dot-o)' }} /> {fmt(r.vote)}{r.votes != null ? <span style={{ color: 'var(--fog-dim)' }}> ({tr('match.votesShort', { count: r.votes, n: r.votes >= 1000 ? `${Math.round(r.votes / 1000)}k` : r.votes })})</span> : null}</> : null}
          {sterk && <span className="chip on-b" style={{ marginLeft: 8, padding: '2px 8px', fontSize: 11 }}>{tr('zoek.matchPct', { pct: r.match })}</span>}
        </p>
        {r.flat?.length > 0 && (
          <p className="card-prov">
            <span className="livedot" aria-hidden="true" />
            {tr('winner.nowOn', { p: [...r.flat.filter((p) => voorkeur.includes(p)), ...r.flat.filter((p) => !voorkeur.includes(p))].slice(0, 3).join(', ') })}
          </p>
        )}
        <p className="why">
          {hoofdreden}
          {r.bronnen.length > 1 ? tr('verken.viaRoutes', { count: r.bronnen.length }) : ''}
          {extra.length ? ` · ${extra.slice(0, 2).join(' · ')}` : ''}
        </p>
        {r.recept && r.match != null && (
          <div style={{ marginTop: 8 }}>
            <button className="why-score" onClick={() => onToggleRecept(r.id)}>
              {receptOpen ? tr('verken.receptHide') : tr('verken.whyScore', { score: r.match })}
            </button>
            {receptOpen && (
              <div className="recept-panel">
                <p className="recept-intro">{tr('verken.receptIntro', { score: r.match })}</p>
                {r.recept.map((c) => (
                  <div key={c.id} className="recept-row">
                    <span className="recept-label">{tr(`verken.recept${c.id.charAt(0).toUpperCase()}${c.id.slice(1)}`)}</span>
                    <span className="recept-bar"><span style={{ width: `${Math.round(c.v * 100)}%` }} /></span>
                    <span className="recept-pts">{tr('verken.receptPts', { pts: c.pts })}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn green" onClick={() => onShortlist(r)}><Plus size={14} /> {tr('common.shortlist')}</button>
          <button className="btn ghost" onClick={() => onSkip(r)}><X size={14} /> {tr('verken.notForMe')}</button>
          {onGezien && <button className="btn ghost" onClick={() => setSterrenOpen((v) => !v)} aria-expanded={sterrenOpen}><Eye size={14} /> {tr('verken.gezienKort')}</button>}
          <button className="btn ghost" onClick={() => onSimilar(r)}><Sparkles size={14} /> {tr('winner.moreLikeThis')}</button>
          <span style={{ display: 'inline-flex', gap: 12, marginLeft: 4, fontSize: 12.5 }}>
            <a href={lbLink({ name: r.title }, r.id)} target="_blank" rel="noreferrer">Letterboxd</a>
            <ImdbA meta={detail} tmdbId={r.id} tmdbKey={tmdbKey} film={{ name: r.title, year: r.year }} />
            <a href={jwLink(detail, { name: r.title })} target="_blank" rel="noreferrer">JustWatch</a>
          </span>
        </div>
        {sterrenOpen && (
          <div className="kaart-sterren">
            <span>{tr('verken.welkeSterren')}</span>
            <Sterren onKies={(n) => { setSterrenOpen(false); onGezien(r, n); }} />
            <button type="button" className="linkbtn" onClick={() => { setSterrenOpen(false); onGezien(r, null); }}>{tr('verken.zonderSterren')}</button>
          </div>
        )}
      </div>
    </div>
  );
}
