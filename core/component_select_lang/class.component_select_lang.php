<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT_LANG
* Manages language selection components for multilingual content in Dédalo.
*
* Specialized select component for choosing language codes (e.g., 'lg-eng', 'lg-spa')
* from the Dédalo language ontology. Typically used alongside text components to
* specify the language of content.
*
* Key features:
* - Links to Dédalo language records (lg- prefix tipos)
* - Provides language code resolution for diffusion/export
* - Associates with component_text_area for multilingual content
* - Supports language-based filtering in search
*
* Use cases:
* - Specifying language of text content in component_text_area
* - Setting audio/video language for media components
* - Language tagging for translation workflows
*
* Extends component_relation_common for relationship management capabilities.
*
* @package Dédalo
* @subpackage Core
*/
class component_select_lang extends component_relation_common {



	/**
	* CLASS VARS
	*/
		/**
		 * Default relation type for language selection (DEDALO_RELATION_TYPE_LINK).
		 * Defines the ontology tipo used for linking to language records.
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;



	/**
	* GET_VALUE_CODE
	* Returns the value lang code like 'lg-cat'
	* Used in diffusion to get the av file lang for example
	* @return string|null $code
	*/
	public function get_value_code() : ?string {

		$data = $this->get_data();

		// empty case
		if (empty($data)) {
			return null;
		}

		// lang class manage resolution
		$locator = $data[0] ?? null;
		if (empty($locator)) {
			return null;
		}

		// code resolution
		$code = lang::get_code_from_locator($locator);


		return $code;
	}//end get_value_code



	/**
	* GET_RELATED_COMPONENT_TEXT_AREA
	* Returns the associated component text area
	* Used to set a lang for the component text area content
	* @return string|null $tipo
	*/
	public function get_related_component_text_area() : ?string {

		$tipo = null;

		$related_terms = common::get_ar_related_by_model('component_text_area', $this->tipo);

		switch (true) {
			case count($related_terms)==1 :
				$tipo = reset($related_terms);
				break;
			case count($related_terms)>1 :
				debug_log(__METHOD__." More than one related component_text_area are found. Please fix this ASAP ".to_string(), logger::ERROR);
				break;
			default:
				break;
		}


		return $tipo;
	}//end get_related_component_text_area



	/**
	* UPDATE_DATA_VERSION
	* @param object $request_options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	*/
	public static function update_data_version(object $request_options) : object {

		$options = new stdClass();
			$options->update_version 	= null;
			$options->data_unchanged 	= null;
			$options->reference_id 		= null;
			$options->tipo 				= null;
			$options->section_id 		= null;
			$options->section_tipo 		= null;
			$options->context 			= 'update_component_data';
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

			$update_version	= $options->update_version;
			$data_unchanged	= $options->data_unchanged;
			$reference_id	= $options->reference_id;


		$update_version = implode(".", $update_version);
		switch ($update_version) {

			default:
				$response = new stdClass();
					$response->result	= 0;
					$response->msg		= "This component ".get_called_class()." don't have update to this version ($update_version). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* GET_SORTABLE
	* @return bool
	* 	Default is true
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Calculate full path of current element to use in columns order path (context)
	* @param string $component_tipo
	* @param string $section_tipo
	* @return array $path
	*/
	public function get_order_path(string $component_tipo, string $section_tipo) : array {

		$path = [
			// self component path
			(object)[
				'component_tipo'	=> $component_tipo,
				'model'				=> ontology_node::get_model_by_tipo($component_tipo,true),
				'name'				=> ontology_node::get_term_by_tipo($component_tipo),
				'section_tipo'		=> $section_tipo
			],
			// thesaurus langs (component_input_text hierarchy25, section_tipo lg-1)
			(object)[
				'component_tipo'	=> DEDALO_THESAURUS_TERM_TIPO,
				'model'				=> ontology_node::get_model_by_tipo(DEDALO_THESAURUS_TERM_TIPO,true),
				'name'				=> ontology_node::get_term_by_tipo(DEDALO_THESAURUS_TERM_TIPO),
				'section_tipo'		=> DEDALO_LANGS_SECTION_TIPO
			]
		];

		return $path;
	}//end get_order_path



	/**
	* GET_LIST_OF_VALUES
	* Lang-specific option list resolver (overrides the canonical resolver).
	* Resolves the project default langs as the selectable values instead of
	* searching a target section.
	* @param string|null $lang = DEDALO_DATA_LANG
	* @param bool $include_negative = false
	* @return object $response
	*/
	public function get_list_of_values(?string $lang=DEDALO_DATA_LANG, bool $include_negative=false) : object {

		// datalist. Resolving multiple langs at once
			$langs_resolved = lang::resolve_multiple(DEDALO_PROJECTS_DEFAULT_LANGS);
			$datalist = array_map(function ($item) use ($lang) {

				$locator = new locator();
				$locator->set_section_id($item->section_id);
				$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);

				// try to get the name in the requested language, else fallback to main lang or any.
				$name = lang::fallback_lang_value($item->names, $lang);

				$item_value = new stdClass();
					$item_value->value		= $locator;
					$item_value->label		= $name ?? $item->code;
					$item_value->section_id	= 'lg-'.$item->code;

				return $item_value;
			}, $langs_resolved);

		// sort the list for easy access
			usort($datalist, function($a, $b) {
				$a_label = isset($a) && isset($a->label)
					? $a->label
					: '';
				$b_label = isset($b) && isset($b->label)
					? $b->label
					: '';
				return strcmp($a_label, $b_label);
			});

		// response OK
			$response = new stdClass();
				$response->result	= $datalist;
				$response->msg		= 'OK';


		return $response;
	}//end get_list_of_values



	/**
	* GET_LIST_VALUE
	* Unified value list output
	* By default, list value is equivalent to data. Override in other cases.
	* Note that empty array or string are returned as null
	* @return array|null $list_value
	*/
	public function get_list_value() : ?array {

		$data = $this->get_data();
		if (empty($data)) {
			return null;
		}

		$list_value = [];
		$list_of_values = $this->get_list_of_values(DEDALO_DATA_LANG);
		foreach ($list_of_values->result as $item) {

			$locator = $item->value;
			if ( true===locator::in_array_locator($locator, $data, array('section_id','section_tipo')) ) {
				$list_value[] = $item->label;
			}
		}

		// check value is contained into list of values. If not, add as missing lang
			if (!empty($data) && empty($list_value) && !empty($list_of_values->result)) {

				$missing_lang = component_select_lang::get_missing_lang(
					$data[0], // object locator
					$list_of_values->result // array list_of_values
				);
				if (!empty($missing_lang)) {
					// resolve
					$list_value[] = $missing_lang->label;
				}
			}

		return $list_value;
	}//end get_list_value



	/**
	* GET_MISSING_LANG
	* @param object $locator
	* 	Data locator
	* @param array $list_of_values
	*  Array of values in ara_list_of_values result format
	* @return object $missing_lang
	*/
	public static function get_missing_lang(object $locator, array $list_of_values) : ?object {

		$missing_lang = null;

		// check value is contained into list of values
			$contained	= false;
			foreach ($list_of_values as $item) {
				if ($item->value->section_tipo===$locator->section_tipo &&
					$item->value->section_id==$locator->section_id) {
					$contained = true;
					break;
				}
			}
			if ($contained===false) {
				// resolve lang
				$code	= lang::get_code_from_locator($locator); // as 'lg-fra'
				$name	= lang::get_lang_name_by_locator($locator); // as 'France'

				$missing_lang = (object)[
					'value'			=> (object)[
						'section_tipo'	=> $locator->section_tipo,
						'section_id'	=> $locator->section_id
					],
					'label'			=> $name . ' *',
					'section_id'	=> $code
				];
			}

		return $missing_lang;
	}//end get_missing_lang



	/**
	* CONFORM_IMPORT_DATA
	* Accepted import formats:
	* 1. Lang code(s) as flat string, multiple values separated by comma:
	* 	lg-spa
	* 	lg-spa, lg-eng
	* 2. JSON array of lang code strings:
	* 	["lg-spa","lg-eng"]
	* 3. JSON locator(s), array or single object (delegated to component_relation_common):
	* 	[{"section_tipo":"dd1462","section_id":"17344"}]
	* 4. Numeric section_id list (delegated to component_relation_common):
	* 	17344,5101
	* Lang codes are resolved to locators pointing to the languages section.
	* Codes that resolve but are not in the project configured languages
	* (DEDALO_PROJECTS_DEFAULT_LANGS) are imported with a WARNING: the value is saved
	* but it will not be accessible until the project languages include it.
	* Unresolvable codes produce a failed row.
	* Empty value returns null (clears the existing component data)
	* @param string $import_value
	* @param string $column_name
	* @return object $response
	*/
	public function conform_import_data( string $import_value, string $column_name ) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->warnings	= [];
				$response->msg		= 'Error. Request failed';

		// collect the lang codes to resolve
			$ar_codes = null;
			if(json_handler::is_json($import_value)){

				$data_from_json = json_handler::decode($import_value);

				// JSON array of lang code strings as ["lg-spa","lg-eng"]
				if (is_array($data_from_json) && !empty($data_from_json) &&
					count(array_filter($data_from_json, 'is_string'))===count($data_from_json)) {
					$ar_codes = array_map('trim', $data_from_json);
				}
				// any other JSON (locators array or single locator object):
				// delegate to component_relation_common
			}else{

				// flat string case. Tokens separated by comma as 'lg-spa, lg-eng'
				$tokens = array_map('trim', explode(',', $import_value));
				$tokens = array_filter($tokens, function($v){ return $v!==''; });
				if (!empty($tokens)) {
					$is_all_codes = count(array_filter($tokens, function($v){
						return preg_match('/^lg-[a-z0-9]+$/', $v)===1;
					}))===count($tokens);
					if ($is_all_codes===true) {
						$ar_codes = array_values($tokens);
					}
					// numeric tokens (legacy section_id import) and any other string:
					// delegate to component_relation_common
				}
			}

		// delegate case. Locators, section_id lists, empty values, etc.
			if ($ar_codes===null) {
				return parent::conform_import_data($import_value, $column_name);
			}

		// lang codes case. Resolve every code to a locator
			$ar_locators	= [];
			$project_langs	= common::get_ar_all_langs();
			foreach ($ar_codes as $current_code) {

				// resolve the code against the languages section
				$section_id = lang::get_section_id_from_code($current_code);
				if ($section_id===null) {

					debug_log(__METHOD__
						." Unable to resolve lang code: ". PHP_EOL
						.' code: ' . to_string($current_code) . PHP_EOL
						.' column_name: ' . $column_name
						, logger::ERROR
					);

					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= stripslashes( $import_value );
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: invalid lang code '. to_string($current_code);
					$response->errors[] = $failed;

					return $response;
				}

				// warn when the code is not part of the project configured languages
				if (!in_array($current_code, $project_langs)) {
					$warning = new stdClass();
						$warning->section_id		= $this->section_id;
						$warning->data				= stripslashes( $import_value );
						$warning->component_tipo	= $this->get_tipo();
						$warning->msg				= 'WARNING: lang '. to_string($current_code)
							.' was imported, but it will not be accessible until the project languages include it';
					$response->warnings[] = $warning;
				}

				// build the locator as component_relation_common does
				$locator = new locator();
					$locator->set_section_tipo(DEDALO_LANGS_SECTION_TIPO);
					$locator->set_section_id($section_id);
					$locator->set_type($this->get_relation_type());
					$locator->set_from_component_tipo($this->tipo);

				$ar_locators[] = $locator;
			}

		$response->result	= $ar_locators;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



}//end class component_select_lang
