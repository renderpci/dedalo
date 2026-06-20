<?php declare(strict_types=1);
/**
* CLASS SYSTEM_INFO
* Maintenance widget that collects and exposes a full snapshot of the server's
* runtime environment to the Dédalo administration dashboard.
*
* Responsibilities:
* - Prerequisites check (`requeriments_list`): evaluates every hard and soft
*   dependency of the Dédalo platform — OS RAM, CPU speed, PHP version and
*   memory limit, Apache, PostgreSQL, optional MySQL/MariaDB, HTTP/2, HTTPS,
*   PHP GD, FFmpeg + ffprobe + libx264, ImageMagick, and disk free space.
*   Each entry is an stdClass with keys 'name', 'value' (bool or string),
*   and 'info' (human-readable detail shown in the UI).
* - Live system snapshot (`system_list`): queries the Linfo library via
*   `system::get_info()` for OS, CPU architecture, kernel, distribution,
*   hostname, virtualization, block devices, RAID, services, load average,
*   RAM layout, disk layout, mount points, network interfaces, uptime, and
*   process statistics. Appends PHP OPcache counters (hit rate, memory,
*   restart count, hit/miss totals) for quick performance diagnosis.
*
* Invocation path:
*   JS dashboard panel → `dd_area_maintenance_api::get_widget_value()`
*   → `system_info::get_value()` (no arguments; pure read probe).
*
* The widget is registered in `area_maintenance::get_ar_widgets()` with
* `background: true`, meaning it loads asynchronously while collapsed so that
* any server-issue status can be surfaced without blocking the dashboard render.
*
* All methods are static; the class is never instantiated.
*
* Dependencies:
* - `system` (core/base/class.system.php) — all OS-level probes and version gates.
* - `Ffmpeg` (core/media_engine/class.Ffmpeg.php) — FFmpeg/ffprobe version and path.
* - `ImageMagick` (core/media_engine/class.ImageMagick.php) — ImageMagick version and path.
* - Linfo composer library (vendor/) — rich hardware/OS introspection via `system::get_info()`.
* - `to_string()` (shared/core_functions.php) — serialises mixed values to display strings.
* - `opcache_get_status()` (PHP built-in) — OPcache runtime statistics.
*
* @package Dédalo
* @subpackage Core
*/
class system_info {



	/**
	* GET_VALUE
	* Builds and returns the full server-environment snapshot for the System Info
	* widget panel.
	*
	* Called exclusively by `dd_area_maintenance_api::get_widget_value()`, which
	* hard-codes the method name and forwards no arguments. This method is therefore
	* a pure, no-side-effect read probe.
	*
	* Return shape (result key of the outer response):
	* {
	*   requeriments_list: array<stdClass> — each item: { name: string, value: bool|string, info: string }
	*   system_list:       array<stdClass> — each item: { name: string, value: mixed }
	*   errors:            null
	* }
	*
	* The outer response envelope follows the standard Dédalo API contract:
	* {
	*   result: object|false,
	*   msg:    string,
	*   errors: array<string>
	* }
	*
	* Exceptions thrown by any probe (e.g. Linfo unavailable, opcache disabled)
	* are caught and appended to `$response->errors`; the method always returns a
	* response object, never propagates an exception to the caller.
	*
	* @return object - standard response envelope; result contains requeriments_list and system_list
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// requeriments_list
		// Accumulated inside the try block; on any uncaught exception the partial
		// list is still used — the catch appends the error message and execution
		// continues to the response-assembly block below.
		$requeriments_list = [];

		try {

			// RAM
			// system::get_ram() returns whole gigabytes; minimum is 16 GB for production.
			$total_gb	= system::get_ram();
			$requeriments_list[] = (object)[
				'name'	=> 'System RAM memory',
				'value'	=> ($total_gb>=16),
				'info'	=> 'RAM: '.$total_gb .' GB - minimum: 16 GB'
			];

			// MHz
			// CPU speed is omitted from the list when Linfo cannot determine it
			// (returns null/0), so the entry only appears when reliable data exists.
			$mhz = system::get_mhz();
			if ($mhz) {
				$requeriments_list[] = (object)[
					'name'	=> 'System processor clock speed',
					'value'	=> ($mhz >= 3500),
					'info'	=> 'MHz: ' . $mhz . ' - minimum: 3500 MHz'
				];
			}

			// PHP version
			// The minimum is compared by system::test_php_version_supported(), which
			// uses version_compare() internally. PHP_VERSION is the current runtime string.
			$requeriments_list[] = (object)[
				'name'	=> 'PHP Supported version',
				'value'	=> system::test_php_version_supported('8.3.0'),
				'info'	=> 'Version: '.PHP_VERSION . ' - minimum: 8.3.0'
			];

			// php_memory
			// system::get_php_memory() reads php.ini's memory_limit and converts to GB.
			// The minimum 8 GB reflects the working-set needs of large ontology imports.
			$php_memory_gigabytes = system::get_php_memory();
			$requeriments_list[] = (object)[
				'name'	=> 'PHP memory limit',
				'value'	=> $php_memory_gigabytes >= 8,
				'info'	=> 'Memory: '.$php_memory_gigabytes . ' GB - minimum: 8 GB'
			];

			// Apache version
			// Falls back to the literal string 'Unknown' when the binary is not found,
			// so the 'info' field always contains a human-readable value even on failure.
			$version = system::get_apache_version() ?? 'Unknown';
			$requeriments_list[] = (object)[
				'name'	=> 'Apache supported version',
				'value'	=> system::test_apache_version_supported('2.4.6'),
				'info'	=> 'Version: '. $version . ' - minimum: 2.4.6'
			];

			// PostgreSQL version
			// PostgreSQL is Dédalo's primary data store; 16.1 is the tested minimum.
			$version = system::get_postgresql_version() ?? 'Unknown';
			$requeriments_list[] = (object)[
				'name'	=> 'PostgreSQL supported version',
				'value'	=> system::test_postgresql_version_supported('16.1'),
				'info'	=> 'Version: '. $version . ' - minimum: 16.1'
			];

			// mysql
			// MySQL/MariaDB is optional — only the diffusion subsystem writes to it via
			// the Bun server. The check is therefore guarded: it only runs when the
			// MYSQL_DEDALO_DATABASE_CONN constant is set (meaning diffusion is configured)
			// AND the connection is local (hostname === 'localhost' or a Unix socket is
			// specified). Remote MySQL setups skip the check because `system::get_mysql_server()`
			// shells out to the local CLI binary, which would not reflect the remote version.
			if (	(defined('MYSQL_DEDALO_DATABASE_CONN') && !empty(MYSQL_DEDALO_DATABASE_CONN))
				&& ( defined('MYSQL_DEDALO_HOSTNAME_CONN') && MYSQL_DEDALO_HOSTNAME_CONN==='localhost'
					|| (defined('MYSQL_DEDALO_SOCKET_CONN') && !empty(MYSQL_DEDALO_SOCKET_CONN)) )
				) {
				$mysql_server = system::get_mysql_server();
				if (empty($mysql_server)) {
					// Configured but not installed — surface as a failing requirement.
					$requeriments_list[] = (object)[
						'name'	=> 'MySQL/MariaDB server not found',
						'value'	=> false,
						'info'	=> 'Not installed'
					];
				} else {
					$version = system::get_mysql_version($mysql_server) ?? 'Unknown';
					if ($mysql_server==='mariadb') {
						$requeriments_list[] = (object)[
							'name'	=> 'MariaDB supported version',
							'value'	=> (version_compare(trim($version), '5.6') >= 0),
							'info'	=> 'Version: '. $version . ' - minimum: 5.6'
						];
					}else
					if ($mysql_server==='mysql') {
						$requeriments_list[] = (object)[
							'name'	=> 'MySQL supported version',
							'value'	=> (version_compare(trim($version), '5.6') >= 0),
							'info'	=> 'Version: '. $version . ' - minimum: 5.6'
						];
					}
				}
			}

			// HTTP Protocol
			// Dédalo requires HTTP/2 for performance (multiplexed requests, server push).
			// The value is read from $_SERVER["SERVER_PROTOCOL"] which Apache/Nginx populates
			// before the PHP handler runs.
			$protocol = $_SERVER["SERVER_PROTOCOL"];
			$h2_protocol = ($protocol==='HTTP/2.0');
			$requeriments_list[] = (object)[
				'name'	=> 'HTTP h2 protocol',
				'value'	=> $h2_protocol,
				'info'	=> "Protocol: $protocol - required: HTTP/2.0"
			];

			// HTTPS support
			// (!) Two separate conditions are combined with OR, but both start with
			// `isset($_SERVER['HTTPS'])`, meaning the second branch — port 443 check —
			// only fires when $_SERVER['HTTPS'] is set. A reverse-proxy forwarding HTTPS
			// as plain HTTP on port 443 without setting $_SERVER['HTTPS'] would be missed.
			// The 'info' field falls back to $_SERVER['SERVER_PORT'] when $_SERVER['HTTPS']
			// is unset, so the displayed value is always meaningful.
			$is_https = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on')
					 || (isset($_SERVER['HTTPS']) && $_SERVER['SERVER_PORT'] == 443);
			$requeriments_list[] = (object)[
				'name'	=> 'HTTPS connection',
				'value'	=> $is_https,
				'info'	=> "Connection HTTPS: " . ($_SERVER['HTTPS'] ?? $_SERVER['SERVER_PORT']) . " - required: HTTPS 443"
			];

			// GD lib installed
			// PHP GD is required for on-the-fly thumbnail generation and image-format
			// conversion in the media pipeline (e.g. TIFF → JPEG for web preview).
			$gd_lib_installed = system::check_gd_lib();
			$requeriments_list[] = (object)[
				'name'	=> 'GD lib installed',
				'value'	=> $gd_lib_installed,
				'info'	=> 'GD lib is needed to manage images in PHP'
			];

			// FFMPEG installed
			// Ffmpeg::get_version() shells out to the configured ffmpeg binary and parses
			// its version string. An empty result means the binary was not found.
			$ffmpeg_version = Ffmpeg::get_version();
			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG installed',
				'value'	=> !empty($ffmpeg_version),
				'info'	=> 'Path: ' . Ffmpeg::get_ffmpeg_installed_path()
			];

			// FFMPEG minimum version
			// version_compare needs trim() because the version string may contain trailing
			// whitespace from the shell output. 4.4.2 is the oldest release with all codec
			// flags Dédalo uses for H.264/AAC transcoding.
			$minimun = '4.4.2';
			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG supported version',
				'value'	=> (version_compare(trim($ffmpeg_version), $minimun) >= 0),
				'info'	=> 'Version: '. $ffmpeg_version . ' - minimum: ' . $minimun
			];

			// FFPROVE version
			// (!) The method and variable names spell 'ffprove' — a historical typo for
			// 'ffprobe'. The underlying Ffmpeg class documents this typo explicitly in
			// Ffmpeg::get_ffprove_installed_path(). Do not rename here; identifiers must
			// stay in sync with the Ffmpeg class.
			$ffprove_version = Ffmpeg::get_ffprove_version();
			$requeriments_list[] = (object)[
				'name'	=> 'ffprove installed',
				'value'	=> !empty($ffprove_version),
				'info'	=> 'Version: ' .$ffprove_version. ' - Path: ' . Ffmpeg::get_ffprove_installed_path()
			];

			// FFMPEG libx264 installed
			// to_string() serialises the mixed return value of Ffmpeg::check_lib() to a
			// display string (e.g. 'true', 'false', or the raw version token).
			// Note: 'value' here receives a string rather than a bool, unlike most other
			// entries. The JS widget is expected to handle both types for display.
			$libx264_installed = Ffmpeg::check_lib('libx264');
			$requeriments_list[] = (object)[
				'name'	=> 'FFMPEG libx264 installed',
				'value'	=> to_string($libx264_installed),
				'info'	=> 'FFMPEG lib libx264 enable'
			];

			// IMAGEMAGICK installed
			// ImageMagick handles TIFF, PDF, and multi-page image operations that GD
			// cannot perform. get_version() shells out to the `convert` binary.
			$imagemagick_version = ImageMagick::get_version();
			$requeriments_list[] = (object)[
				'name'	=> 'ImageMagick installed',
				'value'	=> !empty($imagemagick_version),
				'info'	=> 'Path: ' . ImageMagick::get_imagemagick_installed_path()
			];

			$requeriments_list[] = (object)[
				'name'	=> 'ImageMagick supported version',
				'value'	=> (version_compare(trim($imagemagick_version), '6.9') >= 0),
				'info'	=> 'Version: '. $imagemagick_version . ' - minimum: 6.9'
			];

			// Disk free space
			// system::get_disk_free_space() returns megabytes (or null); the null-coalescing
			// default of 0 means a completely full or unreadable disk is surfaced as failing
			// (0 MB is not > 4000 MB). The same $free_space variable is reused in system_list
			// below to avoid a redundant shell call.
			$free_space = system::get_disk_free_space() ?? 0; // in megabytes
			$requeriments_list[] = (object)[
				'name'	=> 'disk free space',
				'info'	=> 'Main disk available space: '. number_format($free_space/1024, 0,'', '.') .' GB',
				'value'	=> $free_space > 4000
			];

		// system_list
		// Detailed live snapshot from the Linfo library ($info obtained at the top of
		// this try block). Each entry is { name: string, value: mixed }. The JS widget
		// renders whatever value shape Linfo returns, so types vary: strings, arrays,
		// or nested objects depending on the accessor.

			$system_list = [];

			$system_list[] = (object)[
				'name'	=> 'os',
				'value'	=> host_info::get_os()
			];

			$system_list[] = (object)[
				'name'	=> 'model',
				'value'	=> host_info::get_model()
			];

			$system_list[] = (object)[
				'name'	=> 'CPU architecture',
				'value'	=> host_info::get_cpu_architecture()
			];

			$system_list[] = (object)[
				'name'	=> 'cpu',
				'value'	=> host_info::get_cpu()
			];

			$system_list[] = (object)[
				'name'	=> 'kernel',
				'value'	=> host_info::get_kernel()
			];

			$system_list[] = (object)[
				'name'	=> 'distribution',
				'value'	=> host_info::get_distro()
			];

			$system_list[] = (object)[
				'name'	=> 'hostname',
				'value'	=> host_info::get_hostname()
			];

			$system_list[] = (object)[
				'name'	=> 'load',
				'value'	=> host_info::get_load()
			];

			$system_list[] = (object)[
				'name'	=> 'ram',
				'value'	=> host_info::get_ram()
			];

			$system_list[] = (object)[
				'name'	=> 'hd',
				'value'	=> host_info::get_hd()
			];

			$system_list[] = (object)[
				'name'	=> 'disk info',
				'value'	=> system::get_disk_info()
			];

			// Reuse $free_space computed in the requeriments_list block above (avoids a
			// redundant system call). Convert MB → GB with dot-separated thousands formatting.
			$system_list[] = (object)[
				'name'	=> 'disk free space',
				'value'	=> number_format($free_space/1024, 0,'', '.') . ' GB'
			];

			$system_list[] = (object)[
				'name'	=> 'mounts',
				'value'	=> host_info::get_mounts()
			];

			$system_list[] = (object)[
				'name'	=> 'net',
				'value'	=> host_info::get_net()
			];

			$system_list[] = (object)[
				'name'	=> 'uptime',
				'value'	=> host_info::get_uptime()
			];

		// opcache info
		// opcache_get_status() returns false when OPcache is disabled; if so, array
		// key access on false throws a TypeError caught by the outer catch block.
		// The hit_rate is rounded to 2 decimal places for display; memory values are
		// expressed in MB (bytes ÷ 1024 ÷ 1024), rounded to 1 decimal place.
			$s = opcache_get_status();
			if (!is_array($s)) {
				throw new Exception('OPcache is not enabled (opcache_get_status returned false)');
			}
			$system_list[] = (object)[
				'name'	=> 'opcache_hit_rate',
				'value'	=> round($s['opcache_statistics']['opcache_hit_rate'], 2) . "%"
			];
			$system_list[] = (object)[
				'name'	=> 'opcache_used_memory',
				'value'	=> round($s['memory_usage']['used_memory'] / 1024 / 1024, 1) . " MB"
			];
			$system_list[] = (object)[
				'name'	=> 'opcache_free_memory',
				'value'	=> round($s['memory_usage']['free_memory'] / 1024 / 1024, 1) . " MB"
			];
			$system_list[] = (object)[
				'name'	=> 'opcache_oom_restarts',
				'value'	=> $s['opcache_statistics']['oom_restarts']
			];
			$system_list[] = (object)[
				'name'	=> 'opcache_hits',
				'value'	=> $s['opcache_statistics']['hits']
			];
			$system_list[] = (object)[
				'name'	=> 'opcache_misses',
				'value'	=> $s['opcache_statistics']['misses']
			];

		} catch (Exception $e) {
			$response->errors[] = $e->getMessage();
		}

		// response OK
		// The result is always set (even after a caught exception) so the JS dashboard
		// can render partial data. 'errors' inside result is set to null; any exceptions
		// are surfaced in the outer $response->errors array.
		$response->result	= (object)[
			'requeriments_list'	=> $requeriments_list,
			'system_list'		=> $system_list,
			'errors'			=> null
		];
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully.'
			: 'Warning. Request done with errors.';


		return $response;
	}//end get_value



}//end system_info
