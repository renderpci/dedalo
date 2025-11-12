<?php declare(strict_types=1);
/**
* CLASS COMPONENT_INPUT_TEXT
* Manage specific component input text logic
* Common components properties and method are inherited of component_string_common class that are inherited from component_common class
*/
class component_input_text extends component_string_common {



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_dato().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
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
			$data			= $this->get_data_lang() ?? [];
			$fallback_value	= $this->extract_component_dato_fallback(
				$this->get_lang(), // string lang
				DEDALO_DATA_LANG_DEFAULT // string main_lang
			);

		// flat_value (array of one value full resolved)
			$flat_value = empty($data)
				? []
				: [implode( $records_separator, array_column($data, 'value') )];

		// flat_fallback_value (array of one value full resolved)
			$flat_fallback_value = [implode($records_separator, $fallback_value)];

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
	* GET_VALOR
	* Return array dato as comma separated elements string by default
	* If index var is received, return dato element corresponding to this index if exists
	* @return string|null $valor
	*/
	public function get_valor(?string $lang=DEDALO_DATA_LANG, $index='all') : ?string {

		$valor ='';

		$dato = $this->get_dato();
		if(empty($dato)) {
			return (string)$valor;
		}

		if ($index==='all') {
			$ar = array();
			foreach ($dato as $value) {

				if (is_string($value)) {
					$value = trim($value);
				}

				if (!empty($value)) {
					$ar[] = $value;
				}
			}
			if (count($ar)>0) {
				// $valor = implode(',',$ar);
				$valor = implode(' | ', $ar);
			}
		}else{
			$index = (int)$index;
			$valor = isset($dato[$index]) ? $dato[$index] : null;
		}


		return $valor;
	}//end get_valor



	// /**
	// * GET_VALOR_EXPORT
	// * Return component value sent to export data
	// * @return string $valor
	// */
	// public function get_valor_export($valor=null, $lang=DEDALO_DATA_LANG, $quotes=null, $add_id=null) {

	// 	if (empty($valor)) {

	// 		$valor = $this->get_valor($lang);

	// 	}else{

	// 		// Add value of current lang to nolan data
	// 		if ($this->with_lang_versions===true) {

	// 			$component = $this;
	// 			$component->set_lang($lang);
	// 			$add_value = $component->get_valor($lang);
	// 			if (!empty($add_value) && $add_value!==$valor) {
	// 				$valor .= ' ('.$add_value.')';
	// 			}
	// 		}
	// 	}

	// 	if (empty($valor)) {
	// 		$valor = $this->extract_component_value_fallback(
	// 			DEDALO_DATA_LANG, // lang
	// 			true, // mark
	// 			DEDALO_DATA_LANG_DEFAULT // main_lang
	// 		);
	// 	}

	// 	return to_string($valor);
	// }//end get_valor_export



	/**
	* GET_DIFFUSION_VALUE
	* Calculate current component diffusion value for target field (usually a MYSQL field)
	* Used for diffusion_mysql to unify components diffusion value call
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		// lang empty case. Apply default
			if (empty($lang)) {
				$lang = DEDALO_DATA_LANG;
			}

		// Default behavior is get value in given lang
			$diffusion_value = $this->get_valor($lang);

		// fallback
			if (empty($diffusion_value)) {
				if ($this->translatable===false) {
					$this->set_lang(DEDALO_DATA_NOLAN);
					$diffusion_value = $this->get_valor(DEDALO_DATA_NOLAN);
				}else{
					$all_project_langs = common::get_ar_all_langs();
					foreach ($all_project_langs as $current_lang) {
						if ($current_lang!==$lang) {
							$this->set_lang($current_lang);
							$diffusion_value = $this->get_valor($current_lang);
							if (!empty($diffusion_value)) {
								break;
							}
						}
					}
				}
			}

		// strip_tags all values (remove untranslated mark elements)
			$diffusion_value = !empty($diffusion_value)
				? preg_replace("/<\/?mark>/", '', $diffusion_value)
				: null;


		return $diffusion_value;
	}//end get_diffusion_value



	/**
	* UPDATE_DATO_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_dato_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the dato don't need change"
	*/
	public static function update_dato_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version	= null;
			$options->dato_unchanged	= null;
			$options->reference_id		= null;
			$options->tipo				= null;
			$options->section_id		= null;
			$options->section_tipo		= null;
			$options->context			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id;

		$update_version = implode(".", $update_version);
		switch ($update_version) {

			case '4.0.21':
				#$dato = $this->get_dato_unchanged();

				# Compatibility old dedalo installations
				if (!empty($dato_unchanged) && is_string($dato_unchanged)) {

					$new_dato = (array)$dato_unchanged;

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $new_dato;
						$response->msg		= "[$reference_id] Dato is changed from ".to_string($dato_unchanged)." to ".to_string($new_dato).".<br />";

				}else if(is_array($dato_unchanged)){

					$response = new stdClass();
						$response->result	= 1;
						$response->new_dato	= $dato_unchanged;
						$response->msg		= "[$reference_id] Dato is array ".to_string($dato_unchanged)." only save .<br />";

				}else{

					$response = new stdClass();
						$response->result	= 2;
						$response->msg		= "[$reference_id] Current dato don't need update.<br />";	// to_string($dato_unchanged)."
				}
				break;

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version



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
				$dato_from_json	= json_handler::decode($import_value); // , false, 512, JSON_INVALID_UTF8_SUBSTITUTE

				$response->result	= $dato_from_json;
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
					." invalid JSON value, seems a syntax error: ". PHP_EOL
					. to_string($import_value)
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
