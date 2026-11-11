import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from '../lib/i18n.js';
import { luister } from '../lib/melding.js';

// Het scherm van lib/melding.js: meldingen bovenin, en een venster voor een
// vraag. Eén vraag tegelijk; een volgende wacht tot de vorige beantwoord is.

const INFO_DUUR = 6000;
const FOUT_DUUR = 12000;

function Melding({ m, onWeg }) {
  const { t: tr } = useT();
  const wegRef = useRef(onWeg);
  wegRef.current = onWeg;
  useEffect(() => {
    const t = setTimeout(() => wegRef.current(), m.soort === 'fout' ? FOUT_DUUR : INFO_DUUR);
    return () => clearTimeout(t);
  }, [m.soort]);
  return (
    <div className={`melding ${m.soort}`}>
      <p>{m.tekst}</p>
      <button type="button" className="melding-sluit" aria-label={tr('common.close')} onClick={onWeg}><X size={15} /></button>
    </div>
  );
}

function Venster({ vraag, onAntwoord }) {
  const { t: tr } = useT();
  const ref = useRef(null);
  const jaRef = useRef(null);
  const neeRef = useRef(null);
  const tekstRef = useRef(null);
  const antwoordRef = useRef(onAntwoord);
  antwoordRef.current = onAntwoord;
  const kopId = `venster-${vraag.id}`;

  useEffect(() => {
    const vorige = document.activeElement;
    // Iets dat niet terug kan: annuleren staat klaar. Tekst om te kopiëren: die is al geselecteerd.
    if (vraag.kopie) { tekstRef.current?.focus(); tekstRef.current?.select(); }
    else (vraag.gevaar ? neeRef : jaRef).current?.focus();
    const toets = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); antwoordRef.current(false); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // De focus blijft in het venster
      const knoppen = [...ref.current.querySelectorAll('button, textarea')];
      if (!knoppen.length) return;
      const eerste = knoppen[0];
      const laatste = knoppen[knoppen.length - 1];
      if (e.shiftKey && document.activeElement === eerste) { e.preventDefault(); laatste.focus(); }
      else if (!e.shiftKey && document.activeElement === laatste) { e.preventDefault(); eerste.focus(); }
    };
    window.addEventListener('keydown', toets);
    const oud = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', toets);
      document.body.style.overflow = oud;
      if (vorige?.focus && document.contains(vorige)) vorige.focus();
    };
  }, [vraag]);

  return createPortal(
    <div className="zaal-venster-achter" onClick={() => onAntwoord(false)}>
      <div ref={ref} className="zaal-venster" role="alertdialog" aria-modal="true" aria-labelledby={kopId} onClick={(e) => e.stopPropagation()}>
        <p id={kopId} className="zaal-venster-tekst">{vraag.tekst}</p>
        {vraag.kopie && (
          <textarea ref={tekstRef} className="field zaal-venster-kopie" readOnly rows={Math.min(10, vraag.kopie.split('\n').length + 1)}
            value={vraag.kopie} aria-label={vraag.tekst} />
        )}
        <div className="zaal-venster-knoppen">
          {vraag.alleenSluiten ? (
            <button ref={jaRef} type="button" className="btn primary" onClick={() => onAntwoord(true)}>{tr('common.close')}</button>
          ) : (
            <>
              <button ref={neeRef} type="button" className="btn ghost" onClick={() => onAntwoord(false)}>{vraag.nee || tr('common.cancel')}</button>
              <button ref={jaRef} type="button" className={`btn ${vraag.gevaar ? 'gevaar' : 'primary'}`} onClick={() => onAntwoord(true)}>{vraag.ja || tr('common.ja')}</button>
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function Meldingen() {
  const [lijst, setLijst] = useState([]);
  const [vragen, setVragen] = useState([]);
  useEffect(() => luister((m) => {
    if (m.type === 'vraag') setVragen((v) => [...v, m]);
    // Dezelfde melding twee keer: de oude maakt plaats; hooguit drie tegelijk
    else setLijst((l) => [...l.filter((x) => x.tekst !== m.tekst), m].slice(-3));
  }), []);

  const vraag = vragen[0];
  const beantwoord = (antwoord) => {
    vraag.klaar(antwoord);
    setVragen((v) => v.filter((x) => x.id !== vraag.id));
  };

  return (
    <>
      <div className="meldingen" role="status" aria-live="polite">
        {lijst.map((m) => (
          <Melding key={m.id} m={m} onWeg={() => setLijst((l) => l.filter((x) => x.id !== m.id))} />
        ))}
      </div>
      {vraag && <Venster key={vraag.id} vraag={vraag} onAntwoord={beantwoord} />}
    </>
  );
}
