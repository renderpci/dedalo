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
		if (!isset($options->section_tipo) || !is_string($options->section_tipo)) {
			$response->errors[] = 'section_tipo is missing or invalid.';
			return $response;
		}
		if (!isset($options->section_id)) {
			$response->errors[] = 'section_id is missing or invalid.';
			return $response;
		}
		$section_tipo	= $options->section_tipo;
		$section_id		= (int)$options->section_id;

		// fix vars
		$this->section_tipo	= $section_tipo;
		$this->section_id	= $section_id;

		// diffusion_element_tipo. Is the Ontology start point to resolve the diffusion nodes
		// It is set on construct the class
		// @see tool_diffusion::export_list
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
		$parsed_diffusion_objects_collection = [];
		foreach ($diffusion_objects as $diffusion_object) {

			// 1 resolving the data
			// set data into node structure
			$diffusion_object->data = $this->resolve_data( $diffusion_object );

			// 2 resolve langs
			$parsed_diffusion_objects_collection[] = $this->resolve_langs( $diffusion_object );
		}
		// merge all arrays in one flat array
		$final_parsed_diffusion_objects = array_merge(...$parsed_diffusion_objects_collection);

		foreach ($final_parsed_diffusion_objects as $current_diffusion_object) {
			// 3 parse / format result
			// set value into node structure
			$current_diffusion_object->value = $this->parse_diffusion_object( $current_diffusion_object );
		}

		try {

			// 4 save result to file, database, etc..
			$save_result = $this->save( $final_parsed_diffusion_objects );

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
	private function write_file( object $dom ) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->file_path	= null;
			$response->file_url		= null;

		$current_date	= new DateTime();
		$date			= $current_date->format('Y-m-d H_i_s');
		$file_name		= $this->section_tipo.'_'.$this->section_id;
		$xml_file_name	= $file_name.'_'. $date.'.xml';
		$sub_path		= DEDALO_MEDIA_PATH . '/xml';
		// Check that the target directory exists. If not, create it.
		if(!create_directory($sub_path)){
			$response->errors[] = 'unable to access/create the target directory: ' . $sub_path;
			$response->msg = 'Error accessing target directory: ' . $sub_path;
			return $response;
		}
		$file_path	= $sub_path .'/'. $xml_file_name;
		$file_url	= DEDALO_MEDIA_URL  . $sub_path . $xml_file_name;

		// save DOM nodes to file. Return the number of bytes, or false on failure.
		$result = $dom->save( $file_path );

		if ($result === false) {
			$response->errors[] = 'wrong DOM save response (false). Expected int (number of bytes)';
			$response->msg = 'Error saving DOM nodes to file';
			debug_log(__METHOD__
				. " Failed to save file " . PHP_EOL
				. ' file_path: ' . to_string($file_path)
				, logger::ERROR
			);
			return $response;
		}

		// success response
		$response->result = true;
		$response->msg = empty($response->errors)
			? 'OK. Request done successfully'
			: 'Warning. Request don with errors';
		// add file path to locate the created file form client side
		$response->file_path	= $file_path;
		$response->file_url		= $file_url;

		// debug
		debug_log(__METHOD__
			. " Saved XML file to " . PHP_EOL
			. ' file_path: ' . to_string($file_path)
			, logger::DEBUG
		);


		return $response;
	}//end write_file



	/**
	 * SAVE
	 * Saves the final parsed string to a file
	 * @param array $diffusion_objects
	 * @return object $response
	 */
	private function save( array $diffusion_objects ) : object {

		// parse nodes as XML document
		$dom = $this->render_dom( $diffusion_objects );

		// $xml_string = $dom->saveXML();

		// Save to file
		// $dom->save( DEDALO_MEDIA_PATH . '/xml/test.xml');

		$write_file_response = $this->write_file( $dom );

		$response = new stdClass();
			$response->result	= true;
			$response->msg		= 'OK';
			$response->errors	= [];
		$write_file_response = $response;

		return $write_file_response;
	}//end save



	/**
	* RENDER_DOM
	* Creates the XML nodes and hierarchize to create the final
	* DOM XML string
	* @param array $diffusion_objects
	* @return DOMDocument $dom
	*/
	public function render_dom( array $diffusion_objects ) : DOMDocument {

		$dom = new DOMDocument('1.0', 'UTF-8');
		$dom->formatOutput = true; // For pretty-printing
		// $dom->preserveWhiteSpace = true;

		// 1 render all nodes without worry about hierarchy
		$xml_nodes = [];
		foreach ($diffusion_objects as $current_diffusion_object) {

			// name
			$name = $current_diffusion_object->name ?? '';
			// Ensure the name is valid to use it in XML
			$name = $this->sanitize_xml_node_name( $name );

			// value. Ensure the value is always string
			$value	= $current_diffusion_object->value ?? '';

			// render DOM node
			$node = $dom->createElement( $name, htmlspecialchars($value) );

			$xml_nodes[] = (object)[
				'tipo'		=> $current_diffusion_object->tipo,
				'parent'	=> $current_diffusion_object->parent ?? null,
				'node'		=> $node
			];
		}

		// 2 hierarchize the rendered nodes
		foreach ($xml_nodes as $xml_node) {

			// attach the node to the DOM
			$dom->appendChild( $xml_node->node );

			$parent = $xml_node->parent ?? null;
			if (!$parent) {
				// first level node. Only add to the DOM
				continue;
			}

			// find his parent node in the list of xml_nodes
			$found = array_find($xml_nodes, function($el) use ($parent){
				return $el->tipo === $parent;
			});
			if (is_object($found)) {
				// hierarchize child node with parent
				$found->node->appendChild( $xml_node->node );
			}else{
				debug_log(__METHOD__
					. " Parent not found " . PHP_EOL
					. ' xml_node: ' . to_string($xml_node)
					, logger::WARNING
				);
			}
		}


		return $dom;
	}//end render_dom



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

		// default value
		$value = null;

		foreach ((array)$parser as $current_parser) {

			// parser function
			$fn = $current_parser->fn ?? 'parser_text::invalid_method';

			// check if the function exists
			$pieces	= explode('::', $fn);
			$class	= $pieces[0];
			$method	= $pieces[1] ?? 'invalid_method';
			if( !method_exists($class, $method) ){
				debug_log(__METHOD__
					. " The defined parser method does not exist " . PHP_EOL
					. " fn: ". $fn
					, logger::ERROR
				);
				continue;
			}

			// string expected from parser function execution
			$value = $fn($data, $current_parser->options);

			// check result format
			if ($value!==null && !is_string($value)) {
				debug_log(__METHOD__
					. " Expected value type string or null  " . PHP_EOL
					. ' gettype: ' . gettype($value) . PHP_EOL
					. ' value: ' . to_string($value)
					, logger::WARNING
				);
			}

			// set (overwrite) the data with the current value for the next iteration
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

		$ddo_map = diffusion_data::get_ddo_map($tipo, $section_tipo);

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



	/**
	* SANITIZE_XML_NODE_NAME
	* Ensure the node name is XML valid
	* @param string $name
	* @return string $sanitized_name
	*/
	private function sanitize_xml_node_name( string $name ): string {
		// 1. Remove invalid characters
		// Keep letters, digits, hyphens, underscores, and periods.
		// Note: to consider extended Unicode letters if the XML might use them.
		// For simplicity, we'll stick to basic ASCII letters.
		$sanitized_name = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $name);

		// 2. Ensure a valid starting character
		// XML names must start with a letter or underscore.
		if (!preg_match('/^[a-zA-Z_]/', $sanitized_name)) {
			// If it starts with a digit or period, or is empty, prepend an underscore
			$sanitized_name = '_' . $sanitized_name;
		}

		// 3. Handle reserved "xml" prefix
		// If the name starts with "xml" (case-insensitive), prepend something
		// to avoid conflicts with reserved XML keywords or attributes.
		if (stripos($sanitized_name, 'xml') === 0) {
			$sanitized_name = 'x' . $sanitized_name; // e.g., change "xmlData" to "xxmlData"
		}


		return $sanitized_name;
	}//end sanitize_xml_node_name



}//end diffusion_xml class
