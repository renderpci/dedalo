<?php declare(strict_types=1);
/**
 * DIFFUSION_FN
 * Abstract class providing static transformation functions for diffusion data export.
 *
 * This class contains utility methods that transform internal Dédalo data structures
 * into formats suitable for external diffusion/export systems. Each method follows
 * a consistent pattern: receive an element instance, process its data, and return
 * an array of `diffusion_data_object` instances.
 *
 * Common usage pattern:
 * ```php
 * $diffusion_data = diffusion_fn::map_target_section_tipo(
 *     $component_instance,
 *     $ddo,
 *     $diffusion_element_tipo
 * );
 * ```
 *
 * @package Dedalo
 * @subpackage Diffusion
 * @see diffusion_data_object
 */
abstract class diffusion_fn {



	/**
	* MAP_TARGET_SECTION_TIPO
	* Resolves the diffusion node name (table/alias) that targets a specific section.
	*
	* This method searches the diffusion structure to find which node (table, table_alias, 
	* owclass, etc.) points to the same section as the current data. It's particularly 
	* useful for hierarchy components where you need to map a section reference to its
	* corresponding diffusion table name.
	*
	* Logic flow:
	* 1. Extract the target section tipo from the element's value (e.g., 'ts1')
	* 2. Get all recursive children of the diffusion element
	* 3. For each child node, check if it has a 'related' relation to a 'section' model
	* 4. Collect candidates where the related section matches the target section
	* 5. Prioritize '*_alias' nodes over base nodes (e.g., 'ts_themes' over 'ts')
	* 6. Return the winning node name as the diffusion value
	*
	* Used in: hierarchy83 (hierarchy main configuration)
	*
	* @param object $element_instance
	* 	The component or relation_list instance containing the target section reference.
	* 	Its `get_value()` method returns the section tipo to look up.
	* @param object|null $ddo
	* 	The diffusion data object containing metadata like 'id' for the output.
	* @param string|null $diffusion_element_tipo
	* 	The root diffusion element tipo to search within (e.g., 'diffusion1').
	* 	All children of this element will be searched for matching sections.
	*
	* @return array Array containing a single `diffusion_data_object` with the resolved node name.
	*
	* @sample Input: element_instance with value 'ts1' (themes section)
	* @sample Output:
	* ```php
	* [
	* 	(object) [
	* 		'tipo'  => 'hierarchy53',
	* 		'lang'  => 'lg-nolan',
	* 		'value' => 'ts_themes',  // The table_alias name targeting 'ts1'
	* 		'id'    => 'a'
	* 	]
	* ]
	* ```
	*
	* @see ontology_node::get_ar_recursive_children()
	* @see ontology_node::get_ar_tipo_by_model_and_relation()
	* @see diffusion_data_object
	*/
	public static function map_target_section_tipo( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null ) : array {

		// Extract basic component info
		$tipo	= $element_instance->tipo;
		$lang	= $element_instance->get_lang();

		$value = null;

		// Get the target section tipo from the component's value
		// E.g., a hierarchy component might have value 'ts1' pointing to themes section
		$target_section_tipo = $element_instance->get_value();
		if (!empty($target_section_tipo)) {

			// Retrieve all descendant nodes from the diffusion element recursively
			// This gives us all tables, aliases, and other diffusion structures to search
			$ar_diffusion_nodes = ontology_node::get_ar_recursive_children(
				$diffusion_element_tipo		
			);

			// Collect all nodes that target the desired section
			$candidates = [];
			foreach ($ar_diffusion_nodes as $current_tipo) {

				// Check if this node has a 'related' relation to a 'section' model
				// Returns the section tipo this node points to, or null if not applicable
				$current_target_section_tipo = ontology_node::get_ar_tipo_by_model_and_relation(
					$current_tipo,
					'section',
					'related',
					true
				)[0] ?? null;				
				
				// If this node points to our target section, add it as a candidate
				if($current_target_section_tipo && $current_target_section_tipo === $target_section_tipo) {

					// Store node name as key and its model type as value
					// E.g., ['ts_themes' => 'table_alias', 'ts' => 'table']
					$node_name = ontology_node::get_term_by_tipo($current_tipo, DEDALO_STRUCTURE_LANG, true, false);
					$candidates[$node_name] = ontology_node::get_model_by_tipo($current_tipo);
				}
			}

			// Priority resolution: prefer table_alias over base table
			// This allows having both a main table and an alias pointing to the same section,
			// where the alias is used for specific diffusion contexts
			if( !empty($candidates) ) {
				
				// Sort so that '*_alias' models come first in the array
				uasort($candidates, function ($a, $b) {
					$aHas = str_contains($a, '_alias');
					$bHas = str_contains($b, '_alias');

					if ($aHas && !$bHas) {
						return -1;   // $a (alias) comes first
					}
					if (!$aHas && $bHas) {
						return 1;    // $b (alias) comes first
					}
					return 0;        // both same type – keep original order
				});

				// Take the first key (winner after sorting) as the resolved value
				$value = array_key_first($candidates) ?? null;
			}
		}

		// Build the diffusion data object with the resolved node name
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
	 * Calculates the ordinal position (nOrder) of an element within its parent's children list.
	*
	* This method determines the position index of the current element by examining
	* the parent's `component_relation_children` data and finding where the current
	* element's locator appears in that array. Useful for generating ordered lists
	* or maintaining hierarchy positions in diffusion exports.
	*
	* Logic flow:
	* 1. Get the element's data which contains the parent section reference
	* 2. Create a locator for the current (caller) element to search for
	* 3. Find the `component_relation_children` in the parent section
	* 4. Iterate through the parent's children data to find the matching locator
	* 5. Return the array index (0-based) as the nOrder value
	*
	* @param object $element_instance
	* 	The component instance whose position we want to determine.
	* 	Its `get_data_lang()` must return an array with the parent section reference.
	* @param object|null $ddo
	* 	The diffusion data object containing metadata like 'id' for the output.
	*
	* @return array Array containing a single `diffusion_data_object` with the nOrder integer value.
	*
	* @sample Input: Element referencing parent section 'hierarchy1' with section_id 5
	* @sample Output:
	* ```php
	* [
	* 	(object) [
	* 		'tipo'  => 'hierarchy36',
	* 		'lang'  => 'lg-nolan',
	* 		'value' => 8,  // Position index in parent's children list
	* 		'id'    => 'a'
	* 	]
	* ]
	* ```
	*
	* @see section::get_ar_children_tipo_by_model_name_in_section()
	* @see component_relation_children
	* @see locator::compare_locators()
	* @see diffusion_data_object
	*/
	public static function map_parent_to_norder( object $element_instance, $ddo=null ) : array {

		// Extract basic component info
		$tipo	= $element_instance->tipo;
		$data	= $element_instance->get_data_lang();
		$lang	= $element_instance->get_lang();

		// Default position is 0 (first position or not found)
		$norder = 0;

		// Only proceed if we have valid parent reference data
		if (!empty($data) && is_array($data) && isset($data[0]->section_tipo) && isset($data[0]->section_id)) {

			// Get identifiers for the current element (the one whose position we're finding)
			$caller_section_id = $element_instance->get_section_id();
			$caller_section_tipo = $element_instance->get_section_tipo();

			// Build a locator to search for in the parent's children list
			$locator_to_find = new locator();
				$locator_to_find->set_section_tipo($caller_section_tipo);
				$locator_to_find->set_section_id($caller_section_id);

			// Extract parent section reference from the data
			$section_tipo = $data[0]->section_tipo;
			$section_id = $data[0]->section_id;

			// Find the component_relation_children in the parent section
			// This component stores the ordered list of children
			$children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component_relation_children'],
				true,
				true,
				true,
				true
			);

			if (isset($children_tipo[0])) {
				// Get the relation_children component instance
				$component_relation_children = component_common::get_instance(
					'component_relation_children',
					$children_tipo[0],
					$section_id,
					'list',
					DEDALO_DATA_NOLAN,
					$section_tipo
				);
				
				// Get the ordered list of children locators
				$relation_children_data = $component_relation_children->get_data();
				
				// Search for our locator in the children list
				foreach ($relation_children_data as $key => $children_locator) {
					// Compare only section_tipo and section_id (ignore other locator properties)
					if( true===locator::compare_locators( $locator_to_find, $children_locator, ['section_tipo','section_id']) ) {
						$norder = $key;  // Found! Use the array index as position
						break;
					}
				}
			} else {
				// Log error if the expected component doesn't exist in the parent section
				debug_log(__METHOD__
					." Error. searched component_relation_children not found in section '$section_tipo'"
					, logger::ERROR
				);
			}
		}

		// Build the diffusion data object with the calculated position
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $tipo,
			'lang'	=> $lang,
			'value'	=> $norder,
			'id'	=> $ddo->id ?? null
		]);

		$diffusion_data = [$diffusion_data_object];
		return $diffusion_data;

	}//end map_parent_to_norder



	/**
	 * MAP_SECTION_ID_TO_SUBTITLES_URL
	 * Generates subtitle URLs for a section across all diffusion languages.
	 *
	 * This method creates subtitle file URLs for the given section, producing one
	 * URL per diffusion language. It's typically used with audiovisual components
	 * where subtitle files need to be exported as part of the diffusion process.
	 *
	 * Logic flow:
	 * 1. Get the section_id from the element instance
	 * 2. Load the subtitles helper class
	 * 3. Iterate through all configured diffusion languages
	 * 4. For each language, generate the subtitle URL using the subtitles class
	 * 5. Create a diffusion_data_object per language with the URL
	 *
	 * @param object $element_instance
	 * 	The component instance whose section_id will be used to generate subtitle URLs.
	 * @param object|null $ddo
	 * 	The diffusion data object containing metadata like 'id' for the output.
	 * @param string|null $diffusion_element_tipo
	 * 	The diffusion element tipo (unused in this method but kept for API consistency).
	 *
	 * @return array Array of `diffusion_data_object` instances, one per diffusion language.
	 *
	 * @sample Input: Element with section_id = 123, DEDALO_DIFFUSION_LANGS = ['lg-eng', 'lg-spa']
	 * @sample Output:
	 * ```php
	 * [
	 * 	(object) [
	 * 		'tipo'  => 'rsc29',
	 * 		'lang'  => 'lg-eng',
	 * 		'value' => 'https://example.org/media/subtitles/123_eng.vtt',
	 * 		'id'    => 'a'
	 * 	],
	 * 	(object) [
	 * 		'tipo'  => 'rsc29',
	 * 		'lang'  => 'lg-spa',
	 * 		'value' => 'https://example.org/media/subtitles/123_spa.vtt',
	 * 		'id'    => 'a'
	 * 	]
	 * ]
	 * ```
	 *
	 * @see subtitles::get_subtitles_url()
	 * @see DEDALO_DIFFUSION_LANGS
	 * @see diffusion_data_object
	 */
	public static function map_section_id_to_subtitles_url( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null ) : array {

		$tipo	= $element_instance->tipo;
		$langs	= DEDALO_DIFFUSION_LANGS;	

		// Load the subtitles helper class for URL generation
		require_once(DEDALO_SHARED_PATH . '/class.subtitles.php');

		// Get the section_id to use for subtitle file lookup
		$section_id	= (int)$element_instance->get_section_id();

		// Generate one URL per diffusion language
		$diffusion_data = [];
		foreach($langs as $lang){
			// Build subtitle URL for this language (full video, no timecode limits)
			$subtitles_url	= subtitles::get_subtitles_url($section_id, $tc_in=null, $tc_out=null, $lang);
	
			// Create diffusion object for this language's URL
			$diffusion_data_object = new diffusion_data_object( (object)[
				'tipo'	=> $tipo,
				'lang'	=> $lang,
				'value'	=> $subtitles_url,
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
						'value'	=> $html_data,
						'id'	=> $ddo->id ?? null
					]);

					$diffusion_data[] = $diffusion_data_object;
				}
			}
		}

		return $diffusion_data;		
	}// end parse_tag_to_html



	/**
	 * MAP_LOCATOR_TO_SECTION_LABEL
	 * Extracts the label/term for each locator's referenced section tipo.
	 *
	 * This method takes a component's data (array of locators) and resolves each
	 * locator's section_tipo to its human-readable label from the ontology. It produces
	 * one diffusion_data_object per language available for each term.
	 *
	 * Useful for exporting references where you need the section name rather than
	 * the technical section_tipo identifier.
	 *
	 * Logic flow:
	 * 1. Get the component's data (array of locators)
	 * 2. If empty, return a null-valued diffusion_data_object
	 * 3. For each locator, extract the section_tipo
	 * 4. Look up the ontology node for that section_tipo
	 * 5. Get all available term translations (term_data)
	 * 6. Create one diffusion_data_object per language/term pair
	 *
	 * @param object $element_instance
	 * 	The component instance containing locator data. Typically a relation component
	 * 	or any component that stores references to other sections.
	 * @param object|null $ddo
	 * 	The diffusion data object containing metadata like 'id' for the output.
	 * @param string|null $diffusion_element_tipo
	 * 	The diffusion element tipo (unused in this method but kept for API consistency).
	 *
	 * @return array Array of `diffusion_data_object` instances with section labels per language.
	 *
	 * @sample Input: Element with data containing locator to section 'rsc197'
	 * @sample Output:
	 * ```php
	 * [
	 * 	(object) [
	 * 		'tipo'  => 'rsc197',
	 * 		'lang'  => 'lg-eng',
	 * 		'value' => 'People',  // English label for section 'rsc197'
	 * 		'id'    => 'a'
	 * 	],
	 * 	(object) [
	 * 		'tipo'  => 'rsc197',
	 * 		'lang'  => 'lg-spa',
	 * 		'value' => 'Persona',  // Spanish label for section 'rsc197'
	 * 		'id'    => 'a'
	 * 	]
	 * ]
	 * ```
	 *
	 * @see ontology_node::get_instance()
	 * @see ontology_node::get_term_data()
	 * @see diffusion_data_object
	 */
	public static function map_locator_to_section_label( object $element_instance, $ddo=null, ?string $diffusion_element_tipo=null ) : array {

		// Get the component's locator data
		$data	= $element_instance->get_data();
		$langs	= DEDALO_DIFFUSION_LANGS;		

		$diffusion_data = [];
		
		// Handle empty data case - return null-valued object
		if(empty($data)){
			$diffusion_data[] = new diffusion_data_object( (object)[
				'tipo'	=> $element_instance->tipo,
				'lang'	=> null,
				'value'	=> null,
				'id'	=> $ddo->id ?? null
			]);

			return $diffusion_data;
		}

		// Process each locator in the data array
		foreach($data as $locator){
			
			// Extract the section_tipo from the locator
			$section_tipo = $locator->section_tipo ?? null;
			if(empty($section_tipo)){
				continue;  // Skip invalid locators
			}

			// Get the ontology node for this section_tipo
			$term_node = ontology_node::get_instance($section_tipo);
			if(empty($term_node)){
				continue;  // Skip if ontology node not found
			}

			// Get all term translations for this section_tipo
			// Returns array like ['lg-eng' => 'Audio', 'lg-spa' => 'Audio']
			$term_data = $term_node->get_term_data();
			if(empty($term_data)){
				continue;  // Skip if no term data available
			}

			// Create one diffusion object per language translation
			foreach($term_data as $lang => $term){
				$diffusion_data[] = new diffusion_data_object( (object)[
					'tipo'	=> $element_instance->tipo,
					'lang'	=> $lang,
					'value'	=> $term,
					'id'	=> $ddo->id ?? null
				]);
			}

			}

		return $diffusion_data;
	}//end map_locator_to_section_label




}//end class v1_functions
