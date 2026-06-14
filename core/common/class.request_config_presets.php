<?php declare(strict_types=1);
/**
* CLASS REQUEST_CONFIG_PRESETS
* Loads and serves user-defined layout presets stored in the 'dd1244' section.
*
* Presets are named request_config overrides that users (or administrators) save
* to personalise the column layout and display options for a specific section view.
* When a preset exists for the triple (tipo, section_tipo, mode) the normal
* ontology-derived request_config is replaced by the preset's configuration so that
* the user sees the layout they last saved without touching the ontology.
*
* Responsibilities:
* - Scan the `matrix_list` table for all records in section 'dd1244' that carry
*   an "active" relation (dd1566 → dd64/1 = yes), hydrate them into lightweight
*   stdClass entries and cache the result in a PHP file and a per-request static.
* - Serve the matching preset for a given (tipo, section_tipo, mode) triple,
*   preferring the calling user's own preset over public (shared) presets.
* - Expose `clean_cache()` so callers (section save, section_record delete)
*   can invalidate both the file cache and the in-request static when the user
*   saves or deletes a preset record.
*
* Data shape produced by `get_active_request_config()`:
*   array<stdClass{
*     tipo: string,           // layout tipo (the component/section being configured)
*     section_tipo: string,   // target section tipo of the layout
*     mode: string,           // display mode, e.g. 'edit' | 'list'
*     user_id: string|null,   // section_id of the owning user record, or null for public
*     public: bool,           // whether the preset is visible to all users
*     data: request_config_object[]  // validated, hydrated config objects
*   }>
*
* Called from:
* - common::resolve_preset_properties() — injects the preset into the properties
*   override before build_request_config() proceeds.
* - section::save() / section_record::delete() — call clean_cache() after writes.
*
* @package Dédalo
* @subpackage Core
*/
class request_config_presets {


	/**
	* Base file name for the on-disk PHP cache that stores the full list of active
	* presets across requests. Managed by dd_cache::cache_to_file() and
	* dd_cache::cache_from_file(). Deleted by clean_cache() on any preset write.
	* @var string $active_request_config_cache_file_name
	*/
	public static string $active_request_config_cache_file_name = 'cache_active_request_config.php';

	/**
	* Per-request in-memory store for the active-preset list.
	* Null means "not yet loaded in this request" (a true cache miss that should
	* trigger a file-cache or DB lookup). An empty array is a valid honored value
	* meaning "no active presets exist" — it must never trigger a re-query.
	* Reset to null by clean_cache() so the next call re-reads from file/DB.
	* @var ?array $active_request_config_cache
	*/
	public static ?array $active_request_config_cache = null;



	/**
	* GET_ACTIVE_REQUEST_CONFIG
	* Returns the full list of currently active preset records from section dd1244.
	* Results are cached in a PHP file and in the static property to avoid repeated
	* DB queries within the same request and across requests.
	*
	* "Active" means the record carries a relation on component dd1566 ('Active') pointing
	* to section dd64 (the global yes/no section) with section_id '1' (yes). Inactive
	* presets are excluded from the result set by the SQL @> containment filter.
	*
	* The method bypasses the normal component/permission stack intentionally: reading
	* raw matrix rows directly avoids the overhead of permission checks and data
	* resolution that are irrelevant for this internal cache-warming path. Component
	* models and column names are resolved once before the pg_fetch_object loop and
	* reused for all rows for efficiency.
	*
	* Three-tier cache hierarchy:
	*   1. Static property ($active_request_config_cache) — fastest, resets with worker
	*   2. PHP file cache (cache_active_request_config.php) — survives across requests
	*   3. PostgreSQL matrix_list query — source of truth, result written to both caches
	*
	* (!) A cached empty array is a valid hit meaning "no active presets" and must be
	*     honored. Treating it as a miss would cause a DB query and file rewrite on
	*     every request until at least one preset is created.
	* (!) On query failure, the method returns an empty array WITHOUT writing the cache
	*     so that a transient DB error does not persist a broken empty result.
	*
	* @return array - List of active preset descriptors as stdClass objects.
	*                 Each entry has: tipo, section_tipo, mode, user_id, public, data.
	*                 Returns [] if no active presets exist or on DB failure.
	*/
	public static function get_active_request_config() : array {

		// static cache. null = not computed yet; [] is a valid honored value.
		if (self::$active_request_config_cache !== null) {
			return self::$active_request_config_cache;
		}

		// cache file read. cache_from_file returns null only on a missing/unreadable
		// file (the real miss); a cached empty array (no active presets) is a HIT and
		// must be honored, otherwise the file is rewritten via a DB search every request.
		$cache_data	= dd_cache::cache_from_file((object)[
			'file_name' => self::$active_request_config_cache_file_name
		]);
		if (is_array($cache_data)) {

			// static cache
			self::$active_request_config_cache = $cache_data;

			return $cache_data;
		}

		$active_request_config = [];

		// Search active request config records from database (matrix_list).
		// The @> containment operator on relation::jsonb filters for records
		// where component dd1566 ('Active') points to dd64/1 (yes/no section, record 1 = yes).
		$sql = '';
		$sql .= PHP_EOL . 'SELECT *';
		$sql .= PHP_EOL . 'FROM matrix_list';
		$sql .= PHP_EOL . "WHERE section_tipo = $1";
		$sql .= PHP_EOL . "AND matrix_list.relation::jsonb @> $2";
		$sql .= PHP_EOL . "ORDER BY section_id ASC";

		$result = matrix_db_manager::exec_search($sql, [
			DEDALO_REQUEST_CONFIG_PRESETS_SECTION_TIPO,
			'{"dd1566":[{"section_tipo": "dd64", "section_id": "1"}]}'
		]);

		// Never cache a failure state. On search failure return empty without
		// writing the cache (also guards the pg_fetch_object loop against false).
		if ($result === false) {
			debug_log(__METHOD__
				. " Search failed for active request config presets (not cached)"
				, logger::ERROR
			);
			return [];
		}

		// Prepare component info for fast access.
		// Each entry maps a semantic key to the ontology tipo, PHP model class name
		// (resolved once via ontology_node), and the matrix_list column that stores
		// the component's JSONB data (resolved once via section_record_data).
		// Component tipos for section dd1244:
		//   dd1242 — "Tipo" (string): the layout tipo being configured
		//   dd642  — "Section tipo" (string): the target section tipo
		//   dd1246 — "Mode" (string): display mode, e.g. 'edit' | 'list'
		//   dd654  — "User" (relation): the owning user; yields section_id of the user record
		//   dd640  — "Public" (relation to dd64): yes/no flag; section_id '1' = public
		//   dd625  — "Request config" (JSON): the full request_config_object array payload
		$ar_components_info = [
			'tipo'           => ['tipo' => 'dd1242', 'model' => null, 'column' => null],
			'section_tipo'   => ['tipo' => 'dd642',  'model' => null, 'column' => null],
			'mode'           => ['tipo' => 'dd1246', 'model' => null, 'column' => null],
			'user_id'        => ['tipo' => 'dd654',  'model' => null, 'column' => null],
			'public'         => ['tipo' => 'dd640',  'model' => null, 'column' => null],
			'request_config' => ['tipo' => 'dd625',  'model' => null, 'column' => null],
		];

		// Pre-calculate models and columns.
		// Done outside the row loop so ontology and column lookups run only once
		// regardless of how many preset records are returned.
		foreach ($ar_components_info as $key => &$info) {
			$info['model']  = ontology_node::get_model_by_tipo($info['tipo'], true);
			$info['column'] = section_record_data::get_column_name($info['model']);
		}
		unset($info); // break reference

		while ($row = pg_fetch_object($result)) {

			$section_tipo = $row->section_tipo;
			$section_id   = $row->section_id;

			// Get cached section record (hydrated with parsed row data).
			// Using section_record::get_instance avoids a separate DB hit; set_data
			// hydrates the instance directly from the already-fetched pg row.
			$section_record = section_record::get_instance($section_tipo, (int)$section_id);
			$section_record->set_data($row);

			// Extract raw data directly.
			// Returns the first datum object stored for the given component tipo and column,
			// or null when the component has no data in this record. Accessing [0] gives
			// the primary datum; individual properties (value, section_id) depend on the model.
			$get_raw_value = function($key) use ($section_record, $ar_components_info) {
				$info = $ar_components_info[$key];
				$data = $section_record->get_component_data($info['tipo'], ($info['column'] ?? ''));
				return $data[0] ?? null;
			};

			// 1. Simple values (string components)
			$tipo_obj         = $get_raw_value('tipo');
			$tipo             = $tipo_obj->value ?? '';

			$section_tipo_obj = $get_raw_value('section_tipo');
			$current_section_tipo = $section_tipo_obj->value ?? ''; // distinct from outer $section_tipo (pg row column)

			$mode_obj         = $get_raw_value('mode');
			$mode             = $mode_obj->value ?? '';

			// 2. Relations (user_id, public).
			// Relation components store their target as an object with a section_id property.
			// dd654 (user) yields the user's section_id as a string identifier.
			// dd640 (public) uses the yes/no section (dd64): section_id '1' = yes = public.
			$user_id_obj      = $get_raw_value('user_id');
			$user_id          = $user_id_obj->section_id ?? null;

			$public_obj       = $get_raw_value('public');
			$public           = isset($public_obj->section_id) && $public_obj->section_id == '1';

			// 3. JSON content.
			// dd625 stores the full request_config payload as a JSON array of config objects.
			// The raw value from the datum is decoded; empty/missing yields [].
			$config_obj       = $get_raw_value('request_config');
			$request_config   = $config_obj->value ?? [];

			// Validate essential data.
			// Skip records missing either key lookup field — they cannot be matched
			// against a (tipo, section_tipo, mode) triple in get_request_config().
			if (empty($tipo) || empty($current_section_tipo)) {
				continue;
			}

			// Normalize input.
			// The stored value may be a single object instead of an array if saved
			// from an older client; wrap it so the loop below always sees an array.
			$request_items = is_array($request_config) ? $request_config : [$request_config];

			// Normalize each request_config_object.
			// Construct a typed request_config_object so validation rules defined in
			// that class are applied. Log and skip individual invalid items rather than
			// discarding the entire preset record.
			$safe_request_config = [];
			foreach ($request_items as $current_item) {
				try {
					if (!is_object($current_item)) {
						// Skip empty/invalid items silently or throw if strict
						if(empty($current_item)) continue;
						throw new Exception("Invalid non object request_config_object item", 1);
					}
					$request_config_object = new request_config_object($current_item);
					if (!empty($request_config_object)) {
						$safe_request_config[] = $request_config_object;
					}
				} catch (Exception $e) {
					debug_log(__METHOD__
						. " Ignored invalid request_config_object item " . PHP_EOL
						. ' current_item: ' . to_string($current_item) . PHP_EOL
						. ' section_tipo: ' . $section_tipo  . PHP_EOL
						. ' section_id: ' . $section_id
						, logger::ERROR
					);
				}
			}

			// Only store if we have valid configs.
			// Preset records whose entire request_config payload was invalid are silently
			// excluded — they cannot contribute a usable layout override.
			if (!empty($safe_request_config)) {

				$item = new stdClass();
					$item->tipo           = $tipo;
					$item->section_tipo   = $current_section_tipo;
					$item->mode           = $mode;
					$item->user_id        = $user_id;
					$item->public         = $public;
					$item->data           = $safe_request_config;

				$active_request_config[] = $item;
			}
		}

		// static cache
		self::$active_request_config_cache = $active_request_config;

		// cache file write
		dd_cache::cache_to_file((object)[
			'file_name' => self::$active_request_config_cache_file_name,
			'data' => $active_request_config
		]);


		return $active_request_config;
	}//end get_active_request_config



	/**
	* GET_REQUEST_CONFIG
	* Returns the request_config_object array for the matching active preset, if any.
	* Looks up the full in-memory/file-cached list from get_active_request_config()
	* and finds the best match for the given (tipo, section_tipo, mode) triple using
	* a two-pass ownership strategy:
	*
	*   Pass 1 — personal preset: matches the calling user's own preset (user_id equals
	*             the current logged user's section_id). Personal presets take precedence
	*             over shared ones so each user can have an independent layout.
	*   Pass 2 — public preset: if no personal preset is found, falls back to any preset
	*             flagged as public (public === true) for the same triple. Public presets
	*             are shared across all users and serve as organisation-wide defaults.
	*
	* The returned array is passed directly into the section properties override by
	* common::resolve_preset_properties() and replaces the normal ontology-derived
	* request_config for this build only.
	*
	* @param string $tipo          - Layout tipo (the section/component identifier being configured)
	* @param string $section_tipo  - Target section tipo (the data section the layout applies to)
	* @param string $mode          - Display mode, e.g. 'edit' | 'list'
	* @return array                - Array of request_config_object instances, or [] if no preset matches
	*/
	public static function get_request_config( string $tipo, string $section_tipo, string $mode ) : array {

		if(SHOW_DEBUG===true) {
			$start_time=start_time();
			metrics::add_metric('presets_total_calls');
		}

		// Get cached list of active_request_config
		$active_request_config = self::get_active_request_config();

		// search way (slower)
		$found = array_find($active_request_config, function($el) use($tipo, $section_tipo, $mode) {
			return ($el->tipo === $tipo &&
					$el->section_tipo === $section_tipo &&
					$el->mode === $mode &&
					$el->user_id == logged_user_id()); // filter by owner user
		});

		// fallback to public presets
		if (empty($found)) {
			$found = array_find($active_request_config, function($el) use($tipo, $section_tipo, $mode) {
				return ($el->tipo === $tipo &&
						$el->section_tipo === $section_tipo &&
						$el->mode === $mode &&
						$el->public === true); // filter by public status
			});
		}

		if(SHOW_DEBUG===true) {
			metrics::add_metric('presets_total_time', $start_time);
		}

		// No presets found
		if (empty($found)) {
			return [];
		}

		// data (request config array)
		$data = $found->data ?? [];


		return $data;
	}//end get_request_config



	/**
	* CLEAN_CACHE
	* Invalidates both the on-disk PHP file cache and the per-request static cache
	* so that the next call to get_active_request_config() re-reads from the database.
	*
	* Called after any write that changes the preset list (section save, record delete)
	* to ensure callers within the same HTTP request see the updated data immediately
	* rather than the pre-write snapshot that is still held in the static property.
	*
	* (!) Must reset the static property to null (not []) so that the null-check in
	*     get_active_request_config() correctly treats the next call as a cache miss
	*     rather than an honored empty result.
	*
	* @return bool - Always true
	*/
	public static function clean_cache() : bool {

		// reset the in-request static too, otherwise a save within the same request
		// keeps serving the stale pre-save list from memory
		self::$active_request_config_cache = null;

		dd_cache::delete_cache_files([
			self::$active_request_config_cache_file_name
		]);

		return true;
	}//end clean_cache



}//end class request_config_presets
