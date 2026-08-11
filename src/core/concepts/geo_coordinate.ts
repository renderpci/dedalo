/**
 * THE geo-coordinate law. ONE predicate for every door: the import door
 * (src/core/tools/import_conform.ts) and the three publication paths
 * (src/diffusion/resolve/{geo_coordinate,default_value,ddo_fns}.ts,
 * src/diffusion/parsers/parser_misc.ts). LEAF module: no imports, so it is
 * reachable from core AND diffusion without an SCC (import_scc_tripwire).
 *
 * PARSE LAW — absence is STRUCTURAL:
 *   null / undefined / '' / blank / unparseable text = NO coordinate.
 *   0 and '0' ARE coordinates (the equator, the prime meridian, Null Island).
 *   Comma decimals normalize ('39,5' -> 39.5), as the PHP oracle does in the
 *   publication path (class.component_geolocation.php :388-389
 *   str_replace(',', '.', …)). Dropping that would stop a legacy comma-decimal
 *   store from publishing, so the normalization is oracle parity, not taste;
 *   applying it on import too is what makes this ONE law instead of two
 *   ('39,5' used to publish but be refused on import).
 *   Multi-comma text ('3,1,4') stays unparseable.
 * There is no magic coordinate: the ex-factory Valencia pair
 * (39.462571/-0.376295) that once meant "no location set" is an ordinary point.
 *
 * RANGE LAW — and where it applies, which is the deliberate part:
 *   a latitude is -90..90, a longitude is -180..180. This is enforced at the
 *   INPUT door only, where an out-of-range value is REFUSED LOUDLY (the import
 *   row is reported in `failed` and the stored value is left alone).
 *   It is NOT applied at the publication doors: publication must emit what is
 *   stored. Range-gating there would SILENTLY DROP a stored location — the
 *   exact failure class the sentinel retirement exists to remove — and would
 *   diverge from the oracle, which range-checks nothing. Garbage in the store
 *   is a repair job, never a silent publication drop.
 *   (Measured dedalo_mib_v7 2026-08-08: 0 of 229 406 stored geo items carry an
 *   out-of-range or comma-decimal coordinate. Both clauses are law, not a
 *   description of the data.)
 *
 * The matrix stores coordinates MIXED: 607 of 1803 matrix items as strings,
 * 1196 as numbers. Both are the normal case.
 *
 * Gate: test/unit/geo_coordinate.test.ts.
 */

/** Which axis a value is claimed to be, for the range law. */
export type CoordinateAxis = 'lat' | 'lon';

const AXIS_LIMIT: Record<CoordinateAxis, number> = { lat: 90, lon: 180 };

/**
 * The ONE parser. Returns the coordinate as a number, or null when the raw
 * value states no coordinate at all. No range opinion here — see the RANGE LAW.
 */
export function parseCoordinate(raw: unknown): number | null {
	if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
	if (typeof raw !== 'string') return null;
	const text = raw.trim().replace(/,/g, '.');
	if (text === '') return null;
	const value = Number(text);
	return Number.isFinite(value) ? value : null;
}

/** True only when `raw` is a real, finite coordinate. 0 and '0' are TRUE. */
export function hasCoordinate(raw: unknown): boolean {
	return parseCoordinate(raw) !== null;
}

/** The coordinate as a number. Call only when hasCoordinate(raw) is true. */
export function toCoordinate(raw: unknown): number {
	return parseCoordinate(raw) ?? Number.NaN;
}

/**
 * The RANGE LAW for one axis. False for a value that is not a coordinate at
 * all, so a caller can use it as the single admission test at an input door.
 */
export function isCoordinateInRange(raw: unknown, axis: CoordinateAxis): boolean {
	const value = parseCoordinate(raw);
	if (value === null) return false;
	const limit = AXIS_LIMIT[axis];
	return value >= -limit && value <= limit;
}

/**
 * The STUDIO DEFAULT — the coordinates of the Dédalo facilities, shipped as the
 * client's factory map position.
 *
 * Until the client was fixed, the edit view seeded this pair into the record at
 * render and the save button asked no questions, so merely opening a record and
 * saving stored a position nobody chose. An item holding EXACTLY this pair is
 * therefore fabricated: nobody hand-places a map on the studio to six decimals,
 * and a genuinely positioned record carries its own coordinates.
 *
 * The pair is not magic anywhere else — it is an ordinary coordinate, stored and
 * edited like any other. It is refused at ONE door only: publication never emits
 * a fabricated position to a consumer.
 */
const STUDIO_DEFAULT_LAT = 39.462571;
const STUDIO_DEFAULT_LON = -0.376295;

/** True when the pair is exactly the studio default. Publication refuses it. */
export function isStudioDefault(lat: number, lon: number): boolean {
	return lat === STUDIO_DEFAULT_LAT && lon === STUDIO_DEFAULT_LON;
}
