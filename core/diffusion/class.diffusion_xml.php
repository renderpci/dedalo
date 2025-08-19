<?php declare(strict_types=1);
/**
* CLASS DIFFUSION_XML
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
	// lang
	public $lang;
	// saved_files. Array of strings as ['/path/file1.xml','/path/file2.xml']
	public static $saved_files = [];



	/**
	 * CONSTRUCT
	 * @param object|null $options = null
	 */
	public function __construct( ?object $options=null ) {

		$this->diffusion_element_tipo = $options->diffusion_element_tipo ?? null;

		// load parser classes files
		// Include the classes of the parsers based on the diffusion_element properties definitions.
		if ($this->diffusion_element_tipo) {
			$this->load_parsers( $this->diffusion_element_tipo );
		}

		// lang. Language for XML diffusion will be English always. This value diverges from
		// historical 'lg-spa' (DEDALO_STRUCTURE_LANG) and is adopted from now for new diffusion code revisions.
		$this->lang = 'lg-eng';


		parent::__construct($options);
	}//end __construct



	/**
	* UPDATE_RECORD
	* Unified diffusion start point to publish one record.
	* Creates an XML file with the resultant nodes of process given record.
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
			$response->result			= false;
			$response->msg				= [];
			$response->errors			= [];
			$response->class			= get_called_class();
			$response->diffusion_data	= [];

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
		// (!) Note that 'lg-eng' is passed as lang here, NOT the DEDALO_STRUCTURE_LANG.
		$diffusion_objects = $this->get_diffusion_objects( $root_tipo, true, $this->lang);

		// Resolve and parse values.
		// Obtain the diffusion objects data
		// some components will return multiple rows (as portals or relation_list)
		// some components are translatable and its data will return multiple languages.

		// 1 resolving the data
			$data_diffusion_objects_collection = [];
			foreach ($diffusion_objects as $diffusion_object) {

				// set data into node structure
				$diffusion_object->data = $this->resolve_data( $diffusion_object );

				// create multiple diffusion objects when the component return multiple locators
				// for every locator is necessary a new diffusion_object in order to group the record data.
				// in XML will be create a node with every locator data as follows:
				// 	<informant>
				//		<row>First informant</row>
				//		<row>Second informant</row>
				//	</informant>
				$data_diffusion_objects_collection[] = $this->resolve_data_rows( $diffusion_object );
			}

			// merge all arrays in one flat array
			$final_data_diffusion_objects = array_merge(...$data_diffusion_objects_collection);

		// 2 resolve langs
			$parsed_diffusion_objects_collection = [];
			foreach ($final_data_diffusion_objects as $diffusion_object) {

				// translatable components send multiple language data.
				// for every language is necessary a new diffusion object in order to group the language data.
				// in XML structure will be create a node for every language data as follows:
				// <title>
				//		<es>Mi título</es>
				//		<en>My title</en>
				// </title>
				$parsed_diffusion_objects_collection[] = $this->resolve_langs( $diffusion_object );
			}

			// merge all arrays in one flat array
			$final_parsed_diffusion_objects = array_merge(...$parsed_diffusion_objects_collection);

		// 3 parse / format result
			foreach ($final_parsed_diffusion_objects as $current_diffusion_object) {

				// set value into node structure
				$current_diffusion_object->value = $this->parse_diffusion_object( $current_diffusion_object );
			}

		// 4 save result to file, database, etc..
			try {

				$save_result = $this->save( $final_parsed_diffusion_objects );

				// add errors
				if ($save_result->errors) {
					$response->errors = array_merge($response->errors, $save_result->errors);
				}

				// add file URL to data response. The client will recover this list of files available for download.
				$response->diffusion_data = [(object)[
					'file_url' => $save_result->file_url ?? null
				]];


			} catch (\Throwable $th) {
				$response->errors[] = 'Exception: '.$th->getMessage();
			}

		// response result
		$response->result = $save_result ?? false;


		return $response;
	}//end update_record


	/**
	* RESOLVE_DATA_ROWS
	* Components with multiple relation data will provide multiple records
	* for every locator will set a unique key property for group the data
	* to represent it in XML must be create a new diffusion object with locator data
	* if the component has only 1 locator will be represented as follows:
	* 	<informant>
	* 		First informant
	* 	</informant>
	* but if the component has multiple locators will be structured as follows:
	* 	<informant>
	* 		<row>First informant</row>
	* 		<row>Second informant</row>
	* 	</informant>
	* @param diffusion_object $diffusion_object
	* @return array $diffusion_object_rows
	*/
	private function resolve_data_rows( diffusion_object $diffusion_object ) : array {

		$data = $diffusion_object->data ?? [];

		// when the component has not data, return it.
		if( empty($data) ){
			$diffusion_object_rows[] = $diffusion_object;
			return $diffusion_object_rows;
		}

		// create the data groups by the unique key of the data.
		// every ddo data as a unique key (with the main section_tipo and section_id)
		// so group the data into an array
		$grouped = [];
		foreach ($data as $item) {
			$key = $item->key;
			if (!isset($grouped[$key])) {
				$grouped[$key] = [];
			}
			$grouped[$key][] = $item;
		}

		// check the length of the data groups
		$grouped_count = count($grouped);

		// when the component has only one dataset, return it.
		// if the grouper has only 1 dataset use the original diffusion object configuration
		if( $grouped_count===1 ){
			$diffusion_object_rows[] = $diffusion_object;
			return $diffusion_object_rows;
		}

		$diffusion_object_rows = [];
		// if the grouper has multiple datasets
		// creates new diffusion object for grouping the datasets
		// it is a clone of the original diffusion group
		// create the new diffusion_object for current lang
		$grouper_diffusion_object = new diffusion_object((object)[
			'tipo'		=> $diffusion_object->tipo,
			'parent'	=> $diffusion_object->parent,
			'name'		=> $diffusion_object->name,
			'model'		=> RecordObj_dd::get_model_name_by_tipo($diffusion_object->tipo, true),
			'process'	=> $diffusion_object->process,
			'data'		=> []
		]);
		$diffusion_object_rows[] = $grouper_diffusion_object;


		// create the new diffusion groups for every dataset
		// if the grouper has multiple datasets use the `row` name and link they to the diffusion object grouper.
		foreach ($grouped as $key => $data_group) {

			// create the new diffusion_object for current lang
			$new_diffusion_object = new diffusion_object((object)[
				'tipo'		=> $key . $diffusion_object->tipo,
				'parent'	=> $diffusion_object->tipo,
				'name'		=> 'row',
				'model'		=> RecordObj_dd::get_model_name_by_tipo($diffusion_object->tipo, true),
				'process'	=> $diffusion_object->process,
				'data'		=> $data_group
			]);

			// adds it to the final array
			$diffusion_object_rows[] = $new_diffusion_object;
		}


		return $diffusion_object_rows;
	}//end resolve_data_rows



	/**
	* WRITE_FILE
	* Writes one XML file per record
	* @param DOMDocument $doc
	* @return object response
	*/
	private function write_file( DOMDocument $doc ) : object {

		$response = new stdClass();
			$response->result		= false;
			$response->msg			= 'Error. Request failed';
			$response->errors		= [];
			$response->file_path	= null;
			$response->file_url		= null;

		// name compound
		$name_parts = [
			$this->section_tipo,
			$this->section_id,
			logged_user_id(),
			date('Y-m-d') // date now as 2025-01-23
		];
		$file_name		= implode('_', $name_parts);
		$xml_file_name	= $file_name .'.xml';
		$xml_dir		= '/xml';
		$base_path		= DEDALO_MEDIA_PATH . $xml_dir;
		// Check that the target directory exists. If not, create it.
		if(!create_directory($base_path)){
			$response->errors[] = 'unable to access/create the target directory: ' . $base_path;
			$response->msg = 'Error accessing target directory: ' . $base_path;
			return $response;
		}
		$file_path	= DEDALO_MEDIA_PATH . $xml_dir .'/'. $xml_file_name;
		$file_url	= DEDALO_MEDIA_URL  . $xml_dir .'/'. $xml_file_name;

		// save DOM nodes to file. Return the number of bytes, or false on failure.
		$result = $doc->save( $file_path );

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

		// save file path to collect files (used when combine_files is called)
		diffusion_xml::$saved_files[] = $file_path;

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

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		try {

			// parse nodes as XML document
			$doc = $this->render_dom( $diffusion_objects );

			// Save to file
			$write_file_response = $this->write_file( $doc );

			// errors
			$response->errors = $write_file_response->errors ?? [];

			// file_url
			$response->file_url	= $write_file_response->file_url ?? null;

			// result
			$response->result = $write_file_response->result ?? false;

		} catch (Exception $e) {

			$response->errors[] = $e->getMessage();
		}

		$response->msg	= !empty($response->errors)
			? 'Warning. Request done with errors'
			: 'OK. Request done successfully';


		return $response;
	}//end save



	/**
	* RENDER_DOM
	* Creates the XML nodes and hierarchize to create the final
	* DOM XML string
	* @param array $diffusion_objects
	* @return DOMDocument $doc
	*/
	public function render_dom( array $diffusion_objects ) : DOMDocument {

		$doc = new DOMDocument('1.0', 'UTF-8');
		$doc->formatOutput = true; // For pretty-printing

		// 1 render all nodes without worry about hierarchy
		$xml_nodes = [];
		foreach ($diffusion_objects as $current_diffusion_object) {

			// check model
			$model = RecordObj_dd::get_model_name_by_tipo($current_diffusion_object->tipo,true);
			if (in_array($model, ['box elements'])) {
				// ignore
				continue;
			}

			// name. Ensure the name is valid to use it in XML
			$name = $this->sanitize_xml_node_name( $current_diffusion_object->name ?? '' );

			// Skip if name is empty after sanitization
			if (empty($name)) {
				continue;
			}

			// value. Ensure the value is always string
			$value = (string)($current_diffusion_object->value ?? '');

			// render DOM node
			// $node = $doc->createElement( $name, htmlspecialchars($value) );
			$node = $doc->createElement( $name );
			if (!empty($value)) {
				$node->appendChild($doc->createTextNode( $value ));
			}

			$xml_nodes[] = (object)[
				'tipo'		=> $current_diffusion_object->tipo,
				'parent'	=> $current_diffusion_object->parent ?? null,
				'node'		=> $node
			];
		}

		// 2 hierarchize the rendered nodes
		$root_nodes = [];
		foreach ($xml_nodes as $xml_node) {

			// attach the node to the DOM doc
			$doc->appendChild( $xml_node->node );

			$parent = $xml_node->parent ?? null;
			if (!$parent) {
				// Root level node - collect for later addition
				$root_nodes[] = $xml_node->node;
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
				// Parent not found - treat as root node
				$root_nodes[] = $xml_node->node;

				debug_log(__METHOD__
					. " Parent not found " . PHP_EOL
					. ' xml_node: ' . to_string($xml_node)
					, logger::WARNING
				);
			}
		}

		// Add root nodes to document
		foreach ($root_nodes as $root_node) {
			$doc->appendChild( $root_node );
		}


		return $doc;
	}//end render_dom



	/**
	* GET_DEFAULT_PROCESS_PARSER
	* Get the default parser based on data items number and the model.
	* @param diffusion_object $diffusion_object
	* @return array
	* 	Array of objects (parsers)
	*/
	public function get_default_process_parser( diffusion_object $diffusion_object ) : array {

		// default parser
		$default_parser = [(object)[
			'fn'		=> 'parser_text::default_join',
			'options'	=> (object)[
				'records_separator'	=> ' | ',
				'fields_separator'	=> ', '
			]
		]];

		// data
		$data = $diffusion_object->data ?? [];

		// empty data case.
		// No parser is necessary
		if (empty($data)) {
			return [];
		}

		// multiple data case.
		// If data items are multiple, return the default text join parser
		if (count($data)>1) {
			return $default_parser;
		}

		// One data item case. Switch by model
		$tipo	= $data[0]->tipo ?? null;
		$model	= RecordObj_dd::get_model_name_by_tipo($tipo,true);
		switch ($model) {

			case 'component_date':
				// Set a generic date parser
				return [(object)[
					'fn'		=> 'parser_date::string_date',
					'options'	=> (object)[
						'pattern'			=> 'Y-m-d',
						'records_separator'	=> ' | ',
						'fields_separator'	=> ', ',
						'date_mode'			=> component_date::get_date_mode_static($tipo),
						'lang'				=> DEDALO_DATA_LANG
					]
				]];

			case 'component_input_text':
			case 'component_text_area':
			default:
				// Creates a generic $separator concatenated string with all values (stringify non strings)
				return $default_parser;
		}
	}//end get_default_process_parser



	/**
	 * PARSE_DIFFUSION_OBJECT
	 * Parses and format the final output values based on resolved diffusion_object
	 * @param object $diffusion_object
	 * @return string|null $result
	 */
	private function parse_diffusion_object( object $diffusion_object ): ?string {

		// pre-parser
		// preparsed items are processed before like dates to include in a text
		$pre_parser = $diffusion_object->process->pre_parser ?? null;
		if ($pre_parser) {
			// overwrite data with preparsed values
			$this->exec_parsers($pre_parser, $diffusion_object);
		}

		// parser with fallback by model
		// Process the final process to the data. It will always be parsed, even if no parser is specified.
		$parser	= $diffusion_object->process->parser ?? $this->get_default_process_parser($diffusion_object);
		$value	= $this->exec_parsers($parser, $diffusion_object);

		// check value
			if( !is_string($value) && $value!==null ){
				debug_log(__METHOD__
					. " Parser return a invalid value type. The value will be safe JSON strignified." . PHP_EOL
					. " value: ". to_string( $value ) . PHP_EOL
					. " type: ". gettype( $value )
					, logger::ERROR
				);
				$value = json_encode($value);
			}


		return $value;
	}//end parse_diffusion_object



	/**
	* EXEC_PARSERS
	* Applies the parsers to the diffusion_object data.
	* It is sequential, parsing the previous parser result when multiple parsers are defined.
	* @param array $parser
	* 	Array of one or more parsers to apply to the data
	* @param object $diffusion_object
	* @return string|null $value
	*/
	public function exec_parsers( array $parser, object $diffusion_object ) : ?string {

		$data = $diffusion_object->data;

		foreach ($parser as $current_parser) {

			$current_data = $data;

			// pre-parser cases
			if (isset($current_parser->tipo)) {
				$found = array_find($data, function($el) use ($current_parser){
					return $el->tipo === $current_parser->tipo;
				});

				if (!is_object($found)) {
					debug_log(__METHOD__
						. " Ignored parser where 'tipo' is not found in the data " . PHP_EOL
						. ' current_parser: ' . to_string($current_parser) . PHP_EOL
						. ' data: ' . to_string($data)
						, logger::WARNING
					);
					continue;
				}

				$current_data = [$found];
			}

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
			$value = $fn($current_data, $current_parser->options);

			// pre-parser cases
			if (isset($current_parser->tipo)) {
				// overwrite the data value with the preparsed value (resolved as manageable string)
				$found->value = [$value];
			}

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
			$current_data = [$value];
		}

		// value: Note that if more than one parser is applied,
		// the value will be overwritten by the next parser consecutively
		// and only the last value is returned.

		return $value ?? null;
	}//end exec_parsers



	/**
	 * GET_ROOT_TIPO
	 * Resolve root tipo for current diffusion class
	 * In this case is the first child with a relation with the given $section_tipo
	 * @param string $diffusion_element_tipo
	 * @return string $root_tipo
	 */
	private function get_root_tipo( string $diffusion_element_tipo ) : ?string {

		$section_tipo = $this->section_tipo;

		$children = RecordObj_dd::get_ar_children($diffusion_element_tipo);
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
	 * RESOLVE_DATA
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
	* RESOLVE_LANGS
	* Diffusion objects can resolve their data with or without languages.
	* Translatable components will send a data DDO for each language.
	* Non-translatable components will only send one DDO.
	* When the component is translatable, a new diffusion object will be created for each language
	* to obtain an XML node for each language and create the hierarchy with the parent component as follows:
	* 	<title>
	*		<en>My title</en>
	*		<es>Mi título</es>
	*	</title>
	* @param object $diffusion_object
	* @return array $diffusion_object_langs
	*/
	private function resolve_langs( object $diffusion_object ) : array {

		$diffusion_object_langs = [];

		$data = $diffusion_object->data ?? null;

		// if data is empty the current diffusion object needs to be returned as is
		// empty nodes are groupers without data.
		// they will use to create the hierarchy of nodes.
		if( empty($data) ){
			$diffusion_object_langs[] = $diffusion_object;
			return $diffusion_object_langs;
		}

		// create unique array with all languages of the data, it will used to fill the gaps in the components that has to be joined and doesn't has done the translation
		$ar_langs = [];
		foreach ($data as $data_item) {
			if (!in_array($data_item->lang, $ar_langs) && $data_item->lang !== null) {
				$ar_langs[] = $data_item->lang;
			}
		}
		// get the last ddo from the ddo_map
		// last ddo will use to check its data
		// last ddo usually is the literal data with the final data
		$ddo_map = $diffusion_object->process->ddo_map;
		$end_ddo = [];
		foreach ($ddo_map as $ddo) {
			$children = array_filter($ddo_map, function($item) use($ddo) {
				return $item->parent===$ddo->tipo;
			});
			if(empty($children)){
				$end_ddo[] = $ddo;
			}
		}

		// For every lang will create a new diffusion object with the specific lang data
		// it will create a XML node with the lang as the node label in this form:
		// <en>my English data<\en>
		// the diffusion node of every lang will be a child of original diffusion object to create the nested nodes is this way:
		// 	<title>
		//		<en>My title</en>
		//		<es>Mi título</es>
		//	</title>
		$langs_count = count($ar_langs);
		foreach ($ar_langs as $current_lang) {

			// If the diffusion object has only 1 language return it.
			if($current_lang===DEDALO_DATA_NOLAN && $langs_count===1){
				$diffusion_object_langs[] = $diffusion_object;
				return $diffusion_object_langs;
			}

			// If the diffusion object is not translatable return it.
			if($current_lang===DEDALO_DATA_NOLAN && $langs_count>1){
				continue;
			}
			// Create the lang diffusion objects
			$lang_data = [];
			foreach ($end_ddo as $current_ddo) {
				// get the ddo with the same lang that are part of the same string.
				// as, get the ddo with the same tipo and same lang
				$found = array_find($data, function($item) use($current_lang, $current_ddo) {
					return $item->tipo===$current_ddo->tipo
					&& ($item->lang===$current_lang || $item->lang===DEDALO_DATA_NOLAN);
				});

				// if the original diffusion object has not the lang
				// create new data for fill the hole of the data
				// the value is set as null to be parsed as empty.
				if (!is_object($found)) {
					$found = (object)[
						'tipo'	=> $current_ddo->tipo,
						'lang'	=> $current_lang,
						'value'	=> null,
						'id'	=> $current_ddo->id,
						'key'	=> $current_ddo->key ?? null
					];
				}

				$lang_data[] = $found;
			}

			// use the alpha2 lang code for the XML nodes instead the native Dédalo lang.
			$lang_tld2 = lang::get_alpha2_from_code($current_lang);
			$lang_tipo = str_replace('lg-', '', $current_lang);

			// create the new diffusion_object for current lang
			$new_diffusion_object = new diffusion_object((object)[
				'tipo'		=> $lang_tipo . $diffusion_object->tipo,
				'parent'	=> $diffusion_object->tipo,
				'name'		=> $lang_tld2,
				// 'model'		=> RecordObj_dd::get_model_name_by_tipo($diffusion_object->tipo,true),
				'process'	=> $diffusion_object->process,
				'data'		=> $lang_data
			]);

			// add
			$diffusion_object_langs[] = $new_diffusion_object;
		}

		// remove the main $diffusion_object data (is split into lang diffusion objects)
		$diffusion_object->data = [];
		// add to the list
		$diffusion_object_langs[] = $diffusion_object;


		return $diffusion_object_langs;
	}//end resolve_langs



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



	/**
	* COMBINE_XML_FILES
	* Combines multiple XML files into a single XML file.
	* @param array $xml_files The list of XML files to combine.
	* @param string $output_file_path The full path and filename for the output XML file.
	* @param string $root_element_name The name of the root element for the new combined XML file.
	* @param string $nodes_to_import_query An optional XPath query to select specific nodes to import from each source XML file.
	* If not provided, the entire document element (root) of each source file will be imported.
	* @return object True on success, false on failure.
	*/
	protected function combine_xml_files(
		array $xml_files,
		string $output_file_path,
		string $root_element_name = 'combined_data', // combined_data
		string $nodes_to_import_query = ''
		): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed';
			$response->errors	= [];

		// 1. Create a new DOMDocument for the consolidated file
		$output_dom = new DOMDocument('1.0', 'UTF-8');
		$output_dom->formatOutput = true; // For nice formatting of the output XML

		// Create the root element for the new combined XML file
		$root_element = $output_dom->createElement($root_element_name);
		$output_dom->appendChild($root_element);

		if (empty($xml_files)) {
			$response->msg = 'Error. Empty XML files list';
			return $response;
		}

		foreach ($xml_files as $xml_file) {

			// 2. Load each individual XML file
			$input_dom = new DOMDocument();
			if (!$input_dom->load($xml_file)) {
				$response->errors[] = "Error: Could not load XML file: {$xml_file}";
				continue; // Skip to the next file
			}

			// 3. Import nodes
			if (!empty($nodes_to_import_query)) {
				// Use XPath to select specific nodes to import
				$xpath = new DOMXPath($input_dom);
				$nodes_to_import = $xpath->query($nodes_to_import_query);

				if ($nodes_to_import) {
					foreach ($nodes_to_import as $node) {
						$imported_node = $output_dom->importNode($node, true); // true for deep import (including children)
						$root_element->appendChild($imported_node);
					}
				} else {
					$response->errors[] = "Warning: No nodes found for query '{$nodes_to_import_query}' in file: {$xml_file}";
				}
			} else {
				// If no specific query, import the entire document element (root)
				$imported_node = $output_dom->importNode($input_dom->documentElement, true);
				$root_element->appendChild($imported_node);
			}
		}

		// 5. Save the consolidated file
		if (!$output_dom->save($output_file_path)) {
			$response->msg = "Error: Could not save the combined XML file to: {$output_file_path}";
			return $response;
		}

		// response success
		$response->result	= $output_file_path;
		$response->msg		= empty($response->errors)
			? 'OK. Successfully combined XML file'
			: 'Warning. Combined XML file with errors';


		return $response;
	}//end combine_xml_files



	/**
	* COMBINE_RENDERED_FILES
	* Combines files saved previously on every 'update_record' execution in a
	* single one XML file, reading and parsing file by file and combining the XML nodes inside.
	* @param object $options
	* 	{
	* 		diffusion_data : array
	* 	}
	* @return object $response
	*/
	public static function combine_rendered_files( object $options ) : object {

		$response = new stdClass();
			$response->result			= false;
			$response->msg				= 'Error. Request failed';
			$response->errors			= [];
			$response->diffusion_data	= null;

		// xml_files. Values saved previously on every 'update_record' execution
		$xml_files = diffusion_xml::$saved_files;
		if (empty($xml_files)) {
			return $response;
		}

		// output_file_path
		$first_file = $xml_files[0];
		$output_file_path = str_replace('.xml', '_combined.xml', $first_file);

		$diffusion_xml = new diffusion_xml();

		$response = $diffusion_xml->combine_xml_files(
			$xml_files,
			$output_file_path
		);

		// diffusion_data
		// Overwrite
		$file_url = str_replace(DEDALO_ROOT_PATH, DEDALO_ROOT_WEB, $output_file_path);
		$response->diffusion_data = [
			[
				(object)[
					'file_url' => $file_url
				]
			]
		];


		return $response;
	}//end combine_rendered_files



}//end diffusion_xml class
