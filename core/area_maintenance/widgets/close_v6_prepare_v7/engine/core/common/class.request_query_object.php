<?php declare(strict_types=1);
/**
* CLASS REQUEST_QUERY_OBJECT (RQO)
* Data-transfer object that normalises an inbound API request into a typed, validated structure.
*
* Every HTTP request that enters the Dédalo API carries a JSON body containing one or more
* RQO payloads.  The RQO defines *what* data to fetch (dd_api + action), *where* to look
* (source locator), *how* to filter it (sqo), and *how* to render it (show/search/choose).
* By encapsulating all of this in a single typed object the rest of the pipeline can rely
* on a stable, predictable contract rather than inspecting raw stdClass blobs.
*
* Responsibilities:
* - Hold every parameter that an API call needs: target API class, action verb, source
*   locator, SQO, display-layout maps (show/search/choose), data payload, and flags.
* - Hydrate safely from a raw decoded-JSON object via __construct($data), routing each
*   property through its own setter so subclasses can override individual fields.
* - Expose the canonical list of recognised top-level keys via $direct_keys so that
*   serialisers and sanitisers know exactly which properties belong to an RQO.
*
* Relationship to other request objects:
* - search_query_object (SQO) — carried in the $sqo property; handles search/filter logic.
* - request_config_object  — server-side configuration object that *drives* how the API
*   builds the RQO (see class.request_config_object.php).
*
* Extends stdClass so that dynamic properties injected at runtime by the API pipeline
* are accessible without a declaration.  The setter-based hydration in __construct ensures
* recognised keys are always strongly typed.
*
* // STRUCTURE
*     id          : Optional unique identifier for the request (int or string)
*     api_engine  : Optional engine name.  Default 'dedalo'; alternatives e.g. 'zenon_engine'
*     dd_api      : API class name that will handle the request (e.g. 'dd_core_api')
*     action      : API method to invoke (e.g. 'read', 'save', 'delete', 'search')
*     source      : Locator context — section_tipo, section_id, tipo, mode, lang, value, …
*         action  : Optional action modifier that source passes to the API
*     sqo         : Search Query Object defining filters, pagination, ordering
*     show        : Display layout — ddo_map, sqo_config, interface flags
*                   (also seeds search/choose when those are absent)
*     search      : Search-panel layout — ddo_map, sqo_config
*                   (refines show; also seeds choose when absent)
*     choose      : Record-picker layout — ddo_map
*                   (refines search; used by service_autocomplete)
*     data        : Pre-calculated payload object (datalist, pagination, …) sent with
*                   'save' or similar write operations to avoid redundant CPU work
*     prevent_lock: bool — close PHP session before the request runs to prevent
*                   concurrent session locks (e.g. background count calls)
*     options     : Heterogeneous extra parameters forwarded to the API handler
*                   (e.g. file upload metadata, target directory, quality flags)
*     pretty_print: bool — format the JSON API response with whitespace for debugging
*
* // MANDATORY vs OPTIONAL
*     Mandatory: dd_api, action, source
*     Optional : sqo, show, search, choose, data, prevent_lock, options, pretty_print
*
*     When only source is supplied the server generates a basic SQO and resolves the
*     layout map from the user's preset or the generic ontology layout.
*
*
* // DD_REQUEST FORMAT (one element per logical API call, sent as a JSON array)
*     [
*         {
*             "dd_api"    : string // the API class to use,
*             "action"    : string // the API method to use
*             "source"    : {
*                 "action"        : string || object || array // the API method modifier to use
*                 "model"         : string // model of the ddo
*                 "tipo"          : string // tipo of the ddo
*                 "section_tipo"  : string // section_tipo of the ddo
*                 "section_id"    : string || int || null // section_id of the ddo
*                 "mode"          : string (edit || list || search || ...), mode of the ddo
*                 "lang"          : string // lang of the ddo
*                 "value"         : array (optional) [{locator}] || ["text"] || [""] // value of the component to resolve, used by portal in search mode
*                 "autocomplete"  : boolean || true || false
*             },
*             "sqo"       : {
*                 // all sqo definition in search_query_object class
*             }
*             "show"      : {
*                 "get_ddo_map"   :
*                     {
*                         // if isset this property ddo_map will be calculated. The value is the model of the ontology term to get the ddo_map, such as "section_map", different sections can define a component or multiple component to build common search and common columns (mint, type, es1, fr1, etc)
*                         model : string // the ontology model to get the information
*                         path : array // the path of properties into the object to get the information (stored into properties)
*
*                     }
*                 "ddo_map"       : array [{ddo}, {ddo}] // layout map will be used, with specific path, the ddo are linked by parent to create the path
*                 "sqo_config"    : {
*                     // specific sqo configuration for the show
*                 }
*                 "interface"     :{
*                     "button_add" : true || false // control of the input interface button to add new registers
*                     "button_link" : true || false // control of the input interface button to link existent registers
*                     "tools" : true || false // control of the input interface to add the tools of the component
*                     "button_tree" : true || false // control of the input interface button tree
*                     "button_external" : true || false // control of the refresh button when the data of the portal is external
*                     "show_autcomplete" : true || false // control of the input interface for autocomplete for search records
*
*                 }
*             },
*             "search"    : {
*                 "ddo_map"       : array [array {ddo}, {ddo}] // layout map will be used, with specific path
*                 "sqo_config"    : {
*                     // specific sqo configuration for the search
*             },
*             "choose"    : {
*                 "ddo_map"       : array [array {ddo}, {ddo}] // layout map will be used, with specific path
*             },
*             options: {
*                 file_data : {
*                     "name"          : "test26_test3_1.jpg",
*                     "tmp_dir"       : "DEDALO_UPLOAD_TMP_DIR",
*                     "key_dir"       : "3d",
*                     "tmp_name"      : "tmp_test26_test3_1.jpg"
*                 }
*                 target_dir : 'posterframe' // string with the quality folder name.
*             }
*         }
*     ]
*
*
*     @see class.request_config_object.php
*     // REQUEST_CONFIG (request configuration for Dédalo API or others API):
*         [
*             {
*                 "api_engine" : "dedalo",
*                 "sqo" : {
*                     "section_tipo" : [
*                         {"source" : "hierarchy_types", "value": [2]},
*                         {"source" : "section", "value":["on1"]},
*                         {"source" : "self"}
*                     ],
*                     "filter_by_list" : [
*                         {"section_tipo": "numisdata3", "component_tipo":"numisdata309"}
*                     ],
*                     "fixed_filter" : [
*                         {
*                             "source" : "fixed_dato",
*                             "value" : [
*                             {
*                                 "f_path" : ["numisdata3","numisdata27"],
*                                 "q":
*                                     {
*                                     "value" : ["{\"section_id\":\"2\",\"section_tipo\":\"dd64\",\"type\":\"dd151\",\"from_component_tipo\":\"hierarchy24\"}",
*                                     2,"abc"]
*                                     }
*                                 ,
*                                 "q_operator": null
*                             }]
*                             ,"operator":"$and"
*                         },
*                         {
*                             "source" : "component_dato",
*                             "value" : [{
*                                 "q" : {"value":"numisdata36"},
*                                 "q_operator" : null
*                             }],
*                             "operator" : "$or"
*                         },
*                         {
*                             "source" : "hierarchy_terms",
*                             "value" : [
*                                 {"section_tipo":"on1","section_id":"2705", "recursive":true},
*                                 {"section_tipo":"on1","section_id":"2748","recursive":true}
*                             ],
*                             "operator":"$or"
*                         }
*                     ],
*                     "filter_by_locators": [{locator},{locator}]
*                 },
*                 "show":{
*                     "get_ddo_map": {
*                         "model": "section_map",
*                         "columns": [
*                             [
*                                 "thesaurus",
*                                 "term"
*                             ]
*                         ]
*                     },
*                     "ddo_map":[
*                         {"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": false},
*                         {"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3","fields_separator" : " | "}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
*                         {"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
*                     ],
*
*                     "fields_separator" : " | ",
*                     "records_separator" : "<br>",
*                     "sqo_config": {
*                          "operator": "$or",
*                          "limit" : 5
*                     }
*                 },
*                 "search":{
*                     "ddo_map": [
*                     [{"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}]
*                 ]},
*                 "choose":{
*                     "ddo_map":[
*                         {"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
*                         {"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
*                         {"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
*                 ]},
*             },
*             {
*                 "api_engine": "zenon_engine",
*                 "sqo" : {
*                     "section_tipo": [{"source":"section", "value":["zenon1"]}]
*                 },
*                 "show": {
*                     "ddo_map": [
*                         {"section_tipo":"zenon1","tipo":"zenon3", "parent": "zenon1"},
*                         {"section_tipo":"zenon1","tipo":"zenon4", "parent": "zenon1"},
*                         {"section_tipo":"zenon1","tipo":"zenon5", "parent": "zenon1"},
*                         {"section_tipo":"zenon1","tipo":"zenon6", "parent": "zenon1"}
*                     ]
*                 }
*             }
*         ]
*
* @package Dédalo
* @subpackage Core
*/
class request_query_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		* API manager class name that will handle this request.
		* Identifies the PHP class used as the API entry point (e.g. 'dd_core_api').
		* Must be provided on every request — null means unresolved/not yet set.
		* @var ?string $dd_api
		*/
		public ?string $dd_api = null;

		/**
		* Action verb passed to the API handler.
		* Defines the operation the API class will execute (e.g. 'read', 'save',
		* 'delete', 'get_menu', 'search').  Together with $dd_api this is the
		* minimum routing information the API dispatcher needs.
		* @var ?string $action
		*/
		public ?string $action = null;

		/**
		* Source locator object identifying the requesting context.
		* Contains the tipo, section_tipo, section_id, mode, lang, and optional
		* value/autocomplete fields of the element that triggered the request
		* (a component, section, menu, etc.).  The API uses this to resolve the
		* record being operated on and, when $sqo is absent, to auto-generate a
		* basic search query object.
		* @var ?object $source
		*/
		public ?object $source = null;

		/**
		* Backend engine that will process the data retrieval.
		* Defaults to 'dedalo'.  Alternative engines (e.g. 'zenon_engine') allow
		* request_config_object to fan out to external data sources within the same
		* API call, each governed by its own engine-specific RQO.
		* @var ?string $api_engine
		*/
		public ?string $api_engine = 'dedalo';

		/**
		* Optional unique identifier for this request.
		* Can be an integer or a string (e.g. a section_tipo such as 'oh1').
		* Used by callers to correlate responses when multiple RQOs are batched
		* in a single HTTP call.
		* @var string|int|null $id
		*/
		public string|int|null $id = null;

		/**
		* Search Query Object that controls how records are fetched.
		* When provided, overrides any auto-generated search.  When absent the
		* server builds a default SQO from the $source locator and the section's
		* ontology configuration.  See class.search_query_object.php for the full
		* SQO contract.
		* @var ?object $sqo
		*/
		public ?object $sqo = null;

		/**
		* Display layout configuration for the 'show' (list/edit view) rendering.
		* Contains a ddo_map (ordered array of DDO descriptors defining which fields
		* to fetch and how to render them), an optional sqo_config (overrides applied
		* to the base SQO when building the show result set), and interface flags
		* (button_add, button_link, tools, button_tree, button_external, show_autocomplete).
		* When $search and/or $choose are absent, this object seeds them.
		* @var ?object $show
		*/
		public ?object $show = null;

		/**
		* Search-panel layout configuration.
		* Contains a ddo_map (array of DDO arrays forming search-field paths) and an
		* optional sqo_config.  Refines $show for the search UI, and seeds $choose
		* when that property is absent.
		* @var ?object $search
		*/
		public ?object $search = null;

		/**
		* Record-picker layout configuration used by service_autocomplete.
		* Contains a ddo_map defining which fields appear in the record-selection
		* dropdown/modal.  Refines $search to restrict what is displayed during
		* the choose interaction.
		* @var ?object $choose
		*/
		public ?object $choose = null;

		/**
		* Pre-calculated data payload sent with write operations.
		* Carries a prepared object (e.g. datalist, pagination context) that was
		* already computed on the client so the server does not need to rebuild it
		* during 'save' or similar calls.  Reduces redundant CPU work on hot paths.
		* @var ?object $data
		*/
		public ?object $data = null;

		/**
		* Whether to release the PHP session lock before executing the request.
		* When true, session_write_close() is called so that concurrent browser
		* requests (e.g. background count calls) are not serialised behind a write
		* lock.  Only safe for read-only operations that do not need to write
		* session state.
		* @var ?bool $prevent_lock
		*/
		public ?bool $prevent_lock = null;

		/**
		* Whether to format the JSON API response with whitespace.
		* When true, json_encode uses JSON_PRETTY_PRINT so the raw HTTP response is
		* human-readable.  Intended for debugging only — adds overhead and increases
		* response size.
		* @var ?bool $pretty_print
		*/
		public ?bool $pretty_print = null;

		/**
		* Heterogeneous extra parameters forwarded to the API handler.
		* The shape is handler-specific.  Common uses include file-upload metadata
		* (name, tmp_dir, key_dir, tmp_name) and media quality flags (target_dir).
		* Validated and consumed by the receiving API method, not by this class.
		* @var ?object $options
		*/
		public ?object $options = null;

		/**
		* Canonical list of top-level property keys recognised by this class.
		* Serialisers, sanitisers, and hydrators iterate this list to know which
		* properties belong to an RQO and should be preserved or validated.
		* Keys not present here are treated as source-locator fields by the HTTP
		* API gateway (index.php) when building the RQO from $_REQUEST.
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
	* Hydrates the RQO from a raw decoded-JSON object.
	* Each property in $data is routed through its dedicated setter (set_<key>)
	* so subclasses can override individual field handling without touching this
	* loop.  Only keys that have a matching setter method should be present in
	* $data; any key without a setter will throw a fatal error at runtime.
	* In normal usage $data is null and the loop does not execute.
	* @param ?object $data = null - raw payload object decoded from the JSON request body
	* @return void
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
	* Assigns the API handler class name for this request.
	* @param string $value - fully qualified API class name (e.g. 'dd_core_api')
	* @return void
	*/
	public function set_dd_api(string $value) : void {

		$this->dd_api = $value;
	}//end set_dd_api



	/**
	* SET_ACTION
	* Assigns the action verb that the API handler will execute.
	* @param string $value - method/action name (e.g. 'read', 'save', 'delete')
	* @return void
	*/
	public function set_action(string $value) : void {

		$this->action = $value;
	}//end set_action



	/**
	* SET_SOURCE
	* Assigns the source locator that identifies the requesting element.
	* The source locator carries tipo, section_tipo, section_id, mode, lang, and
	* optionally value/autocomplete flags.
	* @param object $value - source locator object from the decoded JSON payload
	* @return void
	*/
	public function set_source(object $value) : void {

		$this->source = $value;
	}//end set_source



	/**
	* SET_SQO
	* Assigns the Search Query Object that controls record retrieval.
	* The raw object is stored as-is; full hydration into a search_query_object
	* instance is deferred to the API pipeline so callers remain decoupled from
	* the SQO parsing logic.
	* @param object $value - raw SQO decoded from the JSON request body
	* @return void
	*/
	public function set_sqo(object $value) : void {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	* Assigns the display layout configuration for the show/list/edit view.
	* Expected shape: { ddo_map, sqo_config, interface }.
	* @param object $value - show configuration object from the decoded JSON payload
	* @return void
	*/
	public function set_show(object $value) : void {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	* Assigns the search-panel layout configuration.
	* Expected shape: { ddo_map, sqo_config }.
	* @param object $value - search configuration object from the decoded JSON payload
	* @return void
	*/
	public function set_search(object $value) : void {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	* Assigns the record-picker layout configuration used by service_autocomplete.
	* Expected shape: { ddo_map }.
	* @param object $value - choose configuration object from the decoded JSON payload
	* @return void
	*/
	public function set_choose(object $value) : void {

		$this->choose = $value;
	}//end set_choose



	/**
	* SET_OPTIONS
	* Assigns the heterogeneous extra-parameters object forwarded to the handler.
	* The internal structure is handler-specific (file upload metadata, quality flags, etc.).
	* @param object $value - options object from the decoded JSON payload
	* @return void
	*/
	public function set_options(object $value) : void {

		$this->options = $value;
	}//end set_options



	/**
	* __GET
	* Magic property accessor — returns the property value when the property is set,
	* or null when it is not, instead of raising a fatal error.
	* A DEBUG-level log entry is emitted for missing properties so that misconfigured
	* callers can be traced without crashing the request pipeline.
	* @param string $name - property name being accessed
	* @return mixed - property value, or null when the property does not exist
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
