<?php declare(strict_types=1);
/**
* MEDIA_CONTROL
* Area-maintenance widget that surfaces and controls the media file access
* protection system (class media_protection + the Bun diffusion engine's
* publication-marker store).
*
* Responsibilities:
*  - Report (get_value): current effective mode, its config source, the state
*    of the .htaccess gate, auth/pub marker counts, and live diffusion-engine
*    availability — all in a single object consumed by the browser widget UI.
*  - Change mode (set_media_access_mode): write the DEDALO_MEDIA_ACCESS_MODE_CUSTOM
*    override to config_core.php (via area_maintenance::set_media_access_mode),
*    then immediately regenerate media/.htaccess for the new mode and restore auth
*    markers from the persisted cookie file so already-logged-in users keep
*    media access without needing to re-authenticate.
*  - Full resync (rebuild_media_index): delegate to dd_diffusion_api which
*    resolves all SQL publication targets from the diffusion ontology and
*    forwards them to the Bun engine for marker (re)generation.
*
* Security model:
*  - API_ACTIONS is an explicit allowlist enforced by
*    dd_area_maintenance_api::widget_request before any method is dispatched
*    (SEC-044). Only the three listed methods may be invoked over the API.
*  - Root-user gating for writes lives inside area_maintenance::set_config_core
*    (called by set_media_access_mode) and security::is_global_admin (inside
*    dd_diffusion_api::rebuild_media_index). This class does not re-implement
*    those guards — it delegates immediately so there is a single enforcement point.
*
* Relationships:
*  - Routed by: dd_area_maintenance_api::widget_request
*  - Calls:     media_protection (get_mode, get_base_path, get_public_qualities,
*               get_default_public_qualities, get_media_path, get_htaccess_status,
*               write_htaccess, sync_auth_markers_from_cookie_file, COOKIE_NAME)
*  - Calls:     diffusion_api_client::call (action 'media_index_status') for live
*               engine status; 5-second timeout so a dead engine does not block
*               the dashboard page load.
*  - Calls:     dd_diffusion_api::rebuild_media_index for full pub-marker resync.
*  - Calls:     area_maintenance::set_media_access_mode to persist the config
*               override into config_core.php.
*
* @package Dédalo
* @subpackage Core
*/
class media_control {



	/**
	* Explicit allowlist of the three methods callable through
	* dd_area_maintenance_api::widget_request (SEC-044 gate).
	*
	* Only names present here will be dispatched; any call to an unlisted
	* method is rejected by the API layer before this class is even invoked.
	* @var string[] API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_value',
		'set_media_access_mode',
		'rebuild_media_index'
	];



	/**
	* GET_VALUE
	* Assembles the full widget data object: effective mode, its configuration
	* source, htaccess gate status, auth/pub marker counts, live Bun engine
	* status, and whether the requesting user is root (controls edit UI visibility).
	*
	* Called by dd_area_maintenance_api::widget_request when the browser polls or
	* refreshes the widget. The returned $response->result object is the data
	* contract consumed by the browser widget UI; shape is documented in the
	* inline 'result' literal below.
	*
	* The diffusion engine is queried with a 5-second timeout so a down engine
	* produces a degraded-but-non-blocking dashboard (engine.reachable === false
	* tells the UI to show a warning, not hang).
	*
	* (!) The 'is_root' flag uses DEDALO_SUPERUSER (the root UID constant), not a
	* role check. Widget-level writes (set_media_access_mode) re-enforce the
	* root restriction inside area_maintenance::set_config_core; this flag is
	* informational only (UI hides the edit controls for non-root users).
	*
	* @return object $response - {
	*   result: {
	*     mode: string|false,           effective protection mode
	*     mode_source: string,          human-readable config-source label
	*     custom_override: mixed,       DEDALO_MEDIA_ACCESS_MODE_CUSTOM or null
	*     config_mode: mixed,           DEDALO_MEDIA_ACCESS_MODE or null
	*     legacy_protect: mixed,        DEDALO_PROTECT_MEDIA_FILES or null
	*     cookie_name: string,          media_protection::COOKIE_NAME
	*     public_qualities: string[],   validated public quality folders
	*     default_public_qualities: string[],
	*     media_path: string,           absolute path to media root
	*     htaccess: object,             { exists, up_to_date, path }
	*     markers: {
	*       base_path: string,
	*       base_exists: bool,
	*       pub_count: int|null,        null when dir does not exist
	*       auth_count: int|null
	*     },
	*     engine: {
	*       reachable: bool,
	*       media_index_enabled: bool|null,
	*       media_path: string|null,
	*       pub_markers: int|null,
	*       databases: array,
	*       msg: string|null            set only when engine is unreachable
	*     },
	*     is_root: bool                 true when logged user is DEDALO_SUPERUSER
	*   },
	*   msg: string,
	*   errors: string[]
	* }
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// configuration
			$mode = media_protection::get_mode();
			$custom_override = defined('DEDALO_MEDIA_ACCESS_MODE_CUSTOM')
				? DEDALO_MEDIA_ACCESS_MODE_CUSTOM
				: null;
			$config_mode = defined('DEDALO_MEDIA_ACCESS_MODE')
				? DEDALO_MEDIA_ACCESS_MODE
				: null;
			$legacy_protect = defined('DEDALO_PROTECT_MEDIA_FILES')
				? DEDALO_PROTECT_MEDIA_FILES
				: null;
			// where does the effective mode come from?
			$mode_source = ($custom_override!==null)
				? 'config_core.php (DEDALO_MEDIA_ACCESS_MODE_CUSTOM, set from this widget)'
				: (defined('DEDALO_MEDIA_ACCESS_MODE')
					? 'config.php (DEDALO_MEDIA_ACCESS_MODE)'
					: 'config.php (legacy DEDALO_PROTECT_MEDIA_FILES)');

		// marker store (PHP-side view of the shared filesystem allowlist)
			$base_path	= media_protection::get_base_path();
			$markers	= (object)[
				'base_path'		=> $base_path,
				'base_exists'	=> is_dir($base_path),
				'pub_count'		=> self::count_dir_files($base_path . '/pub'),
				'auth_count'	=> self::count_dir_files($base_path . '/auth')
			];

		// diffusion engine status (markers are written by the Bun engine;
		// engine down or DEDALO_MEDIA_PATH unset there = markers frozen)
			$engine_response = diffusion_api_client::call((object)[
				'action' => 'media_index_status'
			], 5);
			$engine = (object)[
				'reachable'				=> ($engine_response->result ?? false)===true,
				'media_index_enabled'	=> $engine_response->enabled ?? null,
				'media_path'			=> $engine_response->base ?? null,
				'pub_markers'			=> $engine_response->pub_markers ?? null,
				'databases'				=> $engine_response->databases ?? [],
				'msg'					=> ($engine_response->result ?? false)===true
					? null
					: ($engine_response->msg ?? 'Diffusion engine is unreachable')
			];

		// result
			$result = (object)[
				'mode'						=> $mode,
				'mode_source'				=> $mode_source,
				'custom_override'			=> $custom_override,
				'config_mode'				=> $config_mode,
				'legacy_protect'			=> $legacy_protect,
				'cookie_name'				=> media_protection::COOKIE_NAME,
				'public_qualities'			=> media_protection::get_public_qualities(),
				'default_public_qualities'	=> media_protection::get_default_public_qualities(),
				'media_path'				=> media_protection::get_media_path(),
				'htaccess'					=> media_protection::get_htaccess_status(),
				'markers'					=> $markers,
				'engine'					=> $engine,
				'is_root'					=> logged_user_id()===DEDALO_SUPERUSER
			];

		// response
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';


		return $response;
	}//end get_value



	/**
	* SET_MEDIA_ACCESS_MODE
	* Changes the media access mode runtime override (DEDALO_MEDIA_ACCESS_MODE_CUSTOM
	* in config_core.php) and applies the change immediately within the current request:
	*  1. Translates the UI string token to its PHP constant value.
	*  2. Persists the override via area_maintenance::set_media_access_mode (root-user
	*     gated inside area_maintenance::set_config_core).
	*  3. Resolves the effective mode for this request: because the PHP constants of
	*     the running request still hold the OLD values, the effective mode is computed
	*     manually from $constant_value / resolve_config_file_mode() rather than by
	*     calling media_protection::get_mode() (which would still return the old mode).
	*  4. Regenerates media/.htaccess for the new mode via media_protection::write_htaccess.
	*  5. When re-enabling protection, restores auth markers from the persisted cookie
	*     file so users who are already logged in keep media access without re-login.
	*
	* The 'config' token removes the override entirely (constant_value = null), letting
	* the base DEDALO_MEDIA_ACCESS_MODE / DEDALO_PROTECT_MEDIA_FILES constant take over.
	* The 'off' token maps to constant_value = false (world-readable media, no gate).
	*
	* (!) If write_htaccess fails (filesystem permissions), the mode IS saved to config
	* but the .htaccess still serves the old rules — the response surfaces this mismatch
	* so the operator knows to fix permissions and re-apply.
	*
	* @param object $options - { value: string } where value is one of:
	*   'config'      remove DEDALO_MEDIA_ACCESS_MODE_CUSTOM, revert to config.php
	*   'off'         world-readable (no protection)
	*   'private'     rule A only — logged-in Dédalo users only
	*   'publication' rule A + rule B — logged-in users + published records
	* @return object $response - {
	*   result: bool,
	*   msg: string,
	*   errors: string[],
	*   mode: string|false    effective mode after the change (only on success)
	* }
	*/
	public static function set_media_access_mode(object $options) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// value. UI string to constant value
			$value = $options->value ?? null;
			switch ($value) {
				case 'config':		$constant_value = null;	break; // remove override
				case 'off':			$constant_value = false; break;
				case 'private':		$constant_value = 'private'; break;
				case 'publication':	$constant_value = 'publication'; break;
				default:
					$response->msg = 'Error. Invalid value. Allowed: config|off|private|publication';
					$response->errors[] = 'invalid value';
					return $response;
			}

		// write the constant (root-user gated there)
			$set_response = area_maintenance::set_media_access_mode((object)[
				'value' => $constant_value
			]);
			if (($set_response->result ?? false)!==true) {
				return $set_response;
			}

		// effective mode AFTER the change. The constants of this running
		// request still hold the old values, so resolve manually.
			$effective_mode = $constant_value!==null
				? $constant_value
				: self::resolve_config_file_mode();

		// apply immediately: regenerate the media/.htaccess for the new mode
		// ('off' clears the gate, leaving the SEC-088 hardening only)
			$htaccess_mode	= $effective_mode===false ? 'off' : $effective_mode;
			$htaccess_ok	= media_protection::write_htaccess($htaccess_mode);
			if (!$htaccess_ok) {
				$response->msg = 'Error. Mode was saved but the media .htaccess could not be written. Review PHP write permissions on the media directory.';
				$response->errors[] = 'htaccess write failed';
				return $response;
			}

		// when enabling, restore auth markers from the persisted cookie
		// values: users already holding a valid cookie keep media access
			if ($effective_mode!==false) {
				media_protection::sync_auth_markers_from_cookie_file();
			}

		// response
			$mode_label = $effective_mode===false ? 'off (media is world-readable)' : $effective_mode;
			$response->result	= true;
			$response->msg		= 'OK. Media access mode applied: ' . $mode_label . '.'
				. ($effective_mode!==false
					? ' Users without the media auth cookie get it at their next login.'
					: '')
				. ($effective_mode==='publication'
					? ' If this instance has existing publications, run \'Rebuild media index\' once.'
					: '');
			$response->mode		= $effective_mode;


		return $response;
	}//end set_media_access_mode



	/**
	* REBUILD_MEDIA_INDEX
	* Triggers a full resync of the media publication markers by delegating to
	* dd_diffusion_api::rebuild_media_index, which:
	*  1. Guards the call to global admins only (security::is_global_admin).
	*  2. Resolves all SQL publication targets (database_name, table_name,
	*     section_tipo) from the diffusion ontology (PHP side).
	*  3. Forwards the target list to the Bun engine via diffusion_api_client
	*     ('rebuild_media_index' action). Bun owns MariaDB and writes the
	*     zero-byte .publication/pub/{section_tipo}_{section_id} marker files.
	*
	* Use this after enabling 'publication' mode on an instance that already
	* has diffusion publications, so that pre-existing published records get
	* their pub markers without waiting for the next diffusion cycle.
	*
	* The $options argument is passed through as rqo.options; it is currently
	* unused by the engine but reserved for future filtering (e.g. by database).
	*
	* @param object $options - reserved for future use; pass an empty object
	* @return object $response - propagated from dd_diffusion_api::rebuild_media_index:
	*   { result: bool, msg: string, errors: string[], markers: int, targets: int }
	*/
	public static function rebuild_media_index(object $options) : object {

		return dd_diffusion_api::rebuild_media_index((object)[
			'action'	=> 'rebuild_media_index',
			'options'	=> $options
		]);
	}//end rebuild_media_index



	/**
	* RESOLVE_CONFIG_FILE_MODE
	* Resolves the media access mode as defined by config.php / config_inc.php,
	* intentionally ignoring any DEDALO_MEDIA_ACCESS_MODE_CUSTOM override that
	* may be present in config_core.php.
	*
	* This is needed inside set_media_access_mode immediately after removing or
	* changing the custom override: the PHP constants of the running request
	* still hold the old value, so media_protection::get_mode() (which reads the
	* constants) would return the stale mode. Calling this method instead reads
	* the base constants directly, giving the effective mode that would apply
	* to the next request once the override is gone.
	*
	* Priority mirrors the non-override tiers of media_protection::get_mode():
	*  1. DEDALO_MEDIA_ACCESS_MODE ('private' or 'publication' → returned as-is;
	*     any other value → false)
	*  2. Legacy DEDALO_PROTECT_MEDIA_FILES===true → 'private'
	*  3. Otherwise → false (no protection)
	*
	* @return string|false - 'private' | 'publication' | false
	*/
	private static function resolve_config_file_mode() : string|false {

		if (defined('DEDALO_MEDIA_ACCESS_MODE')) {
			$mode = DEDALO_MEDIA_ACCESS_MODE;
			return in_array($mode, ['private','publication'], true)
				? $mode
				: false;
		}

		return (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true)
			? 'private'
			: false;
	}//end resolve_config_file_mode



	/**
	* COUNT_DIR_FILES
	* Counts the entries in a directory (non-recursively, skipping '.' and '..').
	* Used to report how many pub and auth marker files currently exist in the
	* .publication/ marker store, giving the operator a quick sanity check from
	* the widget UI.
	*
	* Returns null rather than 0 when the directory does not exist so the caller
	* can distinguish "store not yet created" from "store exists but is empty".
	*
	* @param string $dir - absolute path to the directory to count
	* @return int|null - file/entry count, or null when $dir does not exist
	*/
	private static function count_dir_files(string $dir) : ?int {

		if (!is_dir($dir)) {
			return null;
		}

		return iterator_count(new FilesystemIterator($dir, FilesystemIterator::SKIP_DOTS));
	}//end count_dir_files



}//end media_control
