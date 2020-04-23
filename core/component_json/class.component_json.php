<?php
/*
* CLASS COMPONENT LAYOUT
*
*
*/
class component_json extends component_common {


	# Overwrite __construct var lang passed in this component
	protected $lang = DEDALO_DATA_NOLAN;



	# CONSTRUCT
	public function __construct($tipo=null, $parent=null, $modo='edit', $lang=DEDALO_DATA_NOLAN, $section_tipo=null) {

		# Force always DEDALO_DATA_NOLAN
		$lang = $this->lang;

		# Creamos el componente normalmente
		parent::__construct($tipo, $parent, $modo, $lang, $section_tipo);
	}//end __construct



	/**
	* GET_DATO
	*/
	public function get_dato() {
		// Compressed dato to avoid postgresql change index order
		$dato = parent::get_dato();

		if(!empty($dato) && !is_object($dato) && !is_array($dato)) {
			trigger_error("Error. dato converted to empty object because is not as expected object. ". gettype($dato));
			$dato = new stdClass();
		}

		return $dato;
	}//end get_dato



	/**
	* SET_DATO
	*/
	public function set_dato($dato) {

		if (!empty($dato)) {

			if (is_string($dato)) {
				if (!$dato = json_decode($dato)) {
					trigger_error("Error. Only valid JSON is accepted as dato");
					return false;
				}
			}

			if(!is_object($dato) && !is_array($dato)) {
				trigger_error("Error. Stopped set_dato because is not as expected object. ". gettype($dato));
				return false;
			}
		}

		parent::set_dato( $dato );
	}//end set_dato



	/**
	* GET_VALOR
	* @return
	*/
	public function get_valor() {
		$dato  = $this->get_dato();
		//$valor = json_encode($dato);

		$valor = $dato;

		return $valor;
	}//end get_valor



	/**
	* GET_ALLOWED_EXTENSIONS
	* @return array $allowed_extensions
	*/
	public function get_allowed_extensions() {

		$allowed_extensions = ['json'];

		return $allowed_extensions;
	}//end get_allowed_extensions



	/**
	* UPDATE_DATO_VERSION
	* @return
	*/
	public static function update_dato_version($request_options) {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version = $options->update_version;
			$dato_unchanged = $options->dato_unchanged;
			$reference_id 	= $options->reference_id;


		$update_version = implode(".", $update_version);

		switch ($update_version) {

			case '6.0.0':

				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$new_dato = json_decode($dato_unchanged);

					$response = new stdClass();
					$response->result = 1;
					$response->new_dato = $new_dato;
					$response->msg = "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

					return $response;

				}else{
					$response = new stdClass();
					$response->result = 2;
					$response->msg = "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
					return $response;
				}
				break;
		}
	}//end update_dato_version



	/**
	* ADD_FILE
	* Receive a file info object from tool upload with data properties as:
	* {
	* 	"name": "mydata.json",
	*	"type": "text/json",
	*	"tmp_name": "/private/var/tmp/php6nd4A2",
	*	"error": 0,
	*	"size": 132898
	* }
	* @return object $response
	*/
	public function add_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// file info
			$file_extension = strtolower(pathinfo($file_data->name, PATHINFO_EXTENSION));
	
		// validate extension			
			if (!in_array($file_extension, $this->get_allowed_extensions())) {
				$response->msg  = "Error: " .$file_extension. " is an invalid file type ! ";
				$response->msg .= "Allowed file extensions are: ". implode(', ', $allowed_extensions);
				return $response;
			}		

		// read the uploaded file
			$file_content = file_get_contents($file_data->tmp_name);

		// remove it after store
			unlink($file_data->tmp_name);

		// read content
			if ($value = json_decode($file_content)) {
				
				// uploaded ready file info
				$response->ready 	= (object)[
					'imported_parsed_data' => $value
				];

			}else{

				$response->msg  = "Error: " .$file_data->name. " content is an invalid json data";
				return $response;
			}			

		// all is ok
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done ['.__METHOD__.'] ';
		

		return $response;
	}//end add_file



	/**
	* PROCESS_UPLOADED_FILE
	* @return object $response
	*/
	public function process_uploaded_file($file_data) {

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= 'Error. Request failed ['.__METHOD__.'] ';

		// imported_data. (Is json decoded data from raw uploaded file content)
			$imported_data = $file_data->imported_parsed_data;

		// wrap data with array to maintain component data format
			$dato = [$imported_data];
			$this->set_dato($dato);
		
		// save full dato
			$this->Save();

		$response = new stdClass();
			$response->result 	= true;
			$response->msg 		= 'Ok. Request done';

		return $response;
	}//end process_uploaded_file


				



}//end class
