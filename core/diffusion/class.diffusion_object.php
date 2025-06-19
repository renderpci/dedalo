<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_OBJECT
* Defines object with normalized properties and checks
* Represents each of Ontology diffusion nodes used to
* parse and resolve for publication output as XML, RDF, SQL, etc.
*/
class diffusion_object extends stdClass {



	// properties
		// typo : "dfo"
		public $typo = 'dfo';
		// tipo		: string e.g. 'rsc636'
		// parent	: string e.g. 'rsc630'
		// name		: string e.g. 'mmo:mint' (name of the column or node)
		// data		: array e.g. [{"id":"a","value":"Raspa"}] It will be passed as the first argument to the parser (see class.parser_text.php for a sample).
		// process	: object e.g { dd_map:[{section_tipo:string}], parser:[{fn:string, options:{}}] }
		// model 	: string|null e.g. 'component_input_text' Used to select the proper process->fn when is not defined.



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case
		if (is_null($data)) {
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
					.' Ignored received property: '.$key.' not defined as set method.'. PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
			}
		}
	}//end __construct



	/**
	* SET_TIPO
	* @param ?string $value
	* @return bool
	*/
	public function set_tipo( ?string $value ) : bool  {

		$this->tipo = $value;

		return true;
	}//end set_tipo



	/**
	* GET_TIPO
	* Return property value
	* @return ?string $this->tipo
	* 	array|string|null
	*/
	public function get_tipo() : ?string {

		return $this->tipo ?? null;
	}//end get_tipo



	/**
	* SET_PARENT
	* @param ?string $value
	* @return bool
	*/
	public function set_parent( ?string $value ) : bool  {

		$this->parent = $value;

		return true;
	}//end set_parent



	/**
	* GET_PARENT
	* Return property value
	* @return ?string $this->parent
	* 	array|string|null
	*/
	public function get_parent() : ?string {

		return $this->parent ?? null;
	}//end get_parent



	/**
	* SET_NAME
	* @param ?string $value
	* @return bool
	*/
	public function set_name( ?string $value ) : bool  {

		$this->name = $value;

		return true;
	}//end set_name



	/**
	* GET_NAME
	* Return property value
	* @return ?string $this->name
	* 	array|string|null
	*/
	public function get_name() : ?string {

		return $this->name ?? null;
	}//end get_name



	/**
	* SET_DATA
	* @param ?array $value
	* @return bool
	*/
	public function set_data( ?array $value ) : bool  {

		$this->data = $value;

		return true;
	}//end set_data



	/**
	* GET_DATA
	* Return property value
	* @return ?array $this->data
	*/
	public function get_data() : ?array {

		return $this->data ?? null;
	}//end get_data



	/**
	* SET_PROCESS
	* @param ?object $value
	* @return bool
	*/
	public function set_process( ?object $value ) : bool  {

		$this->process = $value;

		return true;
	}//end set_process



	/**
	* GET_PROCESS
	* Return property value
	* @return ?object $this->process
	*/
	public function get_process() : ?object {

		return $this->process ?? null;
	}//end get_process



	/**
	* SET_MODEL
	* @param ?string $value
	* @return bool
	*/
	public function set_model( ?string $value ) : bool  {

		$this->model = $value;

		return true;
	}//end set_model



	/**
	* GET_MODEL
	* Return property value
	* @return ?string $this->model
	*/
	public function get_model() : ?string {

		return $this->model ?? null;
	}//end get_model



}//end diffusion_object
