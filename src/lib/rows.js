// Venster-logica voor de aanbevelingsrijen: een schuifraam van `stap` films
// over de volledige poel, met nette wrap-around zodat je nooit op een lege
// rij eindigt. Puur en los testbaar.
export function vensterVan(films, rawOffset, stap = 12) {
  if (!films.length) return [];
  if (films.length <= stap) return films;
  const off = ((rawOffset % films.length) + films.length) % films.length;
  const uit = films.slice(off, off + stap);
  if (uit.length < stap) uit.push(...films.slice(0, stap - uit.length)); // wrap rond
  return uit;
}

// Voeg nieuwe films toe aan een bestaande lijst zonder duplicaten (op id).
export function voegNieuweToe(bestaand, nieuw) {
  const bekend = new Set(bestaand.map((r) => r.id));
  return [...bestaand, ...nieuw.filter((r) => !bekend.has(r.id))];
}
