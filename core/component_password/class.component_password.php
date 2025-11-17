<?php declare(strict_types=1);
/**
* CLASS COMPONENT PASSWORD
* 
* data_column_name : 'string'
*/
class component_password extends component_common {



	public $fake_value = '****************';

	// Property to enable or disable the get and set data in different languages
	protected $supports_translation = false;

	/**
	* __CONSTRUCT
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		$this->lang = DEDALO_DATA_NOLAN;

		parent::__construct($tipo, $section_id, $mode, $this->lang, $section_tipo, $cache);
	}//end __construct



	/**
	* GET_DIFFUSION_VALUE
	* Overwrite component_common method
	* @param string|null $lang = null
	* @param object|null $option_obj = null
	* @return string|null $diffusion_value
	*
	* @see class.diffusion_mysql.php
	*/
	public function get_diffusion_value( ?string $lang=null, ?object $option_obj=null ) : ?string {

		return $this->fake_value;
	}//end get_diffusion_value



	/**
	* GET_GRID_VALUE
	* Get the value of the components. By default will be get_data().
	* overwrite in every different specific component
	* Some the text components can set the value with the dato directly
	* the relation components need to process the locator to resolve the value
	* @param object|null $ddo = null
	*
	* @return dd_grid_cell_object $dd_grid_cell_object
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		// set the separator if the ddo has a specific separator, it will be used instead the component default separator
			$fields_separator	= $ddo->fields_separator ?? null;
			$records_separator	= $ddo->records_separator ?? null;
			$format_columns		= $ddo->format_columns ?? null;
			$class_list			= $ddo->class_list ?? null;

		// column_obj
			$column_obj = $this->column_obj ?? (object)[
				'id' => $this->section_tipo.'_'.$this->tipo
			];

		// short vars
			$label		= $this->get_label();
			$properties	= $this->get_properties();

		// data
			$data = ['***************'];

		// fields_separator
			$fields_separator = isset($fields_separator)
				? $fields_separator
				: (isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ');

		// records_separator
			$records_separator = isset($records_separator)
				? $records_separator
				: (isset($properties->records_separator)
					? $properties->records_separator
					: ' | ');

		// dd_grid_cell_object
			$dd_grid_cell_object = new dd_grid_cell_object();
				$dd_grid_cell_object->set_type('column');
				$dd_grid_cell_object->set_label($label);
				$dd_grid_cell_object->set_cell_type('text');
				$dd_grid_cell_object->set_ar_columns_obj([$column_obj]);
				if(isset($class_list)){
					$dd_grid_cell_object->set_class_list($class_list);
				}
				$dd_grid_cell_object->set_fields_separator($fields_separator);
				$dd_grid_cell_object->set_records_separator($records_separator);
				$dd_grid_cell_object->set_value($data);
				$dd_grid_cell_object->set_model(get_called_class());


		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* SAVE
	* Overwrite component_common method to set always lang to config:DEDALO_DATA_NOLAN before save
	* @return bool
	*/
	public function save() : bool {

		if(isset($this->updating_dato) && $this->updating_dato===true) {
			// Dato is saved plain (unencrypted) only for updates
		}else{
			// Encrypt dato with MD5 etc..
			$this->data = $this->data ?? [];
			foreach ((array)$this->data as $item) {
				// set encrypted value
				$item->value = component_password::encrypt_password(
					$item->value
				);
			}
		}

		// demo user case. Prevent to change password for logged user 'demo'
			$username = logged_user_username();
			if ($username==='dedalo') {
				debug_log(__METHOD__
					. " Attempt to change dedalo demo user password blocked "
					, logger::ERROR
				);
				return false;
			}


		// from here, we save as standard way
		return parent::save();
	}//end save



	/**
	* ENCRYPT_PASSWORD
	* Alias of dedalo_encrypt_openssl
	* Change the mycript lib to OpenSSL in the 4.0.22 update
	* we need the to encrypts for sustain the login of the user before the update to 4.0.22
	* this function will be change to only Open SSl in the 4.5.
	* @param string $string_value
	* @return string|boolean
	*/
	public static function encrypt_password(string $string_value) : string {

		return dedalo_encrypt_openssl(
			$string_value,
			DEDALO_INFORMATION
		);
	}//end encrypt_password



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
			$options->update_version 	= null;
			$options->dato_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_dato';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$dato_unchanged	= $options->dato_unchanged;
			$reference_id	= $options->reference_id ?? '';


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_dato_version


	/**
	* GET_V6_ROOT_PASSWORD_DATA
	* PROVISIONAL! TO BE USED IN THE V6 TO V7 TRANSITION
	* REMOVE IT IN VERSIONS >V7.0.0
	* @return
	*/
	public function get_v6_root_password_data() {

		$sql_query = "
			SELECT datos->'components'->'dd133'->'dato'->'lg-nolan'->>0
			FROM \"matrix_users\"
			WHERE \"section_id\" = '-1'
			LIMIT 1;
		";

		$result = pg_query(DBi::_getConnection(), $sql_query);
		$data = pg_fetch_result($result, 0, 0);

		return $data;
	}//end get_v6_root_password_data



}//end class component_password
