<?php declare(strict_types=1);
include_once 'trait.search_component_iri.php';
include dirname(__FILE__) . '/class.dd_iri.php';
/**
* CLASS COMPONENT_IRI
* Manages Internationalized Resource Identifier (IRI) components in Dédalo.
*
* Stores one or more web URLs / URIs per record, each with an optional
* human-readable title label. Supports Unicode characters in URLs (IRI
* standard, RFC 3987), unlike plain ASCII URIs. The component is
* "literal-direct": it holds final URL strings, not locators to other
* sections (contrast with component_portal or component_select).
*
* Typical use-cases in cultural-heritage records:
* - Linked-open-data authority references (Wikidata, VIAF, GeoNames, Getty AAT/ULAN, nomisma …)
* - Permalinks to external catalogues, archives or bibliographic records
* - External media source URLs paired with companion media components via
*   the `use_active_check` property flag
*
* Data shape stored in the matrix `iri` column (flat array, language per item):
* ```json
* [
*   { "id": 1, "iri": "https://dedalo.dev", "lang": "lg-nolan" },
*   { "id": 2, "iri": "https://nomisma.org", "lang": "lg-nolan" }
* ]
* ```
* Each item is a dd_iri DTO; `id` is the per-item counter minted server-side
* and is the pairing key for the structured title label held in the companion
* component_dataframe (slot dd560, DEDALO_COMPONENT_IRI_LABEL_DATAFRAME).
*
* The literal `title` property on each item is deprecated since 6.8.0. New
* labels are stored only in the paired dataframe; the literal title is kept
* readable as a fallback for legacy rows until the title-materialization
* migration runs.
*
* The component is non-translatable by default (translatable=false, fixed in
* __construct), but sets with_lang_versions=true so per-language URL variants
* can be added via tool_lang / tool_lang_multi; language variants share the
* same `id`.
*
* get_properties() always injects the title label dataframe into
* source.request_config — callers never need to declare it explicitly.
*
* Extends component_common.
* Uses trait search_component_iri for JSONB-path search SQL.
*
* @package Dédalo
* @subpackage Core
*/
class component_iri extends component_common {



	// traits. Files added to current class file to split the large code.
	use search_component_iri;



	/**
	* CLASS VARS
	* @var
	*/
	// with_lang_versions. Set in properties for true like component_input_text
	public bool $with_lang_versions = true;

	// bool . Property to enable or disable the get and set data in different languages
	protected bool $supports_translation = true;

	// bool . included_dataframe_properties
	// Guards against re-injecting the title dataframe into source.request_config
	// on repeated get_properties() calls for the same instance.
	private bool $included_dataframe_properties = false;

	// string . Label dataframe target section tipo
	// The ontology section that holds label records for component_iri titles (dd1706).
	private static string $label_target_section_tipo = 'dd1706';

	// string . Label dataframe target component tipo
	// The component inside dd1706 that stores the human-readable label text (dd1715).
	private static string $label_target_component_tipo = 'dd1715';



	/**
	* GET_LABEL_TARGET_SECTION_TIPO
	* Read accessor for the label target section tipo (dd1706).
	*
	* Exists so that callers outside this class which must build a label pairing
	* locator themselves — currently the v6→v7 upgrade
	* (dataframe_v7_migration::materialize_iri_titles(), which reuses a single
	* component_dataframe instance across items instead of calling
	* save_label_dataframe() per item) — can read the target tipo without
	* touching the private property (a PHP Error) or hard-coding 'dd1706'.
	*
	* @return string - the ontology section tipo holding component_iri label records
	*/
	public static function get_label_target_section_tipo() : string {

		return self::$label_target_section_tipo;
	}//end get_label_target_section_tipo



	/**
	* __CONSTRUCT
	* Initialises a component_iri instance.
	* Forces with_lang_versions=true (language variants share one id) and
	* translatable=false (values default to lg-nolan; per-language versions are
	* added through the lang tools, not via the translatable data path).
	* Delegates all remaining setup to component_common::__construct.
	* @param string $tipo - ontology node tipo (e.g. 'rsc217')
	* @param mixed $section_id = null - record id within the owning section
	* @param string $mode = 'list' - rendering mode: 'edit'|'list'|'tm'|'search'
	* @param string $lang = DEDALO_DATA_NOLAN - active language key
	* @param ?string $section_tipo = null - owning section tipo (mandatory in practice)
	* @param bool $cache = true - whether to use the instance cache
	* @return void
	*/
	protected function __construct( string $tipo, mixed $section_id=null, string $mode='list', string $lang=DEDALO_DATA_NOLAN, ?string $section_tipo=null, bool $cache=true ) {

		// Fix with_lang_versions for clarity
			$this->with_lang_versions = true;

		// Fix translatable for clarity
			$this->translatable = false;

		// common constructor. Creates the component as normally do with parent class
			parent::__construct($tipo, $section_id, $mode, $lang, $section_tipo, $cache);
	}//end __construct



	/**
	* IS_EMPTY
	* Generic check if given value is or not empty considering
	* Use only for data entries.
	* @param mixed $data_item
	* @return bool
	*/
	public function is_empty( mixed $data_item ) : bool {

		// null case explicit
		if( $data_item===null ) {
			return true;
		}

		// non object case. As data entry, is considered empty.
		if ( !is_object($data_item) ) {
			return true;
		}

		// object case
		foreach ($data_item as $key => $value) {
			// Only properties 'iri' and 'title' are checked for empty value.
			if( !in_array($key, ['iri', 'title']) ){
				continue;
			}
			if( !empty($value) || $value==='0' || $value===0 || $value===0.0 ) {
				return false;
			}
		}


		return true;
	}//end is_empty



	/**
	* IMPORT_SAVE
	* Overwrites component_common::import_save() to handle the structured title
	* label dataframe during import.
	*
	* When import data contains a `label_id` property on a value item, that id
	* indicates the target section_id of the companion label dataframe record.
	* This method:
	*   1. Strips `label_id` from each value item (it must not reach the matrix).
	*   2. Builds a locator (DEDALO_RELATION_TYPE_DATAFRAME type) pointing at the
	*      label record and saves it through the title label dataframe component
	*      (DEDALO_COMPONENT_IRI_LABEL_DATAFRAME, slot dd560).
	*   3. Temporarily disables tm_record::$save_tm while saving the dataframe so
	*      that the Time Machine entry covers only the main component_iri save that
	*      follows; the TM guard is always re-enabled in the finally path (inline).
	*   4. Calls $this->save() to persist the clean IRI data.
	*
	* (!) The locator carries the unified id_key only (no legacy section_id_key /
	* section_tipo_key — see dataframe unified contract).
	*
	* @return bool - true on successful save of both dataframe and component data
	*/
	public function import_save() : bool {

		// data candidate to save
		$data = $this->get_data();

		// Label dataframe.
		// Check if the data has a `label_id` property.
		// When the import process set the `label_id` indicate that this data has a label dataframe
		// and `label_id` needs to be used as section_id for the locator of the label dataframe.
		// `label_id` is not a part of the data structure, therefore, it will need to remove.
		$label_dataframe_data = [];
		if( !empty($data) ){

			foreach( $data as $value ){
				if( property_exists($value, 'label_id') ){

					// create new dataframe locator to be set as new data
					// unified contract: id_key only (no legacy section_id_key/section_tipo_key)
					$locator = new locator();
					$locator->set_type( DEDALO_RELATION_TYPE_DATAFRAME );
					$locator->set_section_tipo( component_iri::$label_target_section_tipo );
					$locator->set_section_id( $value->label_id );
					$locator->set_id_key( (int)$value->id );
					$locator->set_main_component_tipo( $this->tipo );

					$label_dataframe_data[]	= $locator;

					// remove the property label_id
					unset($value->label_id);
				}
			}
			// set the clean data without the label_id
			$this->set_data( $data );
		}

		if( !empty($label_dataframe_data) ){

			// component dataframe of the component iri (bulk label sync caller)
			$caller_dataframe = new stdClass();
				$caller_dataframe->main_component_tipo	= $this->tipo;
				$caller_dataframe->section_tipo			= $this->section_tipo;

			// Build the component
			$component_dataframe_label = component_common::get_instance(
				'component_dataframe', // string model
				DEDALO_COMPONENT_IRI_LABEL_DATAFRAME, // string tipo
				$this->section_id, // string section_id
				'list', // string mode
				DEDALO_DATA_NOLAN, // string lang
				$this->section_tipo,// string section_tipo,
				false, //cache
				$caller_dataframe // caller dataframe
			);

			$component_dataframe_label->empty_full_data_associated_to_main_component();

			$component_dataframe_label->set_data( $label_dataframe_data );
			// remove the time machine to save the dataframe
			// the main component_iri will save the full imported data in save
			$dataframe_section = $component_dataframe_label->get_my_section();
			tm_record::$save_tm = false;
			$component_dataframe_label->save();
			// re activate the time machine
			tm_record::$save_tm = true;
		}

		// save the component
		// it will save the dataframe in Time machine also.
		return $this->save();
	}//end import_save



	/**
	* GET_PROPERTIES
	* overwrite the common get_properties()
	* Use to define a fixed dataframe for the component.
	* component_iri use a component_dataframe to define a title in a structured data
	* this component_dataframe is always injected into the request_config for all component_iri
	* @return object|null $properties
	*/
	public function get_properties() : ?object {

		if ( $this->included_dataframe_properties ){
			return $this->properties; // already fixed
		}

		$ontology_properties = parent::get_properties() ?? new stdClass();

		$sqo_section_tipo = new stdClass();
			$sqo_section_tipo->value = [$this->section_tipo];
			$sqo_section_tipo->source = 'section';

		$sqo_data = (object)[
			'section_tipo' => [$sqo_section_tipo]
		];
		$sqo = new search_query_object($sqo_data);

		$ddo = new dd_object();
			$ddo->set_info( 'Title dataframe' );
			$ddo->set_mode( 'edit' );
			$ddo->set_tipo( DEDALO_COMPONENT_IRI_LABEL_DATAFRAME );
			$ddo->set_view( 'line' );
			$ddo->set_parent( 'self' );
			$ddo->set_section_tipo( $this->section_tipo );

		$show = new stdClass();
			$show->ddo_map = [$ddo];
			$show->fields_separator = ' | ';

		$source = new stdClass();
		$source->request_config = $ontology_properties->source->request_config ?? [];
		$source->request_config[] = (object)[
			'sqo'	=> $sqo,
			'show'	=> $show
		];

		$ontology_properties->source = $source;

		// fix the properties
		$this->properties = $ontology_properties;

		$this->included_dataframe_properties = true;

		return $ontology_properties;
	}//end get_properties



	/**
	* GET_GRID_VALUE
	* Generic atoms adapter cell (cell_type 'iri' comes from the atoms)
	* plus the raw 'data' payload kept for the legacy iri grid renderers
	* (view_table_dd_grid render_iri_column; likely dead, flagged for
	* removal once confirmed unused).
	* @param object|null $ddo = null
	* @return dd_grid_cell_object $value
	*/
	public function get_grid_value( ?object $ddo=null ) : dd_grid_cell_object {

		$dd_grid_cell_object = parent::get_grid_value($ddo);
		$dd_grid_cell_object->set_data( $this->get_data_lang() );

		return $dd_grid_cell_object;
	}//end get_grid_value



	/**
	* GET_EXPORT_VALUE
	* Atoms based export contract (see component_common::get_export_value).
	* One atom per data item: iri and resolved title (dataframe paired label)
	* joined with fields_separator, cell_type 'iri'.
	* The leaf segment fields_separator is set to the resolved
	* records_separator because the legacy grid pre-joined the items with
	* records_separator (flat output parity).
	* @param export_context|null $context = null
	* @return export_value
	*/
	public function get_export_value( ?export_context $context=null ) : export_value {

		$context = $context ?? new export_context();

		// separators. resolved as the legacy get_grid_value
			$properties			= $this->get_properties();
			$fields_separator	= $context->ddo?->fields_separator
				?? $properties?->fields_separator
				?? ', ';
			$records_separator	= $context->ddo?->records_separator
				?? $properties?->records_separator
				?? ' | ';

		// own segment. items join with records_separator (legacy pre-join parity)
			$segment = new export_path_segment($this->section_tipo, $this->tipo, (object)[
				'model'				=> $this->get_model(),
				'fields_separator'	=> $records_separator,
				'records_separator'	=> $records_separator,
				// relation traversal position (set by the calling relation via descend)
				'item_index'		=> $context->item_index,
				'section_id'		=> $context->item_section_id
			]);
			$path = [...$context->path_prefix, $segment];

		// export_value
			$export_value = new export_value([], $this->get_label(), get_called_class());

		// data items
			$data = $this->get_data_lang();
			if (empty($data)) {
				return $export_value;
			}

			$value_index = 0;
			foreach ($data as $current_value) {

				$ar_parts = [];

				// iri property
					$current_iri = $current_value->iri ?? null;
					if ($current_iri) {
						$ar_parts[] = $current_iri;
					}

				// title property (resolved, never assigned back into live data;
				// see get_grid_value note about the title duality)
					$current_title = $this->resolve_title( $current_value );
					if (!empty($current_title)) {
						$ar_parts[] = $current_title;
					}

				$export_value->add_atom( new export_atom($path, implode($fields_separator, $ar_parts), (object)[
					'cell_type'		=> 'iri',
					'value_index'	=> $value_index++,
					'lang'			=> $current_value->lang ?? $this->lang
				]) );
			}


		return $export_value;
	}//end get_export_value



	/**
	* GET_DIFFUSION_DATA
	* Resolve the default diffusion data
	* is used by the `diffusion_data`
	* for component_section_id the default is its own data
	* @param object $ddo
	* @param ?string $diffusion_element_tipo
	* @return array $diffusion_data
	*
	* @see diffusion_chain_processor (consumes the returned diffusion_data_object items)
	* @test false
	*/
	public function get_diffusion_data( object $ddo, ?string $diffusion_element_tipo=null ) : array {

		// Default diffusion data object
		$diffusion_data_object = new diffusion_data_object( (object)[
			'tipo'	=> $this->tipo,
			'lang'	=> null,
			'value'	=> null,
			'id'	=> $ddo->id ?? null
		]);

		// Resolve the data by default
			// If the ddo doesn't provide any specific function the component will use a get_url as default.
			$data = $this->get_data();

			// if the ddo provides a data_slice property, use it to slice the data
			if(isset($ddo->data_slice) && !empty($data)){
				$data = array_slice($data, $ddo->data_slice->offset, $ddo->data_slice->length);
			}

			if(!empty($data)) {
				$processed_data = [];
				foreach ($data as $current_data) {
					if(!empty($current_data)) {
						$cloned_data = clone $current_data;
						$cloned_data->title = $this->resolve_title($current_data);
						// Strip the internal per-item lang marker (lg-nolan): it is a storage
						// detail not part of the diffused IRI shape. v6 omits it; keeping it
						// would diverge ({id,iri,title} vs {id,iri,lang,title}).
						unset($cloned_data->lang);
						$processed_data[] = $cloned_data;
					}
				}

				$diffusion_data_object->value = $processed_data;
			}

		$diffusion_data = [$diffusion_data_object];


		return $diffusion_data;
	}//end get_diffusion_data



	/**
	* RESOLVE_TITLE
	* Resolve the IRI title using the dataframe value when is available.
	* @param object $value
	*  E.g. {"id":1,"title":"Old title","iri":"https://dedalo.dev"}
	* @return string|null $title
	*/
	public function resolve_title( object $value ) : ?string {

		// rows without id cannot pair a frame (very old data): literal fallback
		if (!isset($value->id)) {
			return $value->title ?? null;
		}

		// dataframe label paired by the item id (trait single authority path)
		$component_dataframe_label = $this->get_dataframe_instance(
			(int)$value->id, // item id (pairing key)
			DEDALO_COMPONENT_IRI_LABEL_DATAFRAME // dataframe slot tipo
		);
		// dataframe value as string
		$dataframe_label = $component_dataframe_label
			? $component_dataframe_label->get_value()
			: null;

		// Set title with fallback from dataframe value to data item value
		// (deprecated literal `title`, kept readable until the title
		// materialization migration runs).
		$title = $dataframe_label ?? $value->title ?? null;


		return $title;
	}//end resolve_title



	/**
	* UPDATE_DATA_VERSION
	* @param object $options
	* @return object $response
	*	$response->result = 0; // the component don't have the function "update_data_version"
	*	$response->result = 1; // the component do the update"
	*	$response->result = 2; // the component try the update but the data don't need change"
	* 	$response->new_data = mixed; // new data when result is 1
	* 	$response->msg = string; // status message
	*/
	public static function update_data_version(object $options) : object {

		// Validate options structure
		if (!isset($options->update_version)) {
			throw new InvalidArgumentException("Missing required option: update_version");
		}

		// options
			$update_version	= $options->update_version ?? null;
			$data_unchanged	= $options->data_unchanged ?? null;
			$reference_id	= $options->reference_id ?? '';
			$tipo			= $options->tipo ?? null;
			$section_id		= $options->section_id ?? null;
			$section_tipo	= $options->section_tipo ?? null;
			$context		= $options->context ?? 'update_component_data';

		// model. Expected 'component_iri'
		$model = ontology_node::get_model_by_tipo( $tipo );

		// Response
		$response = new stdClass();

		// Safe version_string
		$version_string = '';
		if (is_array($update_version)) {
			$version_string = implode('.', $update_version);
		} elseif (is_string($update_version)) {
			$version_string = $update_version;
		} else {
			$response->result = 0;
			$response->msg = "Invalid update_version format";
			return $response;
		}

		switch ($version_string) {

			default:

				$response->result	= 0;
				$response->msg		= "This component '$model' don't have update to this version ($version_string). Ignored action";
				break;
		}


		return $response;
	}//end update_data_version



	/**
	* URL_TO_IRI
	* Wraps a plain URL string in a dd_iri DTO for use with component_iri data.
	* @param string $url
	* @return dd_iri $data_iri
	*/
	public function url_to_iri(string $url) : dd_iri {

		$data_iri = new dd_iri();
			$data_iri->set_iri($url);

		return $data_iri;
	}//end url_to_iri



	/**
	* CONFORM_IMPORT_DATA
	* @param string $import_value
	* @param string $column_name
	* @return object $response
	*/
	public function conform_import_data(string $import_value, string $column_name) : object {

		// Response
			$response = new stdClass();
				$response->result	= null;
				$response->errors	= [];
				$response->msg		= 'Error. Request failed';

		// object | array case
			// Check if is a JSON stringified. Is yes, decode
			// if data is a object | array it will be the Dédalo format and check if the IRI is OK.
			if(json_handler::is_json($import_value)){

				// try to JSON decode (null on not decode)
				$data_from_json	= json_handler::decode($import_value);

				// data send is an object
				// it could be a non translatable object with the iri data:
				// {"iri":"https://dedalo.dev"}
				// or a translatable object, that can be set like:
				// {"lg-spa":{"iri":"https://dedalo.dev"}}
				// or with a string as value
				// {"lg-spa":"https://dedalo.dev"}
				if(is_object($data_from_json)){

					$first_key = array_keys((array)$data_from_json)[0];
					// check if the object is a translatable
					if (strpos($first_key, 'lg-')===0) {

						$conformed_value = new stdClass();

						foreach ($data_from_json as $lang => $current_value) {

							$valid_langs = common::get_ar_all_langs();
							$valid_langs[] = DEDALO_DATA_NOLAN;
							if(!in_array($lang, $valid_langs)){

								debug_log(__METHOD__
									." invalid language, looks like a syntax error: ". PHP_EOL
									. to_string($import_value)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($import_value);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: language is not define in the config '. to_string($lang);
								$response->errors[] = $failed;

								return $response;
							}

							$safe_ar_value = is_array($current_value)
								? $current_value
								: [$current_value];

							$value = [];
							foreach ($safe_ar_value as $key => $iri_object) {

								$data_iri = new stdClass();
								// data send is an object, therefore it has almost an iri property defined
								// {"iri":"https://dedalo.dev"}
								if(is_object($iri_object)){

									if(!empty($iri_object->iri)){
										// iri must be a string
										if (!is_string($iri_object->iri)) {
											$failed = new stdClass();
												$failed->section_id		= $this->section_id;
												$failed->data			= to_string($import_value);
												$failed->component_tipo	= $this->get_tipo();
												$failed->msg			= 'IGNORED: malformed data, iri must be a string '. to_string($import_value);
											$response->errors[] = $failed;

											return $response;
										}
										// remove unused spaces or other invalid code as \t \n, etc
										$iri_object->iri = trim($iri_object->iri);
										$result = $this->has_protocol($iri_object->iri);
										if($result===false){

											// import value seems to be a JSON malformed.
											// it begin [" or end with "]
											// log JSON conversion error
											debug_log(__METHOD__
												." invalid http uri value, looks like a syntax error: ". PHP_EOL
												. to_string($import_value)
												, logger::ERROR
											);

											$failed = new stdClass();
												$failed->section_id		= $this->section_id;
												$failed->data			= to_string($import_value);
												$failed->component_tipo	= $this->get_tipo();
												$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
											$response->errors[] = $failed;

											return $response;
										}

										$data_iri->iri = $iri_object->iri;
									}
									// set the id given
									if(!empty($iri_object->id)){
										$data_iri->id = $iri_object->id;
									}
									// set the label_id given, used to create the label dataframe
									// this property will not saved
									if(!empty($iri_object->label_id)){
										$data_iri->label_id = $iri_object->label_id;
									}
									// set the title given - Deprecated
									if(!empty($iri_object->title)){
										$data_iri->title = $iri_object->title;
									}
								}else if(is_string($iri_object)){
									// data send is a string, therefore value is the URL
									// "https://dedalo.dev"
									// or the value has the label dataframe
									// "3, https://dedalo.dev" || "dedalo, https://dedalo.dev"

									$properties = $this->get_properties();

									$fields_separator = isset($properties->fields_separator)
										? $properties->fields_separator
										: ', ';

									$valid_string			= self::is_plain_bracket_string($iri_object);
									$has_field_separator	= strpos($iri_object, $fields_separator.'http')!==false;
									$with_protocol			= $this->has_protocol($iri_object);

									if($has_field_separator===false && ($valid_string===false || $with_protocol===false)){
										// import value seems to be a JSON malformed.
										// it begin [" or end with "]
										// log JSON conversion error
										debug_log(__METHOD__
											." invalid http uri value, looks like a syntax error: ". PHP_EOL
											. to_string($iri_object)
											, logger::ERROR
										);

										$failed = new stdClass();
											$failed->section_id		= $this->section_id;
											$failed->data			= to_string($iri_object);
											$failed->component_tipo	= $this->get_tipo();
											$failed->msg			= 'IGNORED: malformed data '. to_string($iri_object);
										$response->errors[] = $failed;

										return $response;
									}

									// set the string value
									$data_iri = $this->conform_string_import_data( $iri_object );
								}

								$value[] = $data_iri;
							}
							// set new object with its lang
							$conformed_value->$lang = $value;
						}

						$response->result	= $conformed_value ?? null;
						$response->msg		= 'OK';

						return $response;

					}else{
						// non translatable object
						// {"iri":"https://dedalo.dev"}
						$iri_object = new stdClass();
						if(isset($data_from_json->iri)){

							// iri must be a string
							if (!is_string($data_from_json->iri)) {
								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($data_from_json);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: malformed data, iri must be a string '. to_string($data_from_json);
								$response->errors[] = $failed;

								return $response;
							}

							// remove unused spaces or other invalid code as \t \n, etc
							$data_from_json->iri = trim($data_from_json->iri);

							$result = $this->has_protocol($data_from_json->iri);
							if($result===false){

								// import value seems to be a JSON malformed.
								// it begin [" or end with "]
								// log JSON conversion error
								debug_log(__METHOD__
									." invalid http uri value, looks like a syntax error: ". PHP_EOL
									. to_string($data_from_json)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($data_from_json);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: malformed data '. to_string($data_from_json);
								$response->errors[] = $failed;

								return $response;
							}

							$iri_object->iri = $data_from_json->iri;
						}
						// set the id given
						if(isset($data_from_json->id)){
							$iri_object->id = $data_from_json->id;
						}
						// set the label_id given, used to create the label dataframe
						// this property will not saved
						if(!empty($data_from_json->label_id)){
							$iri_object->label_id = $data_from_json->label_id;
						}
						// set the title given - Deprecated
						if(isset($data_from_json->title)){
							$iri_object->title = $data_from_json->title;
						}
						// set the lang given. Preserve it: component_iri supports translation
						// and flat data items carry their own lang (raw export format)
						if(isset($data_from_json->lang)){
							$iri_object->lang = $data_from_json->lang;
						}

						// empty object check. Do not save data as [{}]
						if (empty((array)$iri_object)) {

							$failed = new stdClass();
								$failed->section_id		= $this->section_id;
								$failed->data			= to_string($data_from_json);
								$failed->component_tipo	= $this->get_tipo();
								$failed->msg			= 'IGNORED: object without iri data '. to_string($data_from_json);
							$response->errors[] = $failed;

							return $response;
						}

						$value = [$iri_object];

						$response->result	= $value;
						$response->msg		= 'OK';

						return $response;
					}
				}

				// the importer support array of objects (default, iri data) of array of strings as:
				// default iri
				// [{"iri":"https://dedalo.dev","title":"Dedalo webpage"},{"iri":"https://dedalo.dev/docs","title":"Dedalo documentation"}]
				// Or like string
				// ["https://dedalo.dev","https://dedalo.dev/docs"]
				if(is_array($data_from_json)){

					$value = [];
					foreach ($data_from_json as $current_value) {
						// check if the value is a flat string with the uri
						if(is_string($current_value)){

							$properties = $this->get_properties();

							$fields_separator = isset($properties->fields_separator)
								? $properties->fields_separator
								: ', ';

							$has_field_separator	= strpos($current_value, $fields_separator.'http')!==false;
							$with_protocol			= $this->has_protocol($current_value);
							if ($has_field_separator===false && $with_protocol===false) {

								// error
								debug_log(__METHOD__
									." invalid http uri value, looks like a syntax error: ". PHP_EOL
									. to_string($current_value)
									, logger::ERROR
								);

								$failed = new stdClass();
									$failed->section_id		= $this->section_id;
									$failed->data			= to_string($current_value);
									$failed->component_tipo	= $this->get_tipo();
									$failed->msg			= 'IGNORED: malformed data '. to_string($current_value);
								$response->errors[] = $failed;

								return $response;
							}
							// set the string value
							$iri_object = $this->conform_string_import_data( $current_value );

							$value[] = $iri_object;

							// $value[] = $iri_object;
						// check if the value is a object
						}else if(is_object($current_value)){

							$iri_object = new stdClass();

							if(isset($current_value->iri)){

								// iri must be a string
								if (!is_string($current_value->iri)) {
									$failed = new stdClass();
										$failed->section_id		= $this->section_id;
										$failed->data			= to_string($current_value);
										$failed->component_tipo	= $this->get_tipo();
										$failed->msg			= 'IGNORED: malformed data, iri must be a string '. to_string($current_value);
									$response->errors[] = $failed;

									return $response;
								}
								// remove unused spaces or other invalid code as \t \n, etc
								$current_value->iri = trim($current_value->iri);

								$result = $this->has_protocol($current_value->iri);
								if($result===false){

									// import value seems to be a JSON malformed.
									// it begin [" or end with "]
									// log JSON conversion error
									debug_log(__METHOD__
										." invalid http uri value, looks like a syntax error: ". PHP_EOL
										. to_string($current_value)
										, logger::ERROR
									);

									$failed = new stdClass();
										$failed->section_id		= $this->section_id;
										$failed->data			= to_string($current_value);
										$failed->component_tipo	= $this->get_tipo();
										$failed->msg			= 'IGNORED: malformed data '. to_string($current_value);
									$response->errors[] = $failed;

									return $response;
								}

								$iri_object->iri = $current_value->iri;
							}
							// set the id given
							if(isset($current_value->id)){
								$iri_object->id = $current_value->id;
							}
							// set the label_id given, used to create the label dataframe
							// this property will not saved
							if(!empty($current_value->label_id)){
								$iri_object->label_id = $current_value->label_id;
							}
							// set the title given - Deprecated
							if(isset($current_value->title)){
								$iri_object->title = $current_value->title;
							}
							// set the lang given. Preserve it: component_iri supports translation
							// and flat data items carry their own lang (raw export format)
							if(isset($current_value->lang)){
								$iri_object->lang = $current_value->lang;
							}

							$value[] = $iri_object;
						}
					}

					$response->result	= $value ?? null;
					$response->msg		= 'OK';

					return $response;

				}else{

					$response->result	= null;
					$response->msg		= 'Error. Expected array and get: '.gettype($data_from_json);

					return $response;
				}
			}

		// String case
		// the value can be:
		// A literal URI like :
		// 		https//dedalo.dev
		// a multiple parts of the data with separator | and , like:
		// 		dédalo, https://dedalo.dev | nomisma, https//nomisma.org | 3, https://wikidata.org
		// it will change to:
		// 		[{"label_id":1,"iri":"https://dedalo.dev"},
		//		 {"label_id":2,"iri":"https://nomisma.org"},
		//		 {"label_id":3,"iri":"https://wikidata.org"}]
		// label_id is the target section_id for label dataframe of the values: dédalo, nomisma and wikidata
		// the label dataframe will be created when the component save
		// @see Save()
			$valid = self::is_plain_bracket_string($import_value);
			if ($valid===false) {

				// import value seems to be a JSON malformed.
				// it begin [" or end with "]
				// log JSON conversion error
				debug_log(__METHOD__
					." invalid JSON value, looks like a syntax error: ". PHP_EOL
					. to_string($import_value)
					, logger::ERROR
				);

				$failed = new stdClass();
					$failed->section_id		= $this->section_id;
					$failed->data			= stripslashes( $import_value );
					$failed->component_tipo	= $this->get_tipo();
					$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
				$response->errors[] = $failed;

				return $response;
			}

			$value = null;
			if(!empty($import_value)) {

				$iri_object = new stdClass();

				$properties = $this->get_properties();

				$records_separator = isset($properties->records_separator)
					? $properties->records_separator
					: ' | ';

				$fields_separator = isset($properties->fields_separator)
					? $properties->fields_separator
					: ', ';

				$has_records_separator	= strpos($import_value, $records_separator)!==false;
				$has_field_separator	= strpos($import_value, $fields_separator.'http')!==false;
				$with_protocol			= $this->has_protocol($import_value);

				if ($has_records_separator===false && $has_field_separator===false && $with_protocol===false) {

					// error
					debug_log(__METHOD__
						." invalid http uri value, looks like a syntax error: ". PHP_EOL
						. to_string($import_value)
						, logger::ERROR
					);

					$failed = new stdClass();
						$failed->section_id		= $this->section_id;
						$failed->data			= to_string($import_value);
						$failed->component_tipo	= $this->get_tipo();
						$failed->msg			= 'IGNORED: malformed data '. to_string($import_value);
					$response->errors[] = $failed;

					return $response;
				}else{

					$value = [];
					$values = explode($records_separator, $import_value);

					foreach ($values as $current_value) {
						// set the string value
						$iri_object = $this->conform_string_import_data( $current_value );

						$value[] = $iri_object;
					}
				}

			}//end if(!empty($import_value))

		$response->result	= $value;
		$response->msg		= 'OK';


		return $response;
	}//end conform_import_data



	/**
	* HAS_PROTOCOL
	* To be used in different cases.
	* When import values are an array of objects (IRI format)
	* or array of strings
	* or string values needed to begin with the protocol HTTP or HTTPS
	* @param string $text_value
	* @return bool
	*/
	private function has_protocol(string $text_value) : bool  {

		$begins_http	= substr($text_value, 0, 7);
		$begins_https	= substr($text_value, 0, 8);

		if($begins_http === 'http://' || $begins_https === 'https://') {
			return true;
		}

		return false;
	}//end has_protocol



	/**
	* CONFORM_STRING_IMPORT_DATA
	* Conform the string import data to an IRI object
	* @param string $value
	* @return object $iri_object
	*/
	private function conform_string_import_data( string $value) : object {

		// get the component properties
		$properties = $this->get_properties();

		// get the fields separator, it can be defined in properties of use the default
		$fields_separator = isset($properties->fields_separator)
			? $properties->fields_separator
			: ', ';

		$iri_object = new stdClass();

		$fields = explode($fields_separator, $value);

		if ( $this->has_protocol($fields[0])===true ) {
			$iri_object->iri = $fields[0];
		}else{
			// check if the value is a number: 1 or "4"
			// if it is a number it will be interpreted as the target section_id of the label dataframe
			// and set as label_id
			// if the value is a string: "dedalo" or "wikidata"
			// check the value in the list and give me the id, if not exist create new one.
			if( is_numeric($fields[0]) ){
				$iri_object->label_id = (int)$fields[0];

			}else{
				// string case.
				// set the new label, if exist give me the section_id, if not create new one and give me its section_id
				// Remove spaces
				$new_label = trim($fields[0]);

				if( !empty($new_label)){
					$target_section_id = component_iri::save_label_dataframe_from_string( $new_label );
					$iri_object->label_id = (int)$target_section_id;
				}
			}

			// $iri_object->title = $fields[0];
		}
		if ( isset($fields[1]) && $this->has_protocol($fields[1])===true ) {
			$iri_object->iri = $fields[1];
		}

		return $iri_object;
	}//end conform_string_import_data



	/**
	* GET_LABEL_RECORD
	* Search the target section of component dataframe `dd1706`
	* and return the result. Is used to check if the given label already exists.
	* @param string $label
	* @return object|null $label_record
	*/
	private static function get_label_record( string $label ) : ?object {

		// Sanitize input
		$new_label = trim(strip_tags($label));

		if ($new_label === '') {
			return null;
		}

		// Build the query as a PHP object.
		$search_query_object = (object)[
			'select' => [],
			'section_tipo' => ['dd1706'],
			'limit' => 1,
			'filter' => (object)[
				'$and' => [(object)[
					'q' => [$new_label],
					'q_operator' => null,
					'path' => [(object)[
						'section_tipo' => 'dd1706',
						'component_tipo' => 'dd1715'
					]]
				]]
			]
		];

		try {
			// search the label into target section:
			$search = search::get_instance($search_query_object);
			$db_result = $search->search();

			$record = $db_result
				? ($db_result->fetch_one() ?: null)
				: null;

			return $record;

		} catch (Exception $e) {
			debug_log(__METHOD__
				. ' Search failed: ' . $e->getMessage()
				, logger::ERROR
			);
			return null;
		}
	}//end get_label_record



	/**
	* SAVE_LABEL_DATAFRAME_FROM_STRING
	* Check if the label exist in the dataframe value list
	* if not exist; create new section and set the label as new value, and return the locator of the new value
	* is exist; get the locator of the label
	* then assign the locator to dataframe.
	* in both cases create the dataframe component and set the locator of the label.
	* @param string $label "dedalo"
	* @return null|int $target_section_id
	*/
	public static function save_label_dataframe_from_string( string $label ) : ?int {

		// Remove spaces
		$new_label = trim(strip_tags($label));

		if( empty($new_label) ){
			return null;
		}

		// check if the label exist in the value list of the dataframe
		// label record is a minimal row with section_id and section_tipo
		$label_record = component_iri::get_label_record( $new_label );

		if( empty($label_record) ){

			// create new section for label record
				$section_to_save = section::get_instance(
					component_iri::$label_target_section_tipo // string section_tipo
				);
				$target_section_id = $section_to_save->create_record();

			// component to set the new label value
				$tipo = component_iri::$label_target_component_tipo;
				$model = ontology_node::get_model_by_tipo($tipo, true);
				$component_label = component_common::get_instance(
					$model, // string model 'component_input_text'
					$tipo, // string tipo
					$target_section_id, // string section_id
					'list', // string mode
					DEDALO_DATA_NOLAN, // string lang
					component_iri::$label_target_section_tipo // string section_tipo
				);

				$label_data_item = new stdClass();
					$label_data_item->value = $new_label;
					$label_data_item->lang = DEDALO_DATA_NOLAN;

				$component_label->set_data( [$label_data_item] );
				$component_label->save();

				debug_log(__METHOD__
					. " Created new label dataframe" . PHP_EOL
					. ' new_label: ' . to_string($new_label) . PHP_EOL
					.' target_section_id: ' . $target_section_id
					, logger::WARNING
				);

		}else{
			// the label has match with exists data, use the found section_id
			$target_section_id = $label_record->section_id;
		}

		return (int)$target_section_id;
	}//end save_label_dataframe_from_string



	/**
	* SAVE_LABEL_DATAFRAME
	* Save the label into the component_dataframe
	* @param object $options
	* {
	* 	section_tipo	: "rsc205",
	*	section_id		: "1",
	*	component_tipo	: "rsc217",
	*	id_key			: 1,
	* 	target_section_id : "3"
	* }
	* @return bool
	*  	Returns the component save result
	*/
	public static function save_label_dataframe( object $options ) : bool {

		// options
		$section_tipo			= $options->section_tipo;
		$section_id				= $options->section_id;
		$component_tipo			= $options->component_tipo;
		$id_key					= $options->id_key; // the IRI item id (the unified pairing key = main data item id)
		$target_section_id		= $options->target_section_id;

		// component dataframe of the component iri
		// id_key is the MAIN DATA ITEM id (the IRI row id), never a section_id
		$caller_dataframe = new stdClass();
			$caller_dataframe->id_key				= $id_key;
			$caller_dataframe->section_tipo			= $section_tipo;
			$caller_dataframe->main_component_tipo	= $component_tipo;

		// Build the component
		$model = ontology_node::get_model_by_tipo(DEDALO_COMPONENT_IRI_LABEL_DATAFRAME, true);
		$component_dataframe_label = component_common::get_instance(
			$model, // string model 'component_dataframe'
			DEDALO_COMPONENT_IRI_LABEL_DATAFRAME, // string tipo
			$section_id, // string section_id
			'list', // string mode
			DEDALO_DATA_NOLAN, // string lang
			$section_tipo ,// string section_tipo,
			false, //cache
			$caller_dataframe // caller dataframe
		);

		// create new dataframe locator to be set as new data
		// unified contract: id_key only (no legacy section_id_key/section_tipo_key)
		$new_locator = new locator();
			$new_locator->set_type( DEDALO_RELATION_TYPE_DATAFRAME );
			$new_locator->set_section_tipo( component_iri::$label_target_section_tipo );
			$new_locator->set_section_id( $target_section_id );
			$new_locator->set_id_key( (int)$id_key );
			$new_locator->set_main_component_tipo( $component_tipo );

		$component_dataframe_label->set_data( [$new_locator] );

		// Save
		return $component_dataframe_label->save();
	}//end save_label_dataframe



}//end class component_iri
