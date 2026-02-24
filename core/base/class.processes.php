<?php declare(strict_types=1);
/**
 * PROCESSES
 *
 * This class manages system process records stored in the database.
 * It provides methods to track active background processes, stop them safely,
 * and maintain a persistent list of process metadata (PID, owner, etc.).
 *
 * Records are stored in the 'matrix_notifications' table under a specific record ID.
 */
class processes {

	/** @var string Table name used for storing process data */
	const PROCESSES_TABLE = 'matrix_notifications';

	/** @var int Constant ID for the process list record */
	const RECORD_ID = 2;



	/**
	 * ADD
	 * Registers a new process in the tracking table.
	 *
	 * @param int $user_id ID of the user who owns the process.
	 * @param int $pid System Process ID (PID).
	 * @param string $pfile Path or descriptor of the process log/file.
	 * @return object $response {
	 *    @var bool   $result    True on success, false otherwise.
	 *    @var string $msg       Operation status message.
	 *    @var array  $errors    List of error descriptions.
	 *    @var object $data_item The newly created process metadata object.
	 * }
	 */
	public static function add( int $user_id, int $pid, string $pfile ) : object {

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
			}else{
				$data = pg_fetch_result($res, 0, 0);
			}

			// Decode JSON data and ensure it's a valid array
			$data = json_decode($data);
			if (!is_array($data)) {
				$data = [];
			}

		// Check if this process is already registered
			$found_row = array_find($data, function($el) use($user_id, $pid){
				return isset($el->pid) && $el->pid === $pid && isset($el->user_id) && $el->user_id === $user_id;
			});
			if (!is_null($found_row)) {
				$response->msg		= 'Process '.$pid.' already exists';
				return $response;
			}

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
	 * Terminates a process by its PID, after verifying that the requesting user
	 * is authorized to do so (must be the owner or a superuser).
	 *
	 * @param int $pid     The system PID to stop.
	 * @param int $user_id The ID of the user requesting the operation.
	 * @return object $response {
	 *    @var bool   $result True if the process was stopped (or was already inactive), false on error.
	 *    @var string $msg    Descriptive status message.
	 *    @var array  $errors List of error descriptions if any.
	 * }
	 */
	public static function stop( int $pid, int $user_id ) : object {

		// Initialize response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// Constants
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// Authorization check: Only the process owner or the superuser can stop a process
			if ($user_id!==DEDALO_SUPERUSER) {
				if ($user_id !== logged_user_id()) {
					debug_log(__METHOD__
						. " user id is not the current user logged" . PHP_EOL
						. ' user_id: ' . $user_id . PHP_EOL
						. ' logged_user_id: ' . logged_user_id()
						, logger::ERROR
					);
					$response->result	= false;
					$response->errors[] = 'invalid user';
					return $response;
				}
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
			$data	= json_decode($row) ?? [];

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

		// search
			// sample data
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
	 * Removes a specific process entry from the tracking list.
	 *
	 * @param int $pid     The system PID of the process to remove.
	 * @param int $user_id The ID of the user who owns the process.
	 * @return bool True if the item was found and removed (or didn't exist), false on error.
	 */
	public static function delete_process_item( int $pid, int $user_id ) : bool {

		// Ensure the operating user is authorized (owner or superuser)
			if ($user_id!==DEDALO_SUPERUSER) {
				if ($user_id !== logged_user_id()) {
					debug_log(__METHOD__
						. " user id is not the current user logged" . PHP_EOL
						. ' user_id: ' . $user_id . PHP_EOL
						. ' logged_user_id: ' . logged_user_id()
						, logger::ERROR
					);
					return false;
				}
			}

		// short context
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
			$data	= json_decode($row);
			if (!is_array($data)) {
				return false;
			}

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



}//end class processes

