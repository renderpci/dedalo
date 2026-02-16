<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INPUT_TEXT
* Manage specific component input text logic
* Common components properties and method are inherited of component_string_common class that are inherited from component_common class
*/
class component_input_text extends component_string_common {



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_data().
	* overwrite in every different specific component
	* Some the text components can set the value with the data directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// records_separator. Set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$properties			= $this->get_properties();
			$records_separator	= isset($ddo->records_separator)
				? $ddo->records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// data
			$data = $this->get_data_lang();

		// flat_value (array of one value full resolved)
			$flat_value = empty($data)
				? []
				: [implode( $records_separator, array_column($data, 'value') )];

		// get the fallback value
			$fallback_value	= $this->get_component_data_fallback(
				$this->get_lang(), // string lang
				DEDALO_DATA_LANG_DEFAULT // string main_lang
			);			

		// flat_fallback_value (array of one value full resolved)
			$flat_fallback_value = empty($fallback_value)
				? []
				: [implode( $records_separator, array_column($fallback_value, 'value') )];

		// class_list
			$class_list = $ddo->class_list ?? null;

		// label
			$label = $this->get_label();

		// value
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($flat_value);
				$dd_grid_cell_object->set_fallback_value($flat_fallback_value);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_LIST_VALUE
	* Overwrites the component_common method adding a special case
	* resolution for time machine mode ('tm') and user Root (-1)
	* @return array
	*/
	public function get_list_value() : ?array {

		$value = parent::get_list_value();

		// Root user special resolution in 'tm' mode.
		// In inspector's 'Component history' the root user is not displayed if not force hard resolution.
		if($this->mode=='tm' && empty($value) && $this->section_tipo===DEDALO_SECTION_USERS_TIPO && $this->section_id==-1) {
			$value = [(object)[
				'value' => 'Root',
				'lang' => $this->lang
			]];
		}

		return $value;
	}//end get_list_value



	/**
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->data_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* @param string $column_name
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// object | array case
			// Check if is a JSON string. Is yes, decode
			// if data is a object | array it will be the Dédalo format and it's not necessary processed
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				$response->result	= $data_from_json;
				$response->msg		= 'OK';

				return $response;
			}

		// string case
			// check the begin and end of the value string, if it has a [] or other combination that seems array
			// sometimes the value text could be [Ac], as numismatic legends, it's admit, but if the text has [" or "] it's not admitted.
			$begins_one	= substr($import_value, 0, 1);
			$ends_one	= substr($import_value, -1);
			$begins_two	= substr($import_value, 0, 2);
			$ends_two	= substr($import_value, -2);

			if (($begins_two !== '["' && $ends_two !== '"]') ||
				($begins_two !== '["' && $ends_one !== ']') ||
				($begins_one !== '[' && $ends_two !== '"]')
				){
				$value = !empty($import_value) || $import_value==='0'
					? [$import_value]
					: null;
			}else{
				// import value seems to be a JSON malformed.
				// it begin [" or end with "]
				// log JSON conversion error
				debug_log(__METHOD__
					." Invalid JSON value, seems a syntax error: ". PHP_EOL
					.' import_value: ' . json_encode($import_value, JSON_PRETTY_PRINT)
					, logger::ERROR
				);

				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= stripslashes( $import_value );
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
				$response->errors[] = $failed;

				return $response;
			}

		$response->result	= $value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class component_input_text
