/**
 * ============================================================================
 * GEOLOCATION STUDIO-DEFAULT REPAIR — clears the coordinates the CLIENT
 * fabricated from its factory map position.
 * ============================================================================
 *
 * WHAT IS BROKEN
 * component_geolocation stored {lat, lon, zoom, alt, lib_data?} in the matrix
 * `geo` column. Until the client fix, the edit view SEEDED self.current_value[0]
 * at render with a hardcoded map centre — the STUDIO DEFAULT, lat 39.462571 /
 * lon -0.376295, the Dédalo facilities' own position shipped as the client's
 * factory map centre — and the save button consulted no dirty signal. So merely
 * OPENING a record and pressing save wrote a location the operator never
 * entered. Server-side that pair was then read back as a MAGIC SENTINEL
 * ("no location set, do not publish"), hardcoded in the diffusion paths.
 *
 * The new law: absence is STRUCTURAL — null/''/unparseable = no coordinate,
 * 0 is a legal coordinate, and there is NO magic coordinate. Once the sentinel
 * guard is gone, every un-migrated record publishes the studio's own position
 * as if it were a real location. Ship order is:
 *   (A) client stops fabricating → (B) THIS SCRIPT → (C) guard removal.
 * This script imports NOTHING from src/diffusion: commit B must run before
 * commit C exists. The coordinate normalization it needs is inlined below,
 * for the same reason SENTINEL_LAT/LON are.
 *
 * ============================================================================
 * (!) ENGINE-AUTHORED COORDINATE — a deliberate, owner-approved exception
 * ============================================================================
 * The standing law is that the engine NEVER invents a coordinate; only an
 * operator's own entry may be stored. This repair takes ONE narrow, explicit
 * exception, approved by the project owner on 2026-08-09:
 *
 *   For a record whose sentinel-centred item ALSO carries hand-drawn geometry,
 *   the repair does not clear and does not keep the sentinel: it DERIVES a new
 *   lat/lon as the BBOX CENTRE of every feature across that item's lib_data
 *   layers, and rewrites the item with it. Everything else — zoom, alt,
 *   lib_data, id, any other key — is preserved byte-for-byte.
 *
 * WHAT IS DERIVED: a centre point, computed from the operator's OWN drawn
 * geometry. For a single drawn Point — the commonest case by far — that is
 * EXACTLY the drawn point (a one-position bbox has its own coordinate as its
 * centre; the code returns the position verbatim, unrounded, when min === max).
 *
 * WHY, AND WHY IT IS NOT AN INVENTION: on a record with drawn geometry the
 * stored lat/lon was never an asserted location — it is the map FRAMING the
 * client saved alongside the work. Framing that matches the work is honest.
 * Keeping the factory pair instead is not neutral: it asserts the studio's
 * position for a record whose drawn work is somewhere else entirely — commonly
 * hundreds of kilometres away. Clearing lat/lon instead would be safe but
 * lossy: it discards framing the operator did choose. (Since GEOMETRY WINS
 * landed, the centre of a geometry-bearing item no longer reaches the wire at
 * all, so this is about honest stored framing, not about publication.)
 *
 * THIS COORDINATE IS NOT USER-ENTERED. It is machine-derived from user-drawn
 * geometry, and it is the ONLY coordinate this engine authors anywhere. It is
 * recorded as such here, in the wire-contract entry, and in the docs. If the
 * geometry yields no usable position the item is HELD, never guessed.
 *
 * WHY A SCRIPT, NOT ONE UPDATE
 * The pair alone does not tell you what to DO with an item. A real share of
 * the items centred on the studio default carry REAL hand-drawn geometry (a
 * lib_data layer with a non-empty FeatureCollection — e.g. an 11-vertex
 * LineString), and that work must survive the repair. A blanket
 * `WHERE lat = 39.462571` DESTROYS that work. The candidate test must inspect
 * lib_data per item — and coordinates are stored MIXED, as strings AND as
 * numbers in the same column, so every comparison normalizes first.
 * The predicates are exported and gated: test/unit/geolocation_studio_default_repair.test.ts.
 *
 * NOT REVERSIBLE — BE HONEST
 * One recordTimeMachine row per repaired component records the TRANSITION. It
 * does NOT make the old value restorable: on the development copy this was
 * built against, matrix_time_machine held NO row carrying the studio default.
 * Do not read that as a guarantee for other installs — assume there is nothing
 * to restore from, and nothing to purge (hence no --purge-tm flag). Clearing is
 * irreversible and that is the intent.
 *
 * ============================================================================
 * (!) THERE IS NO ACCIDENTAL TRUE POSITIVE — corrected 2026-08-09
 * ============================================================================
 * 39.462571/-0.376295 is NOT "the city of Valencia". It is the STUDIO DEFAULT:
 * the coordinates of the Dédalo facilities, shipped as the client's factory
 * map position. An item holding EXACTLY that pair is therefore always
 * fabricated — nobody hand-places a point on the studio to six decimals — and
 * exact equality is a sound fabrication test.
 * Evidence: the records NAMED Valencia that carry the pair hold it
 * byte-identically (alt 16, zoom 12), while genuinely geocoded records near
 * that latitude carry their own longitudes (39.4698345/-0.60785824;
 * 39.46982/21.82482 in Greece; 39.46984/-31.18514 in the Azores). The real
 * Valencia toponym is 39.469860091745815/-0.3764533996582032 — a different
 * point, which no rule here matches.
 *
 * (!) STALE MECHANISM STILL IN THIS FILE: namesSentinelPlace /
 * SENTINEL_PLACE_NAMES and the FLAGGED report path were built on the false
 * premise above. They are scheduled for removal, not for repair. Until they
 * are gone this header describes code that exists; do not treat the flag as
 * meaningful, and do not extend it.
 *
 * MODIFIED STAMPS — DELIBERATELY NOT WRITTEN
 * Every component write through the save pipeline also stamps the record's
 * dd197/dd201 modified-by/modified-date. This repair does NOT, and that is a
 * decision, not an oversight. A mechanical sweep is not an edit: stamping it
 * would overwrite the real curation signal ("who last worked this record, and
 * when") on every repaired record with a bulk timestamp, which is precisely
 * the harm save_component's own `skipModifiedStamp` flag exists to avoid on
 * the import path. The transition IS audited — one matrix_time_machine row per
 * repaired component, attributed to the MANDATORY --user (there is no default:
 * a falsified actor on an irreversible sweep is worse than a refusal to run).
 *
 * ============================================================================
 * WHAT THIS SCRIPT DELIBERATELY DOES NOT TOUCH
 * ============================================================================
 * The ZERO CLUSTER: es1 hierarchy31 items stored at lat 0 / lon 0 (about a
 * thousand on the development copy this was built against — treat the figure as
 * illustrative, not as a population count). That is a SECOND fabrication
 * cluster (Null Island, published through tp_spain),
 * and under the new law 0 is a LEGAL coordinate — so it is indistinguishable,
 * mechanically, from a deliberate one. It is NOT in the sentinel predicate and
 * never will be: conflating two fabrications is how the first one stayed hidden
 * for years. It is a separate curatorial decision, ledgered as a known-open gap
 * (rewrite/LEDGER.md, "geolocation zero cluster").
 *
 * SCOPE + SAFETY
 * - `--table` and `--user` are BOTH MANDATORY. There is no "sweep everything"
 *   invocation. Only tables in APPLY_ADJUDICATED accept --apply; every
 *   allowlisted table accepts the read-only dry-run, which is how the evidence
 *   for an adjudication gets gathered.
 * - Tipos come from the ONTOLOGY (dd_ontology model='component_geolocation'),
 *   never a hardcoded list.
 * - HELD, never touched: a bare sentinel item sharing the component with a real
 *   item (MIXED — key removal is all-or-nothing), and drawn geometry from which
 *   no position can be extracted (NO_POSITION).
 * - Writes go through updateMatrixKeysData(…, 'geo', tipo, …): the `#-`
 *   key-removal form (CLEAR) and the single-key set form (DERIVE) touch ONLY
 *   this component's key, so a concurrent write to another component in the
 *   same column is never clobbered. NEVER updateMatrixRecord.
 * - TOCTOU CLOSED: discovery is an unlocked scan, so the verdict it produces is
 *   a PLAN, never an authority to write. Inside the per-record transaction the
 *   key is re-read under a FOR UPDATE row lock (readMatrixKeyForUpdate) and
 *   adjudicated AGAIN on the freshly locked value; the write uses the locked
 *   items, not the scanned ones. A coordinate committed between the scan and
 *   the write makes the verdict change, and the record is SKIPPED and reported
 *   as "changed under us" — never silently destroyed.
 * - 0 affected rows = the record was deleted underneath us: FAIL LOUD.
 * - After --apply the discovery re-runs and the gate compares held/derived
 *   IDENTITIES, not counts. Not green ⇒ EXIT 1 (a printed warning is not a gate).
 *
 * USAGE (dry-run is the default; it lists every candidate, derivation and hold):
 *
 *     bun scripts/repair_geolocation_studio_default.ts --table matrix --user 1
 *     bun scripts/repair_geolocation_studio_default.ts --table matrix --user 1 --apply
 */

// Side-effect: registers the component-model lookup the ontology resolver
// requires (standalone scripts must do what the server entrypoint does).
import '../src/core/components/registry.ts';
import { dbTimestamp } from '../src/core/db/db_timestamp.ts';
import { searchDdOntology } from '../src/core/db/dd_ontology.ts';
import { MATRIX_TABLE_ALLOWLIST } from '../src/core/db/matrix.ts';
import { readMatrixKeyForUpdate, updateMatrixKeysData } from '../src/core/db/matrix_write.ts';
import { sql, withTransaction } from '../src/core/db/postgres.ts';
import { recordTimeMachine } from '../src/core/db/time_machine.ts';

/**
 * The ex-factory client map centre. Defined HERE, not imported: the diffusion
 * guard that used to hold it is DELETED by commit C, and this one-shot repair
 * must keep matching the historical fabricated value regardless.
 */
const SENTINEL_LAT = 39.462571;
const SENTINEL_LON = -0.376295;

/** geolocation is not translatable — its TM rows are stamped lg-nolan. */
const GEO_LANG = 'lg-nolan';

/**
 * Tables this script is allowed to WRITE. Membership is a decision about the
 * SHAPE of the data (which tipos hold geolocation values, and that the studio
 * default is fabricated wherever it appears) — never about a count.
 *
 *  - `matrix` — the record store: numisdata264 / tchi25 / numisdata213 / rsc900.
 *  - `matrix_hierarchy` — the thesaurus store, all under the single tipo
 *    `hierarchy31`, which every thesaurus section inherits from the shared
 *    section_group hierarchy29 (which is why "kneeling" and "Alabama" carry
 *    coordinates at all). Owner-authorised 2026-08-09.
 *
 * (!) COUNTS ARE NOT AN AUTHORISATION, AND THE ONES ONCE QUOTED HERE WERE NOT
 * REPRESENTATIVE. Every figure in this file's history (281 / 251 / 30 /
 * 53 509 / 4 104 / the "four distinct byte-values, alt 16 on 100 %" signature)
 * was measured against `dedalo_mib_v7`, which the owner has since identified as
 * a DIRTY DEVELOPMENT COPY: a site copy carrying local edits, not a canonical
 * install. Those numbers described that one database on that one day. They are
 * not a population characterisation, not an expected value, and not a gate:
 * another install will differ, and a differing count is information, not a
 * failure. Read the dry-run, do not reconcile it against a remembered number.
 */
const APPLY_ADJUDICATED: readonly string[] = ['matrix', 'matrix_hierarchy'];

interface Args {
	apply: boolean;
	userId: number;
	table: string;
}

function usage(message: string): never {
	console.error(`repair_geolocation_studio_default: ${message}`);
	console.error(
		'usage: bun scripts/repair_geolocation_studio_default.ts --table <name> --user <id> [--apply]',
	);
	console.error(`  --table  MANDATORY, one of: ${MATRIX_TABLE_ALLOWLIST.join(', ')}`);
	console.error(`           --apply is accepted only for: ${APPLY_ADJUDICATED.join(', ')}`);
	console.error('  --user   MANDATORY, the operator id stamped on every time-machine row');
	process.exit(1);
}

export function parseArgs(argv: string[]): Args {
	let apply = false;
	let userId: number | null = null;
	let table: string | null = null;
	for (let index = 0; index < argv.length; index++) {
		const arg = argv[index];
		switch (arg) {
			case '--apply':
				apply = true;
				break;
			case '--user': {
				const value = Number(argv[++index]);
				if (!Number.isInteger(value) || value <= 0) usage('--user must be a positive integer');
				userId = value;
				break;
			}
			case '--table': {
				const value = argv[++index] ?? usage('--table needs a table name');
				if (!MATRIX_TABLE_ALLOWLIST.includes(value)) usage(`table '${value}' is not allowlisted`);
				table = value;
				break;
			}
			default:
				usage(`unknown argument '${arg}'`);
		}
	}
	// MANDATORY, both. There is no implicit scope and no implicit actor on a
	// sweep that destroys heritage data irreversibly.
	if (table === null) usage('--table is mandatory (there is no sweep-everything invocation)');
	if (userId === null) usage('--user is mandatory (time-machine attribution is never guessed)');
	if (apply && !APPLY_ADJUDICATED.includes(table)) {
		// NOT "edit the constant". Editing it is the LAST step of an adjudication,
		// and the constant carries the evidence for every table already in it —
		// an entry without that provenance block is the refusal defeating itself.
		usage(
			`--apply is not authorised for table '${table}': its sentinel population has not been ` +
				'adjudicated. An adjudication is a written, measured artifact — the population shape, ' +
				'the geometry/mixed/time-machine counts, what publishes today — reviewed by a human ' +
				'and recorded as the provenance block beside APPLY_ADJUDICATED, with the expected ' +
				'clear/derive/held split. Until that exists, dry-run only: it is how the evidence ' +
				'gets gathered.',
		);
	}
	return { apply, userId, table };
}

// ---------------------------------------------------------------------------
// THE CANDIDATE TEST — the load-bearing part. A false positive here is
// unrecoverable data loss (30 records of hand-drawn geometry depend on it).
// Exported and gated by test/unit/geolocation_studio_default_repair.test.ts.
// ---------------------------------------------------------------------------

/**
 * Comma-decimal → dot, as text; non string/number → null. Inlined (not imported
 * from the diffusion leaf) so commit B runs before commit C exists — the same
 * reason SENTINEL_LAT/LON are literals here.
 */
function normalizeCoordinate(raw: unknown): string | null {
	if (typeof raw === 'number') return Number.isFinite(raw) ? String(raw) : null;
	if (typeof raw !== 'string') return null;
	const text = raw.trim().replace(/,/g, '.');
	return text === '' ? null : text;
}

/** Canonical decimal text of a stored coordinate, or null when there is none. */
export function coordKey(raw: unknown): string | null {
	const text = normalizeCoordinate(raw);
	if (text === null) return null;
	const value = Number(text);
	return Number.isFinite(value) ? String(value) : null;
}

const SENTINEL_LAT_KEY = String(SENTINEL_LAT);
const SENTINEL_LON_KEY = String(SENTINEL_LON);

/** True iff BOTH coordinates normalize to exactly the fabricated pair. */
export function isSentinelCentred(item: Record<string, unknown>): boolean {
	return coordKey(item.lat) === SENTINEL_LAT_KEY && coordKey(item.lon) === SENTINEL_LON_KEY;
}

// ---------------------------------------------------------------------------
// (!) DEAD MECHANISM — SCHEDULED FOR REMOVAL. See the header correction.
// Built on the false premise that 39.462571/-0.376295 is "the city of
// Valencia" and could therefore be a record's correct coordinate. It is the
// STUDIO DEFAULT — the Dédalo facilities' own position, the client's factory
// map centre — so an item holding it exactly is always fabricated and there is
// no true positive to flag. Do not extend this; do not rely on its output.
// ---------------------------------------------------------------------------

/**
 * Place names once treated as "the sentinel's own place". Retained only until
 * the flag path is deleted; it flags nothing meaningful.
 */
const SENTINEL_PLACE_NAMES: ReadonlySet<string> = new Set(['valencia']);

/** Case- and diacritic-insensitive, whitespace-collapsed comparison key. */
function foldPlaceName(value: string): string {
	return value
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.trim()
		.replace(/\s+/g, ' ');
}

/** Every string leaf of a parsed jsonb value. */
function stringLeaves(node: unknown, out: string[]): void {
	if (typeof node === 'string') {
		out.push(node);
		return;
	}
	if (Array.isArray(node)) {
		for (const child of node) stringLeaves(child, out);
		return;
	}
	if (node !== null && typeof node === 'object') {
		for (const child of Object.values(node)) stringLeaves(child, out);
	}
}

/**
 * (!) DEAD — see the block comment above. Matches a record whose own text names
 * the studio's city. That tells us nothing: the stored pair is the factory
 * default, not the city's coordinate, so such a record is fabricated like any
 * other. The verdict was always untouched by this; only the report changed.
 */
export function namesSentinelPlace(stringColumnText: string | null): boolean {
	if (stringColumnText === null || stringColumnText === '') return false;
	let parsed: unknown;
	try {
		parsed = JSON.parse(stringColumnText);
	} catch {
		return false;
	}
	const leaves: string[] = [];
	stringLeaves(parsed, leaves);
	return leaves.some((leaf) => SENTINEL_PLACE_NAMES.has(foldPlaceName(leaf)));
}

/**
 * True iff the item carries operator-drawn geometry: a lib_data layer whose
 * layer_data is a FeatureCollection with at least one feature. Same predicate
 * the publication path uses to let lib_data win over lat/lon.
 * (16 lib_data layers in `matrix` carry layer_data:null — those are NOT
 * geometry and their items clear like any other bare sentinel.)
 */
export function hasDrawnGeometry(item: Record<string, unknown>): boolean {
	const libData = item.lib_data;
	if (!Array.isArray(libData)) return false;
	for (const layer of libData) {
		const layerData = (layer as { layer_data?: { features?: unknown } } | null)?.layer_data;
		const features = layerData?.features;
		if (Array.isArray(features) && features.length > 0) return true;
	}
	return false;
}

/** Every [lon, lat] position reachable from a GeoJSON coordinates/geometry tree. */
function collectPositions(node: unknown, out: [number, number][]): void {
	if (!Array.isArray(node)) return;
	const lon = coordKey(node[0]);
	const lat = coordKey(node[1]);
	if (lon !== null && lat !== null && !Array.isArray(node[0]) && !Array.isArray(node[1])) {
		out.push([Number(lon), Number(lat)]);
		return;
	}
	for (const child of node) collectPositions(child, out);
}

function collectGeometryPositions(geometry: unknown, out: [number, number][]): void {
	if (geometry === null || typeof geometry !== 'object') return;
	const node = geometry as { coordinates?: unknown; geometries?: unknown };
	collectPositions(node.coordinates, out);
	if (Array.isArray(node.geometries)) {
		for (const child of node.geometries) collectGeometryPositions(child, out);
	}
}

/** Every position of every feature across every lib_data layer of one item. */
export function itemPositions(item: Record<string, unknown>): [number, number][] {
	const out: [number, number][] = [];
	const libData = item.lib_data;
	if (!Array.isArray(libData)) return out;
	for (const layer of libData) {
		const features = (layer as { layer_data?: { features?: unknown } } | null)?.layer_data
			?.features;
		if (!Array.isArray(features)) continue;
		for (const feature of features) {
			collectGeometryPositions((feature as { geometry?: unknown } | null)?.geometry, out);
		}
	}
	return out;
}

/** Half a degree-millionth ≈ 0.1 m — the precision the client itself stores. */
function round6(value: number): number {
	return Number(value.toFixed(6));
}

/**
 * (!) THE ENGINE-AUTHORED COORDINATE. See the header block.
 *
 * BBOX CENTRE of every position of every feature across the item's lib_data
 * layers, or null when no position can be extracted (⇒ the item is HELD, never
 * guessed). An axis whose min equals its max is returned VERBATIM and
 * unrounded, so a single drawn Point derives to exactly itself.
 */
export function deriveCentreFromGeometry(
	item: Record<string, unknown>,
): { lat: number; lon: number } | null {
	const positions = itemPositions(item);
	if (positions.length === 0) return null;
	let minLon = Number.POSITIVE_INFINITY;
	let maxLon = Number.NEGATIVE_INFINITY;
	let minLat = Number.POSITIVE_INFINITY;
	let maxLat = Number.NEGATIVE_INFINITY;
	for (const [lon, lat] of positions) {
		if (lon < minLon) minLon = lon;
		if (lon > maxLon) maxLon = lon;
		if (lat < minLat) minLat = lat;
		if (lat > maxLat) maxLat = lat;
	}
	return {
		lat: minLat === maxLat ? minLat : round6((minLat + maxLat) / 2),
		lon: minLon === maxLon ? minLon : round6((minLon + maxLon) / 2),
	};
}

/**
 * Human evidence for a DERIVE/HOLD: what was actually drawn (geometry types +
 * vertex counts) and the framing the sentinel centre encodes. The dry-run must
 * let a reviewer SEE the user work being handled, not just count it.
 */
export function describeGeometry(item: Record<string, unknown>): string {
	const shapes: string[] = [];
	const libData = Array.isArray(item.lib_data) ? item.lib_data : [];
	for (const layer of libData as { layer_data?: { features?: unknown[] } }[]) {
		for (const raw of layer?.layer_data?.features ?? []) {
			const geometry = (raw as { geometry?: { type?: string; coordinates?: unknown } } | null)
				?.geometry;
			const positions: [number, number][] = [];
			collectGeometryPositions(geometry, positions);
			shapes.push(`${geometry?.type ?? '?'}(${positions.length} vertices)`);
		}
	}
	return `drawn ${shapes.join(' + ')}; sentinel was the saved framing (zoom ${String(item.zoom)}, alt ${String(item.alt)})`;
}

export type Verdict = 'CLEAR' | 'DERIVE' | 'HOLD';
export type HoldReason = 'MIXED' | 'NO_POSITION';

export interface Outcome {
	verdict: Verdict;
	reason?: HoldReason;
	detail?: string;
	/** DERIVE only: the rewritten item array to store. */
	value?: unknown[];
}

/**
 * Adjudicate ONE component's item array. Item classes: BARE (sentinel pair, no
 * drawn geometry), GEO (sentinel pair + drawn geometry), OTHER (anything else).
 *
 *  - null    : no sentinel item at all — not our business.
 *  - CLEAR   : every item is BARE ⇒ remove the whole key.
 *  - DERIVE  : GEO items and no BARE item ⇒ rewrite the array, replacing each
 *              GEO item's lat/lon with the bbox centre of its own geometry and
 *              leaving OTHER items and every other key untouched.
 *  - HOLD/NO_POSITION : a GEO item whose geometry yields no position — never
 *              guess, never clear.
 *  - HOLD/MIXED       : a BARE item sits beside anything else. Key removal is
 *              all-or-nothing, and dropping array elements would renumber the
 *              survivors, so this needs a human.
 */
export function adjudicate(items: unknown[]): Outcome | null {
	let bare = 0;
	let geo = 0;
	let other = 0;
	let detail = '';
	const value: unknown[] = [];

	for (const raw of items) {
		if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
			other++;
			value.push(raw);
			continue;
		}
		const item = raw as Record<string, unknown>;
		if (!isSentinelCentred(item)) {
			other++;
			value.push(item);
			continue;
		}
		if (!hasDrawnGeometry(item)) {
			bare++;
			value.push(item);
			continue;
		}
		geo++;
		const centre = deriveCentreFromGeometry(item);
		if (centre === null) {
			return {
				verdict: 'HOLD',
				reason: 'NO_POSITION',
				detail: `sentinel-centred item carries drawn geometry with no extractable position — ${describeGeometry(item)}`,
			};
		}
		if (detail === '') {
			detail = `${describeGeometry(item)}; derived centre ${centre.lat}/${centre.lon}`;
		}
		value.push({ ...item, lat: centre.lat, lon: centre.lon });
	}

	if (bare === 0 && geo === 0) return null;
	if (bare > 0 && (geo > 0 || other > 0)) {
		return {
			verdict: 'HOLD',
			reason: 'MIXED',
			detail: `${bare} bare sentinel item(s) share the component with ${geo + other} other item(s); key removal is all-or-nothing`,
		};
	}
	if (geo > 0) return { verdict: 'DERIVE', detail, value };
	return { verdict: 'CLEAR' };
}

// ---------------------------------------------------------------------------
// Discovery + apply
// ---------------------------------------------------------------------------

export interface Unit {
	table: string;
	sectionTipo: string;
	sectionId: number;
	componentTipo: string;
	itemCount: number;
	verdict: Verdict;
	reason?: HoldReason;
	detail?: string;
	/** DERIVE only, PLAN ONLY — the apply path recomputes under the row lock. */
	plannedValue?: unknown[];
	/** Report only: the record names the place the sentinel is. See header. */
	flagged?: boolean;
}

interface Discovery {
	clear: Unit[];
	derive: Unit[];
	held: Unit[];
	scannedRows: number;
	scannedItems: number;
}

async function discover(geoTipos: Set<string>, table: string): Promise<Discovery> {
	const clear: Unit[] = [];
	const derive: Unit[] = [];
	const held: Unit[] = [];
	let scannedRows = 0;
	let scannedItems = 0;

	const rows = (await sql.unsafe(
		`SELECT section_tipo, section_id, geo::text AS geo_text, string::text AS string_text
		 FROM "${table}" WHERE geo IS NOT NULL AND geo::text NOT IN ('{}', 'null')
		 ORDER BY section_tipo, section_id`,
	)) as unknown as {
		section_tipo: string;
		section_id: number;
		geo_text: string;
		string_text: string | null;
	}[];

	for (const row of rows) {
		scannedRows++;
		let geo: Record<string, unknown>;
		try {
			geo = JSON.parse(row.geo_text) as Record<string, unknown>;
		} catch {
			console.log(`  note: ${table} ${row.section_tipo}/${row.section_id}: unparseable geo column`);
			continue;
		}
		let flaggedRow: boolean | undefined;
		for (const [componentTipo, rawItems] of Object.entries(geo)) {
			if (!geoTipos.has(componentTipo)) continue;
			const items = Array.isArray(rawItems) ? rawItems : [rawItems];
			if (items.length === 0) continue;
			scannedItems += items.length;
			const outcome = adjudicate(items);
			if (outcome === null) continue;
			// Only parsed for rows that actually reach a verdict, and only once.
			flaggedRow ??= namesSentinelPlace(row.string_text);
			const unit: Unit = {
				table,
				sectionTipo: row.section_tipo,
				sectionId: Number(row.section_id),
				componentTipo,
				itemCount: items.length,
				verdict: outcome.verdict,
				reason: outcome.reason,
				detail: outcome.detail,
				plannedValue: outcome.value,
				flagged: flaggedRow,
			};
			if (outcome.verdict === 'CLEAR') clear.push(unit);
			else if (outcome.verdict === 'DERIVE') derive.push(unit);
			else held.push(unit);
		}
	}
	return { clear, derive, held, scannedRows, scannedItems };
}

function label(unit: Unit): string {
	return `${unit.table} ${unit.sectionTipo}/${unit.sectionId} ${unit.componentTipo} (${unit.itemCount} item(s))`;
}

/**
 * Every unit whose record names the sentinel's place, in one list — the report's
 * curator-facing section. Ordered by verdict so a HOLD never hides under CLEARs.
 */
function flaggedUnits(found: Discovery): Unit[] {
	return [...found.held, ...found.derive, ...found.clear].filter((unit) => unit.flagged === true);
}

function identities(units: Unit[]): string[] {
	return units.map(label).sort();
}

function sameIdentities(a: Unit[], b: Unit[]): boolean {
	const left = identities(a);
	const right = identities(b);
	return left.length === right.length && left.every((value, index) => value === right[index]);
}

/**
 * Repair ONE unit inside its own transaction, re-adjudicating the value under a
 * FOR UPDATE row lock (TOCTOU: the scan's verdict is a plan, not an authority).
 * Returns what actually happened.
 *
 * Exported for the destructive-half gate
 * (test/unit/geolocation_studio_default_repair_apply.test.ts), which drives it on a
 * scratch surface — the row lock, the re-adjudication, the fail-loud aborts and
 * the DERIVE array write are the most destructive code in the change and are
 * tripwired, not described.
 */
export async function repairUnit(unit: Unit, userId: number): Promise<'done' | 'changed'> {
	return await withTransaction(async () => {
		const locked = await readMatrixKeyForUpdate(
			unit.table,
			unit.sectionTipo,
			unit.sectionId,
			'geo',
			unit.componentTipo,
		);
		if (locked === null) {
			// Record deleted underneath us — never continue silently (S2-02).
			throw new Error(
				`repair_geolocation_studio_default: record vanished mid-run for ${label(unit)}; ABORTING`,
			);
		}
		// Re-run the SAME adjudication on the freshly locked value. Anything that
		// changed since the scan (a coordinate saved by an operator, the key
		// emptied, a non-array value the lock read flattens) changes the verdict.
		const outcome = adjudicate(locked);
		if (outcome === null || outcome.verdict !== unit.verdict) return 'changed';

		const write =
			outcome.verdict === 'CLEAR'
				? { column: 'geo' as const, key: unit.componentTipo, value: null }
				: { column: 'geo' as const, key: unit.componentTipo, value: outcome.value };
		const affected = await updateMatrixKeysData(unit.table, unit.sectionTipo, unit.sectionId, [
			write,
		]);
		if (affected === 0) {
			throw new Error(
				`repair_geolocation_studio_default: 0 rows affected for ${label(unit)} — the record vanished mid-run; ABORTING`,
			);
		}
		// Audit the transition. NOT the record's dd197/dd201 stamps — see header.
		await recordTimeMachine(
			{
				sectionTipo: unit.sectionTipo,
				sectionId: unit.sectionId,
				componentTipo: unit.componentTipo,
				lang: GEO_LANG,
				userId,
				data: outcome.verdict === 'CLEAR' ? [] : (outcome.value ?? []),
			},
			dbTimestamp(),
		);
		return 'done';
	});
}

/** Returns the process exit code: 0 green, 1 not green. */
async function main(): Promise<number> {
	const args = parseArgs(process.argv.slice(2));

	// DISCOVERY: the tipo set comes from the ontology, never a literal list.
	const geoTipos = new Set(await searchDdOntology({ model: 'component_geolocation' }));
	if (geoTipos.size === 0) {
		usage("no dd_ontology rows with model='component_geolocation' — wrong database?");
	}

	console.log(
		`repair_geolocation_studio_default — studio default ${SENTINEL_LAT}/${SENTINEL_LON}, ` +
			`${geoTipos.size} geolocation tipo(s), table ${args.table}, user ${args.userId}, ` +
			`mode ${args.apply ? 'APPLY' : 'DRY-RUN'}`,
	);

	const found = await discover(geoTipos, args.table);
	console.log(
		`\nscanned ${found.scannedRows} record(s) with a geo column / ${found.scannedItems} geolocation item(s)`,
	);

	// FLAGGED first: it is the only part of the report that asks a human for
	// follow-up WORK (re-entering a coordinate the sweep is about to destroy),
	// so it must not be buried under thousands of CLEAR lines.
	const flagged = flaggedUnits(found);
	console.log(
		`\nFLAGGED (DEAD FLAG — ignore) — the record's text names the studio's city. The stored pair ` +
			`is the FACTORY DEFAULT, not that city's coordinate, so these are fabricated like any ` +
			`other and need no curator action. This flag is scheduled for removal (${flagged.length}):`,
	);
	for (const unit of flagged) {
		console.log(`  FLAGGED ${unit.verdict} ${label(unit)} — curator review`);
	}

	console.log(`\nHELD — needs a human, never touched (${found.held.length}):`);
	for (const unit of found.held) {
		console.log(`  HOLD ${unit.reason} ${label(unit)}: ${unit.detail}`);
	}

	console.log(
		`\nDERIVE — sentinel framing replaced by the ENGINE-AUTHORED bbox centre of the ` +
			`operator's own drawn geometry (${found.derive.length}):`,
	);
	for (const unit of found.derive) {
		console.log(`  DERIVE ${label(unit)}: ${unit.detail}`);
	}

	console.log(`\nCLEAR — bare fabricated sentinel, clearable (${found.clear.length}):`);
	for (const unit of found.clear) {
		console.log(`  CLEAR ${label(unit)}`);
	}

	// Per-tipo summary: the listings above are thousands of lines on a populated
	// surface, and the blast radius per component is what a reviewer signs off.
	const summary = new Map<string, { clear: number; derive: number; hold: number }>();
	for (const [units, field] of [
		[found.clear, 'clear'],
		[found.derive, 'derive'],
		[found.held, 'hold'],
	] as const) {
		for (const unit of units) {
			const key = `${unit.table} ${unit.componentTipo}`;
			const row = summary.get(key) ?? { clear: 0, derive: 0, hold: 0 };
			row[field]++;
			summary.set(key, row);
		}
	}
	console.log('\nBY TABLE + COMPONENT TIPO (clear / derive / held):');
	for (const [key, row] of [...summary].sort((a, b) => b[1].clear - a[1].clear)) {
		console.log(`  ${key}: ${row.clear} / ${row.derive} / ${row.hold}`);
	}

	if (!args.apply) {
		console.log(
			`\nDRY-RUN complete: ${found.clear.length} would be cleared, ${found.derive.length} would be ` +
				`derived from drawn geometry, ${found.held.length} held, ` +
				`${flagged.length} flagged for curator review. Re-run with --apply.`,
		);
		return 0;
	}

	// --- APPLY -------------------------------------------------------------
	let cleared = 0;
	let derived = 0;
	const changedUnderUs: Unit[] = [];
	for (const unit of [...found.clear, ...found.derive]) {
		const result = await repairUnit(unit, args.userId);
		if (result === 'changed') {
			changedUnderUs.push(unit);
			console.log(`  SKIPPED (changed under us) ${label(unit)}`);
			continue;
		}
		if (unit.verdict === 'CLEAR') cleared++;
		else derived++;
		console.log(`  APPLIED ${unit.verdict} ${label(unit)}`);
	}
	console.log(
		`\ncleared ${cleared}, derived ${derived}, held ${found.held.length}, ` +
			`skipped ${changedUnderUs.length}.`,
	);
	// Repeated AFTER the writes: this is the list a curator has to act on, and by
	// now the coordinate it names is gone.
	console.log(`\nFLAGGED — re-enter these coordinates by hand (${flagged.length}):`);
	for (const unit of flagged) {
		console.log(`  FLAGGED ${unit.verdict} ${label(unit)} — curator review`);
	}

	// Post-repair gate — IDENTITIES, not counts.
	const after = await discover(geoTipos, args.table);
	// A derivation whose centre IS the sentinel pair (geometry drawn exactly on
	// the ex-factory centre) is already correct and legitimately re-appears.
	const expectedDerive = found.derive.filter(
		(unit) => adjudicate(unit.plannedValue ?? [])?.verdict === 'DERIVE',
	);
	const clearGreen = after.clear.length === 0;
	const deriveGreen = sameIdentities(after.derive, expectedDerive);
	const heldGreen = sameIdentities(after.held, found.held);
	const skipGreen = changedUnderUs.length === 0;
	const green = clearGreen && deriveGreen && heldGreen && skipGreen;
	console.log(
		`post-repair audit: ${after.clear.length} bare sentinel remaining (want 0), ` +
			`${after.derive.length} derivable remaining (want ${expectedDerive.length}), ` +
			`held identities ${heldGreen ? 'unchanged' : 'CHANGED'}, ` +
			`${changedUnderUs.length} skipped — ${green ? 'GATE GREEN' : 'GATE RED, investigate'}`,
	);
	if (!green) {
		for (const unit of changedUnderUs) console.error(`  RED changed-under-us: ${label(unit)}`);
		for (const identity of identities(after.held)) {
			if (!identities(found.held).includes(identity)) console.error(`  RED new hold: ${identity}`);
		}
		for (const identity of identities(found.held)) {
			if (!identities(after.held).includes(identity)) console.error(`  RED lost hold: ${identity}`);
		}
	}
	return green ? 0 : 1;
}

// Entrypoint only — importing this module (the predicate gate does) must not run
// the sweep.
if (import.meta.main) {
	process.exit(await main());
}
