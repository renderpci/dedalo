<?php declare(strict_types=1);
/**
* REQUEST QUERY OBJECT (RQO)
*
*	DTO that defines an request object with normalized schema properties and validation.


	// STRUCTURE
		id 		: Optional id of the API request
		api_engine : Optional engine name. Default auto added is 'dedalo'
		dd_api	: API class that will be used
		action	: API method that will be used (like 'get_menu')
		source	: component, section, menu, etc that made the call
			action	: API method that will be used with the source
		sqo		: search query object active width DDBB
		show	: layout_map and sqo_config
			(it will create the search and choose, when these objects are not sended)
		search	: layout_map and sqo_config
			(it modify the show and it will create the choose, when these object is not sended)
		choose	: layout_map
			(it modify search) List of elements for choose (service_autocomplete)
		data	: object
			(object used like pre-calculated container (datalist, pagination, etc.) to minimize cpu usage on calls to 'save')
		prevent_lock : bool
			(prevent PHP lock the session while the request is working. For example in 'count' calls)
		options : object
			For to send heterogeneous data to the API. Used by components, tools etc.
		pretty_print : bool
			(output JSON as pretty_print -using whitespace to format it- from API manager)

		// info about
			Mandatory	: dd_api, action, source
			Optional	: sqo, show, search, choose

			If you only send a source, the server will create the basic sqo and will get the layout map from user preset or generic layout from ontoloy.


	// DD_REQUEST format
		[
			{

				"dd_api"		: string // the API class to use,
				"action"		: string // the API method to use
				"source"		: {
					"action"		: string || object || array // the API method modifier to use
					"model"			: string // model of the ddo
					"tipo"			: string // tipo of the ddo
					"section_tipo"	: string // section_tipo of the ddo
					"section_id"	: string || int || null // section_id of the ddo
					"mode"			: string (edit || list || search || ...), mode of the ddo
					"lang"			: string // lang of the ddo
					"value"			: array (optional) [{locator}] || ["text"] || [""] // value of the component to resolve, used by portal in search mode
					"autocomplete"	: boolean || true || false
				},
				"sqo"			: {
					// all sqo definition in search_query_object class
				}
				"show"			: {
					"get_ddo_map" 	:
						{
							// if isset this property ddo_map will be calculated. The value is the model of the ontology term to get the ddo_map, such as "section_map", different sections can define a component or multiple component to build common search and common columns (mint, type, es1, fr1, etc)
							model : string // the ontology model to get the information
							path : array // the path of properties into the object to get the information (stored into properties)

						}
					"ddo_map"		: array [{ddo}, {ddo}] // layout map will be used, with specific path, the ddo are linked by parent to create the path
					"sqo_config"	: {
						// specific sqo configuration for the show
					}
					"interface"		:{
						"button_add" : true || false // control of the input interface button to add new registers
						"button_link" : true || false // control of the input interface button to link existent registers
						"tools" : true || false // control of the input interface to add the tools of the component
						"button_tree" : true || false // control of the input interface button tree
						"button_external" : true || false // control of the refresh button when the data of the portal is external
						"show_autcomplete" : true || false // control of the input interface for autocomplete for search records

					}
				},
				"search"		: {
					"ddo_map"		: array [array {ddo}, {ddo}] // layout map will be used, with specific path
					"sqo_config"	: {
						// specific sqo configuration for the search
				},
				"choose"		: {
					"ddo_map"		: array [array {ddo}, {ddo}] // layout map will be used, with specific path
				},
				options: {
			 		file_data : {
						"name"			: "test26_test3_1.jpg",
						"tmp_dir"		: "DEDALO_UPLOAD_TMP_DIR",
						"key_dir"		: "3d",
						"tmp_name"		: "tmp_test26_test3_1.jpg"
			 		}
			 		target_dir : 'posterframe' // string with the quality folder name.
			 	}
			}
		]


	@see class.request_config_object.php
	// REQUEST_CONFIG (request configuration for Dédalo API or others API):
		[
			{
				"api_engine" : "dedalo",
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
								"f_path" : ["numisdata3","numisdata27"],
								"q":
									{
									"value" : ["{\"section_id\":\"2\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy24\"}",
									2,"abc"]
									}
								,
								"q_operator": null
							}]
							,"operator":"$and"
						},
						{
							"source" : "component_dato",
							"value" : [{
								"q" : {"value":"numisdata36"},
								"q_operator" : null
							}],
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
					[{"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}]
				]},
				"choose":{
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
class request_query_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		 * API manager identifier for handling this request.
		 * Specifies which API endpoint/manager processes the request. Example: 'dd_core_api'.
		 * @var ?string $dd_api
		 */
		public ?string $dd_api = null;

		/**
		 * Action to be performed by the API.
		 * Defines the operation type (e.g., 'read', 'save', 'delete', 'search').
		 * @var ?string $action
		 */
		public ?string $action = null;

		/**
		 * Source object identifying the requesting context.
		 * Contains section_tipo, section_id, tipo, and mode of the calling element.
		 * @var ?object $source
		 */
		public ?object $source = null;

		/**
		 * API engine identifier for data retrieval. Default 'dedalo'.
		 * Specifies the backend engine (e.g., 'dedalo', 'zenon', 'external').
		 * @var ?string $api_engine
		 */
		public ?string $api_engine = 'dedalo';

		/**
		 * Request identifier combining context and parameters.
		 * Unique identifier for this specific request instance.
		 * @var string|int|null $id
		 */
		public string|int|null $id = null;

		/**
		 * Search Query Object for filtering and pagination.
		 * Contains SQO defining search criteria, limits, offsets, and sorting.
		 * @var ?object $sqo
		 */
		public ?object $sqo = null;

		/**
		 * Display configuration for show mode rendering.
		 * Defines which fields/components to display in the response.
		 * @var ?object $show
		 */
		public ?object $show = null;

		/**
		 * Search interface configuration for UI search panel.
		 * Defines search fields, operators, and UI options.
		 * @var ?object $search
		 */
		public ?object $search = null;

		/**
		 * Choose mode configuration for record selection.
		 * Defines selectable elements when user is choosing from records.
		 * @var ?object $choose
		 */
		public ?object $choose = null;

		/**
		 * Request payload data object.
		 * Contains the actual data being sent (for save, update operations).
		 * @var ?object $data
		 */
		public ?object $data = null;

		/**
		 * Whether to prevent PHP session locking.
		 * When true, the session is closed avoiding to write (use with caution).
		 * @var ?bool $prevent_lock
		 */
		public ?bool $prevent_lock = null;

		/**
		 * Whether to pretty-print JSON response output.
		 * When true, formats JSON with indentation for debugging readability.
		 * @var ?bool $pretty_print
		 */
		public ?bool $pretty_print = null;

		/**
		 * Additional request options object.
		 * Contains extra parameters and flags for specialized request handling.
		 * @var ?object $options
		 */
		public ?object $options = null;

		/**
		 * List of property keys that are directly accessible.
		 * Used for validation and serialization of RQO properties.
		 * @var array $direct_keys
		 */
		public static array $direct_keys = [
			'id',
			'api_engine',
			'dd_api',
			'action',
			'source',
			'sqo',
			'show',
			'search',
			'choose',
			'data',
			'prevent_lock',
			'options',
			'pretty_print'
		];



	/**
	* __CONSTRUCT
	* @param object|null $data = null
	*/
	public function __construct( ?object $data=null ) {

		if (is_null($data)) return;

		# Nothing to do on construct (for now)
			// if (!is_object($data)) {
			// 	trigger_error("wrong data format. Object expected. Given: ".gettype($data));
			// 	return false;
			// }

		// default always is 'dedalo'
			$this->api_engine = 'dedalo';

		// set all properties
			foreach ($data as $key => $value) {
				$method = 'set_'.$key;
				$this->{$method}($value);
			}
	}//end __construct



	/**
	* SET_DD_API
	* @param string $value
	* @return void
	*/
	public function set_dd_api(string $value) : void {

		$this->dd_api = $value;
	}//end set_dd_api



	/**
	* SET_ACTION
	* @param string $value
	* @return void
	*/
	public function set_action(string $value) : void {

		$this->action = $value;
	}//end set_action



	/**
	* SET_SOURCE
	* @param object $value
	* @return void
	*/
	public function set_source(object $value) : void {

		$this->source = $value;
	}//end set_source



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
	* SET_OPTIONS
	* @param object $value
	* @return void
	*/
	public function set_options(object $value) : void {

		$this->options = $value;
	}//end set_options



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



}//end request_query_object (RQO)
