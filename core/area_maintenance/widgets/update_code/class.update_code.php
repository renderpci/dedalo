<?php declare(strict_types=1);
// Include the updates definition
include_once DEDALO_CORE_PATH . '/base/update/class.update.php';
/**
* UPDATE_CODE
* Maintenance-area widget that downloads, verifies, and installs a new Dédalo
* code release from a remote code server, or builds a release archive from a
* local/remote Git repository.
*
* This class is the server-side business logic for the "Update code" panel in the
* Dédalo maintenance dashboard. It is dispatched exclusively through
* `dd_area_maintenance_api::widget_request()`, which applies authentication and
* permission checks before forwarding calls here.
*
* Two public entry points are exposed through the API_ACTIONS allowlist:
*  - update_code()           — full download-extract-install pipeline
*  - build_version_from_git_master() — archive a Git branch into a deployable ZIP
*
* Internal helpers (check_remote_server, update_incremental, update_clean) are
* called only from within this class and are intentionally omitted from API_ACTIONS
* to prevent direct remote dispatch (SEC-044).
*
* `get_value()` is reached via the `get_widget_value` hard-coded route (not
* through API_ACTIONS) and returns the current readiness state of all configured
* CODE_SERVERS for the dashboard panel.
*
* Path and URL helpers (get_code_path, set_code_path, get_file_version,
* set_development_path, get_code_url) derive structured filesystem locations from
* the running Dédalo version triple [major, minor, patch] and the
* DEDALO_CODE_FILES_DIR / DEDALO_CODE_FILES_URL constants.
*
* Update version catalogue: get_code_update_info() reads from class update (via
* update::get_updates()) to determine which versions are safely reachable from the
* caller's installed version, following the strict linear upgrade path enforced by
* Dédalo (no downgrades, no skipping minor versions without explicit gateway patches).
*
* Relationships:
*  - Dispatched by: dd_area_maintenance_api::widget_request()
*  - Delegates data-migration steps to: update (core/base/update/class.update.php)
*  - Uses tool_common::get_active_tool_names() to identify official tools during
*    clean updates, so non-official (third-party) tools are preserved.
*  - Writes JS language files post-install via backup::write_lang_file().
*  - Logs activity to logger::$obj['activity'] on successful installs.
*
* @package Dédalo
* @subpackage Core
*/
class update_code {



	/**
	* SEC-044: explicit allowlist of methods callable through
	* `dd_area_maintenance_api::widget_request`.
	*
	* `check_remote_server`, `update_incremental`, and `update_clean` are internal
	* helpers invoked only from within this class and must NOT be remotely
	* dispatchable. `get_value` is invoked through the hard-coded `get_widget_value`
	* route and is therefore also excluded here.
	*
	* @var array<string>
	*/
	public const API_ACTIONS = [
		'update_code',
		'build_version_from_git_master'
	];



	/**
	* CHECK_REMOTE_SERVER
	* Probes a remote Dédalo code server to determine whether it is ready to
	* serve code archives.
	*
	* Issues a POST to the server's JSON API endpoint using the `dd_utils_api`
	* action `get_server_ready_status`. The raw cURL result string is decoded in
	* place so callers receive a structured object rather than a JSON string.
	*
	* A 5-second timeout is enforced; the SERVER_PROXY constant (defined in
	* config.php) is forwarded when present so installations behind a corporate
	* proxy can still reach external code servers.
	*
	* @param object $server Remote server descriptor.
	*                       Expected shape: { url: string } — e.g.
	*                       { url: 'https://master.dedalo.dev/dedalo/core/api/v1/json/' }
	* @return object $response  Standard Dédalo response with ->result, ->msg, ->errors, ->code.
	*                           ->result is either false (not reachable) or the decoded
	*                           server-readiness object returned by the remote API.
	*/
	public static function check_remote_server( object $server ) : object {

		$server_url = $server->url ?? null;

		if (empty($server_url)) {
			$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Missing server URL';
			$response->errors	= ['Missing server URL'];
			$response->code		= 0;
			return $response;
		}

		// rqo
		// Build a request query object for dd_utils_api::get_server_ready_status,
		// which validates that the remote host is a functioning Dédalo code server.
			$rqo = new stdClass();
				$rqo->dd_api	= 'dd_utils_api';
				$rqo->action	= 'get_server_ready_status';
				$rqo->options	= new stdClass();
					$rqo->options->check = 'code_server';
					$rqo->options->url = $server_url;

			$rqo_string = 'rqo=' . json_encode($rqo);

		// curl_request
		// Short timeout (5 s) is intentional: this is a liveness check called for
		// every configured server on every widget page load; we don't want a single
		// unreachable server to stall the entire maintenance panel.
			$response = curl_request((object)[
				'url'				=> $server_url,
				'post'				=> true,
				'postfields'		=> $rqo_string,
				'returntransfer'	=> 1,
				'followlocation'	=> true,
				'header'			=> false,
				'ssl_verifypeer'	=> false,
				'timeout'			=> 5, // seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);

			// Decode the JSON string that curl_request returns inside ->result so the
			// caller receives a structured object rather than a raw string.
			if (!empty($response->result) && is_string($response->result)) {
				$decoded = json_decode($response->result);
				if (json_last_error() === JSON_ERROR_NONE) {
					$response->result = $decoded;
				}
			}

		return $response;
	}//end check_remote_server



	/**
	* GET_VALUE
	* Returns the current live status payload for the "Update code" dashboard widget.
	*
	* Called by the area_maintenance infrastructure through the `get_widget_value`
	* hard-coded route (NOT via API_ACTIONS), so the widget panel can refresh its
	* server readiness list without a full page reload.
	*
	* Reads the CODE_SERVERS constant (an array of server descriptor arrays defined
	* in config.php), probes each one via check_remote_server(), and augments every
	* descriptor with the liveness result before returning the collection.
	*
	* The returned ->result object also carries:
	*  - dedalo_source_version_local_dir: local filesystem path where downloaded ZIP
	*    archives are staged (DEDALO_SOURCE_VERSION_LOCAL_DIR constant).
	*  - is_a_code_server: whether THIS installation acts as a distribution server
	*    (IS_A_CODE_SERVER constant); when true the widget shows the "build ZIP" panel.
	*
	* @return object $response  ->result: { servers: array, dedalo_source_version_local_dir: string|null, is_a_code_server: bool }
	*                           ->result is false on configuration error (missing CODE_SERVERS).
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// servers
		// CODE_SERVERS is a plain PHP array of associative arrays defined in config.php.
		// Each entry typically has at least: [ 'url' => 'https://...', 'label' => '...' ]
			$servers = (defined('CODE_SERVERS'))
				? CODE_SERVERS
				: null;
			if(empty($servers)) {
				debug_log(__METHOD__
					." Undefined CODE_SERVERS constant in config.php"
					, logger::ERROR
				);
				$response->errors[] = 'Undefined CODE_SERVERS constant in config.php';
				return $response;
			}

		// check code servers
		// Cast each server array to stdClass to allow property access and attach the
		// liveness check result directly onto the descriptor before returning it.
			$code_servers = [];
			foreach ($servers as $current_server) {

				$server = (object)$current_server;

				// check server status
				$server_ready = update_code::check_remote_server( $server );

				// add server object additional info
				$server->msg			= $server_ready->msg ?? null;
				$server->errors			= $server_ready->errors ?? [];
				$server->response_code	= $server_ready->code ?? 0;
				$server->result			= $server_ready->result ?? false;
				$server->code			= $server->code ?? null;

				$code_servers[] = $server;
			}

		$result = (object)[
			'servers'							=> $code_servers,
			'dedalo_source_version_local_dir'	=> defined('DEDALO_SOURCE_VERSION_LOCAL_DIR') ? DEDALO_SOURCE_VERSION_LOCAL_DIR : null,
			'is_a_code_server'					=> defined('IS_A_CODE_SERVER') ? IS_A_CODE_SERVER : false,
		];

		// set response
			$response->result	= $result;
			$response->msg		= 'OK. Request done successfully';

		return $response;
	}//end get_value



	/**
	* UPDATE_CODE
	* Full code-update pipeline: download → extract → install → clean up → rebuild caches.
	*
	* This is the primary API entry point for installing a new Dédalo release. The
	* sequence is:
	*  1. Run pre-update migration scripts via update::pre_update_version() so that any
	*     required data transformations happen before the new PHP files land.
	*     (!) The remaining steps below are currently unreachable because
	*         update::pre_update_version() returns early at the top of the try block.
	*         The comment "@TODO: move at the end of the update process" marks this
	*         provisional placement. The steps below document the intended full pipeline.
	*  2. Download the release ZIP from $options->file->url using cURL (300 s timeout).
	*  3. Save the ZIP to DEDALO_SOURCE_VERSION_LOCAL_DIR/dedalo_code.zip.
	*  4. Extract the ZIP; the archive root is always 'dedalo_code/' (set by build_version_code).
	*  5. Delegate the file-installation step to either update_clean() or update_incremental()
	*     depending on $options->update_mode.
	*  6. Remove the staging ZIP and extracted directory.
	*  7. Rebuild JS language files for all DEDALO_APPLICATION_LANGS.
	*  8. Reset opcode cache and run garbage collection.
	*  9. Log the installation to the activity log.
	*
	* @param object $options  Update configuration.
	*                         ->file        object  — must have a ->url string pointing to the
	*                                                 release ZIP on the code server.
	*                         ->update_mode string  — 'clean' (full directory swap with backup)
	*                                                 or 'incremental' (rsync overlay); defaults
	*                                                 to 'incremental'.
	*                         ->info        mixed   — extra data forwarded to the chosen install
	*                                                 method (e.g. tool_names list for clean mode).
	* @return object $response  Standard Dédalo response.
	*                           ->result is false on any failure, or a stdClass with per-step
	*                           diagnostic arrays (download_file, write_file, extract, remove_dir,
	*                           remove_file) on success.
	*/
	public static function update_code(object $options) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__.' ';
			$response->errors	= [];

		// options
			$file			= $options->file ?? null;
			$update_mode	= $options->update_mode ?? 'incremental';
			$info			= $options->info ?? null;

		try {

			// Provisional position, @TODO: move at the end of the update process
			// Run pre-update scripts (defined in updates.php) for this code version.
			// (!) This early return means all code below inside the try block is
			// currently unreachable. The full pipeline is preserved and documented
			// for when this placeholder is relocated to its intended final position.
			$update_response = update::pre_update_version();
			return $update_response;

			$file_uri = $file->url ?? null;
			if( empty($file_uri) ){
				debug_log(__METHOD__
					. " Error: Update code can not work without a valid url " . PHP_EOL
					. to_string()
					, logger::WARNING
				);
				$response->errors[]	= 'Empty file URI';
				return $response;
			}

			// debug
				debug_log(__METHOD__
					." Start downloading file ".$file_uri
					, logger::DEBUG
				);

			// CLI msg
				if ( running_in_cli()===true ) {
					print_cli((object)[
						'msg'		=> 'Start downloading file: ' . $file_uri ,
						'memory'	=> dd_memory_usage()
					]);
				}

			// Download zip file from server (master) curl mode (unified with download_remote_structure_file)
			// A 300-second timeout accommodates large release archives over slow links.
			// The POST body carries a null data payload, matching the code-server endpoint
			// contract (the URL itself identifies the file; no additional payload is needed).
				// data
				$data_string = 'data=' . json_encode(null);
				// curl_request
				$curl_response = curl_request((object)[
					'url'				=> $file_uri,
					'post'				=> true,
					'postfields'		=> $data_string,
					'returntransfer'	=> 1,
					'followlocation'	=> true,
					'header'			=> false, // bool add header to result
					'ssl_verifypeer'	=> false,
					'timeout'			=> 300, // int seconds
					'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
						? SERVER_PROXY // from Dédalo config file
						: false // default case
				]);
				$contents = $curl_response->result;
				if (!empty($curl_response->errors)) {
					$response->errors = array_merge($response->errors, $curl_response->errors);
				}
				// check contents
				if ($contents===false) {
					$response->msg .= 'Contents from Dédalo code repository fail to download from: '.$file_uri;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to download the file';
					return $response;
				}

				// result
				// $result accumulates per-step diagnostic arrays returned to the caller.
				$result = new stdClass();
					$result->download_file = [
						'Downloaded file: ' . $file_uri,
						'Time: ' . exec_time_unit($start_time,'sec') . ' secs'
					];

				// debug
				debug_log(__METHOD__
					." Downloaded file (".$file_uri.") in ".exec_time_unit($start_time,'sec') . ' secs'
					, logger::DEBUG
				);

			// Save contents to local dir
			// DEDALO_SOURCE_VERSION_LOCAL_DIR is the staging area for downloaded archives
			// (defined in config.php). It must be writable by the web-server process.
				if ( !create_directory(DEDALO_SOURCE_VERSION_LOCAL_DIR) ) {
					$response->msg .= 'Unable to create dir: '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable create or access local directory ' .DEDALO_SOURCE_VERSION_LOCAL_DIR;
					return $response;
				}

				$file_name		= 'dedalo_code.zip';
				$target_file	= DEDALO_SOURCE_VERSION_LOCAL_DIR . '/' . $file_name;
				$put_contents	= file_put_contents($target_file, $contents);
				if (!$put_contents) {
					$response->msg .= 'Contents from Dédalo code repository fail to write on : '.$target_file;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to put contents into file ' .$target_file;
					return $response;
				}
				$result->write_file = [
					"Written file: ". $target_file,
					"File size: "	. format_size_units( filesize($target_file) )
				];

			// extract files from zip. (!) Note that 'ZipArchive' needs to be installed in PHP to allow work
			// The ZipArchive PHP extension must be enabled on the server. If open() returns
			// anything other than true the archive is corrupt or the path is wrong.
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Extracting zip file',
							'memory'	=> dd_memory_usage()
						]);
					}
				$zip = new ZipArchive;
				$res = $zip->open($target_file);
				if ($res!==true) {
					$response->msg .= 'ERROR ON ZIP file extraction to '.DEDALO_SOURCE_VERSION_LOCAL_DIR;
					debug_log(__METHOD__
						." $response->msg"
						, logger::ERROR
					);
					$response->errors[]	= 'Unable to open ZIP file ' .$target_file;
					return $response;
				}
				$zip->extractTo(DEDALO_SOURCE_VERSION_LOCAL_DIR);
				$zip->close();
				$result->extract = [
					"Extracted ZIP file to: " . DEDALO_SOURCE_VERSION_LOCAL_DIR
				];
				debug_log(__METHOD__
					." ZIP file extracted successfully to ".DEDALO_SOURCE_VERSION_LOCAL_DIR
					, logger::DEBUG
				);

			// Install the new code
			// The ZIP archive is built by build_version_code() using --prefix=dedalo_code/,
			// so extraction always produces a 'dedalo_code' subdirectory inside the staging
			// area. That subdirectory is used as the rsync/cp source.
			// resulting file is: 6.4.0_dedalo.zip (server) => dedalo_code.zip (downloaded) => /dedalo_code (unzipped)
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Updating files',
							'memory'	=> dd_memory_usage()
						]);
					}
				// source: unzip directory name. Note that this folder was zip using `build_version_code` method
				// resulting file is: 6.4.0_dedalo.zip (server) => dedalo_code.zip (downloaded) => /dedalo_code (unzipped)
				$source		= DEDALO_SOURCE_VERSION_LOCAL_DIR .'/'. 'dedalo_code';
				$target		= DEDALO_ROOT_PATH;

				// update execution
				$update_options = new stdClass();
					$update_options->source	= $source;
					$update_options->target	= $target;
					$update_options->info	= $info;

				switch ($update_mode) {
					case 'clean':
						$update_response = update_code::update_clean( $update_options );
						break;

					case 'incremental':
					default:
						$update_response = update_code::update_incremental( $update_options );
						break;
				}

				$response->errors	= array_merge($response->errors, $update_response->errors);
				$response->msg		.= ' '.$update_response->msg;

				if( $update_response->result === false){
					return $response;
				}

			// remove temp used files and folders
				// SEC-042 defence-in-depth: $source / $target_file are built from
				// `DEDALO_SOURCE_VERSION_LOCAL_DIR` (server constant) plus literals;
				// shell-quote anyway so future callers cannot regress.
				$command_rm_dir		= 'rm -R -f '.escapeshellarg($source);
				$output_rm_dir		= shell_exec($command_rm_dir);
				$result->remove_dir	= [
					"command_rm_dir: " . $command_rm_dir,
					"output_rm_dir: "  . $output_rm_dir
				];
				$command_rm_file 	= 'rm '.escapeshellarg($target_file);
				$output_rm_file		= shell_exec($command_rm_file);
				$result->remove_file= [
					"command_rm_file: " . $command_rm_file,
					"output_rm_file: "  . $output_rm_file
				];
				debug_log(__METHOD__
					." Removed temp used files and folders"
					, logger::DEBUG
				);

			// update JAVASCRIPT labels
			// After a code swap the bundled JS label files may be stale. Regenerate
			// them for every configured application language so the UI remains correct.
				// CLI msg
					if ( running_in_cli()===true ) {
						print_cli((object)[
							'msg'		=> 'Updating js lang files',
							'memory'	=> dd_memory_usage()
						]);
					}
				$ar_langs = DEDALO_APPLICATION_LANGS;
				foreach ($ar_langs as $lang => $label) {
					backup::write_lang_file($lang);
				}

			// version info. Get from new downloaded file 'version.inc'
			// DEDALO_VERSION and DEDALO_BUILD are constants loaded from the newly
			// installed version.inc, so they reflect the installed release after the swap.
				$new_version_info = DEDALO_VERSION . ' Build ' . DEDALO_BUILD;

			// debug
				debug_log(__METHOD__
					.' Updated Dédalo code successfully. ' . $new_version_info
					, logger::DEBUG
				);

			// pause and force garbage collector (prevent cached files generating errors)
			// A brief sleep followed by opcache_reset() and gc_collect_cycles() gives PHP-FPM
			// workers time to notice the new files before they serve the next request. Without
			// this, stale opcode-cache entries can cause fatal errors on the first request
			// after the swap.
				sleep(1);
				opcache_reset();
				gc_collect_cycles();
				sleep(1);

			// Run pre-update scripts (defined in updates.php) for this code version.
				// $update_response = update::pre_update_version();
				// if ($update_response->result === false) {
				// 	$response->errors = array_merge($response->errors, $update_response->errors);
				// 	$response->msg .= ' pre_update_version failed. ';
				// }

			// logger activity : WHAT(action normalized like 'LOAD EDIT'), LOG LEVEL(default 'logger::INFO'), TIPO(like 'dd120'), Data(array of related info)
				logger::$obj['activity']->log_message(
					'SAVE',
					logger::INFO,
					DEDALO_ROOT_TIPO,
					NULL,
					[
						'msg' => 'Updated code to v. ' . $new_version_info
					],
					logged_user_id() // int
				);

		} catch (Exception $e) {

			$response->msg = $e->getMessage();
			$response->errors[]	= 'exception updating files';
			debug_log(__METHOD__
				. ' Exception updating files ' . PHP_EOL
				. 'exception: ' . $e->getMessage()
				, logger::ERROR
			);
		}

		$response->result	= $result ?? false;
		$response->msg		= !empty($response->errors)
			? 'Warning! Updated Dédalo code with errors'
			: 'OK. Updated Dédalo code successfully';


		return $response;
	}//end update_code



	/**
	* UPDATE_INCREMENTAL
	* Overlays the new code onto the existing installation using rsync, preserving
	* config and media directories.
	*
	* This is the default update strategy ('incremental'). It uses `rsync -avui` to
	* copy only changed files from the extracted release directory ($source) into the
	* live Dédalo root ($target), excluding:
	*  - Any path matching the pattern [star]/config[star] (all config.php variants)
	*  - The 'media' directory (uploaded media files)
	*
	* The approach is safe for running installations because unmodified files are
	* skipped and a full directory backup is not required. The trade-off is that
	* deleted files in the release are NOT removed from the target — old files can
	* accumulate over many incremental updates.
	*
	* rsync flags used:
	*  -a  archive mode (preserve permissions, timestamps, symlinks)
	*  -v  verbose
	*  -u  skip files newer on target (prevents overwriting locally edited files)
	*  -i  itemize changes (useful for log inspection)
	*  --no-owner --no-group --no-perms  avoid chown failures in restricted environments
	*
	* (!) rsync must be installed on the server. The method is not remotely callable
	* via API_ACTIONS; it is invoked only by update_code() after validation.
	*
	* @param object $options  ->source string — path to extracted 'dedalo_code' directory.
	*                         ->target string — path to the live DEDALO_ROOT_PATH.
	* @return object $response  Standard Dédalo response; ->result true on success.
	*/
	public static function update_incremental( object $options ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__.' ';
				$response->errors	= [];

		// options
			$source	= $options->source ?? null;
			$target	= $options->target ?? null;

			if (empty($source) || empty($target)) {
				$response->msg .= 'Error. Source or target undefined';
				$response->errors[] = 'Source or target undefined';
				return $response;
			}

		// exec sync files using RSYNC
		// Trailing slash on $source makes rsync copy the directory contents (not the
		// directory itself) into $target — standard rsync idiom.
		// $additional is retained as an empty string placeholder; the commented-out
		// --dry-run value shows the intended preview mode that was never wired to a flag.
			$exclude	= ' --exclude="*/config*" --exclude="media" ';
			$additional = ''; // $is_preview===true ? ' --dry-run ' : '';
			$command	= 'rsync -avui --no-owner --no-group --no-perms --progress '. $exclude . $additional . escapeshellarg($source.'/').' ' . escapeshellarg($target.'/');

			exec($command, $output, $result_code);

			if ($result_code !== 0) {
				$response->msg .= 'Error executing RSYNC command. source: '.$source;

				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR

				);
				$response->errors[]	= 'Unable run RSYNC command';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				.' RSYNC execution done '. PHP_EOL
				.' command: ' . $command . PHP_EOL
				.' output: ' . to_string($output)
				, logger::WARNING
			);

		// response
			$response->result	= true;
			$response->msg		= !empty($response->errors)
				? 'Warning! Updated Dédalo code with errors'
				: 'OK. Updated Dédalo code successfully';


		return $response;
	}//end update_incremental



	/**
	* UPDATE_CLEAN
	* Performs a full directory-swap upgrade: backs up the running installation,
	* installs the fresh release tree, then migrates config, media, local, and
	* third-party tools from the backup into the new tree.
	*
	* Step-by-step sequence:
	*  1. Copy the extracted release directory to a parallel path (<target>_code) so
	*     it can be prepared before the old code is removed from the web root.
	*  2. Copy a fixed list of config files from the current live tree into <target>_code,
	*     preserving instance-specific settings (database connection, API keys, etc.).
	*     Files that do not exist on the current install are silently skipped.
	*  3. Copy any third-party tool directories (those NOT listed in $options->info->tool_names,
	*     or the hard-coded fallback list) from the current tools/ dir into <target>_code/tools/.
	*  4. Move the current live directory to DEDALO_BACKUP_PATH/code/dedalo_<version>_<timestamp>.
	*  5. Move the 'media' directory from the backup to <target>_code/media.
	*  6. Move the 'local' directory from the backup to <target>_code/local.
	*  7. Rename <target>_code to <target> (the new live installation).
	*  8. Set recursive permissions 750 on the new live tree.
	*
	* (!) This method replaces the running code tree atomically. If any step fails
	* between step 4 (old dir moved) and step 7 (rename), the installation is left
	* in a broken state and manual recovery is required. This is the most disruptive
	* update mode and should be reserved for major version upgrades.
	*
	* (!) This method is NOT listed in API_ACTIONS and must only be called from
	* update_code() after all validation has passed.
	*
	* @param object $options  ->source string   — path to extracted 'dedalo_code' directory.
	*                         ->target string   — path to the live DEDALO_ROOT_PATH (will be replaced).
	*                         ->info   mixed    — optional; ->tool_names array overrides the default
	*                                             list of official tools to skip during tool migration.
	* @return object $response  Standard Dédalo response; ->result true on full success.
	*/
	public static function update_clean( object $options ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed '.__METHOD__.' ';
				$response->errors	= [];

		// options
			$source	= $options->source ?? null;
			$target	= $options->target ?? null;
			$info	= $options->info ?? null;

			if (empty($source) || empty($target)) {
				$response->msg .= 'Error. Source or target undefined';
				$response->errors[] = 'Source or target undefined';
				return $response;
			}

			// Escaped shell arguments safely
			$esc_source      = escapeshellarg($source);
			$esc_target      = escapeshellarg($target);
			$esc_target_code = escapeshellarg($target . '_code');

		// upgrade files
		// copy downloaded folder to httpdocs like ../tmp/dedalo_code => ../httpdocs/dedalo_code
			$command = "cp -R {$esc_source} {$esc_target_code}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				$response->errors[]	= 'copy downloaded folder failed';
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// copy config files
			$files_to_copy = [
				'config/config.php',
				'config/config_db.php',
				'config/config_areas.php',
				'config/config_core.php',
				'config/config_defaults.json',
				'publication/server_api/v1/config_api/server_config_api.php',
				'publication/server_api/v1/config_api/server_config_headers.php'
			];
			foreach ($files_to_copy as $file_name) {

				if (!file_exists("{$target}/$file_name")) {
					debug_log(__METHOD__
						. " Ignored file  " . PHP_EOL
						. ' file_name: ' . to_string($file_name) . PHP_EOL
						. ' source: ' . "{$target}/$file_name"
						, logger::ERROR
					);
					continue;
				}

				if (!copy("{$target}/$file_name", "{$target}_code/{$file_name}")){
					$response->errors[]	= 'copy config files failed';
					$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error on copy file: '.$file_name;
					debug_log(__METHOD__
						. " copy file error " . PHP_EOL
						. " source " . "{$target}/$file_name" . PHP_EOL
						. " target " . "{$target}_code/{$file_name}"
						, logger::ERROR
					);
					return $response;
				}else{
					debug_log(__METHOD__
						. " copy file success " . PHP_EOL
						. " source " . "{$target}/$file_name" . PHP_EOL
						. " target " . "{$target}_code/{$file_name}"
						, logger::WARNING
					);
				}
			}

		// tools
		// Preserve non-official (third-party) tools from the current installation.
		// The official Dédalo tool list is either provided by the code server in
		// $options->info->tool_names (populated by get_code_update_info() via
		// tool_common::get_active_tool_names()) or falls back to the hard-coded
		// snapshot below. Any tool directory NOT in this list is considered third-party
		// and is copied verbatim into the new release tree.
			$dd_tools = $info->tool_names ?? [
				'tool_cataloging',
				'tool_dd_label',
				'tool_dev_template',
				'tool_diffusion',
				'tool_export',
				'tool_hierarchy',
				'tool_image_rotation',
				'tool_import_dedalo_csv',
				'tool_import_files',
				'tool_import_marc21',
				'tool_import_rdf',
				'tool_import_zotero',
				'tool_indexation',
				'tool_lang',
				'tool_lang_multi',
				'tool_media_versions',
				'tool_numisdata_epigraphy',
				'tool_numisdata_order_coins',
				'tool_pdf_extractor',
				'tool_posterframe',
				'tool_propagate_component_data',
				'tool_qr',
				'tool_subtitles',
				'tool_tc',
				'tool_time_machine',
				'tool_tr_print',
				'tool_transcription',
				'tool_update_cache',
				'tool_upload',
				'tool_user_admin'
			];

			$tools_src = "{$target}/tools";
			// dir() returns a Directory object or false if the path does not exist.
			// Using dir() instead of scandir() avoids loading all entries into memory
			// at once, which matters for large tool directories.
			$old_tools = dir($tools_src);
			if ($old_tools !== false) {
				while(($file = $old_tools->read()) !== false) {
					if($file === "." || $file === "..") continue;
					// Only copy directories (each tool lives in its own subdirectory)
					// that are NOT in the official list — those come from the release ZIP.
					if( is_dir($tools_src .'/'. $file) && !in_array($file, $dd_tools) ) {

						$esc_file_src = escapeshellarg("{$tools_src}/{$file}");
						$esc_file_dst = escapeshellarg("{$target}_code/tools/{$file}");

						$command = "cp -R {$esc_file_src} {$esc_file_dst}";
						$output = [];
						exec($command, $output, $result_code);
					if ($result_code!=0) {
						$response->errors[]	= 'copy tools files failed';
						$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
						debug_log(__METHOD__
							. $response->msg  . PHP_EOL
							. ' command: ' . to_string($command) . PHP_EOL
							. ' output: ' . to_string($output) . PHP_EOL
							. ' result_code: ' . to_string($result_code)
							, logger::ERROR
						);
						return $response;
					}
					debug_log(__METHOD__
						. " exec command" . PHP_EOL
						. " command " . to_string($command) . PHP_EOL
						. " output " . to_string($output) . PHP_EOL
						. " result_code type " . gettype($result_code) . PHP_EOL
						. " result_code " . to_string($result_code)
						, logger::WARNING
					);
				}
				}
				$old_tools->close();
			}

		// move directory old version to backups as '../httpdocs/dedalo' => '../backup/code/dedalo_6.3.1'
			$backup_code_path = DEDALO_BACKUP_PATH . '/code';
			create_directory($backup_code_path);
			$old_copy_final_path = "{$backup_code_path}/dedalo_" .DEDALO_VERSION . '_' . date('Y-m-d_His');
			$esc_old_copy_final_path = escapeshellarg($old_copy_final_path);

			$command = "mv {$esc_target} {$esc_old_copy_final_path}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->errors[]	= 'move old version to code backups failed';
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// move media directory from old to the new directory like '../backup/code/dedalo_6.3.1/media' => '../httpdocs/dedalo_code/media'
			$esc_media_src = escapeshellarg("{$old_copy_final_path}/media");
			$esc_media_dst = escapeshellarg("{$target}_code/media");
			$command = "mv {$esc_media_src} {$esc_media_dst}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->errors[]	= 'move media dir failed';
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// move local directory from old to the new directory like '../backup/code/dedalo_6.3.1/local' => '../httpdocs/dedalo_code/local'
			$esc_local_src = escapeshellarg("{$old_copy_final_path}/local");
			$esc_local_dst = escapeshellarg("{$target}_code/local");
			$command = "mv {$esc_local_src} {$esc_local_dst}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->errors[]	= 'move local dir failed';
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// rename new version directory to final dir such as 'dedalo_code' => 'dedalo'
			$command = "mv {$esc_target_code} {$esc_target}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->errors[]	= 'rename new version failed';
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
				return $response;
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// set permissions
			$command = "chmod -R 750 {$esc_target}";
			$output = [];
			exec($command, $output, $result_code);
			if ($result_code!=0) {
				$response->errors[]	= 'set permissions failed';
				$response->msg = 'Error. Request failed ['.__FUNCTION__.']. Error executing command: '.$command;
				debug_log(__METHOD__
					. $response->msg  . PHP_EOL
					. ' command: ' . to_string($command) . PHP_EOL
					. ' output: ' . to_string($output) . PHP_EOL
					. ' result_code: ' . to_string($result_code)
					, logger::ERROR
				);
			}
			debug_log(__METHOD__
				. " exec command" . PHP_EOL
				. " command " . to_string($command) . PHP_EOL
				. " output " . to_string($output) . PHP_EOL
				. " result_code type " . gettype($result_code) . PHP_EOL
				. " result_code " . to_string($result_code)
				, logger::WARNING
			);

		// response
			$response->result	= true;
			$response->msg		= !empty($response->errors)
				? 'Warning! Updated Dédalo code with errors'
				: 'OK. Updated Dédalo code successfully';


		return $response;
	}//end update_clean



	/**
	* BUILD_VERSION_FROM_GIT_MASTER
	* Creates a versioned ZIP archive from a Git branch and places it in the
	* code-distribution directory so client installations can download and apply it.
	*
	* This is the API-accessible entry point for the "build version" action available
	* on code-server installations (IS_A_CODE_SERVER === true). It:
	*  1. Closes the PHP session before the long-running shell command to avoid
	*     blocking the user's browser during the archive creation.
	*  2. Delegates the actual `git archive` call to the private build_version_code().
	*  3. Returns timing information in ->debug when SHOW_DEBUG is true.
	*
	* The $options->branch parameter controls which Git ref is archived:
	*  - 'master'    → the current stable release branch (default)
	*  - 'developer' → maps to 'v<major>_developer' and writes to the
	*                  development path instead of the versioned code path
	*  - any other string → passed directly to `git archive --remote`
	*
	* (!) This method shells out to `git archive`. Ensure DEDALO_CODE_SERVER_GIT_DIR
	* points to a valid local or remote git repository.
	*
	* @param object $options  ->branch string [= 'master'] — Git branch or ref to archive.
	* @return object $response  ->result true on success; ->debug (if SHOW_DEBUG) carries
	*                           ->exec_time as a human-readable duration string.
	*/
	public static function build_version_from_git_master( object $options ) : object {

		$start_time = start_time();

		// Write session to unlock session file
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// options
			$branch = $options->branch ?? 'master';

		// try exec
			try {

				$output = update_code::build_version_code( $branch );

				// Append msg

				if( $output!==true ) {
					$response->msg = ' Error, is not possible build version code shell_exec output: '. to_string($output);
					debug_log(__METHOD__
						.' ERROR: build_version_code output: '. to_string($output)
						, logger::ERROR
					);
					$response->errors[] = 'shell_exec execution failed';
					return $response;
				}

				$response->result = true;
				$response->msg = 'OK. The code version has been created successfully';

			} catch (Exception $e) {

				// Append msg
				$response->msg .= $e->getMessage();
				debug_log(__METHOD__
					." build_version_code output ERROR: $response->msg " . PHP_EOL
					. ' response: ' . to_string($response)
					, logger::ERROR
				);
				$response->errors[] = 'Exception occurred: '.$e->getMessage();
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit_auto($start_time);
				$response->debug = $debug;
			}


		return $response;
	}//end build_version_from_git_master



	/**
	* BUILD_VERSION_CODE
	* Low-level shell helper: runs `git archive` to create the release ZIP from a
	* given branch and writes it to the configured code-distribution directory.
	*
	* Private — must only be called from build_version_from_git_master(). Not listed
	* in API_ACTIONS.
	*
	* Archive naming convention:
	*  - Stable:     <major>.<minor>.<patch>_dedalo.zip  (e.g. 6.4.0_dedalo.zip)
	*                Written to: DEDALO_CODE_FILES_DIR/<major>/<major>.<minor>/
	*  - Developer:  dedalo_development.zip
	*                Written to: DEDALO_CODE_FILES_DIR/development/
	*
	* The ZIP prefix is always 'dedalo_code/' so that extracting it always produces
	* the predictable subdirectory name that update_code() expects.
	*
	* Remote vs local Git:
	*  - If DEDALO_CODE_SERVER_GIT_DIR starts with 'ssh://', `git archive --remote` is
	*    used (no local checkout required).
	*  - Otherwise a `cd <dir>; git archive` form is used for a local bare repository.
	*  @see https://git-scm.com/docs/git-archive
	*
	* @see update_code::build_version_from_git_master
	* @param string $branch  Git branch or ref to archive.
	* @return string|true  true on success; an error string (result_code + output) on failure.
	*/
	private static function build_version_code( string $branch ) : string|true {

		// version
			$version = get_dedalo_version();
			$major_version = $version[0];

		// version path
		// to create the path for the current version, it use major, and minor as
		// `/dedalo/code/6/6.4/
			$target_path = update_code::set_code_path();

		// build code target
		// (!) Note the variable name 'file_verion' is a typo for 'file_version' in
		// the original code. It is preserved here without modification.
			$file_verion	= update_code::get_file_version();
			$target			= $target_path .'/'.$file_verion.'.zip';

		// developer branch case
		// The logical branch name 'developer' maps to the Git branch 'v<major>_developer'
		// and the archive is written to the development path so the dashboard can offer a
		// nightly/edge-channel download separately from release ZIPs.
			if ($branch==='developer') {
				$development_path	= update_code::set_development_path();
				$target				= $development_path .'/dedalo_development.zip';
				$branch				= 'v'.$major_version.'_developer';
			}

		// source
			$source = DEDALO_CODE_SERVER_GIT_DIR;

			$esc_source = escapeshellarg($source);
			$esc_branch = escapeshellarg($branch);
			$esc_target = escapeshellarg($target);

		// command @see https://git-scm.com/docs/git-archive
		// Shell redirection (>) is used to write the ZIP because git-archive streams the
		// archive to stdout. This means the shell must interpret the full command string,
		// which is why exec() receives a compound command rather than an argument array.
		// All interpolated values are shell-quoted above to prevent injection.
			$command = strpos($source, 'ssh://')!==false
				? "git archive --remote={$esc_source} --verbose --format=zip --prefix=dedalo_code/ {$esc_branch} > {$esc_target}" // remote GIT
				: "cd {$esc_source}; git archive --verbose --format=zip --prefix=dedalo_code/ {$esc_branch} > {$esc_target}"; // local GIT

		// debug
			debug_log(__METHOD__
				. " Called Dédalo build_version_code with command: " .PHP_EOL
				. to_string($command)
				, logger::DEBUG
			);

		$output			= [];
		$result_code	= null;
		exec($command, $output, $result_code);

		$result = ( $result_code===0 )
			? true
			: 'Return:'.PHP_EOL.'result code: '. ($result_code ?? null). PHP_EOL . 'output: ' . json_encode($output, JSON_PRETTY_PRINT);


		return $result;
	}//end build_version_code



	/**
	* GET_CODE_PATH
	* Returns the filesystem path of the versioned code directory if it already
	* exists, or false if it does not.
	*
	* The path structure follows: DEDALO_CODE_FILES_DIR/<major>/<major>.<minor>/
	* For example, version [6, 4, 0] resolves to: /var/dedalo/code/6/6.4/
	*
	* Use set_code_path() instead when you need the path to be created on demand.
	*
	* Returns false when:
	*  - major or minor cannot be resolved from the version array
	*  - DEDALO_CODE_FILES_DIR is not defined
	*  - the resolved directory does not exist on disk
	*
	* @param array|null $version [= null]  Version triple [major, minor, patch].
	*                                      Defaults to the running Dédalo version via get_dedalo_version().
	* @return string|false  Absolute directory path, or false if the directory does not exist.
	*/
	public static function get_code_path( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$major          = $dedalo_version[0] ?? null;
		$minor          = $dedalo_version[1] ?? null;

		if ($major === null || $minor === null || !defined('DEDALO_CODE_FILES_DIR')) {
			return false;
		}

		$version_path	= $major . '.' . $minor;
		$base_path		= DEDALO_CODE_FILES_DIR."/{$major}/{$version_path}";
		$path			= is_dir( $base_path )===true
			? $base_path
			: false;

		return $path;
	}//end get_code_path



	/**
	* SET_CODE_PATH
	* Returns the filesystem path of the versioned code distribution directory,
	* creating it if it does not yet exist.
	*
	* Mirrors get_code_path() but calls create_directory() instead of is_dir(),
	* so it is suitable for use before writing a new archive file. Uses the
	* running Dédalo version (get_dedalo_version()) — no version argument is accepted
	* because this method is only called during the build process of the current release.
	*
	* Returns false when:
	*  - major or minor cannot be resolved
	*  - DEDALO_CODE_FILES_DIR is not defined
	*  - create_directory() fails (filesystem permission error)
	*
	* @return string|false  Absolute directory path, or false on failure.
	*/
	public static function set_code_path() : string|false {

		$dedalo_version	= get_dedalo_version();
		$major          = $dedalo_version[0] ?? null;
		$minor          = $dedalo_version[1] ?? null;

		if ($major === null || $minor === null || !defined('DEDALO_CODE_FILES_DIR')) {
			return false;
		}

		$version_path	= $major . '.' . $minor;
		$base_path		= DEDALO_CODE_FILES_DIR."/{$major}/{$version_path}";
		$path			= create_directory( $base_path )===false
			? false
			: $base_path;

		return $path;
	}//end set_code_path



	/**
	* GET_FILE_VERSION
	* Returns the base filename (without extension) for the versioned release ZIP.
	*
	* Joins the version triple with dots and appends '_dedalo', producing the
	* canonical file-naming convention used across the distribution system.
	* Example: version [6, 4, 0] → '6.4.0_dedalo' → archive file: '6.4.0_dedalo.zip'
	*
	* The stale doc-block copy about paths and directories was from a paste error in
	* the original source; this method returns a filename stem, not a path.
	*
	* @param array|null $version [= null]  Version triple [major, minor, patch].
	*                                      Defaults to the running Dédalo version via get_dedalo_version().
	* @return string  Filename stem, e.g. '6.4.0_dedalo'.
	*/
	public static function get_file_version( ?array $version = null ) : string {

		$dedalo_version	= $version ?? get_dedalo_version();
		$file_version	= implode('.', $dedalo_version).'_dedalo';

		return $file_version;
	}//end get_file_version



	/**
	* SET_DEVELOPMENT_PATH
	* Returns the filesystem path of the development/nightly code directory,
	* creating it if it does not yet exist.
	*
	* The development path is always DEDALO_CODE_FILES_DIR/development/ regardless
	* of the running version, because development archives overwrite a single fixed
	* file (dedalo_development.zip) rather than a per-version file.
	*
	* Returns false when:
	*  - DEDALO_CODE_FILES_DIR is not defined
	*  - create_directory() fails
	*
	* @return string|false  Absolute path to the development directory, or false on failure.
	*/
	public static function set_development_path() : string|false {

		if (!defined('DEDALO_CODE_FILES_DIR')) {
			return false;
		}

		$base_path	= DEDALO_CODE_FILES_DIR . '/development';
		$path		= create_directory( $base_path )===false
			? false
			: $base_path;

		return $path;
	}//end set_development_path



	/**
	* GET_CODE_URL
	* Returns the public HTTP(S) URL for the versioned code distribution directory,
	* or false if the corresponding filesystem directory does not exist.
	*
	* URL structure mirrors the path: DEDALO_CODE_FILES_URL/<major>/<major>.<minor>/
	* Example: version [6, 4, 0] → '/code/6/6.4' (relative to DEDALO_CODE_FILES_URL).
	*
	* The filesystem check (is_dir) ensures that a URL is only returned for
	* directories that actually contain distribution files; this prevents the client
	* update panel from offering a download link to a non-existent resource.
	*
	* Returns false when:
	*  - major or minor cannot be resolved
	*  - DEDALO_CODE_FILES_DIR or DEDALO_CODE_FILES_URL is not defined
	*  - the versioned directory does not exist on disk
	*
	* @param array|null $version [= null]  Version triple [major, minor, patch].
	*                                      Defaults to the running Dédalo version via get_dedalo_version().
	* @return string|false  URL string (relative path from host root), or false.
	*/
	public static function get_code_url( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$major          = $dedalo_version[0] ?? null;
		$minor          = $dedalo_version[1] ?? null;

		if ($major === null || $minor === null || !defined('DEDALO_CODE_FILES_DIR') || !defined('DEDALO_CODE_FILES_URL')) {
			return false;
		}

		$version_path	= $major .'.'. $minor;
		$base_path		= DEDALO_CODE_FILES_DIR . "/{$major}/{$version_path}";
		$url			= is_dir( $base_path )===true
			? DEDALO_CODE_FILES_URL . "/{$major}/{$version_path}"
			: false;

		return $url;
	}//end get_code_url



	/**
	* GET_CODE_UPDATE_INFO
	* Server-side endpoint called by client Dédalo installations to discover which
	* release ZIPs are available and safe to apply from their current version.
	*
	* This is the primary API used by the remote client's "Update code" widget to
	* populate its upgrade panel. It is called from get_code_update_info action on
	* the code server.
	*
	* Algorithm overview:
	*  1. Cast the client version triple to int so string comparison can't produce
	*     wrong ordering (e.g. "10" > "9" as strings but not always as ints).
	*  2. Walk all update descriptors from update::get_updates() to identify:
	*     - $next_version: the lowest reachable next-major or next-minor bump from
	*       the client version (used as a ceiling so the client doesn't skip rungs).
	*     - $next_version_update_from: the exact version the client must be on
	*       before it can install the next-major or next-minor release.
	*     - $upper_versions: all descriptor versions strictly greater than the
	*       client's current triple (candidates before further filtering).
	*  3. Filter $upper_versions:
	*     - Drop next-minor and next-patch entries above the identified $next_version
	*       ceiling (prevents leaping from 6.2.x directly to 6.5.0).
	*     - Drop the next-version entry itself if the client is not yet at the required
	*       update_from gateway version.
	*  4. For each surviving version, resolve the filesystem path and build a download
	*     URL using get_code_url() / get_code_path() / get_file_version(). Files that
	*     don't physically exist on disk are silently omitted.
	*  5. Append the development/nightly ZIP if present.
	*  6. Include server metadata (version, entity, tool list) in result->info so the
	*     client can correlate official vs third-party tools during a clean update.
	*
	* The linear upgrade enforcement means:
	*  - A client on 6.2.2 sees only patch ZIPs up to the latest 6.2.x.
	*  - A client on the last patch of 6.2.x sees 6.3.0 become available.
	*  - A client on the last minor of 6.x.y sees 7.0.0 become available.
	*
	* @param array $client_version  Version triple as integers or numeric strings,
	*                               e.g. [6, 4, 0] or ['6', '4', '0'].
	* @return object $response
	*   ->result: {
	*     info: {
	*       version: string,        // e.g. '6.4.1'
	*       date: string,           // ISO timestamp of this response
	*       entity_id: string|null,
	*       entity: string|null,
	*       entity_label: string|null,
	*       host: string|null,
	*       tool_names: array       // official tool directory names on this server
	*     },
	*     files: [{
	*       version: string,        // e.g. '6.4.1'
	*       url: string,            // full URL to the release ZIP
	*       date: string,           // file modification timestamp
	*       force_update_mode?: string  // e.g. 'clean' if the update descriptor mandates it
	*     }]
	*   }
	*/
	public static function get_code_update_info( array $client_version ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		$client_version[0] = (int)($client_version[0] ?? 0);
		$client_version[1] = (int)($client_version[1] ?? 0);
		$client_version[2] = (int)($client_version[2] ?? 0);

		// updates
		// reads 'update.php' file object
		// update::get_updates() includes updates.php and returns the $updates stdClass
		// whose property keys are integer version codes (e.g. 640 for v6.4.0).
			$updates_object = update::get_updates();

			$next_version				= null;
			$next_version_update_from	= null;
			$upper_versions				= [];
			foreach ( $updates_object as $update ) {
				// check the next valid major version
				// only next major version is take in consideration
				// as 7.0.0 but any other minor or path versions as 7.0.1 or 7.2.0
				// A major boundary is always x.0.0; any other patch (7.0.1, 7.1.0)
				// will be made visible only once the client reaches 7.0.0.
				if( $update->version_major===$client_version[0]+1 &&
					$update->version_medium===0 &&
					$update->version_minor===0){
						// set the next major as possible option
						$next_version = [
							$update->version_major,
							$update->version_medium,
							$update->version_minor,
						];
						// get the valid version from the major version can update itself.
						$next_version_update_from = [
							$update->update_from_major,
							$update->update_from_medium,
							$update->update_from_minor,
						];
						// reset any other major versions
						// when client is in version 6.4.0 is not possible update to version 8.0.0
						// only version 7.0.0 is available as a possible update.
						// Resetting $upper_versions here ensures that if a later loop iteration
						// finds a next-minor bump (which takes precedence), previously collected
						// major-boundary candidates are discarded.
						$upper_versions = [];
				}

				// check the next valid minor version
				// only next minor version is take in consideration
				// as 6.5.0 but any other path versions as 6.5.1 or 6.6.1
				// this check overwrite previous major check
				// A minor bump check always overwrites the major-bump result above because
				// the client must exhaust its current minor series before crossing a major boundary.
				if( $update->version_major===$client_version[0] &&
					$update->version_medium===$client_version[1]+1 &&
					$update->version_minor===0){
						// set it as next version
						$next_version = [
							$update->version_major,
							$update->version_medium,
							$update->version_minor,
						];
						// get the valid version from the minor version can update itself.
						$next_version_update_from = [
							$update->update_from_major,
							$update->update_from_medium,
							$update->update_from_minor,
						];
					// reset any other major or minor versions
					// when client is in version 6.2.9 is not possible update to version 7.0.0
					// only version 6.3.0 is available as a possible update.
					$upper_versions = [];
				}
				// check any other version bellow current client versions
				// remove they as possibles. Downgrade is not available in Dédalo updates
				// Go ahead!!!
				// Three-field numeric comparison: any descriptor strictly greater than the
				// client version on at least one field (while equal on all higher fields)
				// qualifies as a candidate. All three cases must be checked independently
				// because the triple is not flattened into a single comparable integer here.
				$add = false;
				// major
				if( (int)$update->version_major > (int)$client_version[0] ){
					$add = true;
				}
				// minor
				if( $add === false &&
					(int)$update->version_major >= (int)$client_version[0] &&
				    (int)$update->version_medium > (int)$client_version[1]
				){
					$add = true;
				}
				// path
				if( $add === false &&
					(int)$update->version_major >= (int)$client_version[0] &&
				   	(int)$update->version_medium >= (int)$client_version[1] &&
				  	(int)$update->version_minor > (int)$client_version[2]
				){
					$add = true;
				}
				// set if the version is greater than client version.
				if ($add===true) {

					$valid_version = [
						$update->version_major,
						$update->version_medium,
						$update->version_minor,
					];
					$update_versions = new stdClass();
						$update_versions->valid_version		= $valid_version;
						$update_versions->force_update_mode	= $update->force_update_mode ?? null;

					$upper_versions[] = $update_versions;
				}
			}

		// check the upper_versions to remove the non valid options
		// if the client is in the middle of the minor versions
		// it will need to update until last patch of his minor version:
		// client in 6.2.2
		// can update to 6.2.3, 6.2.4, 6.2.5, 6.2.7, 6.2.8 and 6.2.9
		// only when the client has the last path version can update to next minor:
		// client in 6.2.9
		// can update to 6.3.0
		// only when the client has the last minor version can update to next major:
		// client in 6.9.9
		// can update to 7.0.0
		$versions = [];
		foreach ($upper_versions as $version_obj) {

			$version			= $version_obj->valid_version;
			$force_update_mode	= $version_obj->force_update_mode;

			// remove the next minor versions that are greatest than next minor version.
			if( isset($next_version) && $version[0] === $next_version[0] &&
				$version[1] > $next_version[1]
			){
				continue;
			}
			// remove the next patch versions that are greatest than next patch version.
			if( isset($next_version) && $version[0] === $next_version[0] &&
				$version[1] === $next_version[1] &&
				$version[2] > 0
			){
				continue;
			}
			// check if the current version is the next version
			// if client has 6.2.9 the next version will be 6.3.0
			if( isset($next_version) && $version[0] === $next_version[0] &&
				$version[1] === $next_version[1] &&
				$version[2] === $next_version[2]
			){
				// check if the client has the valid version to update to next version
				// 6.2.9 vs 6.2.2 -> not valid
				// 6.2.9 vs 6.2.9 -> valid
				if( $next_version_update_from[0] !== $client_version[0] ||
					$next_version_update_from[1] !== $client_version[1] ||
					$next_version_update_from[2] !== $client_version[2]
				){
					// is not valid
					// the client has not the correct version to update to next minor or major version.
					continue;
				}
			}
			$valid_version = new stdClass();
				$valid_version->version				= $version;
				$valid_version->force_update_mode	= $force_update_mode;

			$versions[] = $valid_version;
		}

		// result
			$result = new stdClass();
				$result->info	= new stdClass();
				$result->files	= [];

		// Official tool names
		// master servers must provide their own active tools as official tools,
		// clients may have other tools provided by 3 parties.
		// the update code will check the names of the tools against the tools installed on the client.
		// to replace/upgrade only the official tools
			$tool_names = tool_common::get_active_tool_names();

		// info
			$date			= dd_date::get_now_as_iso_timestamp();
			$dedalo_version	= get_dedalo_version();
			$server_version	= implode( '.', $dedalo_version );

			$result->info->version		= $server_version;
			$result->info->date			= $date;
			$result->info->entity_id	= defined('DEDALO_ENTITY_ID') ? DEDALO_ENTITY_ID : null;
			$result->info->entity		= defined('DEDALO_ENTITY') ? DEDALO_ENTITY : null;
			$result->info->entity_label	= defined('DEDALO_ENTITY_LABEL') ? DEDALO_ENTITY_LABEL : null;
			$result->info->host			= defined('DEDALO_HOST') ? DEDALO_HOST : null;
			$result->info->tool_names	= $tool_names;

		// files
		// For each version that passed the upgrade-path filter, check whether the
		// corresponding ZIP file actually exists on this server's filesystem before
		// advertising it. Files built by build_version_code() land here; if a version
		// entry exists in updates.php but the ZIP was never built, it is silently omitted.
		// The client receives only entries it can actually download.
			$force_update_mode = null;
			$protocol          = defined('DEDALO_PROTOCOL') ? DEDALO_PROTOCOL : 'https://';
			$host              = defined('DEDALO_HOST') ? DEDALO_HOST : 'localhost';

			foreach ($versions as $valid_version_obj) {

				$valid_version		= $valid_version_obj->version;
				$force_update_mode	= $valid_version_obj->force_update_mode;

				$code_url = update_code::get_code_url( $valid_version );

				$current_version_path	= update_code::get_code_path( $valid_version );
				$file_version			= update_code::get_file_version( $valid_version );

				$file_name	= $file_version.'.zip';
				$file_path	= $current_version_path.'/'.$file_name;

				if(file_exists($file_path)){

					$file_date = date("Y-m-d H:i:s", filemtime($file_path));

					$file_item = new stdClass();
						$file_item->version	= implode('.', $valid_version);
						// Construct the full public URL: protocol + host + code URL path + filename.
						// The code_url returned by get_code_url() is a root-relative path (no host).
						$file_item->url		= $protocol . $host . $code_url .'/'. basename( $file_name );
						$file_item->date	= $file_date;

					// force_update_mode is optional; omit the property entirely when null so the
					// client can treat its absence as "no forced mode" without extra null checks.
					if( !empty($force_update_mode) ){
						$file_item->force_update_mode	= $force_update_mode;
					}

					$result->files[] = $file_item;
				}
			}

			// development version file
			// Appended after release ZIPs so the client always sees stable versions first.
			// The development file is always named 'dedalo_development.zip' at a fixed path;
			// it does not go through the version-gate logic above.
				$development_path	= update_code::set_development_path();
				if ($development_path !== false) {
					$development_file	= $development_path .'/dedalo_development.zip';
					if (file_exists($development_file)) {

						$code_url	= defined('DEDALO_CODE_FILES_URL') ? DEDALO_CODE_FILES_URL . '/development' : '';
						$file_date	= date("Y-m-d H:i:s", filemtime($development_file));

						$file_item = new stdClass();
							$file_item->version	= 'development';
							$file_item->url		= $protocol . $host . $code_url .'/'. basename( $development_file );
							$file_item->date	= $file_date;

						if( !empty($force_update_mode) ){
							$file_item->force_update_mode	= $force_update_mode;
						}

						$result->files[] = $file_item;
					}
				}

		// response
			$response->result	= $result;
			$response->msg		= !empty($response->errors)
				? 'Warning! Request done with errors'
				: 'OK. Request done successfully';


		return $response;
	}//end get_code_update_info



}//end update_code
