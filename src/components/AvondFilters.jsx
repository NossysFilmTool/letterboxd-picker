import { RotateCcw } from 'lucide-react';
import { useT, decimaal } from '../lib/i18n.js';
import { metStandaard, afwijkend, wisselGenre, STANDAARD_FILTERS } from '../lib/avondFilters.js';

export function Chip({ aan, onClick, children, className = '', title, label, disabled }) {
  return (
    <button type="button" className={`chip ${aan ? 'on' : ''} ${className}`} aria-pressed={!!aan} onClick={onClick} title={title} aria-label={label} disabled={disabled}>
      {children}
    </button>
  );
}

// Wat er op tafel komt (lib/avondFilters.js): een rustige kaart met een rij
// per soort filter. Alles staat open, zodat je ziet wat er meedoet; de keuzes
// worden onthouden. Dezelfde kaart bij Filmavond en in de la van de kassa.
//   filters, onChange(nieuweFilters), aantal: films in de pot na de filters,
//   genres: de genres van je watchlist (meest voorkomend eerst), decennia
//   diensten: je eigen diensten (Verken); dan heet streaming "op mijn diensten"
//   voor / na: eigen rijen boven en onder de filters (de kassa: bron, gezien)
//   actie: een knop in de kop (de kassa: Klaar); afwijkt: eigen "wijkt af"
//   kopId: id van de kop, voor een dialoog die ernaar verwijst
//   minimum: onder dit aantal een waarschuwing (een ronde wil er vier)
export default function AvondFilters({ filters, onChange, aantal, genres, decennia, diensten = [], voor = null, na = null, actie = null, afwijkt, kopId, className = '', minimum = 4 }) {
  const { t: tr } = useT();
  const f = metStandaard(filters);
  const zet = (patch) => onChange({ ...f, ...patch });
  const jaar = (v) => (v === '' ? '' : +v);
  const anders = afwijkt ?? afwijkend(f);

  return (
    <div className={`card avond-filters ${className}`}>
      <div className="af-kop">
        <p className="label" id={kopId} style={{ margin: 0 }}>{tr('avond.opTafel')}</p>
        <span className="af-telling">{tr('avond.opTafelTelling', { count: aantal })}</span>
        {anders && (
          <button type="button" className="linkbtn af-standaard" onClick={() => onChange({ ...STANDAARD_FILTERS })}>
            <RotateCcw size={13} style={{ verticalAlign: -2 }} /> {tr('avond.fStandaard')}
          </button>
        )}
        {actie}
      </div>

      {voor}

      <div className="af-rij">
        <span className="af-label">{tr('avond.fLengte')}</span>
        <div className="af-chips">
          <Chip aan={f.geenKort} onClick={() => zet({ geenKort: !f.geenKort })} title={tr('avond.fGeenKortTitel')}>{tr('avond.fGeenKort')}</Chip>
          {[90, 120, 150].map((d) => (
            <Chip key={d} aan={f.maxDuur === d} onClick={() => zet({ maxDuur: f.maxDuur === d ? null : d })}>
              {tr('avond.fTotUur', { uur: decimaal(d / 60) })}
            </Chip>
          ))}
        </div>
      </div>

      {genres.length > 0 && (
        <>
          <div className="af-rij">
            <span className="af-label">{tr('avond.fZinIn')}</span>
            <div className="af-chips">
              {genres.map((g) => (
                <Chip key={g} aan={f.genres.includes(g)} onClick={() => onChange(wisselGenre(f, 'genres', g))}>{g}</Chip>
              ))}
            </div>
          </div>
          <div className="af-rij">
            <span className="af-label">{tr('avond.fLieverNiet')}</span>
            <div className="af-chips">
              {genres.map((g) => (
                <Chip key={g} aan={f.nietGenres.includes(g)} className={f.nietGenres.includes(g) ? 'niet' : ''}
                  label={tr('avond.fNietAria', { genre: g })} onClick={() => onChange(wisselGenre(f, 'nietGenres', g))}>{g}</Chip>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="af-rij">
        <span className="af-label">{tr('avond.fTaal')}</span>
        <div className="af-chips">
          {[['alle', 'fTaalAlle'], ['en', 'fTaalEn'], ['anders', 'fTaalAnders']].map(([w, k]) => (
            <Chip key={w} aan={f.taal === w} onClick={() => zet({ taal: w })}>{tr(`avond.${k}`)}</Chip>
          ))}
        </div>
      </div>

      <div className="af-rij">
        <span className="af-label">{tr('avond.fPeriode')}</span>
        <div className="af-chips">
          <input className="field" type="number" min="1880" max="2100" style={{ width: 84 }} placeholder={tr('avond.from')}
            value={f.jaarVan} aria-label={tr('avond.yearFrom')} onChange={(e) => zet({ jaarVan: jaar(e.target.value) })} />
          <span style={{ color: 'var(--fog-dim)' }}>{tr('avond.to')}</span>
          <input className="field" type="number" min="1880" max="2100" style={{ width: 84 }} placeholder={tr('avond.to')}
            value={f.jaarTot} aria-label={tr('avond.yearTot')} onChange={(e) => zet({ jaarTot: jaar(e.target.value) })} />
          {decennia.slice(0, 6).map((d) => (
            <Chip key={d} aan={f.jaarVan === d && f.jaarTot === d + 9}
              onClick={() => (f.jaarVan === d && f.jaarTot === d + 9 ? zet({ jaarVan: '', jaarTot: '' }) : zet({ jaarVan: d, jaarTot: d + 9 }))}>
              {`'${String(d).slice(2)}`}
            </Chip>
          ))}
        </div>
      </div>

      <div className="af-rij">
        <span className="af-label">{tr('avond.fCijfer')}</span>
        <div className="af-chips">
          {[0, 6.5, 7, 7.5].map((s) => (
            <Chip key={s} aan={f.minScore === s} onClick={() => zet({ minScore: s })}>
              {s ? `${tr('winner.nossy')} ${decimaal(s.toFixed(1))}+` : tr('avond.fCijferAlle')}
            </Chip>
          ))}
          <Chip aan={f.alleenStreaming} onClick={() => zet({ alleenStreaming: !f.alleenStreaming })}>
            {diensten.length ? tr('avond.fMijnDiensten') : tr('avond.onlyStreaming')}
          </Chip>
        </div>
      </div>

      {na}

      {aantal < minimum && (
        <p style={{ color: 'var(--dot-o)', fontSize: 12.5, marginTop: 10 }}>{tr('avond.tooFew', { count: aantal })}</p>
      )}
    </div>
  );
}
