<?php declare(strict_types=1);
/**
 * DD_ONTOLOGY_API
 * API endpoints for ontology resolution and introspection.
 *
 * Provides MCP-friendly access to the Dédalo ontology, allowing resolution
 * of human-readable text (e.g. "Oral History") to ontology nodes and their
 * full structural context (sections with components).
 *
 * Actions:
 * - resolve_term    : Search ontology nodes by text (exact JSONB or fuzzy similarity).
 * - resolve_section : Resolve text to section(s) with full component trees.
 * - get_node        : Retrieve full ontology node data by tipo.
 * - search          : Structured search of dd_ontology by column values.
 *
 * Fuzzy search uses a two-phase strategy:
 *   Phase 1 — JSONPath pre-filter: term @? for fast GIN narrowing
 *   Phase 2 — Trigram similarity: f_unaccent(jsonb_values_as_text(term)) % f_unaccent(text)
 * Both phases use indexes defined in db_pg_definitions.php.
 *
 * @package Dedalo
 * @subpackage API
 */
final class dd_ontology_api {



	/**
	 * SEC-024: explicit allowlist of methods callable as remote API actions.
	 */
	public const API_ACTIONS = [
		'resolve_term',
		'resolve_section',
		'get_node',
		'search'
	];



	/**
	 * RESOLVE_TERM
	 * Searches ontology nodes by text matching their `term` column.
	 *
	 * Supports two search modes:
	 * - 'exact' (default): Uses PostgreSQL JSONB containment (`@>`) to match
	 *   the term column. Requires the text to match exactly for a given language key.
	 *   The `lang` parameter determines which language key to search against;
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
	 * 		"is_main": false 			// opttional, remove or find the main terms
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
		$is_main	= $source->is_main ?? false;
		$limit		= $source->limit ?? 50;

		if (empty($text) || !is_string($text)) {
			$response->msg		= 'Error. Missing or invalid source.text parameter';
			$response->errors[]	= 'missing_text';
			return $response;
		}

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
		$mode		= $source->mode ?? 'fuzzy';
		$is_main	= false;
		$limit		= $source->limit ?? 20;

		if (empty($text) || !is_string($text)) {
			$response->msg		= 'Error. Missing or invalid source.text parameter';
			$response->errors[]	= 'missing_text';
			return $response;
		}

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

			$section_model = ontology_node::get_model_by_tipo($section_tipo, true);
			if ($section_model !== 'section') {
				continue;
			}

			dump($section_tipo, ' section_tipo------------>>');

			$section_real_tipo = section::get_section_real_tipo_static($section_tipo);
			if (in_array($section_real_tipo, $resolved_tipos)) {
				continue;
			}
			$resolved_tipos[] = $section_real_tipo;

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
	 * For the given section tipo, resolves all component children and
	 * builds a descriptor object containing:
	 * - Section metadata (tipo, model, term, tld, properties)
	 * - Array of component descriptors
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
	 * - target_section_tipo: array of target section tipos
	 * - target_section_term: array of {tipo, term} for each target
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
	 * ontology properties (source.request_config.sqo.section_tipo).
	 *
	 * @param string $tipo Portal component tipo
	 * @return array ['tipos' => string[], 'terms' => object[]]
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

		$request_config = $source->request_config ?? [];
		if (!is_array($request_config)) {
			return ['tipos' => $tipos, 'terms' => $terms];
		}

		foreach ($request_config as $config_item) {
			$sqo = $config_item->sqo ?? null;
			if (empty($sqo)) {
				continue;
			}

			$ar_section_tipo = $config_item->sqo->section_tipo ?? [];
			if (!is_array($ar_section_tipo)) {
				$ar_section_tipo = [$ar_section_tipo];
			}

			foreach ($ar_section_tipo as $target_entry) {
				$target_tipo = null;

				// V6 format: {value: ["rsc197"], source: "section"}
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
	 * @return object Response with sections array
	 */
	private static function glossary_sections() : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. glossary_sections request failed';
			$response->errors	= [];

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

			$model = $data->model ?? null;
			if ($model !== 'section') {
				continue;
			}

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
	 * @param string $section_tipo Section tipo
	 * @return object|null Section descriptor with components
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






}//end dd_ontology_api