<?php
/*
	lock_components
*/


class lock_components {


	const LOCK_COMPONENTS_TABLE = 'matrix_notifications';



	/**
	* UPDATE_LOCK_COMPONENTS_STATE
	* @param object $event_elemen
	* @return string $response
	*/
	public static function update_lock_components_state( $event_element ) {

		$response 		  = new stdClass();
		$update_lock_elements = true;	// Default is true

		#
		# LOAD CURRENT DB ELEMENTS
		$id 	  = 1;
		/**/
		$strQuery = "SELECT datos FROM \"".lock_components::LOCK_COMPONENTS_TABLE."\" WHERE id = $id LIMIT 1";
		$res 	  = JSON_RecordObj_matrix::search_free($strQuery, $wait=true);

		/*
		$strQuery = "SELECT datos \"".lock_components::LOCK_COMPONENTS_TABLE."\" WHERE id = $1 LIMIT 1)";
		$res 	  = pg_query_params(DBi::_getConnection(), $strQuery, array($id));
		*/
		/*
		$strQuery = "SELECT datos \"".lock_components::LOCK_COMPONENTS_TABLE."\" WHERE id = $id LIMIT 1)";
		$res = pg_prepare(DBi::_getConnection(), "", $strQuery);
		$res = pg_execute(DBi::_getConnection(), "",array());
		*/
		$num_rows = pg_num_rows($res);


		#
		# CREATE FIRST ROW ON EMPTY TABLE
		if ($num_rows<1) {
			# Create new record
			$dato 		   = '[]';
			$strQuery 	   = "INSERT INTO \"".lock_components::LOCK_COMPONENTS_TABLE."\" (id,datos) VALUES ($1,$2)";
			$insert_result = pg_query_params(DBi::_getConnection(), $strQuery, array(1,$dato));
		}else{
			$dato = pg_fetch_result($res, 0, 0);
				#dump($dato, ' dato ++ '.to_string());
		}

		$dato = (array)json_decode($dato);
		#debug_log(__METHOD__." event_element: ".to_string($event_element), logger::DEBUG);


		#
		# SWITCH ACTION
		switch ($event_element->action) {

			case 'delete_user_section_locks':

				foreach ($dato as $key => $current_event_element) {

					if (   $current_event_element->section_id==$event_element->section_id
						&& $current_event_element->section_tipo==$event_element->section_tipo
						&& $current_event_element->user_id==$event_element->user_id
						) {
						#debug_log(__METHOD__." Deleting (unset) dato key $key ".to_string($dato[$key]), logger::DEBUG);
						unset($dato[$key]);
					}
				}
				$new_dato = $dato;
				break;

			case 'blur':

				foreach ($dato as $key => $current_event_element) {

					if (   $current_event_element->section_id==$event_element->section_id
						&& $current_event_element->section_tipo==$event_element->section_tipo
						&& $current_event_element->component_tipo==$event_element->component_tipo
						&& $current_event_element->user_id==$event_element->user_id
						) {
						unset($dato[$key]);
					}
				}
				$new_dato = $dato;
				break;

			case 'focus':

				foreach ($dato as $key => $current_event_element) {

					if ($current_event_element->user_id==$event_element->user_id) {

						# SAME USER (RESET) DELETE ALL FROM THIS SECTION
						if (   $current_event_element->section_id==$event_element->section_id
							&& $current_event_element->section_tipo==$event_element->section_tipo
							) {
							unset($dato[$key]);
						}

					}else{

						# DIFFERENT USER . ADVICE IF COMPONENT IS ALREADY SELECTED
						if (   $current_event_element->section_id==$event_element->section_id
							&& $current_event_element->section_tipo==$event_element->section_tipo
							&& $current_event_element->component_tipo==$event_element->component_tipo
							) {
							$update_lock_elements = false;

							$response->result = false;
							$response->msg 	  = sprintf(label::get_label('componente_en_uso'),''.$current_event_element->full_username.'');
							$response->dato   = $dato;
							break;
						}
					}
				}
				$new_dato = array_merge( (array)$dato, array($event_element) );
				break;

			default:
				$update_lock_elements = false;
				$response->result = false;
				$response->msg 	  = "Error event_element->action not valid ($event_element->action)";
				debug_log(__METHOD__." Error: event_element->action not defined ".to_string($event_element->action), logger::ERROR);
				break;
		}

		/*
			#
			# DELETE OLD ELEMENTS OF CURRENT USER
			$ara_properties = array('user_id','section_id','section_tipo');
			foreach ($dato as $key => $current_event_element) {

				# BLUR ACTION
				if ($event_element->action=='blur') {

					if (   $current_event_element->section_id==$event_element->section_id
						&& $current_event_element->section_tipo==$event_element->section_tipo
						&& $current_event_element->component_tipo==$event_element->component_tipo
						//&& $current_event_element->user_id==$event_element->user_id
						) {
						unset($dato[$key]);
						//$add_element=false;
					}
				}

				if ($current_event_element->user_id==$event_element->user_id) {

					# SAME USER
					if (   $current_event_element->section_id==$event_element->section_id
						&& $current_event_element->section_tipo==$event_element->section_tipo
						) {
						unset($dato[$key]);
					}

				}else{

					# DIFFERENT USER
					if ($current_event_element->section_id==$event_element->section_id &&
						$current_event_element->section_tipo==$event_element->section_tipo &&
						$current_event_element->component_tipo==$event_element->component_tipo
						) {
						//$response = "Error. User ".$event_element->full_username." is using this field. Please wait to finish";
						$response = sprintf(label::get_label('componente_en_uso'),$event_element->full_username);
						return $response;
					}
				}

			}//end foreach ($dato as $key => $current_event_element) {
			*/


		#
		# update_lock_elements
		if ($update_lock_elements) {

			$new_dato_raw = $new_dato;

			# recreate dato array keys
			$new_dato = array_values($new_dato);	// Recreate array keys to avoid produce json objects instead array
			$new_dato = json_encode($new_dato);		// Convert again to text before save to database
			$strQuery = "UPDATE \"".lock_components::LOCK_COMPONENTS_TABLE."\" SET datos = $1 WHERE id = $2";
			
			#$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));

			# PG_SEND_QUERY is async query
			if (!pg_connection_busy(DBi::_getConnection())) {
				pg_send_query(DBi::_getConnection(), $strQuery);
				$result = pg_get_result(DBi::_getConnection()); # RESULT (pg_get_result for pg_send_query is needed)
			}

			$response->result = true;
			$response->msg 	  = "Updated db lock elements";
			$response->dato   = $dato;
		}

		return $response;

	}#end update_lock_components_state




	/**
	* EQUAL_ELEMENTS
	* @return bool
	*/
	protected static function equal_elements( $event_element, $event_element2 ) {

		if ($event_element->section_id == $event_element2->section_id &&
			$event_element->section_tipo == $event_element2->section_tipo &&
			$event_element->component_tipo == $event_element2->component_tipo &&
			$event_element->action == $event_element2->action
			) {
			return true;
		}

		return false;

	}#end equal_elements


	

	/**
	* FORCE_UNLOCK_ALL_COMPONENTS
	* @return obj $response
	*/
	public static function force_unlock_all_components( $user_id=null ) {

		$response = new stdClass();
		
		#
		# LOAD CURRENT DB ELEMENTS
		$id 	  = 1;
		$strQuery = "SELECT datos FROM \"".lock_components::LOCK_COMPONENTS_TABLE."\" WHERE id = $id LIMIT 1";
		$res 	  = JSON_RecordObj_matrix::search_free($strQuery, $wait=true);
		$num_rows = pg_num_rows($res);

		#
		# CREATE FIRST ROW ON EMPTY TABLE
		if ($num_rows<1) {

			$response->result = false;
			$response->msg 	  = sprintf("Sorry. Record 1 on table %s not found. Ignored action.", lock_components::LOCK_COMPONENTS_TABLE);
			debug_log(__METHOD__." $response->msg ".to_string(), logger::DEBUG);			

		}else{

			$dato = pg_fetch_result($res, 0, 0);
			$dato = (array)json_decode($dato);

			$removed_elements=0;
			foreach ($dato as $key => $current_event_element) {

				if (isset($current_event_element->action) && $current_event_element->action=='focus') {

					if ( empty($user_id) ) {
						# All elements
						# debug_log(__METHOD__." Deleting element from all users ".to_string($current_event_element), logger::DEBUG);	
						unset($dato[$key]);
						$removed_elements++;

					}else{

						if ( $current_event_element->user_id==$user_id ) {
							# Only selected user elements (all sections)
							debug_log(__METHOD__." Deleting element from user $user_id ".to_string($current_event_element), logger::DEBUG);	
							unset($dato[$key]);
							$removed_elements++;
						}

					}//end if (empty($user_id)) {				
				}
			}

			# Recreate dato array keys
			$new_dato = array_values($dato);		// Recreate array keys to avoid produce json objects instead array
			$new_dato = json_encode($new_dato);		// Convert again to text before save to database
			$strQuery = "UPDATE \"".lock_components::LOCK_COMPONENTS_TABLE."\" SET datos = $1 WHERE id = $2";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));

			$response->result = true;
			$response->msg 	  = "Updated db lock elements. Removed $removed_elements elements";
		}		

		return $response;

	}#end force_unlock_all_components



	/**
	* GET_ACTIVE_USERS
	* @return obj $response
	*/
	public static function get_active_users() {
		
		$response = new stdClass();
		
		#
		# LOAD CURRENT DB ELEMENTS
		$id 	  = 1;
		$strQuery = "SELECT datos FROM \"".lock_components::LOCK_COMPONENTS_TABLE."\" WHERE id = $id LIMIT 1";
		$res 	  = JSON_RecordObj_matrix::search_free($strQuery, $wait=true);
		$num_rows = pg_num_rows($res);

		#
		# CREATE FIRST ROW ON EMPTY TABLE
		if ($num_rows<1) {

			$response->result = false;
			$response->msg 	  = sprintf("Sorry. Record 1 on table %s not found. Ignored action.", lock_components::LOCK_COMPONENTS_TABLE);
			debug_log(__METHOD__." $response->msg ".to_string(), logger::DEBUG);			

		}else{

			$dato = pg_fetch_result($res, 0, 0);
			$dato = (array)json_decode($dato);

			$ar_user_actions=array();
			foreach ($dato as $key => $current_event_element) {

				if (isset($current_event_element->action) && $current_event_element->action=='focus') {
					
					$ar_vars = array($current_event_element->full_username,
									 $current_event_element->component_tipo,
									 RecordObj_dd::get_termino_by_tipo($current_event_element->component_tipo),
									 $current_event_element->section_tipo,
									 RecordObj_dd::get_termino_by_tipo($current_event_element->section_tipo),
									 $current_event_element->section_id,
									 );
					$msg = sprintf("User <b>%s</b> is editing component %s <b>%s</b> from section %s <b>%s</b> of record ID <b>%s</b> (%s)",
										$current_event_element->full_username,
										$current_event_element->component_tipo,
										RecordObj_dd::get_termino_by_tipo($current_event_element->component_tipo),
										$current_event_element->section_tipo,
										RecordObj_dd::get_termino_by_tipo($current_event_element->section_tipo),
										$current_event_element->section_id,
										$current_event_element->date
										);
										#dump($msg, ' msg ++ '.to_string());
										
					$ar_user_actions[] = $msg;
				}
			}
			$response->ar_user_actions = $ar_user_actions;

			# Recreate dato array keys
			$new_dato = array_values($dato);		// Recreate array keys to avoid produce json objects instead array
			$new_dato = json_encode($new_dato);		// Convert again to text before save to database
			$strQuery = "UPDATE \"".lock_components::LOCK_COMPONENTS_TABLE."\" SET datos = $1 WHERE id = $2";
			$result   = pg_query_params(DBi::_getConnection(), $strQuery, array( $new_dato, $id ));

			$response->result = true;
			$response->msg 	  = sprintf("Active users focus elements: %s", count($ar_user_actions) );
		}		

		return $response;

	}#end get_active_users



}
