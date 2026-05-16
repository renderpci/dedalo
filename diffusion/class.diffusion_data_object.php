<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_DATA_OBJECT
* Normalized data container for a single ontology diffusion node.
*
* Diffusion nodes are the leaf elements of a diffusion template tree
* defined in the ontology. Each node maps one component (or calculated
* field) to a publication-ready key/value pair. This class stores the
* resolved value together with the metadata required by exporters
* (XML, RDF, SQL, JSON, etc.) to format and label the output correctly.
*
* The object is typically built in one of two ways:
* 1. Hydration from a plain object passed to the constructor.
* 2. Wrapping by diffusion_chain_processor->wrap_into_diffusion_data_object(),
*    which injects additional metadata (label, term, model, diffusion_tipo).
*
* Property groups:
* - Main values     : tipo, lang, value, id — the core payload every exporter needs.
* - Additional values: diffusion_tipo, label, term, model — contextual metadata
*   added by the chain processor to help exporters resolve labels and structure.
*/
class diffusion_data_object extends stdClass {



	// ------ properties ------
	// main values
		// tipo		: string e.g. 'rsc636'
		// lang		: string e.g. 'lg-spa'
		// value	: mixed  e.g. 'Raspa' | [{"title": "Dédalo web", "uri":"https://dedalo.dev"}]
		// id		: string e.g. 'a'
	// additional values (used by diffusion_chain_processor->wrap_into_diffusion_data_object)
		// diffusion_tipo 	: string e.g. 'rsc636'
		// label			: string e.g. 'Audiovisual'
		// term				: string e.g. 'Audiovisual'
		// model			: string e.g. 'component_input_text'

	// errors array to collect validation errors
	public array $errors = [];



	/**
	* __CONSTRUCT
	* Hydrates the object from a plain object, routing known keys to their
	* matching setters. Unknown keys and non-object input are logged as errors.
	*
	* @param object|null $data = null
	* @return void
	*/
	public function __construct( ?object $data=null ) {

		// null case
		if ( $data===null ) {
			return;
		}

		// Reject non-object input with an error log and optional backtrace dump
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

			} else {

				debug_log(__METHOD__
					.' Ignored received property: "'.$key.'" not defined as set method.'. PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				$this->errors[] = 'Ignored received property: '.$key.' not defined as set method. Data: '. json_encode($data, JSON_PRETTY_PRINT);
			}
		}
	}//end __construct



	// ------ main values ------



	/**
	* SET_TIPO
	* Stores the ontology tipo of the diffusion node.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_tipo( ?string $value ) : bool {

		$this->tipo = $value;

		return true;
	}//end set_tipo



	/**
	* GET_TIPO
	* @return string|null
	*/
	public function get_tipo() : ?string {

		return $this->tipo ?? null;
	}//end get_tipo



	/**
	* SET_LANG
	* Stores the language code for multilingual values.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_lang( ?string $value ) : bool {

		$this->lang = $value;

		return true;
	}//end set_lang



	/**
	* GET_LANG
	* @return string|null
	*/
	public function get_lang() : ?string {

		return $this->lang ?? null;
	}//end get_lang



	/**
	* SET_VALUE
	* Stores the resolved value of the diffusion node.
	*
	* @param mixed $value
	*  Could be array, string, object, null, etc.
	* @return bool
	*/
	public function set_value(mixed $value) : bool {

		$this->value = $value;

		return true;
	}//end set_value



	/**
	* GET_VALUE
	* @return mixed
	*/
	public function get_value() : mixed {

		return $this->value ?? null;
	}//end get_value



	/**
	* SET_ID
	* Stores the node identifier.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_id( ?string $value ) : bool {

		$this->id = $value;

		return true;
	}//end set_id



	/**
	* GET_ID
	* @return string|null
	*/
	public function get_id() : ?string {

		return $this->id ?? null;
	}//end get_id



	// ------ additional values ------
	// Used by diffusion_chain_processor->wrap_into_diffusion_data_object



	/**
	* SET_DIFFUSION_TIPO
	* Stores the diffusion-specific tipo mapping this node to the diffusion ontology.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_diffusion_tipo( ?string $value ) : bool {

		$this->diffusion_tipo = $value;

		return true;
	}//end set_diffusion_tipo



	/**
	* GET_DIFFUSION_TIPO
	* @return string|null
	*/
	public function get_diffusion_tipo() : ?string {

		return $this->diffusion_tipo ?? null;
	}//end get_diffusion_tipo



	/**
	* SET_LABEL
	* Stores the human-readable label of the diffusion node.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_label( ?string $value ) : bool {

		$this->label = $value;

		return true;
	}//end set_label



	/**
	* GET_LABEL
	* @return string|null
	*/
	public function get_label() : ?string {

		return $this->label ?? null;
	}//end get_label


	/**
	* SET_TERM
	* Stores the thesaurus term of the diffusion node.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_term( ?string $value ) : bool {

		$this->term = $value;

		return true;
	}//end set_term



	/**
	* GET_TERM
	* @return string|null
	*/
	public function get_term() : ?string {

		return $this->term ?? null;
	}//end get_term



	/**
	* SET_MODEL
	* Stores the model name used to resolve this diffusion node.
	*
	* @param string|null $value
	* @return bool
	*/
	public function set_model( ?string $value ) : bool {

		$this->model = $value;

		return true;
	}//end set_model



	/**
	* GET_MODEL
	* @return string|null
	*/
	public function get_model() : ?string {

		return $this->model ?? null;
	}//end get_model



}//end diffusion_data_object
