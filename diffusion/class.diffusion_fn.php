<?php declare(strict_types=1);
/**
* diffusion_fn
* Functions adapted to diffusion format.
*/
abstract class diffusion_fn {



	/**
	* MAP_TARGET_SECTION_TIPO
	* Search in diffusion structure the node (table, owclass, etc.) that points to the same section 
	* of current data (hierarchy53)
	* from hierarchy main (hierarchy1).
	* @used in 'hierarchy83'
	* @param object $element_instance
	* 	The instance of the component/relation_list
	* @param object|null $ddo
	* 	The ddo of the element
	* @param string|null $diffusion_element_tipo
	* 	The diffusion element tipo
	* @return array $diffusion_data
	* 	Return normalized diffusion data array
	* @sample: [{
	*	'tipo'  => 'hierarchy53',
	*	'lang'  => 'lg-nolan',
	*	'value' => [{
	*		'id'    => 'a',
	*		'lang'  => 'lg-nolan',
	*		'value' => 'ts_themes'
	*	}]
	* }]
	*/
	public static function map_target_section_tipo( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null ) : array {

		$tipo	= $element_instance->tipo;
		$lang	= $element_instance->get_lang();

		$value = null;

		$target_section_tipo = $element_instance->get_value(); // E.g. 'ts1'
		if (!empty($target_section_tipo)) {

			// Get diffusion_element children recursive
			$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
				$diffusion_element_tipo		
			);

			$candidates = [];
			foreach ($ar_diffusion_nodes as $current_tipo) {

				$current_target_section_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
					$current_tipo,
					'section',
					'related',
					true
				)[0] ?? null;			
				
				// Store the mapping (first diffusion_node wins if multiple)
				if($current_target_section_tipo && $current_target_section_tipo === $target_section_tipo) {

					$node_name = ontology_node::get_term_by_tipo($current_tipo, DEDALO_STRUCTURE_LANG, true, false);
					$candidates[$node_name] = ontology_node::get_model_by_tipo($current_tipo);
				}
			}

			// Note: Giving priority to the table alias when more than one item (e.g. table) 
			// is targeting to the dessired section tipo (E.g. 'ts' => 'table' and 'ts_themes' => 'table_alias').
			if( !empty($candidates) ) {
				// Sorting '*_alias' first
				uasort($candidates, function ($a, $b) {
					$aHas = str_contains($a, '_alias');
					$bHas = str_contains($b, '_alias');

					if ($aHas && !$bHas) {
						return -1;   // $a comes first
					}
					if (!$aHas && $bHas) {
						return 1;    // $b comes first
					}
					return 0;        // both have (or both lack) '_alias' – keep original order
				});

				// Override default value
				$value = array_key_first($candidates) ?? null;
			}
		}

		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $tipo,
			'lang'	=> $lang,
			'value'	=> $value ?? null,
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data = [$diffusion_data_object];

		return $diffusion_data;
	}//end map_target_section_tipo



	/**
	* MAP_PARENT_TO_NORDER
	* Returns number of order of current element based on parent array position of this element
	* @param object $element_instance
	* @param object|null $ddo
	* @return array $diffusion_data
	* @sample: [{
	*	'tipo'  => 'hierarchy36',
	*	'lang'  => 'lg-nolan',
	*	'value' => [{
	*		'id'    => 'a',
	*		'lang'  => 'lg-nolan',
	*		'value' => '8'
	*	}]
	* }]
	*/
	public static function map_parent_to_norder( object $element_instance, $ddo=null ) : array {

		$tipo	= $element_instance->tipo;
		$data	= $element_instance->get_data_lang();
		$lang	= $element_instance->get_lang();

		$norder = 0;

		if (!empty($data) && is_array($data) && isset($data[0]->section_tipo) && isset($data[0]->section_id)) {

			$caller_section_id = $element_instance->get_section_id();
			$caller_section_tipo = $element_instance->get_section_tipo();

			$locator_to_find = new locator();
			$locator_to_find->set_section_tipo($caller_section_tipo);
			$locator_to_find->set_section_id($caller_section_id);

			$section_tipo = $data[0]->section_tipo;
			$section_id = $data[0]->section_id;

			$children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component_relation_children'],
				true,
				true,
				true,
				true
			);

			if (isset($children_tipo[0])) {
				$component_relation_children = component_common::get_instance(
					'component_relation_children',
					$children_tipo[0],
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				$relation_children_data = $component_relation_children->get_data();
				foreach ($relation_children_data as $key => $children_locator) {
					if( true===locator::compare_locators( $locator_to_find, $children_locator, ['section_tipo','section_id']) ) {
						$norder = $key;
						break;
					}
				}
			} else {
				debug_log(__METHOD__
					." Error. searched component_relation_children not found in section '$section_tipo'"
					, logger::ERROR
				);
			}
		}

		// Override data. Mimic basic value data
		return $new_data = [(object)[
			'value' => $norder,
			'lang' 	=> $lang,
			'id' 	=> 1
		]];

	}//end map_parent_to_norder



	/**
	* MAP_SECTION_ID_TO_SUBTITLES_URL
	* @param object $options
	* @param mixed $dato
	* @return string $subtitles_url
	*/
	public static function map_section_id_to_subtitles_url( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null ) : array {

		$tipo	= $element_instance->tipo;
		$langs	= DEDALO_DIFFUSION_LANGS;	

		require_once(DEDALO_SHARED_PATH . '/class.subtitles.php');

		$section_id	= (int)$element_instance->get_section_id();

		$diffusion_data = [];
		foreach($langs as $lang){
			$subtitles_url	= subtitles::get_subtitles_url($section_id, $tc_in=null, $tc_out=null, $lang);
	
			$diffusion_data_object = new diffusion_data_object( (object)[
				'tipo'	=> $tipo,
				'lang'	=> $lang,
				'value'	=> $subtitles_url ?? null,
				'id'	=> $ddo->id ?? null
			]);
			$diffusion_data[] = $diffusion_data_object;
		}

		return $diffusion_data;
	}//end map_section_id_to_subtitles_url



	/**
	 * PARSE_TAG_TO_HTML
	 * Converts component text area data to diffusion format by parsing internal tags to HTML.
	 *
	 * This method processes the component's stored data and transforms any internal Dédalo tags
	 * (such as image references) into proper HTML elements suitable for diffusion/export.
	 *
	 * Logic flow:
	 * 1. Retrieves raw data from the component using `get_data()`
	 * 2. Creates an initial empty `diffusion_data_object` as fallback (null values)
	 * 3. If data exists:
	 *    - Resets the diffusion_data array
	 *    - Iterates through each data item
	 *    - For non-empty values, uses `TR::add_tag_img_on_the_fly()` to convert tags to HTML
	 *    - Creates a `diffusion_data_object` for each processed item with tipo, lang, value, and id
	 * 4. Returns array of `diffusion_data_object` instances
	 *
	 * @param object $element_instance The element instance to process
	 * @param object|null $ddo The diffusion data object
	 * @param string|null $diffusion_element_tipo The diffusion element tipo
	 * @return array Array of `diffusion_data_object` instances containing parsed HTML data
	 * @see diffusion_data_object
	 * @see TR::add_tag_img_on_the_fly()
	 */
	public static function parse_tag_to_html( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null) : array {

		$data = $element_instance->get_data();

		// Create initial empty diffusion_data_object as fallback
		$diffusion_data[] = new diffusion_data_object( (object)[
			'tipo'	=> $element_instance->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		// Process actual data if available
		if(!empty($data)) {
			$diffusion_data = [];
			foreach ($data as $current_data) {
				if(!empty($current_data->value)) {

					// Convert internal tags (like [img] references) to HTML elements
					$html_data = TR::add_tag_img_on_the_fly($current_data->value);

					$diffusion_data_object = new diffusion_data_object( (object)[
						'tipo'	=> $element_instance->tipo,
						'lang'	=> $current_data->lang ?? null,
						'value'	=> $html_data?? null,
						'id'	=> $ddo->id ?? null
					]);

					$diffusion_data[] = $diffusion_data_object;
				}
			}
		}

		return $diffusion_data;		
	}// end parse_tag_to_html




}//end class v1_functions
