<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_DATA_OBJECT
* Defines object with normalized properties and checks
* Represents each of Ontology diffusion nodes used to 
* parse and resolve for publication output as XML, RDF, SQL, etc. 
*/
class diffusion_data_object extends stdClass {



	// properties
		// tipo		: string e.g. 'rsc636'
		// lang		: string e.g. 'lg-spa'
		// value	: mixed e.g. 'Raspa' | [{"title": "Dédalo web", "uri":"https://dedalo.dev"}]
		// id		: string e.g. 'a'
		


	/**
	* __CONSTRUCT
	* @param object|null $data = null
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case
		if ( $data===null ) {
			return;
		}

		// Nothing to do on construct (for now)
		if (!is_object($data)) {

			$msg = " wrong data format. object expected. Given type: ".gettype($data);
			debug_log(__METHOD__
				. $msg
				.' data: ' . to_string($data)
				, logger::ERROR
			);
			if(SHOW_DEBUG===true) {
				dump(debug_backtrace()[0], $msg);
			}

			$this->errors[] = $msg;
			return;
		}
		
		// set all properties
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			if (method_exists($this, $method)) {

				$set_value = $this->{$method}($value);
				if($set_value===false && empty($this->errors)) {
					$this->errors[] = 'Invalid value for: '.$key.' . value: '.to_string($value);
				}

			}else{

				debug_log(__METHOD__
					.' Ignored received property: "'.$key.'"" not defined as set method.'. PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
			}
		}
	}//end __construct



	/**
	* SET_TIPO
	* @param string|null $value
	* @return bool
	*/
	public function set_tipo( ?string $value ) : bool  {

		$this->tipo = $value;

		return true;
	}//end set_tipo



	/**
	* GET_TIPO
	* Return property value
	* @return string|null $this->tipo
	*/
	public function get_tipo() : ?string {

		return $this->tipo ?? null;
	}//end get_tipo



	/**
	* SET_LANG
	* @param string|null $value
	* @return bool
	*/
	public function set_lang( ?string $value ) : bool  {

		$this->lang = $value;

		return true;
	}//end set_lang



	/**
	* GET_LANG
	* Return property value
	* @return string|null $this->lang
	*/
	public function get_lang() : ?string {

		return $this->lang ?? null;
	}//end get_lang



	/**
	* SET_VALUE
	* @param mixed $value
	* 	Could be array, string, object, null, etc.
	* @return bool
	*/
	public function set_value(mixed $value) : bool  {

		$this->value = $value;

		return true;
	}//end set_value



	/**
	* GET_VALUE
	* Return property value
	* @return mixed $this->value
	* 	array|string|object|null etc.
	*/
	public function get_value() : mixed {

		return $this->value ?? null;
	}//end get_value



	/**
	* SET_ID
	* @param string|null $value
	* @return bool
	*/
	public function set_id( ?string $value ) : bool  {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* GET_ID
	* Return property value
	* @return string|null $this->id
	*/
	public function get_id() : ?string {

		return $this->id ?? null;
	}//end get_id



	/**
	* GET METHODS
	* By accessors. When property exits, return property value,
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



}//end diffusion_data_object
