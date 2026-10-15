# Demo & validation targets

All values below were queried from the **NASA Exoplanet Archive** TAP service on 14 Oct 2026
(tables `pscomppars`, `cumulative`, `toi`). They are NASA's numbers, not ours — they are the
answer key for `validate.py`. Use the *lightkurve name* column to fetch data.

> **Search by the ID column, not the star name.** Measured tonight: name searches took
> 15.1–111.3 s (median 27.7 s, 20 stars); KIC/TIC ID searches took 0.9–12.6 s (median 6.9 s,
> 10 stars). The app can still show the friendly name.

## A. Confirmed planets — validation set (20)
Depth in the archive is in percent; ppm = percent × 10 000. KIC IDs from the `cumulative`
table (TrES-2 = Kepler-1 b, HAT-P-7 = Kepler-2 b); TIC IDs from `pscomppars`.

| search ID (fast) | star | data | planet | published period (d) | radius (Earth radii) | depth (ppm) |
|---|---|---|---|---|---|---|
| KIC 11904151 | Kepler-10 | Kepler | Kepler-10 b | 0.8374907 | 1.47 | 192 |
| KIC 10874614 | Kepler-6 | Kepler | Kepler-6 b | 3.2346996 | 14.62 | 10814 |
| KIC 5780885 | Kepler-7 | Kepler | Kepler-7 b | 4.8854892 | 18.18 | 7569 |
| KIC 6922244 | Kepler-8 | Kepler | Kepler-8 b | 3.5224991 | 15.87 | 9146 |
| KIC 11804465 | Kepler-12 | Kepler | Kepler-12 b | 4.4379629 | 19.66 | 16721 |
| KIC 10619192 | Kepler-17 | Kepler | Kepler-17 b | 1.4857108 | 14.68 | 21802 |
| KIC 9410930 | Kepler-41 | Kepler | Kepler-41 b | 1.8555582 | 14.46 | 11037 |
| KIC 8191672 | Kepler-5 | Kepler | Kepler-5 b | 3.5484657 | 15.98 | 7252 |
| KIC 11446443 | TrES-2 | Kepler | TrES-2 b | 2.47063 | 15.24 | 16000 |
| KIC 10666592 | HAT-P-7 | Kepler | HAT-P-7 b | 2.20474 | 16.93 | 6000 |
| TIC 100100827 | WASP-18 | TESS | WASP-18 b | 0.94145223 | 13.90 | 10410 |
| TIC 22529346 | WASP-121 | TESS | WASP-121 b | 1.27492504 | 19.53 | 15018 |
| TIC 25155310 | WASP-126 | TESS | WASP-126 b | 3.28883 | 10.51 | 7006 |
| TIC 38846515 | WASP-100 | TESS | WASP-100 b | 2.84938 | 14.91 | 7600 |
| TIC 149603524 | WASP-62 | TESS | WASP-62 b | 4.41195 | 14.80 | 12000 |
| TIC 36734222 | WASP-43 | TESS | WASP-43 b | 0.813475 | 10.42 | 25500 |
| TIC 410153553 | LHS 3844 | TESS | LHS 3844 b | 0.462929709 | 1.29 | 696 |
| TIC 55092869 | KELT-11 | TESS | KELT-11 b | 4.73620865 | 15.13 | 2339 |
| TIC 441420236 | AU Mic | TESS | AU Mic b | 8.463446 | 4.79 | 2490 |
| TIC 261136679 | pi Men | TESS | pi Men c | 6.2678399 | 2.02 | 268 |

Hard cases on purpose: Kepler-10 b, LHS 3844 b and pi Men c are small planets with shallow
transits; AU Mic is a young, very spotty star. Expect some misses — report them honestly.

## B. NASA-flagged false positives — "is it a planet?" test (5)
Kepler Objects of Interest that NASA dispositioned **FALSE POSITIVE** with the *stellar eclipse*
flag set (eclipsing binary signs: secondary eclipse, odd/even difference or V shape), and no
centroid-offset flag (so the signal is on the target star itself). Depth in ppm.

| lightkurve name | KOI | period (d) | depth (ppm) | NASA model SNR |
|---|---|---|---|---|
| KIC 6756669 | K00862.01 | 5.851520671 | 33004 | 1630.4 |
| KIC 8801343 | K01247.01 | 2.73987398 | 20632 | 1454.3 |
| KIC 10657664 | K00964.01 | 3.273699006 | 6863 | 1293.1 |
| KIC 8218274 | K01064.01 | 1.187352427 | 20703 | 717.4 |
| KIC 10848459 | K00754.01 | 1.736952453 | 8079 | 505.6 |

## C. Unconfirmed TESS planet candidates — "possible new world" (5)
TOIs with TFOPWG disposition **PC** (planet candidate) as of the query date: bright (Tmag < 11),
periods 1–6 d, depth 2000–20000 ppm. Dispositions can change — re-check on ExoFOP before
claiming anything on stage.

| lightkurve name | TOI | period (d) | depth (ppm) | Tmag |
|---|---|---|---|---|
| TIC 375542276 | TOI-1163.01 | 3.0771612 | 4703 | 9.48 |
| TIC 149833117 | TOI-1717.01 | 4.0523890 | 8976 | 9.52 |
| TIC 252616865 | TOI-1482.01 | 5.7121916 | 7555 | 10.07 |
| TIC 277447970 | TOI-1361.01 | 2.2374620 | 4281 | 10.22 |
| TIC 416195870 | TOI-1264.01 | 2.7441672 | 5650 | 10.63 |

## Data availability (lightkurve `search_lightcurve`, run on 14 Oct 2026 — search only, no download)
**All 30 targets have light curves.** Kepler targets searched with author "Kepler", TESS with
author "SPOC". Exposure times available, in seconds (Kepler 1800 = long cadence; TESS 120 = 2-min).

| searched as | author | files | exptimes (s) | search time (s) |
|---|---|---|---|---|
| Kepler-10 | Kepler | 49 | 60, 1800 | 30.0 |
| Kepler-6 | Kepler | 39 | 60, 1800 | 18.4 |
| Kepler-7 | Kepler | 36 | 60, 1800 | 26.8 |
| Kepler-8 | Kepler | 49 | 60, 1800 | 24.6 |
| Kepler-12 | Kepler | 40 | 60, 1800 | 38.1 |
| Kepler-17 | Kepler | 46 | 60, 1800 | 40.1 |
| Kepler-41 | Kepler | 27 | 60, 1800 | 25.2 |
| Kepler-5 | Kepler | 51 | 60, 1800 | 25.5 |
| TrES-2 | Kepler | 53 | 60, 1800 | 32.1 |
| HAT-P-7 | Kepler | 67 | 60, 1800 | 27.0 |
| WASP-18 | SPOC | 18 | 20, 120 | 15.1 |
| WASP-121 | SPOC | 11 | 20, 120 | 28.4 |
| WASP-126 | SPOC | 56 | 20, 120 | 100.0 |
| WASP-100 | SPOC | 66 | 20, 120 | 56.0 |
| WASP-62 | SPOC | 58 | 20, 120 | 111.3 |
| WASP-43 | SPOC | 9 | 20, 120 | 19.3 |
| LHS 3844 | SPOC | 21 | 20, 120 | 30.5 |
| KELT-11 | SPOC | 6 | 20, 120 | 20.5 |
| AU Mic | SPOC | 5 | 20, 120 | 25.0 |
| pi Men | SPOC | 42 | 20, 120 | 55.6 |
| KIC 6756669 | Kepler | 13 | 1800 | 1.3 |
| KIC 8801343 | Kepler | 21 | 60, 1800 | 12.6 |
| KIC 10657664 | Kepler | 19 | 60, 1800 | 11.0 |
| KIC 8218274 | Kepler | 17 | 1800 | 8.6 |
| KIC 10848459 | Kepler | 14 | 1800 | 7.3 |
| TIC 375542276 | SPOC | 6 | 20, 120 | 0.9 |
| TIC 149833117 | SPOC | 6 | 20, 120 | 4.6 |
| TIC 252616865 | SPOC | 3 | 120 | 5.0 |
| TIC 277447970 | SPOC | 6 | 120 | 6.7 |
| TIC 416195870 | SPOC | 47 | 20, 120 | 7.1 |

Caveat: the confirmed planets were searched by name and the others by ID, so name lookup is the
likely (not proven) cause of the slow searches. Either way: cache everything at 12:00 and demo
from `data/`. Live search during the pitch only as a bonus, never as the main demo.
