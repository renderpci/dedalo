<?php declare(strict_types=1);
/*
* REQUEST_CONFIG_OBJECT
* Defines an object with normalized properties and checks

	// STRUCTURE
		api_engine	: engine for manage the request. Default is 'dedalo' but could be external like 'zenon'
		type 		: type of the requests, string that the components can use to define his own requests and modifiers. by default will be 'main'
		sqo			: search query object active width DDBB
		show		: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sent)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sent)
		choose	: layout_map
			(it modify search)
		hide	: layout_map
			(component to resolve to use as internal use data)

	// REQUEST_CONFIG SAMPLE (request configuration for Dédalo API or others API):
		[
			{
				"api_engine" : "dedalo",
				"type" :"main",
				"sqo" : {
					"section_tipo" : [
						{"source" : "hierarchy_types", "value": [2]},
						{"source" : "section", "value":["on1"]},
						{"source" : "self"}
					],
					"filter_by_list" : [
						{"section_tipo": "numisdata3", "component_tipo":"numisdata309"}
					],
					"fixed_filter" : [
						{
							"source" : "fixed_dato",
							"value" : [
							{
								"path": [
									{
										"name"				: "Usable in indexing",
										"model"				: "component_radio_button",
										"section_tipo"		: "hierarchy20",
										"component_tipo"	: "hierarchy24"
									}
								],
								"q":
									{
										"type"					: "dd151",
										"section_id"			: "2",
										"section_tipo"			: "dd64",
										"from_component_tipo"	: "hierarchy24"
									},
									2,
									"abc"
									}
								,
								"q_operator": null
							}]
							,"operator":"$and"
						},
						{
							"source" : "component_data",
							"value" : [
                                {
                                    "q": "rsc423", // the component to get data, it should to be the last component into ddo chain
                                    "path": [
                                        {
                                            "name": "Id",
                                            "model": "component_section_id",
                                            "section_tipo": "rsc420",
                                            "component_tipo": "rsc414"
                                        }
                                    ],
                                    "ddo_map": [
                                        {
                                            "tipo": "numisdata1379",
                                            "parent": "self",
                                            "section_tipo": "numisdata1374"
                                        },
                                        {
                                            "tipo": "rsc423",
                                            "parent": "numisdata1379",
                                            "section_tipo": "rsc197"
                                        }
                                    ],
                                    "q_operator": null,
                                    "search_section_id": true
                                }
                            ],
							"operator" : "$or"
						},
						{
							"source" : "hierarchy_terms",
							"value" : [
								{"section_tipo":"on1","section_id":"2705", "recursive":true},
								{"section_tipo":"on1","section_id":"2748","recursive":true}
							],
							"operator":"$or"
						}
					],
					"filter_by_locators": [{locator},{locator}]
				},
				"show":{
					"get_ddo_map": {
						"model": "section_map",
						"columns": [
							[
								"thesaurus",
								"term"
							]
						]
					},
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": false},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3","fields_separator" : " | "}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
					],

					"fields_separator" : " | ",
					"records_separator" : "<br>",
					"sqo_config": {
						 "operator": "$or",
						 "limit" : 5
					}
				},
				"search":{
					"ddo_map": [
						{"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}
				]},
				"choose":{
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
				]},
				"hide":{
					"ddo_map":[
						{"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
						{"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
						{"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
				]},
			},
			{
				"api_engine": "zenon_engine",
				"sqo" : {
					"section_tipo": [{"source":"section", "value":["zenon1"]}]
				},
				"show": {
					"ddo_map": [
						{"section_tipo":"zenon1","tipo":"zenon3", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon4", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon5", "parent": "zenon1"},
						{"section_tipo":"zenon1","tipo":"zenon6", "parent": "zenon1"}
					]
				}
			}
		]
*/
class request_config_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		 * API engine identifier for processing this request.
		 * Specifies which engine handles the data retrieval (e.g., 'dedalo', 'zenon').
		 * @var ?string $api_engine
		 */
		public ?string $api_engine = null;

		/**
		 * Request configuration type identifier.
		 * Defines the context/purpose of this request (e.g., 'section', 'component', 'search').
		 * @var ?string $type
		 */
		public ?string $type = null;

		/**
		 * Search Query Object defining filter, pagination, and sort criteria.
		 * Contains the SQO used to query and filter the requested data.
		 * @var ?object $sqo
		 */
		public ?object $sqo = null;

		/**
		 * Display configuration for show mode rendering.
		 * Defines which fields/components to display and their presentation options.
		 * @var ?object $show
		 */
		public ?object $show = null;

		/**
		 * Search mode configuration for UI search interface.
		 * Defines search fields, operators, and UI options for the search panel.
		 * @var ?object $search
		 */
		public ?object $search = null;

		/**
		 * Configuration for choose mode element selection.
		 * Defines selectable elements and behavior when user is choosing records.
		 * @var ?object $choose
		 */
		public ?object $choose = null;

		/**
		 * Configuration of elements resolved for internal use but not displayed.
		 * @var ?object $hide
		 */
		public ?object $hide = null;

		/**
		 * API-specific configuration parameters.
		 * Engine-specific settings for external API connections (e.g., Zenon API options).
		 * @var ?object $api_config
		 */
		public ?object $api_config = null;



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) {
			return;
		}

		// set all data properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				if (!method_exists($this, $method)) {
					debug_log(__METHOD__
						. " Ignored non existing method " . PHP_EOL
						. ' method: ' . to_string($method) . PHP_EOL
						. ' data: ' . to_string($data)
						, logger::ERROR
					);
					continue;
				}
				if($value === null && $key!=='api_config') {
					continue;
				}
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* __SET_STATE
	* Magic method to create a new object from an array.
	* It is used to regenerate the object from a serialized string
	* like from var_export action in cache.
	*/
	public static function __set_state($an_array) : object {
        $obj = new request_config_object(
			(object)$an_array
		);

        return $obj;
    }//end __set_state



	/**
	* SET_API_ENGINE
	* @param string $value
	* @return void
	*/
	public function set_api_engine(string $value) : void {

		$this->api_engine = $value;
	}//end set_api_engine



	/**
	* SET_TYPE
	* @param string $value
	* @return void
	*/
	public function set_type(string $value) : void {

		$this->type = $value;
	}//end set_type



	/**
	* SET_SQO
	* @param object $value
	* @return void
	*/
	public function set_sqo(object $value) : void {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	* @param object $value
	* @return void
	*/
	public function set_show(object $value) : void {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	* @param object $value
	* @return void
	*/
	public function set_search(object $value) : void {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	* @param object $value
	* @return void
	*/
	public function set_choose(object $value) : void {

		$this->choose = $value;
	}//end set_choose


	/**
	* SET_HIDE
	* @param object $value
	* @return void
	*/
	public function set_hide(object $value) : void {

		$this->hide = $value;
	}//end set_hide



	/**
	* SET_API_CONFIG
	* @param object|null $value
	* @return void
	*/
	public function set_api_config(object|null $value) : void {

		$this->api_config = $value;
	}//end set_api_config



	/**
	* VALIDATE_CONFIG
	* Pure structural validation of a properties->source->request_config
	* definition (user-edited ontology JSON). Returns a list of issue objects
	* {level, path, message} — empty array means structurally valid.
	* Levels: 'error' (the runtime will drop/degrade this) and 'warning'
	* (suspicious but tolerated).
	*
	* Reusable from: ontology save hooks (non-blocking warnings), batch
	* audits (CLI/maintenance) and tests. It deliberately performs NO
	* ontology lookups (tipo existence is runtime/installation dependent);
	* only shape and grammar are checked, so it is side-effect free.
	*
	* @param mixed $request_config The raw properties->source->request_config value
	* @return array Array of issue objects {level:string, path:string, message:string}
	*/
	public static function validate_config(mixed $request_config) : array {

		$issues = [];
		$add_issue = function(string $level, string $path, string $message) use (&$issues) : void {
			$issues[] = (object)[
				'level'		=> $level,
				'path'		=> $path,
				'message'	=> $message
			];
		};

		// tipo grammar: tld (letters) + digits, or the 'self' placeholder
		$valid_tipo = function($tipo) : bool {
			return is_string($tipo) && ($tipo==='self' || preg_match('/^[a-zA-Z][a-zA-Z_]*[0-9]+$/', $tipo)===1);
		};

		// top level: must be an array of objects
		if (!is_array($request_config)) {
			$add_issue('error', 'request_config', 'Expected array, got ' . gettype($request_config));
			return $issues;
		}

		$known_item_keys = ['api_engine','type','sqo','show','search','choose','hide','api_config'];
		$ddo_sections	 = ['show','search','choose','hide'];

		foreach ($request_config as $i => $item) {

			$item_path = "request_config[$i]";

			if (!is_object($item)) {
				$add_issue('error', $item_path, 'Expected object, got ' . gettype($item));
				continue;
			}

			// unknown top-level keys
			foreach (array_keys(get_object_vars($item)) as $key) {
				if (!in_array($key, $known_item_keys, true)) {
					$add_issue('warning', "$item_path.$key", "Unknown request_config key '$key'");
				}
			}

			// api_engine / type
			if (isset($item->api_engine) && !is_string($item->api_engine)) {
				$add_issue('error', "$item_path.api_engine", 'Expected string api_engine');
			}
			if (isset($item->type) && !is_string($item->type)) {
				$add_issue('error', "$item_path.type", 'Expected string type');
			}

			// sqo
			if (isset($item->sqo)) {
				if (!is_object($item->sqo)) {
					$add_issue('error', "$item_path.sqo", 'Expected object sqo, got ' . gettype($item->sqo));
				} else {
					if (isset($item->sqo->section_tipo) && !is_array($item->sqo->section_tipo)) {
						$add_issue('error', "$item_path.sqo.section_tipo", 'Expected array section_tipo');
					}
					if (isset($item->sqo->fixed_filter) && !is_array($item->sqo->fixed_filter)) {
						$add_issue('error', "$item_path.sqo.fixed_filter", 'Expected array fixed_filter');
					}
					if (isset($item->sqo->filter_by_list) && !is_array($item->sqo->filter_by_list)) {
						$add_issue('error', "$item_path.sqo.filter_by_list", 'Expected array filter_by_list');
					}
					if (isset($item->sqo->limit) && !is_int($item->sqo->limit) && $item->sqo->limit!=='ALL') {
						$add_issue('warning', "$item_path.sqo.limit", "Expected integer (or 'ALL') limit");
					}
				}
			}

			// show is the only section the runtime expects (defaults applied otherwise)
			if (!isset($item->show)) {
				$add_issue('warning', "$item_path.show", 'Missing show definition: the runtime applies an empty default');
			}

			// ddo sections
			foreach ($ddo_sections as $section_name) {
				if (!isset($item->{$section_name})) {
					continue;
				}
				$section = $item->{$section_name};
				$section_path = "$item_path.$section_name";

				if (!is_object($section)) {
					$add_issue('error', $section_path, 'Expected object, got ' . gettype($section));
					continue;
				}

				// get_ddo_map shape
				if (isset($section->get_ddo_map) && $section->get_ddo_map!==false) {
					if (!is_object($section->get_ddo_map)
						|| !isset($section->get_ddo_map->model)
						|| !is_array($section->get_ddo_map->columns ?? null)) {
						$add_issue('error', "$section_path.get_ddo_map", "Expected object with 'model' and 'columns' array");
					}
				}

				// ddo_map
				if (isset($section->ddo_map)) {
					if (!is_array($section->ddo_map)) {
						$add_issue('error', "$section_path.ddo_map", 'Expected array ddo_map, got ' . gettype($section->ddo_map));
						continue;
					}
					foreach ($section->ddo_map as $j => $ddo) {
						$ddo_path = "$section_path.ddo_map[$j]";
						if (!is_object($ddo)) {
							$add_issue('error', $ddo_path, 'Expected object ddo, got ' . gettype($ddo));
							continue;
						}
						if (!isset($ddo->tipo) || !is_string($ddo->tipo) || $ddo->tipo==='') {
							$add_issue('error', "$ddo_path.tipo", 'Missing or invalid ddo tipo (the runtime drops this ddo)');
						} elseif (!$valid_tipo($ddo->tipo)) {
							$add_issue('error', "$ddo_path.tipo", "Invalid tipo grammar '{$ddo->tipo}' (expected tld+number or 'self')");
						}
						if (isset($ddo->section_tipo)
							&& !is_string($ddo->section_tipo)
							&& !is_array($ddo->section_tipo)) {
							$add_issue('error', "$ddo_path.section_tipo", 'Expected string or array section_tipo');
						}
						if (isset($ddo->parent) && !is_string($ddo->parent)) {
							$add_issue('error', "$ddo_path.parent", 'Expected string parent');
						}
					}
				}
			}
		}//end foreach ($request_config as $i => $item)

		return $issues;
	}//end validate_config



	/**
	* SANITIZE_CLIENT_DDO_MAP
	* Security scrub for ddo_map arrays received from the HTTP API
	* (rqo->show / rqo->search). The client is the only untrusted ddo source:
	* every ddo is reduced to the whitelisted display fields below; anything
	* else (injected properties, server-only flags, nested payloads) is
	* stripped before the rqo reaches build_request_config_from_rqo.
	* Tipo/TLD validity and user permissions are enforced later, server-side,
	* in common::validate_requested_ddo.
	*
	* @param array $ddo_map Raw client ddo_map
	* @return array Sanitized ddo_map (objects with whitelisted fields only)
	*/
	public static function sanitize_client_ddo_map(array $ddo_map) : array {

		// Fields a client may legitimately define for a display ddo.
		// 'model' is recalculated server-side; 'permissions' and other
		// server-authoritative fields are intentionally absent.
		static $allowed_fields = [
			'typo',
			'tipo',
			'section_tipo',
			'section_id',
			'parent',
			'mode',
			'lang',
			'view',
			'label',
			'fields_separator',
			'records_separator',
			'value_with_parents',
			'column_id',
			'width',
			'in_mosaic',
			'hover'
		];

		$sanitized = [];
		foreach ($ddo_map as $current_ddo) {

			if (!is_object($current_ddo)) {
				debug_log(__METHOD__
					.' Removed non-object client ddo: ' . to_string($current_ddo)
					, logger::WARNING
				);
				continue;
			}

			$clean_ddo = new stdClass();
			foreach ($allowed_fields as $field) {
				if (property_exists($current_ddo, $field)) {
					$clean_ddo->{$field} = $current_ddo->{$field};
				}
			}

			$sanitized[] = $clean_ddo;
		}

		return $sanitized;
	}//end sanitize_client_ddo_map



	/**
	* GET METHODS
	* By accessors. When property exits, return property value, else return null
	* @param string $name
	*/
	final public function __get(string $name) {

		if (isset($this->$name)) {
			return $this->$name;
		}

		$trace = debug_backtrace();
		debug_log(
			__METHOD__
			.' Undefined property via __get(): '.$name .
			' in ' . $trace[0]['file'] .
			' on line ' . $trace[0]['line'],
			logger::DEBUG);
		return null;
	}
	// final public function __set($name, $value) {
	// 	$this->$name = $value;
	// }



}//end request_config_object
