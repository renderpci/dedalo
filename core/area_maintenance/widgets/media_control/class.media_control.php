<?php declare(strict_types=1);
/**
* MEDIA_CONTROL
* Area maintenance widget for the media file access control
* (media_protection class + Bun diffusion engine publication markers).
*
* Reports the current configuration and runtime status (mode, public
* qualities, generated .htaccess, marker store, engine availability),
* lets the root user change the access mode (DEDALO_MEDIA_ACCESS_MODE_CUSTOM
* override in config_core.php) and triggers a full rebuild of the media
* publication markers (rebuild_media_index).
*/
class media_control {



	/**
	* SEC-044: explicit allowlist of methods callable through
	* dd_area_maintenance_api::widget_request
	*/
	public const API_ACTIONS = [
		'get_value',
		'set_media_access_mode',
		'rebuild_media_index'
	];



	/**
	* GET_VALUE
	* Returns updated widget value: configuration + runtime status.
	* It is used to update widget data dynamically.
	* @return object $response
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
	* Changes the media access mode override (config_core.php) and applies
	* it immediately: regenerates media/.htaccess for the NEW mode and,
	* when enabling, re-creates the auth markers from the persisted cookie
	* values so already-logged users keep media access.
	* Root-user gated (area_maintenance::set_config_core).
	*
	* @param object $options
	* {
	* 	value : string 'config'|'off'|'private'|'publication'
	* }
	* @return object $response
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
	* Full resync of the media publication markers from the publication
	* databases. Delegates to dd_diffusion_api::rebuild_media_index
	* (global-admin gated there; ontology resolution in PHP, diff-sync in
	* the Bun engine).
	* @param object $options (unused)
	* @return object $response
	*/
	public static function rebuild_media_index(object $options) : object {

		return dd_diffusion_api::rebuild_media_index((object)[
			'action'	=> 'rebuild_media_index',
			'options'	=> $options
		]);
	}//end rebuild_media_index



	/**
	* RESOLVE_CONFIG_FILE_MODE
	* Media access mode as the config FILE defines it, ignoring the
	* config_core.php override (used to compute the effective mode right
	* after the override is removed in the current request).
	* @return string|false
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
	* @param string $dir
	* @return int|null null when the dir does not exist
	*/
	private static function count_dir_files(string $dir) : ?int {

		if (!is_dir($dir)) {
			return null;
		}

		return iterator_count(new FilesystemIterator($dir, FilesystemIterator::SKIP_DOTS));
	}//end count_dir_files



}//end media_control
