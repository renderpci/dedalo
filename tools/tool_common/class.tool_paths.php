<?php declare(strict_types=1);
/**
* CLASS TOOL_PATHS
* Single source of truth for tool filesystem roots and web URLs.
*
* By default tools live in DEDALO_TOOLS_PATH (served at DEDALO_TOOLS_URL).
* Installs may add extra roots so third-party tools can live outside the
* Dédalo checkout — surviving git updates and independently versioned — via:
*
*   define('DEDALO_ADDITIONAL_TOOLS', [
*       ['path' => '/srv/custom_tools', 'url' => '/custom_tools']
*   ]);
*
* Security rules (SEC-069 / SEC-084):
* - every root is realpath()-canonicalized at load; invalid entries are dropped silently
* - the in-repo root is ALWAYS index 0: no additional root can shadow or replace a
*   stock tool (first-root-wins; collisions are reported by tools_register::import_tools)
* - roots under web-writable trees (media uploads, file caches, system tmp, session
*   storage) and world-writable directories are refused — tools contain executable PHP
* - the 'url' is mandatory and must be same-origin (root-relative path starting with a
*   single '/'); the browser dynamically imports tool JS modules and CSS from it, so a
*   cross-origin URL would execute third-party code inside the Dédalo origin
* - a tool physically present in a root is NOT callable until it is registered
*   (tools_register::import_tools) and authorized through a user profile
*
* (!) This class is included unconditionally by class.loader.php BEFORE the autoloader
* runs, because the autoloader itself calls get_tool_class_file() and get_roots().
* It must therefore have zero dependencies (no includes, no autoloaded classes).
*
* Consumers (keep in lockstep — all enumerate get_roots() for confinement):
* - core/base/class.loader.php               autoload + $ok_roots realpath confinement
* - core/api/v1/common/class.dd_tools_api.php  dispatch realpath confinement (SEC-084)
* - core/base/process_runner.php             background CLI include confinement
* - tools/tool_common/class.tools_register.php  discovery + import multi-root scan
* - tools/tool_common/class.tool_common.php     CSS/icon URL building via get_tool_url()
* - core/api/v1/common/class.dd_core_api.php    inlines DEDALO_TOOLS_URLS global via
*                                               get_additional_tools_url_map()
*
* @package Dédalo
* @subpackage Tools
*/
final class tool_paths {



	/**
	* GET_ROOTS
	* Returns all resolved tool roots in priority order.
	*
	* Index 0 is always the in-repo root (DEDALO_TOOLS_PATH / DEDALO_TOOLS_URL).
	* Additional roots from DEDALO_ADDITIONAL_TOOLS follow, in the order they
	* are declared, with invalid or forbidden entries silently dropped after an
	* ERROR-level log. Because the in-repo root is first, name collisions always
	* resolve to the stock tool — an additional root cannot override core tools.
	*
	* Return shape: array of stdClass objects, each with:
	*   - path  string  realpath()-canonicalized absolute directory (no trailing slash)
	*   - url   string  root-relative web path served for that directory (no trailing slash)
	*
	* Result is process-static: computed once per PHP worker and memoized. Callers
	* that need a fresh list after config changes must restart the worker.
	*
	* @return object[] Array of {path: string, url: string} root descriptor objects
	*/
	public static function get_roots() : array {

		static $roots = null;
		if ($roots !== null) {
			return $roots;
		}

		// Primary root: always index 0, always wins name collisions.
		// realpath() resolves symlinks so prefix checks are TOCTOU-safe.
		$roots = [(object)[
			'path'	=> realpath(DEDALO_TOOLS_PATH),
			'url'	=> rtrim(DEDALO_TOOLS_URL, '/')
		]];

		$additional = defined('DEDALO_ADDITIONAL_TOOLS') ? DEDALO_ADDITIONAL_TOOLS : [];
		foreach ((array)$additional as $item) {

			// Validate shape: each entry must be an associative array with 'path' and 'url'.
			$path	= is_array($item) ? ($item['path'] ?? null) : null;
			$url	= is_array($item) ? ($item['url']  ?? null) : null;
			$real	= (is_string($path) && $path!=='') ? realpath($path) : false;

			// Drop entries where the directory does not exist on disk or url is missing.
			// realpath() returns false for nonexistent paths; we refuse those early
			// rather than storing a broken root that will silently produce wrong paths.
			if ($real===false || !is_string($url) || $url==='') {
				debug_log(__METHOD__
					. ' Ignored invalid DEDALO_ADDITIONAL_TOOLS entry (need existing path + url): '
					. to_string($item)
					, logger::ERROR
				);
				continue;
			}

			// SEC: enforce the same-origin guarantee. The browser imports tool
			// JS modules from this URL, so a cross-origin URL would execute
			// third-party code in the Dédalo origin. Require a root-relative
			// path: starts with single '/' (not '//', which is scheme-relative)
			// and carries no scheme/host.
			if ($url[0]!=='/' || str_starts_with($url, '//') || parse_url($url, PHP_URL_HOST)!==null) {
				debug_log(__METHOD__
					. ' SEC refused non same-origin DEDALO_ADDITIONAL_TOOLS url'
					. ' (must be a root-relative path like /custom_tools): ' . $url
					, logger::ERROR
				);
				continue;
			}

			// SEC: refuse roots inside web-writable or world-writable directories.
			// Tools contain executable PHP; they must not live where upload handlers,
			// caches, or session files can write (see root_is_forbidden).
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
	* Returns true when the candidate root must be refused for security reasons.
	*
	* A tool root contains executable PHP loaded directly by the autoloader and
	* the dispatch layer. It must therefore never reside inside a directory where
	* untrusted content can be written (user uploads, generated caches, system
	* temp, PHP session files). An attacker who can write to any of those trees
	* could plant a file that gets autoloaded as a tool class.
	*
	* The check uses realpath()-canonicalized paths throughout (matching how
	* get_roots() stores them) so that symlinks and relative traversal are handled
	* consistently. Confinement prefix checks append DIRECTORY_SEPARATOR before
	* str_starts_with to avoid a partial directory name match (e.g. '/tmp2' must
	* not match against the /tmp forbidden root).
	*
	* @param string $real - Realpath-canonicalized absolute path of the candidate root
	* @return bool - true when the root is inside a forbidden tree or is world-writable
	*/
	private static function root_is_forbidden(string $real) : bool {

		// Build the forbidden-directory list dynamically from the active config.
		// array_filter removes any false entries produced by realpath() when
		// a constant is defined but the path does not exist on disk.
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
			// Exact match (root IS the forbidden dir) or prefix match (root is inside it).
			// DIRECTORY_SEPARATOR prevents '/tmp2' from matching against '/tmp'.
			if ($real===$dir || str_starts_with($real, $dir . DIRECTORY_SEPARATOR)) {
				return true;
			}
		}

		// world-writable root
		// A directory writable by any OS user is as dangerous as a known web-writable
		// path: any process on the server could plant a malicious tool class there.
		$perms = fileperms($real);
		if ($perms!==false && ($perms & 0002)) {
			return true;
		}

		return false;
	}//end root_is_forbidden



	/**
	* RESOLVE_TOOL_ROOT
	* Returns the first root (in priority order) whose directory tree contains
	* the named tool, or null when the tool is not found in any configured root.
	*
	* Because index 0 is always the in-repo root, a stock tool is always resolved
	* from DEDALO_TOOLS_PATH even if an additional root happens to contain a
	* directory of the same name (first-root-wins, enforced here by iteration order).
	*
	* Result is per-name memoized for the lifetime of the PHP worker. Callers must
	* not cache the returned object independently — use this method every time.
	*
	* @param string $tool_name - Tool directory name, e.g. 'tool_lang'
	* @return ?object - Root descriptor {path: string, url: string}, or null when absent
	*/
	public static function resolve_tool_root(string $tool_name) : ?object {

		// Per-name memo: avoids repeated filesystem is_dir() checks for the same tool.
		// A null sentinel is stored so repeated calls for missing tools don't re-scan.
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
	* Returns the absolute path of the tool's main PHP class file, resolved
	* across all configured roots in priority order.
	*
	* Follows the convention: <root>/tool_name/class.tool_name.php
	* For example, 'tool_lang' in the primary root resolves to:
	*   DEDALO_TOOLS_PATH/tool_lang/class.tool_lang.php
	*
	* (!) This is the canonical include path used by class.loader.php and
	* dd_tools_api.php. All confinement checks are performed on the value
	* returned here. Do not build tool class paths from DEDALO_TOOLS_PATH directly.
	*
	* @param string $tool_name - Tool directory name, e.g. 'tool_export'
	* @return ?string - Absolute class file path, or null when the tool exists in no root
	*/
	public static function get_tool_class_file(string $tool_name) : ?string {

		$root = self::resolve_tool_root($tool_name);

		return $root
			? $root->path . '/' . $tool_name . '/class.' . $tool_name . '.php'
			: null;
	}//end get_tool_class_file



	/**
	* GET_TOOL_URL
	* Returns the base web URL for a tool, e.g. '/custom_tools/tool_foo'.
	*
	* When the tool is found in a configured root, its URL is built from that
	* root's 'url' descriptor (which may differ from DEDALO_TOOLS_URL for tools
	* in additional roots). This URL is used by tool_common.php to build CSS and
	* icon asset paths, and is the same URL the browser uses to import tool JS.
	*
	* Falls back to the primary DEDALO_TOOLS_URL when the tool is not found on
	* disk, preserving historical URL-building behavior for edge cases such as
	* tools that have been removed from the filesystem but whose URL is still
	* referenced by cached UI state.
	*
	* @param string $tool_name - Tool directory name, e.g. 'tool_print'
	* @return string - Root-relative base URL for the tool (no trailing slash)
	*/
	public static function get_tool_url(string $tool_name) : string {

		$root = self::resolve_tool_root($tool_name);

		// Prefer the URL of the resolved root; fall back to the primary root's URL.
		// This ensures additional-root tools serve assets from the correct web path.
		return ($root ? $root->url : rtrim(DEDALO_TOOLS_URL, '/')) . '/' . $tool_name;
	}//end get_tool_url



	/**
	* GET_ADDITIONAL_TOOLS_URL_MAP
	* Returns a map of tool_name => base_url for tools that live in ADDITIONAL
	* roots only (i.e. not present in the primary in-repo root).
	*
	* This map is inlined into every page response by dd_core_api as the
	* DEDALO_TOOLS_URLS JavaScript global. The client-side tool_base_url()
	* utility (core/common/js/utils/util.js) checks this map when resolving
	* JS module and CSS asset URLs: if a key is absent, the tool is assumed
	* to live at the primary DEDALO_TOOLS_URL (preserving historical behavior).
	* The same check is performed in instances.js for dynamic module imports.
	*
	* First-root-wins is preserved by two mechanisms:
	* 1. Tools present in the primary root are excluded entirely from the map
	*    (the client never needs to override their URL).
	* 2. Among additional roots, earlier roots take precedence via the ??=
	*    null-coalescing-assign operator (first write wins, later roots skip).
	*
	* @return object - stdClass keyed by tool_name, values are root-relative base URLs
	*/
	public static function get_additional_tools_url_map() : object {

		$map	= [];
		$roots	= self::get_roots();

		// Iterate only additional roots (skip index 0, the primary root).
		foreach (array_slice($roots, 1) as $root) {
			$dirs = (array)glob($root->path . '/tool_*', GLOB_ONLYDIR);
			foreach ($dirs as $dir) {
				$name = basename($dir);
				// skip names shadowed by the primary root
				// A tool present in DEDALO_TOOLS_PATH takes precedence: it
				// will use the standard DEDALO_TOOLS_URL on the client side.
				if (is_dir($roots[0]->path . '/' . $name)) {
					continue;
				}
				// ??= ensures the first additional root to declare a tool wins;
				// subsequent additional roots with the same tool name are silently skipped.
				$map[$name] ??= $root->url . '/' . $name;
			}
		}

		return (object)$map;
	}//end get_additional_tools_url_map



}//end class tool_paths
