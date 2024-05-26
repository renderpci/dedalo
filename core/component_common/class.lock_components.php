<?php
declare(strict_types=1);
/**
* LOCK_COMPONENTS
*
*
*/
class lock_components {



	const LOCK_COMPONENTS_TABLE		= 'matrix_notifications';
	const MAXIMUN_LOCK_EVENT_TIME	= 5; // hours
	const RECORD_ID					= 1;



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* @param object $event_element
	* sample:
	* {
	*	"section_id": "1",
	*	"section_tipo": "rsc167",
	*	"component_tipo": "rsc27",
	*	"action": "focus",
	*	"user_id": 1,
	*	"full_username": "Render user",
	*	"date": "2023-11-09 20:23:44"
	* }
	* @return object $response
	*/
	public static function update_lock_components_state( object $event_element ) : object {

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed';
				$response->dato		= null;
				$response->in_use	= false;

		$update_lock_elements = true;	// Default is true

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements
			$strQuery	= "SELECT datos FROM \"$table\" WHERE id = $id LIMIT 1";
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= pg_num_rows($res);

			// create first row if empty table
			if ($num_rows<1) {
				$dato		= '[]';
				$strQuery	= "INSERT INTO \"$table\" (id, datos) VALUES ($1, $2)";
				pg_query_params(DBi::_getConnection(), $strQuery, [$id, $dato]);
			}else{
				$dato = pg_fetch_result($res, 0, 0);
			}
			$dato = json_decode($dato) ?? [];

		// switch action
			$new_dato = [];
			switch ($event_element->action) {

				case 'focus':
					foreach ($dato as $key => $current_event_element) {

						if ($current_event_element->user_id==$event_element->user_id) {

							// same user (reset) delete all from this section
							if (   $current_event_element->section_id==$event_element->section_id
								&& $current_event_element->section_tipo===$event_element->section_tipo
								) {

								unset($dato[$key]);
							}

						}else{

							// different user . advice if component is already selected
							if (   $current_event_element->section_id==$event_element->section_id
								&& $current_event_element->section_tipo===$event_element->section_tipo
								&& $current_event_element->component_tipo===$event_element->component_tipo
								) {

								// update_lock_elements
									$update_lock_elements = false;

								// response
									$response->result = false;
									$response->msg 	  = sprintf(label::get_label('component_in_use'),''.$current_event_element->full_username.'');
									$response->dato   = $dato;
									$response->in_use = true;
								break; // stop loop here
							}
						}
					}
					// fix dato
					$new_dato = array_merge( (array)$dato, array($event_element) );
					break;

				case 'blur':
					foreach ($dato as $key => $current_event_element) {

						if (   $current_event_element->section_id==$event_element->section_id
							&& $current_event_element->section_tipo===$event_element->section_tipo
							&& $current_event_element->component_tipo===$event_element->component_tipo
							&& $current_event_element->user_id==$event_element->user_id
							) {

							unset($dato[$key]);
						}
					}
					// fix dato
					$new_dato = $dato;
					break;

				case 'delete_user_section_locks':
					foreach ($dato as $key => $current_event_element) {

						if (
							// $current_event_element->section_id==$event_element->section_id &&
							$current_event_element->section_tipo===$event_element->section_tipo &&
							$current_event_element->user_id==$event_element->user_id
							) {
							// debug_log(__METHOD__." Deleting (unset) dato key $key ".to_string($dato[$key]), logger::DEBUG);

							unset($dato[$key]);
						}
					}
					// fix dato
					$new_dato = $dato;
					break;

				default:
					// update_lock_elements
						$update_lock_elements = false;

					// response
						$response->result = false;
						$response->msg 	  = "Error event_element->action not valid ($event_element->action)";

					debug_log(__METHOD__." $response->msg ", logger::ERROR);
					break;
			}

		// delete old elements of current user
			// $ara_properties = array('user_id','section_id','section_tipo');
			// foreach ($dato as $key => $current_event_element) {

			// 	# BLUR ACTION
			// 	if ($event_element->action=='blur') {

			// 		if (   $current_event_element->section_id==$event_element->section_id
			// 			&& $current_event_element->section_tipo==$event_element->section_tipo
			// 			&& $current_event_element->component_tipo==$event_element->component_tipo
			// 			//&& $current_event_element->user_id==$event_element->user_id
			// 			) {
			// 			unset($dato[$key]);
			// 			//$add_element=false;
			// 		}
			// 	}

			// 	if ($current_event_element->user_id==$event_element->user_id) {

			// 		# SAME USER
			// 		if (   $current_event_element->section_id==$event_element->section_id
			// 			&& $current_event_element->section_tipo==$event_element->section_tipo
			// 			) {
			// 			unset($dato[$key]);
			// 		}

			// 	}else{

			// 		# DIFFERENT USER
			// 		if ($current_event_element->section_id==$event_element->section_id &&
			// 			$current_event_element->section_tipo==$event_element->section_tipo &&
			// 			$current_event_element->component_tipo==$event_element->component_tipo
			// 			) {
			// 			//$response = "Error. User ".$event_element->full_username." is using this field. Please wait to finish";
			// 			$response = sprintf(label::get_label('component_in_use'),$event_element->full_username);
			// 			return $response;
			// 		}
			// 	}
			// }//end foreach ($dato as $key => $current_event_element) {

		// update_lock_elements
			if ($update_lock_elements===true) {

				// recreate dato array keys
					$new_dato	= array_values($new_dato);	// Recreate array keys to avoid produce json objects instead array
					$new_dato	= json_encode($new_dato);		// Convert again to text before save to database
					$strQuery	= "UPDATE \"$table\" SET datos = $1 WHERE id = $2";
					// sync mode
					pg_send_query_params(DBi::_getConnection(), $strQuery, [$new_dato, $id]);
					pg_get_result(DBi::_getConnection());

				// response
					$response->result = true;
					$response->msg 	  = 'Updated db lock elements';
					$response->dato   = $dato;
			}//end if ($update_lock_elements===true)


		return $response;
	}//end update_lock_components_state



	/**
	* EQUAL_ELEMENTS
	* @param object $event_element
	* @param object $event_element2
	* @return bool
	*/
	protected static function equal_elements( object $event_element, object $event_element2 ) : bool {

		if ($event_element->section_id == $event_element2->section_id &&
			$event_element->section_tipo === $event_element2->section_tipo &&
			$event_element->component_tipo === $event_element2->component_tipo &&
			$event_element->action === $event_element2->action
			) {
			return true;
		}

		return false;
	}//end equal_elements



	/**
	* FORCE_UNLOCK_ALL_COMPONENTS
	* @param int|string|null $user_id
	* @return object $response
	*/
	public static function force_unlock_all_components( $user_id=null ) : object {

		$response = new stdClass();

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements
			$strQuery	= "SELECT datos FROM \"$table\" WHERE id = $id LIMIT 1";
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= pg_num_rows($res);

		// create first row on empty table
		if ($num_rows<1) {

			// response false
				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);

			debug_log(__METHOD__
				." $response->msg "
				, logger::DEBUG
			);

		}else{

			$dato	= pg_fetch_result($res, 0, 0);
			$dato	= (array)json_decode($dato);

			$removed_elements=0;
			foreach ($dato as $key => $current_event_element) {

				if (isset($current_event_element->action) && $current_event_element->action==='focus') {

					if ( empty($user_id) ) {
						// All elements
						// debug_log(__METHOD__." Deleting element from all users ".to_string($current_event_element), logger::DEBUG);
						unset($dato[$key]);
						$removed_elements++;

					}else{

						if ( $current_event_element->user_id==$user_id ) {
							// Only selected user elements (all sections)
							debug_log(__METHOD__
								." Deleting element from user $user_id ".to_string($current_event_element)
								, logger::DEBUG
							);
							unset($dato[$key]);
							$removed_elements++;
						}
					}//end if (empty($user_id)) {
				}
			}//end foreach ($dato as $key => $current_event_element)

			// Recreate dato array keys
				$new_dato	= array_values($dato); // Recreate array keys to avoid produce JSON objects instead array
				$new_dato	= json_encode($new_dato); // Convert again to text before save to database
				$strQuery	= "UPDATE \"$table\" SET datos = $1 WHERE id = $2";
				pg_send_query_params(DBi::_getConnection(), $strQuery, [$new_dato, $id]);
				$res = pg_get_result(DBi::_getConnection());

			// response OK
				$response->result	= true;
				$response->msg		= "Updated db lock elements. Removed $removed_elements elements";
		}


		return $response;
	}//end force_unlock_all_components



	/**
	* GET_ACTIVE_USERS
	* @return object $response
	*/
	public static function get_active_users() : object {

		$response = new stdClass();

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements
			$strQuery	= "SELECT datos FROM \"$table\" WHERE id = $id LIMIT 1";
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= pg_num_rows($res);


		// create first row on empty table
		if ($num_rows<1) {

			// response false
				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);

			debug_log(__METHOD__
				." $response->msg "
				, logger::DEBUG
			);

		}else{

			$dato	= pg_fetch_result($res, 0, 0);
			$dato	= (array)json_decode($dato);

			$ar_user_actions = array();
			foreach ($dato as $current_event_element) {

				if (isset($current_event_element->action) && $current_event_element->action==='focus') {

					$ar_user_actions[] = $current_event_element;
				}
			}
			$response->ar_user_actions = $ar_user_actions;

			// Recreate dato array keys
				// $new_dato = array_values($dato);		// Recreate array keys to avoid produce JSON objects instead array
				// $new_dato = json_encode($new_dato);		// Convert again to text before save to database
				// $strQuery = "UPDATE \"".$table."\" SET datos = $1 WHERE id = $2";
				// #$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));
				// pg_send_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));
				// $res = pg_get_result(DBi::_getConnection());

			// response OK
				$response->result	= true;
				$response->msg		= sprintf("Active users focus elements: %s", count($ar_user_actions) );
		}


		return $response;
	}//end get_active_users



	/**
	* GET_ACTIVE_USERS_FULL
	* @return array $ar_user_actions
	*/
	public static function get_active_users_full() : array {

		$active_users_response = lock_components::get_active_users();

		$ar_user_actions = [];
		if ($active_users_response->result===true && !empty($active_users_response->ar_user_actions)) {
			foreach ($active_users_response->ar_user_actions as $current_event_element) {

				$item = clone $current_event_element;

				// add some useful information
					$item->component_model	= RecordObj_dd::get_modelo_name_by_tipo($current_event_element->component_tipo, true);
					$item->component_label	= RecordObj_dd::get_termino_by_tipo($current_event_element->component_tipo, DEDALO_DATA_LANG, true);
					$item->section_label	= RecordObj_dd::get_termino_by_tipo($current_event_element->section_tipo, DEDALO_DATA_LANG, true);

				$ar_user_actions[] = $item;
			}
		}


		return $ar_user_actions;
	}//end get_active_users_full



	/**
	* CLEAN_LOCKS_GARBAGE
	* Event format
	* {
	*     "date": "2017-02-23 11:43:34",
	*     "action": "focus",
	*     "user_id": -1,
	*     "section_id": "1",
	*     "section_tipo": "dd234",
	*     "full_username": "Debug user",
	*     "component_tipo": "dd249"
	* }
	* @return object $response
	*/
	public static function clean_locks_garbage() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed clean_locks_garbage';

		// short vars
			$id		= self::RECORD_ID;
			$table	= self::LOCK_COMPONENTS_TABLE;

		// load current db elements
			$strQuery	= "SELECT datos FROM \"$table\" WHERE id = $id LIMIT 1";
			$res		= JSON_RecordObj_matrix::search_free($strQuery, true);
			$num_rows	= pg_num_rows($res);


		// create FIRST ROW ON EMPTY TABLE
		if ($num_rows<1) {

			// response false
				$response->result	= false;
				$response->msg		= sprintf("Sorry. Record 1 on table %s not found. Ignored action.", $table);

			debug_log(__METHOD__
				." $response->msg "
				, logger::DEBUG
			);

		}else{

			// dato
				$dato	= pg_fetch_result($res, 0, 0);
				$dato	= (array)json_decode($dato);

			// interval
				$hours		= lock_components::MAXIMUN_LOCK_EVENT_TIME;
				$interval	= date_interval_create_from_date_string($hours." hours");
				$now		= new DateTime();

			$new_dato = array();
			$deleted_elements = false;
			foreach ($dato as $event_element) {

				$event_date	= new DateTime($event_element->date);
				$expires	= $event_date->add($interval);
				if ( $expires < $now ) {
					$deleted_elements = true;
					debug_log(__METHOD__
						." Lock event for component: $event_element->component_tipo from ".$event_date->format('Y-m-d H:i:s')." has expired (> $hours hours). Removed from DB "
						, logger::WARNING
					);
				}else{
					$new_dato[] = $event_element;
				}
			}//end foreach

			if ($deleted_elements===true) {
				// Recreate dato array keys
				$new_dato	= array_values($new_dato);	// Recreate array keys to avoid produce JSON objects instead array
				$new_dato	= json_encode($new_dato);	// Convert again to text before save to database
				$strQuery	= "UPDATE \"$table\" SET datos = $1 WHERE id = $2";
				// $result	= pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));
				pg_send_query_params(DBi::_getConnection(), $strQuery, [$new_dato, $id]);
				$res = pg_get_result(DBi::_getConnection());

				// response OK Updated
					$response->result	= true;
					$response->msg		= 'Updated db lock elements. Removed expired events';
			}else{
				// response OK
					$response->result	= true;
					$response->msg		= 'OK';
			}
		}//end if ($num_rows<1)


		return $response;
	}//end clean_locks_garbage



}//end class lock_components
