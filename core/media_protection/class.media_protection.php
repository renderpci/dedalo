<?php declare(strict_types=1);
/**
* MEDIA_PROTECTION
* Media file access control (work system + publication).
*
* One media tree serves two audiences at the same URLs:
*  - Rule A (work system): logged-in Dédalo users get unrestricted media
*    access via a fixed-name cookie ('dedalo_media_auth') whose daily-rotated
*    value must exist as a zero-byte marker file in
*    DEDALO_MEDIA_PATH/.publication/auth/ (synced here at login).
*  - Rule B (publication): anonymous users may only read files of published
*    records, restricted to the configured public quality folders. The web
*    server checks a zero-byte marker DEDALO_MEDIA_PATH/.publication/pub/
*    {section_tipo}_{section_id} maintained by the Bun diffusion engine
*    (diffusion/api/v1/lib/media_index.ts), keyed by the record identity
*    parsed from the media file name.
*
* Both rules are enforced by the web server itself with one stat() per
* request (Apache: generated media/.htaccess, pure mod_rewrite; Nginx:
* static sample config) so multi-GB files keep native sendfile/Range and
* the H.264/mp4 '?start=' clipping handlers.
*
* Modes (DEDALO_MEDIA_ACCESS_MODE):
*  - false         : no protection (media is world-readable)
*  - 'private'     : rule A only (legacy DEDALO_PROTECT_MEDIA_FILES behavior)
*  - 'publication' : rule A + rule B
*
* This class is pure/static and session-free: login::init_cookie_auth()
* delegates to it, and install/maintenance scripts can call it directly.
*/
class media_protection {



	/**
	* Fixed auth cookie name. The cookie VALUE rotates daily (today +
	* yesterday are valid); a fixed name is what lets Nginx/Apache validate
	* statically (marker file named by the value) without config reloads.
	*/
	public const COOKIE_NAME = 'dedalo_media_auth';

	/**
	* Template version: bump to force .htaccess regeneration on existing
	* installs when the generated rules change.
	*/
	public const TEMPLATE_VERSION = 1;

	/**
	* Test hook: overrides DEDALO_MEDIA_PATH so unit tests never touch the
	* real media directory (same convention as diffusion_api_client::$endpoint_override).
	*/
	public static ?string $media_path_override = null;



	/**
	* GET_MEDIA_PATH
	* @return string
	*/
	public static function get_media_path() : string {

		return self::$media_path_override ?? DEDALO_MEDIA_PATH;
	}//end get_media_path



	/**
	* GET_MODE
	* Resolves the configured media access mode.
	* Priority:
	*  1. DEDALO_MEDIA_ACCESS_MODE_CUSTOM (config_core.php, set from the
	*     area_maintenance 'media_control' widget; null = no override)
	*  2. DEDALO_MEDIA_ACCESS_MODE (config.php)
	*  3. legacy DEDALO_PROTECT_MEDIA_FILES===true maps to 'private'
	* @return string|false 'private' | 'publication' | false
	*/
	public static function get_mode() : string|false {

		// custom override (writable from the maintenance area, like
		// DEDALO_MAINTENANCE_MODE_CUSTOM). null means 'no override'.
		if (defined('DEDALO_MEDIA_ACCESS_MODE_CUSTOM') && DEDALO_MEDIA_ACCESS_MODE_CUSTOM!==null) {
			$mode = DEDALO_MEDIA_ACCESS_MODE_CUSTOM;
			return in_array($mode, ['private','publication'], true)
				? $mode
				: false;
		}

		if (defined('DEDALO_MEDIA_ACCESS_MODE')) {
			$mode = DEDALO_MEDIA_ACCESS_MODE;
			return in_array($mode, ['private','publication'], true)
				? $mode
				: false;
		}

		return (defined('DEDALO_PROTECT_MEDIA_FILES') && DEDALO_PROTECT_MEDIA_FILES===true)
			? 'private'
			: false;
	}//end get_mode



	/**
	* GET_BASE_PATH
	* Marker store base directory (shared with the Bun diffusion engine,
	* which owns pub/ and dbs/; PHP owns auth/).
	* @return string
	*/
	public static function get_base_path() : string {

		return self::get_media_path() . '/.publication';
	}//end get_base_path



	/**
	* GET_PUBLIC_QUALITIES
	* Quality folders (relative to the media root, no leading slash) that
	* anonymous users may read when the record is published. Configurable
	* with DEDALO_MEDIA_PUBLIC_QUALITIES; 'original'/'modified' folders are
	* refused defensively (master files are never public).
	* @return array
	*/
	public static function get_public_qualities() : array {

		$configured = defined('DEDALO_MEDIA_PUBLIC_QUALITIES')
			? DEDALO_MEDIA_PUBLIC_QUALITIES
			: self::get_default_public_qualities();

		$qualities = [];
		foreach ((array)$configured as $quality) {

			$quality = trim((string)$quality, '/');

			if (empty($quality)
				|| str_contains($quality, '..')
				|| !preg_match('/^[A-Za-z0-9_.\/-]+$/', $quality)
			) {
				debug_log(__METHOD__
					. " Refused invalid public media quality entry: " . to_string($quality)
					, logger::ERROR
				);
				continue;
			}

			// master/work qualities must never be exposed publicly
			$folder_names = explode('/', $quality);
			if (in_array('original', $folder_names, true) || in_array('modified', $folder_names, true)) {
				debug_log(__METHOD__
					. " Refused master quality folder in DEDALO_MEDIA_PUBLIC_QUALITIES: " . $quality
					, logger::ERROR
				);
				continue;
			}

			$qualities[] = $quality;
		}

		return array_values(array_unique($qualities));
	}//end get_public_qualities



	/**
	* GET_DEFAULT_PUBLIC_QUALITIES
	* Web-delivery qualities derived from the install constants.
	* @return array
	*/
	public static function get_default_public_qualities() : array {

		return [
			trim(DEDALO_AV_FOLDER, '/') . '/' . DEDALO_AV_QUALITY_DEFAULT,				// av/404
			trim(DEDALO_AV_FOLDER, '/') . '/posterframe',
			trim(DEDALO_AV_FOLDER, '/') . '/' . trim(DEDALO_SUBTITLES_FOLDER, '/'),		// av/subtitles
			trim(DEDALO_IMAGE_FOLDER, '/') . '/' . DEDALO_IMAGE_QUALITY_DEFAULT,		// image/1.5MB
			trim(DEDALO_IMAGE_FOLDER, '/') . '/' . DEDALO_QUALITY_THUMB,				// image/thumb
			trim(DEDALO_PDF_FOLDER, '/') . '/' . DEDALO_PDF_QUALITY_DEFAULT,			// pdf/web
			trim(DEDALO_SVG_FOLDER, '/') . '/' . DEDALO_SVG_QUALITY_DEFAULT,			// svg/web
			trim(DEDALO_3D_FOLDER, '/') . '/' . DEDALO_3D_QUALITY_DEFAULT				// 3d/web
		];
	}//end get_default_public_qualities



	/**
	* SYNC_AUTH_MARKERS
	* Mirrors the valid auth cookie values (today + yesterday) as zero-byte
	* files in .publication/auth/: the web server validates rule A with
	* '-f auth/{cookie_value}'. Any other file in the dir is removed
	* (daily rotation). Values are sha512 hex (128 chars); anything else
	* is refused.
	*
	* @param array $valid_values
	* @return bool
	*/
	public static function sync_auth_markers(array $valid_values) : bool {

		$auth_dir = self::get_base_path() . '/auth';

		// MEDIA-03: 0750 (not world-readable) so other local users can't list the
		// auth markers (whose filenames are valid cookie values).
		if (!is_dir($auth_dir) && !mkdir($auth_dir, 0750, true)) {
			debug_log(__METHOD__
				. " Unable to create media auth marker dir " . PHP_EOL
				. ' auth_dir: ' . $auth_dir
				, logger::ERROR
			);
			return false;
		}

		$keep = [];
		foreach ($valid_values as $value) {
			if (!is_string($value) || !preg_match('/^[a-f0-9]{128}$/', $value)) {
				debug_log(__METHOD__
					. " Refused invalid auth cookie value (expected sha512 hex)"
					, logger::ERROR
				);
				continue;
			}
			$keep[$value] = true;
			$marker = $auth_dir . '/' . $value;
			if (!file_exists($marker) && false===file_put_contents($marker, '')) {
				debug_log(__METHOD__
					. " Unable to write media auth marker " . PHP_EOL
					. ' marker: ' . $marker
					, logger::ERROR
				);
				return false;
			}
		}

		// rotation: remove markers for values no longer valid
		foreach ((glob($auth_dir . '/*') ?: []) as $existing) {
			if (is_file($existing) && !isset($keep[basename($existing)])) {
				unlink($existing);
			}
		}

		return true;
	}//end sync_auth_markers



	/**
	* BUILD_HTACCESS
	* Generates the full media/.htaccess text for the given mode.
	* Pure function (unit-testable): no filesystem access, no session.
	*
	* The rewrite gate composes:
	*  0. the marker store itself is never served
	*  1. rule A : fixed-name cookie whose 128-hex value exists in auth/
	*  2. rule B : public quality folder AND pub/{section_tipo}_{section_id}
	*     marker exists (publication mode only)
	*  3. default deny as 404 (existence of unpublished media is not
	*     disclosed)
	*
	* The substitution is always '-' and the query string is never touched,
	* so Range requests and the H.264 module '?start=' clipping keep working.
	*
	* Mode 'off' generates the hardening header only (no rewrite gate):
	* used when an administrator disables the protection from the
	* media_control widget so the previously generated deny rules do not
	* linger in the file.
	*
	* @param string $mode 'off' | 'private' | 'publication'
	* @param array $public_qualities
	* @param array $addon_lines Raw lines appended before the final deny
	*        (MEDIA_HTACCESS_ADDONS config)
	* @return string
	*/
	public static function build_htaccess(string $mode, array $public_qualities=[], array $addon_lines=[]) : string {

		$media_path	= rtrim(self::get_media_path(), '/');
		$hash		= self::get_config_hash($mode, $public_qualities, $addon_lines);

		$t  = '';
		$t .= '# Dédalo media access control — auto-generated by media_protection (login)' . PHP_EOL;
		$t .= '# Do not edit: changes are overwritten when the configuration changes.' . PHP_EOL;
		$t .= '# config-hash: ' . $hash . PHP_EOL;
		$t .= PHP_EOL;

		// SEC-088: block script execution inside the media root (user-uploaded
		// files live here; never interpret them as code)
		$t .= '# SEC-088: block script execution inside the media root.' . PHP_EOL;
		$t .= '<FilesMatch "(?i)\.(phps?|phtml|phar|pht)$">' . PHP_EOL;
		$t .= "\t" . 'SetHandler none' . PHP_EOL;
		$t .= "\t" . '<IfModule mod_php.c>' . PHP_EOL;
		$t .= "\t\t" . 'php_flag engine off' . PHP_EOL;
		$t .= "\t" . '</IfModule>' . PHP_EOL;
		$t .= '</FilesMatch>' . PHP_EOL;
		$t .= '<FilesMatch "(?i)\.(phps?|phtml|phar|pht|cgi|pl|py|rb|sh|lua|asp|aspx|jsp)$">' . PHP_EOL;
		$t .= "\t" . 'Require all denied' . PHP_EOL;
		$t .= '</FilesMatch>' . PHP_EOL;
		$t .= '# Protect files and directories from prying eyes.' . PHP_EOL;
		$t .= '<FilesMatch "\.(deleted|temp|tmp|import|csv)$">' . PHP_EOL;
		$t .= "\t" . 'Require all denied' . PHP_EOL;
		$t .= '</FilesMatch>' . PHP_EOL;
		$t .= 'Options -Indexes -ExecCGI' . PHP_EOL;
		$t .= 'AddHandler default-handler .php .phtml .phar .pht' . PHP_EOL;
		$t .= PHP_EOL;

		// mode 'off': hardening only, no access gate
		if ($mode==='off') {
			return $t;
		}

		$t .= '<IfModule mod_rewrite.c>' . PHP_EOL;
		$t .= 'RewriteEngine On' . PHP_EOL;
		$t .= PHP_EOL;
		$t .= '# 0. The marker store itself is never served.' . PHP_EOL;
		$t .= 'RewriteRule (^|/)\.publication(/|$) - [R=404,L]' . PHP_EOL;
		$t .= PHP_EOL;
		$t .= '# 1. Rule A: logged-in Dédalo users. Fixed cookie name; the daily-' . PHP_EOL;
		$t .= '#    rotated value must exist as an auth marker (synced at login).' . PHP_EOL;
		$t .= 'RewriteCond %{HTTP_COOKIE} (?:^|;\s*)' . self::COOKIE_NAME . '=([a-f0-9]{128}) [NC]' . PHP_EOL;
		$t .= 'RewriteCond "' . $media_path . '/.publication/auth/%1" -f' . PHP_EOL;
		$t .= 'RewriteRule ^ - [L]' . PHP_EOL;

		if ($mode==='publication' && !empty($public_qualities)) {
			$quality_alternation = implode('|', array_map(
				fn($quality) => preg_quote($quality, '/'),
				$public_qualities
			));
			$t .= PHP_EOL;
			$t .= '# 2. Rule B: public quality folders, gated by the publication marker' . PHP_EOL;
			$t .= '#    maintained by the diffusion engine. The file name identifies the' . PHP_EOL;
			$t .= '#    record: ...{component_tipo}_{section_tipo}_{section_id}[_lg-xxx].ext' . PHP_EOL;
			$t .= 'RewriteCond "' . $media_path . '/.publication/pub/$1_$2" -f' . PHP_EOL;
			$t .= 'RewriteRule ^(?:' . $quality_alternation . ')/(?:.+/)?[^/]*_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$ - [L]' . PHP_EOL;
		}

		if (!empty($addon_lines)) {
			$t .= PHP_EOL;
			$t .= '# MEDIA_HTACCESS_ADDONS (from config)' . PHP_EOL;
			foreach ($addon_lines as $line) {
				$t .= $line . PHP_EOL;
			}
		}

		$t .= PHP_EOL;
		$t .= '# 3. Default deny: 404 hides the existence of unpublished media.' . PHP_EOL;
		$t .= 'RewriteRule ^ - [R=404,L]' . PHP_EOL;
		$t .= '</IfModule>' . PHP_EOL;

		return $t;
	}//end build_htaccess



	/**
	* GET_CONFIG_HASH
	* Stable hash of everything that shapes the generated .htaccess: it is
	* embedded as a comment and compared on login so the file is rewritten
	* only when the configuration (or the template) actually changes.
	*
	* @param string $mode
	* @param array $public_qualities
	* @param array $addon_lines
	* @return string
	*/
	public static function get_config_hash(string $mode, array $public_qualities=[], array $addon_lines=[]) : string {

		return hash('sha256', json_encode([
			'version'	=> self::TEMPLATE_VERSION,
			'mode'		=> $mode,
			'qualities'	=> array_values($public_qualities),
			'addons'	=> array_values($addon_lines),
			'media'		=> self::get_media_path()
		]));
	}//end get_config_hash



	/**
	* GET_ADDON_LINES
	* Raw extra .htaccess lines from config (MEDIA_HTACCESS_ADDONS, a JSON
	* array of strings — replaces the legacy INIT_COOKIE_AUTH_ADDONS whose
	* lines targeted the removed <RequireAny> block).
	* @return array
	*/
	public static function get_addon_lines() : array {

		if (!defined('MEDIA_HTACCESS_ADDONS')) {
			return [];
		}

		$ar_lines = json_decode(MEDIA_HTACCESS_ADDONS);

		return is_array($ar_lines)
			? array_map('strval', $ar_lines)
			: [];
	}//end get_addon_lines



	/**
	* WRITE_HTACCESS
	* Writes DEDALO_MEDIA_PATH/.htaccess when missing or when the embedded
	* config-hash differs from the current configuration (idempotent on
	* every other login).
	*
	* @param string|null $mode_override = null
	*	Explicit mode ('off' | 'private' | 'publication'). Used by the
	*	media_control widget right after changing the configuration in
	*	config_core.php (the constants of the running request still hold
	*	the old value). null resolves from get_mode(); a resolved false
	*	leaves any existing file alone (login never calls this when the
	*	protection is disabled).
	* @return bool true when the file is up to date (written or already
	*         current), false on write failure
	*/
	public static function write_htaccess(?string $mode_override=null) : bool {

		if ($mode_override!==null) {
			if (!in_array($mode_override, ['off','private','publication'], true)) {
				debug_log(__METHOD__
					. " Refused invalid htaccess mode override: " . to_string($mode_override)
					, logger::ERROR
				);
				return false;
			}
			$mode = $mode_override;
		}else{
			$mode = self::get_mode();
			if ($mode===false) {
				return true; // protection off: leave any existing file alone
			}
		}

		$public_qualities	= $mode==='publication' ? self::get_public_qualities() : [];
		$addon_lines		= self::get_addon_lines();
		$hash				= self::get_config_hash($mode, $public_qualities, $addon_lines);
		$htaccess_file		= self::get_media_path() . '/.htaccess';

		// up to date? (hash comment match)
		if (file_exists($htaccess_file)) {
			$current = (string)file_get_contents($htaccess_file);
			if (str_contains($current, '# config-hash: ' . $hash)) {
				return true;
			}
		}

		$htaccess_text = self::build_htaccess($mode, $public_qualities, $addon_lines);

		if (false===file_put_contents($htaccess_file, $htaccess_text)) {
			debug_log(__METHOD__
				. " Unable to write media .htaccess file " . PHP_EOL
				. ' htaccess_file: ' . $htaccess_file
				, logger::ERROR
			);
			return false;
		}

		return true;
	}//end write_htaccess



	/**
	* GET_HTACCESS_STATUS
	* Inspects the generated media/.htaccess against the current
	* configuration (used by the media_control widget).
	* @return object { exists: bool, up_to_date: bool|null, path: string }
	*	up_to_date is null when the protection is disabled (no expected
	*	content to compare against).
	*/
	public static function get_htaccess_status() : object {

		$htaccess_file	= self::get_media_path() . '/.htaccess';
		$exists			= file_exists($htaccess_file);
		$mode			= self::get_mode();

		$up_to_date = null;
		if ($mode!==false) {
			$public_qualities	= $mode==='publication' ? self::get_public_qualities() : [];
			$hash				= self::get_config_hash($mode, $public_qualities, self::get_addon_lines());
			$up_to_date			= $exists
				&& str_contains((string)file_get_contents($htaccess_file), '# config-hash: ' . $hash);
		}

		return (object)[
			'exists'		=> $exists,
			'up_to_date'	=> $up_to_date,
			'path'			=> $htaccess_file
		];
	}//end get_htaccess_status



	/**
	* Test hook: overrides the cookie auth file location so unit tests never
	* touch the real core/extras/media_protection/ directory.
	*/
	public static ?string $cookie_auth_file_override = null;



	/**
	* GET_COOKIE_AUTH_FILE_PATH
	* @return string
	*/
	public static function get_cookie_auth_file_path() : string {

		return self::$cookie_auth_file_override
			?? DEDALO_EXTRAS_PATH.'/media_protection/cookie/cookie_auth.php';
	}//end get_cookie_auth_file_path



	/**
	* WRITE_COOKIE_AUTH_FILE
	* Persists the cookie auth data (today/yesterday rotated values) with
	* the '<?php exit();' HTTP-disclosure guard line, creating the parent
	* directory when missing (fresh installs never shipped it — the legacy
	* writer assumed it existed and the first login failed).
	* @param object $data
	* @return bool
	*/
	public static function write_cookie_auth_file(object $data) : bool {

		$cookie_file	= self::get_cookie_auth_file_path();
		$cookie_dir		= dirname($cookie_file);

		// MEDIA-03: 0750 (not world-readable) — keep the cookie-auth marker store
		// unreadable to other local users.
		if (!is_dir($cookie_dir) && !mkdir($cookie_dir, 0750, true)) {
			debug_log(__METHOD__
				. " Unable to create media protection cookie dir " . PHP_EOL
				. ' cookie_dir: ' . $cookie_dir
				, logger::ERROR
			);
			return false;
		}

		return false!==file_put_contents($cookie_file, '<?php exit(); ?>'.PHP_EOL.json_encode($data));
	}//end write_cookie_auth_file



	/**
	* READ_COOKIE_AUTH_FILE
	* Parses the cookie auth persistence file (today/yesterday rotated
	* values), stripping the '<?php exit();' HTTP-disclosure guard line
	* (legacy files hold raw JSON). Shared by login::init_cookie_auth and
	* the media_control widget.
	* @return object|null decoded data or null when missing/corrupt
	*/
	public static function read_cookie_auth_file() : ?object {

		$cookie_file = self::get_cookie_auth_file_path();
		if (!file_exists($cookie_file)) {
			return null;
		}

		$current_file	= (string)file_get_contents($cookie_file);
		$json_string	= $current_file;
		if (str_starts_with($current_file, '<?php')) {
			$json_start		= strpos($current_file, PHP_EOL);
			$json_string	= $json_start===false ? '' : substr($current_file, $json_start);
		}

		$data = json_decode($json_string);

		return is_object($data) ? $data : null;
	}//end read_cookie_auth_file



	/**
	* SYNC_AUTH_MARKERS_FROM_COOKIE_FILE
	* Re-creates the auth markers from the persisted cookie values (today +
	* yesterday). Used when the protection is (re)enabled from the
	* media_control widget so users already holding a valid cookie keep
	* media access without re-login. No-op (true) when no cookie file
	* exists yet — markers will be created at the next login.
	* @return bool
	*/
	public static function sync_auth_markers_from_cookie_file() : bool {

		$data = self::read_cookie_auth_file();
		if ($data===null) {
			return true;
		}

		$values = [];
		foreach (get_object_vars($data) as $day_data) {
			if (isset($day_data->cookie_value)) {
				$values[] = $day_data->cookie_value;
			}
		}

		return empty($values)
			? true
			: self::sync_auth_markers($values);
	}//end sync_auth_markers_from_cookie_file
}//end class media_protection
