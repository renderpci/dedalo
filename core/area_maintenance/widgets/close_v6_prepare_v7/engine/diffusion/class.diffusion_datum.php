<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_DATUM
* Defines object with normalized properties and checks
* Represents each of the 'datum' objects in the Diffusion API response.
*/
class diffusion_datum extends stdClass {


	// Properties declared explicitly in the canonical order of the
	// 'datum_group' JSON consumed by the Bun engine (diffusion/api/v1/lib/types.ts).
	// Declaration order defines the serialized key order: do not reorder.
	public ?string	$diffusion_tipo	= null;
	public ?string	$section_tipo	= null;
	public ?string	$term			= null;
	public ?string	$model			= null;
	public ?string	$parent			= null;
	public ?array	$context		= null;
	public ?array	$data			= null;



	/**
	* __CONSTRUCT
	* Hydrates the datum from an object/array routing every key through its
	* setter. Unknown keys are an error: the datum_group shape is a frozen
	* contract with the Bun engine.
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

		// set all properties
		foreach ($data as $key => $value) {
			$method = 'set_'.$key;
			if (method_exists($this, $method)) {

				$this->{$method}($value);

			}else{

				$msg = ' Ignored unknown property: "'.$key.'". The datum_group shape is a frozen contract.';
				debug_log(__METHOD__
					. $msg . PHP_EOL
					.' data: ' . to_string($data)
					, logger::ERROR
				);
				if (defined('SHOW_DEBUG') && SHOW_DEBUG===true) {
					throw new InvalidArgumentException(__METHOD__ . $msg);
				}
			}
		}
	}//end __construct



	/**
	* SET_DIFFUSION_TIPO
	* @param string|null $value
	* @return bool
	*/
	public function set_diffusion_tipo( ?string $value ) : bool  {

		$this->diffusion_tipo = $value;

		return true;
	}//end set_diffusion_tipo



	/**
	* GET_DIFFUSION_TIPO
	* Return property value
	* @return string|null $this->diffusion_tipo
	*/
	public function get_diffusion_tipo() : ?string {

		return $this->diffusion_tipo ?? null;
	}//end get_diffusion_tipo



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



}//end diffusion_datum
