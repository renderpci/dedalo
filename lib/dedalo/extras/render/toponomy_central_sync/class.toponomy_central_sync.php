<?php  


/**
* TOPONOMY_CENTRAL_SYNC
*/
class toponomy_central_sync {


	private $ar_authorized_ip = array('127.0.0.1','192.168.0.7','188.79.70.56');


	/**
	* INSERT_TS
	* @return 
	*/
	public function insert_ts( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';


		$options = new stdClass();
			$options->user_id 	= null;
			$options->user_name = null;
			$options->entity 	= null;
			$options->parent 	= null;
			$options->prefix 	= null;
			$options->esmodelo 	= null;
			$options->ip 		= null;
			$options->date 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		#
		# IP SOURCE VALIDATION
		/*
		if (!in_array($options->ip, $this->ar_authorized_ip)) {
			$response->result 	= false;
			$response->msg 		= "Error. Unauthorized ip source. Please contact your system admnistrator ($options->ip)";
			return $response;
		}
		*/

		#
		# PREFIX VALIDATION
		if ( !$this->is_valid_tld($options->prefix) ) {
			$response->result 	= false;
			$response->msg 		= "Error. Invalid tld ($options->prefix). Please contact your system admnistrator";
			return $response;
		}

		$propiedades = json_encode( array($options) );
		
		#
		# LETS DO IT
		$RecordObj_ts 	= new RecordObj_ts(NULL,$options->prefix);
			# Defaults
			$RecordObj_ts->set_esdescriptor('si');
			$RecordObj_ts->set_visible('si');
			$RecordObj_ts->set_usableIndex('si');
			$RecordObj_ts->set_parent($options->parent);
			$RecordObj_ts->set_esmodelo($options->esmodelo);
			$RecordObj_ts->set_propiedades( $propiedades );
		
		# SAVE : After save, we can recover new created terminoID (prefix+autoIncrement)
		$created_id_ts = $RecordObj_ts->Save();
		
		# TERMINOID : Seleccionamos el último terminoID recien creado
		$terminoID	= $RecordObj_ts->get_terminoID();

		$response->msg 		= "Term $terminoID was created successfully";
		$response->result 	= true;
		$response->terminoID= $terminoID;

		return $response;		
	}#end insert_ts



	/**
	* UPDATE_TS
	* @return 
	*/
	public function update_ts( $request_options ) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';	


		$options = new stdClass();
			$options->user_id 	= null;
			$options->user_name = null;
			$options->entity 	= null;
			$options->parent 	= null;
			$options->prefix 	= null;		
			$options->termino 	= null;
			$options->lang 		= null;
			$options->ip 		= null;
			$options->date 		= null;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}


		#
		# IP SOURCE VALIDATION
		/*
		if (!in_array($options->ip, $this->ar_authorized_ip)) {
			$response->result 	= false;
			$response->msg 		= "Error. Unauthorized ip source. Please contact your system admnistrator ($options->ip)";
			return $response;
		}
		*/

		#
		# PREFIX VALIDATION
		if ( !$this->is_valid_tld($options->prefix) ) {
			$response->result 	= false;
			$response->msg 		= "Error. Invalid tld ($options->prefix). Please contact your system admnistrator";
			return $response;
		}
		
		#
		# LETS DO IT
		$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($options->parent);
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL, $options->parent, $options->lang, $tipo='termino');
		$RecordObj_descriptors->set_dato($options->termino);

		/*
		if (!empty($created_terminoID)) {
			
			$id = $RecordObj_ts->terminoID2id($created_terminoID);				

			$RecordObj_ts->set_ID($id);
			$RecordObj_ts->set_terminoID($created_terminoID);
			$RecordObj_ts->set_force_insert_on_save(true);

			#dump($id, ' id ++ '.to_string($created_terminoID)); 
			#dump($RecordObj_ts, ' RecordObj_ts ++ '.to_string());
			#die();
		}
		*/

		$RecordObj_descriptors->Save();

		#
		# PROPIEDADES ADD
		$RecordObj_ts 	 = new RecordObj_ts($options->parent);
			$propiedades = $RecordObj_ts->get_propiedades();
			$propiedades = json_decode($propiedades);
			if ($propiedades && is_array($propiedades)) {
				
				// Add to existing array
				$propiedades[] = json_encode($options);

			}else{

				// Create new
				$propiedades = array($options);				
			}

			$RecordObj_ts->set_propiedades( json_encode($propiedades) );
		
		# SAVE : After save, we can recover new created parent (prefix+autoIncrement)
		$created_id_ts = $RecordObj_ts->Save();


		$response->msg 		= "Term $terminoID ($options->termino) was updated successfully";
		$response->result 	= true;
		
		return $response;		
	}#end update_ts



	/**
	* IS_VALID_TLD
	* @param string $prefix
	* @return bool
	*/
	public function is_valid_tld( $prefix ) {
			
		$jerarquia_tipo = (int)Jerarquia::get_tipo_from_prefix( $prefix );
			#dump($jerarquia_tipo, ' jerarquia_tipo ++ '.to_string());	
		
		if ($jerarquia_tipo==2) {
			return true;		
		}		
		
		debug_log(__METHOD__." Prefix tested is not of type toponymy ".to_string(), logger::DEBUG);
		return false;
	}#end is_valid_tld



	/**
	* DEDALO_LOGIN
	* @return object $response
	* WORKING HERE.....
	*/
	public static function dedalo_login() {
		$response = new stdClass();

		$options = new stdClass();
			$options->auth_code 	='364rkls9kAf97qP';
			#$options->source_ip 	='localhost'; # optional
			$options->activity_info = 'toponomy_central_sync';

		$rest_response = (object)login::rest_login( $options );
		if ($rest_response->logged !== true) {
			$response->logged = false;
			$response->msg 	  = "<warning>Sorry. No rest login</warning>";
			return $response;
		}

		$response->logged = true;
		$response->msg 	  = "User logged [2]";
		return $response;
	}#end dedalo_login




}//end toponomy_central_sync


?>