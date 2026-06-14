<?php declare(strict_types=1);
/**
* CLASS COMPONENT_EXTERNAL
* Component that proxies read-only data from a third-party API into a Dédalo section.
*
* Unlike storage components, component_external never writes API data locally. Each
* render cycle fetches the remote record on demand (with a per-request static cache)
* and maps the API response fields to local component slots defined via
* `section_properties->api_config`.
*
* Responsibilities:
* - Build the request URL by delegating to a pluggable entity class
*   (core/component_external/entities/class.<entity>.php, e.g. class.zenon.php).
* - Guard outbound HTTP calls with is_safe_remote_url() (SEC-075) and track host
*   reachability in $_SESSION to avoid hammering an unavailable endpoint.
* - Apply per-field format transforms ('array_values', 'zenon_authors', …) driven by
*   the component's ontology `fields_map` property before returning data to callers.
*
* Ontology configuration — set in section_properties->api_config:
* ```json
* {
*   "api_config": {
*     "entity": "zenon",
*     "api_url": "https://zenon.dainst.org/api/v1/record",
*     "response_map": [
*       { "local": "ar_records", "remote": "records" },
*       { "local": "msg",        "remote": "status"  }
*     ]
*   }
* }
* ```
*
* Each component child of the section must carry a `fields_map` property that names
* which remote field maps to the local 'dato' slot and, optionally, a 'format' key
* that selects a transform ('array_values' | 'zenon_authors' | default to_string):
* ```json
* {
*   "fields_map": [
*     { "local": "dato", "remote": "title", "format": "array_values" }
*   ]
* }
* ```
*
* Data storage: uses the 'misc' column of the matrix table (inherited from
* component_common), but in practice the component's value always originates
* from the remote API — not from what is stored locally.
*
* Extends component_common, which provides save/load, context, permissions, and
* the JSON API dispatch (component_external_json.php).
*
* @package Dédalo
* @subpackage Core
*/
class component_external extends component_common {



	/**
	* Cache for remote API responses, keyed by "<section_tipo>_<section_id>_<lang>".
	* Scoped to the current request/worker lifetime; prevents redundant HTTP calls
	* when multiple components in the same section each call load_data_from_remote().
	* @var array $data_from_remote_cache
	*/
	public static array $data_from_remote_cache = [];


	/**
	* LOAD_DATA_FROM_REMOTE
	* Fetches the single remote record that corresponds to this component's section_id
	* and returns the first matching entry from the API response array.
	*
	* Execution flow:
	* 1. Checks the static per-request cache (keyed by section_tipo + section_id + lang)
	*    and returns early if a cached value exists.
	* 2. Reads `api_config` from the section's ontology properties; returns null and logs
	*    an error if the configuration is absent.
	* 3. Checks $_SESSION for a previous "entity unavailable" flag that was set after a
	*    prior failed request; returns null immediately to avoid repeated failing calls.
	* 4. Builds the list of remote field names by inspecting all component children of the
	*    section whose ontology properties carry a `fields_map` with local='dato'.
	* 5. Dynamically includes the entity class
	*    (entities/class.<entity>.php) and delegates URL construction to its static
	*    build_row_request_url() method.
	* 6. Validates the constructed URL against is_safe_remote_url() (SEC-075 SSRF guard);
	*    marks the entity unavailable and returns null on rejection.
	* 7. Performs the HTTP request via curl_request() with a 4-second timeout.
	* 8. Applies `response_map` to extract the first record from the 'ar_records' key of
	*    the decoded JSON response; marks the entity unavailable and returns null when the
	*    response is empty or unparseable.
	* 9. Stores the result in the static cache before returning.
	*
	* Sample return value (Zenon bibliographic record):
	* ```json
	* {
	*     "id": "001327065",
	*     "title": "Arse : Boletín del Centro Arqueológico Saguntino (Sagunto).",
	*     "authors": {
	*         "primary": [],
	*         "secondary": [],
	*         "corporate": []
	*     },
	*     "publicationDates": ["2011"],
	*     "recordPage": "/Record/001327065",
	*     "physicalDescriptions": ["213 p."]
	* }
	* ```
	*
	* @return ?object Row data object extracted from the remote response, or null on any error.
	*/
	public function load_data_from_remote() : ?object {

		// short vars
			$section_id		= $this->get_section_id();
			$section_tipo	= $this->section_tipo;
			$lang			= DEDALO_DATA_LANG;

		// cache — static, scoped to the current PHP request/worker
			// Key incorporates lang so that multilingual sections with different
			// field sets per language do not collide in the cache.
			$uid = $section_tipo . '_'. $section_id .'_'. $lang;
			if (isset(self::$data_from_remote_cache[$uid])) {
				return self::$data_from_remote_cache[$uid];
			}

		// section_properties
			$ontology_node		= ontology_node::get_instance($section_tipo);
			$section_properties	= $ontology_node->get_properties();

		// format reference
			# {
			#   "api_config": {
			#     "entity": "zenon",
			#     "api_url": "https://zenon.dainst.org/api/v1/record",
			#     "response_map": [
			#       {
			#         "local": "ar_records",
			#         "remote": "records"
			#       },
			#       {
			#         "local": "msg",
			#         "remote": "status"
			#       }
			#     ]
			#   }
			# }

		// check properties config
			if (!isset($section_properties->api_config)) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Empty section properties api_config (1)" .PHP_EOL
					.' tipo: '. $this->tipo .PHP_EOL
					.' section_tipo: '. $section_tipo .PHP_EOL
					.' section_id: '. $section_id .PHP_EOL
					.' section_properties type: ' . gettype($section_properties) .PHP_EOL
					.' section_properties: ' . to_string($section_properties) .PHP_EOL
					// .' bt: ' . to_string( debug_backtrace() )
					, logger::ERROR
				);
				if(SHOW_DEBUG===true) {
					dump(debug_backtrace(), ' debug_backtrace() ++ '.to_string());
				}
				return null;
			}

		// properties api_config vars
			$api_config		= $section_properties->api_config;
			$api_url		= $api_config->api_url;
			$response_map	= $api_config->response_map;
			$entity			= $api_config->entity;

		// Entity availability gate (usually checked for Zenon)
		// If the remote host failed in a previous call this session, the flag
		// '<entity>_is_available' is set to false in $_SESSION so subsequent
		// page renders do not keep hammering an unreachable endpoint. The flag
		// is absent (null) on the first call and cleared automatically when the
		// user's session ends, giving the host a fresh chance on next login.
			$entity_is_available = $_SESSION['dedalo']['config'][$entity.'_is_available'] ?? null;
			if ($entity_is_available===false) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Remote host (".$entity.") is unavailable 1. NULL is returned as data. Quit session to try again."
					, logger::ERROR
				);
				return null;
			}

		// Entity is avilable. Proceed

			// ar_fields — build the list of remote field names to request
			// Walk all component children of this section (recursive, resolving
			// virtual sections) and collect the 'remote' name for every child
			// whose fields_map has an entry with local='dato'. Passing these to
			// the entity URL builder limits the API response to only the fields
			// that Dédalo actually needs, reducing payload size.
			$ar_fields = [];
			$children_tipo = section::get_ar_children_tipo_by_model_name_in_section(
				$section_tipo,
				['component'],
				true,
				true,
				true,
				false,
				false
			);

			foreach ($children_tipo as $component_tipo) {

				$ontology_node			= ontology_node::get_instance($component_tipo);
				$component_properties	= $ontology_node->get_properties();

				// check component_properties
				// Skip children that have no fields_map — they do not map to any remote field.
				if(empty($component_properties) || !isset($component_properties->fields_map)){
					continue;
				}

				// array_find: PHP 8.4 native; polyfill provided in core_functions.php for earlier versions.
				// Finds the first fields_map entry whose 'local' is 'dato' (the canonical local slot name).
				$field_name = array_find((array)$component_properties->fields_map, function($el){
					return $el->local==='dato';
				});
				if (is_object($field_name)) {
					$ar_fields[] = $field_name->remote;
				}
			}

			// Entity class — dynamically included by name (e.g. 'zenon' → entities/class.zenon.php).
			// (!) $entity comes from the ontology-configured api_config; this is not user-supplied
			// input at runtime, but care must be taken if future config sources are less trusted.
			// The entity class must expose a static build_row_request_url(object $options): string method.
			include_once( dirname(__FILE__) . '/entities/class.'.$entity.'.php' );

			// url build
			$url = $entity::build_row_request_url((object)[
				'api_url'		=> $api_url,
				'ar_fields'		=> $ar_fields,
				'section_id'	=> $section_id,
				'lang'			=> $lang
			]);

			// SEC-075: SSRF confinement. Ontology-defined `api_url` drives
			// this call. Even though admins own the ontology, the
			// constructed `$url` must still point to a public endpoint to
			// prevent cloud-metadata / internal-service reads.
			if (!is_safe_remote_url($url)) {
				debug_log(__METHOD__
					.' SEC-075: refused unsafe external URL: ' . to_string($url)
					, logger::ERROR
				);
				$_SESSION['dedalo']['config'][$entity.'_is_available'] = false;
				return null;
			}

			// remote API request
			$request_response = curl_request((object)[
				'url'		=> $url, // string
				'header'	=> false, // bool
				'timeout'	=> 4 // int in secs
			]);
			$response_obj = !empty($request_response->result)
				? json_decode($request_response->result)
				: null;

			// check response
			if (empty($response_obj)) {
				debug_log(__METHOD__
					." ERROR. Unable to load data from_remote. Empty response from api_config:" .PHP_EOL
					.' request_response: ' . to_string($request_response)
					, logger::ERROR
				);
				// Fix Zenon as not available to prevent to try access again and again.
				$_SESSION['dedalo']['config'][$entity.'_is_available'] = false;
				return null;
			}

			// row_data — extract the first record from the response array
			// Iterates response_map entries looking for the one with local='ar_records',
			// then reads the remote key from the decoded JSON object and calls reset()
			// to obtain the first element of the records array. Other response_map
			// entries (e.g. 'msg'/'status') are currently ignored here; they exist to
			// support future status-checking or logging expansions.
			$row_data = array_reduce($response_map, function($carry, $item) use($response_obj){
				if ($item->local==='ar_records') {
					$name = $item->remote;
					return isset($response_obj->{$name}) ? reset($response_obj->{$name}) : null;
				}
				return $carry;
			});

			// cache
			self::$data_from_remote_cache[$uid] = $row_data;


		return $row_data;
	}//end load_data_from_remote



	/**
	* GET_DATA
	* Loads the remote record and maps a single field value through this component's
	* ontology fields_map to produce the local data array.
	*
	* Overrides component_common::get_data() — instead of reading the database,
	* it pulls the record from the remote API via load_data_from_remote() and applies
	* the format transform configured in fields_map->format:
	*
	* - 'array_values' — joins a remote array with ' | ' (e.g. publication dates).
	* - 'zenon_authors'— renders the Zenon author structure
	*   ({primary:[], secondary:[], corporate:[]}) as "primary: name1 - name2 | …".
	* - (absent / default) — calls to_string() on whatever the remote field contains.
	*
	* Only the fields_map entry with local='dato' is honoured; other local slots are
	* ignored. The reduce starts with null so that missing-field detection can be
	* distinguished from an explicit empty-string value from the API.
	*
	* @return ?array Single-element array wrapping the transformed string, or null when
	*                the remote call fails, config is incomplete, or the remote field
	*                is absent.
	*/
	public function get_data() : ?array {

		// load data from remote returns an object as
		// {
		//     "id": "001327065",
		//     "title": "Arse : Boletín del Centro Arqueológico Saguntino (Sagunto).",
		//     "authors": {
		//         "primary": [],
		//         "secondary": [],
		//         "corporate": []
		//     },
		//     "publicationDates": [
		//         "2011"
		//     ],
		//     "recordPage": "/Record/001327065",
		//     "physicalDescriptions": [
		//         "213 p."
		//     ]
		// }
		$row_data = $this->load_data_from_remote();

		// early return if no remote data
		if (empty($row_data)) {
			return null;
		}

		// properties (fields_map) returns an object as
		// {
		// 	"fields_map": [
		// 		{
		// 			"local": "dato",
		// 			"format": "zenon_authors",
		// 			"remote": "authors"
		// 		}
		// 	]
		// }
		$properties = $this->get_properties();

		// properties check
		if (empty($properties) || !isset($properties->fields_map)) {
			debug_log(__METHOD__
				." Error. Missing fields_map in properties"
				, logger::ERROR
			);
			return null;
		}

		// data extraction
		// array_reduce iterates all fields_map entries; only the 'dato' entry produces output.
		// The reduce's initial carry is null so that a missing remote field can be detected
		// (logs an error) while returning null rather than a misleading empty string.
		$value = array_reduce($properties->fields_map, function($carry, $item) use($row_data){
			if($item->local==='dato') { // Note that 'dato' is the default local name for external components
				$name = $item->remote;
				if (isset($row_data->{$name})) {
					$resolved = null;

					if (isset($item->format)) {
						switch ($item->format) {
							case 'array_values':
								// Flatten a remote array to a pipe-separated string.
								// Falls back to to_string() when the value is scalar.
								$resolved = is_array($row_data->{$name})
									? implode(' | ', $row_data->{$name})
									: to_string($row_data->{$name});
								break;
							case 'zenon_authors':
								// Zenon author object shape: {primary:[...], secondary:[...], corporate:[...]}.
								// Each role key maps to an array of author name strings.
								// Skips empty role groups; formats as "primary: Author A - Author B | secondary: …".
								$ar_names = [];
								if (is_array($row_data->{$name})) {
									foreach ($row_data->{$name} as $key => $element) {
										if (empty($element)) continue;
										$ar_names[] = $key  .': '. implode(' - ', array_keys((array)$element));
									}
								}
								$resolved = implode(' | ', $ar_names);
								break;
							default:
								$resolved = to_string($row_data->{$name});
								break;
						}
					}else{
						$resolved = $row_data->{$name};
					}
					return $resolved;
				}else{
					debug_log(__METHOD__
						." Error. Not found key: '$name' in row_data" . PHP_EOL
						.' name: ' .$name . PHP_EOL
						.' row_data type: ' .gettype($row_data) . PHP_EOL
						.' row_data: ' . to_string($row_data)
						, logger::ERROR
					);
				}
			}
			return $carry;
		}, null);

		// return null if no value was found
		if ($value === null) {
			return null;
		}

		$data = is_array($value)
			? $value
			: [$value];


		return $data;
	}//end get_data



	/**
	* SET_DATA
	* Coerces every element of the incoming array to a string before delegating
	* to component_common::set_data().
	*
	* component_external stores its value as an array of strings in the 'misc'
	* column. If a caller passes non-string elements (e.g. integers decoded from
	* JSON), this method converts them with to_string() so the parent persistence
	* logic always receives a homogeneous string array. Null data is passed through
	* unchanged — component_common::set_data() interprets null as "clear the value".
	*
	* @param ?array $data Array of string entries to persist, or null to clear.
	* @return bool True on successful database write, false on failure.
	*/
	public function set_data( ?array $data) : bool {

		// safe_data — normalise non-string entries to string
		// Needed because remote API fields may decode as int/float/object, and the
		// parent implementation expects a string array for the misc column.
		if($data !== null) {
			$safe_data = [];
			foreach ($data as $data_entry) {
				if (!is_string($data_entry)) {
					$safe_data[] = to_string($data_entry);
				}else{
					$safe_data[] = $data_entry;
				}
			}
			$data = $safe_data;
		}

		return parent::set_data( $data );
	}//end set_data



}//end class component_external
