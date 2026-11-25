// Metacritic op de schaal van IMDb en TMDB, voordat de ShutterScore middelt.
//
// Metacritic geeft cijfers van 0 tot 100, en critici lopen veel verder uiteen
// dan publiek. Gewoon delen door tien trok een film met een Metacritic-cijfer
// omlaag: gemiddeld 0,86 lager dan IMDb, alleen door de andere schaal.
//
// Gemeten op 146 films met beide cijfers (FiveThirtyEight, fandango-dataset,
// 2015): Metacritic gemiddeld 58,8 met een spreiding van 19,5, IMDb 6,74 met
// 0,96. Op gelijke schaal is dat 3,85 + 0,049 x Metacritic. Een vergelijking
// via percentielen geeft bijna hetzelfde (65 -> 7,1, 80 -> 7,7, 90 -> 8,2).
//
//   Metacritic  30   50   65   81   90
//   was         3,0  5,0  6,5  8,1  9,0
//   nu          5,3  6,3  7,0  7,8  8,3
//
// In beeld blijft Metacritic gewoon zijn eigen getal (65); dit is alleen
// voor het rekenwerk.
export const MC_SCHAAL = { basis: 3.85, stap: 0.049 };

export const mcOpTien = (mc) => MC_SCHAAL.basis + MC_SCHAAL.stap * mc;
