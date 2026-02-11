<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_DATUM
* Defines object with normalized properties and checks
* Represents each of the 'datum' objects in the Diffusion API response.
*/
class diffusion_datum extends stdClass {



	/**
	* __CONSTRUCT
	* @param object|array|null $data = null
	* @return void
	*/
	public function __construct( object|array|null $data=null ) {

		// null case
		if ( $data===null ) {
			return;
		}

		if (is_array($data)) {
			$data = (object)$data;
		}

		// Nothing to do on construct (for now)
		if (!is_object($data)) {

			$msg = " wrong data format. object or array expected. Given type: ".gettype($data);
			debug_log(__METHOD__
				. $msg
				.' data: ' . to_string($data)
				, logger::ERROR
			);
			if(SHOW_DEBUG===true) {
				dump(debug_backtrace()[0], $msg);
			}

			// $this->errors[] = $msg;
			return;
		}
		
		// set all properties
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			if (method_exists($this, $method)) {

				$set_value = $this->{$method}($value);
				// if($set_value===false && empty($this->errors)) {
				// 	$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
				// }

			}else{

				debug_log(__METHOD__
					.' Ignored received property: "'.$key.'"" not defined as set method.'. PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				// $this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
			}
		}
	}//end __construct



	/**
	* SET_DIFFUSION_NODE
	* @param string|null $value
	* @return bool
	*/
	public function set_diffusion_node( ?string $value ) : bool  {

		$this->diffusion_node = $value;

		return true;
	}//end set_diffusion_node



	/**
	* GET_DIFFUSION_NODE
	* Return property value
	* @return string|null $this->diffusion_node
	*/
	public function get_diffusion_node() : ?string {

		return $this->diffusion_node ?? null;
	}//end get_diffusion_node



	/**
	* SET_SECTION_TIPO
	* @param string|null $value
	* @return bool
	*/
	public function set_section_tipo( ?string $value ) : bool  {

		$this->section_tipo = $value;

		return true;
	}//end set_section_tipo



	/**
	* GET_SECTION_TIPO
	* Return property value
	* @return string|null $this->section_tipo
	*/
	public function get_section_tipo() : ?string {

		return $this->section_tipo ?? null;
	}//end get_section_tipo



	/**
	* SET_TERM
	* @param string|null $value
	* @return bool
	*/
	public function set_term( ?string $value ) : bool  {

		$this->term = $value;

		return true;
	}//end set_term



	/**
	* GET_TERM
	* Return property value
	* @return string|null $this->term
	*/
	public function get_term() : ?string {

		return $this->term ?? null;
	}//end get_term



	/**
	* SET_MODEL
	* @param string|null $value
	* @return bool
	*/
	public function set_model( ?string $value ) : bool  {

		$this->model = $value;

		return true;
	}//end set_model



	/**
	* GET_MODEL
	* Return property value
	* @return string|null $this->model
	*/
	public function get_model() : ?string {

		return $this->model ?? null;
	}//end get_model



	/**
	* SET_PARENT
	* @param string|null $value
	* @return bool
	*/
	public function set_parent( ?string $value ) : bool  {

		$this->parent = $value;

		return true;
	}//end set_parent



	/**
	* GET_PARENT
	* Return property value
	* @return string|null $this->parent
	*/
	public function get_parent() : ?string {

		return $this->parent ?? null;
	}//end get_parent



	/**
	* SET_CONTEXT
	* @param array|null $value
	* @return bool
	*/
	public function set_context( ?array $value ) : bool  {

		$this->context = $value;

		return true;
	}//end set_context



	/**
	* GET_CONTEXT
	* Return property value
	* @return array|null $this->context
	*/
	public function get_context() : ?array {

		return $this->context ?? null;
	}//end get_context



	/**
	* SET_DATA
	* @param array|null $value
	* @return bool
	*/
	public function set_data( ?array $value ) : bool  {

		$this->data = $value;

		return true;
	}//end set_data



	/**
	* GET_DATA
	* Return property value
	* @return array|null $this->data
	*/
	public function get_data() : ?array {

		return $this->data ?? null;
	}//end get_data



	/**
	* GET METHODS
	* By accessors. When property exists, return property value,
	* else return null
	* @param string $name
	* @return mixed
	*/
	final public function __get( string $name ) {

		if (isset($this->{$name})) {
			return $this->{$name};
		}		

		return null;
	}
	final public function __set( string $name, $value ) {
		$this->{$name} = $value;
	}



}//end diffusion_datum
