# WC-2026-08-08-geolocation-emptiness-explicit — geolocation absence is structural: the Valencia sentinel is retired and the opening camera becomes `features.default_view`

> **(!) READ THE LAST ADDENDUM FIRST — `## Addendum 2026-08-09 (second) — the
> settled model` at the end of this file. It is the current law.** Everything
> above it is kept verbatim as the historical record (amendment rule,
> `engineering/WIRE_CONTRACT.md`), and parts of it are DEAD.
>
> The h1 title above is itself superseded: **the sentinel was never retired from
> publication.** Publication refuses the studio-default pair, deliberately, and
> that is the standing law. What changed is that the pair stopped being magic
> everywhere ELSE in the engine.
>
> Dead on sight, wherever you meet them below: **"geometry wins" / divergence
> (c)** (reverted — the view publishes as stored), the **ENGINE-AUTHORED
> COORDINATE** section and its owner-approved exception (a view computed from
> the features is not an authored location), and every mention of an **accidental
> true positive** or a **place-name flag** (deleted machinery, not repaired).

- **Date:** 2026-08-08.
- **Decision:** — (geolocation emptiness law; DEC-12 gates:
  `test/unit/diffusion_parsers.test.ts` (`parser_geo::geojson`),
  `test/unit/diffusion_ddo_fns.test.ts` (`geojsonPointFallbackLayers`,
  `buildGeojsonLayers`, and the standalone `component_geolocation` atom through
  `defaultPublicationValue`), plus the parity gate
  `test/parity/component_geolocation_features_differential.test.ts` for the
  context half).

Two divergences, one knot: a magic coordinate could only be retired once the
client stopped fabricating one, and the client could only stop once the server
told it where to point the map.

## Divergence (a) — no magic coordinate, and `0` is a real place

### Shape before (PHP)

`component_geolocation::get_diffusion_value_as_geojson` (:362-433) compared the
stored centre, after normalising comma decimals, against the literal pair

```
lat 39.462571 / lon -0.376295          (Valencia — the project's home city)
```

and returned `null` for it: that exact pair MEANT "no location set". The pair
was a sentinel because the client fabricated it — the edit view seeded the map
centre into the component's value at render time and serialised it on every
save, so opening a record and pressing save stored Valencia. Guarding the pair
server-side was the only thing keeping those records out of every publication.

The same code was inconsistent about real emptiness, in both directions:

| stored | PHP / TS-before | published |
|---|---|---|
| `lat 39.462571 / lon -0.376295` | sentinel | nothing |
| `lon: ''` or `lon: null` (`get_diffusion_value_as_geojson`) | `!empty()` → the literal `0` | a point on the prime meridian, invented |
| `lat: 0` or `lon: 0` (`parser_geo::geojson`) | `!$geoObj->lat` → falsy → `null` | nothing — the equator and Greenwich were unpublishable |

So the engine published a coordinate nobody entered, and refused one somebody
did.

### Shape after (TS)

**Absence is structural. There is no sentinel coordinate anywhere in the
engine.**

- `null` / `undefined` / `''` / unparseable text = **no coordinate** → publish
  nothing for that axis, hence nothing for the point.
- Every finite number is a **real coordinate**, `0` included: `[0, 0]`, the
  equator and the prime meridian publish like any other position.
- `lat` and `lon` are needed **together**; one axis alone is absence, never a
  half-point completed with a zero.
- Coordinates arrive as **strings or numbers** in the same column, routinely
  both at once — parsed identically, and `'0'` is a coordinate, not absence.
- `39.462571 / -0.376295` is now an **ordinary coordinate** and publishes as
  the point it is.

Three emission paths carry the law, and the gates hold all three to the same
answers:

| path | before | after |
|---|---|---|
| `geojsonPointFallbackLayers` (`src/diffusion/resolve/ddo_fns.ts`) — the paired text-area `get_geojson_data` point fallback | sentinel → `[]`; `''`/`null` → `[0, …]` | absence → `[]`; every finite pair → one layer |
| `parser_geo::geojson` (`src/diffusion/parsers/parser_misc.ts`) | sentinel → no layer; `0` → no layer | absence → no layer; `0` → a layer |
| standalone `component_geolocation` atom (`src/diffusion/resolve/default_value.ts`) | the stored object RAW, sentinel included — it escaped both guards | no usable coordinate **and** no `lib_data` features → **no atom**; otherwise the value, `id` stripped, unchanged |

Drawn geometry is a value in its own right: an item with no point but with
non-empty `lib_data` features still publishes. That is not a corner case — a
real share of the items centred on the studio default also carry hand-drawn
geometry, and for those the centre is the curator's saved framing of real work.

### Divergence (b) — `context…features.default_view`, a key PHP never emitted

**Shape before (PHP):** `component_geolocation_json.php` (:106-115) emitted

```json
{ "features": { "geo_provider": "VARIOUS" } }
```

There was no default view because the client hardcoded the Valencia centre.

**Shape after (TS):** full context only (`addRequestConfig !== false`; the
"simple" list/portal context still emits no `features` at all):

```json
{
  "features": {
    "geo_provider": "VARIOUS",
    "default_view": { "lat": 20, "lon": 0, "zoom": 2 }
  }
}
```

Additive — `geo_provider` is byte-identical and nothing is removed or
reshaped. Values come from `DEDALO_GEO_DEFAULT_LAT` / `_LON` / `_ZOOM`
(`src/config/config.ts` → `config.geoDefaultView`), overridable per instance by
`properties.default_view`. The override is **all-or-nothing**: `lat`, `lon` and
`zoom` must each be a finite number or the whole override is discarded and the
configured camera is used — a half-specified camera is a config error, not a
blend. `0` is accepted, being finite.

**The camera is a VIEW, never data.** It is where an empty map opens and it is
never written into a record, never published. The 20/0/2 world view is the
default precisely because it cannot be mistaken for a real place; a regional
institution sets all three keys to its region.

### Reason

The sentinel was a workaround for a client defect, and it cost more than it
saved. It made one real place on earth unrecordable in a Cultural Heritage
system whose whole job is recording places — a findspot in Valencia could not
be published — while `!empty` coercion invented points on the prime meridian
and refused points on the equator. Absence has a representation already: no
value. Using it removes the magic pair, the coercion, and the third
unguarded path in one law that all three emission sites can be held to.

The client half is what makes the retirement safe: the edit view no longer
seeds `current_value` at render, the save button now consults a real dirty
signal, and the map's opening position is read from `features.default_view`
instead of being fabricated. A record the cataloguer never touched now saves
nothing.

### Operational constraint — ORDER OF DEPLOY (this is not advice)

**The server guard may only be removed on an install whose stored sentinel
values have already been migrated.** The moment the guard is gone, every
un-migrated sentinel-centred record publishes a FALSE location in Valencia —
in a heritage catalogue, a fabricated findspot.

The ship order is fixed:

1. the client stops fabricating the value;
2. the migration clears the **bare** sentinel items on the install;
3. the server guard is removed.

The migration must NOT clear a sentinel-centred item that carries `lib_data`
features: there the centre is the framing of hand-drawn geometry, and clearing
it destroys curator work. Assume there is **no Time Machine history to restore
from** — there was none on the development copy this was built against — so
clearing is irreversible. That is the intent, and no path here is reversible.

### Gate reconciliation

**No fixture re-harvest, and none is possible (DEC-14b).** The frozen store
(`test/parity/fixtures/oracle_harvest/`, final harvest 2026-07-11) holds no
sentinel-valued geolocation fixture, so no replayed response changes. The
divergence is proven TS-side instead, in the two native gates rewritten with
this change:

- `test/unit/diffusion_parsers.test.ts` — the old
  `PHP default test coordinates → no data` case is replaced by: the ex-factory
  pair publishes as an ordinary coordinate; `0`/`'0'` publish on both axes;
  string and number coordinates are identical; comma decimals still normalise;
  `null`/`''`/missing publish nothing.
- `test/unit/diffusion_ddo_fns.test.ts` — the same table for
  `geojsonPointFallbackLayers` and `buildGeojsonLayers`, plus a new block
  driving the standalone atom through `defaultPublicationValue` (no coordinate
  and no features → no atom; a point → one atom with `id` stripped; drawn
  geometry with no point → still one atom).

`test/parity/component_geolocation_features_differential.test.ts` must stay
green as a **PHP-superset** assertion: `geo_provider` equal to the fixture
byte-for-byte, `default_view` asserted TS-side only. A strict `toEqual` against
the fixture's `features` cannot survive an additive key and must not be
restored.

---

## Addendum 2026-08-09 (first) — geometry WINS over the stored centre, the repair DERIVES a coordinate, the import door, and commit C's ship precondition

> **(!) PARTLY DEAD.** Its divergence (c) was REVERTED and its
> *ENGINE-AUTHORED COORDINATE* section is withdrawn — see the second addendum
> below, which is the current law. Its divergences (d) IMPORT DOOR and
> (e) MONOVALUE, and its corrections to the body's `default_view` and
> gate-reconciliation clauses, stand unchanged.

Adopted 2026-08-09, three closing passes into the same change. The body above is
unchanged; this section is what supersedes it and what it did not yet cover.

### What this addendum supersedes or corrects in the body

| body clause | status on 2026-08-09 |
| --- | --- |
| §Operational constraint — "The migration must NOT clear a sentinel-centred item that carries `lib_data` features" | **SUPERSEDED.** The shipped repair neither clears nor keeps: it **DERIVES** a new centre from the item's own drawn geometry. See *The engine-authored coordinate* below. |
| §Operational constraint step 2 — "the migration clears the **bare** sentinel items on the install" | **AMENDED.** Two stores carry the studio default, not one, and both are authorised: the record store (`matrix`) and the thesaurus store (`matrix_hierarchy`, all under `hierarchy31`). The per-table counts once quoted here are struck — see *Provenance of the measurements* below. |
| §(b) — "`lat`, `lon` and `zoom` must each be a finite number" | **CORRECTED** (this was never true of the shipped code, not a later change). `src/core/resolve/structure_context.ts` accepts a finite number **or a non-blank numeric string** — ontology `properties` JSON quotes numbers routinely, and the client's own predicate coerces — and additionally **range-checks** it: `lat` −90..90, `lon` −180..180, `zoom` 0..22. Anything else makes that member `null`, and the override stays all-or-nothing, so the whole thing falls back to the configured camera. `0` is accepted. An invalid override is discarded **silently** — no `config_warnings` entry is emitted (known-open, ledgered). |
| §Gate reconciliation — "must stay green as a **PHP-superset** assertion … a strict `toEqual` … must not be restored" | **CORRECTED.** The gate in the tree is the WC-001 **by-name lift**: `default_view` is destructured off the TS `features`, asserted TS-side (and asserted ABSENT on the oracle side), and every remaining byte is then compared with a strict `toEqual`. That is stricter than a superset, and it is the shape to keep — a subset/`toMatchObject` match is forbidden, because it would stop seeing a dropped or reshaped `geo_provider`. |

### The ENGINE-AUTHORED COORDINATE — disclosed here because this is the permanent record

The standing law is that the engine NEVER invents a coordinate; only an
operator's own entry may be stored. The repair
(`scripts/repair_geolocation_studio_default.ts`) takes ONE narrow exception, approved
by the project owner on 2026-08-09 and stated in three places by that decision:
the script header, this entry, and
`docs/core/data_model/geolocation.md`.

- **What it does.** For a record whose sentinel-centred item ALSO carries
  hand-drawn geometry, the repair does not clear and does not keep the
  sentinel: it **derives a new `lat`/`lon` as the bbox centre of every feature
  across that item's `lib_data` layers**, and rewrites the item with it.
  Everything else — `zoom`, `alt`, `lib_data`, `id`, any other key — is
  preserved byte for byte. In practice this class is dominated by single drawn
  Points, with a minority of LineStrings, and is confined to the record store —
  the thesaurus store carries no drawn geometry on these items.
- **For a single Point the "derived" centre IS the drawn point** — a
  one-position bbox has its own coordinate as its centre, returned verbatim and
  unrounded when min equals max.
- **Why it is not an invention.** On a record with drawn geometry the stored
  `lat`/`lon` was never an asserted location — it is the map FRAMING saved
  beside the work. Framing that matches the work is honest; keeping the
  sentinel is not neutral, it is a FALSE LOCATION CLAIM (`tchi1/113` draws a
  Point on the Costa Brava, ~400 km from the Valencia centre it would otherwise
  have published). Clearing instead would be safe but lossy: it discards
  framing the operator did choose.
- **It is machine-derived from user-drawn geometry, and it is the ONLY
  coordinate this engine authors anywhere.** If the geometry yields no usable
  position the item is HELD, never guessed.
- **Under divergence (c) below it is not even a published location claim**: on
  a geometry-bearing item the derived centre never reaches the wire.
- **There is NO accidental true positive** (corrected 2026-08-09, superseding
  the claim previously recorded here). `39.462571/-0.376295` is not the city of
  Valencia: it is the **studio default**, the coordinates of the Dédalo
  facilities shipped as the client's factory map position. An item holding
  exactly that pair is therefore always fabricated, and exact equality is a
  sound test — nobody hand-places a point on the studio to six decimals. The
  genuine Valencia toponym is `39.469860091745815/-0.3764533996582032`, a
  different point that no rule here matches; records merely NAMED Valencia that
  carry the default hold it byte-identically, while real geocoded records near
  that latitude carry their own longitudes. The place-name flag built on the
  old premise is therefore meaningless and is scheduled for removal; it is
  still present in `scripts/repair_geolocation_studio_default.ts` at the time
  of writing.
- **Not reversible.** One TM row records the transition, but assume there is
  nothing to restore from. That is the intent.

### Divergence (c) — GEOMETRY WINS in the standalone publication path

**Shape before (PHP):** `component_geolocation` published the stored object as
it stood, so a consumer read the stored `lat`/`lon` as the record's location
even when the item carried drawn geometry. The TS body above kept that shape
(§Shape after: "otherwise the value, `id` stripped, unchanged"), which left the
third emission path disagreeing with the other two.

**Shape after (TS, owner decision 2026-08-09):** in
`src/diffusion/resolve/default_value.ts` the per-item precedence is

1. **drawn geometry** (`lib_data` holds at least one layer whose
   `layer_data.features` is a non-empty array) → publish the GEOMETRY atom:
   the stored object with `id` stripped **and `lat`/`lon` removed**; `zoom`,
   `alt`, `lib_data` and every other key verbatim;
2. else a **point** (`lat` and `lon` both parse — `0` legal, `''`/null/absent
   /unparseable not) → publish the point atom, `id` stripped, otherwise
   verbatim;
3. else **no atom**.

This aligns the third path with `parser_geo::geojson`
(`src/diffusion/parsers/parser_misc.ts`) and `buildGeojsonLayers`
(`src/diffusion/resolve/ddo_fns.ts`), which already let `lib_data` beat the
point. `lat`/`lon` are dropped rather than carried along because this is the
one path that emits them: `valueIrToString` (`src/diffusion/resolve/record_ir.ts`,
case `'geo'`) `JSON.stringify`s the atom into the published cell verbatim, and
a consumer reading `.lat` cannot tell framing from an asserted coordinate.
`zoom`/`alt` stay: no documented consumer reads them as a position, and `alt`
is an operator-editable field.

**CONSEQUENCE, and it is the point of the decision:** stored `lat`/`lon` on a
geometry-bearing record is **FRAMING everywhere in the engine, never a location
claim**. Two things follow, and both are intended — the repair's engine-authored
centre is not a location claim, and a curator panning or zooming a geometry
record updates the framing, which is correct curatorial work rather than a
fabricated coordinate leaking to consumers.

### Divergence (d) — the IMPORT door: absence, refusal, and what a refused cell does NOT do

**Shape before (PHP):** `conform_import_data` / `$conform_item`
(`core/component_geolocation`, :495-702) required `lat` and `lon` to be present
and `is_numeric`, range-checked them, and refused anything else. So a source
item carrying only drawn geometry was REFUSED; a comma-decimal coordinate
(`"39,5"`) was REFUSED, although the publication path normalised the very same
text when reading it back out of the store.

**Shape after (TS)** — `src/core/tools/import_conform.ts` +
`src/core/concepts/geo_coordinate.ts` (the single coordinate leaf both the
import door and the three publication paths read):

- **Absence is structural here too.** The import NEVER fabricates a
  coordinate: no magic centre, no default framing.
- **A geometry-only item is a value.** A source with no coordinate but with
  `lib_data` features conforms to `{lib_data, zoom?, alt?}` — PHP refused it.
- **The two coordinates are needed together**: one axis alone is a malformed
  pair, refused with its own message.
- **Comma decimals normalise** (`"39,5"` → `39.5`), because the store already
  contains them and the publication path already reads them; applying the same
  law at the door is what makes it ONE law instead of two.
- **`0` passes every check unharmed.**
- **The RANGE law lives at this door and only here** (`lat` −90..90,
  `lon` −180..180), enforced by refusing LOUDLY. It is deliberately NOT applied
  at the publication doors: publication emits what is stored, because a silent
  range-drop there is the same failure class the sentinel retirement exists to
  remove.
- **The three outcomes are distinct, and the last two are the whole point:**
  an item; NOTHING to store because the source SAID SO (both coordinate keys
  present and blank, or an item carrying a `lib_data` key) — which clears;
  or REFUSED, which is everything else with no usable coordinate (a typo'd
  header, `{}`, `{latitude,longitude}`, `{zoom:12}`).
- **A refused cell no longer clears the stored value.** `import_execute.ts`
  now skips the whole field when ANY of its values was refused, and pushes an
  extra report line when siblings did conform. Previously a refusal fell
  through to `set_data []`, i.e. a failed cell DELETED the record's stored
  coordinate while the report said the value had been left alone. This is
  model-agnostic (it sits above the conform dispatch) and reaches
  `tool_import_marc21` / `tool_import_zotero` / `tool_import_rdf`; the bulk CSV
  executor already behaved this way. This clause is an ENGINE law and a
  TS-vs-TS correction — the frozen engine's import executor was not re-measured
  for it, so it is recorded as behaviour, not as a PHP divergence.
- `conform.warnings` still reaches no report (`ImportReport` has no `warnings`
  field): the channel is written and discarded. Known-open, ledgered.

### Divergence (e) — MONOVALUE replace on an id-less update (broader than geolocation)

Recorded here because it landed with this change and needs a permanent home; it
is not geolocation-specific and may deserve its own entry if it grows.

**Shape before (PHP):** on an `update` whose change carries no id,
`component_common` APPENDS the value as a new entry and warns
("no id provided. Adding as new entry."); the monovalue registry
(`component_common::$components_monovalue`) is consulted on the INSERT branch
only.

**Shape after (TS):** `src/core/section/record/save_component.ts` ports that
registry as `MONOVALUE_MODELS` (verbatim, 15 models) and, in the non-lang-sliced
branch ONLY, an id-less update against a component that already holds exactly
one object item **replaces element 0** (inheriting its id) instead of appending.
An empty array still appends (the first save must create the item), more than
one stored item still appends (dirty legacy data is never touched), and an id
that resolves nowhere still appends. Effect: a monovalue component's array
cannot grow past one item through repeated saves — the value-doubling class that
this file's own header already names for `component_publication`.

### SHIP-ORDER PRECONDITION for commit C — the constraint that blocked this change

**The server guard may only be removed on an install where EVERY stored
sentinel has already been migrated — `matrix` AND `matrix_hierarchy`.** This
supersedes nothing in the body; it makes its ship order concrete, because the
body counted one table and the install has two.

The moment the guard is gone, an un-migrated item holding the studio default
publishes it as a FALSE location. Both stores are affected:

- `matrix`, the record store;
- `matrix_hierarchy`, the thesaurus store — every item under the single tipo
  `hierarchy31`, which every thesaurus section inherits from the shared
  `section_group` `hierarchy29` (which is why an iconography descriptor carries
  coordinates at all). A large share of these publish through the `ts` table's
  `space` column (`hierarchy72` ← `hierarchy31`) and its thesaurus aliases, so
  un-migrated, commit C makes the engine assert that the iconographic
  descriptor "kneeling" is located at the studio, along with every affected
  toponym.

The order is therefore: (1) the client stops fabricating; (2) the repair runs on
**both** tables; (3) the guard is removed. The repair refuses `--apply` on any
table not in its `APPLY_ADJUDICATED` list, and membership is a written decision
about which tipos hold geolocation values — not an edit to the constant, and
not a count.

### Provenance of the measurements — read before quoting any number here

Every figure this entry once carried (item totals, per-verdict splits, the
publish counts, the "four distinct byte-values / `alt` 16 on 100 %" fabrication
signature, the Time Machine zero) was measured against **`dedalo_mib_v7`**,
which the project owner has identified as a **dirty development copy**: a site
copy carrying local edits, not a canonical install.

Those numbers described one database on one day. They are **not** a population
characterisation, **not** an expected value, and **not** a gate. Another install
will differ, and a differing count is information, not a failure — nobody should
reconcile a dry-run against a number remembered from here. The figures have been
struck from this entry rather than re-measured, because no canonical install was
available to re-measure against.

What survives the provenance problem, because it is structural rather than
statistical: the studio default is fabricated wherever it appears; both stores
carry it; `hierarchy31` is the single thesaurus tipo involved; and the thesaurus
`space` column publishes it. Those hold regardless of counts.

### Gate reconciliation (addendum)

**Still no fixture re-harvest, and none is possible (DEC-14b).** The frozen
store (`test/parity/fixtures/oracle_harvest/`, final harvest 2026-07-11) holds
no sentinel-valued geolocation fixture and no geometry-bearing publication
fixture on the standalone atom path, so no replayed response changes. Every
divergence in this addendum is proven TS-side:

- **(c)** `test/unit/diffusion_geo_precedence.test.ts` — the three-path
  agreement gate: geometry wins and the centre is dropped (key set AND the
  stringified wire, which must contain neither `"lat"` nor `"lon"`), the
  `tchi1/113` ex-sentinel case, centre-only, `0/0`, absence, empty/featureless
  `lib_data` falling through to the point. Mutation-checked (keeping the
  centre → 4 fail). Plus the existing `default_value` geo block in
  `test/unit/diffusion_ddo_fns.test.ts`.
- **(d)** `test/unit/import_conform.test.ts` (the conform law) and
  `test/unit/import_execute_refusal.test.ts` (the write half: a refused cell
  leaves the stored item byte-identical; an explicit empty still clears).
  Coordinate parsing/range: `test/unit/geo_coordinate.test.ts`.
- **(e)** `test/unit/save_component_geolocation_item_id.test.ts` — two saves
  leave ONE item, multi-value models still append.
- **the repair** — `test/unit/geolocation_studio_default_repair.test.ts` (predicates,
  the derived centre, the FLAGGED predicate) and
  `test/unit/geolocation_studio_default_repair_apply.test.ts` (the destructive half on
  a scratch surface: the CLEAR, the TM row, the DERIVE write, the re-adjudicate-
  under-lock refusals, the CLI refusals, and `APPLY_ADJUDICATED` pinned to
  `['matrix', 'matrix_hierarchy']` with a provenance block required per entry).
- **the context half** — `test/parity/component_geolocation_features_differential.test.ts`
  (the by-name lift described above) plus the native
  `test/unit/structure_context_geolocation_features.test.ts`, which owns the
  `default_view` validity law including the numeric-string and range clauses.

---

## Addendum 2026-08-09 (second) — the settled model: the VIEW and the FEATURES are independent, and the view publishes

Adopted 2026-08-09 by the project owner, after this entry described the repo
wrongly three times. **This section is the current law.** Where it disagrees with
anything above, it wins.

### THE MODEL — say it this way everywhere

`component_geolocation` stores, per item: `{id?, lat, lon, zoom, alt?, lib_data?}`.

- **`lat`/`lon`/`zoom` are THE VIEW** — the map framing, and nothing more. A view
  is NOT the position of a feature: an operator frames the space they need to
  see, and with several points, or context drawn around one, the useful frame is
  often nowhere near any single feature. It is manually controlled.
- **`lib_data` holds the FEATURES** — drawn geometry.
- **The two are INDEPENDENT.** Features do not determine the view, and the view
  asserts no feature.
- **`alt` is real data** some installs use. It is never deleted, except as part
  of removing a default-only item.

The operator loop the code serves: panning/zooming changes the VIEW and the
lat/lon/zoom inputs track it LIVE (that readout is how an operator approximates
a position and sanity-checks bad manual data); the `map_point` button reads those
inputs and CREATES A FEATURE. Gesture changes the view, button creates a feature,
and **both are savable**.

### What is DEAD in the sections above

| clause | status |
| --- | --- |
| **Divergence (c) — GEOMETRY WINS in the standalone publication path** (first addendum) | **REVERTED, do not restore.** `lat`/`lon` are NOT dropped when the item carries features. The view publishes as stored; publication has read it since the first implementation and for many records it is the only positional data that exists. The revision that dropped it changed published bytes and was backed out. |
| **The ENGINE-AUTHORED COORDINATE** section + the "ONE narrow exception", the owner-approved-exception framing and its three-place disclosure (first addendum) | **WITHDRAWN.** Computing a view from the item's own features is not authoring a location — it is what a view is for. There is no engine-authored-coordinate exception anywhere in this engine. The repair's verdict is now `FIT_VIEW` (`fitViewToGeometry`), and the `tchi1/113` "false location claim ~400 km away" rationale goes with it. |
| **"There is NO accidental true positive"** as a *clause about place names*, and the **place-name flag** recorded as "still present in the script" (first addendum) | **DEAD MACHINERY, DELETED not repaired.** The premise stands and needs no defence: the pair is a factory default, not a place, so a record merely NAMED after the studio's city holds a fabricated view like any other. `SENTINEL_PLACE_NAMES`, `foldPlaceName`, `namesSentinelPlace`, `flaggedUnits`, the FLAGGED report sections and the `string::text` read that fed them are gone from `scripts/repair_geolocation_studio_default.ts`; a source-scanning tripwire in `test/unit/geolocation_studio_default_repair.test.ts` fails if any of them reappears. The repair no longer reads record text at all. |
| the h1 title's **"the Valencia sentinel is retired"**, and the body's **"There is no sentinel coordinate anywhere in the engine"** / "`39.462571 / -0.376295` is now an ordinary coordinate and publishes as the point it is" | **CORRECTED.** The pair was never retired from publication. See *The publication law* below: it is refused at the publication door, and is an ordinary coordinate everywhere else. |
| the body's **§Operational constraint** and the first addendum's **SHIP-ORDER PRECONDITION for commit C** | **MOOT as a blocker.** There is no guard-removal commit to sequence: the publication refusal is permanent law, not a temporary shim. The repair still runs on both stores (`matrix`, `matrix_hierarchy`) because a fabricated view is fabricated data — but publication is safe before, during and after it. |

### The publication law — CURRENT, and it is not a temporary state

Single definition: `isStudioDefault()` in `src/core/concepts/geo_coordinate.ts`.
Read at the publication door ONLY.

1. **The VIEW publishes, as stored.** `lat`/`lon`/`zoom` go out whether or not
   the item also carries features. Nothing is dropped, reordered or reshaped.
2. **The STUDIO DEFAULT (`lat 39.462571 / lon -0.376295`) never publishes.**
   Those are the Dédalo facilities' own coordinates, shipped as the client's
   factory map position; the v6 client wrote them on save whether or not anyone
   touched the map, so an item holding exactly that pair is fabricated. It is
   withheld at this one door and nowhere else.
3. **An item whose view is the default but which carries real features still
   publishes the features** — only the fabricated pair is withheld
   (`src/diffusion/resolve/default_value.ts` emits the atom without `lat`/`lon`
   in that case; every other key is verbatim).
4. **`0` is a REAL coordinate** and publishes. **Absence is structural**:
   `null` / `undefined` / `''` / blank / unparseable text publishes nothing, and
   a missing axis is never completed with a zero.
5. **Everywhere OTHER than this door the studio-default pair is an ordinary
   coordinate** — stored, edited, searched and migrated like any other.

The three paths that carry it: `src/diffusion/parsers/parser_misc.ts`
(`parser_geo::geojson`), `src/diffusion/resolve/ddo_fns.ts`
(`geojsonPointFallbackLayers` / `buildGeojsonLayers`) and
`src/diffusion/resolve/default_value.ts` (the standalone atom).

### PUBLISHED BYTES CHANGE — `0` on the equator and the prime meridian

Stated plainly because it is the one clause here that moves the wire for records
that already exist:

**Before**, the guards were falsy-based (`!$geoObj->lat`, `!empty()`), so a
stored `lat: 0` or `lon: 0` was read as emptiness and the record published NO
position — while `lon: ''`/`null` was coerced to the literal `0` and published a
point on the prime meridian that nobody entered.

**Now**, `0` and `'0'` parse as the coordinates they are and publish; absence
publishes nothing and is never completed with a zero. So a record on the equator
or the prime meridian that published nothing yesterday publishes a position
today, and a record with a blank axis that published an invented `0` stops doing
so. **This is deliberate**, it needs no per-install decision, and it is the
whole point of making absence structural: a Cultural Heritage engine cannot have
a place on earth it is unable to record.

Known-open consequence on the install measured for this work: the `es1`
`hierarchy31` **zero cluster** (Spanish toponyms stored at `0/0`) is fabricated
data that this law certifies as real and therefore publishes. It is a curatorial
data question, deliberately NOT folded into the studio-default predicate, and it
is ledgered as a known-open gap (`rewrite/LEDGER.md`).

### The repair, and the v6 migration — what they actually do

Both sides converged on the same vocabulary independently.

- `scripts/repair_geolocation_studio_default.ts` (v7, `--table` + `--user`
  mandatory, dry-run by default, `--apply` refused on any table not adjudicated
  in writing) adjudicates a component's WHOLE item list into one of three
  verdicts — `CLEAR`, `FIT_VIEW`, `HOLD` — plus "no verdict" for anything it does
  not recognise:
  **default-only item → `CLEAR`**, the item removed entire (`alt` included — a
  default-only item is fabricated in its entirety); **default view + features →
  `FIT_VIEW`**, the view rewritten to the bbox centre of every feature across the
  item's `lib_data` layers, with features, `zoom`, `alt`, `id` and every other key
  untouched (for a single drawn Point the fitted view IS that point, verbatim and
  unrounded when min equals max); **anything else → UNTOUCHED**.
  `HOLD` has TWO reasons, and the first is easy to miss:
  · `MIXED` — a default-only item sharing the component with any other item. The
    write is `updateMatrixKeysData` on the component's key, which is
    all-or-nothing, so removing one item of several is not expressible: the whole
    component is left alone. **A multi-item install therefore sees a no-op on
    exactly the records the sweep exists for**, reported as HELD, and needs a
    different tool or a curatorial decision.
  · `NO_POSITION` — features from which no coordinate can be extracted; the view
    is never guessed.
- The **v6 migration** (`close_v6_prepare_v7`) does the same and nothing more,
  reporting `GEOLOCATION_DEFAULT_ITEM_REMOVED`,
  `GEOLOCATION_VIEW_FITTED_TO_GEOMETRY`, `GEOLOCATION_DEFAULT_ITEM_MIXED` and
  `GEOLOCATION_GEOMETRY_NO_POSITION` (API: `STUDIO_DEFAULT_LAT/LON`,
  `is_studio_default_view`, `fit_view_to_geometry`). A 27-case offline
  differential across both sides agrees 27/27, lat/lon order included.
- **History is never repaired.** The Time Machine pass rewrites nothing; a TM row
  whose payload is ONLY the default view is DELETED, and a row carrying features
  or a real coordinate is kept.

Neither side is reversible; assume there is nothing to restore from. Neither
stamps `dd197`/`dd201` — a mechanical sweep is not an edit.

### Gate reconciliation (second addendum)

**Still no fixture re-harvest, and none is possible (DEC-14b).** The frozen store
holds no studio-default geolocation fixture and no geometry-bearing fixture on
the standalone atom path, so no replayed response changes. TS-side:

- `test/unit/diffusion_geo_precedence.test.ts` — the three-path agreement gate,
  now asserting that the VIEW SURVIVES beside features and that only the studio
  default is withheld.
- `test/unit/geo_coordinate.test.ts` — the parse/range law, `0` included.
- `test/unit/diffusion_parsers.test.ts`, `test/unit/diffusion_ddo_fns.test.ts` —
  the other two publication paths against the same table.
- `test/unit/geolocation_studio_default_repair.test.ts` (predicates, the fitted
  view, `alt`, and the source-scanning tripwire that keeps the place-name
  machinery deleted) + `test/unit/geolocation_studio_default_repair_apply.test.ts`
  (the destructive half on a scratch surface). Both files were RENAMED with the
  script; the first addendum's `geolocation_sentinel_repair*` names are dead.
- `test/parity/component_geolocation_features_differential.test.ts` +
  `test/unit/structure_context_geolocation_features.test.ts` — the context half,
  unchanged by this addendum.
- The client half: `COMPONENT_GEOLOCATION SETTING THE VIEW IS DATA` in
  `client/dedalo/test/client/js/test_component_geolocation.js` (9 cases). The
  old "NAVIGATION IS NOT DATA ENTRY" suite and the `update_input_values` intent
  guard it defended are deleted: a gesture that changes the view is the operator
  acting, and it is savable.
