<?php declare(strict_types=1);
/**
* PROCESSES
*
*
*/
class processes {



	const PROCESSES_TABLE	= 'matrix_notifications';
	const RECORD_ID			= 2;



	/**
	* ADD
	* @param int $user_id
	* @param int $pid
	* @param string $pfile
	* @return object $response
	*/
	public static function add( int $user_id, int $pid, string $pfile ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// load current db elements
			$strQuery	= 'SELECT datos FROM "'.$table.'" WHERE id = '.$id;
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= $res===false ? 0 : pg_num_rows($res);

			// create first row if empty record
			if ($num_rows<1) {
				$dato		= '[]';
				$strQuery	= "INSERT INTO \"$table\" (id, datos) VALUES ($1, $2)";
				$result		= pg_query_params(DBi::_getConnection(), $strQuery, [$id, $dato]);
				if ($result===false) {
					$response->msg		= 'Error creating new record';
					$response->errors[]	= 'Create new record fails';
					return $response;
				}
			}else{
				$dato = pg_fetch_result($res, 0, 0);
			}
			$dato = json_decode($dato) ?? [];

		// check already exists
			$found_row = array_find($dato, function($el) use($user_id, $pid){
				return $el->pid === $pid && $el->user_id === $user_id;
			});
			if (!empty($found_row)) {
				$response->msg		= 'Process '.$pid.' already exits';
				return $response;
			}

		// create a new data item
			$data_item = (object)[
				'user_id'	=> $user_id,
				'pid'		=> $pid,
				'pfile'		=> $pfile,
				'date'		=> dd_date::get_timestamp_now_for_db()
			];
			$dato[] = $data_item;

			$dato_string	= json_encode($dato);		// Convert again to text before save to database
			$strQuery		= "UPDATE \"".$table."\" SET datos = $1 WHERE id = $2";
			$result			= pg_query_params(DBi::_getConnection(), $strQuery, [$dato_string, $id]);
			if ($result===false) {
				$response->msg		= 'Error updating process record';
				$response->errors[]	= 'Update process record fails';
				return $response;
			}

		// response
			$response->result		= true;
			$response->msg			= 'Added process item';
			$response->data_item	= $data_item;


		return $response;
	}//end add



	/**
	* STOP
	* Kill process by PID checking if current user is authorized to do it
	* @param int $pid
	* @param int $user_id
	* @return object $response
	*/
	public static function stop( int $pid, int $user_id ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->errors	= [];

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// limit user. Only owner or root can stop a process
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

		// search in DDB
			$strQuery	= 'SELECT datos FROM "'.$table.'" WHERE id = '.$id;
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= $res===false ? 0 : pg_num_rows($res);

		// check empty
			if ($num_rows<1) {
				debug_log(__METHOD__
					. " Unable to stop process. Database data is empty"
					, logger::WARNING
				);
				$response->result	= false;
				$response->errors[] = 'empty database';
				return $response;
			}

		// parse data
			$row	= pg_fetch_result($res, 0, 0);
			$data	= json_decode($row) ?? [];

		// check empty
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

		// run command. Like "kill -9 $pid";
			$process = new process();
			$process->setPid($pid);
			$status = $process->status();

			// process is not active case
				if ($status===false) {

					processes::delete_process_item($pid, $user_id);

					$response->result	= true;
					$response->msg		= 'Process is already stopped';
					return $response;
				}

		// stop
			$result = $process->stop();

		// delete DB record
			if ($result===true) {
				processes::delete_process_item($pid, $user_id);
			}

		// response
			$response->result	= $result;
			$response->msg = $result===false
				? 'Error stopping process'
				: 'OK. Process is stopped';


		return $response;
	}//end stop



	/**
	* DELETE_PROCESS_ITEM
	* @param int $pid
	* @return bool
	*/
	public static function delete_process_item( int $pid, int $user_id ) : bool {

		// limit user. Only owner or root can stop a process
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

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::PROCESSES_TABLE;

		// select
			$strQuery	= 'SELECT datos FROM "'.$table.'" WHERE id = '.$id;
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= $res===false ? 0 : pg_num_rows($res);
			if ($num_rows<1) {
				return false;
			}

			$row	= pg_fetch_result($res, 0, 0);
			$data	= json_decode($row) ?? [];
			if (empty($data)) {
				return false;
			}

		$new_data = [];
		foreach ($data as $value) {
			if ($value->pid===$pid) {
				// ignore
				continue;
			}
			$new_data[] = $value;
		}

		$dato_string	= json_encode($new_data); // Convert to text before save to database
		$strQuery		= "UPDATE \"".$table."\" SET datos = $1 WHERE id = $2";
		$result			= pg_query_params(DBi::_getConnection(), $strQuery, [$dato_string, $id]);
		if ($result===false) {
			return false;
		}

		return true;
	}//end delete_process_item



}//end class processes

