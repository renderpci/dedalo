<?php declare(strict_types=1);
/**
* AREA_MAINTENANCE
* System administrator's maintenance area: widget catalogue, ontology management,
* config-core overrides, data-version migrations, and integrity tooling.
*
* This class is the business-logic layer of the Maintenance area in Dédalo's
* admin dashboard. It is never instantiated directly by HTTP handlers; instead,
* `dd_area_maintenance_api::class_request()` and `::widget_request()` route
* validated, permission-checked calls here.
*
* Responsibilities:
* - Widget catalogue: `get_ar_widgets()` builds the full ordered list of dashboard
*   widgets (backup, config, ontology, migration, diffusion, integrity, system, dev).
*   Each widget object carries the metadata the JS canvas needs to render the panel.
* - Config-core overrides: `set_config_core()` is the single write-gate for runtime
*   flags persisted in `config_core.php` (maintenance mode, recovery mode, media
*   access mode, notification banner). The allowlist is hard-coded to a fixed set of
*   constant names; unknown names are rejected immediately.
* - Ontology pipeline: `update_ontology()` downloads remote `.copy.gz` dumps,
*   imports them into PostgreSQL, syncs `dd_ontology`, rebuilds lang files, flushes
*   hierarchy caches, and saves a schema-diff file for the security-access audit trail.
* - Data-version migration: `update_data_version()` delegates to `update::update_version()`
*   (loaded on demand) and is restricted to DEDALO_SUPERUSER + maintenance mode.
* - Tool registration: `register_tools()` wraps `tools_register::import_tools()` with
*   error aggregation, giving the UI a single call to refresh all registered tools.
* - Integrity helpers: `create_test_record()` provisions a known row in `matrix_test`
*   for unit tests; `get_definitions_files()` serves transform-definition JSON files
*   for the migration widgets.
* - Security posture: two explicit allowlists (`BACKGROUND_RUNNABLE`, `API_ACTIONS`)
*   prevent accidental exposure of helpers; `get_file_constants()` and
*   `get_definitions_files()` both enforce realpath confinement (SEC-069).
*
* Extends: area_common (core/area_common/class.area_common.php)
* API entry point: dd_area_maintenance_api (core/api/v1/common/class.dd_area_maintenance_api.php)
*
* @package Dédalo
* @subpackage Core
*/
class area_maintenance extends area_common {



	/**
	 * SEC-024 / §9.1b: explicit allowlist of methods callable from CLI via
	 * `process_runner.php` (spawned by `exec_::request_cli` when the
	 * `dd_area_maintenance_api::class_request` caller passes
	 * `background_running:true`). Without this constant `process_runner`
	 * falls back to "any public-static method on the class is callable",
	 * exposing every helper on this class to background invocation.
	 *
	 * Only widgets that pass `background_running:true` from JS are listed
	 * (verified by grepping `background_running\s*:\s*true` under
	 * `core/area_maintenance/widgets/`). Synchronous-only widget actions
	 * (e.g. `update_ontology`, `set_maintenance_mode`, `register_tools`)
	 * are intentionally absent — they execute inside the request thread
	 * and never reach `process_runner`.
	 *
	 * @see core/base/process_runner.php
	 * @see core/api/v1/common/class.dd_area_maintenance_api.php
	 */
	public const array BACKGROUND_RUNNABLE = [
		'update_data_version',
		'long_process_stream',
	];



	/**
	 * SEC-044: explicit allowlist of methods callable through
	 * `dd_area_maintenance_api::class_request` (synchronous OR async).
	 * Without this constant, `class_request` falls back to "any public-static
	 * method on the class", exposing every helper on this class to invocation
	 * by anyone with maintenance-area write.
	 *
	 * The list below is derived by grepping `dd_area_maintenance_api` and
	 * `action: 'class_request'` under the area_maintenance widgets JS tree
	 * and `core/component_security_access/`. Adding a new JS caller
	 * requires extending this list; the failure mode is an explicit
	 * `permissions error` response visible in the dev console.
	 *
	 * `widget_request` uses the same gate against the dispatched widget
	 * class's own `API_ACTIONS` (rolled out per-widget in a follow-up).
	 */
	public const array API_ACTIONS = [
		'create_test_record',
		'long_process_stream',
		'rebuild_lang_files',
		'restore_dd_ontology_recovery_from_file',
		'set_maintenance_mode',
		'set_notification',
		'set_recovery_mode',
	];



	/**
	* GET_AR_WIDGETS
	* Builds and returns the ordered list of all maintenance-area dashboard widgets.
	*
	* Each widget is constructed as a plain stdClass and normalised through
	* `widget_factory()`. The resulting array is serialised into the area JSON
	* payload and consumed by the JS canvas which renders one collapsible panel per
	* widget. The ordering here controls the display order in the UI.
	*
	* Widget categories group panels in the sidebar navigation:
	*   'data'       — backup, versioning, hierarchy management
	*   'config'     — configuration checks, ontology, code updates, tool registration
	*   'migration'  — bulk-move operations (TLD, locator, portal, table, lang)
	*   'diffusion'  — publication API status, diffusion server process control
	*   'integrity'  — lock/sequence/counter/dataframe/media integrity checks
	*   'system'     — PHP runtime, database, environment, server diagnostics
	*   'dev'        — API and SQO test harnesses, unit-test runner
	*
	* Side effects: Several widgets eagerly fetch live data at build time:
	*   - `publication_api`     calls `diffusion_utils::get_diffusion_map()` (network probe)
	*   - `sequences_status`    calls `db_tasks::check_sequences()` (DB query)
	*   - `php_user`            calls `system::get_php_user_info()` + `system::get_error_log_path()`
	*   - Migration widgets     call `area_maintenance::get_definitions_files()` (filesystem scan)
	* Widgets with `background: true` (update_data_version, diffusion_server_control,
	* system_info) are loaded asynchronously on the JS side so their eager calls do
	* not block the initial page render.
	*
	* (!) Keep this method in sync with `get_ar_widget_ids()`. The drift guard in
	* test/server/area/area_maintenance_Test.php will fail if they diverge.
	*
	* @return array<object> Array of normalised widget stdClass objects.
	*/
	public function get_ar_widgets(): array {

		$ar_widgets = [];

		// make_backup *
		$item = new stdClass();
		$item->id = 'make_backup';
		$item->category = 'data';
		$item->type = 'widget';
		$item->label = label::get_label('make_backup') ?? 'Make backup';
		$ar_widgets[] = $this->widget_factory($item);

		// check_config *
		$item = new stdClass();
		$item->id = 'check_config';
		$item->category = 'config';
		$item->class = 'success';
		$item->type = 'widget';
		$item->label = label::get_label('check_config') ?? 'Check config';
		$ar_widgets[] = $this->widget_factory($item);

		// config_areas *
		$item = new stdClass();
		$item->id = 'config_areas';
		$item->category = 'config';
		$item->type = 'widget';
		// Prefer an ontology label term (properties.name='config_areas', translatable like
		// the other widgets). Until that term is authored, label::get_label() returns the
		// key wrapped in <mark>, so fall back to a readable literal — and auto-upgrade to the
		// ontology label as soon as it exists, with no code change needed.
		$config_areas_label = label::get_label('config_areas');
		$item->label = (mb_strpos($config_areas_label, '<mark') === false)
			? $config_areas_label
			: 'Config areas (allow/deny)';
		$ar_widgets[] = $this->widget_factory($item);

		// menu_skip_tipos *
		$item = new stdClass();
		$item->id = 'menu_skip_tipos';
		$item->category = 'config';
		$item->type = 'widget';
		// Prefer an ontology label term; fall back to a readable literal (auto-upgrades when authored).
		$menu_skip_label = label::get_label('menu_skip_tipos');
		$item->label = (mb_strpos($menu_skip_label, '<mark') === false)
			? $menu_skip_label
			: 'Menu: skip grouping tipos';
		$ar_widgets[] = $this->widget_factory($item);

		// update_ontology *
		$item = new stdClass();
		$item->id = 'update_ontology';
		$item->category = 'config';
		$item->type = 'widget';
		$item->label = label::get_label('update_ontology') ?? 'Update Ontology';
		$ar_widgets[] = $this->widget_factory($item);

		// register_tools *
		$item = new stdClass();
		$item->id = 'register_tools';
		$item->category = 'config';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = label::get_label('registrar_herramientas');
		$ar_widgets[] = $this->widget_factory($item);

		// move_tld
		$item = new stdClass();
		$item->id = 'move_tld';
		$item->category = 'migration';
		$item->type = 'widget';
		$item->label = label::get_label('move_tld') ?? 'Move TLD';
		$item->value = (object) [
			'body' => 'Move TLD defined map items from source (ex. numisdata279) to target (ex. tchi1).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_tld.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_tld')
		];
		$ar_widgets[] = $this->widget_factory($item);

		$item = new stdClass();
		$item->id = 'move_locator';
		$item->category = 'migration';
		$item->type = 'widget';
		$item->label = label::get_label('move_locator') ?? 'Move locator';
		$item->value = (object) [
			'body' => 'Move locator defined map items from source (ex. rsc194) to target (ex. rsc197) adding new section_id based in the last section_id of destiny.<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_locator.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_locator')
		];
		$ar_widgets[] = $this->widget_factory($item);

		// move_to_portal
		$item = new stdClass();
		$item->id = 'move_to_portal';
		$item->category = 'migration';
		$item->type = 'widget';
		$item->label = label::get_label('move_to_portal') ?? 'Move to portal';
		$item->value = (object) [
			'body' => 'Move data from a section to another linked section and link together with a portal (e.g. "Use and function" components behind qdp443 to section rsc1340).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_portal.<br>
							   Note: this can be a very long process because it has to go through all the records in all the tables.',
			'files' => area_maintenance::get_definitions_files('move_to_portal')
		];
		$ar_widgets[] = $this->widget_factory($item);

		// move_to_table
		$item = new stdClass();
		$item->id = 'move_to_table';
		$item->category = 'migration';
		$item->type = 'widget';
		$item->label = label::get_label('move_to_table') ?? 'Move to table';
		$item->value = (object) [
			'body' => 'Move data from a table to another (e.g. move utoponymy1 to matrix_hierarchy).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_to_table.<br>',
			'files' => area_maintenance::get_definitions_files('move_to_table')
		];
		$ar_widgets[] = $this->widget_factory($item);

		// move_lang
		$item = new stdClass();
		$item->id = 'move_lang';
		$item->category = 'migration';
		$item->type = 'widget';
		$item->label = label::get_label('move_lang') ?? 'Move LANG';
		$item->value = (object) [
			'body' => 'Convert map items (e.g., hierarchy89) between translatable and non-translatable components (or vice-versa).<br>
							   Uses JSON file definitions located in /dedalo/core/base/transform_definition_files/move_lang.<br>
							   Note: This process can be very time-consuming, as it iterates through all relevant records in the database.',
			'files' => area_maintenance::get_definitions_files('move_lang')
		];
		$ar_widgets[] = $this->widget_factory($item);

		// build_database_version *
		$item = new stdClass();
		$item->id = 'build_database_version';
		$item->category = 'data';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = label::get_label('build_database_version') ?? 'Build database version';
		$ar_widgets[] = $this->widget_factory($item);

		// update_data_version *
		$item = new stdClass();
		$item->id = 'update_data_version';
		$item->category = 'data';
		$item->class = 'success width_100';
		$item->type = 'widget';
		$item->background = true; // load at idle while collapsed to surface available-update status
		$item->tipo = $this->tipo;
		$item->label = label::get_label('update') . ' ' . label::get_label('data');
		$ar_widgets[] = $this->widget_factory($item);

		// update_code *
		$item = new stdClass();
		$item->id = 'update_code';
		$item->category = 'config';
		$item->type = 'widget';
		$item->label = label::get_label('update') . ' ' . label::get_label('code');
		$ar_widgets[] = $this->widget_factory($item);

		// export_hierarchy *
		$item = new stdClass();
		$item->id = 'export_hierarchy';
		$item->category = 'data';
		$item->class = 'success width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = label::get_label('export_hierarchy') ?? 'Export hierarchy';
		$ar_widgets[] = $this->widget_factory($item);

		// publication_api *
		$item = new stdClass();
		$item->id = 'publication_api';
		$item->category = 'diffusion';
		$item->type = 'widget';
		$item->label = 'Publication server API';
		$item->value = (object) [
			'dedalo_diffusion_domain' => DEDALO_DIFFUSION_DOMAIN,
			'dedalo_diffusion_resolve_levels' => DEDALO_DIFFUSION_RESOLVE_LEVELS,
			'api_web_user_code_multiple' => API_WEB_USER_CODE_MULTIPLE,
			'dedalo_diffusion_langs' => DEDALO_DIFFUSION_LANGS,
			'diffusion_map' => diffusion_utils::get_diffusion_map(
				DEDALO_DIFFUSION_DOMAIN,
				true // bool connection_status
			)
		];
		$ar_widgets[] = $this->widget_factory($item);

		// diffusion_server_control *
		$item = new stdClass();
		$item->id = 'diffusion_server_control';
		$item->category = 'diffusion';
		$item->type = 'widget';
		$item->background = true; // load at idle while collapsed to surface server-down status
		$item->tipo = $this->tipo;
		$item->label = label::get_label('diffusion_server_control') ?? 'Diffusion server control';
		$ar_widgets[] = $this->widget_factory($item);

		// add_hierarchy *
		$item = new stdClass();
		$item->id = 'add_hierarchy';
		$item->category = 'data';
		$item->type = 'widget';
		$item->class = 'success width_100';
		$item->label = label::get_label('instalar') . ' ' . label::get_label('jerarquias');
		$ar_widgets[] = $this->widget_factory($item);

		// dedalo_api_test_environment *
		$item = new stdClass();
		$item->id = 'dedalo_api_test_environment';
		$item->category = 'dev';
		$item->class = 'green fit width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'DÉDALO API TEST ENVIRONMENT';
		$ar_widgets[] = $this->widget_factory($item);

		// sqo_test_environment *
		$item = new stdClass();
		$item->id = 'sqo_test_environment';
		$item->category = 'dev';
		$item->class = 'blue fit width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'SEARCH QUERY OBJECT TEST ENVIRONMENT';
		$ar_widgets[] = $this->widget_factory($item);

		// lock_components *
		$item = new stdClass();
		$item->id = 'lock_components';
		$item->category = 'integrity';
		$item->class = 'width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'Lock components status';
		$item->value = (object) [
			'active_users' => (object) [ // mimic api response object
				'result' => true,
				'ar_user_actions' => []
			]
		];
		$ar_widgets[] = $this->widget_factory($item);

		// php_runtime *
		$php_user_info = system::get_php_user_info();
		$php_error_log_path = system::get_error_log_path();
		// Widget classes are not autoloaded (they are require_once'd on demand by
		// dd_area_maintenance_api); load it here to reuse its opcache status reader.
		require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/php_runtime/class.php_runtime.php';
		$item = new stdClass();
		$item->id = 'php_runtime';
		$item->category = 'system';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'PHP RUNTIME';
		$item->value = (object) [
			'info' => $php_user_info,
			'php_error_log_path' => $php_error_log_path,
			'php_session_path' => session_save_path(),
			'environment' => php_runtime::get_environment(),
			'opcache' => php_runtime::get_opcache_status(),
			'directories' => php_runtime::get_directories_status()
		];
		$ar_widgets[] = $this->widget_factory($item);

		// database_info *
		$item = new stdClass();
		$item->id = 'database_info';
		$item->category = 'system';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'DATABASE INFO';
		$ar_widgets[] = $this->widget_factory($item);

		// environment *
		$item = new stdClass();
		$item->id = 'environment';
		$item->category = 'system';
		$item->type = 'widget';
		$item->label = 'Environment';
		$ar_widgets[] = $this->widget_factory($item);

		// unit_test *
		$item = new stdClass();
		$item->id = 'unit_test';
		$item->category = 'dev';
		$item->type = 'widget';
		$item->label = 'Unit test area';
		$ar_widgets[] = $this->widget_factory($item);

		// sequences_status *
		$response = db_tasks::check_sequences();
		$item = new stdClass();
		$item->id = 'sequences_status';
		$item->category = 'integrity';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'DB SEQUENCES STATUS';
		$item->value = $response;
		$ar_widgets[] = $this->widget_factory($item);

		// media_control *
		$item = new stdClass();
		$item->id = 'media_control';
		$item->category = 'integrity';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = label::get_label('media_control') ?? 'Media access control';
		$ar_widgets[] = $this->widget_factory($item);

		// counters_status *
		$item = new stdClass();
		$item->id = 'counters_status';
		$item->category = 'integrity';
		$item->class = 'width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'DEDALO COUNTERS STATUS';
		$ar_widgets[] = $this->widget_factory($item);

		// dataframe_control *
		$item = new stdClass();
		$item->id = 'dataframe_control';
		$item->category = 'integrity';
		$item->class = 'width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'DATAFRAME PAIRING INTEGRITY';
		$ar_widgets[] = $this->widget_factory($item);

		// php_info *
		$item = new stdClass();
		$item->id = 'php_info';
		$item->category = 'system';
		$item->class = 'violet fit width_100';
		$item->type = 'widget';
		$item->tipo = $this->tipo;
		$item->label = 'PHP INFO';
		$item->value = (object) [
			'src' => DEDALO_CORE_URL . '/area_maintenance/widgets/php_info/php_info.php'
		];
		$ar_widgets[] = $this->widget_factory($item);

		// system_info *
		$item = new stdClass();
		$item->id = 'system_info';
		$item->category = 'system';
		$item->type = 'widget';
		$item->background = true; // load at idle while collapsed to surface server-issue status
		$item->tipo = $this->tipo;
		$item->label = 'SYSTEM INFO';
		$item->class = 'width_100';
		$item->value = (object) [
			'src' => DEDALO_CORE_URL . '/area_maintenance/system_info.php'
		];
		$ar_widgets[] = $this->widget_factory($item);


		return $ar_widgets;
	}//end get_ar_widgets



	/**
	 * GET_AR_WIDGET_IDS
	 * Lightweight, side-effect-free list of the widget IDs enumerated by
	 * get_ar_widgets(). Used by the API to validate a requested widget name
	 * without building every widget — get_ar_widgets() probes diffusion
	 * connections, reads definition files and runs DB sequence checks, which
	 * is wasteful (and noisy) for a simple whitelist check on a polled request.
	 *
	 * Kept in sync with get_ar_widgets() by the drift guard in
	 * test/server/area/area_maintenance_Test.php.
	 * @return array Array of widget id strings.
	 */
	public function get_ar_widget_ids(): array {

		return [
			'make_backup',
			'check_config',
			'config_areas',
			'menu_skip_tipos',
			'update_ontology',
			'register_tools',
			'move_tld',
			'move_locator',
			'move_to_portal',
			'move_to_table',
			'move_lang',
			'build_database_version',
			'update_data_version',
			'update_code',
			'export_hierarchy',
			'publication_api',
			'diffusion_server_control',
			'add_hierarchy',
			'dedalo_api_test_environment',
			'sqo_test_environment',
			'lock_components',
			'php_runtime',
			'database_info',
			'environment',
			'unit_test',
			'sequences_status',
			'media_control',
			'counters_status',
			'dataframe_control',
			'php_info',
			'system_info'
		];
	}//end get_ar_widget_ids



	/**
	* WIDGET_FACTORY
	* Normalises a partially-specified widget descriptor into a complete widget object.
	*
	* Callers (all inside `get_ar_widgets()`) construct a minimal stdClass with only
	* the fields they care about and pass it here. This factory fills every expected
	* field with a sensible default so the JS canvas can always rely on a consistent
	* shape without null-checking every property.
	*
	* Output shape (all fields always present):
	* {
	*   id:         string   — widget identifier, matches the widget directory name
	*   class:      ?string  — optional CSS modifier class(es) for the panel element
	*   category:   string   — sidebar group key (default 'general')
	*   type:       'widget' — always 'widget'
	*   tipo:       string   — ontology tipo of the parent area (or item override)
	*   parent:     string   — tipo of the containing area (used for context routing)
	*   label:      string   — localised display name shown in the panel header
	*   info:       ?string  — optional secondary info text
	*   body:       ?string  — optional HTML body pre-injected into the panel
	*   run:        array    — list of JS action descriptors; empty by default
	*   trigger:    ?mixed   — client-side trigger descriptor; null by default
	*   value:      ?mixed   — pre-loaded payload surfaced to JS without an extra fetch
	*   background: bool     — when true JS loads the widget value lazily at idle time
	* }
	*
	* @param object $item - Partial widget descriptor; only set fields override defaults.
	* @return object - Fully-populated widget stdClass.
	*/
	public function widget_factory(object $item): object {

		$widget = new stdClass();
		$widget->id = $item->id;
		$widget->class = $item->class ?? null;
		$widget->category = $item->category ?? 'general';
		$widget->type = 'widget';
		$widget->tipo = $item->tipo ?? $this->tipo;
		$widget->parent = $item->parent ?? $this->tipo;
		$widget->label = $item->label ?? 'Undefined label for: ' . $this->tipo;
		$widget->info = $item->info ?? null;
		$widget->body = $item->body ?? null;
		$widget->run = $item->run ?? [];
		$widget->trigger = $item->trigger ?? null;
		$widget->value = $item->value ?? null;
		$widget->background = $item->background ?? false;


		return $widget;
	}//end widget_factory



	/**
	* GET_FILE_CONSTANTS
	* Parses a PHP config file and returns the names of all `define()` calls found in it.
	*
	* The method is used by the `check_config` widget to enumerate the constants declared
	* in a given config file so the UI can display which runtime flags are in effect.
	*
	* Security (SEC-069): the argument is resolved through `realpath()` and then checked
	* against a hard-coded set of allowed roots (`DEDALO_CONFIG_PATH`, `DEDALO_CORE_PATH`).
	* Any path that resolves outside those roots — or fails to resolve at all — returns an
	* empty array and logs an ERROR. This guards against future API_ACTIONS entries or
	* dispatcher refactors inadvertently forwarding user-controlled paths here.
	*
	* The regex pattern `[^\/\/ #]define\('(\S*)',.*` intentionally skips lines
	* that are commented out with `//` or `#`. Only the constant name (capture group 1) is
	* returned; values are not extracted.
	*
	* @param string $file - Absolute path to the PHP config file to parse
	*                       (e.g. DEDALO_CONFIG_PATH . '/config.php').
	* @return array<string> - List of constant names defined in the file; empty on failure.
	*/
	public static function get_file_constants(string $file): array {

		// SEC-069: realpath containment. Every current caller passes a path
		// built from DEDALO_CONFIG_PATH, but this method is public-static and
		// could be reached by a future API_ACTIONS entry or by dispatcher
		// refactor. Resolve the argument and confine it to the known roots.
		$real = realpath($file);
		if ($real === false) {
			return [];
		}
		$allowed_roots = array_filter([
			defined('DEDALO_CONFIG_PATH') ? realpath(DEDALO_CONFIG_PATH) : null,
			defined('DEDALO_CORE_PATH') ? realpath(DEDALO_CORE_PATH) : null,
		]);
		$inside = false;
		foreach ($allowed_roots as $root) {
			if (strncmp($real, $root . DIRECTORY_SEPARATOR, strlen($root) + 1) === 0) {
				$inside = true;
				break;
			}
		}
		if (!$inside) {
			debug_log(
				__METHOD__
				. ' Refused to read file outside allowed roots: ' . to_string($file)
				,
				logger::ERROR
			);
			return [];
		}

		$input_lines = file_get_contents($real);
		if (empty($input_lines)) {
			return [];
		}

		// regex search
		preg_match_all('/[^\/\/ #]define\(\'(\S*)\',.*/', $input_lines, $output_array);
		$constants_list = $output_array[1] ?? [];


		return $constants_list;
	}//end get_file_constants



	/**
	* CREATE_DB_EXTENSIONS
	* Ensures that the required PostgreSQL extensions (e.g. `uuid-ossp`, `pg_trgm`)
	* are installed in the current database.
	*
	* Delegates entirely to `db_tasks::create_extensions()`. Exposed here so the
	* maintenance UI can trigger extension creation without direct DB shell access.
	* Idempotent: running it on a database that already has the extensions is safe.
	*
	* @return object - Response object from db_tasks::create_extensions()
	*                  {result: bool, msg: string, errors?: array}.
	*/
	public static function create_db_extensions(): object {

		$response = db_tasks::create_extensions();

		return $response;
	}//end create_db_extensions



	/**
	* EXEC_DB_MAINTENANCE
	* Runs basic PostgreSQL maintenance operations (VACUUM, ANALYZE, REINDEX) to
	* reclaim storage and refresh query-planner statistics.
	*
	* Delegates to `db_tasks::exec_maintenance()`. Intended to be called after bulk
	* data imports or schema migrations where index bloat or stale statistics could
	* affect query performance. This can be a long-running operation on large databases.
	*
	* @return object - Response object from db_tasks::exec_maintenance()
	*                  {result: bool, msg: string, errors?: array}.
	*/
	public static function exec_db_maintenance(): object {

		$response = db_tasks::exec_maintenance();

		return $response;
	}//end exec_db_maintenance



	/**
	* LONG_PROCESS_STREAM
	* Developer diagnostic: emits a timed sequence of progress events to exercise
	* the long-running background-process infrastructure and surface timeout issues.
	*
	* The method has two execution branches depending on `running_in_cli()`:
	*
	* CLI branch (spawned by `process_runner.php` via `exec_::request_cli()`):
	*   Loops `$iterations` times, sleeping `$update_rate` ms between each tick.
	*   Each iteration calls `print_cli()` which writes a JSON progress object to
	*   stdout; `process_runner` relays this to the JS poller via the status file.
	*   Also triggers a PHP `E_USER_NOTICE` via `trigger_error()` each iteration so
	*   the ini_get error_log path can be verified in the server error log.
	*   Returns a summary object when the loop finishes.
	*
	* HTTP/SSE branch (direct AJAX call, no background_running flag):
	*   Emits an `text/event-stream` (Server-Sent Events) response. The session is
	*   closed before the loop starts to prevent blocking other requests on the same
	*   session. Each tick writes a JSON line followed by `\n\n` and flushes all
	*   output buffers. Apache HTTP/1.1 requires chunks ≥ 4096 bytes to avoid
	*   buffering; undersized payloads are padded with a `fill_buffer` field.
	*   The loop exits when `connection_aborted()` returns true (client disconnected).
	*   The `return` at the end of the HTTP branch is unreachable at runtime but
	*   satisfies PHP's strict `object` return type declaration.
	*
	* This method is listed in `BACKGROUND_RUNNABLE` (process_runner gate) and
	* `API_ACTIONS` (class_request gate).
	*
	* @param object $options - {
	*   iterations:  int [= 10]   — number of ticks before the CLI loop exits
	*   update_rate: int [= 1000] — milliseconds between ticks in both branches
	* }
	* @return object - CLI: summary {msg, iterations, update_rate, memory};
	*                  HTTP: unreachable stub {result: false, msg: 'Stream ended'}.
	*/
	public static function long_process_stream(object $options): object {

		// options
		$iterations = $options->iterations ?? 10;
		$update_rate = $options->update_rate ?? 1000;

		// error_log_path
		$error_log_path = ini_get('error_log');

		if (running_in_cli() === true) {

			// executing from dd_utils_api::get_process_status (area maintenance panel)

			$counter = 0;
			while (1) {

				$counter++;

				trigger_error('FAKE ERROR TESTING CLI ERROR LOG ini_get error_log: ' . $error_log_path . ' - ' . $counter . ' ');

				// end runner case
				if ($counter > $iterations) {
					$result = (object) [
						'msg' => 'Iterations completed ' . $iterations,
						'iterations' => $iterations,
						'update_rate' => $update_rate,
						'memory' => dd_memory_usage()
					];
					// return is printed by manager too
					return $result; // stop the loop here
				}

				// print notification
				print_cli((object) [
					'msg' => 'Iteration ' . $counter . ' of ' . $iterations,
					'iterations' => $iterations,
					'update_rate' => $update_rate,
					'memory' => dd_memory_usage()
				]);

				// sleep process
				$ms = $update_rate;
				usleep((int) $ms * 1000);
			}

		} else {

			// direct call version

			$start_time = start_time();

			// session unlock
			session_write_close();

			// header print as event stream
			header("Content-Type: text/event-stream");
			header("Cache-Control: no-cache");
			header('Connection: keep-alive');
			header("Access-Control-Allow-Origin: *");
			header('X-Accel-Buffering: no'); // nginx buffer control

			$i = 0;
			while (1) {

				$counter = $i++;

				$data = (object) [
					'msg' => '(no cli version) Iteration ' . $counter
				];

				$output = (object) [
					'is_running' => true,
					'data' => $data,
					'time' => date("Y-m-d H:i:s"),
					'total_time' => exec_time_unit_auto($start_time),
					'update_rate' => $update_rate,
					'errors' => []
				];

				// debug
				if (SHOW_DEBUG === true) {
					error_log('process loop: is_running output: ' . PHP_EOL . json_encode($output));
				}

				// output the response JSON string
				$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);

				// fix Apache issue where small chunks are not sent correctly over HTTP
				if ($_SERVER['SERVER_PROTOCOL'] === 'HTTP/1.1') {
					$len = strlen($a);
					if ($len < 4096) {
						// re-create the output object and the final string
						$fill_length = 4096 - $len;
						$output->fill_buffer = $fill_length . str_pad(' ', $fill_length);
						$a = json_handler::encode($output, JSON_UNESCAPED_UNICODE);
					}
				}

				echo $a;
				echo "\n\n";

				while (ob_get_level() > 0) {
					ob_end_flush();
				}
				flush();

				// break the loop if the client aborted the connection (closed the page)
				if (connection_aborted())
					break;

				$ms = (int) $update_rate;
				usleep($ms * 1000);
			}

			// This code is unreachable but required for type safety
			// to satisfy the object return type declaration
			$response = new stdClass();
			$response->result = false;
			$response->msg = 'Stream ended';

			return $response;
		}
	}//end long_process_stream



	/**
	* CREATE_TEST_RECORD
	* Provisions a known fixture record in `matrix_test` so that unit tests have
	* a deterministic starting state.
	*
	* The operation runs three sequential SQL statements:
	*   1. TRUNCATE matrix_test       — removes any leftover rows from prior runs.
	*   2. ALTER SEQUENCE … RESTART   — resets the id auto-increment to 1 so test
	*                                   assertions on section_id are stable.
	*   3. INSERT INTO matrix_test    — inserts a single row whose `datos` column is
	*                                   populated from the bundled `test_data.json`
	*                                   file next to this class file.
	*
	* Precondition: the `matrix_test` table and its sequence `matrix_test_id_seq`
	* must already exist in PostgreSQL (created by the DB install scripts). If the
	* table is absent all three statements will fail with a pg_last_error() message.
	*
	* This method is listed in `API_ACTIONS` and is callable from the `unit_test`
	* widget in the maintenance dashboard.
	*
	* @return object - {result: bool, msg: string}; result is false if any SQL step
	*                  fails, with msg containing the pg_last_error() details.
	*/
	public static function create_test_record(): object {

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed ' . __METHOD__;

		// short vars
		$db_conn = DBi::_getConnection();
		$section_tipo = 'test3';
		$table = 'matrix_test';

		// test data
		$test_data = file_get_contents(dirname(__FILE__) . '/test_data.json');

		// exec SQL
		// Statement 1: TRUNCATE table
		$sql1 = 'TRUNCATE TABLE ' . $table;
		$result = pg_query($db_conn, $sql1);
		if (!$result) {
			$msg = " Error on TRUNCATE: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql1
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		// Statement 2: Reset sequence
		$sql2 = 'ALTER SEQUENCE ' . $table . '_id_seq RESTART WITH 1';
		$result = pg_query($db_conn, $sql2);
		if (!$result) {
			$msg = " Error on ALTER SEQUENCE: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql2
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		// Statement 3: INSERT data (using prepared statement for security)
		$sql3 = 'INSERT INTO ' . $table . ' ("section_id", "section_tipo", "datos") VALUES ($1, $2, $3)';
		$result = pg_query_params($db_conn, $sql3, ['1', $section_tipo, $test_data]);
		if (!$result) {
			$msg = " Error on INSERT: " . pg_last_error($db_conn);
			debug_log(
				__METHOD__
				. $msg . PHP_EOL
				. ' SQL: ' . $sql3
				,
				logger::ERROR
			);
			$response->msg = $msg;
			return $response;
		}

		$response->result = true;
		$response->msg = 'OK. Request done ' . __METHOD__;


		return $response;
	}//end create_test_record



	/**
	* REGISTER_TOOLS
	* Scans all tool directories, reads their `register.json` files, and persists
	* the tool metadata into the Dédalo ontology/database (via `tools_register::import_tools()`).
	*
	* This is the server-side handler for the `register_tools` widget button. It must
	* be re-run whenever a new tool is added or an existing tool's `register.json` is
	* updated (e.g. after a code deploy).
	*
	* Error aggregation: each imported tool object may carry an `errors` array; this
	* method merges all of them into a single flat errors list on the response so the UI
	* can display a consolidated warning without having to dig into per-tool results.
	*
	* @return object - {
	*   result: array<object>|false — on success the list of imported tool result objects;
	*                                 false only if import_tools() itself fails entirely,
	*   msg:    string              — 'OK. Request done successfully' or a warning,
	*   errors: array               — merged list of per-tool error strings.
	* }
	*/
	public static function register_tools(): object {

		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// import_tools
		$response->result = tools_register::import_tools();

		// check results errors
		$errors = [];
		if (!empty($response->result)) {
			foreach ($response->result as $item) {
				if (!empty($item->errors)) {
					$errors = array_merge($errors, (array) $item->errors);
				}
			}
		}
		$response->errors = $errors;

		$response->msg = empty($errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end register_tools



	/**
	* UPDATE_DATA_VERSION
	* Runs the pending data-version migration scripts against the live database.
	*
	* Migrations can alter component data formats, add or rename tables, create or
	* drop indexes, and run arbitrary PHP scripts. They are versioned (e.g. 5.8.2 →
	* 6.0.0) and each migration step is gated by the corresponding key in
	* `$options->updates_checked`. Only steps whose key maps to `true` are executed;
	* unchecked steps are skipped.
	*
	* Hard preconditions (enforced before delegating to `update::update_version()`):
	*   1. The currently logged-in user must be DEDALO_SUPERUSER.
	*   2. The instance must be in maintenance mode (DEDALO_MAINTENANCE_MODE_CUSTOM or
	*      DEDALO_MAINTENANCE_MODE must be `true`). This prevents running migrations
	*      while normal users are editing data.
	*
	* The update class is loaded on demand (`include_once`) because it is only needed
	* during migrations and should not be part of the normal request bootstrap.
	*
	* Exceptions thrown inside `update::update_version()` are caught, logged, and
	* appended to the update log at DEDALO_CONFIG_PATH/update.log.
	*
	* This method is listed in both `BACKGROUND_RUNNABLE` and (implicitly, through
	* `class_request`) the gated action set. The `update_data_version` widget sets
	* `background_running: true` so the call is spawned as a detached CLI process.
	* Time limit is set to 3 days (259200 s) to accommodate large-dataset migrations.
	*
	* @param object $options - {
	*   updates_checked: object — map of migration-step keys to bool; only true steps run.
	*                             e.g. {"SQL_update_1": true, "components_update_1": false}
	* }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function update_data_version(object $options): object {

		// options
		$updates_checked = $options->updates_checked;

		// set time limit
		set_time_limit(259200);  // 3 days

		include_once DEDALO_CORE_PATH . '/base/update/class.update.php';

		$response = new stdClass();
		$response->result = false;
		$response->errors = [];
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';

		// DEDALO_SUPERUSER only
		if (logged_user_id() != DEDALO_SUPERUSER) {
			$response->msg = 'Error. Only Dédalo superuser can do this action';
			return $response;
		}

		// DEDALO_MAINTENANCE_MODE
		$maintenance_mode = defined('DEDALO_MAINTENANCE_MODE_CUSTOM')
			? DEDALO_MAINTENANCE_MODE_CUSTOM
			: DEDALO_MAINTENANCE_MODE;
		if ($maintenance_mode !== true) {
			$response->msg = 'Error. Update data is not allowed if Dédalo is not in maintenance_mode';
			return $response;
		}

		try {

			// exec update_data_version. return object response
			$update_data_version_response = update::update_version($updates_checked);

		} catch (Exception $e) {

			debug_log(
				__METHOD__
				. " Caught exception [update_data_version]: " . PHP_EOL
				. ' msg: ' . $e->getMessage()
				,
				logger::ERROR
			);

			$update_data_version_response = (object) [
				'result' => false,
				'msg' => 'ERROR on update_data_version .Caught exception: ' . $e->getMessage()
			];

			// log line
			$update_log_file = DEDALO_CONFIG_PATH . '/update.log';
			$log_line = PHP_EOL . date('c') . ' ERROR [Exception] ';
			$log_line .= PHP_EOL . 'Caught exception: ' . $e->getMessage();
			file_put_contents($update_log_file, $log_line, FILE_APPEND | LOCK_EX);
		}

		$response->result = $update_data_version_response->result ?? false;
		$response->msg = $update_data_version_response->msg ?? 'Error. Request failed [' . __FUNCTION__ . ']';
		$response->errors = array_merge($response->errors, $update_data_version_response->errors);


		return $response;
	}//end update_data_version



	/**
	* SET_CONFIG_CORE
	* Single write-gate for persisting runtime-override constants into `config_core.php`.
	*
	* This is the only place in Dédalo that may write to the config_core file. All
	* public set_* methods (`set_maintenance_mode`, `set_recovery_mode`,
	* `set_media_access_mode`, `set_notification`) delegate here rather than writing
	* the file directly, ensuring that access control and value validation are applied
	* consistently.
	*
	* Behaviour depends on whether the constant already exists in the file:
	*   - Not present: appends `define('NAME', value);` via `FILE_APPEND | LOCK_EX`.
	*   - Already present: replaces the existing `define(…)` line via regex + full
	*     file rewrite with `LOCK_EX`.
	*
	* Access control:
	*   - The logged-in user must be DEDALO_SUPERUSER for all constants except
	*     `DEDALO_RECOVERY_MODE`. The recovery-mode exception allows the system to
	*     set this flag during an API boot-failure scenario where the ontology is
	*     unavailable (see `dd_core_api->start`).
	*
	* Allowlisted constant names and their permitted value types:
	*   DEDALO_MAINTENANCE_MODE_CUSTOM   — bool (serialised via json_encode)
	*   DEDALO_RECOVERY_MODE             — bool (serialised via json_encode)
	*   DEDALO_MEDIA_ACCESS_MODE_CUSTOM  — null | false | 'private' | 'publication'
	*   DEDALO_NOTIFICATION_CUSTOM       — bool | string (XSS-sanitised via safe_xss)
	*
	* Any name not in the switch is rejected with an 'Error. Invalid name' response.
	* Any value of a wrong type for the matched name is also rejected.
	*
	* The `config_core_file_path` is resolved through `installer::get_config()` rather
	* than a hardcoded path so that install overrides are respected.
	*
	* @param object $options - {
	*   name:  string — constant name (must be one of the allowlisted names above)
	*   value: mixed  — new value; type constraints depend on the constant (see above)
	* }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	protected static function set_config_core(object $options): object {

		// response
		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$name = $options->name; // name of the constant like 'MAINTENANCE_MODE_CUSTOM'
		$value = $options->value ?? null; // value of the constant like bool 'false'

		// user root check. Only root user can set config core inf
		if (
			logged_user_id() !== DEDALO_SUPERUSER
			// && is_ontology_available() // only blocks if no Ontology error was detected (recovery case)
			&& $name !== 'DEDALO_RECOVERY_MODE'
			&& (!defined('DEDALO_RECOVERY_MODE') || DEDALO_RECOVERY_MODE == false)
		) {
			$response->msg = 'Error. only root user can set config_core';
			return $response;
		}

		// value. check valid value type
		$value_type = gettype($value);

		// special parsers
		switch ($name) {

			case 'DEDALO_MAINTENANCE_MODE_CUSTOM':
				// boolean
				$ar_allow_type = ['boolean'];
				if (!in_array($value_type, $ar_allow_type)) {
					$response->msg = 'Error. invalid value type. Only allow boolean';
					return $response;
				}
				$state_value = (bool) $value;
				break;

			case 'DEDALO_RECOVERY_MODE':
				// boolean
				$ar_allow_type = ['boolean'];
				if (!in_array($value_type, $ar_allow_type)) {
					$response->msg = 'Error. invalid value type. Only allow boolean';
					return $response;
				}
				$state_value = (bool) $value;
				break;

			case 'DEDALO_MEDIA_ACCESS_MODE_CUSTOM':
				// media access control mode override (media_control widget).
				// Allowed values:
				//   null          : no override (config.php DEDALO_MEDIA_ACCESS_MODE rules)
				//   false         : force protection off
				//   'private'     : only logged-in users read media
				//   'publication' : logged-in everything; anonymous only published media
				$is_valid = $value===null
					|| $value===false
					|| in_array($value, ['private','publication'], true);
				if (!$is_valid) {
					$response->msg = 'Error. invalid value. Only allow null|false|private|publication';
					return $response;
				}
				// null = no override | false = force protection off | 'private' | 'publication'
				$state_value = $value;
				break;

			case 'DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM':
				// menu skip-tipos runtime override (menu_skip_tipos widget). An array (even
				// empty) REPLACES the base DEDALO_ENTITY_MENU_SKIP_TIPOS in menu.php; the
				// caller (menu_skip_tipos::save_menu_skip_tipos) has already validated/deduped
				// the tipos, so here we only enforce the type.
				if ($value_type !== 'array') {
					$response->msg = 'Error. invalid value type. Only allow array';
					return $response;
				}
				$state_value = array_values($value);
				break;

			// Disable (Experimental with serious security implications)
			case 'DEDALO_NOTIFICATION_CUSTOM':
				if (logged_user_id() !== DEDALO_SUPERUSER) {
					$response->msg = 'Error. only root user can set config_core';
					return $response;
				}
				// string|boolean
				$ar_allow_type = ['boolean', 'string'];
				if (!in_array($value_type, $ar_allow_type)) {
					$response->msg = 'Error. invalid value type. Only allow boolean|string';
					return $response;
				}
				$state_value = is_string($value)
					? ['msg' => trim(safe_xss($value)), 'class_name' => 'warning']
					: false; // bool false clears the notification
				break;

			default:
				$response->msg = 'Error. Invalid name';
				return $response;
		}

		// Persist the runtime override to the v7 STATE store (../private/state.php), keyed by
		// its catalog dot-path. v6 wrote a define() into config/config_core.php, but the v7
		// flip quarantines that file out of the web root; machine-written state now lives in
		// ../private/state.php and is emitted back as the STATE constant at the next boot.
		$state_path_map = [
			'DEDALO_MAINTENANCE_MODE_CUSTOM'       => 'state.maintenance_mode_custom',
			'DEDALO_RECOVERY_MODE'                 => 'state.recovery_mode',
			'DEDALO_MEDIA_ACCESS_MODE_CUSTOM'      => 'state.media_access_mode_custom',
			'DEDALO_NOTIFICATION_CUSTOM'           => 'state.notification_custom',
			'DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM' => 'state.entity_menu_skip_tipos_custom',
		];
		$state_path = $state_path_map[$name];

		// ../private is the sibling of the install root (matches config/bootstrap.php and
		// area::get_config_areas). On a fresh/unmigrated box the file may not exist yet.
		$state_file = dirname(DEDALO_CONFIG_PATH, 2) . '/private/state.php';
		$existing   = (is_file($state_file) && is_readable($state_file)) ? (require $state_file) : [];
		if (!is_array($existing)) {
			$existing = [];
		}

		// Reuse the installer's STATE serializer so the on-disk shape never drifts.
		require_once DEDALO_CORE_PATH . '/installer/class.installer_config_persistor.php';
		$content = installer_config_persistor::render_state($existing, [$state_path => $state_value]);

		if (file_put_contents($state_file, $content, LOCK_EX) === false) {
			$response->msg = 'Error. Cannot write the state file. Review PHP write permissions for: ' . $state_file;
			debug_log(__METHOD__ . ' ' . $response->msg, logger::ERROR);
			return $response;
		}

		$response->result = true;
		$response->msg    = 'All ready';
		debug_log(__METHOD__ . " Set state '$state_path' = '" . to_string($value) . "' (constant $name)", logger::DEBUG);

		return $response;
	}//end set_config_core



	/**
	* SET_MAINTENANCE_MODE
	* Enables or disables Dédalo maintenance mode by writing
	* `DEDALO_MAINTENANCE_MODE_CUSTOM` to `config_core.php`.
	*
	* When maintenance mode is active (`true`):
	*   - Normal users cannot log in or make data changes.
	*   - `update_data_version()` is allowed to run migrations.
	*   - A maintenance-mode banner is displayed in the UI.
	*
	* This method validates that `$options->value` is a boolean before delegating to
	* `set_config_core()`. Non-boolean values are rejected immediately without touching
	* the config file.
	*
	* Called from the `set_maintenance_mode` action via `dd_area_maintenance_api::class_request`.
	* Listed in `API_ACTIONS`.
	*
	* @param object $options - { value: bool — true to enable, false to disable }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function set_maintenance_mode(object $options): object {

		// options
		$value = $options->value;

		// check value type
		if (!is_bool($value)) {
			$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed';
			$response->errors = [];
			return $response;
		}

		$response = area_maintenance::set_config_core((object) [
			'name' => 'DEDALO_MAINTENANCE_MODE_CUSTOM',
			'value' => $value
		]);


		return $response;
	}//end set_maintenance_mode



	/**
	* SET_MEDIA_ACCESS_MODE
	* Writes a runtime override for the media access control mode into `config_core.php`
	* as `DEDALO_MEDIA_ACCESS_MODE_CUSTOM`, which is consumed by
	* `media_protection::get_mode()` on every media request.
	*
	* Permitted values and their effect:
	*   null          — remove the override; fall back to DEDALO_MEDIA_ACCESS_MODE in config.php
	*   false         — force media protection off (public open access)
	*   'private'     — only logged-in users may access media files
	*   'publication' — logged-in users access all media; anonymous users access only
	*                   files marked as published
	*
	* Value validation and the root-user access check are both enforced inside
	* `set_config_core()`; this method is a thin routing wrapper.
	*
	* Called from the `media_control` widget in the maintenance dashboard.
	* Not listed in `API_ACTIONS` (the widget dispatches through `widget_request`,
	* not `class_request`).
	*
	* @param object $options - { value: null|false|'private'|'publication' }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function set_media_access_mode(object $options): object {

		$value = $options->value ?? null;

		$response = area_maintenance::set_config_core((object) [
			'name' => 'DEDALO_MEDIA_ACCESS_MODE_CUSTOM',
			'value' => $value
		]);


		return $response;
	}//end set_media_access_mode



	/**
	* SET_ENTITY_MENU_SKIP_TIPOS
	* Persists the menu skip-tipos runtime override (DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM)
	* to ../private/state.php via `set_config_core()`. When set it replaces the base
	* DEDALO_ENTITY_MENU_SKIP_TIPOS in menu.php — so it can override a base list deployed
	* via .env (which config.local.php cannot).
	*
	* Called from the `menu_skip_tipos` widget (which validates/dedupes the tipos first).
	* Not listed in `API_ACTIONS` (the widget dispatches through `widget_request`).
	*
	* @param object $options - { value: string[] — list of ontology tipos (may be empty) }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function set_entity_menu_skip_tipos(object $options): object {

		$value = $options->value ?? null;

		if (!is_array($value)) {
			$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed: value must be an array';
			$response->errors = [];
			return $response;
		}

		$response = area_maintenance::set_config_core((object) [
			'name' => 'DEDALO_ENTITY_MENU_SKIP_TIPOS_CUSTOM',
			'value' => array_values($value)
		]);


		return $response;
	}//end set_entity_menu_skip_tipos



	/**
	* SET_RECOVERY_MODE
	* Enables or disables Dédalo recovery mode by writing `DEDALO_RECOVERY_MODE`
	* to `config_core.php`, and immediately mirrors the new value into `$_ENV`.
	*
	* Recovery mode is a degraded-operation state used when the ontology tables are
	* corrupt or unavailable. In recovery mode:
	*   - The normal authenticated session requirement is relaxed for superuser.
	*   - Ontology-dependent features are disabled.
	*   - The root user can still access the maintenance area to restore the ontology
	*     from the recovery SQL file (`restore_dd_ontology_recovery_from_file`).
	*
	* Unlike other set_* methods, `set_config_core()` allows DEDALO_RECOVERY_MODE to
	* be written even when the caller is not DEDALO_SUPERUSER — so that `dd_core_api->start`
	* can set it automatically during boot failure before any user is authenticated.
	*
	* After a successful config-core write, `$_ENV['DEDALO_RECOVERY_MODE']` is also
	* set so that in-process code (within the same PHP request lifecycle) sees the
	* updated value without needing to re-read the file or restart the server.
	*
	* Can be triggered from:
	*   - The `check_config` widget in the maintenance dashboard (manual toggle).
	*   - `dd_core_api->start` automatically on boot failure.
	*
	* @see dd_core_api::start
	*
	* @param object $options - { value: bool — true to enter recovery mode, false to exit }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function set_recovery_mode(object $options): object {

		// options
		$value = $options->value;

		// check value type
		if (!is_bool($value)) {
			$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed';
			$response->errors = [];
			return $response;
		}

		// set config_core constant value
		$response = area_maintenance::set_config_core((object) [
			'name' => 'DEDALO_RECOVERY_MODE',
			'value' => $value
		]);

		// Check for errors before proceeding
		if (!$response->result) {
			return $response;
		}

		// set environmental var accessible in all Dédalo just now
		$_ENV['DEDALO_RECOVERY_MODE'] = $value;

		$response = new stdClass();
		$response->result = true;
		$response->msg = 'OK. Request done successfully';
		$response->errors = [];


		return $response;
	}//end set_recovery_mode



	/**
	* SET_NOTIFICATION
	* Writes a system-wide notification banner message (or clears it) in `config_core.php`
	* as `DEDALO_NOTIFICATION_CUSTOM`.
	*
	* The stored value is read by `dd_core_api::update_lock_components_state` on every
	* component lock/unlock cycle, so the banner text appears to all active users without
	* requiring a page reload. Passing `false` as the value clears the notification.
	*
	* The string value is XSS-sanitised inside `set_config_core()` via `safe_xss()`
	* before being written to the file; the resulting PHP literal is:
	*   `["msg" => "sanitised text", "class_name" => "warning"]`
	*
	* Only DEDALO_SUPERUSER can set notifications (enforced inside `set_config_core()`
	* for the `DEDALO_NOTIFICATION_CUSTOM` case).
	*
	* The response mirrors the result of `set_config_core()`: on success `result`
	* is true; on failure (e.g. a file-write error) `result` is false and the
	* underlying error message is propagated.
	*
	* Listed in `API_ACTIONS`; called from the `set_notification` action via
	* `dd_area_maintenance_api::class_request`.
	*
	* @param object $options - { value: string|bool — notification text, or false to clear }
	* @return object - {result: bool, msg: string, errors: array}.
	*/
	public static function set_notification(object $options): object {

		// options
		$value = $options->value;

		// check value type
		if (!is_string($value) && !is_bool($value)) {
			$response = new stdClass();
			$response->result = false;
			$response->msg = 'Error. Request failed. value is not string or bool';
			$response->errors = [];
			return $response;
		}

		// set config_core constant value
		$config_response = area_maintenance::set_config_core((object) [
			'name' => 'DEDALO_NOTIFICATION_CUSTOM',
			'value' => $value
		]);

		$response = new stdClass();
		$response->result = $config_response->result;
		$response->msg = $config_response->result
			? 'OK. Request done successfully'
			: $config_response->msg;
		$response->errors = $config_response->errors ?? [];


		return $response;
	}//end set_notification



	/**
	* GET_DEFINITIONS_FILES
	* Returns a parsed list of JSON transform-definition files for the given migration
	* category directory under `core/base/transform_definition_files/`.
	*
	* Transform-definition files are JSON documents that describe bulk-move or
	* bulk-conversion operations for migration widgets (move_tld, move_locator, etc.).
	* Each file specifies the source and target tipos, mappings, and any special rules
	* for the migration engine. The UI lists available definition files so the operator
	* can select which migration to run.
	*
	* Security (SEC-069): two-layer defence-in-depth is applied before touching the
	* filesystem:
	*   1. Allowlist check — `$directory` must be one of the five known category names
	*      (move_tld | move_locator | move_to_portal | move_to_table | move_lang).
	*      Unknown or empty strings are rejected immediately.
	*   2. Realpath confinement — the resolved path of the target directory must start
	*      with the resolved `transform_definition_files` root. This prevents `..`
	*      traversal even if the allowlist were somehow bypassed.
	*
	* Each file object in the returned array has shape:
	*   { file_name: string, content: object|null }
	* where `content` is the JSON-decoded definition or null if the file is empty.
	*
	* @param string $directory - Category name: 'move_tld' | 'move_locator' |
	*                            'move_to_portal' | 'move_to_table' | 'move_lang'.
	* @return array<object> - List of {file_name, content} objects; empty on error or
	*                         if no .json files are found in the directory.
	*/
	public static function get_definitions_files(string $directory): array {

		// SEC-069: defence-in-depth. All callers pass literal strings from
		// this fixed set; reject anything else so a future code path that
		// forwards user input cannot escape the transform_definition_files
		// root via `..` segments or absolute paths.
		$allowed_dirs = [
			'move_tld',
			'move_locator',
			'move_to_portal',
			'move_to_table',
			'move_lang'
		];
		if (!in_array($directory, $allowed_dirs, true)) {
			debug_log(
				__METHOD__
				. ' Refused unknown directory: ' . to_string($directory)
				,
				logger::ERROR
			);
			return [];
		}

		// Realpath confinement against the transform_definition_files root.
		$root = DEDALO_CORE_PATH . '/base/transform_definition_files';
		$real_root = realpath($root);
		$real_dir = realpath($root . '/' . $directory);
		if (
			$real_root === false || $real_dir === false
			|| strncmp($real_dir, $real_root . DIRECTORY_SEPARATOR, strlen($real_root) + 1) !== 0
		) {
			debug_log(
				__METHOD__
				. ' Refused path outside transform_definition_files root: ' . to_string($directory)
				,
				logger::ERROR
			);
			return [];
		}

		$files_list = get_dir_files(
			DEDALO_CORE_PATH . '/base/transform_definition_files/' . $directory,
			['json'],
			function ($el) {

				$path_parts = pathinfo($el);
				$basename = $path_parts['basename'] ?? 'unknown';
				$content = file_get_contents($el);
				if (!empty($content)) {
					$content = json_decode($content);
				}

				return (object) [
					'file_name' => $basename,
					'content' => $content
				];
			}
		);


		return $files_list;
	}//end get_definitions_files






	/**
	* UPDATE_ONTOLOGY
	* Full ontology update pipeline: downloads remote dump files, imports them into
	* PostgreSQL, rebuilds `dd_ontology` nodes, regenerates lang files, flushes
	* caches, and saves a schema-diff file for the security-access audit trail.
	*
	* Called from the `update_ontology` widget via `dd_area_maintenance_api::class_request`.
	* Not declared in `API_ACTIONS` (it is dispatched through widget_request) — the
	* widget class routes the final call to this static method.
	*
	* Pipeline steps (in order):
	*   1. Pgpass check — `system::check_pgpass_file()` must return true; the `pg_restore`
	*      subprocess invoked by `ontology_data_io::import_from_file()` needs a valid
	*      .pgpass entry to authenticate without an interactive password prompt.
	*   2. Download — each file URL is fetched via `ontology_data_io::download_remote_ontology_file()`.
	*      Only successfully downloaded files proceed to import.
	*   3. Import — dispatches differently by `tld`:
	*        tld === 'matrix_dd'  → `ontology_data_io::import_private_lists_from_file()` (private lists)
	*        other tlds           → `ontology::add_main_section()` + create ontology node +
	*                               `ontology_data_io::import_from_file()` (regular ontology table)
	*   4. Sync dd_ontology — for each non-private-list file, runs a limitless SQO over
	*      the imported section_tipo and calls `ontology::set_records_in_dd_ontology()` to
	*      keep the fast-lookup `dd_ontology` table in sync with the imported matrix data.
	*   5. Post-processing — `db_tasks::optimize_tables()` on the four ontology tables.
	*   6. Session cleanup — all session keys except 'auth' are cleared so the next
	*      request fetches fresh ontology data rather than stale cached values.
	*   7. Lang file rebuild — `backup::write_lang_file()` is called for every language
	*      defined in DEDALO_APPLICATION_LANGS. Errors are accumulated but do not abort.
	*   8. Activity log — records a 'SAVE' event via `logger::$obj['activity']->log_message`.
	*   9. Schema diff — `hierarchy::save_simple_schema_file()` compares the old and new
	*      section schemas and persists any differences for the security-access change UI.
	*  10. Cache flush — `dd_cache::delete_cache_files()` clears the hierarchy cache so
	*      the next request rebuilds it from the freshly imported ontology.
	*
	* @param object $options - {
	*   server: object    — remote server descriptor (name, host, etc.; informational only)
	*   files:  array     — list of file descriptors to import:
	*                        [{ section_tipo: string, tld: string, url: string }]
	*   info:   object    — metadata about the ontology release (date, host, entity, …)
	* }
	* @return object - {
	*   result:    bool,
	*   msg:       string,
	*   errors:    array<string>,
	*   root_info: object — {term: string, properties: object} from the updated ontology root
	* }
	*/
	public static function update_ontology(object $options): object {

		// response
		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// options
		$files = $options->files;
		$info = $options->info;

		// ar_msg
		$ar_msg = [];

		// Note: no ~/.pgpass precondition. The psql/pg_dump commands run by the import below
		// authenticate via the PGPASSWORD env var (DBi::pg_shell_exec / DBi::pg_exec) taken
		// from DEDALO_PASSWORD_CONN, so the database may be LOCAL or REMOTE. Real authentication
		// failures are surfaced by the underlying psql exec, not pre-gated here.

		// download files
		$files_to_import = [];
		foreach ($files as $current_file_item) {

			$download_file_response = ontology_data_io::download_remote_ontology_file($current_file_item->url);

			$ar_msg[] = $download_file_response->msg;
			if (!empty($download_file_response->errors)) {
				$response->errors = array_merge($response->errors, $download_file_response->errors);
			}

			if ($download_file_response->result === true) {
				$files_to_import[] = $current_file_item;
			}
		}

		// import ontology sections
		// import file
		foreach ($files_to_import as $current_file_item) {

			if ($current_file_item->tld === 'matrix_dd') {
				// private lists
				$import_response = ontology_data_io::import_private_lists_from_file($current_file_item);
			} else {
				// main section
				// create the main section if not exists
				ontology::add_main_section($current_file_item);
				// create dd_ontology node for the main section
				ontology::create_dd_ontology_ontology_section_node($current_file_item);
				// matrix data of regular ontology
				$import_response = ontology_data_io::import_from_file($current_file_item);
			}
			// add messages and errors
			if (!empty($import_response->msg)) {
				$ar_msg[] = $import_response->msg;
			}
			if (!empty($import_response->errors)) {
				$response->errors = array_merge($response->errors, $import_response->errors);
			}
		}

		// update dd_ontology with the imported records
		foreach ($files_to_import as $current_file_item) {

			if (!is_object($current_file_item) || !isset($current_file_item->tld, $current_file_item->section_tipo)) {
				debug_log(
					__METHOD__
					. " Ignored file item: Missing 'tld' or 'section_tipo' properties. " . PHP_EOL
					. ' current_file_item: ' . to_string($current_file_item)
					,
					logger::ERROR
				);
				continue;
			}

			// private list, matrix_dd, doesn't process it as dd_ontology nodes
			if ($current_file_item->tld === 'matrix_dd') {
				continue;
			}

			$section_tipo = $current_file_item->section_tipo;
			$sqo = new search_query_object();
			$sqo->set_section_tipo([$section_tipo]);
			$sqo->limit = 0;

			$set_dd_ontology_response = ontology::set_records_in_dd_ontology($sqo);
			// add messages and errors
			if (!empty($set_dd_ontology_response->msg)) {
				$ar_msg[] = $set_dd_ontology_response->msg;
			}
			if (!empty($set_dd_ontology_response->errors)) {
				$response->errors = array_merge($response->errors, $set_dd_ontology_response->errors);
			}
		}

		// simple_schema_of_sections. Get current simple schema of sections before update data
		// Will used to compare with the new schema (after update)
		$old_simple_schema_of_sections = hierarchy::get_simple_schema_of_sections();

		// post processing tables
		$ar_tables = ['dd_ontology', 'matrix_ontology', 'matrix_ontology_main', 'matrix_dd'];
		// optimize tables
		db_tasks::optimize_tables($ar_tables);

		// delete all session data except auth
		if (isset($_SESSION['dedalo']) && is_array($_SESSION['dedalo'])) {
			foreach ($_SESSION['dedalo'] as $key => $value) {
				if ($key === 'auth')
					continue;
				unset($_SESSION['dedalo'][$key]);
			}
		}

		// update javascript labels
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {

			// direct
			$write_file = backup::write_lang_file($lang);
			if ($write_file === false) {
				$response->errors[] = 'Error writing write_lang_file of lang: ' . $lang;
				continue;
			}

			// debug
			debug_log(
				__METHOD__
				. " Writing lang file " . PHP_EOL
				. ' lang: ' . to_string($lang)
				,
				logger::WARNING
			);
		}

		// logger activity : QUE(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), DATOS(array of related info)
		logger::$obj['activity']->log_message(
			'SAVE',
			logger::INFO,
			DEDALO_ROOT_TIPO,
			NULL,
			[
				'msg' => 'Updated Ontology',
				'version' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, 'lg-spa')
			],
			logged_user_id() // int
		);

		// save_simple_schema_file. Get new simple_schema_of_sections
		// to compare with the previous scheme and save the changes
		$save_simple_schema_file_response = hierarchy::save_simple_schema_file((object) [
			'old_simple_schema_of_sections' => $old_simple_schema_of_sections
		]);
		if ($save_simple_schema_file_response->result === false) {
			$response->result = false;
			$response->msg = 'Error saving simple_schema_file: ' . $save_simple_schema_file_response->msg;
			$response->errors = array_merge($response->errors, $save_simple_schema_file_response->errors);
			return $response;
		} else {
			$ar_msg[] = 'OK. Saved a new simple schema changes file: ' . basename($save_simple_schema_file_response->filepath);
		}

		// force reset cache of hierarchy tree
		// delete previous cache files
		dd_cache::delete_cache_files();

		// get new Ontology info
		$ontology_node = ontology_node::get_instance(DEDALO_ROOT_TIPO);
		$root_info = (object) [
			'term' => ontology_node::get_term_by_tipo(DEDALO_ROOT_TIPO, DEDALO_STRUCTURE_LANG, false, false),
			'properties' => $ontology_node->get_properties()
		];

		// response
		$response->result = true;
		$msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning! Request done with errors';
		$response->msg = $msg . ' ' . implode(PHP_EOL, $ar_msg);
		$response->root_info = $root_info;


		return $response;
	}//end update_ontology



	/**
	* REBUILD_LANG_FILES
	* Regenerates the JavaScript label/translation files for every application language.
	*
	* Calls `backup::write_lang_file()` for each language code in DEDALO_APPLICATION_LANGS.
	* These files are static JS bundles served to the browser so the client-side UI
	* can display localised labels without an API round-trip. They must be rebuilt
	* whenever ontology labels change (typically after `update_ontology`).
	*
	* The `$options` parameter is accepted for API contract consistency but is
	* currently unused; callers may pass an empty stdClass.
	*
	* Errors from individual language writes are collected and returned; the response
	* `result` is only set to `true` when all languages succeed without error.
	*
	* Listed in `API_ACTIONS`; also called internally by `update_ontology()` as step 7.
	*
	* @param object $options - Unused; present for API contract uniformity.
	* @return object - {
	*   result:  bool,
	*   msg:     string,
	*   errors:  array<string>,
	*   updated: array|null — the DEDALO_APPLICATION_LANGS array on success, absent on failure
	* }
	*/
	public static function rebuild_lang_files(object $options): object {

		// response
		$response = new stdClass();
		$response->result = false;
		$response->msg = 'Error. Request failed [' . __METHOD__ . ']';
		$response->errors = [];

		// write_lang_file
		$ar_langs = DEDALO_APPLICATION_LANGS;
		foreach ($ar_langs as $lang => $label) {
			$result = backup::write_lang_file($lang);
			if ($result !== true) {
				$response->errors[] = 'Failed write lang file: ' . $lang;
			}
		}

		// response
		if (count($response->errors) === 0) {
			$response->result = true;
			$response->msg = 'OK. Request done successfully';
			$response->updated = $ar_langs;
		}


		return $response;
	}//end rebuild_lang_files



	/**
	* BUILD_RECOVERY_VERSION_FILE
	* Snapshots the current `dd_ontology` table into the recovery SQL file
	* (`dedalo/install/db/dd_ontology_recovery.sql`).
	*
	* This file is the fallback source used by `restore_dd_ontology_recovery_from_file()`
	* if the live `dd_ontology` table becomes corrupt or empty. It should be rebuilt
	* after every successful ontology update so the recovery snapshot stays current.
	*
	* Delegates entirely to `installer::build_recovery_version_file()`.
	*
	* @return object - Response from installer::build_recovery_version_file()
	*                  {result: bool, msg: string, errors?: array}.
	*/
	public static function build_recovery_version_file(): object {

		return installer::build_recovery_version_file();
	}//end build_recovery_version_file



	/**
	* RESTORE_DD_ONTOLOGY_RECOVERY_FROM_FILE
	* Restores the `dd_ontology` table from the recovery SQL snapshot file
	* (`dedalo/install/db/dd_ontology_recovery.sql`).
	*
	* This is a last-resort recovery operation for situations where `dd_ontology` is
	* corrupt, missing, or empty and the system is in recovery mode. The snapshot
	* loaded here was built by `build_recovery_version_file()` during a previous
	* healthy state.
	*
	* Typically invoked from the `check_config` widget when the system is in recovery
	* mode and the operator wants to restore the ontology without shell access.
	* Listed in `API_ACTIONS`.
	*
	* Delegates entirely to `installer::restore_dd_ontology_recovery_from_file()`.
	*
	* @return object - Response from installer::restore_dd_ontology_recovery_from_file()
	*                  {result: bool, msg: string, errors?: array}.
	*/
	public static function restore_dd_ontology_recovery_from_file(): object {

		return installer::restore_dd_ontology_recovery_from_file();
	}//end restore_dd_ontology_recovery_from_file



}//end class area_maintenance
