<?php declare(strict_types=1);
/**
* CLASS REQUEST_CONFIG_OBJECT
* Normalized value-object representing one entry in a request_config array.
*
* A request_config array (stored as ontology JSON under
* properties->source->request_config) tells the API which data to retrieve and
* how to present it. Each element of that array is parsed into one
* request_config_object. The class enforces a controlled property set via
* typed setters so that callers never see arbitrary keys injected from
* untrusted JSON.
*
* Responsibilities:
* - Hold the five display contexts: show, search, choose, hide, plus the
*   underlying SQO and the api_engine/type discriminators.
* - Provide typed setter accessors (set_*) so __construct can dispatch
*   incoming data by key name without allowing arbitrary property writes.
* - Expose __set_state() for PHP var_export cache round-trips.
* - Validate ontology-authored request_config arrays without touching the
*   database (validate_config — used by the ontology save hook and the
*   audit_request_config CLI).
* - Strip untrusted client ddo_map entries to the safe display-field
*   whitelist before they enter the server pipeline
*   (sanitize_client_ddo_map — called from class.dd_manager).
*
* Lifecycle:
*   Typically constructed by trait.request_config_v6::parse_request_config_item
*   or trait.request_config_v5::build_request_config_v5. Cached objects are
*   stored (and restored) via var_export/__set_state. The immutable cache
*   boundary in trait.request_config_utils deep-clones objects before
*   per-call overlays to prevent shared-cache mutation.
*
* Inheritance:
*   Extends stdClass so callers may read unknown keys via __get without
*   fatal errors; __get logs a debug warning and returns null for anything
*   not declared here.
*
* @package Dédalo
* @subpackage Core
*/
/*
* STRUCTURE — field reference for developers editing ontology JSON:
*
*   api_engine  : Engine that processes the request.
*                 'dedalo' (default) or an external name like 'zenon_engine'.
*   type        : Request context discriminator. Components may branch on this.
*                 Default 'main'.
*   sqo         : Search Query Object — section_tipo array, fixed_filter,
*                 filter_by_list, filter_by_locators, limit, offset, operator.
*                 (!) Presence of fixed_filter or filter_by_list disables
*                 request_config caching because values are record-data-derived.
*   show        : ddo_map (and optional get_ddo_map, sqo_config, interface,
*                 fields_separator, records_separator). This is the ONLY
*                 context the runtime requires; the others cascade from it
*                 when absent.
*   search      : ddo_map (and optional sqo_config). Defines which fields
*                 are exposed in the search panel. Overrides the show fields
*                 for the search context; choose is derived from this when
*                 absent.
*   choose      : ddo_map. Fields shown in the record-picker dialog.
*                 Overrides search fields for the choose context.
*   hide        : ddo_map. Components resolved server-side for internal use
*                 (e.g., to feed computed values) but never rendered in UI.
*   api_config  : Engine-specific connection options (e.g., Zenon API params).
*                 May be explicitly null when the engine needs no extra config.
*
* REQUEST_CONFIG SAMPLE (request configuration for Dédalo API or others API):
*   [
*       {
*           "api_engine" : "dedalo",
*           "type" :"main",
*           "sqo" : {
*               "section_tipo" : [
*                   {"source" : "hierarchy_types", "value": [2]},
*                   {"source" : "section", "value":["on1"]},
*                   {"source" : "self"}
*               ],
*               "filter_by_list" : [
*                   {"section_tipo": "numisdata3", "component_tipo":"numisdata309"}
*               ],
*               "fixed_filter" : [
*                   {
*                       "source" : "fixed_dato",
*                       "value" : [
*                       {
*                           "path": [
*                               {
*                                   "name"              : "Usable in indexing",
*                                   "model"             : "component_radio_button",
*                                   "section_tipo"      : "hierarchy20",
*                                   "component_tipo"    : "hierarchy24"
*                               }
*                           ],
*                           "q":
*                               {
*                                   "type"                  : "dd151",
*                                   "section_id"            : "2",
*                                   "section_tipo"          : "dd64",
*                                   "from_component_tipo"   : "hierarchy24"
*                               },
*                               2,
*                               "abc"
*                               }
*                           ,
*                           "q_operator": null
*                       }]
*                       ,"operator":"$and"
*                   },
*                   {
*                       "source" : "component_data",
*                       "value" : [
*                           {
*                               "q": "rsc423", // the component to get data, it should to be the last component into ddo chain
*                               "path": [
*                                   {
*                                       "name": "Id",
*                                       "model": "component_section_id",
*                                       "section_tipo": "rsc420",
*                                       "component_tipo": "rsc414"
*                                   }
*                               ],
*                               "ddo_map": [
*                                   {
*                                       "tipo": "numisdata1379",
*                                       "parent": "self",
*                                       "section_tipo": "numisdata1374"
*                                   },
*                                   {
*                                       "tipo": "rsc423",
*                                       "parent": "numisdata1379",
*                                       "section_tipo": "rsc197"
*                                   }
*                               ],
*                               "q_operator": null,
*                               "search_section_id": true
*                           }
*                       ],
*                       "operator" : "$or"
*                   },
*                   {
*                       "source" : "hierarchy_terms",
*                       "value" : [
*                           {"section_tipo":"on1","section_id":"2705", "recursive":true},
*                           {"section_tipo":"on1","section_id":"2748","recursive":true}
*                       ],
*                       "operator":"$or"
*                   }
*               ],
*               "filter_by_locators": [{locator},{locator}]
*           },
*           "show":{
*               "get_ddo_map": {
*                   "model": "section_map",
*                   "columns": [
*                       [
*                           "thesaurus",
*                           "term"
*                       ]
*                   ]
*               },
*               "ddo_map":[
*                   {"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": false},
*                   {"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3","fields_separator" : " | "}, {"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"},
*                   {"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3","value_with_parents": true}
*               ],
*
*               "fields_separator" : " | ",
*               "records_separator" : "<br>",
*               "sqo_config": {
*                    "operator": "$or",
*                    "limit" : 5
*               }
*           },
*           "search":{
*               "ddo_map": [
*                   {"section_tipo":"self","tipo":"numisdata309","mode":"list"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list"}
*           ]},
*           "choose":{
*               "ddo_map":[
*                   {"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
*                   {"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
*                   {"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
*           ]},
*           "hide":{
*               "ddo_map":[
*                   {"section_tipo":"self","tipo":"numisdata27","mode":"edit","label":"number", "parent": "numisdata3", "value_with_parents": true},
*                   {"section_tipo":"self","tipo":"numisdata309","mode":"list","label":"catalog", "parent": "numisdata3"},{"section_tipo":"numisdata300","tipo":"numisdata303","mode":"list","label":"catalog", "parent": "numisdata309"}
*                   {"section_tipo":"self","tipo":"numisdata81","label":"key", "parent": "numisdata3"}
*           ]},
*       },
*       {
*           "api_engine": "zenon_engine",
*           "sqo" : {
*               "section_tipo": [{"source":"section", "value":["zenon1"]}]
*           },
*           "show": {
*               "ddo_map": [
*                   {"section_tipo":"zenon1","tipo":"zenon3", "parent": "zenon1"},
*                   {"section_tipo":"zenon1","tipo":"zenon4", "parent": "zenon1"},
*                   {"section_tipo":"zenon1","tipo":"zenon5", "parent": "zenon1"},
*                   {"section_tipo":"zenon1","tipo":"zenon6", "parent": "zenon1"}
*               ]
*           }
*       }
*   ]
*/
class request_config_object extends stdClass {



	/**
	* CLASS VARS
	*/
		/**
		* Engine identifier that will process this request.
		* 'dedalo' targets the native Dédalo API (default); other values (e.g.,
		* 'zenon_engine') route the request to a registered external adapter.
		* Used by the API dispatcher and build_request_config pipelines to choose
		* the correct data-fetch strategy.
		* @var ?string $api_engine
		*/
		public ?string $api_engine = null;

		/**
		* Request context discriminator.
		* Components may switch behaviour based on this value. The standard
		* value is 'main'; custom types allow the same section to serve
		* different presentation contexts (e.g., a compact summary vs. full edit).
		* @var ?string $type
		*/
		public ?string $type = null;

		/**
		* Search Query Object that controls what records are fetched.
		* An stdClass whose recognised sub-keys include:
		*   - section_tipo  : array of source descriptors (section, hierarchy_types, self…)
		*   - fixed_filter  : server-resolved filter clauses (record-data-derived; disables caching)
		*   - filter_by_list: cross-section list restriction (also disables caching)
		*   - filter_by_locators: restrict to specific locators
		*   - limit / offset: pagination
		*   - operator      : '$and' | '$or' across filter clauses
		* @var ?object $sqo
		*/
		public ?object $sqo = null;

		/**
		* Display configuration for 'show' context (normal data browsing).
		* The only mandatory display context — when search/choose are absent the
		* runtime derives them from this. Recognised sub-keys:
		*   - ddo_map        : array of DDO (Data Description Object) entries
		*   - get_ddo_map    : object {model, columns} — dynamic ddo_map generation via section_map
		*   - sqo_config     : object {limit, operator, …} merged into the base SQO for this context
		*   - interface      : object {button_add, button_delete, read_only, …} UI controls
		*   - fields_separator / records_separator : presentation glue strings
		* @var ?object $show
		*/
		public ?object $show = null;

		/**
		* Configuration for the search-panel context.
		* Defines which components are presented in the search UI. Overrides the
		* show ddo_map for search; when absent, show is used as the fallback.
		* The choose context cascades from search when choose is itself absent.
		* @var ?object $search
		*/
		public ?object $search = null;

		/**
		* Configuration for the record-picker (choose) dialog context.
		* Defines the columns shown when a user selects a related record.
		* Overrides search (which overrides show) for this context.
		* @var ?object $choose
		*/
		public ?object $choose = null;

		/**
		* Configuration for components resolved server-side but never rendered.
		* DDOs in this context are fetched and made available to computed or
		* intermediate pipeline steps (e.g., providing a key value used by a
		* fixed_filter) without exposing them to the UI layer.
		* @var ?object $hide
		*/
		public ?object $hide = null;

		/**
		* Engine-specific connection or behaviour parameters.
		* Passed verbatim to the external adapter named by api_engine.
		* May be explicitly null when an external engine requires no extra config;
		* the constructor preserves a null value for this key specifically
		* (unlike other null keys, which are skipped during construction).
		* @var ?object $api_config
		*/
		public ?object $api_config = null;



	/**
	* __CONSTRUCT
	* Builds a request_config_object from an optional plain-object payload.
	* Each key in $data is dispatched to its corresponding set_<key>() method.
	* Keys that have no setter are logged as errors and silently skipped, which
	* prevents unknown ontology keys from silently polluting the instance.
	*
	* Null values are skipped for all properties except api_config: a null
	* api_config is semantically meaningful (external engine with no extra
	* params) so it must be stored, whereas a null for any other key just
	* means "not configured" and the zero-value default on the property
	* already represents that state.
	*
	* @param ?object $data - raw properties object (default null), typically decoded
	*   from ontology JSON or a var_export cache entry
	* @return void
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
	* PHP magic method invoked by var_export()-based cache restoration.
	* When the request_config cache is written via var_export() and later
	* include()'d, PHP calls __set_state with the exported property array so
	* the object can reconstruct itself rather than being created as a plain
	* stdClass. The array is cast to object and passed to the constructor so
	* the same setter-dispatch logic applies.
	* @param array $an_array - exported property key→value pairs
	* @return object - fully initialised request_config_object
	*/
	public static function __set_state($an_array) : object {
        $obj = new request_config_object(
			(object)$an_array
		);

        return $obj;
    }//end __set_state



	/**
	* SET_API_ENGINE
	* Sets the engine identifier that will process this request.
	* Called by the constructor dispatcher when the 'api_engine' key is present
	* in the incoming data. Typical values: 'dedalo' (default), 'zenon_engine'.
	* @param string $value - engine name
	* @return void
	*/
	public function set_api_engine(string $value) : void {

		$this->api_engine = $value;
	}//end set_api_engine



	/**
	* SET_TYPE
	* Sets the request context discriminator.
	* Allows components to branch between multiple request_config entries that
	* share the same api_engine. Convention is 'main' for the primary config.
	* @param string $value - context type identifier (e.g., 'main')
	* @return void
	*/
	public function set_type(string $value) : void {

		$this->type = $value;
	}//end set_type



	/**
	* SET_SQO
	* Stores the raw Search Query Object.
	* The SQO object is passed through to the search layer; its structure is
	* validated and merged with pagination/session state later in
	* build_request_config. The object is not normalised here so that the
	* cache stores the original ontology-authored form.
	* @param object $value - raw SQO (section_tipo, filters, limit, etc.)
	* @return void
	*/
	public function set_sqo(object $value) : void {

		$this->sqo = $value;
	}//end set_sqo



	/**
	* SET_SHOW
	* Stores the display configuration for the 'show' context.
	* 'show' is the only context the runtime strictly requires; search and
	* choose fall back to it when absent. The value is an object that may
	* carry ddo_map, get_ddo_map, sqo_config, interface, fields_separator,
	* and records_separator sub-keys.
	* @param object $value - show configuration object
	* @return void
	*/
	public function set_show(object $value) : void {

		$this->show = $value;
	}//end set_show



	/**
	* SET_SEARCH
	* Stores the search-panel context configuration.
	* When set, overrides the show ddo_map for the search UI. The choose
	* context further cascades from this when choose is absent.
	* @param object $value - search configuration object (ddo_map, sqo_config…)
	* @return void
	*/
	public function set_search(object $value) : void {

		$this->search = $value;
	}//end set_search



	/**
	* SET_CHOOSE
	* Stores the record-picker (choose) dialog context configuration.
	* When set, overrides the search ddo_map for the choose context.
	* If absent, the runtime uses the search config (which itself falls
	* back to show) to populate the record-picker columns.
	* @param object $value - choose configuration object (ddo_map…)
	* @return void
	*/
	public function set_choose(object $value) : void {

		$this->choose = $value;
	}//end set_choose


	/**
	* SET_HIDE
	* Stores the hidden-components context configuration.
	* DDOs in this context are resolved server-side to supply computed or
	* intermediate data (e.g., a filter key read from the current record)
	* but are never serialised into the API response sent to the client.
	* @param object $value - hide configuration object (ddo_map…)
	* @return void
	*/
	public function set_hide(object $value) : void {

		$this->hide = $value;
	}//end set_hide



	/**
	* SET_API_CONFIG
	* Stores engine-specific connection or behaviour parameters.
	* Unlike the other setters, null is a meaningful value here (an external
	* engine that requires no extra config explicitly sets this to null rather
	* than omitting the key). The constructor therefore does not skip null for
	* this property, and the setter accepts object|null accordingly.
	* @param object|null $value - engine-specific config, or null
	* @return void
	*/
	public function set_api_config(object|null $value) : void {

		$this->api_config = $value;
	}//end set_api_config



	/**
	* VALIDATE_CONFIG
	* Pure structural validation of a properties->source->request_config value
	* authored in ontology JSON. Returns an array of issue objects; an empty
	* array means structurally valid.
	*
	* Each issue object has the shape:
	*   {level: 'error'|'warning', path: string, message: string}
	*   - 'error'   : the runtime will drop or degrade the affected entry
	*   - 'warning' : suspicious but tolerated at runtime
	*
	* Design contract (side-effect-free):
	* - No database or ontology lookups are performed. Tipo existence is
	*   installation-dependent and therefore outside scope. Only shape,
	*   types, and tipo grammar are checked.
	* - Safe to call from ontology save hooks (non-blocking), CLI batch audits
	*   (core/ontology/audit_request_config.php), and unit tests.
	*
	* Called by:
	*   - class.ontology::save_properties — emits warnings on save
	*   - core/ontology/audit_request_config.php — batch audit CLI
	*
	* @param mixed $request_config - the raw value of properties->source->request_config
	* @return array - array of issue objects {level:string, path:string, message:string}
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
			// Any key not in $known_item_keys is likely a typo or a stale
			// v6-to-v7 migration artefact.
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
					// Limit must be a PHP integer or the string sentinel 'ALL'.
					// A float or string digit would pass JSON decoding silently and
					// produce wrong pagination.
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
			// Walk each display context (show/search/choose/hide) and validate
			// the ddo_map entries within them. Skipped when the context key is
			// absent (absence is valid — cascade rules supply the fallback).
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
				// false is a valid sentinel (disables dynamic ddo resolution); any
				// other truthy value must be an object with {model, columns[]}.
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
						// tipo is required and must match the TLD+number or 'self' grammar.
						// A missing or non-matching tipo causes the runtime to silently
						// drop the whole DDO entry, producing an invisible blank column.
						if (!isset($ddo->tipo) || !is_string($ddo->tipo) || $ddo->tipo==='') {
							$add_issue('error', "$ddo_path.tipo", 'Missing or invalid ddo tipo (the runtime drops this ddo)');
						} elseif (!$valid_tipo($ddo->tipo)) {
							$add_issue('error', "$ddo_path.tipo", "Invalid tipo grammar '{$ddo->tipo}' (expected tld+number or 'self')");
						}
						// section_tipo may be a string ('self' or a specific tipo) or an
						// array of strings when targeting multiple sections.
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
		// 'limit'/'offset' control only the OUTPUT pagination slice of an already
		// permission-resolved, fully-loaded component (a relation/portal loads all
		// its references regardless; the slice just bounds the returned rows — same
		// as the UI "show all"). They are not permission fields; validated as
		// non-negative ints below (0 = all), so they cannot escalate access.
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
			'hover',
			'limit',
			'offset'
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

			// pagination fields must be non-negative integers (0 = all). Drop any
			// other shape so a tampered value can't reach pagination->limit.
			foreach (['limit', 'offset'] as $pag) {
				if (property_exists($clean_ddo, $pag) && (!is_int($clean_ddo->{$pag}) || $clean_ddo->{$pag} < 0)) {
					unset($clean_ddo->{$pag});
				}
			}

			$sanitized[] = $clean_ddo;
		}

		return $sanitized;
	}//end sanitize_client_ddo_map



	/**
	* __GET
	* PHP magic accessor invoked when code reads a property that is not
	* declared or not directly accessible.
	* Returns the property value when it exists (via isset, which covers both
	* declared and dynamic properties), otherwise logs a DEBUG-level warning
	* with the call-site location and returns null. This prevents fatal errors
	* from callers that probe optional keys without prior isset() guards, while
	* making undefined access discoverable in the debug log.
	* @param string $name - name of the property being read
	* @return mixed - property value, or null when the property is not set
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
	}//end __get
	// final public function __set($name, $value) {
	// 	$this->$name = $value;
	// }



}//end request_config_object
