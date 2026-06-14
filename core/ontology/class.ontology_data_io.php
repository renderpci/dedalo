<?php declare(strict_types=1);
/**
* ONTOLOGY_DATA_IO
* Manages export and import of shared ontology data between Dédalo installations.
*
* This class is the I/O gateway for Dédalo's shared ontology synchronisation
* workflow.  It handles two transport layers:
*
*   1. PostgreSQL COPY export — dumps one ontology TLD's rows from 'matrix_ontology'
*      (or the 'matrix_dd' private-lists table) into a gzip-compressed COPY file via
*      the `psql ... TO PROGRAM 'gzip ...'` mechanism (shell_exec + psql daemon).
*
*   2. Remote download — fetches a compressed COPY file from a master server via
*      cURL and writes it to the local versioned IO directory, ready for import.
*
*   3. COPY import — delegates to backup::import_from_copy_file(), which truncates
*      the relevant section_tipo rows and COPY-loads the downloaded file.
*
* The versioned IO directory is structured as:
*   ONTOLOGY_DATA_IO_DIR/<major>.<minor>/
*   e.g. /var/www/dedalo/install/import/ontology/7.0/
* Constants ONTOLOGY_DATA_IO_DIR and ONTOLOGY_DATA_IO_URL are defined in
* config.php (mounted at DEDALO_INSTALL_PATH/import/ontology and its URL
* equivalent DEDALO_INSTALL_URL/import/ontology).
*
* Scope — shared ontologies only:
*   Only ontology TLDs marked as "shared" (managed by a central master installation)
*   are processed here.  Local ontologies are managed independently by each
*   installation and are not exported/imported through this class.
*
* Key relationships:
*   - ontology::map_tld_to_target_section_tipo()  maps TLD → section_tipo (e.g. 'dd' → 'dd0')
*   - backup::import_from_copy_file()             performs the actual DB load
*   - counter::consolidate_counter()              re-syncs the ID sequence after import
*   - dd_ontology_db_manager                      queries the flat 'dd_ontology' table
*   - agent_view_builder::section_label_map()     drives the LLM map field list
*   - tool_ontology_parser                        calls export_llm_map() as part of full
*                                                 ontology regeneration
*   - dd_utils_api::get_ontology_update_info()    exposes get_ontology_update_info() to the
*                                                 client API
*
* @package Dédalo
* @subpackage Core
*/
class ontology_data_io {



	/**
	* DD_TABLES
	* PostgreSQL tables that belong to the Dédalo-internal ('dd') ontology
	* private-lists domain.
	*
	* Used by callers that need to enumerate the full set of 'dd'-namespace tables
	* to back up or restore.  The three tables are:
	*   - 'matrix_dd'         — component/section data rows for the dd TLD
	*   - 'matrix_counter_dd' — auto-increment sequence tracking for dd records
	*   - 'matrix_layout_dd'  — layout/display configuration rows for the dd TLD
	*
	* Note: only 'matrix_dd' is exported by export_private_lists_to_file(); the
	* counter and layout tables are listed here for documentation/tooling purposes.
	* @var array $dd_tables
	*/
	public static array $dd_tables = ['matrix_dd','matrix_counter_dd','matrix_layout_dd'];



	/**
	* EXPORT_ONTOLOGY_INFO
	* Reads the ontology properties record (tipo 'ontology18', section_id 1 in dd0)
	* and writes its value to an 'ontology.json' file in the versioned IO directory.
	*
	* 'ontology18' is the component that stores high-level metadata about this
	* installation's ontology state — version string, entity info, active TLDs,
	* and last-updated timestamp.  This metadata file is served to client
	* installations by get_ontology_update_info() so they can decide whether a
	* sync is needed.
	*
	* The file is always written to:
	*   ONTOLOGY_DATA_IO_DIR/<major>.<minor>/ontology.json
	*
	* Typical call site: tool_ontology_parser::export_ontologies() and
	* update_ontology_info() (which must run first to populate the component value).
	*
	* @return object $response
	*   - result   bool   true on success
	*   - msg      string human-readable status
	*   - errors   array  non-empty on failure
	*   - data     mixed  (debug) the raw value written
	*   - path_file string (debug) absolute path of the written file
	*   - saved    int|false (debug) bytes written, or false on failure
	* @test true
	*/
	public static function export_ontology_info() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// properties component (dd1)
		// ontology18 is the component holding high-level ontology metadata
		// (version, entity, active TLDs, date) for dd0 section_id 1.
		// DEDALO_DATA_NOLAN is used because this metadata is language-independent.
			$section_tipo			= 'dd0';
			$section_id				= '1';
			$tipo					= 'ontology18';
			$model					= ontology_node::get_model_by_tipo( $tipo );
			$properties_component	= component_common::get_instance(
				$model, // string model
				$tipo, // string tipo
				$section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$section_tipo // string section_tipo
			);

			$properties_data	= $properties_component->get_data();
			// get_data() returns an array of dato objects; the first element's
			// 'value' holds the structured metadata stdClass.
			$data				= $properties_data[0]->value ?? null;
			$data_string		= json_encode($data, JSON_PRETTY_PRINT|JSON_UNESCAPED_UNICODE|JSON_UNESCAPED_SLASHES);

		// path to save the file
			$ontology_io_path = ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$path_file = "{$ontology_io_path}/ontology.json";

		// set data into ontology file
			$saved = file_put_contents( $path_file, $data_string );
			if($saved === false){
				$response->msg		= 'Error. Impossible to save data in ontology.json file';
				$response->errors[]	= 'Impossible to save data in ontology.json file';
				return $response;
			}

		$response->result	= true;
		$response->msg		= 'OK. Request done';

		// debug
		$response->data			= $data;
		$response->path_file	= $path_file;
		$response->saved		= $saved;


		return $response;
	}//end export_ontology_info



	/**
	* SET_ONTOLOGY_IO_PATH
	* Resolves the versioned IO directory for this installation and creates it
	* if it does not already exist.
	*
	* The path follows the pattern:
	*   ONTOLOGY_DATA_IO_DIR/<major>.<minor>
	*   e.g. /var/www/dedalo/install/import/ontology/7.0
	*
	* Only major and minor components of get_dedalo_version() are used; patch
	* level is intentionally omitted so all patch releases of the same minor
	* share the same IO directory.
	*
	* Use this method before writing any export file.  Use get_ontology_io_path()
	* (read-only, no directory creation) when only reading is needed.
	*
	* @return string|false $io_path  Absolute directory path on success, false if
	*                                create_directory() failed (e.g. permissions).
	* @test true
	*/
	public static function set_ontology_io_path() : string|false {

		$dedalo_version	= get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_path		= create_directory( $base_path )===false
			? false
			: $base_path;

		return $io_path;
	}//end set_ontology_io_path



	/**
	* GET_ONTOLOGY_IO_PATH
	* Returns the versioned IO directory path for the given (or current) version,
	* without creating it.
	*
	* If $version is null the running installation's own version is used
	* (get_dedalo_version()).  Pass an explicit $version array when checking
	* whether a remote installation's version directory exists locally — e.g.
	* the version array parsed from an incoming API request.
	*
	* Only major and minor components ($version[0] and $version[1]) are used;
	* patch level is intentionally ignored.
	*
	* @param array|null $version [= null]  Two- or three-element version array
	*                                      [major, minor, patch?].  Null → current.
	* @return string|false $io_path  Absolute path when the directory exists,
	*                                false when it does not.
	* @test true
	*/
	public static function get_ontology_io_path( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_path		= is_dir( $base_path )===true
			? $base_path
			: false;

		return $io_path;
	}//end get_ontology_io_path



	/**
	* GET_ONTOLOGY_IO_URL
	* Returns the public HTTP URL for the versioned IO directory.
	*
	* Mirrors get_ontology_io_path() but returns an HTTP URL built from
	* ONTOLOGY_DATA_IO_URL instead of a filesystem path.  The directory is
	* verified to exist on disk before the URL is returned; if the directory
	* is absent false is returned so callers do not publish a broken URL.
	*
	* Used by get_ontology_update_info() to build the 'url' fields in the
	* returned file list so client installations can download each COPY file.
	*
	* Note: the end-of-function label reads 'get_ontology_io_URl' (capital R, l)
	* — that is a pre-existing typo in the original code; it has been left as-is
	* to avoid a code change.
	*
	* @param array|null $version [= null]  Two- or three-element version array
	*                                      [major, minor, patch?].  Null → current.
	* @return string|false $io_url  Full HTTP URL string when the directory exists,
	*                               false when it does not.
	* @test true
	*/
	public static function get_ontology_io_url( ?array $version = null ) : string|false {

		$dedalo_version	= $version ?? get_dedalo_version();
		$version_path	= $dedalo_version[0].'.'.$dedalo_version[1];
		$base_path		= ONTOLOGY_DATA_IO_DIR."/{$version_path}";
		$io_url			= is_dir( $base_path )===true
			? ONTOLOGY_DATA_IO_URL."/{$version_path}"
			: false;

		return $io_url;
	}//end get_ontology_io_URl



	/**
	* UPDATE_ONTOLOGY_INFO
	* Rebuilds and persists the ontology metadata record (tipo 'ontology18',
	* section_id 1, section_tipo dd0) with the current installation's state.
	*
	* This record is the canonical descriptor for what ontology this installation
	* manages and serves.  It must be called before export_ontology_info() so
	* that 'ontology.json' reflects up-to-date information.
	*
	* The value written to the component contains:
	*   - version           — running Dédalo version string (e.g. '7.0.1')
	*   - date              — ISO timestamp of this update (dd_date::get_now_as_iso_timestamp)
	*   - entity_id         — DEDALO_ENTITY_ID constant (this installation's entity ID)
	*   - entity            — DEDALO_ENTITY constant (machine name)
	*   - entity_label      — DEDALO_ENTITY_LABEL constant (human-readable name)
	*   - host              — DEDALO_HOST constant (public hostname)
	*   - active_ontologies — array of objects describing each active TLD
	*                         (tld, name, name_data, typology_id, typology_name)
	*
	* The existing dato array is iterated because the component may already hold
	* one or more dato rows; all are overwritten with the same value to keep
	* them consistent.  In practice there is normally exactly one dato row.
	*
	* @return bool  Always returns true (errors from save() are not surfaced here).
	* @test true
	*/
	public static function update_ontology_info() : bool {

		$section_tipo	= 'dd0';
		$section_id		= '1';
		$tipo 			= 'ontology18';

		$model = ontology_node::get_model_by_tipo( $tipo );
		$properties_component = component_common::get_instance(
			$model, // string model
			$tipo, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo // string section_tipo
		);

		// fallback to a single empty stdClass dato when the component has no
		// existing data, so the foreach below runs at least once.
		$data = $properties_component->get_data() ?? [ new stdClass() ];

		$date			= dd_date::get_now_as_iso_timestamp();
		$dedalo_version	= get_dedalo_version();
		$version		= implode( '.', $dedalo_version );

		// hierarchy typology
		// Build a compact summary of every active ontology TLD registered in
		// this installation.  ontology::get_active_elements() returns the full
		// main-section objects; here only the fields relevant to remote callers
		// are extracted to keep the JSON payload small.
		$active_ontologies = array_map(function( $el ){
			$active_ontology = new stdClass();
				$active_ontology->tld			= strtolower($el->tld);
				$active_ontology->name			= $el->name;
				$active_ontology->name_data		= $el->name_data;
				$active_ontology->typology_id	= $el->typology_id;
				$active_ontology->typology_name	= $el->typology_name;

			return $active_ontology;
		},  ontology::get_active_elements() );

		foreach ($data as $key => $data_element) {

			// Fill value
			$value = new stdClass();
				$value->version				= $version;
				$value->date				= $date;
				$value->entity_id			= DEDALO_ENTITY_ID;
				$value->entity				= DEDALO_ENTITY;
				$value->entity_label		= DEDALO_ENTITY_LABEL;
				$value->host				= DEDALO_HOST;
				$value->active_ontologies	= $active_ontologies;

			// Set value
			$data[$key]->value = $value;
		}

		$properties_component->set_data( $data );
		$properties_component->save();


		return true;
	}//end update_ontology_info



	/**
	* EXPORT_TO_FILE
	* Dumps all 'matrix_ontology' rows for a given TLD into a gzip-compressed
	* PostgreSQL COPY file using the psql daemon.
	*
	* The output file is written to:
	*   ONTOLOGY_DATA_IO_DIR/<major>.<minor>/<tld>.copy.gz
	*   e.g. /var/www/dedalo/install/import/ontology/7.0/dd.copy.gz
	*
	* The psql COPY … TO PROGRAM command streams rows through gzip immediately,
	* avoiding a temporary uncompressed intermediate file.  The `&& sync` suffix
	* forces the kernel to flush write buffers to disk before the command exits,
	* which prevents a situation where the file exists but is incompletely written
	* when the PHP process checks file_exists() immediately after.
	*
	* Security hardening (COMP-06):
	*   $tld is validated by safe_tld() (regex /^[a-z]{2,}$/).
	*   The derived $section_tipo is then additionally validated with
	*   /^[a-zA-Z0-9_]+$/ before interpolation into the shell command because
	*   it is embedded in a `psql -c "..."` literal that spawns a sub-shell
	*   via TO PROGRAM.  Both guards together prevent shell injection.
	*
	* The file_exists() post-check uses an Exception rather than the commented-out
	* response pattern below it — this is by design; the caller (tool_ontology_parser)
	* handles the exception at a higher level.
	*
	* @param string $tld  Top-level domain identifier, e.g. 'dd', 'es', 'oh'.
	*                     Must match /^[a-z]{2,}$/ (enforced by safe_tld()).
	* @return object $response
	*   - result         bool   true on success
	*   - msg            string human-readable status
	*   - errors         array  non-empty on failure
	*   - command_result string raw output from shell_exec (usually null for COPY)
	*   - debug          object {file_path: string}
	* @throws Exception  When the output file is not created after shell_exec.
	* @test true
	*/
	public static function export_to_file( string $tld ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// check section tipo is a valid tipo
		// safe_tld() rejects anything that is not 2+ lowercase letters, preventing
		// TLD values with metacharacters from reaching the shell command.
			$check_tld = safe_tld( $tld );

			if ( $check_tld === false ) {
				$response->msg		= 'Error. Invalid tld: '.$tld;
				$response->errors[]	= 'Invalid tld: '.$tld;
				return $response;
			}

		// path to save the file
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$file_path = "{$ontology_io_path}/{$tld}.copy.gz";

		// get section_tipo
		// map_tld_to_target_section_tipo() appends '0' to produce e.g. 'dd' → 'dd0'.
			$section_tipo = ontology::map_tld_to_target_section_tipo( $tld );
			// COMP-06: $section_tipo is interpolated into a psql -c SQL string literal
			// that runs a shell `TO PROGRAM`. It is server-derived from the
			// safe_tld-validated $tld, but assert a bare identifier as defence-in-depth
			// so no quote / shell metacharacter can reach the command.
			if (!is_string($section_tipo) || !preg_match('/^[a-zA-Z0-9_]+$/', $section_tipo)) {
				$response->msg		= 'Error. Invalid section_tipo for ontology export';
				$response->errors[]	= 'Invalid section_tipo: '.to_string($section_tipo);
				return $response;
			}

		// columns. Like ["section_id", "section_tipo", "data", "relation", ..]
		// Explicitly listing columns (rather than SELECT *) makes the COPY file
		// schema-stable even if new columns are added to the table later.
			$columns = matrix_db_manager::get_columns_name();

		// command
		// DB_BIN_PATH is the filesystem path to the psql binary directory.
		// DEDALO_DATABASE_CONN contains the -d / --dbname flag value.
		// DBi::get_connection_string() provides host/port/user credentials.
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			$command = $command_base
				. " -c \"\copy (SELECT ".implode(', ', $columns)." FROM \"matrix_ontology\" WHERE section_tipo = '{$section_tipo}') TO PROGRAM 'gzip -c > {$file_path} && sync';\" ";
			// Notes about the previous command:
			// 1. The gzip -c flag ensures gzip writes compressed data immediately to stdout as it receives input, rather than waiting
			//   to process a complete file. This can help with the buffering/flushing issues.
			// 2. The && sync is essentially a "make sure everything is really written to disk" safety measure.

			// debug
				if(SHOW_DEBUG===true) {
					debug_log(__METHOD__
						. " Executing Ontology export command: " . PHP_EOL
						. ' command: ' . to_string($command)
						, logger::WARNING
					);
				}

		// exec command in terminal
		// shell_exec returns null when there is no output or on failure; COPY
		// commands produce no stdout so null here is normal on success.
			$command_result = shell_exec($command);

		// check created file
		// (!) Throws on failure rather than returning a soft error response —
		// callers must wrap in try/catch if graceful degradation is needed.
			if (!file_exists($file_path)) {
				throw new Exception("Error Processing Request. File $file_path not created!", 1);
				// $response->msg		= 'Error Processing Request. File '.$file_path.' not created!';
				// $response->errors[]	= 'Target file was not created. Not found: '.$section_tipo;
				// return $response;
			}

		// all was done
			$response->result			= true;
			$response->msg				= 'OK. Request done: ' . $section_tipo;
			$response->command_result	= $command_result;
			// debug
			$response->debug = (object)[
				'file_path' => $file_path
			];


		return $response;
	}//end export_to_file



	/**
	* EXPORT_PRIVATE_LISTS_TO_FILE
	* Dumps the entire 'matrix_dd' table (Dédalo internal private lists) into a
	* gzip-compressed PostgreSQL COPY file using the psql daemon.
	*
	* Unlike export_to_file() this method does not filter by section_tipo; it
	* exports ALL rows from 'matrix_dd' because private lists belong to a single
	* consolidated table rather than the per-TLD 'matrix_ontology' partitioning.
	*
	* Output file:
	*   ONTOLOGY_DATA_IO_DIR/<major>.<minor>/matrix_dd.copy.gz
	*   e.g. /var/www/dedalo/install/import/ontology/7.0/matrix_dd.copy.gz
	*
	* The companion import method is import_private_lists_from_file(), which
	* sets $options->delete_table = true to truncate the whole 'matrix_dd' table
	* before loading the replacement rows.
	*
	* See export_to_file() for detailed notes on the psql COPY command flags
	* (gzip -c buffering and && sync flush guarantee).
	*
	* @return object $response
	*   - result         bool   true on success
	*   - msg            string human-readable status
	*   - errors         array  non-empty on failure
	*   - command_result string raw output from shell_exec (normally null)
	*   - debug          object {file_path: string}
	* @throws Exception  When the output file is not created after shell_exec.
	* @test true
	*/
	public static function export_private_lists_to_file() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// path to save the file
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}
			$file_path = "{$ontology_io_path}/matrix_dd.copy.gz";

		// columns. Like ["section_id", "section_tipo", "data", "relation", ..]
			$columns = matrix_db_manager::get_columns_name();

		// command
			$command_base = DB_BIN_PATH.'psql ' . DEDALO_DATABASE_CONN .' '. DBi::get_connection_string();
			$command = $command_base
				. " -c \"\copy (SELECT ".implode(', ', $columns)." FROM \"matrix_dd\") TO PROGRAM 'gzip -c > {$file_path} && sync';\" ";
			// Notes about the previous command:
			// 1. The gzip -c flag ensures gzip writes compressed data immediately to stdout as it receives input, rather than waiting
			//   to process a complete file. This can help with the buffering/flushing issues.
			// 2. The && sync is essentially a "make sure everything is really written to disk" safety measure.

		// exec command in terminal
			$command_result = shell_exec($command);

		// check created file
		// (!) Throws on failure — same pattern as export_to_file(); callers must
		// wrap in try/catch if graceful degradation is needed.
			if (!file_exists($file_path)) {
				throw new Exception("Error Processing Request. File $file_path not created!", 1);
				// $response->msg		= 'Error Processing Request. File '.$file_path.' not created!';
				// $response->errors[]	= 'Target file was not created. Not found: matrix_dd.copy.gz';
				// return $response;
			}

		// all was done
			$response->result			= true;
			$response->msg				= 'OK. Request done';
			$response->command_result	= $command_result;
			// debug
			$response->debug = (object)[
				'file_path' => $file_path
			];


		return $response;
	}//end export_private_lists_to_file



	/**
	* IMPORT_FROM_FILE
	* Loads a gzip-compressed PostgreSQL COPY file into 'matrix_ontology',
	* replacing all rows for the given section_tipo.
	*
	* The file must already be present on the local filesystem (downloaded by
	* download_remote_ontology_file()).  The file name is derived from $file_item->url
	* using basename() so the URL path structure does not matter.
	*
	* After the COPY load, counter::consolidate_counter() is called to advance
	* the ID sequence table ('matrix_counter') to the highest section_id that
	* was just imported.  Without this step the next record created for this
	* section_tipo would receive a duplicate section_id and fail on the
	* unique constraint.
	*
	* backup::import_from_copy_file() deletes rows WHERE section_tipo = $section_tipo
	* before loading (delete_table is false here), so partial re-imports for a
	* single TLD are safe and do not affect other TLDs in 'matrix_ontology'.
	*
	* @param object $file_item  Descriptor object with at least:
	*   - section_tipo  string  Target root section_tipo, e.g. 'dd0'
	*   - tld           string  TLD tag (used upstream, not needed here directly)
	*   - url           string  Source URL (only basename is used for local path)
	* @return object $import_response  Forwarded from backup::import_from_copy_file(),
	*   enriched with a 'debug' property {file_path: string}.
	* @test true
	*/
	public static function import_from_file( object $file_item ) : object {

		// options
			$section_tipo	= $file_item->section_tipo;
			$url			= $file_item->url;

		// file_name
		// Only the base name is used; this prevents path-traversal if a
		// malformed URL were somehow passed in.
			$file_name = basename( $url );

		// import ontology path
		// The file must already exist locally (placed by download_remote_ontology_file).
			$ontology_io_path	= ontology_data_io::get_ontology_io_path();
			$file_path			= $ontology_io_path .'/'. $file_name;

		// import records from file *.copy.gz
		// this delete existing data of current section_tipo and copy all file pg data
			$options = new stdClass();
				$options->section_tipo	= $section_tipo;
				$options->file_path		= $file_path;
				$options->matrix_table	= 'matrix_ontology';

			$import_response = backup::import_from_copy_file( $options );

		// set the counter of import ontology to last section_id.
		// After a bulk COPY load the sequence must be re-synced to avoid
		// duplicate section_id values on the next INSERT for this section_tipo.
			$matrix_table = common::get_matrix_table_from_tipo( $section_tipo );
			counter::consolidate_counter(
				$section_tipo,
				$matrix_table,
				'matrix_counter'
			);

		// debug
			$import_response->debug = (object)[
				'file_path' => $file_path
			];


		return $import_response;
	}//end import_from_file



	/**
	* IMPORT_PRIVATE_LISTS_FROM_FILE
	* Loads the 'matrix_dd.copy.gz' file (Dédalo private lists) into the
	* 'matrix_dd' table, fully replacing its previous contents.
	*
	* Unlike import_from_file(), this method sets $options->delete_table = true,
	* which instructs backup::import_from_copy_file() to TRUNCATE the entire
	* 'matrix_dd' table before loading.  This is correct because private lists
	* form a single, indivisible dataset — partial replacement is not meaningful.
	*
	* Note: no counter::consolidate_counter() call is made here.  Private list
	* IDs are managed separately from ontology IDs; if counter re-sync is ever
	* needed for 'matrix_dd' it must be added explicitly.
	*
	* The file must already be present locally (placed by download_remote_ontology_file()).
	* Only the basename of $file_item->url is used to construct the local path.
	*
	* @param object $file_item  Descriptor with at least:
	*   - url  string  Source URL; only basename() is used for local path resolution.
	*                  (section_tipo and tld fields are present in the caller's
	*                  object but are not consumed here.)
	* @return object $import_response  Forwarded from backup::import_from_copy_file(),
	*   enriched with a 'debug' property {file_path: string}.
	* @test true
	*/
	public static function import_private_lists_from_file( object $file_item ) : object {

		// options
			$url = $file_item->url;

		// file_name. Only file base name is used from URL
			$file_name = basename( $url );

		// import ontology path
		// The file must already exist locally (placed by download_remote_ontology_file).
			$ontology_io_path	= ontology_data_io::get_ontology_io_path();
			$file_path			= $ontology_io_path .'/'. $file_name;

		// import records from file *.copy.gz
		// this delete existing data of current section_tipo and copy all file pg data
		// delete_table = true: TRUNCATE the whole matrix_dd table before loading,
		// since private lists are an atomic dataset (not partitioned by section_tipo).
			$options = new stdClass();
				$options->file_path		= $file_path;
				$options->matrix_table	= 'matrix_dd';
				$options->delete_table	= true;

			$import_response = backup::import_from_copy_file( $options );

		// debug
			$import_response->debug = (object)[
				'file_path' => $file_path
			];


		return $import_response;
	}//end import_private_lists_from_file



	/**
	* DOWNLOAD_REMOTE_ONTOLOGY_FILE
	* Fetches a single COPY file from a remote ontology master server via cURL
	* and writes it to the local versioned IO directory.
	*
	* This is the transfer step in the sync workflow:
	*   1. check_remote_server() — verify master is reachable
	*   2. get_ontology_update_info() — retrieve the file manifest from master
	*   3. download_remote_ontology_file() (this method) — fetch each listed file
	*   4. import_from_file() / import_private_lists_from_file() — load into DB
	*
	* The file is saved using the basename of $url to prevent path-traversal.
	* ssl_verifypeer is disabled to support self-signed certificates on internal
	* master installations; this is intentional and acceptable in that context.
	*
	* A SERVER_PROXY constant (defined in config.php) is forwarded to the cURL
	* request when set, to support installations behind an HTTP proxy.
	*
	* The response carries both a partial-success flag ($response->result = true)
	* and a non-empty errors array when the file was saved but there were
	* recoverable warnings (e.g. filesize() threw an exception).
	*
	* @param string $url  Full HTTP/HTTPS URL of the .copy.gz file to download.
	*                     Must pass FILTER_VALIDATE_URL; otherwise an error is
	*                     returned immediately without making a network request.
	* @return object $response
	*   - result     bool    true when the file was saved (even with partial errors)
	*   - msg        string  human-readable status; includes elapsed time on success
	*   - errors     array   non-empty on any failure or warning
	*   - total_time string  elapsed time string, e.g. '2340 ms'
	*   - file_path  string  absolute local path of the written file
	*   - file_size  string|null  human-readable size (e.g. '4.2 MB'), null on error
	* @test true
	*/
	public static function download_remote_ontology_file( string $url ) : object {
		$start_time = start_time();

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// validate URL
		// Reject obviously malformed URLs before making any network request.
			if (empty($url) || !filter_var($url, FILTER_VALIDATE_URL)) {
				$response->errors[] = 'Invalid URL provided';
				$response->msg .= ' Invalid URL';
				return $response;
			}

		// file_name
		// basename() prevents path-traversal: only the final segment of the URL
		// is used as the local file name regardless of the URL path structure.
			$file_name = basename( $url );

		// curl request
		// ssl_verifypeer = false: intentionally disabled to support master servers
		// using self-signed certificates on internal networks.
		// timeout = 600 s: ontology COPY files can be several hundred MB.
			$curl_response = curl_request((object)[
				'url'				=> $url,
				// 'post'			=> true,
				'header'			=> false, // bool add header to result
				'ssl_verifypeer'	=> false,
				'timeout'			=> (60*10), // int seconds
				'proxy'				=> (defined('SERVER_PROXY') && !empty(SERVER_PROXY))
					? SERVER_PROXY // from Dédalo config file
					: false // default case
			]);
			$data = $curl_response->result;

		// errors
			// sample of failed download
			// {
			// 	"result": "",
			// 	"msg": "Error. Bad Request. Server has problems connecting to file (status code: 400)",
			// 	"errors": [],
			// 	"code": 400
			// }
			if (!empty($curl_response->errors)) {
				$response->errors = array_merge($response->errors, $curl_response->errors);
			}
			if ($curl_response->code!=200) {
				// error connecting to master server
				// Do not add debug error here because it is already handled by curl_request
				$response->errors[] = 'bad server response code: ' . $curl_response->code . ' (' .$curl_response->msg.') ' . $url;
				$response->msg .= ' Code is not as expected (200). Response code: ' . to_string($curl_response->code);
				return $response;
			}
			if (empty($data)) {
				// received data is empty (possibly a master server problem dealing with the request)
				debug_log(__METHOD__
					. " Empty result from download ontology file request " . PHP_EOL
					. ' response: ' .to_string($curl_response) . PHP_EOL
					. ' url param: ' . to_string($url)
					, logger::ERROR
				);
				$response->errors[] = 'empty data';
				$response->msg .= ' Empty result from download ontology file request';
				return $response;
			}

		// debug
			debug_log(__METHOD__
				. " >>> Downloaded remote data from $file_name - "
				. 'result type: ' . gettype($data) . ' - '
				. exec_time_unit($start_time,'ms').' ms'
				, logger::DEBUG
			);

		// Create downloads folder if not exists
		// set_ontology_io_path() is used (not get_) to ensure the directory
		// exists before writing; this is the first write operation in the workflow.
			$ontology_io_path	= ontology_data_io::set_ontology_io_path();
			if ( $ontology_io_path === false ) {
				$response->msg		= 'Error. Invalid directory: '.$ontology_io_path;
				$response->errors[]	= 'Unable to create directory: '.$ontology_io_path;
				return $response;
			}

		// Write downloaded file to local directory
			$file_path = $ontology_io_path .'/'. $file_name;
			$write = file_put_contents($file_path, $data);
			if ($write===false) {
				debug_log(__METHOD__
					. " Error writing downloaded ontology file " . PHP_EOL
					. ' path: ' .to_string($ontology_io_path .'/'. $file_name) . PHP_EOL
					. ' url param: ' . to_string($url)
					, logger::ERROR
				);
				$response->errors[] = 'file writing fails';
				$response->msg .= ' Error writing downloaded ontology file '.$file_name;
				return $response;
			}

		// file size
		// Wrapped in try/catch because filesize() can fail if the file was just
		// written but the filesystem metadata is not yet flushed (rare edge case).
		try {
			$file_size = format_size_units( filesize($file_path) );
		} catch (Exception $e) {
			$response->errors[] = $e->getMessage();
			$file_size = null;
		}

		// total time
		$total_time = exec_time_unit($start_time,'ms').' ms';

		// response
		// A non-empty errors array here means warnings only (file was written);
		// the msg reflects partial success so the caller can log appropriately.
		$response->result = true;
		$response->msg = count($response->errors)===0
			? 'OK. Request done successfully [download_remote_ontology_file] file: ' . $file_name
			: 'Request done with errors [download_remote_ontology_file] file: ' . $file_name;
		$response->msg .= ' | '. $total_time;
		$response->total_time	= $total_time;
		$response->file_path	= $file_path;
		$response->file_size	= $file_size;


		return $response;
	}//end download_remote_ontology_file



	/**
	* GET_ONTOLOGY_UPDATE_INFO
	* Builds the file manifest that a client installation uses to decide which
	* ontology COPY files to download and import.
	*
	* Called by dd_utils_api::get_ontology_update_info() in response to an
	* authenticated API request from a client installation.  The $version
	* parameter is supplied by the client and indicates which version directory
	* to inspect on this (master) server.
	*
	* The method scans the versioned IO directory for .json and .gz files:
	*   - 'ontology.json'      → decoded and returned as $result->info
	*   - '*.copy.gz'          → each becomes a file_item in $result->files
	*
	* File item construction from a .copy.gz filename:
	*   The regex /^([a-z_]{2,}).copy.gz$/ extracts the TLD prefix (e.g. 'dd',
	*   'es', 'oh', 'matrix').  For the special 'matrix' prefix the section_tipo
	*   is set to 'matrix' verbatim (not 'matrix0') since there is no matrix0
	*   root node; all other TLDs follow the standard TLD+'0' convention.
	*
	* The URL in each file_item uses DEDALO_PROTOCOL + DEDALO_HOST so the path
	* is always absolute and includes the correct scheme for the serving host.
	*
	* @param array $version  Two- or three-element version array, e.g. [7, 0, 1].
	*                        Only [0] (major) and [1] (minor) are used.
	* @return object $response
	*   - result  object|false  On success: {info: object|null, files: array}
	*               info  — decoded contents of 'ontology.json', or null if absent
	*               files — array of objects [{tld, section_tipo, url}, ...]
	*   - msg     string  human-readable status
	*   - errors  array   non-empty on failure
	* @test true
	*/
	public static function get_ontology_update_info( array $version ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// version
		// get_ontology_io_path() returns false if the directory for the requested
		// version does not exist on this server — the client asked for a version
		// that has never been exported here.
		$ontology_io_path = ontology_data_io::get_ontology_io_path( $version );

		if (!$ontology_io_path) {
			$response->msg		= 'Error. Invalid version number. This version does not contain ontology files. ' . implode('.', $version);
			$response->errors[]	= 'Unsupported version number. '. implode('.', $version);
			return $response;
		}

		// result
		$result = new stdClass();
			$result->info	= null;
			$result->files	= [];

		$ontology_io_url = ontology_data_io::get_ontology_io_url( $version );

		// files
		// get_dir_files() returns absolute paths for every file matching the
		// given extensions; both .json (metadata) and .gz (COPY files) are needed.
		$files = get_dir_files( $ontology_io_path, ['json', 'gz'] );
		foreach ( $files as $file_path ) {

			$file_name = basename( $file_path );

			if( $file_name === 'ontology.json'){
				// Parse the metadata file written by export_ontology_info() and
				// return it verbatim so the client can compare version/date.
				$ontology_info_txt	= file_get_contents( $ontology_io_path.'/'.$file_name );
				$ontology_info		= json_decode( $ontology_info_txt );

				$result->info = $ontology_info;
			}else{
				// Derive TLD and section_tipo from the filename pattern <tld>.copy.gz.
				// 'matrix' is a special case: the private-lists COPY file has
				// no corresponding 'matrix0' section root.
				preg_match('/^([a-z_]{2,}).copy.gz$/', $file_name, $matches);

				$file_item = new stdClass();
					$file_item->tld				= $matches[1];
					$file_item->section_tipo	= $matches[1]==='matrix' ? 'matrix' : $matches[1].'0';
					$file_item->url				= DEDALO_PROTOCOL.DEDALO_HOST.$ontology_io_url.'/'. basename( $file_name );

				$result->files[] = $file_item;
			}
		}

		$response->result = $result;
		$response->msg = 'OK. request done';

		return $response;
	}//end get_ontology_update_info



	/**
	* CHECK_REMOTE_SERVER
	* Pings a remote Dédalo installation's JSON API to verify that it is reachable
	* and configured as an ontology server.
	*
	* Sends a 'get_server_ready_status' action to dd_utils_api on the remote host
	* with options->check = 'ontology_server', which causes the remote to perform
	* its own readiness checks and return a structured result.
	*
	* The timeout is deliberately short (5 s) because this is a pre-flight check;
	* it must not block the UI while the user waits.  A 5 s timeout is enough to
	* detect a dead or unreachable master without delaying the UI.
	*
	* The $response->result field from curl_request() holds the raw JSON body as a
	* string; it is decoded in-place so callers receive a proper stdClass rather
	* than a raw string.  If json_decode() returns null (invalid JSON or empty
	* body) $response->result is set to false.
	*
	* @param object $server  Server descriptor:
	*   - url  string  Full URL to the remote JSON API endpoint, e.g.
	*                  'https://master.dedalo.dev/dedalo/core/api/v1/json/'
	* @return object $response  Forwarded from curl_request(), with $response->result
	*   decoded from JSON string to stdClass (or false on decode failure):
	*   {
	*     "result": {
	*       "result": true,
	*       "msg": "OK. Ontology server is ready",
	*       "errors": [],
	*       "action": "get_server_ready_status",
	*       "dedalo_last_error": null
	*     },
	*     "msg": "OK. check_remote_server passed successfully",
	*     "errors": [],
	*     "error": false,
	*     "code": 200
	*   }
	* @test true
	*/
	public static function check_remote_server( object $server ) : object {

		// rqo
		// Build the request query object for the remote dd_utils_api endpoint.
		// prevent_lock = true avoids the session-lock mechanism so the health
		// check does not block or get blocked by concurrent user sessions.
			$rqo = new stdClass();
				$rqo->dd_api		= "dd_utils_api";
				$rqo->action		= "get_server_ready_status";
				$rqo->prevent_lock	= true;
				$rqo->options		= new stdClass();
					$rqo->options->check = 'ontology_server';

			$rqo_string = 'rqo=' . json_encode($rqo);

		// curl_request
		// timeout = 5 s: intentionally short — this is a connectivity pre-check,
		// not a data transfer.  ssl_verifypeer = false supports internal master servers.
			$response = curl_request((object)[
				'url'				=> $server->url,
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

			// Decode the JSON body string into a stdClass so callers do not need
			// to json_decode() themselves.  ?? false handles null / parse failure.
			if ( !empty($response->result) ){
				$response->result = json_decode($response->result) ?? false;
			}


		return $response;
	}//end check_remote_server




	/**
	* EXPORT_LLM_MAP
	* Builds a flat, multilingual section → fields map for LLM/AI-agent consumption
	* and writes it to 'ontology_llm_map.json' in the versioned IO directory.
	*
	* The map is an array of section entry objects, each with the shape:
	*   {
	*     "tipo":   "oh1",
	*     "label":  {"lg-eng": "Oral History", "lg-spa": "Historia oral"},
	*     "fields": [
	*       {"tipo":"oh14","label":{"lg-eng":"Title"},"type":"text"},
	*       {"tipo":"oh24","label":{"lg-eng":"Informant"},"type":"link","target":"rsc197"}
	*     ]
	*   }
	*
	* Section list source:
	*   dd_ontology_db_manager::search(['model' => 'section'], true) returns all
	*   tipos whose model is 'section' from the flat 'dd_ontology' table.
	*
	* Per-section field list:
	*   agent_view_builder::section_label_map() drives the field list, applying
	*   the same EXCLUDED_MODELS filtering, target resolution, and simplified
	*   type mapping used by the AI agent at query time — so the map exactly
	*   reflects what the agent can address.
	*
	* Per-node multilingual labels:
	*   ontology_node::get_term_data() returns a stdClass keyed by language code
	*   (e.g. {"lg-eng": "...", "lg-spa": "..."}) for both section and field entries.
	*
	* Error handling:
	*   Individual section failures are caught with \Throwable; the failing section
	*   is added to $skipped and building continues.  This prevents one broken
	*   section from aborting the entire map generation.  All skipped tipos are
	*   returned in $response->skipped for post-processing review.
	*
	* Called by:
	*   - tool_ontology_parser::export_ontologies()    (full export pipeline)
	*   - tool_ontology_parser::regenerate_ontologies() (regeneration pipeline)
	*
	* Consumed by:
	*   - dd_agent_api: loads 'ontology_llm_map.json' at query time for O(1)
	*     section/field lookup without hitting the database.
	*
	* @return object $response
	*   - result        bool    true on success
	*   - msg           string  human-readable status with section count
	*   - errors        array   non-empty on failure
	*   - path_file     string  absolute path of the written file
	*   - saved         int|false  bytes written by file_put_contents
	*   - section_count int     number of sections successfully mapped
	*   - skipped       array   list of section_tipos that threw during mapping
	* @test true
	*/
	public static function export_llm_map() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// path to save the file
		// set_ontology_io_path() creates the directory if absent; needed here
		// because this method may be called independently of the COPY export flow.
			$ontology_io_path = ontology_data_io::set_ontology_io_path();
			if ($ontology_io_path === false) {
				$response->msg		= 'Error. Unable to create/access IO directory';
				$response->errors[]	= 'io_dir_failed';
				return $response;
			}
			$path_file = "{$ontology_io_path}/ontology_llm_map.json";

		// all section tipos from dd_ontology
		// The second argument (true) requests only the tipo strings rather than
		// full node objects, which is sufficient for iterating.
			$section_tipos = dd_ontology_db_manager::search(['model' => 'section'], true);
			if (!is_array($section_tipos)) {
				$response->msg		= 'Error. Unable to query section tipos from dd_ontology';
				$response->errors[]	= 'db_query_failed';
				return $response;
			}

			$map		= [];
			$skipped	= [];
			foreach ($section_tipos as $section_tipo) {

				try {
					// Section multilang term data (all languages at once)
					$section_node		= ontology_node::get_instance($section_tipo);
					$section_term_data	= $section_node->get_term_data() ?? new stdClass();

					// Component map — uses existing logic (EXCLUDED_MODELS, disambiguation,
					// target resolution, simplified types) for the default lang
					$label_map = agent_view_builder::section_label_map($section_tipo, DEDALO_DATA_LANG);

					$fields = [];
					foreach ($label_map->labels as $entry) {

						$comp_node		= ontology_node::get_instance($entry->tipo);
						$comp_term_data	= $comp_node->get_term_data() ?? new stdClass();

						$field = [
							'tipo'	=> $entry->tipo,
							'label'	=> $comp_term_data,
							'type'	=> $entry->type,
						];
						// 'target' is only present for relation/link-type components;
						// omitting it for scalar types keeps the JSON compact.
						if (isset($entry->target)) {
							$field['target'] = $entry->target;
						}

						$fields[] = $field;
					}

					$map[] = [
						'tipo'		=> $section_tipo,
						'label'		=> $section_term_data,
						'fields'	=> $fields,
					];

				} catch (\Throwable $e) {
					// Skip the failing section but keep building the rest.
					$skipped[] = $section_tipo;
					debug_log(__METHOD__
						. " Skipped section '$section_tipo': " . $e->getMessage()
						, logger::ERROR
					);
				}
			}

		// write to file
		// JSON_UNESCAPED_UNICODE preserves non-ASCII characters in labels
		// (e.g. accented characters in Spanish/Catalan terms) without \uXXXX escaping.
			$data_string = json_encode(
				$map,
				JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES
			);
			$saved = file_put_contents($path_file, $data_string);
			if ($saved === false) {
				$response->msg		= 'Error. Unable to save ontology_llm_map.json';
				$response->errors[]	= 'file_write_failed';
				return $response;
			}

		$response->result		= true;
		$response->msg			= 'OK. LLM map exported: ' . count($map) . ' sections'
			. (empty($skipped) ? '' : ' (' . count($skipped) . ' skipped)');
		$response->path_file	= $path_file;
		$response->saved		= $saved;
		$response->section_count= count($map);
		$response->skipped		= $skipped;


		return $response;
	}//end export_llm_map



}//end ontology_data_io
