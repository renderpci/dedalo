<?php declare(strict_types=1);
/**
* TOOL_PATHS
*
* Single source of truth for tool filesystem roots and web URLs.
*
* By default tools live in DEDALO_TOOLS_PATH (served at DEDALO_TOOLS_URL).
* Installs may add EXTRA roots so third-party tools can live outside the
* Dédalo checkout (surviving git updates, independently versioned) via:
*
*   define('DEDALO_ADDITIONAL_TOOLS', [
*       ['path' => '/srv/custom_tools', 'url' => '/custom_tools']
*   ]);
*
* Rules (SEC-069 / SEC-084):
* - every root is realpath()-canonicalized at load; invalid entries dropped
* - the in-repo root is ALWAYS first: an additional root can never shadow
*   or replace a stock tool (first-root-wins)
* - roots under web-writable trees (media, cache files, system tmp, session
*   path) and world-writable directories are refused
* - the 'url' is mandatory and must be same-origin: the browser loads tool
*   JS modules and CSS directly from it
* - a tool present in a root is NOT callable until it is registered
*   (tools_register::import_tools) and authorized by a user profile
*
* Consumers (keep in lockstep — they all enumerate get_roots()):
* - core/base/class.loader.php          autoload + $ok_roots confinement
* - core/api/v1/common/class.dd_tools_api.php  dispatch realpath confinement
* - core/base/process_runner.php        background CLI include confinement
* - tools/tool_common/class.tools_register.php discovery + import
* - tools/tool_common/class.tool_common.php    css/icon URL building
*/
final class tool_paths {



	/**
	* GET_ROOTS
	* Resolved tool roots in priority order. Index 0 is always the in-repo
	* DEDALO_TOOLS_PATH / DEDALO_TOOLS_URL pair.
	* @return object[] [{path: string (realpath), url: string (no trailing slash)}]
	*/
	public static function get_roots() : array {

		static $roots = null;
		if ($roots !== null) {
			return $roots;
		}

		$roots = [(object)[
			'path'	=> realpath(DEDALO_TOOLS_PATH),
			'url'	=> rtrim(DEDALO_TOOLS_URL, '/')
		]];

		$additional = defined('DEDALO_ADDITIONAL_TOOLS') ? DEDALO_ADDITIONAL_TOOLS : [];
		foreach ((array)$additional as $item) {

			$path	= is_array($item) ? ($item['path'] ?? null) : null;
			$url	= is_array($item) ? ($item['url']  ?? null) : null;
			$real	= (is_string($path) && $path!=='') ? realpath($path) : false;

			if ($real===false || !is_string($url) || $url==='') {
				debug_log(__METHOD__
					. ' Ignored invalid DEDALO_ADDITIONAL_TOOLS entry (need existing path + url): '
					. to_string($item)
					, logger::ERROR
				);
				continue;
			}

			if (self::root_is_forbidden($real)) {
				debug_log(__METHOD__
					. ' SEC refused tools root under web-writable/forbidden directory: ' . $real
					, logger::ERROR
				);
				continue;
			}

			$roots[] = (object)[
				'path'	=> $real,
				'url'	=> rtrim($url, '/')
			];
		}

		return $roots;
	}//end get_roots



	/**
	* ROOT_IS_FORBIDDEN
	* Refuse roots inside web-writable trees or world-writable directories:
	* a tools root is executable PHP, so it must never live where uploads,
	* caches or sessions can write.
	* @param string $real Canonicalized candidate root
	* @return bool
	*/
	private static function root_is_forbidden(string $real) : bool {

		$forbidden = array_filter([
			defined('DEDALO_MEDIA_PATH')
				? realpath(DEDALO_MEDIA_PATH)
				: false,
			defined('DEDALO_CACHE_MANAGER') && !empty(DEDALO_CACHE_MANAGER['files_path'])
				? realpath(DEDALO_CACHE_MANAGER['files_path'])
				: false,
			realpath(sys_get_temp_dir()),
			realpath(session_save_path() ?: '') ?: false
		]);

		foreach ($forbidden as $dir) {
			if ($real===$dir || str_starts_with($real, $dir . DIRECTORY_SEPARATOR)) {
				return true;
			}
		}

		// world-writable root
		$perms = fileperms($real);
		if ($perms!==false && ($perms & 0002)) {
			return true;
		}

		return false;
	}//end root_is_forbidden



	/**
	* RESOLVE_TOOL_ROOT
	* First root (in priority order) containing the tool directory.
	* @param string $tool_name e.g. 'tool_lang'
	* @return ?object {path, url} or null when the tool exists in no root
	*/
	public static function resolve_tool_root(string $tool_name) : ?object {

		static $memo = [];
		if (array_key_exists($tool_name, $memo)) {
			return $memo[$tool_name];
		}

		foreach (self::get_roots() as $root) {
			if (is_dir($root->path . '/' . $tool_name)) {
				return $memo[$tool_name] = $root;
			}
		}

		return $memo[$tool_name] = null;
	}//end resolve_tool_root



	/**
	* GET_TOOL_CLASS_FILE
	* Absolute path of the tool class file, resolved across roots.
	* @param string $tool_name
	* @return ?string null when the tool directory exists in no root
	*/
	public static function get_tool_class_file(string $tool_name) : ?string {

		$root = self::resolve_tool_root($tool_name);

		return $root
			? $root->path . '/' . $tool_name . '/class.' . $tool_name . '.php'
			: null;
	}//end get_tool_class_file



	/**
	* GET_TOOL_URL
	* Per-tool base web URL, e.g. '/custom_tools/tool_foo'.
	* Falls back to the primary root URL when the tool is not found on disk
	* (preserves historical URL building for edge cases).
	* @param string $tool_name
	* @return string
	*/
	public static function get_tool_url(string $tool_name) : string {

		$root = self::resolve_tool_root($tool_name);

		return ($root ? $root->url : rtrim(DEDALO_TOOLS_URL, '/')) . '/' . $tool_name;
	}//end get_tool_url



	/**
	* GET_ADDITIONAL_TOOLS_URL_MAP
	* Map tool_name => base_url for tools living in ADDITIONAL roots only.
	* Sent to the client as DEDALO_TOOLS_URLS: an absent key means the tool
	* lives in the primary root (client keeps its historical URL building).
	* First-root-wins is preserved because the primary root is excluded and
	* earlier additional roots take precedence over later ones.
	* @return object
	*/
	public static function get_additional_tools_url_map() : object {

		$map	= [];
		$roots	= self::get_roots();

		foreach (array_slice($roots, 1) as $root) {
			$dirs = (array)glob($root->path . '/tool_*', GLOB_ONLYDIR);
			foreach ($dirs as $dir) {
				$name = basename($dir);
				// skip names shadowed by the primary root
				if (is_dir($roots[0]->path . '/' . $name)) {
					continue;
				}
				$map[$name] ??= $root->url . '/' . $name;
			}
		}

		return (object)$map;
	}//end get_additional_tools_url_map



}//end class tool_paths
