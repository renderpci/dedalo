<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_xml
* Manages publication on XML format
*
*/
class diffusion_xml extends diffusion  {



	// section_tipo
	public $section_tipo;
	// section_id
	public $section_id;
	// diffusion_element_tipo
	public $diffusion_element_tipo;



	/**
	 * CONSTRUCT
	 * @param object|null $options = null
	 */
	public function __construct( ?object $options=null ) {

		$this->diffusion_element_tipo = $options->diffusion_element_tipo;

		// load parser classes files
		// Include the classes of the parsers based on the diffusion_element properties definitions.
		$this->load_parsers( $this->diffusion_element_tipo );


		parent::__construct($options);
	}//end __construct



	/**
	* UPDATE_RECORD
	* Update one or any number of records ( array ) and references
	* @param object $options
	* {
	* 	section_tipo: string
	* 	section_id: string|int
	* 	diffusion_element_tipo: string
	* }
	* @return object $response
	*/
	public function update_record( object $options ) : object {

		// response
		$response = new stdClass();
			$response->result 	= false;
			$response->msg		= [];
			$response->errors	= [];
			$response->class	= get_called_class();

		// options
		$section_tipo			= $options->section_tipo;
		$section_id				= (int)$options->section_id;

		// fix vars
		$this->section_tipo		= $section_tipo;
		$this->section_id		= $section_id;
		$diffusion_element_tipo	= $this->diffusion_element_tipo;

		// root tipo (children of diffusion_element that has relation with current section)
		$root_tipo = $this->get_root_tipo( $diffusion_element_tipo );
		if (!$root_tipo) {
			$msg = 'Invalid diffusion definition for section: ' . $section_tipo;
			$response->msg = $msg;
			debug_log(__METHOD__
				. $msg . PHP_EOL
				. ' options: ' . to_string($options)
				,logger::ERROR
			);
			$response->errors[] = 'section not defined in diffusion element';
			return $response;
		}

		// Get the diffusion objects recursively, including self
		$diffusion_objects = $this->get_diffusion_objects( $root_tipo, true );

		// resolve and parse values
		foreach ($diffusion_objects as $diffusion_object) {

			// 1 resolving the data
			// set data into node structure
			$diffusion_object->data = $this->resolve_data( $diffusion_object );

			// 2 parse / format result
			// set value into node structure
			$diffusion_object->value = $this->parse_diffusion_object( $diffusion_object );
		}

		try {

			// 3 save result to file, database, etc..
			$save_result = $this->save( $diffusion_objects );

			// add errors
			if ($save_result->errors) {
				$response->errors = array_merge($response->errors, $save_result->errors);
			}

			// add file path and url
			$response->file_path	= $save_result->file_path ?? null;
			$response->file_url		= $save_result->file_url ?? null;

		} catch (\Throwable $th) {
			$response->errors[] = 'Exception: '.$th->getMessage();
		}

		// response result
		$response->result = $save_result ?? false;


		return $response;
	} //end update_record



	/**
	* WRITE_FILE
	* Writes one file per record (default)
	* @param object $options
	* @return object response
	*/
	private function write_file( object $options ) : object {
		
		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->file_path	= null;
			$response->file_url		= null;

		// options
		$data = $options->data;		

		$current_date	= new DateTime();
		$date			= $current_date->format('Y-m-d H_i_s');
		$sub_path		= 'xml';
		$file_name		= $this->section_tipo.'_'.$this->section_id;
		$xml_file_name	= $file_name.'_'. $date.'.xml';
		$file_path		= DEDALO_MEDIA_PATH . $sub_path . $xml_file_name;
		$file_url		= DEDALO_MEDIA_URL  . $sub_path . $xml_file_name;
	
		if( file_put_contents($file_path, $data) ){

			debug_log(__METHOD__
				. " Save file to " . PHP_EOL
				. ' file_path: ' . to_string($file_path)
				, logger::DEBUG
			);

			// add file path to locate the created file form client side
			$response->file_path	= $file_path;
			$response->file_url		= $file_url;

		}else{

			debug_log(__METHOD__
				. " Fail to save file " . PHP_EOL
				. ' file_path: ' . to_string($file_path)
				, logger::ERROR
			);
		}			
	

		return $response;
	}//end write_file



	/**
	 * SAVE
	 * Saves the final parsed string to a file
	 * @param string $parsed_result
	 * @return object $response
	 */
	private function save(string $parsed_result) : object {
		
		return $this->write_file((object)[
			'data' => $parsed_result
		]);
	} //end save



	/**
	 * PARSE_DIFFUSION_OBJECT
	 * Parses and format the final output values based on resolved diffusion_object
	 * @param object $diffusion_object
	 * @return string|null $result
	 */
	private function parse_diffusion_object( object $diffusion_object ): ?string {

		$parser = $diffusion_object->process->parser ?? [(object)[
			'fn'		=> 'parser_text::default_join',
			'options'	=> (object)[
				'records_separator'	=> ' | ',
				'fields_separator'	=> ', '
			]
		]];

		$data = $diffusion_object->data;

		foreach ($parser as $current_parser) {
			$fn = $current_parser->fn ?? 'parser_text::invalid_fn';

			if( !function_exists($fn) ){
				debug_log(__METHOD__
					. " The defined parser function does not exist " . PHP_EOL
					. " fn: ". $fn
					, logger::ERROR
				);
				continue;
			}
			//string
			$value = {$fn}($data, $current_parser->options);

			// set the data with the value for the next iteration
			$data = [$value];
		}

		// check value
		if( !is_string($value) && $value!==null ){
			debug_log(__METHOD__
				. " Parser return a invalid value type " . PHP_EOL
				. " value: ". to_string( $value ) . PHP_EOL
				. " type: ". gettype( $value ) . PHP_EOL
				. " stringify the value: "
				, logger::DEBUG
			);
			$value = json_encode($value);
		}


		// return the last value
		return $value;
	} //end parse_diffusion_object



	/**
	 * GET_ROOT_TIPO
	 * Resolve root tipo for current diffusion class
	 * In this case is the first child with a relation with the given $section_tipo
	 * @param string $diffusion_element_tipo
	 * @return string $root_tipo
	 */
	private function get_root_tipo( string $diffusion_element_tipo ) : ?string {

		$section_tipo = $this->section_tipo;

		$children = RecordObj_dd::get_ar_childrens($diffusion_element_tipo);
		$root_tipo = array_find($children, function($el) use($section_tipo){
			$ar_found = common::get_ar_related_by_model('section', $el);
			$section = $ar_found[0] ?? false;
			if (!$section) {
				return false;
			}
			return $section === $section_tipo;
		});


		return $root_tipo;
	}//end get_root_tipo



	/**
	 * RESOLVE_data
	 * Resolve diffusion_object value
	 * @param object $diffusion_object
	 * @return array $data
	 */
	private function resolve_data( object $diffusion_object ) : array {

		$section_tipo	= $this->section_tipo;
		$section_id		= $this->section_id;
		$tipo 			= $diffusion_object->tipo;

		$ar_data = [];

		$ddo_map 		= diffusion_data::get_ddo_map($tipo, $section_tipo);

		if( empty($ddo_map) ){
			return $ar_data;
		}

		// resolve the ddo_map
		// get the value of all ddo
		$resolve_options = new stdClass();
			$resolve_options->ddo_map		= $ddo_map;
			$resolve_options->parent		= $section_tipo;
			$resolve_options->section_tipo	= $section_tipo;
			$resolve_options->section_id	= $section_id;

		$ar_data = diffusion_data::get_ddo_map_value( $resolve_options );


		return $ar_data;
	}//end resolve_data



	/**
	* GET_DIFFUSION_SECTIONS_FROM_DIFFUSION_ELEMENT
	* Used to determine when show publication button in sections
	* Called from class diffusion to get the XML portion of sections
	* @see diffusion::get_diffusion_sections_from_diffusion_element
	* @param string $diffusion_element_tipo
	* @param string|null $class_name = null
	* @return array $ar_diffusion_sections
	*/
	public static function get_diffusion_sections_from_diffusion_element( string $diffusion_element_tipo, ?string $class_name=null ) : array {

		$ar_diffusion_sections = array();

		// XML elements
		$elements = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($diffusion_element_tipo, 'xml', 'children', true);
		foreach ($elements as $current_element_tipo) {

			// Pointer to section
			$ar_related = common::get_ar_related_by_model('section', $current_element_tipo);

			if (isset($ar_related[0])) {
				$ar_diffusion_sections[] = $ar_related[0];
			}
		}


		return $ar_diffusion_sections;
	}//end get_diffusion_sections_from_diffusion_element




}//end diffusion_xml class
