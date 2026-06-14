<?php declare(strict_types=1);
/**
* CLASS MEDIA_PROTECTION
* Media file access control for the work system and the publication layer.
*
* One media tree serves two audiences at the same URLs with no file duplication:
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
* the H.264/mp4 '?start=' clipping handlers. No PHP process ever sits
* in the media-serving path — the gate can never break streaming/Range.
*
* Failure mode is always 404 (not 403): the existence of unpublished media
* is not disclosed. Every failure path — missing marker, malformed cookie,
* engine down, non-grammar filename — denies access. Rule A markers are
* PHP-owned and independent of the Bun engine so engine failures never
* lock out editors.
*
* Modes (DEDALO_MEDIA_ACCESS_MODE):
*  - false         : no protection (media is world-readable)
*  - 'private'     : rule A only (legacy DEDALO_PROTECT_MEDIA_FILES behavior)
*  - 'publication' : rule A + rule B
*
* This class is pure/static and session-free: login::init_cookie_auth()
* delegates to it at every login, and install/maintenance scripts (e.g.
* the media_control widget in area_maintenance) can call it directly.
*
* Marker-store ownership split (must stay exclusive):
*  - PHP writes ONLY .publication/auth/
*  - Bun diffusion engine writes ONLY .publication/pub/ and .publication/dbs/
*
* @package Dédalo
* @subpackage Core
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
	* Set to null to use the production constant.
	* @var ?string $media_path_override
	*/
	public static ?string $media_path_override = null;



	/**
	* GET_MEDIA_PATH
	* Returns the absolute path to the media root directory. All other methods
	* read from this rather than DEDALO_MEDIA_PATH directly so that the
	* test-hook override ($media_path_override) takes effect everywhere.
	* @return string - absolute media root path
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
	* with DEDALO_MEDIA_PUBLIC_QUALITIES (array of strings); falls back to
	* get_default_public_qualities() when the constant is not defined.
	*
	* Hard security filter applied to every entry — even if configured:
	*  - 'original' and 'modified' folder names are always refused (master
	*    copies must never be reachable by anonymous users, regardless of
	*    what an admin types in the config).
	*  - Path traversal sequences ('..') are refused.
	*  - Only characters matching [A-Za-z0-9_.\/-] are accepted.
	*
	* The result is the set of folders that will appear in the rule-B
	* RewriteRule alternation inside the generated .htaccess; changing
	* this list requires a write_htaccess() call to regenerate the file.
	* @return array - validated, deduplicated quality folder strings
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
	* Web-delivery quality folders derived from the install constants.
	* These are the delivery-grade derivatives only; master/work folders
	* ('original', 'modified') are intentionally absent. The list is keyed
	* by media type so that adding a new media type in config automatically
	* expands the default set. Called by get_public_qualities() when
	* DEDALO_MEDIA_PUBLIC_QUALITIES is not defined in config.
	* @return array - default quality folder strings (not validated; callers
	*                 must pass through get_public_qualities() before use)
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
	* is refused (path-traversal guard: the value becomes a filename).
	*
	* Called at every successful login so the marker store self-heals after
	* a redeploy or directory wipe without requiring user action. The marker
	* files hold no content — the filename IS the credential.
	*
	* (!) Only PHP calls this method. The Bun engine must never write to auth/.
	*
	* @param array $valid_values - sha512 hex strings (128 chars each)
	* @return bool - false only on filesystem write failure; validation
	*                failures for individual values are logged and skipped
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
			// path-traversal guard: the value becomes the literal filename
			// in auth/; strict sha512-hex pattern ensures nothing unsafe lands on disk
			if (!is_string($value) || !preg_match('/^[a-f0-9]{128}$/', $value)) {
				debug_log(__METHOD__
					. " Refused invalid auth cookie value (expected sha512 hex)"
					, logger::ERROR
				);
				continue;
			}
			$keep[$value] = true;
			$marker = $auth_dir . '/' . $value;
			// file_exists() avoids redundant writes on every login for the same day's value
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
	* Pure function (unit-testable): no filesystem access, no session,
	* no side effects — callers may call it freely for preview/diff.
	*
	* The rewrite gate composes four stages in order:
	*  0. The .publication/ marker store itself is never served (404).
	*  1. Rule A: fixed-name cookie whose 128-hex value exists as a file in
	*     auth/ — grants full media access to any logged-in Dédalo user.
	*  2. Rule B (publication mode only): request is in an allowed quality
	*     folder AND the derived pub/{section_tipo}_{section_id} marker exists.
	*     The filename grammar that drives backreference capture:
	*       .+_([a-z0-9]+)_([0-9]+)(?:_lg-[a-zA-Z0-9-]{2,12})?\.[A-Za-z0-9]+$
	*     The greedy prefix anchors capture groups to the LAST two underscore
	*     tokens, so the component tipo prefix (which also uses underscores)
	*     cannot be mistaken for the section tipo. This grammar is LOAD-BEARING
	*     — it must match media_index.ts KEY_REGEX and the nginx sample block.
	*  3. Default deny as 404: the existence of unpublished media is not revealed.
	*
	* (!) The rewrite substitution is always '-' and the query string is
	* never touched so HTTP Range requests and the H.264 '?start=' clipping
	* module handlers keep working through the native web-server path.
	*
	* (!) When bumping the template (changing rules here), also increment
	* TEMPLATE_VERSION so existing installs regenerate on next login.
	*
	* Mode 'off' writes the SEC-088 hardening block only — no rewrite gate.
	* Used when an administrator disables protection from the media_control
	* widget so the previously-generated deny rules do not linger in the file.
	*
	* @param string $mode 'off' | 'private' | 'publication'
	* @param array $public_qualities = [] - validated quality folder strings
	*        (from get_public_qualities()); ignored for 'off' and 'private'
	* @param array $addon_lines = [] - raw rewrite lines appended before the
	*        final deny rule (from MEDIA_HTACCESS_ADDONS config)
	* @return string - full .htaccess text, UTF-8
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
			// (!) RewriteCond back-references for rule B use $1/$2 (captures from the
			// FOLLOWING RewriteRule), NOT %1 (which would reference the last RewriteCond
			// capture of rule A). The '$1_$2' form was a documented real bug — keep it
			// exactly as '$1_$2'. The RewriteRule line below must immediately follow.
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
	* Stable SHA-256 hash of everything that shapes the generated .htaccess:
	* TEMPLATE_VERSION, mode, quality list, addon lines, and the media path.
	* Embedded as '# config-hash: {hash}' in the file header and compared by
	* write_htaccess() so the file is rewritten only when something actually
	* changes (typically a no-op on every login).
	*
	* TEMPLATE_VERSION is included so bumping it in code forces every existing
	* install to regenerate even when all other inputs are identical.
	*
	* @param string $mode - 'off' | 'private' | 'publication'
	* @param array $public_qualities = [] - validated quality folder strings
	* @param array $addon_lines = [] - raw rewrite lines from config
	* @return string - 64-char lowercase hex (SHA-256)
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
	* Decodes the MEDIA_HTACCESS_ADDONS config constant (a JSON-encoded array
	* of raw Apache rewrite directive strings) and returns them as a flat
	* string array. These lines are appended directly before the final deny
	* rule in the generated .htaccess, so the caller is responsible for
	* their syntax correctness.
	*
	* This constant replaced the legacy INIT_COOKIE_AUTH_ADDONS, whose lines
	* targeted the <RequireAny> block that no longer exists in the template.
	*
	* @return array - string[] of raw directive lines, or [] when constant
	*                 is not defined or its value does not decode to an array
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

		// idempotency guard: compare the embedded config-hash comment rather
		// than the full file body so whitespace/content drift never matters;
		// if the hash line is present the generated output would be identical
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
	* Inspects the generated media/.htaccess against the current configuration.
	* Used by the media_control widget to report the .htaccess state to the UI
	* without triggering a write.
	*
	* @return object { exists: bool, up_to_date: bool|null, path: string }
	*   - exists: whether the .htaccess file is present on disk
	*   - up_to_date: true when the embedded config-hash matches the current
	*     config; false when a rewrite is needed; null when protection is
	*     disabled (mode===false — there is no expected content to compare)
	*   - path: absolute path to the .htaccess file (for display in the widget)
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
	* Set to null to use the production path resolved by get_cookie_auth_file_path().
	* @var ?string $cookie_auth_file_override
	*/
	public static ?string $cookie_auth_file_override = null;



	/**
	* GET_COOKIE_AUTH_FILE_PATH
	* Returns the path to the PHP-guarded JSON file that persists today/yesterday
	* cookie values across requests. The file lives under DEDALO_EXTRAS_PATH so
	* it is outside the web root. All readers/writers call this rather than
	* hardcoding the path so the test-hook override ($cookie_auth_file_override)
	* takes effect everywhere.
	* @return string - absolute path to cookie_auth.php persistence file
	*/
	public static function get_cookie_auth_file_path() : string {

		return self::$cookie_auth_file_override
			?? DEDALO_EXTRAS_PATH.'/media_protection/cookie/cookie_auth.php';
	}//end get_cookie_auth_file_path



	/**
	* WRITE_COOKIE_AUTH_FILE
	* Persists the cookie auth data (today/yesterday rotated values) as JSON,
	* prepended with a '<?php exit(); ?>' HTTP-disclosure guard so that a
	* misconfigured web server serving the extras directory would return an
	* empty response rather than the JSON payload.
	*
	* Creates the parent directory on first call (fresh installs never shipped
	* it — the legacy writer assumed it existed and the very first login failed
	* silently). Called by login::init_cookie_auth() at every login.
	*
	* @param object $data - structured auth data with per-day cookie values;
	*        shape: { today: {cookie_value: string, ...}, yesterday: {...} }
	* @return bool - false on mkdir or write failure
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
	* Parses the cookie auth persistence file (today/yesterday rotated values),
	* stripping the '<?php exit(); ?>' HTTP-disclosure guard line that
	* write_cookie_auth_file() prepends. Legacy files written before the guard
	* line was introduced hold raw JSON from the first byte — both shapes are
	* handled transparently by the str_starts_with('<?php') branch.
	*
	* Shared by login::init_cookie_auth (recycle/rotate logic) and the
	* media_control widget (sync_auth_markers_from_cookie_file on re-enable).
	*
	* @return object|null - decoded auth data object, or null when the file is
	*         missing, empty, or its JSON is malformed/not an object
	*/
	public static function read_cookie_auth_file() : ?object {

		$cookie_file = self::get_cookie_auth_file_path();
		if (!file_exists($cookie_file)) {
			return null;
		}

		$current_file	= (string)file_get_contents($cookie_file);
		$json_string	= $current_file;
		// guard-line strip: skip the PHP exit guard first line if present;
		// legacy files that predate the guard hold raw JSON from byte 0
		if (str_starts_with($current_file, '<?php')) {
			$json_start		= strpos($current_file, PHP_EOL);
			$json_string	= $json_start===false ? '' : substr($current_file, $json_start);
		}

		$data = json_decode($json_string);

		// json_decode returns null for invalid JSON and scalar/array for other shapes;
		// only a plain object (stdClass) is the expected payload shape
		return is_object($data) ? $data : null;
	}//end read_cookie_auth_file



	/**
	* SYNC_AUTH_MARKERS_FROM_COOKIE_FILE
	* Re-creates the auth marker files from the cookie values persisted on disk
	* (today + yesterday). Used by the media_control widget when protection is
	* (re)enabled so users already holding a valid cookie keep media access
	* without needing to log in again.
	*
	* No-op (returns true) when no cookie file exists yet — markers will be
	* created naturally at the next login via sync_auth_markers().
	*
	* @return bool - false only on filesystem write failure inside
	*                sync_auth_markers(); true when there is nothing to sync
	*/
	public static function sync_auth_markers_from_cookie_file() : bool {

		$data = self::read_cookie_auth_file();
		if ($data===null) {
			return true;
		}

		// iterate over per-day slots (today, yesterday) and collect cookie values;
		// get_object_vars() avoids dynamic property access warnings in strict mode
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
