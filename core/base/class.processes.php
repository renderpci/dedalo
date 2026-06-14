<?php declare(strict_types=1);
/**
* CLASS PROCESSES
* Registry and lifecycle manager for background OS processes in Dédalo.
*
* Background tasks (tool exports, area_maintenance jobs, media transcodes) are spawned
* by exec_::request_cli() and run as child processes of PHP-FPM. This class is the
* persistent ledger for those processes: it records which PID belongs to which user,
* allows callers to check status, and removes the record when the process finishes or
* is stopped.
*
* Responsibilities:
* - add()               — write a new (user_id, pid, pfile, date) entry to the DB.
* - stop()              — verify ownership, send SIGTERM via the `process` helper, and clean up.
* - delete_process_item() — remove a single entry from the list after a process ends.
* - get_process_item()  — look up a live entry by PID (used for ownership checks before
*                         streaming the output file back to the client).
*
* Storage layout:
*   Table : PROCESSES_TABLE ('matrix_notifications')
*   Row   : id = RECORD_ID (2)
*   Column: data (text) — JSON array of process-entry objects:
*             [{ "user_id": int, "pid": int, "pfile": string, "date": string }, …]
*
* Concurrency:
*   add(), stop(), and delete_process_item() all issue `SELECT … FOR UPDATE` to
*   lock the single data row for the duration of the read-modify-write cycle,
*   preventing lost updates when two background tasks register at the same instant.
*
* Known callers:
* - exec_::request_cli()           — calls add() immediately after spawning the child.
* - dd_utils_api::get_process_status() — calls get_process_item() to resolve the pfile path.
* - dd_utils_api::stop_process()   — calls stop() on user request from the client UI.
*
* Depends on:
* - `process` class (class.exec_.php) — OS-level PID inspection and SIGTERM.
* - `matrix_db_manager`              — PostgreSQL query execution layer.
* - `dd_date::get_timestamp_now_for_db()` — ISO timestamp for the 'date' field.
* - `logged_user_id()` (shared/core_functions.php) — session-based user resolution.
* - `DEDALO_SUPERUSER` constant (dd_tipos.php, value -1) — privileged user sentinel.
*
* @package Dédalo
* @subpackage Core
*/
class processes {

	/**
	* Name of the PostgreSQL table used as the process registry.
	* Reuses the 'matrix_notifications' table (row id=2) rather than a dedicated table,
	* following Dédalo's convention of storing ephemeral system state in standard matrix tables.
	* @var string PROCESSES_TABLE
	*/
	const PROCESSES_TABLE = 'matrix_notifications';

	/**
	* Fixed row ID within PROCESSES_TABLE where the process list JSON is stored.
	* The entire process registry lives in a single row; the 'data' column holds a
	* JSON-encoded array of process-entry objects.
	* @var int RECORD_ID
	*/
	const RECORD_ID = 2;



	/**
	* ADD
	* Register a new background process in the persistent tracking table.
	*
	* Inserts a process-entry object { user_id, pid, pfile, date } into the JSON array
	* stored in PROCESSES_TABLE at RECORD_ID. The row is locked with FOR UPDATE to guard
	* against concurrent insertions by two callers registering at the same millisecond.
	*
	* If the row does not yet exist it is created with ON CONFLICT DO NOTHING, then
	* re-fetched, so a race-winning parallel INSERT does not cause a duplicate.
	*
	* The $pfile value is sanitized to its basename before storage; callers must not
	* include directory traversal sequences (e.g. '../') in this argument.
	*
	* Returns false (result=false) rather than throwing on all error paths; callers must
	* check $response->result before using $response->data_item.
	*
	* @param int    $user_id - ID of the user who owns the process; -1 is DEDALO_SUPERUSER.
	* @param int    $pid     - OS process ID (must be > 0).
	* @param string $pfile   - Output file basename for this process (must be non-empty).
	* @return object $response - stdClass with:
	*   bool   $result    — true on success, false on any error.
	*   string $msg       — human-readable status or error description.
	*   array  $errors    — list of error tokens (empty on success).
	*   object $data_item — the newly inserted entry (only present when result=true).
	*/
	public static function add( int $user_id, int $pid, string $pfile ) : object {

		// Input validation
			if ($user_id < -1) { // -1 is DEDALO_SUPERUSER
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Invalid user_id';
				$response->errors = ['invalid user_id'];
				return $response;
			}
			if ($pid <= 0) {
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Invalid PID';
				$response->errors = ['invalid pid'];
				return $response;
			}
			if (empty($pfile)) {
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Empty pfile';
				$response->errors = ['empty pfile'];
				return $response;
			}

		// Initialize response object
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// Short references for clarity
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// Load current process list from database
			// CRITICAL: We use 'FOR UPDATE' to lock the row during the read-modify-write cycle.
			// This prevents lost updates if multiple processes registration attempts happen concurrently.
			$sql_query = 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE';
			$res = matrix_db_manager::exec_search($sql_query, [$id]);
			if(!$res) {
				$response->msg = 'Error. Request failed to exec query: ' . $sql_query;
				$response->errors[] = 'database error';
				return $response;
			}
			$num_rows = pg_num_rows($res);

			// Initialize the record if it doesn't exist
			if ($num_rows<1) {
				$data = '[]';
				// USE 'ON CONFLICT' to handle race conditions where another process might have
				// just inserted the baseline row between our SELECT and INSERT.
				$sql_query = "INSERT INTO \"$table\" (id, data) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING";
				$result = matrix_db_manager::exec_search($sql_query, [$id, $data]);
				if ($result===false) {
					$response->msg		= 'Error creating new record';
					$response->errors[]	= 'Create new record fails';
					return $response;
				}
				// Re-fetch data after INSERT to handle race condition
				$sql_query = 'SELECT data FROM "'.$table.'" WHERE id = $1';
				$res = matrix_db_manager::exec_search($sql_query, [$id]);
				if(!$res || pg_num_rows($res) < 1) {
					$response->msg = 'Error. Request failed to re-fetch after insert: ' . $sql_query;
					$response->errors[] = 'database error after insert';
					return $response;
				}
				$data = pg_fetch_result($res, 0, 0);
			}else{
				$data = pg_fetch_result($res, 0, 0);
			}

			// Decode JSON data and ensure it's a valid array
			$json_data = json_decode($data);
			if (json_last_error() !== JSON_ERROR_NONE) {
				$response->msg = 'Error decoding JSON data: ' . json_last_error_msg();
				$response->errors[] = 'json decode error';
				return $response;
			}
			$data = is_array($json_data) ? $json_data : [];

		// Check if this process is already registered
			// array_find() is a PHP 8.4 built-in; a polyfill for earlier PHP versions
			// is declared in shared/core_functions.php and used transparently here.
			// The isset() guards defend against malformed entries that lack the expected fields.
			$found_row = array_find($data, function($el) use($user_id, $pid){
				return isset($el->pid) && $el->pid === $pid && isset($el->user_id) && $el->user_id === $user_id;
			});
			if (!is_null($found_row)) {
				$response->result	= false;
				$response->msg		= 'Process '.$pid.' already exists';
				return $response;
			}

		// Sanitize pfile parameter to prevent path injection
			$pfile = basename($pfile);

		// Create and append the new process item
			$data_item = (object)[
				'user_id'	=> $user_id,
				'pid'		=> $pid,
				'pfile'		=> $pfile,
				'date'		=> dd_date::get_timestamp_now_for_db()
			];
			$data[] = $data_item;

		// Persist the updated list back to the database
			$data_string	= json_encode($data);
			$sql_query		= "UPDATE \"".$table."\" SET data = $1 WHERE id = $2";
			$result			= matrix_db_manager::exec_search($sql_query, [$data_string, $id]);
			if ($result===false) {
				$response->msg		= 'Error updating process record';
				$response->errors[]	= 'Update process record fails';
				return $response;
			}

		// Prepare success response
			$response->result		= true;
			$response->msg			= 'Added process item';
			$response->data_item	= $data_item;


		return $response;
	}//end add



	/**
	* STOP
	* Terminate a tracked background process and remove it from the registry.
	*
	* Authorization model:
	*   Only the owning user or DEDALO_SUPERUSER may stop a process. Authorization is
	*   verified against the LOGGED session user (logged_user_id()), NOT against the
	*   $user_id parameter — which is caller-supplied and therefore untrusted.
	*   Passing $user_id = -1 (DEDALO_SUPERUSER) does NOT grant elevated access unless
	*   the logged session actually belongs to the superuser.
	*
	* Flow:
	*   1. Validate inputs.
	*   2. Confirm the logged user matches $user_id or is superuser.
	*   3. Fetch the process list and locate the entry matching (pid, user_id).
	*   4. Query the OS via process::status(); if already gone, clean up and return success.
	*   5. Send SIGTERM via process::stop().
	*   6. On successful kill, call delete_process_item() to remove the DB entry.
	*
	* Returns result=true when the process is no longer running (either it was already
	* stopped or SIGTERM succeeded). Returns result=false on authorization failure,
	* process-not-found, or if the process survived the SIGTERM.
	*
	* @param int $pid     - OS process ID of the process to terminate (must be > 0).
	* @param int $user_id - User ID that owns the process; must match the logged session.
	* @return object $response - stdClass with:
	*   bool   $result — true when the process is no longer running; false on any error.
	*   string $msg    — human-readable status or error description.
	*   array  $errors — list of error tokens (empty on success).
	*/
	public static function stop( int $pid, int $user_id ) : object {

		// Input validation
			if ($pid <= 0) {
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Invalid PID';
				$response->errors = ['invalid pid'];
				return $response;
			}
			if ($user_id < -1) { // -1 is DEDALO_SUPERUSER
				$response = new stdClass();
				$response->result = false;
				$response->msg = 'Invalid user_id';
				$response->errors = ['invalid user_id'];
				return $response;
			}

		// Initialize response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// Constants
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// Authorization check: Only the process owner or the superuser can stop a process.
			// SECURITY: the privileged path MUST be gated by the LOGGED session,
			// not by the $user_id parameter (which the caller fully controls via rqo).
			// A previous version skipped the check whenever $user_id===DEDALO_SUPERUSER,
			// letting any logged user pass options.user_id=-1 and stop superuser processes.
			$logged_user_id	= logged_user_id();
			$is_superuser	= ((int)$logged_user_id === DEDALO_SUPERUSER);
			if ($logged_user_id === null || (!$is_superuser && $user_id !== $logged_user_id)) {
				debug_log(__METHOD__
					. " user id is not the current user logged" . PHP_EOL
					. ' user_id: ' . $user_id . PHP_EOL
					. ' logged_user_id: ' . to_string($logged_user_id)
					, logger::ERROR
				);
				$response->result	= false;
				$response->errors[] = 'invalid user';
				return $response;
			}

		// Fetch process list from database
			$sql_query	= 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE';
			$res = matrix_db_manager::exec_search($sql_query, [$id]);
			$num_rows	= $res===false ? 0 : pg_num_rows($res);

		// Handle empty database case
			if ($num_rows<1) {
				debug_log(__METHOD__
					. " Unable to stop process. Database data is empty"
					, logger::WARNING
				);
				$response->result	= false;
				$response->errors[] = 'empty database';
				return $response;
			}

		// Parse the stored data
			$row	= pg_fetch_result($res, 0, 0);
			$json_data = json_decode($row);
			if (json_last_error() !== JSON_ERROR_NONE) {
				debug_log(__METHOD__
					. " Unable to decode JSON data: " . json_last_error_msg()
					, logger::ERROR
				);
				$response->result	= false;
				$response->errors[] = 'json decode error';
				return $response;
			}
			$data = is_array($json_data) ? $json_data : [];

		// Double check parsed data
			if (empty($data)) {
				debug_log(__METHOD__
					. " Unable to stop process. Database row data is empty"
					, logger::WARNING
				);
				$response->result	= false;
				$response->errors[] = 'empty database row';
				return $response;
			}

		// Locate the registry entry for this (pid, user_id) pair.
			// Both fields must match so that user A cannot stop user B's process by
			// supplying B's PID — the user_id from the registry is the authoritative owner.
			// Sample registry entry shape:
			// {
			// 	"pid": 98018,
			// 	"date": "2024-05-22 18:30:34",
			// 	"pfile": "process_-1_2024-05-22_18-30-34_384731397978791",
			// 	"user_id": -1
			// }
			$found = array_find($data, function($el) use($pid, $user_id){
				return $el->pid===$pid && $el->user_id===$user_id;
			});
			if(!is_object($found)) {
				debug_log(__METHOD__
					. " Unable to locate requested process" . PHP_EOL
					. ' user_id: ' . $user_id . PHP_EOL
					. ' pid: ' . $pid
					, logger::WARNING
				);
				$response->result	= false;
				$response->errors[] = 'process not found';
				return $response;
			}

		// Check the actual system status of the process
			$process = new process();
			$process->setPid($pid);
			$status = $process->status();

			// If the process is no longer active in the OS, just clean up our tracking record
				if ($status===false) {

					processes::delete_process_item($pid, $user_id);

					$response->result	= true;
					$response->msg		= 'Process is already stopped';
					return $response;
				}

		// Attempt to stop the process
			$result = $process->stop();

		// If successful, remove it from our internal database tracking
			if ($result===true) {
				processes::delete_process_item($pid, $user_id);
			}

		// Prepare final response
			$response->result	= $result;
			$response->msg = $result===false
				? 'Error stopping process'
				: 'OK. Process is stopped';


		return $response;
	}//end stop



	/**
	* DELETE_PROCESS_ITEM
	* Remove a single process entry from the registry JSON array.
	*
	* Loads the registry row with FOR UPDATE, filters out the entry whose (pid, user_id)
	* pair matches the arguments, and writes the remaining items back. If the entry is
	* not present (already removed), the write still succeeds — no error is raised.
	*
	* Authorization is enforced against the logged session (same rule as stop()):
	* the $user_id parameter is caller-supplied and cannot be used alone to grant access.
	* Superusers (DEDALO_SUPERUSER) may delete any user's entry.
	*
	* Called internally by stop() after a successful SIGTERM, and by stop() after
	* confirming the process has already exited.
	*
	* @param int $pid     - OS process ID of the entry to remove (must be > 0).
	* @param int $user_id - User ID that owns the entry; must match the logged session or be superuser.
	* @return bool - true when the operation succeeded (entry removed or was absent); false on error.
	*/
	public static function delete_process_item( int $pid, int $user_id ) : bool {

		// Input validation
			if ($pid <= 0) {
				return false;
			}
			if ($user_id < -1) { // -1 is DEDALO_SUPERUSER
				return false;
			}

		// Ensure the operating user is authorized (owner or superuser).
			// SECURITY: gated by the LOGGED session, not by the $user_id parameter.
			// Same fix as processes::stop — $user_id is caller-controlled.
			$logged_user_id	= logged_user_id();
			$is_superuser	= ((int)$logged_user_id === DEDALO_SUPERUSER);
			if ($logged_user_id === null || (!$is_superuser && $user_id !== $logged_user_id)) {
				debug_log(__METHOD__
					. " user id is not the current user logged" . PHP_EOL
					. ' user_id: ' . $user_id . PHP_EOL
					. ' logged_user_id: ' . to_string($logged_user_id)
					, logger::ERROR
				);
				return false;
			}

		// Local aliases for the table constants — improves readability in SQL strings below
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// Fetch the row with a lock
			$sql_query = 'SELECT data FROM "'.$table.'" WHERE id = $1 FOR UPDATE';
			$res = matrix_db_manager::exec_search($sql_query, [$id]);
			$num_rows	= $res===false ? 0 : pg_num_rows($res);
			if ($num_rows<1) {
				return false;
			}

			$row	= pg_fetch_result($res, 0, 0);
			$json_data = json_decode($row);
			if (json_last_error() !== JSON_ERROR_NONE || !is_array($json_data)) {
				return false;
			}
			$data = $json_data;

		// Filter out the target process
		$new_data = [];
		foreach ($data as $value) {
			if ($value->pid===$pid && $value->user_id===$user_id) {
				// skip this one
				continue;
			}
			$new_data[] = $value;
		}

		// Save the modified list
		$data_string	= json_encode($new_data);
		$sql_query		= "UPDATE \"".$table."\" SET data = $1 WHERE id = $2";
		$result			= matrix_db_manager::exec_search($sql_query, [$data_string, $id]);
		if ($result===false) {
			return false;
		}

		return true;
	}//end delete_process_item



	/**
	* GET_PROCESS_ITEM
	* Look up a tracked process by PID and return its full registry entry.
	*
	* Reads the registry row (no row-level lock — read-only lookup) and scans the JSON
	* array for an entry whose 'pid' field equals $pid. An optional $pfile argument
	* narrows the match further; this is used by dd_utils_api when both the PID and the
	* output filename are available from the client request.
	*
	* The returned object includes the owning user_id, which the caller must check
	* against the logged session before allowing access to the process output file.
	* This method itself does NOT enforce any authorization check — that responsibility
	* lies with the caller.
	*
	* Returns null (not an exception) when the row is absent, JSON is malformed,
	* or no matching entry is found.
	*
	* @param int         $pid   - OS process ID to look up (must be > 0; returns null immediately for ≤ 0).
	* @param string|null $pfile = null - if provided, the entry's 'pfile' field must also match.
	* @return object|null - the matching process-entry object, or null if not found.
	*/
	public static function get_process_item( int $pid, ?string $pfile = null ) : ?object {

		if ($pid <= 0) {
			return null;
		}

		$id		= self::RECORD_ID;
		$table	= self::PROCESSES_TABLE;

		$sql_query	= 'SELECT data FROM "'.$table.'" WHERE id = $1';
		$res		= matrix_db_manager::exec_search($sql_query, [$id]);
		$num_rows	= $res===false ? 0 : pg_num_rows($res);
		if ($num_rows<1) {
			return null;
		}

		$row		= pg_fetch_result($res, 0, 0);
		$json_data	= json_decode($row);
		if (json_last_error() !== JSON_ERROR_NONE || !is_array($json_data)) {
			return null;
		}

		foreach ($json_data as $entry) {
			if (!is_object($entry) || ($entry->pid ?? null) !== $pid) {
				continue;
			}
			if ($pfile !== null && ($entry->pfile ?? null) !== $pfile) {
				continue;
			}
			return $entry;
		}

		return null;
	}//end get_process_item



}//end class processes

