<?php declare(strict_types=1);
/**
* CLASS COMPONENT_SELECT_LANG
* Specialised select component for choosing a language record from the Dédalo
* languages thesaurus (section tipo 'lg1', constant DEDALO_LANGS_SECTION_TIPO).
*
* Responsibilities and design notes:
* - Stores zero or more locator objects, each pointing to a single languages-section
*   record (e.g. section_tipo='lg1', section_id=17344 for 'lg-spa').
* - Unlike a generic relation component, the selectable option list is derived
*   entirely from DEDALO_PROJECTS_DEFAULT_LANGS (the project's configured language
*   set) rather than from a free-form search over a target section.
* - Extends component_relation_common to inherit locator persistence, relation-table
*   sync, and the default conform_import_data for raw locator/section_id import.
*   Only the parts specific to language semantics are overridden here.
* - The relation type is hard-coded to DEDALO_RELATION_TYPE_LINK (dd151) via
*   $default_relation_type, meaning the generated locators carry a 'link' type
*   rather than the generic 'related' type used by sibling components.
*
* Typical pairings in ontology:
* - Paired with component_text_area via a 'related' ontology edge so that a
*   select_lang instance sits next to its corresponding text field. The pairing
*   is resolved at runtime through get_related_component_text_area().
* - Used by audio/video components to tag the spoken language of a media track.
*
* Data shape (stored in 'relation' JSONB column of the matrix table):
*   [ { "section_tipo": "lg1", "section_id": 17344, "type": "dd151", ... } ]
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
		 * Forces all locators created by this component to use the 'link' relation
		 * type (DEDALO_RELATION_TYPE_LINK = 'dd151') rather than the generic
		 * 'related' type used by most relation components.
		 *
		 * The parent constructor reads this property as the fallback when the
		 * ontology properties do not specify an explicit relation type.
		 *
		 * @var ?string $default_relation_type
		 */
		protected ?string $default_relation_type = DEDALO_RELATION_TYPE_LINK;



	/**
	* GET_VALUE_CODE
	* Resolves the stored locator to a Dédalo language code string such as 'lg-cat'.
	*
	* Only the first locator in the data array is used; a component_select_lang
	* is always single-value in practice, even though the underlying relation column
	* accepts arrays. The actual mapping is delegated to lang::get_code_from_locator(),
	* which looks up the section_id against the languages thesaurus.
	*
	* Typical caller: diffusion pipeline to determine the spoken-language tag for
	* audio/video assets before writing to the MariaDB publication target.
	*
	* @return ?string - Language code (e.g. 'lg-cat', 'lg-spa') or null when the
	*                   component holds no data or the locator cannot be resolved.
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
	* Looks up the ontology to find the single component_text_area that shares
	* a 'related' edge with this select_lang component.
	*
	* The pairing is established in the ontology model (not in code) so that each
	* select_lang widget knows which text field it provides the language tag for.
	* common::get_ar_related_by_model() queries the ontology graph for all tipo
	* neighbours of $this->tipo that match the 'component_text_area' model.
	*
	* Contract:
	* - Exactly one match → returns its tipo string.
	* - More than one match → logs an ERROR and returns null. This is a
	*   misconfiguration that must be fixed in the ontology.
	* - Zero matches → returns null silently (the component simply has no
	*   text-area partner).
	*
	* @return ?string - The tipo of the paired component_text_area, or null.
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
	* Migration hook called by the data-version upgrade toolchain.
	*
	* component_select_lang currently has no version-specific data migrations.
	* Any version string passed in $request_options->update_version falls through
	* to the default switch branch, which returns result=0 (no migration applies).
	*
	* Response result codes:
	*   0 — this component has no migration for the requested version (no-op)
	*   1 — migration was applied successfully
	*   2 — migration was attempted but the data needed no changes
	*
	* @param object $request_options - Migration options object. Recognised keys:
	*   - update_version  array   Version segments, e.g. [7,0,1]
	*   - data_unchanged  mixed   Caller-set flag passed through
	*   - reference_id    mixed   Reference identifier for audit logging
	*   - tipo            ?string Component tipo being migrated
	*   - section_id      ?string Record identifier being migrated
	*   - section_tipo    ?string Section tipo being migrated
	* @return object $response - stdClass with at least ->result (int) and ->msg (string).
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
	* Declares that this component's values may be used as a sort key in list views.
	*
	* The sort is resolved through get_order_path(), which routes ordering through
	* the thesaurus term name stored in the language section rather than the raw
	* locator data, giving meaningful alphabetical ordering by language name.
	*
	* @return bool - Always true; language columns are always sortable.
	*/
	public function get_sortable() : bool {

		return true;
	}//end get_sortable



	/**
	* GET_ORDER_PATH
	* Builds the two-step path descriptor used by the column-ordering infrastructure
	* to sort records by the human-readable name of the selected language rather than
	* by the raw section_id integer.
	*
	* The returned array always contains exactly two path steps:
	*   [0] — The select_lang component itself (entry point into the relation column).
	*   [1] — The DEDALO_THESAURUS_TERM_TIPO component (hierarchy25) inside section
	*          tipo DEDALO_LANGS_SECTION_TIPO ('lg1'), which holds the text name of
	*          the language. The sort engine follows this path to obtain a sortable
	*          string value.
	*
	* Each step is an object with keys:
	*   component_tipo — ontology tipo of the component at that step
	*   model          — PHP class name for that tipo (e.g. 'component_input_text')
	*   name           — Human-readable ontology label for debugging / UI display
	*   section_tipo   — Section tipo that contains the step's component
	*
	* @param string $component_tipo - Tipo of this select_lang instance.
	* @param string $section_tipo   - Section tipo that owns this component instance.
	* @return array - Two-element array of stdClass path step descriptors.
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
	* Builds the selectable language option list from the project's configured
	* language set (DEDALO_PROJECTS_DEFAULT_LANGS) instead of querying a target
	* section — the canonical resolver used by generic relation components.
	*
	* Each option item has the shape:
	*   {
	*     "value"      : locator  — locator pointing to the lg1 record (section_id, section_tipo)
	*     "label"      : string   — language name in $lang, with fallback to any available
	*                               translation or bare ISO code when no name is found
	*     "section_id" : string   — 'lg-' prefixed ISO code, e.g. 'lg-spa' (used client-side
	*                               for quick membership checks without resolving locators)
	*   }
	*
	* The list is sorted alphabetically by label after resolution so the UI dropdown
	* presents languages in the user's current display language order.
	*
	* Note: languages that exist in the project config but whose thesaurus record has
	* no name translation for $lang receive the bare ISO code as a label fallback.
	*
	* @param ?string $lang         = DEDALO_DATA_LANG — Display language for option labels.
	* @param bool    $include_negative = false         — Unused; accepted for interface compatibility.
	* @return object $response - stdClass with ->result (array of option items) and ->msg ('OK').
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
	* Returns the human-readable label(s) of the currently stored language(s),
	* suitable for list/tm display modes (read-only grid cells, exports, etc.).
	*
	* Resolution strategy:
	* 1. Loads the current stored locators via get_data().
	* 2. Calls get_list_of_values() to obtain the full project language option list.
	* 3. Matches each stored locator against the option list by section_id and
	*    section_tipo, collecting the corresponding label strings.
	* 4. If a stored locator does not match any configured project language
	*    (i.e. the language was removed from DEDALO_PROJECTS_DEFAULT_LANGS after
	*    the record was saved), calls get_missing_lang() to synthesise a labelled
	*    fallback entry (label ends with ' *' to signal the missing status).
	*
	* @return ?array - Array of label strings (usually a single-element array), or
	*                  null when the component holds no data.
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
	* Synthesises a display-ready option object for a language locator that is no
	* longer present in the project's configured language set.
	*
	* This can happen when a record was saved with a language that was later removed
	* from DEDALO_PROJECTS_DEFAULT_LANGS. The stored locator is still valid (the
	* thesaurus record exists) but it does not appear in get_list_of_values(). This
	* method produces a fallback item so the UI and list view can still show something
	* meaningful rather than an empty or broken cell.
	*
	* The returned object follows the same shape as an entry in get_list_of_values(),
	* with the label suffixed by ' *' to flag the anomaly to the user:
	*   {
	*     "value"      : { "section_tipo": string, "section_id": string }
	*     "label"      : string  — resolved language name + ' *'
	*     "section_id" : string  — 'lg-' prefixed ISO code (e.g. 'lg-fra')
	*   }
	*
	* Returns null when the locator IS found in the list (i.e. it is not missing).
	*
	* @param object $locator      - Data locator for the stored language record.
	*                               Must have ->section_tipo and ->section_id properties.
	* @param array  $list_of_values - Array of option items in get_list_of_values() result
	*                               format; used for the membership check.
	* @return ?object - Synthesised option object with ' *' label suffix, or null if
	*                   the locator is already present in $list_of_values.
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
	* Normalises an incoming import cell value into an array of locator objects
	* suitable for direct storage in the component's relation column.
	*
	* This override adds native handling for language-code strings on top of the
	* generic locator/section_id handling in component_relation_common. Any format
	* not matched here is delegated to parent::conform_import_data().
	*
	* Accepted import formats (in evaluation order):
	*
	* 1. JSON array of lang code strings:
	*      ["lg-spa","lg-eng"]
	*    All tokens must be valid 'lg-*' codes; otherwise falls through to parent.
	*
	* 2. Flat comma-separated lang code string:
	*      lg-spa
	*      lg-spa, lg-eng
	*    All tokens must match /^lg-[a-z0-9]+$/; mixed strings fall through to parent.
	*
	* 3. JSON locator array or single locator object (delegated to parent):
	*      [{"section_tipo":"lg1","section_id":"17344"}]
	*
	* 4. Numeric section_id list (delegated to parent):
	*      17344,5101
	*
	* Error and warning semantics:
	* - An unresolvable code (lang::get_section_id_from_code() returns null) adds an
	*   entry to $response->errors and returns immediately (import row fails).
	* - A code that resolves but is absent from DEDALO_PROJECTS_DEFAULT_LANGS adds an
	*   entry to $response->warnings but the locator IS still saved. The value will
	*   not be visible in the UI until the project languages include that code.
	* - An empty $import_value returns result=null, which clears the component data.
	*
	* Each resolved locator is built with:
	*   section_tipo = DEDALO_LANGS_SECTION_TIPO ('lg1')
	*   section_id   = integer resolved by lang::get_section_id_from_code()
	*   type         = $this->get_relation_type()  (DEDALO_RELATION_TYPE_LINK)
	*   from_component_tipo = $this->tipo
	*
	* @param string $import_value - Raw cell value from the import source.
	* @param string $column_name  - Column identifier (e.g. 'hierarchy36' or 'rsc85_lg1').
	* @return object $response - stdClass with:
	*   ->result   array|null   Array of locator objects on success; null to clear data.
	*   ->errors   array        Fatal import errors (empty on success).
	*   ->warnings array        Non-fatal warnings (e.g. lang not in project config).
	*   ->msg      string       'OK' on success, error message otherwise.
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
