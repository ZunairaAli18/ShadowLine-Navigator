# Ephemeris validation against NASA JPL Horizons

Generated 2026-11-14 19:51 UTC by `scripts/validate_horizons.py`.

We compared the Sun and Earth azimuth/elevation computed by Shadowline (Skyfield + JPL DE421, Moon frame
MOON_ME_DE421) with JPL Horizons (DE441, Moon frame MEAN_ME) for 4 lunar sites at 4 times between December 2026 and March 2027 (32 comparisons). Both are airless apparent positions (light-time, aberration, light bending).

| Body | Comparisons | Max \|Δaz\| | Max \|Δel\| | Max sky separation | Mean sky separation |
|---|---|---|---|---|---|
| Sun | 16 | 0.00003° | 0.00001° | 0.00001° (0.04") | 0.00001° (0.03") |
| Earth | 16 | 0.00003° | 0.00001° | 0.00001° (0.04") | 0.00001° (0.03") |

**Worst case: 0.000012° (0.04").** That is about 1/44,167 of the Sun's
apparent diameter (~0.53°), far below anything that matters for sunlight and Earth-visibility windows
(terrain horizons are sampled at 1° azimuth steps). The tiny residual is consistent with DE421 (ours)
vs DE441 (Horizons) and with Horizons' extra Earth light-bending term.

Sites: apollo-11, change-4, im-2, shackleton-ridge.
Times (UTC): 2026-12-10T06:00:00Z, 2027-01-07T18:00:00Z, 2027-02-14T03:30:00Z, 2027-03-22T12:00:00Z.

Δaz is taken the short way round (359° vs 1° = 2°). Sky separation is the great-circle angle between the
two directions, the fairest single number (azimuth differences grow near the zenith).

Full table: [`horizons_comparison.csv`](horizons_comparison.csv).
Horizons query: `CENTER='coord@301'`, `COORD_TYPE='GEODETIC'`, `SITE_COORD='<E-lon>,<lat>,0'`,
`QUANTITIES='4'` (airless apparent az/el), `TLIST` of UTC Julian dates.
