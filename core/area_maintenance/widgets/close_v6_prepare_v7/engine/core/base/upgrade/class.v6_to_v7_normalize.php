<?php declare(strict_types=1);
/**
* CLASS V6_TO_V7_NORMALIZE
*
* Structural repair + finding classification for the v6→v7 data migration.
*
* WHY THIS EXISTS
* v6_to_v7::reformat_matrix_data() used to report every imperfection in the legacy
* `datos` blob as an ERROR, in a flat list of formatted strings. On a real install that
* produced hundreds of lines the operator could not act on, most of them the SAME
* mechanical defect repeated across rows — and, worse, indistinguishable from the few
* findings that genuinely need a human decision.
*
* Two things are separated here:
*
*   1. REPAIR. A small registry of provably-safe structural transformations, applied
*      IN MEMORY inside process_matrix_row_data(). The legacy `datos` column is never
*      rewritten: the repaired shape flows straight into the v7 columns. Because the
*      review pass (save=false) and the migration (save=true) are the same function,
*      what the deep preflight reports is exactly what the migration will do.
*
*   2. CLASSIFICATION. Every finding carries a severity:
*        'fixed'  — repaired automatically; informational, needs no action
*        'notice' — cannot be migrated and will be dropped; nothing to repair
*        'error'  — needs a human decision before migrating
*      Only 'error' feeds v6_to_v7's $response->errors, so only 'error' makes the
*      review fail. That is what turns an unreadable wall into a short verdict.
*
* MEMORY
* Findings are aggregated into GROUPS as they are produced (code + tipo + model), never
* accumulated per row: one defect repeated across two million rows is one group with a
* count of two million, not two million objects. $response->errors is still filled for
* backward compatibility, but is capped (see ERRORS_CAP).
*
* Relates to: v6_to_v7 (process_matrix_row_data, migrate_component_data),
*             run/phase1_backup_pre_update.php (renders the groups as the run verdict).
*
* All methods are static. The class is never instantiated.
*
* @package Dédalo
* @subpackage close_v6_prepare_v7
*/
class v6_to_v7_normalize {

	/** Repaired automatically. Informational only; never fails a review. */
	public const SEVERITY_FIXED  = 'fixed';

	/** Cannot be migrated; the value is dropped. Reported, but does not fail a review. */
	public const SEVERITY_NOTICE = 'notice';

	/** Needs a human decision. Fails the review (exit 6). */
	public const SEVERITY_ERROR  = 'error';

	/**
	* Master switch for the repair rules, driven by the runner's --no-auto-fix flag.
	*
	* When false, no repair is attempted and the affected findings are reported as
	* errors with their legacy wording — i.e. the pre-auto-fix picture, for diagnosis.
	* The real migration (phase 2) always runs with this TRUE: turning it off there
	* would discard the very values the preflight promised to repair.
	*
	* @var bool $auto_fix
	*/
	public static bool $auto_fix = true;

	/**
	* Aggregated findings, keyed by code|tipo|model. Reset by reset() at the start of
	* each reformat pass and read by get_report().
	* @var array<string,stdClass> $groups
	*/
	private static array $groups = [];

	/**
	* Hard ceiling on the legacy flat $response->errors list. The groups carry the full
	* picture with a bounded footprint; this list only exists so callers that still read
	* ->errors keep working, and it must not be allowed to grow without limit on a large
	* database. Overflow is counted, never silently dropped (see $errors_overflow).
	*/
	public const ERRORS_CAP = 5000;

	/**
	* Number of error strings suppressed by ERRORS_CAP. Reported by get_report() so a
	* truncated list is never mistaken for a complete one.
	* @var int $errors_overflow
	*/
	private static int $errors_overflow = 0;

	/**
	* Max length of the offending-value sample kept per group. Long enough to recognise
	* the value, short enough that a group stays cheap.
	*/
	private const SAMPLE_WIDTH = 220;

	/**
	* Max DISTINCT section ids remembered per (table, section_tipo) inside one group.
	*
	* Locations are collected for SEVERITY_ERROR groups only — the bucket the operator has
	* to open and look at — precisely because an unbounded id list is the one thing that
	* could reintroduce per-row memory growth. 'fixed' and 'notice' groups routinely span
	* hundreds of thousands of rows and are not meant to be visited one by one.
	*
	* Overflow is recorded per location (see 'truncated') so a capped list is never
	* mistaken for the whole set.
	*/
	public const LOCATIONS_CAP = 200;

	/**
	* Language keys as v6 wrote them inside a component's `dato` map: 'lg-spa',
	* 'lg-nolan', … Used by the MISSING_DATO_ENVELOPE rule as its safety guard.
	*
	* Anchored with \z, NOT $: PCRE's `$` also matches before a trailing newline, so a
	* corrupt key "lg-spa\n" would pass the guard and be propagated all the way into the
	* v7 `lang` property.
	*/
	private const LANG_KEY_PATTERN = '/^lg-[a-z]{2,5}\z/';

	/**
	* v6 sidecar properties: descriptive metadata written NEXT TO the value, never the
	* value itself ('inf' is a label string like "Created date [component_date]", 'info'
	* is {label, modelo}). They are ignored when deciding whether a value carries data,
	* and dropped when one is repaired.
	*
	* Deliberately does NOT include 'valor' / 'valor_list' / 'dataframe': those are
	* derived copies of the real value, and a value carrying one WITHOUT a `dato` is an
	* unknown shape that must be reported, not quietly discarded.
	*/
	private const SIDECAR_KEYS = ['inf', 'info'];

	/**
	* THE FABRICATED MAP CENTRE — component_geolocation's retired magic sentinel.
	*
	* The v6 client SEEDED its edit view with a hardcoded map centre (the city of Valencia)
	* and its save button consulted no dirty signal, so merely OPENING a record and pressing
	* save wrote a coordinate the operator never entered. Server-side the pair was then read
	* back as a magic value meaning "no location set". v7 retires that magic entirely:
	* absence is STRUCTURAL (no stored value) and 0 is a legal coordinate — so every
	* surviving sentinel PUBLISHES as a real location in Valencia.
	*
	* Held as TEXT: the comparison is done on normalized strings, never on floats.
	*/
	private const SENTINEL_LAT = '39.462571';
	private const SENTINEL_LON = '-0.376295';

	/** The one model this repair applies to. Every other model returns untouched. */
	private const GEOLOCATION_MODEL = 'component_geolocation';



	/**
	* RESET
	* Clears the aggregation state. Called once at the start of a reformat pass so a
	* second pass in the same process (review then migrate) does not inherit the first
	* pass's counts.
	* @return void
	*/
	public static function reset() : void {

		self::$groups			= [];
		self::$errors_overflow	= 0;
	}//end reset



	/**
	* COMPONENT_VALUE
	* Normalizes ONE v6 component value that arrived without a usable `dato` property.
	*
	* Called from v6_to_v7::process_matrix_row_data() at the point where the old code
	* raised "Bad component data (literal without v6 'dato' property)". Records its own
	* finding in every branch, so the caller only has to act on the return value.
	*
	* Rules, in order:
	*
	*   EMPTY_COMPONENT_VALUE   the value carries nothing at all ({} , or a `dato` that
	*                           decoded to null/empty). There is no data to migrate and
	*                           nothing to repair — skipping it is already the correct
	*                           behaviour, so this is reported as 'fixed', not as a defect.
	*
	*   MISSING_DATO_ENVELOPE   the value IS the lang map, stored without its wrapper:
	*                             {"lg-nolan":[{start:{…}}]}
	*                           instead of
	*                             {"dato":{"lg-nolan":[{start:{…}}]}}
	*                           Repaired by wrapping. The guard is that EVERY key must
	*                           look like a v6 language key — one non-language key means
	*                           this is some other shape and the rule must not touch it.
	*
	*   UNKNOWN_COMPONENT_SHAPE anything else. Not repairable; reported as an error with
	*                           the legacy wording plus a sample of the offending value.
	*
	* @param string $tipo - component tipo, e.g. 'dd199'
	* @param mixed $value - the raw v6 component value (normally stdClass)
	* @param string $table
	* @param ?string $section_tipo
	* @param mixed $section_id
	* @param ?string $model - resolved ontology model, or null when it does not resolve
	* @param object $response - v6_to_v7 response, by reference (errors[] / findings[])
	* @return object|false - the repaired value (guaranteed to carry `dato`), or false
	*                        when there is nothing to migrate
	*/
	public static function component_value(
		string $tipo,
		mixed $value,
		string $table,
		?string $section_tipo,
		mixed $section_id,
		?string $model,
		object $response
	) : object|false {

		$ctx = [
			'table'			=> $table,
			'section_tipo'	=> $section_tipo,
			'section_id'	=> $section_id,
			'tipo'			=> $tipo,
			'model'			=> $model,
			'stored_model'	=> self::stored_model($value)
		];

		// Legacy wording, kept verbatim so --no-auto-fix reproduces the old report exactly.
		$legacy_msg = "Bad component data (literal without v6 'dato' property). table: '$table'"
			. " section_tipo: '$section_tipo' section_id: '$section_id' component_tipo: '$tipo'";

		// --no-auto-fix: report as before and repair nothing.
		if (self::$auto_fix !== true) {
			self::add($response, 'MISSING_DATO_ENVELOPE', self::SEVERITY_ERROR, $ctx, $legacy_msg, $value);
			return false;
		}

		// Not an object (array/scalar/null): outside every rule's domain.
		if (!is_object($value)) {
			self::add($response, 'UNKNOWN_COMPONENT_SHAPE', self::SEVERITY_ERROR, $ctx, $legacy_msg, $value);
			return false;
		}

		$vars = get_object_vars($value);

		// What is left once everything that CANNOT be a value is removed.
		//
		// Reaching this function means isset($value->dato) was false, so a `dato` key that
		// is nonetheless present decoded to null: it carries nothing and must not, by
		// itself, make the object look empty — the payload may still be sitting in the
		// sibling language keys. Treating "has a dato key" as "is empty" would discard
		// {"dato":null,"lg-spa":[…]} silently, which is data loss reported as a success.
		$payload = $vars;
		unset($payload['dato']);
		foreach (self::SIDECAR_KEYS as $sidecar) {
			unset($payload[$sidecar]);
		}

		// rule: EMPTY_COMPONENT_VALUE
		// Nothing but an empty `dato` and/or descriptive metadata: there is no data to
		// migrate and nothing to repair, so skipping is already correct behaviour.
		if (empty($payload)) {
			self::add(
				$response,
				'EMPTY_COMPONENT_VALUE',
				self::SEVERITY_FIXED,
				$ctx,
				"Empty component value skipped (nothing to migrate). tipo: '$tipo'",
				$value
			);
			return false;
		}

		// rule: MISSING_DATO_ENVELOPE
		// The guard is deliberately ALL keys, not any: a single non-language key means
		// the object is something else and must not be wrapped.
		// NOTE json_decode returns a numeric object key as an INT, so the (string) cast is
		// what makes a key like "0" testable at all — and it correctly fails the pattern.
		$all_lang = true;
		foreach (array_keys($payload) as $key) {
			if (preg_match(self::LANG_KEY_PATTERN, (string)$key) !== 1) {
				$all_lang = false;
				break;
			}
		}
		if ($all_lang === true) {
			self::add(
				$response,
				'MISSING_DATO_ENVELOPE',
				self::SEVERITY_FIXED,
				$ctx,
				"Missing 'dato' envelope — value wrapped as {dato:{…}}. tipo: '$tipo'"
					. ' langs: ' . implode(', ', array_keys($payload)),
				$value
			);
			// wraps the PAYLOAD, not the original: an empty `dato` and any sidecar
			// metadata are dropped with it, since neither survives into v7.
			return (object)['dato' => (object)$payload];
		}

		// no rule matched
		self::add(
			$response,
			'UNKNOWN_COMPONENT_SHAPE',
			self::SEVERITY_ERROR,
			$ctx,
			$legacy_msg . ' keys: ' . implode(', ', array_keys($payload)),
			$value
		);

		return false;
	}//end component_value



	/**
	* GEOLOCATION_VALUE
	* Repairs ONE component_geolocation per-lang item list: drops the coordinate the v6
	* client fabricated, or replaces it with the centre of the geometry the operator
	* actually drew. A no-op for every other model.
	*
	* Called from v6_to_v7::migrate_component_data() with the whole item list, because the
	* verdict is a property of the LIST, not of a single item (see MIXED below).
	*
	* Rules, in order, per item:
	*
	*   BARE sentinel (the fabricated pair, no drawn geometry)
	*       GEOLOCATION_FABRICATED_CENTRE — the item asserts a location that was never
	*       entered. Dropped: in v7 absence is structural, so the component simply gets no
	*       value. Reported as 'fixed'.
	*
	*   sentinel WITH drawn geometry
	*       GEOLOCATION_CENTRE_DERIVED — see the disclosure block below. Reported as 'fixed'.
	*
	*   sentinel with geometry but no extractable position
	*       GEOLOCATION_GEOMETRY_NO_POSITION — nothing can be derived and nothing may be
	*       guessed. The WHOLE list is migrated UNCHANGED, reported as 'notice'.
	*
	*   a BARE sentinel sharing the list with any other item
	*       GEOLOCATION_SENTINEL_MIXED — ids are assigned by POSITION in the surviving list
	*       (v6_to_v7::migrate_component_data, $value_key++), so dropping one item renumbers
	*       the ones after it. The WHOLE list is migrated UNCHANGED, reported as 'notice'.
	*
	*   anything else
	*       Untouched. 0 is a LEGAL coordinate: a record on the equator or the prime
	*       meridian is a record with a location, and no value other than the exact
	*       fabricated pair is special-cased — conflating two different fabrications is how
	*       this one stayed hidden for years.
	*
	* ============================================================================
	* (!) ENGINE-AUTHORED COORDINATE — a deliberate, owner-approved exception
	* ============================================================================
	* The standing law is that the engine NEVER invents a coordinate; only an operator's own
	* entry may be stored. GEOLOCATION_CENTRE_DERIVED is one narrow exception, approved by
	* the project owner on 2026-08-09.
	*
	* WHAT IS DERIVED: the BBOX CENTRE of every feature across the item's lib_data layers.
	* zoom, alt, lib_data, id and every other property are preserved as they were. A single
	* drawn Point derives to EXACTLY itself (a one-position bbox is its own centre, returned
	* verbatim and unrounded).
	*
	* WHY IT IS NOT AN INVENTION: on an item carrying drawn geometry the stored pair was
	* never an asserted location — it is the map FRAMING the client saved alongside the
	* work. Framing that matches the work is honest. Keeping the sentinel instead is not
	* neutral: it is a FALSE LOCATION CLAIM that the publication path emits verbatim as the
	* record's location, hundreds of km from the geometry the operator drew. Clearing
	* lat/lon instead would be safe but lossy — it discards framing the operator did choose.
	*
	* This coordinate is NOT user-entered. It is machine-derived from user-drawn geometry,
	* it is the only coordinate this migration authors anywhere, and it is disclosed here,
	* in its own finding code, and in the operator's run report. Where no position can be
	* extracted the item is held, never guessed.
	*
	* The rule is the same law as the v7-side one-shot repair
	* (v7 scripts/repair_geolocation_sentinel.ts, gated by
	* test/unit/geolocation_sentinel_repair.test.ts): same sentinel test, same bbox maths,
	* same hold classes. A v6-side and a v7-side answer that differ are a silent divergence.
	*
	* SCOPE: this runs wherever migrate_component_data() runs — the matrix tables AND the
	* matrix_time_machine rows. The preflight reviews only the matrix tables (phase 1 does
	* not walk matrix_time_machine), so the counts an operator sees are the matrix ones.
	*
	* @param ?string $model - resolved ontology model; anything but component_geolocation
	*                         returns null immediately
	* @param array $items - the per-lang item list, as a plain list
	* @param array $ctx - finding context (section_tipo, section_id, tipo, model, …)
	* @param object $response - the NESTED response; findings are deferred and the caller
	*                           merges them once it knows the table
	* @return array|null - the repaired item list, or null when nothing changes (no
	*                      sentinel, a hold, another model, or --no-auto-fix)
	*/
	public static function geolocation_value(
		?string $model,
		array $items,
		array $ctx,
		object $response
	) : ?array {

		if ($model !== self::GEOLOCATION_MODEL) {
			return null;
		}

		$bare		= 0;	// fabricated pair, nothing drawn
		$derived	= 0;	// fabricated pair, geometry drawn
		$other		= 0;	// everything else, including 0/0 and any real coordinate
		$repaired	= [];

		foreach ($items as $item) {

			if (!is_object($item) || !self::is_sentinel_centred($item)) {
				$other++;
				$repaired[] = $item;
				continue;
			}

			if (!self::has_drawn_geometry($item)) {
				// dropped — deliberately NOT pushed onto $repaired
				$bare++;
				continue;
			}

			$centre = self::derive_centre_from_geometry($item);
			if ($centre === null) {
				// Geometry is there but yields no usable position. Never guess: the whole
				// list is returned untouched and a human is told where to look.
				self::defer(
					$response,
					'GEOLOCATION_GEOMETRY_NO_POSITION',
					self::SEVERITY_NOTICE,
					$ctx,
					'Fabricated map centre KEPT: the item carries drawn geometry from which no'
						. ' position can be extracted, so nothing is derived and the value is'
						. " migrated unchanged for review. tipo: '" . (string)($ctx['tipo'] ?? '') . "'",
					$item
				);
				return null;
			}

			$derived++;
			// clone, never mutate: the caller's decoded row is also the source the
			// unrepaired branches return as-is.
			$new_item = clone $item;
			$new_item->lat = $centre['lat'];
			$new_item->lon = $centre['lon'];
			$repaired[] = $new_item;
		}

		// No fabricated coordinate anywhere: not this rule's business.
		if ($bare === 0 && $derived === 0) {
			return null;
		}

		if ($bare > 0 && ($derived > 0 || $other > 0)) {
			// Dropping this item would shift the ids of every item after it (they are
			// assigned by position, not carried by the value). Needs a human.
			self::defer(
				$response,
				'GEOLOCATION_SENTINEL_MIXED',
				self::SEVERITY_NOTICE,
				$ctx,
				'Fabricated map centre KEPT: it shares the component with other geolocation'
					. ' items and dropping one would renumber the rest, so the value is migrated'
					. " unchanged for review. tipo: '" . (string)($ctx['tipo'] ?? '') . "'",
				$items
			);
			return null;
		}

		// --no-auto-fix: report what WOULD be repaired and repair nothing, so the
		// diagnostic mode shows the pre-repair picture. Reported as notices, not errors:
		// this finding did not exist before the rule, and raising it as an error would
		// invent a failure that never blocked a migration.
		if (self::$auto_fix !== true) {
			for ($i = 0; $i < $bare; $i++) {
				self::defer(
					$response,
					'GEOLOCATION_FABRICATED_CENTRE',
					self::SEVERITY_NOTICE,
					$ctx,
					'Fabricated map centre NOT repaired (--no-auto-fix): the v6 client wrote'
						. ' ' . self::SENTINEL_LAT . '/' . self::SENTINEL_LON . ' on save and the value'
						. " migrates as-is. tipo: '" . (string)($ctx['tipo'] ?? '') . "'"
				);
			}
			for ($i = 0; $i < $derived; $i++) {
				self::defer(
					$response,
					'GEOLOCATION_CENTRE_DERIVED',
					self::SEVERITY_NOTICE,
					$ctx,
					'Fabricated map centre NOT replaced (--no-auto-fix): the item carries drawn'
						. " geometry whose centre would have been derived. tipo: '"
						. (string)($ctx['tipo'] ?? '') . "'"
				);
			}
			return null;
		}

		if ($derived > 0) {
			// One finding per repaired ITEM: the count is what the operator reads, and
			// grouping keeps it to ONE object however many million times it fires.
			for ($i = 0; $i < $derived; $i++) {
				self::defer(
					$response,
					'GEOLOCATION_CENTRE_DERIVED',
					self::SEVERITY_FIXED,
					$ctx,
					'Fabricated map centre replaced by the ENGINE-DERIVED centre of the drawn'
						. ' geometry (bbox centre of the operator\'s own features; zoom, alt and'
						. " lib_data kept). tipo: '" . (string)($ctx['tipo'] ?? '') . "'",
					$items
				);
			}
			return $repaired;
		}

		for ($i = 0; $i < $bare; $i++) {
			self::defer(
				$response,
				'GEOLOCATION_FABRICATED_CENTRE',
				self::SEVERITY_FIXED,
				$ctx,
				'Fabricated map centre dropped (the v6 client wrote ' . self::SENTINEL_LAT . '/'
					. self::SENTINEL_LON . ' on save; no location was ever entered). tipo: \''
					. (string)($ctx['tipo'] ?? '') . "'",
				$items
			);
		}

		// Every item was fabricated: the component migrates with no value at all, which is
		// exactly how v7 says "no location". ($repaired is empty here by construction.)
		return $repaired;
	}//end geolocation_value



	/**
	* IS_SENTINEL_CENTRED
	* True only when BOTH axes normalize to exactly the fabricated pair. One axis off, or an
	* absent axis, is not the sentinel.
	*
	* @param object $item
	* @return bool
	*/
	public static function is_sentinel_centred(object $item) : bool {

		return self::coord_key($item->lat ?? null) === self::SENTINEL_LAT
			&& self::coord_key($item->lon ?? null) === self::SENTINEL_LON;
	}//end is_sentinel_centred



	/**
	* HAS_DRAWN_GEOMETRY
	* True when the item carries operator-drawn geometry: a lib_data layer whose layer_data
	* is a FeatureCollection with at least one feature.
	*
	* A layer with layer_data:null is NOT geometry (they exist in real data), and neither is
	* an empty feature list — both are bare sentinels.
	*
	* @param object $item
	* @return bool
	*/
	public static function has_drawn_geometry(object $item) : bool {

		$lib_data = $item->lib_data ?? null;
		if (!is_array($lib_data)) {
			return false;
		}

		foreach ($lib_data as $layer) {
			$features = (is_object($layer) && isset($layer->layer_data) && is_object($layer->layer_data))
				? ($layer->layer_data->features ?? null)
				: null;
			if (is_array($features) && count($features) > 0) {
				return true;
			}
		}

		return false;
	}//end has_drawn_geometry



	/**
	* ITEM_POSITIONS
	* Every [lon, lat] position of every feature across every lib_data layer of one item.
	*
	* @param object $item
	* @return array<int,array{0:float,1:float}>
	*/
	public static function item_positions(object $item) : array {

		$out = [];

		$lib_data = $item->lib_data ?? null;
		if (!is_array($lib_data)) {
			return $out;
		}

		foreach ($lib_data as $layer) {
			$features = (is_object($layer) && isset($layer->layer_data) && is_object($layer->layer_data))
				? ($layer->layer_data->features ?? null)
				: null;
			if (!is_array($features)) {
				continue;
			}
			foreach ($features as $feature) {
				if (is_object($feature)) {
					self::collect_geometry_positions($feature->geometry ?? null, $out);
				}
			}
		}

		return $out;
	}//end item_positions



	/**
	* DERIVE_CENTRE_FROM_GEOMETRY
	* (!) THE ENGINE-AUTHORED COORDINATE — see the disclosure block on geolocation_value().
	*
	* The bbox centre of every position of every feature of the item, or null when no
	* position can be extracted (the item is then held, never guessed).
	*
	* An axis whose min equals its max is returned VERBATIM and unrounded, so a single drawn
	* Point derives to exactly itself; otherwise the midpoint is rounded to 6 decimals
	* (~0.1 m — the precision the client itself stores).
	*
	* @param object $item
	* @return array{lat:float,lon:float}|null
	*/
	public static function derive_centre_from_geometry(object $item) : ?array {

		$positions = self::item_positions($item);
		if (empty($positions)) {
			return null;
		}

		$min_lon = INF;  $max_lon = -INF;
		$min_lat = INF;  $max_lat = -INF;
		foreach ($positions as $position) {
			$lon = $position[0];
			$lat = $position[1];
			if ($lon < $min_lon) $min_lon = $lon;
			if ($lon > $max_lon) $max_lon = $lon;
			if ($lat < $min_lat) $min_lat = $lat;
			if ($lat > $max_lat) $max_lat = $lat;
		}

		return [
			'lat' => ($min_lat === $max_lat) ? $min_lat : self::round6(($min_lat + $max_lat) / 2),
			'lon' => ($min_lon === $max_lon) ? $min_lon : self::round6(($min_lon + $max_lon) / 2)
		];
	}//end derive_centre_from_geometry



	/**
	* COLLECT_GEOMETRY_POSITIONS
	* Walks one GeoJSON geometry — including a GeometryCollection's children — appending
	* every position it reaches.
	*
	* @param mixed $geometry
	* @param array $out - by reference
	* @return void
	*/
	private static function collect_geometry_positions(mixed $geometry, array &$out) : void {

		if (!is_object($geometry)) {
			return;
		}

		self::collect_positions($geometry->coordinates ?? null, $out);

		$geometries = $geometry->geometries ?? null;
		if (is_array($geometries)) {
			foreach ($geometries as $child) {
				self::collect_geometry_positions($child, $out);
			}
		}
	}//end collect_geometry_positions



	/**
	* COLLECT_POSITIONS
	* Walks a GeoJSON `coordinates` tree of ANY nesting depth — Point, LineString, Polygon
	* rings, MultiPolygon, and anything deeper — appending each [lon, lat] it reaches.
	*
	* A node is a POSITION when neither of its first two entries is itself an array and both
	* read as coordinates; otherwise it is a container and every child is walked. That test,
	* not the declared geometry `type`, is what makes an unknown or malformed type harmless.
	*
	* @param mixed $node
	* @param array $out - by reference
	* @return void
	*/
	private static function collect_positions(mixed $node, array &$out) : void {

		if (!is_array($node)) {
			return;
		}

		$first	= $node[0] ?? null;
		$second	= $node[1] ?? null;
		if (!is_array($first) && !is_array($second)) {
			$lon = self::coord_key($first);
			$lat = self::coord_key($second);
			if ($lon !== null && $lat !== null) {
				$out[] = [(float)$lon, (float)$lat];
				return;
			}
		}

		foreach ($node as $child) {
			self::collect_positions($child, $out);
		}
	}//end collect_positions



	/**
	* COORD_KEY
	* The canonical decimal text of a stored coordinate, or null when there is none.
	*
	* Coordinates are stored MIXED — as numbers and as strings, sometimes with a comma
	* decimal separator — so nothing may be compared until it is normalized. The result is a
	* pure function of the resulting double, which is what makes the v6 and v7 verdicts
	* identical on the same value.
	*
	* Absence is STRUCTURAL: null, a non-numeric string and an empty string are absent. 0 is
	* a value, not an absence.
	*
	* @param mixed $raw
	* @return string|null
	*/
	public static function coord_key(mixed $raw) : ?string {

		if (is_int($raw)) {
			return self::coord_text((float)$raw);
		}
		if (is_float($raw)) {
			return is_finite($raw) ? self::coord_text($raw) : null;
		}
		if (!is_string($raw)) {
			// bool / array / object / null: not a coordinate. Deliberately NOT cast —
			// casting true to 1.0 would fabricate a coordinate on the prime meridian.
			return null;
		}

		$text = str_replace(',', '.', trim($raw));
		if ($text === '' || !is_numeric($text)) {
			return null;
		}

		return self::coord_text((float)$text);
	}//end coord_key



	/**
	* COORD_TEXT
	* Shortest decimal text that round-trips to the same double.
	*
	* json_encode honours serialize_precision=-1 (the default since PHP 7.1), which is the
	* same "shortest round-trip" rule JavaScript's String(Number(x)) uses — so the v7
	* script's key and this one are the same text for the same double.
	*
	* @param float $value
	* @return string
	*/
	private static function coord_text(float $value) : string {

		$text = (string)json_encode($value);

		// PHP marks a whole float AS a float ('20.0') on some versions; JS never does. The
		// key must depend on the double alone, so the marker is stripped.
		if (str_ends_with($text, '.0')) {
			$text = substr($text, 0, -2);
		}

		// -0 and 0 are the same coordinate.
		return ($text === '-0') ? '0' : $text;
	}//end coord_text



	/**
	* ROUND6
	* Rounds to 6 decimals the way JavaScript's toFixed(6) does — on the EXACT value of the
	* double. PHP's round() pre-rounds first and can land on the other side; the two agree
	* here only because this does not use it.
	*
	* @param float $value
	* @return float
	*/
	private static function round6(float $value) : float {

		return (float)sprintf('%.6F', $value);
	}//end round6



	/**
	* ADD
	* Records one finding: aggregates it into its group and, for 'error' severity only,
	* appends the legacy string to $response->errors so the existing
	* `result = empty($errors)` contract keeps its meaning.
	*
	* @param object $response - v6_to_v7 response (by handle; stdClass is a reference type)
	* @param string $code
	* @param string $severity - one of the SEVERITY_* constants
	* @param array $ctx - table / section_tipo / section_id / tipo / model / stored_model
	* @param string $msg - human-readable line
	* @param mixed $sample - the offending value, truncated into the group
	* @return void
	*/
	public static function add(
		object $response,
		string $code,
		string $severity,
		array $ctx,
		string $msg,
		mixed $sample = null
	) : void {

		$tipo	= (string)($ctx['tipo'] ?? '');
		$model	= (string)($ctx['model'] ?? '');
		$key	= $code . '|' . $tipo . '|' . $model;

		if (!isset(self::$groups[$key])) {
			self::$groups[$key] = (object)[
				'code'			=> $code,
				'severity'		=> $severity,
				'tipo'			=> $tipo,
				'model'			=> $model,
				'stored_model'	=> $ctx['stored_model'] ?? null,
				'msg'			=> $msg,
				'count'			=> 0,
				'tables'		=> [],			// table => count
				'locations'		=> [],			// "table|section_tipo" => {table, section_tipo, ids[], truncated}
				// sampled ONLY here, on first sight of the group: encoding the offending
				// value on every occurrence would cost a json_encode per row, which is
				// exactly what the aggregation exists to avoid.
				'sample'		=> self::sample($sample),
				'sample_ref'	=> trim(($ctx['table'] ?? '') . '/' . ($ctx['section_tipo'] ?? '') . '/' . ($ctx['section_id'] ?? ''), '/')
			];
		}

		$group = self::$groups[$key];
		$group->count++;

		// The table spread is worth keeping: it is bounded by the migration's table list.
		// A per-section_tipo map is NOT — for a finding keyed on 'relations' it would grow
		// to one entry per section tipo in the database, and nothing reads it.
		$table = (string)($ctx['table'] ?? '');
		if ($table !== '') {
			$group->tables[$table] = ($group->tables[$table] ?? 0) + 1;
		}

		// Exact locations, for the bucket that has to be reviewed by hand. A sample row is
		// enough to RECOGNISE a finding, but not to go and fix it: that needs every record
		// it touches. Errors are the small bucket by construction, so this stays bounded —
		// and LOCATIONS_CAP catches the pathological case anyway.
		if ($severity === self::SEVERITY_ERROR && $table !== '') {
			$section_id = (string)($ctx['section_id'] ?? '');
			if ($section_id !== '') {
				$loc_key = $table . '|' . (string)($ctx['section_tipo'] ?? '');
				if (!isset($group->locations[$loc_key])) {
					$group->locations[$loc_key] = (object)[
						'table'			=> $table,
						'section_tipo'	=> (string)($ctx['section_tipo'] ?? ''),
						'ids'			=> [],	// used as a SET (id => true) so repeats collapse
						'truncated'		=> false
					];
				}
				$location = $group->locations[$loc_key];
				if (!isset($location->ids[$section_id])) {
					// several components of the SAME record are one place to look, not many
					if (count($location->ids) >= self::LOCATIONS_CAP) {
						$location->truncated = true;
					}else{
						$location->ids[$section_id] = true;
					}
				}
			}
		}

		// backward compatibility: only errors reach ->errors, so notices and repaired
		// values no longer fail the review.
		if ($severity === self::SEVERITY_ERROR) {
			if (count($response->errors ?? []) < self::ERRORS_CAP) {
				$response->errors[] = $msg;
			}else{
				self::$errors_overflow++;
			}
		}
	}//end add



	/**
	* MERGE
	* Folds the findings produced by a nested call (migrate_component_data builds its own
	* response object) into the caller's response, stamping the context the nested call
	* did not have — the table name.
	*
	* @param object $response - caller's response
	* @param object $nested - the nested response, carrying ->findings
	* @param string $table
	* @return void
	*/
	public static function merge(object $response, object $nested, string $table) : void {

		$findings = $nested->findings ?? null;
		if (empty($findings) || !is_array($findings)) {
			return;
		}

		foreach ($findings as $finding) {
			$ctx = (array)($finding->ctx ?? []);
			$ctx['table'] = $ctx['table'] ?? $table;
			self::add(
				$response,
				(string)$finding->code,
				(string)$finding->severity,
				$ctx,
				(string)$finding->msg,
				$finding->sample ?? null
			);
		}
	}//end merge



	/**
	* DEFER
	* Queues a finding on a response that is NOT the top-level one (migrate_component_data
	* returns its own object and does not know the table). merge() replays these into the
	* real aggregation once the caller supplies the missing context.
	*
	* @param object $response
	* @param string $code
	* @param string $severity
	* @param array $ctx
	* @param string $msg
	* @param mixed $sample
	* @return void
	*/
	public static function defer(
		object $response,
		string $code,
		string $severity,
		array $ctx,
		string $msg,
		mixed $sample = null
	) : void {

		if (!isset($response->findings) || !is_array($response->findings)) {
			$response->findings = [];
		}

		// The sample is carried RAW and truncated later, by add(), and only for the first
		// occurrence of a group. Encoding here would mean a json_encode per row for a
		// defect that repeats across the whole table. The finding is consumed by merge()
		// immediately after this call returns, so nothing is retained.
		$response->findings[] = (object)[
			'code'		=> $code,
			'severity'	=> $severity,
			'ctx'		=> $ctx,
			'msg'		=> $msg,
			'sample'	=> $sample
		];

		// Deliberately does NOT touch $response->errors. Every caller of a deferring
		// function decides on ->result, which the deferring function sets explicitly, and
		// merge() is what puts the string on the PARENT's error list. Writing it here too
		// would double-count it the moment the parent merges.
	}//end defer



	/**
	* GET_REPORT
	* The aggregated verdict, ordered by severity (errors first, then notices, then the
	* repaired ones) and by count within each severity.
	*
	* @return object {
	*   fixed: int, notices: int, errors: int, errors_overflow: int,
	*   auto_fix: bool, groups: array<int,stdClass>
	* }
	*/
	public static function get_report() : object {

		$groups = array_values(self::$groups);

		$rank = [
			self::SEVERITY_ERROR	=> 0,
			self::SEVERITY_NOTICE	=> 1,
			self::SEVERITY_FIXED	=> 2
		];
		usort($groups, static function(object $a, object $b) use ($rank) : int {
			$by_severity = ($rank[$a->severity] ?? 9) <=> ($rank[$b->severity] ?? 9);
			return ($by_severity !== 0)
				? $by_severity
				: ($b->count <=> $a->count);
		});

		$totals = [
			self::SEVERITY_FIXED	=> 0,
			self::SEVERITY_NOTICE	=> 0,
			self::SEVERITY_ERROR	=> 0
		];
		foreach ($groups as $group) {
			$totals[$group->severity] = ($totals[$group->severity] ?? 0) + $group->count;
		}

		return (object)[
			'fixed'				=> $totals[self::SEVERITY_FIXED],
			'notices'			=> $totals[self::SEVERITY_NOTICE],
			'errors'			=> $totals[self::SEVERITY_ERROR],
			'errors_overflow'	=> self::$errors_overflow,
			'auto_fix'			=> self::$auto_fix,
			'groups'			=> $groups
		];
	}//end get_report



	/**
	* GROUP_LOCATIONS
	* The records a group touches, as a flat list, ids sorted and de-duplicated.
	*
	* @param object $group
	* @return array<int,object> - [{ table, section_tipo, ids: (int|string)[], truncated: bool }]
	*/
	public static function group_locations(object $group) : array {

		$out = [];
		foreach (($group->locations ?? []) as $location) {

			// NOTE the ids were stored as SET KEYS, and PHP silently casts a numeric string
			// key to int — so this is an int|string list, not a string list. Typed
			// accordingly: under strict_types a `string` hint here would only survive
			// because internal functions invoke callbacks in weak mode, which is not
			// something to build on.
			$ids = array_keys($location->ids);

			// numeric sort where possible: section_id is an integer column, and 10 sorting
			// before 9 in a list an operator has to read is just noise.
			usort($ids, static fn(int|string $a, int|string $b) : int => (is_numeric($a) && is_numeric($b))
				? ((int)$a <=> (int)$b)
				: strcmp((string)$a, (string)$b)
			);

			$out[] = (object)[
				'table'			=> $location->table,
				'section_tipo'	=> $location->section_tipo,
				'ids'			=> $ids,
				'truncated'		=> $location->truncated
			];
		}

		return $out;
	}//end group_locations



	/**
	* GROUP_SQL
	* Ready-to-paste SELECTs for the records a group touches — one per
	* (table, section_tipo), because a group can span both.
	*
	* This is the difference between "34 rows are wrong somewhere" and being able to look
	* at them. The operator gets a statement they can run as-is against the v6 database.
	*
	* section_id is an INTEGER column in every matrix table, so ids are emitted unquoted;
	* a non-numeric id (which should not exist) is quoted defensively rather than silently
	* producing invalid SQL. section_tipo is a varchar and is always quoted, with any
	* embedded quote doubled.
	*
	* @param object $group
	* @return array<int,string>
	*/
	public static function group_sql(object $group) : array {

		$out = [];
		foreach (self::group_locations($group) as $location) {

			if (empty($location->ids)) {
				continue;
			}

			$ids = array_map(
				static fn(int|string $id) : string => is_numeric($id)
					? (string)$id
					: "'" . str_replace("'", "''", (string)$id) . "'",
				$location->ids
			);

			$where = "section_tipo = '" . str_replace("'", "''", $location->section_tipo) . "'";
			// one id reads better as '=' than as a one-element IN list
			$where .= (count($ids) === 1)
				? ' AND section_id = ' . $ids[0]
				: ' AND section_id IN (' . implode(', ', $ids) . ')';

			$sql = 'SELECT * FROM ' . $location->table . ' WHERE ' . $where . ';';
			if ($location->truncated === true) {
				$sql .= ' -- first ' . self::LOCATIONS_CAP . ' ids only';
			}

			$out[] = $sql;
		}

		return $out;
	}//end group_sql



	/**
	* STORED_MODEL
	* The model name the ROW itself recorded when the value was written, dug out of the
	* v6 sidecar properties (`info.modelo`, or the legacy `inf` string
	* "Traducciones [component_project_langs]").
	*
	* This is the single most useful fact when the ontology model and the stored shape
	* disagree: it tells the operator what the value used to be, which the current
	* ontology can no longer say.
	*
	* @param mixed $value
	* @return string|null
	*/
	public static function stored_model(mixed $value) : ?string {

		if (!is_object($value)) {
			return null;
		}

		// modern sidecar: { info: { label: …, modelo: 'component_input_text' } }
		if (isset($value->info->modelo) && is_string($value->info->modelo) && $value->info->modelo !== '') {
			return $value->info->modelo;
		}

		// legacy sidecar: { inf: 'Traducciones [component_project_langs]' }
		if (isset($value->inf) && is_string($value->inf)
			&& preg_match('/\[([a-z0-9_]+)\]/', $value->inf, $matches) === 1) {
			return $matches[1];
		}

		return null;
	}//end stored_model



	/**
	* SAMPLE
	* A short, printable rendering of an offending value, for the group's example.
	* @param mixed $value
	* @return string
	*/
	private static function sample(mixed $value) : string {

		if ($value === null) {
			return '';
		}

		$encoded = is_string($value)
			? $value
			: (string)json_handler::encode($value);

		return mb_strimwidth($encoded, 0, self::SAMPLE_WIDTH, '…');
	}//end sample



}//end class v6_to_v7_normalize
