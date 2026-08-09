# WC-2026-08-08-geolocation-emptiness-explicit — geolocation absence is structural: the Valencia sentinel is retired and the opening camera becomes `features.default_view`

> **(!) PARTLY SUPERSEDED — read the `## Addendum 2026-08-09` at the end before
> acting on this entry.** The body below is the divergence as ADOPTED on
> 2026-08-08 and is kept verbatim (amendment rule, `engineering/WIRE_CONTRACT.md`).
> The addendum supersedes its migration policy (§Operational constraint: the
> repair DERIVES, it does not hold), corrects its `default_view` validity and
> gate-reconciliation clauses, and adds three further divergences that did not
> exist when it was written.

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

## Addendum 2026-08-09 — geometry WINS over the stored centre, the repair DERIVES a coordinate, the import door, and commit C's ship precondition

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
- **the repair** — `test/unit/geolocation_sentinel_repair.test.ts` (predicates,
  the derived centre, the FLAGGED predicate) and
  `test/unit/geolocation_sentinel_repair_apply.test.ts` (the destructive half on
  a scratch surface: the CLEAR, the TM row, the DERIVE write, the re-adjudicate-
  under-lock refusals, the CLI refusals, and `APPLY_ADJUDICATED` pinned to
  `['matrix', 'matrix_hierarchy']` with a provenance block required per entry).
- **the context half** — `test/parity/component_geolocation_features_differential.test.ts`
  (the by-name lift described above) plus the native
  `test/unit/structure_context_geolocation_features.test.ts`, which owns the
  `default_view` validity law including the numeric-string and range clauses.
