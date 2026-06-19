<?php declare(strict_types=1);
/**
* DATABASE_INFO
* Maintenance widget that surfaces live PostgreSQL schema and server metadata,
* and exposes a suite of database-administration operations to the Dédalo
* maintenance dashboard.
*
* This class acts as the server-side controller for the `database_info` widget
* panel in `area_maintenance`. It has two distinct roles:
*
* 1. Read probe (`get_value`): called via `dd_area_maintenance_api::get_widget_value`,
*    it returns a structured snapshot of the active PostgreSQL connection (version,
*    host), the full list of tables in the `public` schema, and per-table index
*    metadata. The dashboard JS polls this to render the "Database Info" panel.
*
* 2. Write actions (all entries in `API_ACTIONS`): called via
*    `dd_area_maintenance_api::widget_request`. Each action delegates to the
*    corresponding static method on `db_tasks` (core/db/class.db_tasks.php) and
*    returns a normalised stdClass response (`result`, `msg`, `errors`).
*
* All methods are static; the class is never instantiated.
* SQL definitions live in `core/db/db_pg_definitions.php` (loaded by `db_tasks`
* at call time). User activity stats operations delegate to
* `diffusion_section_stats` (diffusion/class.diffusion_section_stats.php).
*
* Security: the `API_ACTIONS` constant acts as an SEC-044 allowlist; any
* `widget_request` call that names a method not in this list is rejected by
* `dd_area_maintenance_api::widget_request` before it reaches this class.
* `get_value` is deliberately absent from the allowlist because it is reached
* through the separate `get_widget_value` API action, not through `widget_request`.
*
* Extends: nothing (standalone static class)
* API entry point: dd_area_maintenance_api (core/api/v1/common/class.dd_area_maintenance_api.php)
* Delegates DB work to: db_tasks (core/db/class.db_tasks.php)
*
* @package Dédalo
* @subpackage Core
*/
class database_info {



	/**
	* SEC-044: explicit allowlist of methods callable through
	* `dd_area_maintenance_api::widget_request`.
	*
	* `get_value` is intentionally absent because it is invoked through the
	* dedicated `get_widget_value` API action (which hard-codes the method
	* name) rather than through `widget_request`. If a widget method is not
	* listed here, `dd_area_maintenance_api` will return a permissions error
	* before the call reaches this class.
	*
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'analyze_db',
		'optimize_tables',
		'recreate_db_assets',
		'rebuild_db_indexes',
		'rebuild_db_functions',
		'rebuild_db_constraints',
		'consolidate_tables',
		'rebuild_user_stats'
	];



	/**
	* GET_VALUE
	* Returns a live snapshot of the database state for the widget panel.
	*
	* Called exclusively by `dd_area_maintenance_api::get_widget_value` (not via
	* `widget_request`), which is why this method is absent from `API_ACTIONS`.
	* The dashboard JS polls this endpoint to refresh the Database Info panel.
	*
	* The returned snapshot contains three keys:
	*  - 'info'    : associative array from pg_version() enriched with 'host'
	*                (the value of DEDALO_HOSTNAME_CONN). Includes server version,
	*                protocol version, and client library information.
	*  - 'tables'  : flat string array of all table names in the 'public' schema
	*                (from db_tasks::get_tables()).
	*  - 'indexes' : associative array keyed by table name; each value is the
	*                index-detail array returned by db_tasks::get_table_indexes().
	*                Tables without indexes are omitted.
	*
	* On success $response->result holds the associative array described above.
	* On failure (currently only if pg_version() or get_tables() throws) the
	* initialised false/$errors shape is preserved.
	*
	* @return object $response - stdClass with:
	*   result (array|false): snapshot array on success; false on failure
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): populated on partial failures
	*/
	public static function get_value() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed '.__METHOD__;
			$response->errors	= [];

		// tables
		$tables = db_tasks::get_tables();

		// info
		// pg_version() returns an associative array of PostgreSQL version strings.
		// The null-coalesce to [] guards against a false/null return when there is
		// no active connection (should not happen in normal flow, but prevents a
		// type error on the 'host' assignment below).
		$info = pg_version(DBi::_getConnection()) ?? [];
		$info['host'] = to_string(DEDALO_HOSTNAME_CONN);

		// indexes
		// Only tables that actually have at least one index are included to keep
		// the payload small — empty-index tables are skipped via the !empty guard.
		$indexes = [];
		foreach ($tables as $table) {
			$table_indexes = db_tasks::get_table_indexes($table);
			if (!empty($table_indexes)) {
				$indexes[$table] = $table_indexes;
			}
		}

		// result
		$result = [
			'info' => $info,
			'tables' => $tables,
			'indexes' => $indexes
		];

		// response
		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request done with errors';


		return $response;
	}//end get_value



	/**
	* ANALYZE_DB
	* Runs VACUUM ANALYZE on the entire database to refresh the PostgreSQL query
	* planner statistics and reclaim dead-tuple space.
	*
	* This is a thin wrapper: all logic lives in `db_tasks::analyze_db()`, which
	* issues `VACUUM ANALYZE` via pg_query() (outside any transaction) and captures
	* execution time. The operation is throttled to at most once per 24 hours by
	* the dd_cache timestamp mechanism in `db_tasks::should_run_analyze()`.
	*
	* The $options parameter is accepted for API uniformity but is currently unused;
	* VACUUM ANALYZE operates on the whole database unconditionally.
	*
	* @param object $options - Widget request options payload (currently unused)
	* @return object $response - stdClass forwarded from db_tasks::analyze_db():
	*   result (mixed): PgSql\Result (freed) on success, false on failure
	*   errors (array): populated on connection or query failure
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   execution_time (float): elapsed seconds for the VACUUM ANALYZE statement
	*/
	public static function analyze_db( object $options ) : object {

		$response = db_tasks::analyze_db();

		return $response;
	}//end analyze_db



	/**
	* OPTIMIZE_TABLES
	* Runs REINDEX CONCURRENTLY + VACUUM ANALYZE on a caller-specified list of tables.
	*
	* This method is the widget-layer entry point called by `dd_area_maintenance_api::
	* widget_request` when the JS widget sends `method: 'optimize_tables'`. It validates
	* the incoming table list, then delegates the actual SQL work to
	* `db_tasks::optimize_tables()`, which shells out to `psql` (because VACUUM cannot
	* run inside a transaction).
	*
	* Input validation performed here (before reaching db_tasks):
	*  - $options->tables must be present and non-empty; missing → early error return.
	*  - $options->tables must be an array; wrong type → early error return.
	* Further per-table validation (alphanumeric, existence check) is enforced inside
	* `db_tasks::optimize_tables()`.
	*
	* `session_write_close()` is called before the potentially long-running operation
	* to release the PHP session lock, allowing the browser to make concurrent requests
	* (e.g. a polling call to check progress) without blocking.
	*
	* When SHOW_DEBUG is true, elapsed time is appended to the response as
	* $response->debug->exec_time for front-end display.
	*
	* @param object $options - Widget request options; must carry:
	*   tables (array): list of table name strings to optimize
	* @return object $response - stdClass with:
	*   result (bool): true when processing completed
	*   msg (string): success summary or error text
	*   errors (array): per-table error messages; also populated on exception
	*   reindex (array): per-table psql output from REINDEX pass (from db_tasks)
	*   vacuum (array): per-table psql output from VACUUM pass (from db_tasks)
	*   debug (object|undefined): only present when SHOW_DEBUG===true; contains exec_time
	*/
	public static function optimize_tables( object $options ) : object {

		$start_time = start_time();

		// Write session to unlock session file
		// Releasing the session lock allows concurrent browser requests while this
		// potentially long-running operation executes (REINDEX + VACUUM can take minutes).
		session_write_close();

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= '';
				$response->errors	= [];

		// options
			$tables = $options->tables;

			if (empty($tables)) {
				$response->errors[] = 'No tables selected';
				return $response;
			}

			if (!is_array($tables)) {
				$response->errors[] = 'Invalid tables parameter';
				return $response;
			}

		// try exec
			try {

				$optimize_tables_response = db_tasks::optimize_tables($tables);

				// response overwrite
				// The db_tasks response is the canonical result; discard the stub above.
				$response = $optimize_tables_response;

			} catch (Exception $e) {

				// Append msg
				$response->msg .= $e->getMessage();
				debug_log(__METHOD__
					." Database optimization failed ERROR: " . $e->getMessage() . PHP_EOL
					. ' response: ' . to_string($response)
					, logger::ERROR
				);
				$response->errors[] = 'Database optimization failed';
			}

		// debug
			if(SHOW_DEBUG===true) {
				$debug = new stdClass();
					$debug->exec_time = exec_time_unit_auto($start_time);
				$response->debug = $debug;
			}


		return $response;
	}//end optimize_tables



	/**
	* RECREATE_DB_ASSETS
	* Rebuilds the full set of PostgreSQL database assets in the canonical order:
	* extensions → constraints → functions → indexes → maintenance SQL.
	*
	* This is the "nuclear option" for schema repair: it drops and recreates every
	* index, constraint, stored function, and extension declared in
	* `core/db/db_pg_definitions.php`. Use it after a pg_restore that cleared all
	* custom schema objects, or when a migration leaves the schema in an unknown state.
	*
	* The PHP execution limit is raised to 18 000 seconds (5 hours) because rebuilding
	* all indexes on a large Dédalo database can take a very long time.
	*
	* Execution order matters:
	*  1. Extensions (pg_trgm, unaccent) must exist before indexes that use them.
	*  2. Constraints are applied before indexes so FK/unique definitions are in place.
	*  3. Functions are rebuilt before indexes that call them (e.g. functional indexes).
	*  4. Indexes are rebuilt last.
	*  5. Maintenance SQL (CLUSTER, additional VACUUM) is run after all objects exist.
	*
	* Each sub-response's `result` is merged into $response->result as a named property
	* (extensions, constraints, functions, indexes, maintenance). Errors from all phases
	* are accumulated via array_merge; the method does not short-circuit on a phase failure.
	*
	* (!) $options is accepted for API uniformity but is currently unused; this action
	* always rebuilds everything.
	*
	* @param object $options - Widget request options payload (currently unused)
	* @return object $response - stdClass with:
	*   result (object): per-phase result values (extensions, constraints, functions,
	*                    indexes, maintenance) from the db_tasks sub-calls
	*   msg (string): 'Error. Request failed' (no explicit OK set; relies on caller inspection)
	*   errors (array): merged error array from all five rebuild phases
	*   success (int): always 0 (not updated; callers should inspect errors instead)
	*/
	public static function recreate_db_assets( object $options ) : object {

		set_time_limit(18000); // 5 hours

		$response = new stdClass();
			$response->result	= new stdClass();
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// extensions
		// Must run first: indexes that rely on pg_trgm or unaccent will fail to create
		// if the extensions are not yet installed.
		$response_extensions	= db_tasks::create_extensions();
			$response->result->extensions	= $response_extensions->result;
			$response->errors				= $response_extensions->errors;
		// constraints
		$response_constraints	= db_tasks::rebuild_constraints();
			$response->result->constraints	= $response_constraints->result;
			$response->errors				= array_merge($response->errors, $response_constraints->errors);
		// functions
		$response_functions		= db_tasks::rebuild_functions();
			$response->result->functions	= $response_functions->result;
			$response->errors				= array_merge($response->errors, $response_functions->errors);
		// indexes
		$response_indexes		= db_tasks::rebuild_indexes();
			$response->result->indexes		= $response_indexes->result;
			$response->errors				= array_merge($response->errors, $response_indexes->errors);
		// maintenance
		$response_maintenance	= db_tasks::exec_maintenance();
			$response->result->maintenance	= $response_maintenance->result;
			$response->errors				= array_merge($response->errors, $response_maintenance->errors);


		return $response;
	}//end recreate_db_assets



	/**
	* REBUILD_DB_INDEXES
	* Drops and recreates all PostgreSQL indexes declared in `db_pg_definitions.php`,
	* optionally scoped to a subset of tables.
	*
	* This is a targeted alternative to `recreate_db_assets` for when only index
	* corruption or drift needs to be fixed without touching constraints or functions.
	* The actual drop-and-add logic lives in `db_tasks::rebuild_indexes()`.
	*
	* The PHP execution limit is raised to 7 200 seconds (2 hours) because index
	* creation on large tables can be very slow.
	*
	* $options->tables is optional: when empty (or absent) all index definitions in
	* `db_pg_definitions.php` are processed; when non-empty, only definitions whose
	* `tables` array intersects with the provided list are rebuilt.
	*
	* @param object $options - Widget request options; may carry:
	*   tables (array, optional): restrict to these table names; empty = rebuild all
	* @return object $response - stdClass forwarded from db_tasks::rebuild_indexes():
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-table/index error messages
	*   success (int): count of index definitions processed without error
	*   n_queries (int): total number of individual SQL statements executed
	*   n_errors (int): total number of failed statements
	*/
	public static function rebuild_db_indexes( object $options ) : object {

		set_time_limit(7200); // 2 hours

		// options
		// tables are optional. On empty, all tables are processed
		$tables = $options->tables ?? [];

		$response = db_tasks::rebuild_indexes($tables);

		return $response;
	}//end rebuild_db_indexes



	/**
	* REBUILD_DB_FUNCTIONS
	* Drops and recreates all PostgreSQL stored functions declared in `db_pg_definitions.php`.
	*
	* Thin wrapper around `db_tasks::rebuild_functions()`. Use when a function's body
	* or signature has changed in `db_pg_definitions.php` and needs to be pushed to
	* the live database without rebuilding the entire asset set.
	*
	* Note: this method accepts no $options parameter even though other API_ACTIONS
	* accept one. The API router calls it with no arguments; adding an optional
	* parameter would maintain backward compatibility if needed in future.
	*
	* @return object $response - stdClass forwarded from db_tasks::rebuild_functions():
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-function error messages
	*   success (int): count of functions rebuilt without error
	*   n_queries (int): total number of function entries attempted
	*   n_errors (int): total number of failed entries
	*/
	public static function rebuild_db_functions() : object {

		$response = db_tasks::rebuild_functions();

		return $response;
	}//end rebuild_db_functions



	/**
	* REBUILD_DB_CONSTRAINTS
	* Drops and recreates all PostgreSQL constraints declared in `db_pg_definitions.php`.
	*
	* Thin wrapper around `db_tasks::rebuild_constraints()`. Constraints are recreated
	* unconditionally (no table filter). Use when constraint definitions have changed or
	* when a `pg_restore` has wiped custom constraints from the schema.
	*
	* Like `rebuild_db_functions`, this method accepts no $options parameter. It is
	* reached via `widget_request` with no options payload.
	*
	* @return object $response - stdClass forwarded from db_tasks::rebuild_constraints():
	*   result (bool): true when processing completed
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): per-table/constraint error messages
	*   success (int): count of constraint entries fully processed
	*   n_queries (int): total number of constraint entries attempted
	*   n_errors (int): total number of failed entries
	*/
	public static function rebuild_db_constraints() : object {

		$response = db_tasks::rebuild_constraints();

		return $response;
	}//end rebuild_db_constraints



	/**
	* CONSOLIDATE_TABLES
	* Renumbers the id column of each specified table so that ids form a contiguous
	* sequence starting at 1, and resets the PostgreSQL sequence to match.
	*
	* "Consolidation" is needed after large-scale bulk deletes or id-range migrations
	* that leave large gaps in the id column. The dense id sequence is required by
	* some internal Dédalo pagination and cache-key algorithms that assume a compact
	* integer id space.
	*
	* This method enforces a strict allowlist: only tables in $ar_tables may be
	* consolidated. Requests for any other table are logged and silently skipped.
	* The allowlist is intentionally small: ontology and main matrix tables are the
	* only tables where id compaction is needed and safe; data tables with foreign-key
	* references from other tables must not be renumbered here.
	*
	* Processing stops and returns immediately if any individual table fails
	* (`db_tasks::consolidate_table()` returns false). The caller can inspect
	* $response->errors to determine which table caused the failure.
	*
	* $options->tables is optional: an empty array means no tables are processed and
	* the method returns success with no work done.
	*
	* (!) Id renumbering modifies primary key values in place. Do not run while any
	* other process is reading or writing the affected tables.
	* Run `db_tasks::check_sequences()` afterwards to verify sequence alignment.
	*
	* @param object $options - Widget request options; may carry:
	*   tables (array, optional): list of table name strings to consolidate;
	*                             only names in $ar_tables are acted on
	* @return object $response - stdClass with:
	*   result (bool): true when all requested (allowlisted) tables were consolidated;
	*                  false on the first table that db_tasks::consolidate_table() fails
	*   msg (string): 'OK. Request done successfully' or 'Warning. Request done with errors'
	*   errors (array): error messages for any failed or disallowed tables
	*   success (int): always 0 (not updated per table; reserved for future use)
	*/
	public static function consolidate_tables( object $options ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ';
			$response->errors	= [];
			$response->success	= 0;

		// options
		$tables = $options->tables ?? [];

		// Allowlist: only these tables may have their id column renumbered.
		// Expanding this list requires verifying that no other table holds a
		// foreign key pointing to the candidate table's id column.
		$ar_tables = ['dd_ontology','matrix_ontology','matrix_ontology_main','matrix_dd'];

		// exec
		foreach ($tables as $table) {

			// Security / safety: reject any table not in the hard-coded allowlist.
			// Using in_array here (not a DB lookup) so the check cannot be bypassed
			// by manipulating the database state.
			if (!in_array($table, $ar_tables)) {
				debug_log(__METHOD__
					. " Ignored non allow table " . PHP_EOL
					. ' table: ' . to_string($table)
					, logger::ERROR
				);
				continue;
			}

			$result = db_tasks::consolidate_table( $table );

			// Early exit on first failure — do not attempt the remaining tables,
			// since a partial renumber with a broken sequence is harder to recover than
			// leaving everything in the pre-consolidation state.
			if($result === false){
				$response->errors[]	= 'It is not possible to consolidate the table: '.$table;
				return $response;
			}
		}

		// response OK
		$response->result	= true;
		$response->msg		= count($response->errors)>0
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';


		return $response;
	}//end consolidate_tables



	/**
	* REBUILD_USER_STATS
	* Rebuilds the daily activity statistics for one or more users by deleting the
	* existing aggregated stats records and recomputing them from the raw activity log.
	*
	* User activity statistics are stored in the diffusion layer (dd70 section tipo) and
	* summarise per-day edit counts for each contributor. They can become stale after a
	* data migration, a bulk import, or an interrupted diffusion run. This method allows
	* an administrator to regenerate them without touching the source activity log.
	*
	* For each user the process is:
	*  1. `diffusion_section_stats::delete_user_activity_stats($user_id)` — removes all
	*     existing stat records for the user. If deletion fails the user is skipped (error
	*     appended) and the loop continues with the next user.
	*  2. `diffusion_section_stats::update_user_activity_stats($user_id)` — recomputes
	*     and saves stats from the activity log. If this fails the entire method returns
	*     the sub-response immediately (no further users are processed).
	*
	* $response->updated_days accumulates the `result` property of each successful
	* `update_user_activity_stats` call, which describes the days regenerated.
	*
	* (!) The inner label '// write_lang_file' is a stale copy-paste label that does not
	* describe the actual operation (user stats rebuild). It is preserved as-is per the
	* doc-only policy.
	*
	* @param object $options - Widget request options; must carry:
	*   users (array): list of user id values (int-coercible) to rebuild stats for
	* @return object $response - stdClass with:
	*   result (bool): false on validation failure or unrecoverable sub-error;
	*                  left as false (not set to true on success — callers should
	*                  inspect errors/updated_days instead)
	*   msg (string): 'OK. Request done.' or 'Warning! Request done with errors'
	*   errors (array): per-user error messages (delete failure or update sub-errors)
	*   updated_days (array): accumulated result values from successful update calls
	*/
	public static function rebuild_user_stats( object $options ) : object {

		// options
			$users = $options->users ?? null;

		// response
			$response = new stdClass();
				$response->result		= false;
				$response->msg			= 'Error. Request failed ['.__FUNCTION__.']';
				$response->errors		= [];
				$response->updated_days	= [];

		// check users value
			if (empty($users)) {
				$response->msg		.= ' Empty users value';
				$response->errors[]	= 'invalid users';
				return $response;
			}

		// write_lang_file
			foreach ($users as $user_id) {

				// delete_user_activity_stats
				// Wipe existing stat records before recalculating; if deletion fails, skip
				// this user but keep processing the remaining users in the list.
				$deleted = diffusion_section_stats::delete_user_activity_stats( (int)$user_id );
				if (!$deleted) {
					$response->errors[] = 'failed delete user stats. User: '.$user_id;
					continue;
				}

				// update_user_activity_stats
				// Recomputes from the raw activity log; on failure return immediately
				// rather than accumulating a broken partial result for the remaining users.
				$update_user_response = diffusion_section_stats::update_user_activity_stats( (int)$user_id );
				if (!$update_user_response->result) {
					return $update_user_response;
				}

				// errors
				$response->errors = array_merge($response->errors, $update_user_response->errors);

				// updated_days
				$response->updated_days[] = $update_user_response->result;
			}

		// response OK
			$response->msg = empty($response->errors)
				? 'OK. Request done.'
				: 'Warning! Request done with errors';


		return $response;
	}//end rebuild_user_stats



}//end database_info
