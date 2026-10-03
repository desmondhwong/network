> hx s2 import 260905-115339-001/astronomy-engine codex openai gpt-6 260905-115339
> re: [[260905-101445 solar system app]]
> context: official upstream Astronomy Engine v2.1.19 downloaded 2026-09-05 for the authorized 0.2 astronomy replacement; imported source and license bytes preserved

# Astronomy Engine 2.1.19

The local analytical astronomy provider is Don Cross's [Astronomy Engine v2.1.19](https://github.com/cosinekitty/astronomy/releases/tag/v2.1.19). The upstream JavaScript ES module is vendored without content changes; only its filename changes from `astronomy.js` to `astronomy-engine-2.1.19.mjs`. No package installation or runtime external request is needed to use this provider.

|Local file|Upstream path at tag v2.1.19|Bytes|SHA-256|
|---|---|---:|---|
|astronomy-engine-2.1.19.mjs|source/js/esm/astronomy.js|412025|068f1445ed0c636c94818fe6d20d7d125120e605e0bab9fc4675c3d531be5ad7|
|astronomy-engine-LICENSE.txt|LICENSE|1095|690dd98cb13ba4db77c6327deea852a816892bb9debbad5943405c66972f8023|
|astronomy-engine-API.md|source/js/README.md|174193|73c2de22668374bafd2d238ef43bccd96017550d47ba05afaedd969a00490b1f|

The annotated upstream tag object is `03084ee684bdcc490273fe85f9df4f1c8fb66199`. Download base: `https://raw.githubusercontent.com/cosinekitty/astronomy/v2.1.19/`. Full original [MIT license](astronomy-engine-LICENSE.txt) accompanies the source and documentation; the source also retains its own upstream copyright notice. This import record labels all three imported files without modifying upstream bytes.

## Calculation contract

The [upstream project](https://github.com/cosinekitty/astronomy) targets roughly one arcminute accuracy, with tests against NOVAS and JPL Horizons. Its planetary calculation uses truncated VSOP87 series; the lunar solution derives from the Improved Lunar Ephemeris/Brown theory implemented through Montenbruck and Pfleger. These are scientific analytical models with declared accuracy limits. They are not equivalent to directly querying a full JPL numerical ephemeris.

`astro.mjs` exposes geometric heliocentric positions in the fixed mean ecliptic and equinox of J2000, in AU, and separately exposes geocentric true-ecliptic/equinox-of-date tropical angles. For planets and the Sun, geocentric vectors include the vendor's light-time and aberration corrections. In this exact upstream version, `GeoVector(Moon)` returns `GeoMoon` directly, so the lunar path does not apply those two corrections; the wrapper reports that distinction per body. Earth has no geocentric zodiac longitude or observing direction.

Surface calculations use observer parallax with the library Earth geoid, precession and nutation to true equator/equinox of date, and local horizon rotation. Azimuth is north=0°, east=90°. Observer height is meters above the library reference surface. Atmospheric refraction defaults to none; `normal` selects the library's standard Meeus refraction formula, without local pressure or temperature input. Physical disk radii use mean body radii. The vendor's eclipse algorithms also use lunar mean/polar radii for different calculations, so rendered disk contact and reported contact instants can differ slightly.

UTC input approximates UT1, and the engine derives TT using its default Espenak/Meeus ΔT model. This local provider does not retrieve current Earth-orientation parameters, leap-second corrections to UT1, lunar limb topography, atmospheric weather, terrain, or relativistic light deflection. In 0.4 the calculated exploration envelope is astronomical years −10000 through +10000 inclusive; every date outside the modern application window 1800–2200 is marked as an extrapolated model with unvalidated accuracy. JPL requests and eclipse searches retain the 1800–2200 application boundary. Neither window is an independently certified error interval; see the [0.4 date-range assessment](../../data-sources/date-range-provenance.md).

Global eclipse events come from `SearchGlobalSolarEclipse`; named location presets calculate their own local maximum with `SearchLocalSolarEclipse`. Central events use the library's intersection between the shadow axis and Earth geoid. A partial event has no such central intersection: the wrapper samples actual daylight observer geometry and refines one selected observer's local eclipse maximum. That observer is explicitly an example, not a claim to the globally greatest partial-eclipse location. Contact altitudes in the upstream result use normal atmospheric refraction; the rendered surface defaults to no refraction unless selected.

Fixed star overlays rotate catalog J2000 equatorial coordinates through precession and nutation to the local horizon. This helper does not add catalog proper motion, stellar parallax, or annual aberration. Its accuracy is separate from solar-system bodies and depends on catalog epoch and stellar motion.

## Independent regression evidence

Tests compare the global maximum time, geographic position, and Sun altitude for 8 April 2024 and 2 August 2027 with the NASA path tables by Fred Espenak. The 2024 table reports 18:17:18.3 UT and the 2027 table 10:06:37.7 UT; the engine gives 18:17:19.495 UTC and 10:06:34.636 UTC respectively. The published tables use their own modeled ΔT values. Ten-second time and 0.05-degree geographic tolerances are test bounds for these examples, not a blanket accuracy promise. Sources: [2024 path table](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2024Apr08Tpath.html), [2027 path table](https://eclipse.gsfc.nasa.gov/SEpath/SEpath2001/SE2027Aug02Tpath.html). Eclipse Predictions by Fred Espenak, NASA's GSFC.

The fixed J2000 ecliptic frame is independently checked against an official JPL Horizons DE441 Earth vector for 2027-08-02 10:09 UTC, retrieved by the API integration task. Its request parameters and source are retained with the tests. A fixture check does not establish the complete engine's accuracy for all bodies and dates.

> hx end 260905-115339-001/astronomy-engine complete pinned source, original license, API documentation, coordinate/time contracts, and regression provenance retained

> hx s2 amend 260907-230105-001/date-range codex openai gpt-6 260907-230105
> context: 0.4 application-range paragraph updated from primary-source assessment; imported engine, license, and API documentation bytes remain unchanged
> hx end 260907-230105-001/date-range complete expanded calculated calendar is distinguished from unvalidated precision and the narrower JPL/eclipse window
