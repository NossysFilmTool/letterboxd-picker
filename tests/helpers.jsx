// Gedeelde hulpjes voor de tests: nepfilms, een gevulde bibliotheek (seed),
// en de hulpjes voor de rondleiding.
import { fireEvent, screen, within } from '@testing-library/react';

export const fakeFilms = [
  ['Aftersun', 2022, 96, ['Drama'], 7.7, 1200, 'Charlotte Wells'],
  ['La haine', 1995, 98, ['Drama', 'Crime'], 8.1, 9000, 'Mathieu Kassovitz'],
  ['Stalker', 1979, 162, ['Sciencefiction', 'Drama'], 8.1, 5000, 'Andrei Tarkovsky'],
  ['Whiplash', 2014, 106, ['Drama', 'Muziek'], 8.4, 60000, 'Damien Chazelle'],
  ['First Cow', 2019, 122, ['Drama', 'Western'], 7.0, 1400, 'Kelly Reichardt'],
  ['Close', 2022, 104, ['Drama'], 7.7, 1100, 'Lukas Dhont'],
];

export function seed() {
  localStorage.clear();
  const watchlist = fakeFilms.map(([name, year]) => ({ key: `${name.toLowerCase()}|${year}`, name, year, uri: '' }));
  const meta = {};
  fakeFilms.forEach(([name, year, runtime, genres, vote, votes, director], i) => {
    meta[`${name.toLowerCase()}|${year}`] = {
      id: 1000 + i, title: name, year, runtime, genres, vote, votes,
      at: Date.now(), imdbId: `tt00${i}`,
      ext: i === 0 ? { imdb: 7.8, rt: 93, mc: 81, at: Date.now() } : undefined,
      poster: null, backdrop: null, plot: 'Testplot.', director, country: 'FR',
      trailer: null, flat: i % 2 ? ['Netflix'] : [], rent: [],
      recs: [{ id: 5000 + i, title: `Aanrader ${i}`, year: 2010 + i, poster: null, vote: 7.2 }],
    };
  });
  localStorage.setItem('picker.watchlist', JSON.stringify(watchlist));
  localStorage.setItem('picker.meta', JSON.stringify(meta));
  localStorage.setItem('picker.ratings', JSON.stringify({ 'aftersun|2022': 5, 'la haine|1995': 4.5, 'stalker|1979': 4 }));
  localStorage.setItem('picker.settings', JSON.stringify({ tmdbKey: 'x', lang: 'nl' }));
  localStorage.setItem('picker.watchedFilms', JSON.stringify([{ key: 'columbus|2017', name: 'Columbus', year: 2017, uri: '' }]));
  localStorage.setItem('picker.ratedFilms', JSON.stringify([{ key: 'petite maman|2021', name: 'Petite maman', year: 2021, uri: '', rating: 4.5 }]));
  // mengmotor-cache: similar op Aftersun + een regisseurs-oeuvre
  const metaNow = JSON.parse(localStorage.getItem('picker.meta'));
  metaNow['aftersun|2022'].sims = [{ id: 7100, title: 'Vergelijkbare Parel', year: 2021, poster: null, vote: 7.5, votes: 800, lang: 'en', genre_ids: [18] }];
  localStorage.setItem('picker.meta', JSON.stringify(metaNow));
  localStorage.setItem('picker.oeuvres', JSON.stringify({
    'Charlotte Wells': { at: Date.now(), films: [{ id: 7200, title: 'Oeuvre Film', year: 2024, poster: null, vote: 7.2, votes: 500, lang: 'en', genre_ids: [18], rol: 'regie' }] },
  }));
}

// Verken onthoudt de laatst gekozen modus; zonder keuze opent het met
// filmdata op Voor jou. Zoektests kiezen vóór het renderen Zoeken, zodat de
// Voor jou-motor niet eerst met hun nep-fetch aan de slag gaat.
export const startOpZoeken = () => localStorage.setItem('picker.verkenMode', JSON.stringify('zoeken'));
// Open Verken, optioneel met het (standaard ingeklapte) filterpaneel open.
export function naarZoeken({ filters = false } = {}) {
  fireEvent.click(screen.getAllByLabelText('Programma')[0]);
  if (filters) fireEvent.click(screen.getByText('Toon filters'));
}

// De rondleiding (lib/rondleiding.js, components/Rondleiding.jsx): de
// ouvreuse met de zaklamp, het programma en het welkom
// De rondleiding: hulpjes voor de tests hieronder. Een hoofdstuk uit het
// programma loopt alleen langs de kern; een opgezocht deel (zoekregel, Hoe
// werkt dit?, of verder waar je was) langs alles van dat deel.
export const rKnop = () => document.querySelector('[data-uitleg="uitleg-knop"]');
export const rInstellingen = () => JSON.parse(localStorage.getItem('picker.settings'));
// Vóór render: de plek bewaren alsof je in dat deel bezig was
export const rDeel = async (h, deel) => {
  const { vindHoofdstuk } = await import('../src/lib/rondleiding.js');
  const s = vindHoofdstuk(h).stappen.findIndex((x) => x.deel === deel);
  const st = JSON.parse(localStorage.getItem('picker.settings') || '{}');
  localStorage.setItem('picker.settings', JSON.stringify({ ...st, uitleg: { ...(st.uitleg || {}), bezig: { h, s, deel } } }));
};
export const rVerder = (titel) => {
  fireEvent.click(rKnop());
  fireEvent.click(screen.getByRole('button', { name: `Verder waar je was: ${titel}` }));
};
export const rStart = (titel) => {
  fireEvent.click(rKnop());
  fireEvent.click(screen.getAllByRole('button', { name: new RegExp(titel) })[0]);
};
export const rVolgende = (titel, woord = 'Volgende') => fireEvent.click(within(titel).getByRole('button', { name: woord }));
