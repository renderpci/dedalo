<?php declare(strict_types=1);
// CONF-01: EasyRdf (sweetrdf/easyrdf) is a composer dependency installed under
// the repo-root vendor/ (the old path lib/vendor/autoload.php never existed).
// The application already loads this autoloader at bootstrap; require it
// defensively here only when the tool is loaded in isolation.
if (!class_exists('\EasyRdf\Graph')) {
	$dedalo_vendor_autoload = dirname(__FILE__, 3) . '/vendor/autoload.php';
	if (is_file($dedalo_vendor_autoload)) {
		require_once $dedalo_vendor_autoload;
	}
}
/**
* CLASS TOOL_IMPORT_RDF
* Section-toolbar tool that fetches external RDF graphs and maps their data into
* Dédalo component records.
*
* This tool is triggered from the section toolbar (same pattern as tool_export) when a
* section carries a component_iri holding one or more RDF resource URIs. For each URI the
* tool:
*   1. Resolves the EasyRdf-compatible .rdf URL (appends ".rdf" if absent).
*   2. Loads the remote RDF graph via EasyRdf (sweetrdf/easyrdf composer package).
*   3. Walks the Dédalo ontology sub-tree for the matching OWL class, building a flat
*      list of dd_object descriptors (section, components, values) — one per RDF property.
*   4. Writes the resolved values directly into the target Dédalo component instances,
*      using create_record() where no existing record is found.
*
* Ontology-driven data-transformation pipeline:
*   The ontology node for each OWL Object Property can carry a `process` object that
*   activates one of four transformation modes (evaluated in this order inside
*   get_resource_to_dd_object):
*   - `process->source` + `process->data_map` — substring-match the source value against a
*     lookup table of { substring => replacement } entries; the first match wins.
*   - `process->split` — explode the source by a delimiter, pick 'end' (or a future index),
*     then use the configured property name for the RDF lookup.
*   - `process->date` — read start/end RDF date literals (xsd:date or plain string) and
*     build dd_date objects via set_<format>() dynamic dispatch.
*   - `process->geo_tag` — build a GeoJSON FeatureCollection string in the
*     `[geo-n-1--data:...:data]` special-value format expected by component_geo_tag.
*   - `process->geo_map` — build a { lat, lon, zoom } plain object for component_geo_map.
*
* Intermediary sections (ddo_map):
*   When the ontology node carries a `ddo_map` array (e.g. a ref_biblio or ref_person
*   sits between the subject resource and the actual value), `create_new_resource` handles
*   the extra section level: it searches for an existing matching child record; if absent
*   it creates a new one, links it via the relation component, and recurses into
*   get_resource_to_dd_object with the new locator and the inner ddo path.
*
* Security:
*   - API_ACTIONS allows only `get_rdf_data`; all other public-static methods are
*     internal helpers callable only within this class (SEC-024 §9.2 pattern).
*   - Before loading any remote URI, `is_safe_remote_url()` blocks loopback, RFC-1918,
*     link-local, multicast, and non-http/https schemes (SEC-072 SSRF guard).
*   - `security::assert_section_permission($loc_section_tipo, 2)` enforces write
*     permission on the target section before any data mutation.
*
* External dependency:
*   sweetrdf/easyrdf (^1.0) — PSR-4 autoloaded by composer. Loaded lazily via
*   `load_easyrdf()` to allow the class file to be parsed in environments where the tool
*   is not active. The bootstrap-level autoloader already covers most call paths; the
*   top-of-file require_once is a defensive fallback for isolated loading.
*
* Relationships:
*   - Extends tool_common (tools/tool_common/class.tool_common.php).
*   - Invoked by dd_tools_api::tool_request via the API_ACTIONS allowlist.
*   - Reads ontology nodes from ontology_node (core/ontology_node/).
*   - Writes component data via component_common::get_instance() → set_data() / save().
*   - Builds locators using the locator class (DEDALO_RELATION_TYPE_LINK).
*   - Searches for existing records via search::get_instance() (SQO protocol).
*
* @package Dédalo
* @subpackage Tools
*/
class tool_import_rdf extends tool_common {



	/**
	* API_ACTIONS
	* SEC-024 (§9.2): explicit allowlist of methods callable via
	* `dd_tools_api::tool_request`. The other public-static methods on this
	* class (get_class_map_to_dd, get_resource_to_dd_object, process_data_map,
	* get_resource_match, set_data_into_component, create_new_resource) are
	* internal helpers with positional / non-rqo signatures and MUST NOT be
	* exposed through the tools API dispatcher.
	* @var array<string> API_ACTIONS
	*/
	public const API_ACTIONS = [
		'get_rdf_data'
	];



	/**
	* $easyrdf_loaded
	* Lazy-load sentinel. Set to true by load_easyrdf() after the EasyRdf dependency
	* has been verified. Prevents redundant class_exists() checks on subsequent calls
	* within the same request lifecycle.
	* @var bool $easyrdf_loaded
	*/
	private static $easyrdf_loaded = false;



	/**
	* LOAD_EASYRDF
	* Verifies the EasyRdf library is available and marks it loaded.
	*
	* Called at the top of every public entry point (get_rdf_data) that needs EasyRdf.
	* On first call it confirms the \EasyRdf\Graph class exists (provided by the
	* sweetrdf/easyrdf composer package); if it does not, the method throws a
	* RuntimeException with an actionable install instruction so a deployer who ran
	* `composer install --no-dev` gets a clear error rather than a silent class-not-found
	* deep inside the traversal.
	*
	* Subsequent calls return immediately via the $easyrdf_loaded sentinel.
	*
	* (!) This method has NO side-effect on the RDF namespace registry; namespace
	* registration happens in get_rdf_data just before graph loading.
	*
	* @return void
	* @throws \RuntimeException If EasyRdf is not installed.
	*/
	private static function load_easyrdf() : void {
		if (self::$easyrdf_loaded === true) {
			return;
		}

		// CONF-01: EasyRdf is PSR-4 autoloaded by composer ("EasyRdf\\" => lib), so
		// no manual file includes are needed (the previous DEDALO_LIB_PATH/vendor
		// paths did not exist). Fail loudly if the dependency is missing, so a
		// deployer running `composer install --no-dev` without easyrdf gets a clear
		// signal instead of a cryptic class-not-found later.
		if (!class_exists('\EasyRdf\Graph')) {
			throw new \RuntimeException(
				'EasyRdf is not installed. Run `composer install` (sweetrdf/easyrdf is a runtime dependency).'
			);
		}

		self::$easyrdf_loaded = true;
	}//end load_easyrdf



	/**
	* GET_ONTOLOGY_TIPO
	* Returns the external-ontology tipo declared on a component's ontology node.
	*
	* Reads the `ar_tools_name->tool_import_rdf->external_ontology` property from the
	* ontology node for the given component tipo. This property is configured in the
	* Dédalo ontology editor and maps a Dédalo component (e.g. numisdata310) to its
	* corresponding ontology root tipo (e.g. numisdata1129), which is the subtree that
	* tool_import_rdf uses to drive the OWL-class and OWL-ObjectProperty traversal.
	*
	* (!) The property path is assumed to exist; callers should ensure the component
	* tipo has tool_import_rdf configured in the ontology before calling this method.
	*
	* @param string $component_tipo The component tipo whose external ontology is needed
	* @return string $ontology_tipo The ontology tipo for the RDF class hierarchy root
	*/
	public function get_ontology_tipo(string $component_tipo) : string {

		$ontology_node	= ontology_node::get_instance($component_tipo);
		$properties		= $ontology_node->get_properties();

		// Retrieve the ontology tipo from the 'tool_import_rdf' property
		$ontology_tipo	= $properties->ar_tools_name->tool_import_rdf->external_ontology;

		return $ontology_tipo;
	}//end get_ontology_tipo



	/**
	* GET_COMPONENT_DATA
	* Retrieves the stored data for a single component from a given section record.
	*
	* Selects the correct language key (DEDALO_DATA_LANG for translatable components,
	* DEDALO_DATA_NOLAN for language-neutral ones) and instantiates the component in
	* 'list' mode to read its persisted value via get_data_lang().
	*
	* This is a convenience helper for the JS-facing side to pre-fill UI widgets with
	* existing data before initiating an RDF import session.
	*
	* @param int|string $section_id      Record identifier within $this->section_tipo
	* @param string     $component_tipo  The component tipo to read
	* @return mixed $component_data      Raw component data (shape varies by model)
	*/
	public function get_component_data(int|string $section_id,	string $component_tipo) : mixed {

		$lang	= ontology_node::get_translatable($component_tipo) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
		$model	= ontology_node::get_model_by_tipo($component_tipo);

		// component
		$component = component_common::get_instance(
			$model,
			$component_tipo,
			$section_id,
			'list',
			$lang,
			$this->section_tipo
		);

		$component_data = $component->get_data_lang($lang);


		return $component_data;
	}//end get_component_data



	/**
	* GET_RDF_DATA
	* Public API entry point: fetches one or more RDF graphs and maps them to Dédalo
	* component data, writing values into the target section record.
	*
	* For each URI in $options->ar_values the method:
	*   1. Appends ".rdf" if not already present (many registries serve XML-RDF at that path).
	*   2. Validates the URL with is_safe_remote_url() (SEC-072 SSRF guard — rejects
	*      loopback, RFC-1918, link-local, non-http/https). Custom ports are permitted
	*      because some RDF vocabularies are served on :8080.
	*   3. Registers the namespaces declared in the ontology node's `xmlns` property with
	*      \EasyRdf\RdfNamespace::set() so that prefixed property names resolve correctly.
	*   4. Loads the graph and calls get_class_map_to_dd() to build a flat array of
	*      dd_object descriptors (section / component / value triples).
	*   5. Appends both the dd_object array and an EasyRdf HTML dump to the result payload
	*      so the browser UI can display what was imported.
	*
	* The result shape per URI is a stdClass:
	*   { dd_obj: array<stdClass>, ar_rdf_html: string }
	*
	* Data writing happens inside get_resource_to_dd_object → set_data_into_component
	* as a side-effect of the graph traversal. The response result is primarily used
	* by the browser to render a confirmation / preview.
	*
	* (!) This method is the ONLY member listed in API_ACTIONS and therefore the only one
	* reachable through dd_tools_api::tool_request. All side-effecting writes go through
	* security::assert_section_permission() before any graph traversal begins.
	*
	* @param object $options {
	*   ontology_tipo  : string   — dd tipo of the tool_import_rdf ontology root (e.g. numisdata1129),
	*   ar_values      : string[] — list of RDF resource URIs to import,
	*   locator        : ?object  — locator pointing to the target section record; when set,
	*                              write permission is asserted before processing
	* }
	* @return object {
	*   result : array<stdClass>|false — array of per-URI { dd_obj, ar_rdf_html } on success, false on error,
	*   msg    : string                — human-readable status message
	* }
	*/
	public static function get_rdf_data($options) : object {

		// Load EasyRdf library
		self::load_easyrdf();

		// options
			$ontology_tipo	= $options->ontology_tipo ?? null;
			$ar_values		= $options->ar_values ?? [];
			$locator		= $options->locator ?? null;

		// SEC-024 (§9.2): WRITE gate. RDF import resolves external URIs and
		// writes resolved values into the component referenced by $locator.
		// Caller must have write on the locator's section.
			if (is_object($locator)) {
				$loc_section_tipo = $locator->section_tipo ?? null;
				if (!empty($loc_section_tipo)) {
					security::assert_section_permission($loc_section_tipo, 2, __METHOD__);
				}
			}

		// response
			$response = new stdClass();
				$response->result	= false;
				$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';

		// properties
			$ontology_node = ontology_node::get_instance($ontology_tipo);
			$properties = $ontology_node->get_properties();

		// namespace
			$name_space = $properties->xmlns;
			foreach($name_space as $key => $value){
				\EasyRdf\RdfNamespace::set($key, $value);
			}

		// rdf_data
			$rdf_data = [];
			foreach($ar_values as $uri) {

				$rdf_uri = (substr($uri, -4)!=='.rdf')
					? $uri.'.rdf'
					: $uri;

				// SEC-072: SSRF confinement. Before handing the URI to EasyRdf
				// (which calls curl/file_get_contents internally), confirm it
				// resolves to a public host. `is_safe_remote_url()` blocks
				// loopback / RFC1918 / link-local / multicast / reserved, and
				// restricts the scheme to http/https. Custom ports are allowed
				// here because RDF vocabularies occasionally live on :8080.
				$url_check_options = (object)['allow_custom_ports' => true];
				if (!is_safe_remote_url($rdf_uri, $url_check_options)) {
					debug_log(__METHOD__
						. ' SEC-072: refused unsafe RDF URI: ' . to_string($rdf_uri)
						, logger::ERROR
					);
					continue;
				}

				$base_uri = substr($rdf_uri, 0, strlen($rdf_uri)-4);

				$rdf_graph = new \EasyRdf\Graph($rdf_uri);

				try {
					$rdf_graph->load();
				} catch (Exception $e) {

					debug_log(__METHOD__
						." Ignored broken link in RDF" . PHP_EOL
						.' rdf_uri: ' . to_string($rdf_uri) . PHP_EOL
						.' exception: ' . $e->getMessage()
						, logger::ERROR
					);
					continue;
				}

				// $resources = $rdf_graph->resources();
				// $rdf_types = $rdf_graph->toRdfPhp();

				// rdf_type
				// Resolve the primary rdf:type of the base resource (the subject URI).
				// This string (e.g. "nmo:NumismaticObject") is matched against the labels of
				// the ontology's OWL Class children in get_class_map_to_dd to find the
				// correct Dédalo section mapping.
				$rdf_type = $rdf_graph->type($base_uri);

				// ontology_children
				// Direct children of the root ontology tipo — these are the OWL Class nodes
				// whose labels are compared to $rdf_type to select the mapping branch.
				$ontology_children = ontology_node::get_ar_children($ontology_tipo);

				$dd_obj = tool_import_rdf::get_class_map_to_dd($ontology_children, $rdf_type, $rdf_graph, $base_uri, $locator);

				// ar_rdf_html
				// EasyRdf HTML dump included in the response so the browser can render
				// a human-readable preview of the raw RDF graph alongside the mapped data.
				$ar_rdf_html =$rdf_graph->dump('html');

				$ar_dd_obj = new stdClass();
					$ar_dd_obj->dd_obj		= $dd_obj;
					$ar_dd_obj->ar_rdf_html	= $ar_rdf_html;

				$rdf_data[] = $ar_dd_obj;
			}

		// response OK
			$response->result	= $rdf_data;
			$response->msg		= 'OK. Request done ['.__FUNCTION__.']';


		return $response;
	}//end get_rdf_data



	/**
	* GET_CLASS_MAP_TO_DD
	* Matches an RDF rdf:type string against the Dédalo ontology OWL Class subtree and
	* returns a flat array of dd_object descriptors for the whole resource.
	*
	* The method walks $ar_class_children (each being an OWL Class tipo) and compares
	* their ontology label against the $rdf_type string (e.g. "nmo:NumismaticObject").
	* When a match is found:
	*   - The OWL ObjectProperty children of that class are retrieved.
	*   - The related Dédalo section tipo is resolved.
	*   - A synthetic "root" field descriptor for the section itself is prepended.
	*   - get_resource_to_dd_object() is called recursively to build the remaining
	*     property-level descriptors and simultaneously write values into the record.
	*
	* Each element of the returned array is a stdClass shaped as:
	*   {
	*     tipo             : string  — Dédalo component or section tipo,
	*     section_tipo     : string  — containing section tipo,
	*     parent           : string  — parent tipo or 'root' for the section descriptor,
	*     rdf_type         : string  — RDF class or property name,
	*     value            : mixed   — resolved and (optionally) transformed value,
	*     component_label  : string  — human-readable component label,
	*     section_tipo_label: string — human-readable section label
	*   }
	*
	* Returns an empty array if no OWL Class label matches $rdf_type (and logs an error
	* when SHOW_DEBUG is enabled).
	*
	* @param array  $ar_class_children Child OWL Class tipos under the ontology root
	* @param string $rdf_type          The rdf:type string of the RDF subject resource
	* @param object $rdf_graph         EasyRdf\Graph loaded with the target document
	* @param string $base_uri          Subject URI (without the ".rdf" suffix)
	* @param mixed  $locator           Locator of the Dédalo target record, or false when
	*                                  called without an existing record context
	* @return array $ar_dd_object      Flat array of dd_object descriptors (empty on no match)
	*/
	public static function get_class_map_to_dd(array $ar_class_children, string $rdf_type, $rdf_graph, $base_uri, $locator) : array {

		$ar_owl_ObjectProperty = [];
		foreach ($ar_class_children as $owl_class_tipo) {
			$class_name = ontology_node::get_term_by_tipo($owl_class_tipo);

			if ($class_name === $rdf_type) {
				$ar_owl_ObjectProperty = ontology_node::get_ar_children($owl_class_tipo);
				$current_section_tipo = ontology_node::get_ar_tipo_by_model_and_relation($owl_class_tipo, 'section', 'related', false);
			}
		}

		if (!isset($current_section_tipo)) {
			if(SHOW_DEBUG===true) {
				debug_log(__METHOD__
					. " section tipo not found for rdf_type " . PHP_EOL
					. ' ar_class_children: ' . to_string($ar_class_children) . PHP_EOL
					. ' rdf_type: ' . to_string($rdf_type) . PHP_EOL
					. ' rdf_graph: ' . to_string($rdf_graph) . PHP_EOL
					. ' base_uri: ' . to_string($base_uri) . PHP_EOL
					. ' locator: ' . to_string($locator)
					, logger::ERROR
				);
			}
			return [];
		}

		$section_tipo		= reset($current_section_tipo);
		$section_tipo_label	= ontology_node::get_term_by_tipo($section_tipo);

		// main section
			$field = new stdClass();
				$field->tipo				= $section_tipo;
				$field->section_tipo		= $section_tipo;
				$field->parent				= 'root';
				$field->rdf_type			= $rdf_type;
				$field->value				= $base_uri;
				$field->component_label		= $section_tipo_label;
				$field->section_tipo_label	= $section_tipo_label;


		$ar_dd_object = array_merge(
			[$field],
			tool_import_rdf::get_resource_to_dd_object(
				$ar_owl_ObjectProperty,
				$rdf_graph,
				$base_uri,
				$current_section_tipo,
				$section_tipo,
				$locator
			)
		);


		return $ar_dd_object;
	}//end get_class_map_to_dd



	/**
	* GET_RESOURCE_TO_DD_OBJECT
	* Core recursive traversal: walks OWL ObjectProperty tipos, extracts values from the
	* RDF graph, runs configured transformations, and writes data into Dédalo components.
	*
	* Called first by get_class_map_to_dd (top level) and then recursively for linked
	* resources (deep links) and intermediary sections (ddo_map). Returns a flat array of
	* dd_object descriptors — one per property that was successfully processed — which the
	* browser UI uses to display what was imported.
	*
	* --- Property evaluation order (for each $ObjectProperty_tipo) ---
	*
	* 1. ddo_map branch (intermediary section):
	*    When the ontology property carries `ddo_map`, the property represents a relation
	*    component that points to an independent section (e.g. a bibliographic reference).
	*    The method calls create_new_resource() to find or create the child section record,
	*    then recurses into get_resource_to_dd_object with the new locator and the inner
	*    ObjectProperty children of that intermediary.
	*
	* 2. children_dd_tipo branch (nested ObjectProperty):
	*    When the property has OWL ObjectProperty children of its own, the current resource
	*    URI is followed and the method recurses with the nested property list.
	*
	* 3. Leaf branch (no children — terminal value):
	*    a. process->source / process->data_map — lookup-table substitution.
	*    b. process->split — explode + pick-end then re-bind the property name.
	*    c. process->date — read xsd:date or plain-string start/end literals, construct
	*       dd_date objects via dynamic set_<format>() dispatch.
	*    d. process->geo_tag — build a GeoJSON FeatureCollection encoded as the
	*       "[geo-n-1--data:...:data]" special string expected by component_geo_tag.
	*    e. process->geo_map — build a { lat, lon, zoom } object for component_geo_map.
	*
	*    After any transformation, values are read either as EasyRdf literals (language-
	*    aware, iterating $ar_project_lang) or as resources (URI-bearing; followed one
	*    level deep via $resource->load('rdfxml') for deep-link resolution).
	*
	*    component_iri receives an array of { iri: string } objects (all URIs collected
	*    from allResources()), merging with any pre-existing values.
	*
	*    A `match` property on the related OWL Class ontology node triggers
	*    get_resource_match() to resolve the literal/URI to an existing Dédalo record
	*    (or create a new one) before storing.
	*
	*    set_data_into_component() is called for every resolved value; that method guards
	*    against overwriting non-empty data (except for component_iri and relation models,
	*    which merge instead of replace).
	*
	* (!) The method has deliberate write side-effects: every set_data_into_component()
	* call persists data into the database. The returned array is supplemental metadata
	* for the browser preview, not the primary output of the operation.
	*
	* (!) $field is declared inside the loop but referenced after both the literal and
	* resource branches. If a property produces no $field (e.g. due to early `continue`),
	* the isset($field) guard at the bottom prevents a stale value from a previous
	* iteration being appended.
	*
	* @param array  $ar_owl_ObjectProperty OWL ObjectProperty tipos to process
	* @param object $rdf_graph             EasyRdf\Graph containing the loaded document
	* @param string $base_uri              Subject URI for the current traversal level
	* @param array  $ar_section_tipo       Section tipo(s) for the current level (first element used)
	* @param string $parent                Parent tipo label (tipo string or 'root') for the descriptor
	* @param mixed  $locator               Locator of the current target Dédalo record, or false
	* @return array $ar_resources          Flat array of dd_object descriptor stdClass instances
	*/
	public static function get_resource_to_dd_object($ar_owl_ObjectProperty, $rdf_graph, $base_uri, $ar_section_tipo, $parent, $locator=false) : array {

		$ar_resources	= [];
		$section_tipo	= reset($ar_section_tipo);

		foreach ($ar_owl_ObjectProperty as $ObjectProperty_tipo) {

			$section_tipo_label		= ontology_node::get_term_by_tipo($section_tipo);
			$object_property_name	= ontology_node::get_term_by_tipo($ObjectProperty_tipo);
			$related_dd_tipo		= ontology_node::get_ar_tipo_by_model_and_relation($ObjectProperty_tipo, 'component_', 'related', false);
			$children_dd_tipo		= ontology_node::get_ar_tipo_by_model_and_relation($ObjectProperty_tipo, 'owl:ObjectProperty', 'children', false);
			$current_tipo			= reset($related_dd_tipo);

			// properties
				// Read the ontology node for this ObjectProperty to discover transformation
				// rules (process.*) and structural hints (ddo_map, match).
				$ontology_node = ontology_node::get_instance($ObjectProperty_tipo);
			$properties = $ontology_node->get_properties();
			// ddo_map branch
			// When the data to import has a section between the source and resource (as ref biblio or ref person)
			// it will have a ddo_map to indicate the path to the resource.
			// ddo_map is an array of ddo descriptors that define the relation path from the
			// current section down to the intermediary section (e.g. ref_biblio). The first
			// ddo whose `parent` matches $current_tipo is the one that needs a new record.
				if(isset($properties->ddo_map)){

					$ar_ddo = $properties->ddo_map ?? [];
					// get the ddo has child of the current component.
					// array_find walks the ddo_map to find the entry whose parent is the
					// current relation component tipo — that entry describes the intermediary
					// section (section_tipo) and its own component (component_tipo).
					$current_ddo = array_find($ar_ddo, function($item) use($current_tipo){
						return $item->parent===$current_tipo;
					});
					// get the resource to use, normally the ref biblio or ref person has a resource in RDF
					// Fetch the RDF resource linked from the subject via the current property.
					// This URI is used to search for an existing Dédalo record before creating a new one.
					$resource = $rdf_graph->getResource($base_uri, $object_property_name);
					if(!isset($resource)) {
						continue;
					}
					$resource_uri = $resource->getUri();
					// create new options
					$resource_options = new stdClass();
						$resource_options->current_tipo		= $current_tipo;
						$resource_options->target_ddo		= $current_ddo;
						$resource_options->path 			= $ar_ddo;
						$resource_options->locator			= $locator;
						$resource_options->value			= $resource_uri;
					// search following the path defined in ontology to check if the resource is loaded and it's linked into the current section
					// if not, create new one and get the new locator
					// create_new_resource returns null when an existing record was found
					// (no action needed) or a new locator when a record was just created.
					$new_locator = tool_import_rdf::create_new_resource($resource_options);

					// if is necessary set new data, go to next level with the data created and the new context (next section into the path)
					// see the numisdata1138 as example.
					// null return = record already existed and its data is already set; skip.
					// Non-null = a fresh record was created; populate its fields by recursing
					// into the children of this intermediary level using the new locator.
					if($new_locator!==null){
						$ar_resources = tool_import_rdf::get_resource_to_dd_object($children_dd_tipo, $rdf_graph, $base_uri, [$current_ddo->section_tipo], $current_ddo->component_tipo, $new_locator);
					}
				}

			// children_dd_tipo branch
			// If this ObjectProperty has nested ObjectProperty children, it acts as a
			// structural grouping node rather than a terminal value. Follow the linked
			// resource URI and recurse into the children using that URI as the new subject.
			if($children_dd_tipo) {
				$current_resource = $rdf_graph->getResource($base_uri, $object_property_name);
				// $all_resources = $rdf_graph->properties($base_uri);
				if(!isset($current_resource)) {
					continue;
				}
				$resource_uri = $current_resource->getUri();
				$ar_resources = array_merge($ar_resources, tool_import_rdf::get_resource_to_dd_object($children_dd_tipo, $rdf_graph, $resource_uri, [$section_tipo], $parent, $locator));
			}else{
				// Leaf branch: this property maps to a single terminal Dédalo component.
				// Run any ontology-configured transformation, then read the RDF value and
				// save it into the component via set_data_into_component.
				$procesed_data = false;
				// process->source: apply a substring-keyed lookup table to the source value.
				// Currently the only supported source token is '$base_uri'.
				if(isset($properties->process->source)){
					$source = $properties->process->source;
					$source_data = '';
					if($source === '$base_uri'){
						$source_data = $base_uri;
					}
					$procesed_data = tool_import_rdf::process_data_map($source_data, $properties->process->data_map);
				}
				// process->split: extract a sub-string from the source by splitting on a
				// delimiter and picking one part (only 'end' is currently implemented).
				// The resulting string is also used to override $object_property_name so the
				// correct RDF property is targeted for the subsequent literal lookup.
				if(isset($properties->process->split)){
					$source = $properties->process->split->source;
					$source_data = '';
					if($source === '$base_uri'){
						$source_data = $base_uri;
					}
					$split_by = $properties->process->split->split_by;
					$ar_parts = explode($split_by , $source_data);

					$get_element = $properties->process->split->get;
					if($get_element==='end'){
						$element_got = end($ar_parts);
					}
					$object_property_name = $properties->process->split->property_name;
					$procesed_data = $element_got;
				}
				// process->date: build a dd_date object from typed RDF date literals.
				// The ontology node declares start/end property names and a `format` map
				// (e.g. {"xsd:date": "day"}) that drives dynamic set_<format>() dispatch.
				// xsd:date values arrive as \EasyRdf\Literal\Date objects and need
				// ->format('Y-m-d') to get a string; plain string literals are used as-is.
				if(isset($properties->process->date)){
					$source				= $properties->process->date;
					$start				= $source->start;
					$end				= $source->end ?? null;

					//start
					$date_start_literal	= $rdf_graph->getLiteral($base_uri, $start);

					$start_data = isset($date_start_literal)
						? $date_start_literal->getValue()
						: null;

					$start_format = isset($start_data)
						? $date_start_literal->getDatatype()
						: null;

					// end
					if($end != null){
						$date_end_literal	= $rdf_graph->getLiteral($base_uri, $end);

						$end_data = isset($date_end_literal)
							? $date_end_literal->getValue()
							: null;

						$end_format = isset($end_data)
							? $date_end_literal->getDatatype()
							: null;
					}

					// $match_format is the datatype-to-setter lookup, e.g.:
					// { "xsd:date": "day" } → set_day('2023-01-15')
					$match_format = $source ->format;

					// Use start if available; fall back to end for the property lookup.
					$object_property_name = isset($date_start_literal)
						? $start
						: $end;

					if(isset($start_data)){
						$start_data_string = ($start_format==='xsd:date')
							? $start_data->format('Y-m-d')
							: $start_data;

						$start_date = new dd_date();
							// Dynamic dispatch: $set_start = 'set_day', 'set_year', etc.,
							// determined by the datatype → format map in the ontology node.
							$set_start = 'set_'.$match_format->$start_format;
							$start_date->$set_start($start_data_string);
					}else{
						$start_date = null;
					}

					if(isset($end_data)){

						$end_data_string = ($end_format==='xsd:date')
							? $end_data->format('Y-m-d')
							: $end_data;

						$end_date = new dd_date();
							$set_end = 'set_'.$match_format->$end_format;
							$end_date->$set_end($end_data_string);
					}else{
						$end_date= null;
					}

					// Wrap in array because component_date stores an array of date objects.
					$date = new stdClass;
						if(isset($start_date)){ $date->start = $start_date; }
						if(isset($end_date)) { $date->end = $end_date; }

					$procesed_data= [$date];

				}
				// process->geo_tag: build the "[geo-n-1--data:...:data]" special-value
				// string consumed by component_geo_tag. GeoJSON double-quotes are replaced
				// with single quotes because the string is embedded in an attribute-like
				// token where double quotes would break the outer wrapper parsing.
				if(isset($properties->process->geo_tag)){
					$source	= $properties->process->geo_tag;
					$lat	= $source->lat;
					$long	= $source->long;

					$data_lat_literal	= $rdf_graph->getLiteral($base_uri, $lat);
					$data_long_literal	= $rdf_graph->getLiteral($base_uri, $long);

					// Set $object_property_name so the $field descriptor below uses the lat
					// (or long as fallback) property name for identification purposes.
					$object_property_name = isset($lat)
							? $lat
							: $long;

					$data_lat = isset($data_lat_literal)
							? $data_lat_literal->getValue()
							: null;
					$data_long = isset($data_long_literal)
							? $data_long_literal->getValue()
							: null;

					// GeoJSON coordinate order is [longitude, latitude] per RFC 7946.
					$feature = new stdClass();
						$feature->type = "Feature";
						$feature->properties = new stdClass();
						$feature->geometry = new stdClass();
						$feature->geometry->type = "Point";
						$feature->geometry->coordinates= [(float)$data_long, (float)$data_lat];

					$geojson = new stdClass();
						$geojson->type = "FeatureCollection";
						$geojson->features = [$feature];

					$geojson_encode = json_encode($geojson);
					// Replace double quotes with single quotes so the string can be safely
					// embedded in the special-value token format used by component_geo_tag.
					$geojson_parse = str_replace('"', '\'', $geojson_encode);

					$procesed_data = '[geo-n-1--data:'.$geojson_parse.':data]';
				}
				// process->geo_map: build a plain { lat, lon, zoom } object for
				// component_geo_map. Zoom is hardcoded to 20 (maximum street-level detail).
				if(isset($properties->process->geo_map)){
					$source	= $properties->process->geo_map;
					$lat	= $source->lat;
					$long	= $source->long;

					$data_lat_literal	= $rdf_graph->getLiteral($base_uri, $lat);
					$data_long_literal	= $rdf_graph->getLiteral($base_uri, $long);

					$object_property_name = isset($lat)
							? $lat
							: $long;

					$data_lat = isset($data_lat_literal)
							? $data_lat_literal->getValue()
							: null;
					$data_long = isset($data_long_literal)
							? $data_long_literal->getValue()
							: null;

					$procesed_data = new stdClass();
						$procesed_data->lat		= (float)$data_lat;
						$procesed_data->lon		= (float)$data_long;
						$procesed_data->zoom	= 20;
				}

				//get the Dédalo component names

				$ar_dd_component_label 	= ontology_node::get_term_by_tipo($current_tipo);
				$object_model_name 		= ontology_node::get_model_by_tipo($current_tipo);

				// Dispatch: literal vs resource
				// allResources() returns all RDF resource-type values for the property.
				// An empty array means the value is a literal (plain text / typed data),
				// so we branch into the literal path. A non-empty array means the value
				// is a URI resource and we follow the link.
				$ar_current_resource = $rdf_graph->allResources($base_uri, $object_property_name);
				//literal, if the resource is the end of the path
				if(!isset($ar_current_resource)) continue;
				if(sizeof($ar_current_resource)=== 0){
					// Literal path
					// Start by fetching all project languages; if the RDF literal has no
					// language tag ($check_lang === null), narrow to the installation default
					// so we do not iterate every language for a lang-neutral value.
					$ar_project_lang = common::get_ar_all_langs();

					$literal = $rdf_graph->getLiteral($base_uri, $object_property_name);
					if(!isset($literal)) continue;

					$check_lang = $literal->getLang();
					if($check_lang === null){
						$ar_project_lang = [DEDALO_DATA_LANG];
					}

					foreach ($ar_project_lang as $lang) {

						$lang_alpha2 = lang::get_alpha2_from_code($lang);

						// Re-fetch with the language filter on each iteration.
						// For lang-neutral values, just re-read without a lang tag.
						$literal = ($check_lang === null)
							? $rdf_graph->getLiteral($base_uri, $object_property_name)
							: $rdf_graph->getLiteral($base_uri, $object_property_name, $lang_alpha2);
						if(!isset($literal)) continue;

						// If a process transformation was already applied above, keep it;
						// otherwise fall back to the raw literal string value.
						$procesed_data = isset($properties->process)
							? $procesed_data
							: $literal->getValue();

						// get the literal in the deep link
						// Check if this literal's OWL Class is associated with a Dédalo
						// section that has a `match` property — if so, treat the literal as
						// an identifier to look up (or create) a record via get_resource_match.
							$class_dd_tipo = ontology_node::get_ar_tipo_by_model_and_relation($ObjectProperty_tipo, 'owl:Class', 'related', false);
							if(isset($class_dd_tipo[0])){

								$ar_literal_section_tipo = ontology_node::get_ar_tipo_by_model_and_relation($class_dd_tipo[0], 'section', 'related', false);

								// check if the current literal has a record inside Dédalo.
									$class_dd_tipo_ontology_node = ontology_node::get_instance($class_dd_tipo[0]);
									$class_properties = $class_dd_tipo_ontology_node->get_properties();

									if(isset($class_properties->match)){
										$literal_section_tipo_to_check = reset($ar_literal_section_tipo);
										// dump($literal_section_tipo_to_check.' '.$class_properties->match.' '.$resource_procesed_data, ' literal_section_tipo_to_check ++ '.to_string());
										// Replace the raw literal with a locator to the matched/created record.
										$procesed_data = tool_import_rdf::get_resource_match($literal_section_tipo_to_check, $class_properties->match, $procesed_data);
									}
							}

						tool_import_rdf::set_data_into_component($locator, $current_tipo, $procesed_data, $lang);
					}

					$field = new stdClass();
						$field->tipo				= $current_tipo;
						$field->section_tipo		= $section_tipo;
						$field->parent				= $parent;
						$field->rdf_type			= $object_property_name;
						$field->value				= $procesed_data;
						$field->component_label		= $ar_dd_component_label;
						$field->section_tipo_label	= $section_tipo_label;


				}else{
					// Resource path: the property value is one or more URI-typed RDF resources.
					// if the resource is a link to the resource
					foreach ($ar_current_resource as $uri => $resource) {
						// component_iri special case
						// Store the URI(s) as-is without following the link — component_iri
						// deliberately holds the raw external identifier. Collect ALL linked
						// URIs (not just the first) and build the { iri: string } object array
						// that component_iri expects.
						// if the component is a iri, store the uri of the resource and don't follow the link
						if($object_model_name==='component_iri'){

							$ar_values = $rdf_graph->allResources($base_uri, $object_property_name);
							$iri_procesed_data = [];
							foreach($ar_values as $iri_resource){
								$iri_obj = new stdClass();
									$iri_obj->iri = $iri_resource->getUri();
								$iri_procesed_data[] = $iri_obj;
							}

							$field = new stdClass();
								$field->tipo				= $current_tipo;
								$field->section_tipo		= $section_tipo;
								$field->parent 				= $parent;
								$field->rdf_type			= $object_property_name;
								$field->value				= $iri_procesed_data;
								$field->component_label		= $ar_dd_component_label;
								$field->section_tipo_label	= $section_tipo_label;

								tool_import_rdf::set_data_into_component($locator, $current_tipo, $iri_procesed_data);

						}else{
							// Generic resource path: follow the linked URI, resolve it against
							// a Dédalo record (or create one), store the locator, then recurse
							// into the sub-properties of the linked resource.

							// Apply process->source substitution if configured; otherwise use
							// the resource URI as the value (typical for relation locators).
							$resource_procesed_data = false;
							if(isset($properties->process->source)){
									$source = $properties->process->source;
									$source_data = '';
									if($source === '$base_uri'){
										$source_data = $base_uri;
									}
									$resource_procesed_data = tool_import_rdf::process_data_map($source_data, $properties->process->data_map);
							}
							$resource_procesed_data = ($resource_procesed_data)
								? $resource_procesed_data
								: $resource->getUri();

							// get the literal in the deep link
							// Resolve the OWL Class and related section tipo for the linked
							// resource so we can check for a `match` component.
								$class_dd_tipo			= ontology_node::get_ar_tipo_by_model_and_relation($ObjectProperty_tipo, 'owl:Class', 'related', false);
								$object_dd_tipo			= ontology_node::get_ar_tipo_by_model_and_relation($class_dd_tipo[0], 'owl:ObjectProperty', 'children', false);
								$current_section_tipo	= ontology_node::get_ar_tipo_by_model_and_relation($class_dd_tipo[0], 'section', 'related', false);
								$parent_dd_tipo			= ontology_node::get_ar_tipo_by_model_and_relation($ObjectProperty_tipo, 'component_', 'related', false);
								$resource_uri			= $resource->getUri();
								// Load the linked resource graph (RDF/XML format).
								// A broken or unreachable link is non-fatal: log and continue
								// to the next resource in the list.
								try {
									$resource->load('rdfxml');
								} catch (Exception $e) {

									debug_log(__METHOD__." Ignored broken link in rdf ".to_string($resource_uri), logger::DEBUG);
									continue;
								}
							// check if the current resource has a record inside Dédalo.
							// If the OWL Class ontology node carries a `match` property, use
							// get_resource_match to search for an existing record by value or
							// create a new one. The returned locator replaces the raw URI.
								$class_dd_tipo_ontology_node = ontology_node::get_instance($class_dd_tipo[0]);
								$class_properties = $class_dd_tipo_ontology_node->get_properties();

								if(isset($class_properties->match)){
									$section_tipo_to_check = reset($current_section_tipo);
									// dump($section_tipo_to_check.' '.$class_properties->match.' '.$resource_procesed_data, ' section_tipo_to_check ++ '.to_string());
									$resource_procesed_data = tool_import_rdf::get_resource_match($section_tipo_to_check, $class_properties->match, $resource_procesed_data);
								}

							// create the component_portal of the resource link
								$field = new stdClass();
									$field->tipo				= $current_tipo;
									$field->section_tipo		= $section_tipo;
									$field->parent				= $parent;
									$field->rdf_type			= $object_property_name;
									$field->value				= $resource_procesed_data;
									$field->component_label		= $ar_dd_component_label;
									$field->section_tipo_label	= $section_tipo_label;

								tool_import_rdf::set_data_into_component($locator, $current_tipo, $resource_procesed_data);

							// get the sub_data for the link
							// Recurse into the linked resource's OWL ObjectProperty children
							// using the linked URI as the new subject and the matched/created
							// locator (or raw URI) as the context locator for further writes.
							$ar_resources = array_merge(
								$ar_resources,
								tool_import_rdf::get_resource_to_dd_object($object_dd_tipo, $rdf_graph, $resource_uri, $current_section_tipo, reset($parent_dd_tipo), $resource_procesed_data)
							);
						}
					}//end foreach ($ar_current_resource as $uri => $resource)
				}
			}//end if($children_dd_tipo)

			if(isset($field)){
				$ar_resources[] = $field;
			}
		}//end foreach ($ar_owl_ObjectProperty as $ObjectProperty_tipo)


		return $ar_resources;
	}//end get_resource_to_dd_object



	/**
	* PROCESS_DATA_MAP
	* Applies a substring-keyed lookup table to a source string and returns the mapped value.
	*
	* Iterates over $data_map (an object or associative array where each key is a substring
	* to search for and each value is the replacement). The first key whose substring appears
	* anywhere in $source_data wins, and the corresponding value is returned. If no key
	* matches, returns false.
	*
	* Example — ontology node `process->data_map` might look like:
	*   { "nomisma.org/id": "numisdata:Hoard", "geonames.org": "place" }
	* Searching "http://nomisma.org/id/123" would return "numisdata:Hoard".
	*
	* Called from get_resource_to_dd_object in both the literal and resource branches when
	* `process->source` is configured.
	*
	* @param mixed  $source_data The string to search within
	* @param object $data_map    Lookup object: { substring => replacement, … }
	* @return mixed              The first matching replacement value, or false if none matched
	*/
	public static function process_data_map($source_data, $data_map) {

		$procesed_data = false;

		foreach ($data_map as $key => $value) {
			if(strpos($source_data, $key)!==false){
				$procesed_data = $value;
				break;
			};
		}

		return $procesed_data;
	}//end process_data_map



	/**
	* GET_RESOURCE_MATCH
	* Resolves an external RDF value to a Dédalo locator by searching for an existing
	* record or creating a new one.
	*
	* Used when an OWL Class node carries a `match` property: that property specifies the
	* component tipo (e.g. a component_string identifier) that holds the canonical value
	* to match against. The method:
	*   1. Builds a strict equality SQO filter for $value against $component_tipo inside
	*      $section_tipo (skipping the projects filter so all records are searched).
	*   2. Runs the search; expects 0 or 1 results (> 1 logs an error and uses the first).
	*   3. If 0 results: creates a new section record, saves $value into $component_tipo,
	*      and handles the component_iri special shape ({ iri: string } object).
	*   4. Returns a locator of type DEDALO_RELATION_TYPE_LINK pointing to the found or
	*      created record.
	*
	* (!) Both $value and the resolved $name are json_encode'd when embedded in the filter
	* JSON document to prevent injection via quotes or backslashes in remote RDF literals
	* (TOOLS-04 annotation).
	*
	* (!) The caller receives a locator object regardless of whether the record was found or
	* created — the caller is responsible for using this locator to store a relation in the
	* parent record.
	*
	* @param string  $section_tipo   Section tipo to search within
	* @param string  $component_tipo Component tipo that holds the matching value
	* @param string  $value          Value to search for (exact equality match)
	* @param ?string $filter [= null] Raw JSON filter string override; when provided, the
	*                                 default equality filter is skipped entirely
	* @return object                  Locator pointing to the found or newly created section record
	*/
	public static function get_resource_match( string $section_tipo, string $component_tipo, string $value, ?string $filter=null ) : object {

		$model_name		= ontology_node::get_model_by_tipo( $component_tipo,true );
		$name			= ontology_node::get_term_by_tipo( $component_tipo, DEDALO_DATA_LANG, true, true );
		$lang 			= ontology_node::get_translatable( $component_tipo ) ? 'all' : DEDALO_DATA_NOLAN;

		// filter
			$filter_string = !empty($filter)
				? $filter
				: '{
					"$and": [
						{
							"q": '.json_encode((string)$value).',
							"q_operator": "==",
							"q_split": false,
							"unaccent": false,
							"lang": "'.$lang.'",
							"path": [
								{
									"section_tipo"		: "'.$section_tipo.'",
									"component_tipo"	: "'.$component_tipo.'",
									"model"				: "'.$model_name.'",
									"name"				: '.json_encode((string)$name).'
								}
							]
						}
					]
				  }';
				// TOOLS-04: $value (a remote RDF literal) and $name are json_encode'd so
				// quotes/backslashes can't break the JSON filter document.

		// sqo
			$sqo = json_decode('{
				"parsed": false,
				"section_tipo": "'.$section_tipo.'",
				"limit": 2,
				"offset": 0,
				"type": "search_json_object",
				"full_count": false,
				"order": false,
				"filter": '.$filter_string.',
				"skip_projects_filter": true,
				"select": []
			}');

		// search
			$search			= search::get_instance($sqo);
			$db_result		= $search->search();
			$count			= $db_result->row_count();

		if($count>1) {

			// more than one exists with same value
				dump('', ' SQO +++++++++++++++++ '.to_string($sqo));
				debug_log(__METHOD__
					." Error Processing Request [get_solved_select_value]. Search on section_tipo: $section_tipo gets more than one result. Only one is expected ! ($count) " . PHP_EOL
					.' section_tipo: ' . $section_tipo . PHP_EOL
					.' count: ' .$count
					, logger::DEBUG
				);

			// use the first one
				$section_id = $db_result->fetch_one()->section_id;

		}elseif ($count===1) {

			// founded. Already created record
				$section_id = $db_result->fetch_one()->section_id;

		}elseif ($count===0) {

			// no found. Create a new empty record
				$section	= section::get_instance($section_tipo);
				$section_id	= $section->create_record();

				if($model_name==='component_iri'){
					$data = new stdClass();
						$data->iri = $value;
				}

				$value = (isset($data))
					? $data
					: $value;

			// save new value
				$lang			= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;
				$code_component	= component_common::get_instance(
					$model_name,
					$component_tipo,
					$section_id,
					'list',
					$lang,
					$section_tipo
				);
				$data = is_array($value) ? $value : [$value];
				$code_component->set_data( $data );
				$code_component->save();

			// debug_log(__METHOD__." Created new non existent record value: ".to_string($value), logger::ERROR);
		}

		$locator = new locator();
			$locator->set_section_tipo($section_tipo);
			$locator->set_section_id($section_id);
			$locator->set_type(DEDALO_RELATION_TYPE_LINK);


		return $locator;
	}//end get_resource_match



	/**
	* SET_DATA_INTO_COMPONENT
	* Writes a value into a Dédalo component instance, merging with existing data
	* rather than overwriting it, with component-model-aware merge strategies.
	*
	* Designed as the terminal write step of the RDF import pipeline. The method:
	*   1. Validates the locator; returns false immediately if it is not an object.
	*   2. Instantiates the component in 'edit' mode using the section from the locator.
	*   3. Reads the existing component data and branches on model type:
	*      - component_iri: merges incoming { iri } objects with existing ones, skipping
	*        duplicates by iri string (allows multiple IRIs to accumulate across calls).
	*      - relation models (component_relation_common::get_components_with_relations()):
	*        appends the new locator to the existing array only if it is not already
	*        present (checked via locator::in_array_locator on section_id + section_tipo).
	*      - all other models: only saves if $old_data is empty, preserving any existing
	*        human-entered value.
	*   4. Saves the merged/new data if the guard conditions are met.
	*
	* (!) The "save only when empty" guard in step 4 means this method is IDEMPOTENT for
	* scalar values and safely re-entrant for additive types (iri, relations).
	*
	* (!) The component is instantiated in 'edit' mode (not 'list') so the get_data()
	* call returns the full record data in the correct editing shape.
	*
	* @param object|bool $locator        Locator pointing to the target section record;
	*                                    bool false is silently accepted and returns false
	* @param string      $component_tipo Component tipo to write into
	* @param mixed       $value          Value to store (shape must match the component model)
	* @param string      $lang [= DEDALO_DATA_LANG] Language key; ignored for non-translatable
	*                                    components (overridden to DEDALO_DATA_NOLAN)
	* @return bool                       true on successful save, false otherwise
	*/
	public static function set_data_into_component(object|bool $locator, string $component_tipo, mixed $value, string $lang=DEDALO_DATA_LANG) : bool {

		// locator check
			if (empty($locator) || !is_object($locator)) {
				debug_log(__METHOD__
					. ' Wrong locator received ' . PHP_EOL
					. ' locator: ' . to_string($locator) .PHP_EOL
					. ' gettype: ' . gettype($locator)
					, logger::ERROR
				);
				return false;
			}

		// sort vars
			$section_tipo	= $locator->section_tipo;
			$section_id		= $locator->section_id;
			$model_name		= ontology_node::get_model_by_tipo($component_tipo,true);

		// save new value
			$lang = ontology_node::get_translatable($component_tipo) ? $lang : DEDALO_DATA_NOLAN;

			$code_component	= component_common::get_instance(
				$model_name,
				$component_tipo,
				$section_id,
				'edit',
				$lang,
				$section_tipo,
				false
			);

		// old data
			// Normalise the existing data to an empty array when the component returns an
			// empty stdClass (some components return {} instead of [] for no data).
			$old_data = $code_component->get_data();
			if(is_object($old_data)) {
				$count = 0;
				foreach ($old_data as $old_value) {
					$count ++;
				}
				if($count===0) $old_data=[];
			};

		// component_iri case
		// component_iri stores an array of { iri: string } objects. Merge incoming IRIs
		// with existing ones, skipping any IRI that is already present to avoid duplicates.
		// After merging, reset $old_data to [] so the generic save guard below proceeds.
			if($model_name==='component_iri' && !empty($old_data)) {

				$new_values = $old_data;
				foreach ($value as $current_iri_obj) {
					$iri_value = $current_iri_obj->iri;

					$find = array_find($old_data, function($el) use($iri_value){
						return $el->iri === $iri_value;
					});

					if($find === null){
						$new_values[] = $current_iri_obj;
					}
				}

				// overwrite value
				$value = $new_values;

				// reset old data
				$old_data = [];
			}

		// relations
		// For relation-type components, append the new locator only if it is not already
		// in the existing list. locator::in_array_locator compares section_id + section_tipo.
		// Reset $old_data to null after merging so the generic save guard sees it as empty.
			$relation_models = component_relation_common::get_components_with_relations();
			if(in_array($model_name, $relation_models) && !empty($old_data)) {

				$object_exists = locator::in_array_locator($value, $old_data, ['section_id','section_tipo']);
				if ($object_exists===false) {

					$new_data	= $old_data;
					$new_data[]	= $value;

					// overwrite value
					$value = $new_data;

					// reset old data
					$old_data = null;
				}
			}

		// save if different avoiding to overwrite existing data
		// Both conditions must hold: (a) no existing data and (b) the new value differs
		// from the current stored value. For component_iri and relations the merge steps
		// above have already reset $old_data to [] / null, so this guard always passes
		// after a merge operation.
			if( empty($old_data) // no previous data exists
				&& $old_data !== $value // new value is different
				) {

				// debug
					// if ($model_name!=='component_iri') {
					// 	dump($old_data, ' old_data )))))))))))) ++ '.to_string($model_name.' '.$component_tipo));
					// 	dump($value, ' value )))))))))))) ++ '.to_string($model_name.' '.$component_tipo));
					// }
				debug_log(__METHOD__
					. " Saving component data. model: $model_name - component_tipo: $component_tipo " . PHP_EOL
					. ' value: ' .to_string($value)
					, logger::DEBUG
				);

				$code_component->set_data( $value );
				$code_component->save();

				return true;
			}


		return false;
	}//end set_data_into_component



	/**
	* CREATE_NEW_RESOURCE
	* Searches for an existing intermediary section record that already links the given
	* RDF resource URI into the current section, and creates a new one if absent.
	*
	* Called from get_resource_to_dd_object when a `ddo_map` property is present. In that
	* scenario the ontology has an intermediary section (e.g. ref_biblio or ref_person)
	* that acts as a bridge between the subject resource and the actual data values. This
	* method ensures that bridge record exists before the caller recurses into it.
	*
	* Procedure:
	*   1. Builds a SQO filter using $path (the full ddo_map array, json_encode'd) to
	*      search for a record in $locator->section_tipo whose relation path already
	*      holds $value (the linked resource URI). The search is section-wide
	*      (skip_projects_filter) and limited to 2 to detect duplicates.
	*   2. If count >= 1: the intermediary already exists → return null (caller skips).
	*   3. If count === 0: create a new empty section record in target_ddo->section_tipo,
	*      then append a locator to that new record into the relation component
	*      ($component_tipo on $locator->section_id), saving the updated relation.
	*   4. Return a locator for the newly created record so the caller can recurse into
	*      its inner property children.
	*
	* (!) Null return means "no action needed"; a non-null return means "new record
	* created, populate it now" — see the caller in get_resource_to_dd_object.
	*
	* (!) $path is json_encode'd into the SQO filter (TOOLS-04 guard).
	*
	* @param object $properties {
	*   locator       : object  — locator of the parent section record,
	*   target_ddo    : object  — ddo entry describing the intermediary section
	*                            ({ section_tipo, component_tipo, parent, … }),
	*   current_tipo  : string  — relation component tipo on the parent section,
	*   path          : array   — full ddo_map array used as the SQO path filter,
	*   value         : string  — RDF resource URI to search for or create
	* }
	* @return object|null       New locator for the created intermediary record, or null
	*                           if a matching record already exists
	*/
	public static function create_new_resource(object $properties) : ?object {

		// properties
			$locator		= $properties->locator;
			$target_ddo		= $properties->target_ddo;
			$component_tipo	= $properties->current_tipo;
			$path			= $properties->path;
			$value			= $properties->value;

			$lang = ontology_node::get_translatable( $component_tipo ) ? 'all' : DEDALO_DATA_NOLAN;
		// filter
			// TOOLS-04: json_encode the remote RDF literal so it can't break the filter JSON.
			$filter = '{
				"$and": [
					{
						"q": '.json_encode((string)$value).',
						"q_split": false,
						"unaccent": false,
						"lang": "'.$lang.'",
						"path": '.json_encode($path).'
					}
				]
			}';

		// sqo
			$sqo = json_decode('{
				"parsed": false,
				"section_tipo": "'.$locator->section_tipo.'",
				"limit": 2,
				"offset": 0,
				"type": "search_json_object",
				"full_count": false,
				"order": false,
				"filter": '.$filter.',
				"skip_projects_filter": true,
				"select": []
			}');

		// search
			$search			= search::get_instance($sqo);
			$db_result		= $search->search();
			$count			= $db_result->row_count();

		// Existing record found: the resource is already linked → nothing to create.
		// Return null to signal the caller that recursion into the intermediary is not needed.
		if($count >= 1){
			return null;
		}

		// No existing record found. Proceed to create the intermediary section record and
		// wire it into the parent section's relation component.
		$model	= ontology_node::get_model_by_tipo($component_tipo);
		$lang	= ontology_node::get_translatable( $component_tipo ) ? DEDALO_DATA_LANG : DEDALO_DATA_NOLAN;

		// component
		// Load the relation component on the PARENT section record so we can append the
		// new intermediary locator to its existing list.
		$component = component_common::get_instance(
			$model,
			$component_tipo,
			$locator->section_id,
			'list',
			$lang,
			$locator->section_tipo
		);
		$data = $component->get_data() ?? [];

		// no found. Create a new empty record
		// The new section record is created empty; its data will be populated by the caller
		// recursing into get_resource_to_dd_object with the returned $new_locator.
		$section = section::get_instance($target_ddo->section_tipo);
		$section_id	= $section->create_record();

		$new_locator = new locator();
			$new_locator->set_section_tipo($target_ddo->section_tipo);
			$new_locator->set_section_id($section_id);
			$new_locator->set_type(DEDALO_RELATION_TYPE_LINK);

		// save new value
		// Append the new locator to the parent's relation component and persist.
		$new_data = array_merge($data, [$new_locator]);
		$component->set_data( $new_data );
		$component->save();


		return $new_locator;
	}//end create_new_resource



}//end tool_import_rdf
