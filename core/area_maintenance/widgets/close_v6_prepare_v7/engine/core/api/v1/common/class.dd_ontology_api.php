<?php declare(strict_types=1);
/**
 * CLASS DD_ONTOLOGY_API
 * Remote API handler for ontology resolution and introspection.
 *
 * Provides structured, MCP-friendly access to the Dédalo ontology, allowing
 * resolution of human-readable text (e.g. "Oral History") to ontology node
 * identifiers (tipos) and their full structural context (sections with components).
 *
 * Routed by dd_manager when rqo->dd_api === 'dd_ontology_api'. Every public
 * static method listed in API_ACTIONS is callable as a remote action; all others
 * are private helpers not reachable over the network.
 *
 * Public actions:
 * - resolve_term    : Search ontology nodes by text (exact JSONB or fuzzy similarity).
 * - resolve_section : Resolve text to section node(s) with full component trees.
 * - get_node        : Retrieve full ontology node data by tipo.
 * - search          : Structured search of dd_ontology by column values.
 * - get_glossary    : Lightweight multilingual glossary for LLM/MCP consumption.
 * - resolve_path    : Walk and annotate a relational hop-path through the ontology.
 *
 * Fuzzy search strategy (used by resolve_term and resolve_section in 'fuzzy' mode):
 *   Phase 1 — JSONPath pre-filter: `term @?` operator for fast GIN-index narrowing.
 *   Phase 2 — Trigram similarity: f_unaccent(jsonb_values_as_text(term)) % f_unaccent(text)
 *             for accent-insensitive ranked matching.
 * Both phases rely on indexes defined in db_pg_definitions.php.
 *
 * All action methods share the same response envelope:
 *   $response->result  mixed   — false on hard failure, data on success
 *   $response->msg     string  — human-readable status message
 *   $response->errors  array   — empty on clean success, error-code strings otherwise
 *
 * Delegates database queries to dd_ontology_db_manager and node instantiation
 * to ontology_node::get_instance().
 *
 * @package Dédalo
 * @subpackage API
 */
final class dd_ontology_api {



	/**
	 * SEC-024: explicit allowlist of methods callable as remote API actions.
	 *
	 * dd_manager enforces this list before dispatching any request: a public static
	 * method NOT listed here cannot be invoked over the network even if its visibility
	 * would otherwise allow it. Add a method here only after confirming it performs its
	 * own input validation and respects security::get_security_permissions().
	 * @var array<string> API_ACTIONS
	 */
	public const API_ACTIONS = [
		'resolve_term',
		'resolve_section',
		'get_node',
		'search',
		'get_glossary',
		'resolve_path'
	];



	/**
	 * RESOLVE_TERM
	 * Searches ontology nodes by text matching their `term` column.
	 *
	 * Supports two search modes:
	 * - 'exact' (default): Uses PostgreSQL JSONB containment (`@>`) to match
	 *   the term column. The text must match a term value exactly for the given
	 *   language key. The `lang` parameter selects which JSONB key to search;
	 *   defaults to DEDALO_STRUCTURE_LANG if not provided.
	 *   If `model` is provided, results are additionally filtered by model name.
	 *
	 * - 'fuzzy': Uses two-phase similarity/trigram search across all term values.
	 *   Phase 1 narrows via JSONPath regex on the GIN index; Phase 2 ranks by
	 *   trigram similarity (f_unaccent + jsonb_values_as_text) with accent-insensitivity.
	 *   More flexible for natural-language input from MCP/LLM contexts.
	 *   If `model` is provided, results are additionally filtered by model name.
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "resolve_term",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "text": "Oral History",
	 *       "lang": "lg-eng",           // optional, default DEDALO_STRUCTURE_LANG
	 *       "mode": "exact",            // optional, "exact"|"fuzzy", default "exact"
	 *       "model": "section",         // optional, filter by model name
	 * 		"is_main": false 			// optional, restrict or require is_main=true nodes
	 *       "limit": 50                 // optional, max results, default 50
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function resolve_term(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. resolve_term request failed';
			$response->errors	= [];

		$source		= $rqo->source ?? new stdClass();
		$text		= $source->text ?? null;
		$lang		= $source->lang ?? DEDALO_STRUCTURE_LANG;
		$mode		= $source->mode ?? 'exact';
		$model		= $source->model ?? null;
		// is_main=false returns all nodes regardless of their is_main flag;
		// pass true to restrict results to nodes marked as primary/canonical terms.
		$is_main	= $source->is_main ?? false;
		$limit		= $source->limit ?? 50;

		if (empty($text) || !is_string($text)) {
			$response->msg		= 'Error. Missing or invalid source.text parameter';
			$response->errors[]	= 'missing_text';
			return $response;
		}

		// Dispatch to the appropriate DB search strategy.
		// Fuzzy is preferred for open-ended LLM/MCP queries; exact requires a
		// precise match in the JSONB term object for the given language key.
		if ($mode === 'fuzzy') {
			$tipos = dd_ontology_db_manager::search_fuzzy_term($text, $model, $is_main, (int)$limit);
		} else {
			$tipos = dd_ontology_db_manager::search_exact_term($text, $lang, $model, $is_main, (int)$limit);
		}

		if ($tipos === false) {
			$response->msg		= 'Error. Database search failed';
			$response->errors[]	= 'db_search_failed';
			return $response;
		}

		$result = [];
		foreach ($tipos as $tipo) {
			$node_descriptor = self::build_node_descriptor($tipo);
			if ($node_descriptor !== null) {
				$result[] = $node_descriptor;
			}
		}

		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. resolve_term request done successfully'
			: 'Warning! resolve_term request done with errors';

		return $response;
	}//end resolve_term



	/**
	 * RESOLVE_SECTION
	 * Resolves a text query to section ontology nodes with their full component trees.
	 *
	 * This is the primary action for MCP consumers: given a text like "Oral History",
	 * it finds matching section nodes and returns each with all its component descriptors.
	 *
	 * Resolution flow:
	 * 1. Search ontology nodes matching the text (using exact or fuzzy mode).
	 * 2. Filter results to only section model nodes (model === 'section').
	 * 3. For each matched section, resolve to real section tipo (handling virtual sections).
	 * 4. Collect all component tipos within the section.
	 * 5. Build descriptors for each component (tipo, model, term, parent, is_translatable, properties).
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "resolve_section",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "text": "Oral History",
	 *       "lang": "lg-eng",           // optional, default DEDALO_STRUCTURE_LANG
	 *       "mode": "fuzzy",            // optional, "exact"|"fuzzy", default "fuzzy"
	 *       "limit": 20                 // optional, max sections, default 20
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function resolve_section(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. resolve_section request failed';
			$response->errors	= [];

		$source		= $rqo->source ?? new stdClass();
		$text		= $source->text ?? null;
		$lang		= $source->lang ?? DEDALO_STRUCTURE_LANG;
		// resolve_section defaults to fuzzy, which is more useful for natural-language
		// queries from LLM/MCP callers that may not know exact ontology term spelling.
		$mode		= $source->mode ?? 'fuzzy';
		// is_main is intentionally hardcoded to false here — resolve_section targets
		// all matching sections regardless of their is_main flag, so callers get the
		// broadest possible match set.
		$is_main	= false;
		$limit		= $source->limit ?? 20;

		if (empty($text) || !is_string($text)) {
			$response->msg		= 'Error. Missing or invalid source.text parameter';
			$response->errors[]	= 'missing_text';
			return $response;
		}

		// The model is pre-filtered to 'section' at the DB layer so fuzzy/exact
		// results already exclude components, portals, etc.
		if ($mode === 'fuzzy') {
			$tipos = dd_ontology_db_manager::search_fuzzy_term($text, 'section', $is_main, (int)$limit);
		} else {
			$tipos = dd_ontology_db_manager::search_exact_term($text, $lang, 'section', $is_main, (int)$limit);
		}

		if ($tipos === false) {
			$response->msg		= 'Error. Database search failed';
			$response->errors[]	= 'db_search_failed';
			return $response;
		}

		$sections = [];
		$resolved_tipos = [];
		foreach ($tipos as $section_tipo) {

			// Double-check model after DB filter: the DB query is model-constrained but
			// get_model_by_tipo resolves from the live ontology cache, catching any
			// inconsistency between the DB index and the in-memory ontology.
			$section_model = ontology_node::get_model_by_tipo($section_tipo, true);
			if ($section_model !== 'section') {
				continue;
			}

			// Virtual sections (aliases that point to a canonical real section) must be
			// deduplicated. Multiple virtual aliases could resolve to the same real tipo,
			// and we only want one descriptor per canonical section.
			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
			if (in_array($section_real_tipo, $resolved_tipos)) {
				continue;
			}
			$resolved_tipos[] = $section_real_tipo;

			// Respect section-level read permissions. A permission value < 1 means no
			// read access for the current user, so skip silently rather than leaking
			// information about restricted sections.
			$section_permisions = security::get_security_permissions($section_real_tipo, $section_real_tipo);
			if ($section_permisions < 1) {
				continue;
			}

			$section_descriptor = self::build_section_descriptor($section_tipo);
			if ($section_descriptor !== null) {
				$sections[] = $section_descriptor;
			}
		}

		$response->result	= $sections;
		$response->msg		= empty($response->errors)
			? 'OK. resolve_section request done successfully'
			: 'Warning! resolve_section request done with errors';

		return $response;
	}//end resolve_section



	/**
	 * GET_NODE
	 * Retrieves full ontology node data for a single tipo.
	 *
	 * Returns all ontology node properties: tipo, parent, term, model,
	 * order_number, relations, tld, properties, model_tipo, is_model, is_translatable.
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "get_node",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "tipo": "oh1"
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function get_node(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. get_node request failed';
			$response->errors	= [];

		$source	= $rqo->source ?? new stdClass();
		$tipo	= $source->tipo ?? null;

		if (empty($tipo) || !is_string($tipo)) {
			$response->msg		= 'Error. Missing or invalid source.tipo parameter';
			$response->errors[]	= 'missing_tipo';
			return $response;
		}

		if (!ontology_utils::check_tipo_is_valid($tipo)) {
			$response->msg		= 'Error. Invalid tipo: ' . $tipo;
			$response->errors[]	= 'invalid_tipo';
			return $response;
		}

		$ontology_node	= ontology_node::get_instance($tipo);
		$data			= $ontology_node->get_data();

		if (empty($data)) {
			$response->msg		= 'Error. Ontology node not found: ' . $tipo;
			$response->errors[]	= 'node_not_found';
			return $response;
		}

		$result = self::format_node_data($tipo, $data);

		$response->result	= $result;
		$response->msg		= 'OK. get_node request done successfully';

		return $response;
	}//end get_node



	/**
	 * SEARCH
	 * Structured search of the dd_ontology table by column values.
	 *
	 * Wraps dd_ontology_db_manager::search() with safe parameter mapping.
	 * Allows filtering by model, parent, tld, is_model, is_translatable.
	 * Optionally includes node descriptor data for each result.
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "search",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "model": "section",            // optional
	 *       "parent": "dd6",              // optional
	 *       "tld": "oh",                  // optional
	 *       "is_model": false,            // optional
	 *       "is_translatable": true,      // optional
	 *       "limit": 100                 // optional, default 100
	 *     },
	 *     "options": {
	 *       "include_data": true         // optional, include full node descriptors, default true
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function search(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. search request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$options		= $rqo->options ?? new stdClass();
		$include_data	= $options->include_data ?? true;

		$search_values = [];
		$allowed_columns = ['model', 'parent', 'tld', 'is_model', 'is_translatable'];

		foreach ($allowed_columns as $col) {
			if (property_exists($source, $col) && $source->{$col} !== null) {
				$search_values[$col] = $source->{$col};
			}
		}

		if (empty($search_values)) {
			$response->msg		= 'Error. At least one search criterion is required';
			$response->errors[]	= 'empty_criteria';
			return $response;
		}

		$limit = (int)($source->limit ?? 100);

		$tipos = dd_ontology_db_manager::search($search_values, true, $limit);

		if ($tipos === false) {
			$response->msg		= 'Error. Database search failed';
			$response->errors[]	= 'db_search_failed';
			return $response;
		}

		$result = [];
		if ($include_data) {
			foreach ($tipos as $tipo) {
				$node_descriptor = self::build_node_descriptor($tipo);
				if ($node_descriptor !== null) {
					$result[] = $node_descriptor;
				}
			}
		} else {
			$result = $tipos;
		}

		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'OK. search request done successfully'
			: 'Warning! search request done with errors';

		return $response;
	}//end search



	/**
	 * GET_GLOSSARY
	 * Returns a lightweight, multilingual glossary of the ontology for LLM consumption.
	 *
	 * Supports three modes:
	 * - 'sections' (default): Returns all section tipos with their multilingual terms.
	 *   Compact one-call dictionary for the LLM to build its mental map.
	 *
	 * - 'section': Returns a single section's full component tree, with portal
	 *   metadata (is_portal, target_section_tipo, target_section_term) so the
	 *   LLM can discover cross-section relationships.
	 *
	 * - 'path': Resolves a relational path (e.g. ["oh1","oh24","rsc197","rsc85"])
	 *   and returns annotated metadata for each hop.
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "get_glossary",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "mode": "sections"|"section"|"path",   // optional, default "sections"
	 *       "section_tipo": "oh1",                  // required for mode="section"
	 *       "path": ["oh1","oh24","rsc197","rsc85"] // required for mode="path"
	 *       "lang": "lg-eng"                        // optional
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function get_glossary(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. get_glossary request failed';
			$response->errors	= [];

		$source			= $rqo->source ?? new stdClass();
		$mode			= $source->mode ?? 'sections';
		$section_tipo	= $source->section_tipo ?? null;
		$path			= $source->path ?? null;

		switch ($mode) {
			case 'sections':
				return self::glossary_sections();
			case 'section':
				return self::glossary_section($section_tipo);
			case 'path':
				return self::glossary_path($path);
			default:
				$response->msg		= 'Error. Invalid mode: ' . $mode . '. Use "sections", "section", or "path"';
				$response->errors[]	= 'invalid_mode';
				return $response;
		}
	}//end get_glossary



	/**
	 * RESOLVE_PATH
	 * Resolves a relational path through the ontology, returning annotated
	 * metadata for each hop.
	 *
	 * This is the primary tool for understanding cross-section relationships.
	 * Given a path like ["oh1","oh24","rsc197","rsc85"], returns:
	 * - oh1  → section "Oral History"
	 * - oh24 → portal "Informant" targeting rsc197
	 * - rsc197 → section "Person"
	 * - rsc85 → component "Name" (component_input_text, column: string)
	 *
	 * @param object $rqo Request query object
	 *   {
	 *     "action": "resolve_path",
	 *     "dd_api": "dd_ontology_api",
	 *     "source": {
	 *       "path": ["oh1","oh24","rsc197","rsc85"]
	 *     }
	 *   }
	 * @return object $response
	 */
	public static function resolve_path(object $rqo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. resolve_path request failed';
			$response->errors	= [];

		$source	= $rqo->source ?? new stdClass();
		$path	= $source->path ?? null;

		if (empty($path) || !is_array($path)) {
			$response->msg		= 'Error. Missing or invalid source.path parameter (array of tipos required)';
			$response->errors[]	= 'missing_path';
			return $response;
		}

		if (count($path) < 2) {
			$response->msg		= 'Error. Path must contain at least 2 elementos';
			$response->errors[]	= 'path_too_short';
			return $response;
		}

		$result = self::resolve_path_hops($path);

		if ($result === null) {
			$response->msg		= 'Error. Failed to resolve path';
			$response->errors[]	= 'path_resolution_failed';
			return $response;
		}

		$response->result	= $result;
		$response->msg		= 'OK. resolve_path request done successfully';

		return $response;
	}//end resolve_path



	// ─────────────────────────────────────────────────────────────────────
	// Private helpers
	// ─────────────────────────────────────────────────────────────────────



	/**
	 * BUILD_NODE_DESCRIPTOR
	 * Builds a lightweight descriptor object for an ontology node.
	 *
	 * @param string $tipo Ontology identifier
	 * @return object|null Node descriptor or null if node not found
	 */
	private static function build_node_descriptor(string $tipo) : ?object {

		$ontology_node	= ontology_node::get_instance($tipo);
		$data			= $ontology_node->get_data();

		if (empty($data)) {
			return null;
		}

		return self::format_node_data($tipo, $data);
	}//end build_node_descriptor



	/**
	 * FORMAT_NODE_DATA
	 * Formats raw ontology node data into a consistent descriptor object.
	 *
	 * @param string $tipo Ontology identifier
	 * @param object $data Raw node data from ontology_node::get_data()
	 * @return object Formatted descriptor
	 */
	private static function format_node_data(string $tipo, object $data) : object {

		$descriptor = new stdClass();
		$descriptor->tipo				= $tipo;
		$descriptor->parent				= $data->parent ?? null;
		$descriptor->term				= $data->term ?? null;
		$descriptor->model				= $data->model ?? null;
		$descriptor->model_tipo			= $data->model_tipo ?? null;
		$descriptor->tld				= $data->tld ?? null;
		$descriptor->order_number		= $data->order_number ?? null;
		$descriptor->is_model			= $data->is_model ?? false;
		$descriptor->is_translatable		= $data->is_translatable ?? false;
		$descriptor->properties			= $data->properties ?? null;

		return $descriptor;
	}//end format_node_data



	/**
	 * BUILD_SECTION_DESCRIPTOR
	 * Builds a full section descriptor with its component tree.
	 *
	 * For the given section tipo, resolves all component children (any model
	 * whose name starts with 'component_') recursively via the ontology tree,
	 * and returns a descriptor object containing:
	 * - Section metadata (tipo, model, term, tld, properties) via format_node_data()
	 * - A 'components' array of lightweight node descriptors for each child component
	 *
	 * Virtual sections are resolved to their canonical real tipo before walking
	 * the component tree, so alias section tipos yield the same component list as
	 * the canonical section.
	 *
	 * @param string $section_tipo Ontology tipo of the section
	 * @return object|null Section descriptor or null on failure
	 */
	private static function build_section_descriptor(string $section_tipo) : ?object {

		$ontology_node	= ontology_node::get_instance($section_tipo);
		$data			= $ontology_node->get_data();

		if (empty($data)) {
			return null;
		}

		$section_descriptor = self::format_node_data($section_tipo, $data);

		// Collect all component tipos within the section tree.
		// - 'component_' prefix match (search_exact=false) catches all component subtypes.
		// - resolve_virtual=true ensures virtual/aliased sections expose their real children.
		// - recursive=true walks the full ontology subtree, not just immediate children.
		$component_tipos = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['component_'],
			true,	// from_cache
			true,	// resolve_virtual
			true,	// recursive
			false	// search_exact (prefix match)
		);

		$components = [];
		foreach ($component_tipos as $component_tipo) {
			$component_descriptor = self::build_node_descriptor($component_tipo);
			if ($component_descriptor !== null) {
				$components[] = $component_descriptor;
			}
		}

		$section_descriptor->components = $components;

		return $section_descriptor;
	}//end build_section_descriptor



	/**
	 * BUILD_COMPONENT_DESCRIPTOR
	 * Builds a component descriptor with portal metadata when applicable.
	 *
	 * For portal components, adds:
	 * - is_portal: true
	 * - target_section_tipo: string[] — tipos of sections this portal points to
	 * - target_section_term: object[] — {tipo, term} pairs for each target section
	 *
	 * "Portal" in this context covers any component type that creates a
	 * cross-section link: component_portal, component_dataframe, and
	 * component_filter (including component_filter_master, which also
	 * matches the 'component_filter' prefix).
	 *
	 * @param string $component_tipo Component ontology tipo
	 * @return object|null Component descriptor or null if not found
	 */
	private static function build_component_descriptor(string $component_tipo) : ?object {

		$descriptor = self::build_node_descriptor($component_tipo);
		if ($descriptor === null) {
			return null;
		}

		$model = $descriptor->model ?? '';
		// Three model families act as cross-section portals and carry target metadata.
		// str_starts_with matches all subtypes (e.g. 'component_portal_link').
		$is_portal = str_starts_with($model, 'component_portal')
			|| str_starts_with($model, 'component_dataframe')
			|| str_starts_with($model, 'component_filter');

		if ($is_portal) {
			$descriptor->is_portal = true;
			$ar_target = self::extract_portal_targets($component_tipo);
			$descriptor->target_section_tipo = $ar_target['tipos'];
			$descriptor->target_section_term = $ar_target['terms'];
		} else {
			$descriptor->is_portal = false;
		}

		return $descriptor;
	}//end build_component_descriptor



	/**
	 * EXTRACT_PORTAL_TARGETS
	 * Extracts target section tipos and terms from a portal component's
	 * ontology properties (source.request_config[*].sqo.section_tipo).
	 *
	 * Portal components store their target section(s) in the ontology `properties`
	 * column under the path: properties.source.request_config[].sqo.section_tipo.
	 * The value of section_tipo can appear in three shapes due to v6/v7 migration:
	 *
	 *   1. v6 wrapped object: { value: ["rsc197"], source: "section" }
	 *   2. Direct string:     "rsc197"
	 *   3. DDO resolved:      { tipo: "rsc197", ... }
	 *
	 * All three are normalized to a plain tipo string. Deduplication is applied
	 * so that a tipo appearing in multiple request_config entries is only listed once.
	 *
	 * @param string $tipo Portal component tipo
	 * @return array{tipos: string[], terms: object[]}
	 *   'tipos' — unique list of target section tipo strings
	 *   'terms' — parallel array of {tipo, term} objects for display use
	 */
	private static function extract_portal_targets(string $tipo) : array {

		$tipos = [];
		$terms = [];

		$ontology_node	= ontology_node::get_instance($tipo);
		$properties		= $ontology_node->get_properties();

		if (empty($properties)) {
			return ['tipos' => $tipos, 'terms' => $terms];
		}

		$source = $properties->source ?? null;
		if (empty($source)) {
			return ['tipos' => $tipos, 'terms' => $terms];
		}

		// request_config is an array of SQO config objects. Each config item
		// may target a different section; we aggregate all targets across all items.
		$request_config = $source->request_config ?? [];
		if (!is_array($request_config)) {
			return ['tipos' => $tipos, 'terms' => $terms];
		}

		foreach ($request_config as $config_item) {
			$sqo = $config_item->sqo ?? null;
			if (empty($sqo)) {
				continue;
			}

			// section_tipo may be a scalar or an array; normalize to array for
			// uniform iteration below.
			$ar_section_tipo = $config_item->sqo->section_tipo ?? [];
			if (!is_array($ar_section_tipo)) {
				$ar_section_tipo = [$ar_section_tipo];
			}

			foreach ($ar_section_tipo as $target_entry) {
				$target_tipo = null;

				// V6 format: {value: ["rsc197"], source: "section"}
				// The value key may hold an array (most common) or a scalar.
				if (is_object($target_entry) && isset($target_entry->value)) {
					$values = $target_entry->value;
					if (is_array($values)) {
						foreach ($values as $v) {
							$target_tipo = $v;
						}
					} else {
						$target_tipo = $values;
					}
				}
				// Direct string
				elseif (is_string($target_entry)) {
					$target_tipo = $target_entry;
				}
				// DDO format (already resolved): {tipo: "rsc197", ...}
				elseif (is_object($target_entry) && isset($target_entry->tipo)) {
					$target_tipo = $target_entry->tipo;
				}

				// Skip duplicates; add term label for each new target.
				if ($target_tipo !== null && !in_array($target_tipo, $tipos)) {
					$tipos[]			= $target_tipo;
					$target_term		= ontology_node::get_term_by_tipo($target_tipo);
					$terms[]			= (object)[
						'tipo'	=> $target_tipo,
						'term'	=> $target_term
					];
				}
			}
		}

		return ['tipos' => $tipos, 'terms' => $terms];
	}//end extract_portal_targets



	/**
	 * GLOSSARY_SECTIONS
	 * Returns the compact sections glossary (all sections with multilingual terms).
	 *
	 * Fetches up to 500 section-model nodes and returns a lightweight array with
	 * only section_tipo, term (full multilingual JSONB object), and tld — enough
	 * for an LLM to build a complete namespace map without loading component trees.
	 *
	 * @return object Response with sections array —
	 *   result: object[] { section_tipo, term, tld }
	 */
	private static function glossary_sections() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. glossary_sections request failed';
			$response->errors	= [];

		// DB already filters by model='section'. The 500-row cap is intentional:
		// a Dédalo instance should never have thousands of section types, and
		// loading all of them in one call is safe at this scale.
		$tipos = dd_ontology_db_manager::search(['model' => 'section'], true, 500);

		if ($tipos === false) {
			$response->msg		= 'Error. Database search failed';
			$response->errors[]	= 'db_search_failed';
			return $response;
		}

		$sections = [];
		foreach ($tipos as $tipo) {
			$node = ontology_node::get_instance($tipo);
			$data = $node->get_data();

			if (empty($data)) {
				continue;
			}

			// Defensive re-check: the DB result is already model-filtered, but the
			// in-memory ontology cache is the authoritative source. This guard catches
			// any race or stale-index edge case where the DB returns a non-section tipo.
			$model = $data->model ?? null;
			if ($model !== 'section') {
				continue;
			}

			// Skip nodes that have no term at all — they cannot be represented in
			// the glossary and would produce useless entries for LLM consumers.
			$term = $data->term ?? null;
			if (empty($term)) {
				continue;
			}

			$entry = new stdClass();
				$entry->section_tipo	= $tipo;
				$entry->term			= $term;
				$entry->tld				= $data->tld ?? null;

			$sections[] = $entry;
		}

		$response->result	= $sections;
		$response->msg		= 'OK. glossary_sections request done successfully';

		return $response;
	}//end glossary_sections



	/**
	 * GLOSSARY_SECTION
	 * Returns a section's full component tree with portal metadata.
	 *
	 * @param string|null $section_tipo Section tipo to resolve
	 * @return object Response with section descriptor
	 */
	private static function glossary_section(?string $section_tipo) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. glossary_section request failed';
			$response->errors	= [];

		if (empty($section_tipo) || !is_string($section_tipo)) {
			$response->msg		= 'Error. Missing source.section_tipo parameter';
			$response->errors[]	= 'missing_section_tipo';
			return $response;
		}

		$section_descriptor = self::build_glossary_section_descriptor($section_tipo);
		if ($section_descriptor === null) {
			$response->msg		= 'Error. Section not found: ' . $section_tipo;
			$response->errors[]	= 'section_not_found';
			return $response;
		}

		$response->result	= $section_descriptor;
		$response->msg		= 'OK. glossary_section request done successfully';

		return $response;
	}//end glossary_section



	/**
	 * BUILD_GLOSSARY_SECTION_DESCRIPTOR
	 * Builds a section descriptor with portal-aware component descriptors.
	 *
	 * Unlike build_section_descriptor() which uses basic node descriptors,
	 * this variant calls build_component_descriptor() for each child so that
	 * portal components carry their target_section_tipo / target_section_term
	 * metadata — essential for LLM consumers navigating cross-section links.
	 *
	 * @param string $section_tipo Section tipo
	 * @return object|null Section descriptor with 'components' array, or null if not found
	 */
	private static function build_glossary_section_descriptor(string $section_tipo) : ?object {

		$ontology_node	= ontology_node::get_instance($section_tipo);
		$data			= $ontology_node->get_data();

		if (empty($data)) {
			return null;
		}

		$descriptor = new stdClass();
			$descriptor->section_tipo	= $section_tipo;
			$descriptor->term			= $data->term ?? null;
			$descriptor->tld			= $data->tld ?? null;

		// Collect all component tipos recursively, resolving virtual sections,
		// using prefix match ('component_') to include all component subtypes.
		// Positional args: from_cache=true, resolve_virtual=true, recursive=true, search_exact=false.
		$component_tipos = section::get_ar_children_tipo_by_model_name_in_section(
			$section_tipo,
			['component_'],
			true,
			true,
			true,
			false
		);

		$components = [];
		foreach ($component_tipos as $component_tipo) {
			// Use build_component_descriptor (not build_node_descriptor) so that
			// portal-type components include their cross-section target metadata.
			$component_descriptor = self::build_component_descriptor($component_tipo);
			if ($component_descriptor !== null) {
				$components[] = $component_descriptor;
			}
		}

		$descriptor->components = $components;

		return $descriptor;
	}//end build_glossary_section_descriptor



	/**
	 * GLOSSARY_PATH
	 * Resolves a relational path and returns annotated metadata for each hop.
	 *
	 * @param array|null $path Array of tipo strings
	 * @return object Response with resolved path
	 */
	private static function glossary_path(?array $path) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. glossary_path request failed';
			$response->errors	= [];

		if (empty($path) || !is_array($path) || count($path) < 2) {
			$response->msg		= 'Error. Path must be an array with at least 2 tipos';
			$response->errors[]	= 'invalid_path';
			return $response;
		}

		$resolved = self::resolve_path_hops($path);
		if ($resolved === null) {
			$response->msg		= 'Error. Failed to resolve path';
			$response->errors[]	= 'path_resolution_failed';
			return $response;
		}

		$response->result	= $resolved;
		$response->msg		= 'OK. glossary_path request done successfully';

		return $response;
	}//end glossary_path



	/**
	 * RESOLVE_PATH_HOPS
	 * Walks a path array and annotates each hop with ontology metadata.
	 *
	 * For each tipo in the path, retrieves its node data and classifies it as a
	 * section, portal (component_portal / component_dataframe / component_filter),
	 * or plain component. For portal hops, validates that the following hop in
	 * the path is a valid traversal target:
	 *
	 *   - If the next hop is directly one of the portal's target sections → valid.
	 *   - If the next hop is a non-section node whose parent section is a target → valid.
	 *   - If the next hop is a section node not in the target list → valid
	 *     (the path may skip intermediates; validation only rejects if the parent
	 *     section does not match any portal target).
	 *
	 * For the leaf node (last hop), adds column_type via get_component_column_type()
	 * so callers know which matrix-table column type holds its data.
	 *
	 * Returns null on any validation failure or unknown tipo; callers should treat
	 * null as an invalid/unsupported path.
	 *
	 * @param array $path Array of tipo strings (minimum 2 elements)
	 * @return object|null Resolved path object or null on failure
	 *   result->path       object[]  — annotated hop objects
	 *   result->hop_count  int       — total number of hops
	 *   result->leaf_tipo  string    — tipo of the final hop
	 *   result->leaf_model string    — model of the final hop
	 *   result->leaf_column_type string|null — column type of the final component hop
	 */
	private static function resolve_path_hops(array $path) : ?object {

		$hops = [];

		foreach ($path as $index => $tipo) {
			if (!ontology_utils::check_tipo_is_valid($tipo)) {
				return null;
			}

			$node		= ontology_node::get_instance($tipo);
			$data		= $node->get_data();

			if (empty($data)) {
				return null;
			}

			$model = $data->model ?? '';

			$hop = new stdClass();
				$hop->tipo		= $tipo;
				$hop->model		= $model;
				$hop->term		= $data->term ?? null;

			// Determine if this hop is a cross-section portal.
			// All three model families use request_config.sqo.section_tipo to
			// declare their target section(s).
			$is_portal = str_starts_with($model, 'component_portal')
				|| str_starts_with($model, 'component_dataframe')
				|| str_starts_with($model, 'component_filter');

			if ($is_portal) {
				$hop->is_portal = true;
				$ar_target = self::extract_portal_targets($tipo);
				$hop->target_section_tipo = $ar_target['tipos'];

				// Validate: next hop should be one of the target sections
				$next_index = $index + 1;
				if ($next_index < count($path)) {
					$next_tipo = $path[$next_index];
					if (!in_array($next_tipo, $ar_target['tipos'])) {
						// Not a direct target — may still be valid if next is a component
						// within the target section. Walk up one level via get_parent()
						// and resolve virtual sections before checking membership.
						$next_node = ontology_node::get_instance($next_tipo);
						$next_model = $next_node->get_model();
						if ($next_model !== 'section') {
							// Check if next component's parent section is a target
							$next_parent = $next_node->get_parent();
							$next_parent_real = section::get_section_real_tipo_static($next_parent);
							if (!in_array($next_parent_real, $ar_target['tipos'])) {
								return null;
							}
						}
					}
				}
			} else {
				$hop->is_portal = false;

				// Mark section hops explicitly so callers can identify scope changes.
				// section_tipo is redundant with $hop->tipo but aids readability in
				// the returned hop object.
				if ($model === 'section') {
					$hop->section_tipo = $tipo;
				}
			}

			// For the leaf (last element), add column type info.
			// This maps the component model to the matrix-table column it writes to,
			// which clients need to construct typed SQO filters.
			$next_index = $index + 1;
			if ($next_index >= count($path) && str_starts_with($model, 'component_')) {
				$hop->column_type = self::get_component_column_type($model);
			}

			$hops[] = $hop;
		}

		$result = new stdClass();
			$result->path		= $hops;
			$result->hop_count	= count($hops);

		// Add leaf info
		$leaf = end($hops);
		if ($leaf !== false) {
			$result->leaf_tipo		= $leaf->tipo;
			$result->leaf_model		= $leaf->model;
			$result->leaf_column_type	= $leaf->column_type ?? null;
		}

		return $result;
	}//end resolve_path_hops



	/**
	 * GET_COMPONENT_COLUMN_TYPE
	 * Maps a component model name to the matrix-table column type that holds its data.
	 *
	 * Column types correspond to the physical column in the section matrix table
	 * (matrix_<tld>) where a component stores its JSON dato:
	 *
	 *   string   — text/string column (component_input_text, component_text_area,
	 *              component_email, component_password)
	 *   relation — relation/link column; points to locator arrays in other sections
	 *              (component_portal, component_select, component_dataframe, etc.)
	 *   date     — date column (component_date)
	 *   geo      — geolocation column (component_geolocation)
	 *   number   — numeric column (component_number)
	 *   media    — media file column (component_av, component_image, component_3d,
	 *              component_pdf, component_svg)
	 *   iri      — IRI/URI column (component_iri)
	 *   section_id — section identifier pseudo-column (component_section_id)
	 *   misc     — any other component model not covered by the above categories
	 *
	 * Match arms use str_starts_with() prefix matching, so all subtypes of a family
	 * (e.g. 'component_filter_master') are covered by their parent prefix arm
	 * ('component_filter'). The 'component_filter_master' arm is listed explicitly as
	 * a documentation aid but is unreachable because 'component_filter' matches first.
	 *
	 * @param string $model Component model name (e.g. 'component_input_text')
	 * @return string Column type identifier — 'string' | 'relation' | 'date' | 'geo' |
	 *                'number' | 'media' | 'iri' | 'section_id' | 'misc'
	 */
	private static function get_component_column_type(string $model) : string {

		return match (true) {
			str_starts_with($model, 'component_input_text'),
			str_starts_with($model, 'component_text_area'),
			str_starts_with($model, 'component_email'),
			str_starts_with($model, 'component_password') => 'string',

			str_starts_with($model, 'component_portal'),
			str_starts_with($model, 'component_select'),
			str_starts_with($model, 'component_select_lang'),
			str_starts_with($model, 'component_radio_button'),
			str_starts_with($model, 'component_check_box'),
			str_starts_with($model, 'component_autocomplete_hi'),
			str_starts_with($model, 'component_dataframe'),
			str_starts_with($model, 'component_publication'),
			str_starts_with($model, 'component_external'),
			str_starts_with($model, 'component_filter'),
			str_starts_with($model, 'component_filter_master'),
			str_starts_with($model, 'component_relation_children'),
			str_starts_with($model, 'component_relation_index'),
			str_starts_with($model, 'component_relation_model'),
			str_starts_with($model, 'component_relation_parent'),
			str_starts_with($model, 'component_relation_related') => 'relation',

			str_starts_with($model, 'component_date') => 'date',

			str_starts_with($model, 'component_geolocation') => 'geo',

			str_starts_with($model, 'component_number') => 'number',

			str_starts_with($model, 'component_av'),
			str_starts_with($model, 'component_image'),
			str_starts_with($model, 'component_3d'),
			str_starts_with($model, 'component_pdf'),
			str_starts_with($model, 'component_svg') => 'media',

			str_starts_with($model, 'component_iri') => 'iri',

			str_starts_with($model, 'component_section_id') => 'section_id',

			default => 'misc'
		};
	}//end get_component_column_type



}//end dd_ontology_api