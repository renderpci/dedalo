<?php declare(strict_types=1);
require_once(DEDALO_DIFFUSION_PATH . '/class.diffusion_activity_logger.php');
/**
* CLASS DD_DIFFUSION_API
* PHP gateway for the Dédalo v7 diffusion system — the layer that publishes
* Dédalo work-data to external targets (SQL/MariaDB, RDF, XML, Socrata).
*
* Responsibilities:
* - Exposes a fixed, allowlisted set of API actions (API_ACTIONS) invoked by
*   Bun (the diffusion engine) or the tool_diffusion UI via the standard
*   core/api/v1/json endpoint.
* - Executes an SQO-based record search, walks the diffusion ontology (flat
*   virtual tree via diffusion_utils), resolves multi-level cross-section
*   chains through diffusion_chain_processor, and builds a serialisable
*   response containing 'langs', 'main', and 'datum[]' groups consumed by
*   the Bun engine.
* - Delegates file-based formats (RDF, XML) to specialised per-record
*   handlers (diffusion_rdf, diffusion_xml) and SQL/Socrata data to the
*   chain-processor path.
* - Resolves and forwards media-index rebuild requests to Bun; PHP owns
*   the ontology walk, Bun owns MariaDB (see MariaDB-is-Bun's-responsibility
*   memory note).
* - Orchestrates opportunistic retry of pending deletions (dd1758
*   unpublish_pending rows) on the first chunk of every publish run.
*
* Architecture notes:
* - All public static methods are pure request-handlers: they receive an
*   $rqo (Request Query Object) and return a stdClass response.
* - Static class-level accumulators ($datum, $datum_unresolved,
*   $publishable_overrides, $sqo_filter_by_locators) hold per-request state
*   and are reset at the top of every diffuse() call.
* - Cross-section relations not matched by the SQO filter still get their
*   field values resolved (for reference data), but are excluded from
*   top-level $datum entries.
* - Multi-level resolution is breadth-first: primary records are processed
*   first, then linked sections are enqueued in $datum_unresolved and
*   drained in a while loop.
*
* @package Dédalo
* @subpackage Core
*/
class dd_diffusion_api {



	/**
	* CLASS VARS
	*/
		/**
		 * SEC-024: explicit allowlist of methods callable as remote API actions.
		 * Only names in this list may be dispatched from the public API endpoint.
		 * Adding a method here without reviewing its security implications is dangerous.
		 * @var array<string> API_ACTIONS
		 */
		public const API_ACTIONS = [
			'diffuse',
			'get_diffusion_info',
			'validate',
			'get_ontology_map',
			'retry_pending_deletions',
			'rebuild_media_index',
			'get_engine_advisory'
		];

		/**
		 * Accumulated diffusion_datum objects built during the current diffuse() request.
		 * Each entry covers one section_tipo / diffusion_tipo group and holds the
		 * context (column definitions) and data (per-record field values) consumed by
		 * the Bun engine. Reset to [] at the start of every diffuse() call.
		 * @var array $datum
		 */
		public static array $datum = [];

		/**
		 * Breadth-first queue of locator batches waiting to be resolved at deeper levels.
		 * Keys use the format "{level}:{diffusion_tipo}" so the draining loop can
		 * reconstruct both the remaining depth budget and which diffusion node to use.
		 * Populated inside diffusion_chain_processor when it encounters cross-section
		 * references; drained by the while loop in diffuse(). Reset to [] at the start
		 * of every diffuse() call.
		 * @var array $datum_unresolved
		 */
		public static array $datum_unresolved = [];

		/**
		 * Per-locator publication-state overrides, keyed by "{section_tipo}_{section_id}".
		 * When a chain processor determines that a linked record should be treated as
		 * publishable/unpublishable regardless of its own publication component, it
		 * writes an entry here so that process_datum picks up the inherited state.
		 * Reset to [] at the start of every diffuse() call.
		 * @var array $publishable_overrides
		 */
		public static array $publishable_overrides = [];

		/**
		 * SQO filter_by_locators copied from the request sqo at the start of diffuse(),
		 * or null when no filter was requested. Controls which records get a top-level
		 * datum entry: only records whose section_tipo + section_id appear in this list
		 * are included; cross-section relations at deeper levels still get their fields
		 * resolved for value data but are not promoted to separate datum entries.
		 * @var array|null $sqo_filter_by_locators
		 */
		public static ?array $sqo_filter_by_locators = null;



	/**
	* DIFFUSE
	* Main publish action — resolves diffusion data for every record returned
	* by the SQO and returns a structured response consumed by the Bun engine.
	*
	* Processing pipeline:
	*  1. Unlock the PHP session immediately so concurrent UI requests are not blocked.
	*  2. On the first paginated chunk (sqo->offset == 0 or absent), fire an
	*     opportunistic retry of pending deletions (dd1758 unpublish_pending rows).
	*  3. Reset all request-scoped static caches (diffusion_utils, chain_processor,
	*     activity_logger, and the class-static accumulators).
	*  4. Resolve the diffusion_element parent of diffusion_tipo from the ontology.
	*  5. Execute the SQO search and dispatch to a type-specific path:
	*     - 'rdf' / 'xml': file-based formats handled by diffuse_rdf() / diffuse_xml();
	*       returns immediately with the file-centric response shape.
	*     - 'sql' / 'socrata' (default): builds datum[] via process_datum() and drains
	*       the $datum_unresolved breadth-first queue until all levels are resolved.
	*  6. Returns: { result, msg, langs, main_lang, main, datum[] }.
	*
	* Bun paginates large publish runs into many consecutive diffuse() calls.
	* Per-request caches are reset on each call; the pending-deletion retry runs
	* only when sqo->offset is 0 or absent to avoid redundant retries per chunk.
	*
	* @param object $rqo - {
	*   action: "diffuse",
	*   sqo: { section_tipo, …search clauses…, offset?: int, filter_by_locators?: locator[] },
	*   options: { diffusion_tipo: string, levels?: int, diffusion_element_tipo?: string,
	*              include_empty?: bool, skip_publication_state_check?: bool }
	* }
	* @return object $response - {
	*   result: bool, msg: string, errors: string[],
	*   langs?: array<string,string>, main_lang?: string, main?: array, datum?: diffusion_datum[]
	* }
	*/
	public static function diffuse(object $rqo): object {

		// Release the session lock immediately so the frontend UI isn't blocked
		// while this long-running diffusion chunk processes.
		session_write_close();

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. Request failed';
			$response->errors = [];

		// Validate basic input
		if (empty($rqo->options->diffusion_tipo)) {
			$response->errors[] = 'Missing options->diffusion_tipo';
			return $response;
		}
		if (empty($rqo->sqo)) {
			$response->errors[] = 'Missing sqo (Search Query Object)';
			return $response;
		}

		$diffusion_tipo = $rqo->options->diffusion_tipo;
		$sqo_data      	= $rqo->sqo;
		$options      	= $rqo->options ?? new stdClass();
		// Level budget for cross-section chain resolution
		// Controls how many levels of related sections are recursively resolved
		// beyond the primary records (e.g. level 2 = records + their direct relations).
		$levels       	= $options->levels ?? DEDALO_DIFFUSION_RESOLVE_LEVELS; // 2

		// Opportunistic retry of pending diffusion deletions (hybrid delete
		// propagation): if the engine/targets are up for publishing, they are
		// up for deleting. Fire-and-forget — never fails the publish run.
		// Only on the first chunk (offset 0): Bun paginates large diffusions
		// into many diffuse calls and the retry must run once per run, not per chunk.
		if (empty($rqo->sqo->offset)) {
			try {
				diffusion_delete::retry_pending();
			} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
				debug_log(__METHOD__
					. " Ignored retry_pending exception: " . $e->getMessage()
					, logger::WARNING
				);
			}
		}

		try {
			// 0. Reset caches for this request
			diffusion_chain_processor::reset_cache();
			diffusion_activity_logger::reset_cache();
			diffusion_utils::reset_cache();
			self::$datum = [];
			self::$datum_unresolved = [];
			self::$publishable_overrides = [];

			// Resolve diffusion_element ancestor
			// The caller may supply the element tipo directly (Bun optimization); if
			// not, walk up the ontology tree until reaching the diffusion_element node.
			$diffusion_element_tipo = $options->diffusion_element_tipo
				?? diffusion_utils::get_diffusion_element($diffusion_tipo);

			if ($diffusion_element_tipo === false) {
				throw new Exception("No diffusion element related to $diffusion_tipo");
			}

			// Set the diffusion element scope for cross-section resolution
			if ($diffusion_element_tipo) {
				diffusion_chain_processor::set_diffusion_element_scope($diffusion_element_tipo);
			}

			// Resolve section related to this node
			$main_section_tipo = diffusion_utils::get_related_section_tipo($diffusion_tipo);
			if (!$main_section_tipo) {
				throw new Exception("No section related to $diffusion_tipo");
			}

			// SEC-13: check read permissions for the section being diffused
			$permissions = common::get_permissions($main_section_tipo, $main_section_tipo);
			if ($permissions < 1) {
				$response->errors[] = 'insufficient permissions';
				$response->msg = "Error. Insufficient permissions to diffuse section ($main_section_tipo)";
				return $response;
			}

			// =====================================================
			// BUILD DATUM (one object per section)
			// =====================================================

			// 3. Execute search using SQO
			$search    = search::get_instance(new search_query_object($sqo_data));
			$db_result = $search->search();

			// Dispatch by diffusion type
			// properties->diffusion->type drives which renderer handles the records:
			//   'rdf'     → diffuse_rdf()  — writes per-record .rdf files via diffusion_rdf
			//   'xml'     → diffuse_xml()  — writes per-record .xml files via diffusion_xml
			//   'sql'     → default path below — chain-processor → Bun SQL upsert
			//   'socrata' → same default path with Socrata-specific column shapes
			$diffusion_elem_props = ontology_node::get_instance($diffusion_element_tipo)->get_properties(true);
			$diffusion_type = $diffusion_elem_props->diffusion->type ?? null;

			if ($diffusion_type === 'rdf' || $diffusion_type === 'xml') {
				// RDF/XML early dispatch: file-based formats, langs + main
				// hierarchy rooted at the diffusion element
				$langs = self::build_langs();
				$main  = self::build_main_hierarchy($diffusion_element_tipo);
				$response = $diffusion_type === 'rdf'
					? self::diffuse_rdf($diffusion_element_tipo, $main_section_tipo, $db_result, $langs, $main, $options)
					: self::diffuse_xml($diffusion_element_tipo, $main_section_tipo, $db_result, $langs, $main, $options);
				return $response;
			}

			// =====================================================
			// BUILD LANGS + MAIN (hierarchy UP to diffusion_domain)
			// computed after the type dispatch: the RDF branch builds
			// its own, rooted at the diffusion element
			// =====================================================
			$langs = self::build_langs();
			$main  = self::build_main_hierarchy($diffusion_tipo);

			// Store SQO filter to scope datum entries to only matching records
			self::$sqo_filter_by_locators = $sqo_data->filter_by_locators ?? null;

			self::process_datum($diffusion_tipo, $db_result, $levels, $options);

			while (!empty(self::$datum_unresolved)) {

				// Get the first available key from the queue (format: "level:diffusion_tipo")
				$keys = array_keys(self::$datum_unresolved);
				$key  = reset($keys);

				$locators = self::$datum_unresolved[$key];
				unset(self::$datum_unresolved[$key]);

				// Parse level and tipo
				$parts = explode(':', $key);
				if (count($parts) === 2) {
					$current_level   = (int)$parts[0];
					$diffusion_tipo = $parts[1];
				} else {
					// Fallback for unexpected formats
					$current_level   = $levels;
					$diffusion_tipo = $key;
				}

				// Deduplicate locators for this batch
				$unique_locators = [];
				foreach ($locators as $locator) {
					if(!locator::in_array_locator($locator, $unique_locators, ['section_tipo', 'section_id'])) {
						$unique_locators[] = $locator;
					}
				}

				debug_log(__METHOD__
					. " Processing unresolved datum batch [Level: $current_level] -> " . count($unique_locators) . ' locators' . PHP_EOL
					. ' diffusion_tipo: ' . $diffusion_tipo
					, logger::DEBUG
				);

				self::process_datum($diffusion_tipo, $unique_locators, $current_level, $options);
			}

			// 6. Final response
			$response->result 		= true;
			$response->msg    		= 'OK. Request done';
			$response->langs  		= $langs;
			$response->main_lang  	= DEDALO_DATA_LANG_DEFAULT;
			$response->main   		= $main;
			$response->datum  		= self::$datum;


		} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
			$response->msg = 'Error: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end diffuse


	/**
	* GET_DIFFUSION_INFO
	* Returns the diffusion configuration for a section as seen by the tool_diffusion UI.
	*
	* Walks the flat virtual diffusion tree to find all diffusion nodes that target
	* $section_tipo and returns them together with the configured resolve level budget.
	* The UI uses this data to render the publish panel and badge counts.
	*
	* Requires at minimum read permission (level 1) on the requested section_tipo.
	*
	* @param object $rqo - { options: { section_tipo: string } }
	* @return object $response - {
	*   result: false|{ section_diffusion_nodes: array, resolve_levels: int },
	*   msg: string,
	*   errors: string[]
	* }
	*/
	public static function get_diffusion_info( object $rqo ) : object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		$section_tipo = $rqo->options->section_tipo ?? null;

		if (empty($section_tipo)) {
			$response->errors[] = 'Missing section_tipo.';
			debug_log(__METHOD__
				. " Missing required parameters" . PHP_EOL
				. " section_tipo: " . to_string($section_tipo)
				, logger::ERROR
			);
			return $response;
		}

		// SEC: read permission required to inspect diffusion configuration of a section
		security::assert_section_permission($section_tipo, 1, __METHOD__);

		// Level budget from DEDALO_DIFFUSION_RESOLVE_LEVELS (or config override)
		$resolve_levels = diffusion_utils::get_resolve_levels();

		// All virtual-tree nodes that target this section, enriched with
		// their parent chain up to the diffusion_domain.
		$section_diffusion_nodes = diffusion_utils::get_section_diffusion_nodes($section_tipo);

		$result = (object)[
			'section_diffusion_nodes' => $section_diffusion_nodes,
			'resolve_levels' => $resolve_levels
		];

		$response->result	= $result;
		$response->msg		= empty($response->errors)
			? 'Diffusion info retrieved successfully'
			: 'Diffusion info retrieved with errors';


		return $response;
	}//end get_diffusion_info


	/**
	* VALIDATE
	* Validates the diffusion ontology configuration against the flat virtual
	* diffusion tree. Checks one element (options.diffusion_element_tipo) or
	* every element of the diffusion domain when omitted.
	*
	* Per-element checks (each becomes a 'checks' entry in the response):
	*  - element_resolvable: tipo resolves to diffusion_element or diffusion_element_alias
	*  - diffusion_type: properties->diffusion->type is in ['sql','rdf','xml','socrata']
	*  - target_sections: at least one section is targeted by this element in the tree
	*  - database (sql/socrata only): database name is resolvable from the virtual tree
	*  - service_name (rdf/xml only): properties->diffusion->service_name is non-empty
	*  - ddo_map: each field node's process->ddo_map is an array when defined
	*  - parser_fn: each parser entry carries a non-empty 'class::method' fn string
	*
	* Restricted to global admins because the response discloses the full
	* diffusion ontology structure (database names, service endpoints, etc.).
	*
	* @param object $rqo - {
	*   action: "validate",
	*   options: { diffusion_element_tipo?: string }
	* }
	* @return object $response - {
	*   result: bool, msg: string, errors: string[],
	*   data: array of { element_tipo: string, label: string, type: string|null,
	*                    result: bool, checks: array of { check, result, msg } }
	* }
	*/
	public static function validate(object $rqo): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// SEC: restrict to global admins (full diffusion configuration disclosure)
		if (security::is_global_admin(logged_user_id()) !== true) {
			$response->errors[] = 'insufficient permissions';
			$response->msg = 'Error. Insufficient permissions to validate diffusion configuration.';
			return $response;
		}

		$known_types = ['sql','rdf','xml','socrata'];

		// Scope: a single named element or every element in the diffusion domain map.
		// When validating all elements, get_ar_diffusion_map_elements() walks the
		// ontology diffusion domain to find every diffusion_element node.
		$requested_element_tipo = $rqo->options->diffusion_element_tipo ?? null;
		$ar_element_tipo = [];
		if (!empty($requested_element_tipo)) {
			$ar_element_tipo[] = $requested_element_tipo;
		}else{
			foreach (diffusion_utils::get_ar_diffusion_map_elements() as $map_element) {
				$ar_element_tipo[] = $map_element->element_tipo;
			}
		}

		$data			= [];
		$invalid_count	= 0;

		foreach ($ar_element_tipo as $element_tipo) {

			$checks = [];
			// Inline accumulator: appends a check result object and returns the bool
			// so call-sites can write: $add_check('name', $cond, '…') in a single expression.
			$add_check = function(string $check, bool $result, string $msg) use (&$checks) : bool {
				$checks[] = (object)[
					'check'		=> $check,
					'result'	=> $result,
					'msg'		=> $msg
				];
				return $result;
			};

			// 1. element resolvable
			$resolved	= diffusion_utils::resolve_node_with_alias($element_tipo);
			$is_element	= ($resolved->model==='diffusion_element' || $resolved->model==='diffusion_element_alias');
			$add_check('element_resolvable', $is_element, $is_element
				? "Element '$element_tipo' resolved (model: {$resolved->model})"
				: "Tipo '$element_tipo' is not a diffusion_element (model: ".to_string($resolved->model).")"
			);

			// 2. diffusion type
			$type = $resolved->properties->diffusion->type ?? null;
			$add_check('diffusion_type', in_array($type, $known_types, true), in_array($type, $known_types, true)
				? "Diffusion type: '$type'"
				: "Missing or unknown properties->diffusion->type: ".to_string($type)." (expected one of: ".implode(', ', $known_types).")"
			);

			// 3. targeted sections
			$ar_sections = $is_element
				? diffusion_utils::get_diffusion_sections_from_diffusion_element($element_tipo)
				: [];
			$add_check('target_sections', !empty($ar_sections), !empty($ar_sections)
				? count($ar_sections) . ' section(s) targeted: ' . implode(', ', $ar_sections)
				: 'No sections targeted by this element (check table/owl:Class section relations)'
			);

			// 4. type-specific checks
			if ($type==='sql' || $type==='socrata') {
				$database_name = diffusion_utils::get_database_name_for_element($element_tipo);
				$add_check('database', !empty($database_name), !empty($database_name)
					? "Database: '$database_name'"
					: 'Unable to resolve database name (define a database or database_alias child)'
				);
			}
			if ($type==='rdf' || $type==='xml') {
				$service_name = $resolved->properties->diffusion->service_name ?? null;
				$add_check('service_name', !empty($service_name), !empty($service_name)
					? "Service name: '$service_name'"
					: "Missing properties->diffusion->service_name (required for ".strtoupper($type)." file paths)"
				);
			}

			// 5. field nodes: ddo_map shape and parser fn strings
			foreach ($ar_sections as $section_tipo) {
				$section_node = diffusion_utils::get_section_node_for_element($element_tipo, $section_tipo);
				foreach ($section_node->children ?? [] as $child) {

					$child_properties = ontology_node::get_instance($child->tipo)->get_properties();
					if (empty($child_properties)) {
						continue;
					}

					// ddo_map must be an array of objects when defined
					if (isset($child_properties->process->ddo_map) && !is_array($child_properties->process->ddo_map)) {
						$add_check('ddo_map', false, "Field '{$child->tipo}' ({$child->label}): process->ddo_map is not an array");
					}

					// parser entries must carry a 'class::method' fn
					$parser = $child_properties->process->parser ?? null;
					if ($parser!==null) {
						$ar_parser = is_array($parser) ? $parser : [$parser];
						foreach ($ar_parser as $parser_item) {
							$fn = is_object($parser_item) ? ($parser_item->fn ?? null) : null;
							if (empty($fn) || !is_string($fn) || !str_contains($fn, '::')) {
								$add_check('parser_fn', false, "Field '{$child->tipo}' ({$child->label}): invalid parser fn ".to_string($fn)." (expected 'class::method')");
							}
						}
					}
				}
			}

			// element result
			$element_result = true;
			foreach ($checks as $check) {
				if ($check->result===false) {
					$element_result = false;
					break;
				}
			}
			if (!$element_result) {
				$invalid_count++;
			}

			$data[] = (object)[
				'element_tipo'	=> $element_tipo,
				'label'			=> $resolved->label,
				'type'			=> $type,
				'result'		=> $element_result,
				'checks'		=> $checks
			];
		}//end foreach ($ar_element_tipo as $element_tipo)

		$response->result	= true;
		$response->msg		= $invalid_count===0
			? 'OK. ' . count($data) . ' element(s) validated without issues'
			: 'Warning. ' . $invalid_count . ' of ' . count($data) . ' element(s) have configuration issues';
		$response->data		= $data;


		return $response;
	}//end validate


	/**
	* GET_ONTOLOGY_MAP
	* Returns the raw process properties (ddo_map, parser, output_format, …) for a
	* given diffusion ontology node. Used by the tool_diffusion UI to inspect the
	* field-mapping configuration without leaving the publish interface.
	*
	* Restricted to global admins; the process properties may reveal internal
	* database column names and SQL/RDF mapping details.
	*
	* @param object $rqo - { options: { diffusion_tipo: string } }
	* @return object $response - {
	*   result: bool, msg: string, errors: string[],
	*   data: object  (the properties->process subtree, or empty stdClass)
	* }
	*/
	public static function get_ontology_map(object $rqo): object {
		$response = new stdClass();
		$response->result	= false;
		$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
		$response->errors	= [];

		// SEC-14: Restrict ontology map to global admins
		if (security::is_global_admin(logged_user_id()) !== true) {
			$response->errors[] = 'insufficient permissions';
			$response->msg = 'Error. Insufficient permissions to access ontology map.';
			return $response;
		}

		$diffusion_tipo = $rqo->options->diffusion_tipo ?? null;
		if (!$diffusion_tipo) {
			$response->errors[] = 'Missing diffusion_tipo';
			$response->msg = 'Error. Missing diffusion_tipo';
			return $response;
		}

		$ontology_node = ontology_node::get_instance($diffusion_tipo);
		$properties = $ontology_node->get_properties();

		$response->result	= true;
		$response->msg		= 'OK. Ontology map retrieved';
		$response->data		= $properties->process ?? new stdClass();

		return $response;
	}//end get_ontology_map


	/**
	* RETRY_PENDING_DELETIONS
	* Retries delete propagation for records whose deletion could not reach
	* one or more diffusion targets (dd1758 rows with action=unpublish_pending).
	*
	* With options.count_only=true only the pending count is returned — the
	* tool_diffusion UI uses this mode to populate the badge without triggering
	* an actual retry on every page load.
	*
	* When count_only is false (default), delegates to diffusion_delete::retry_pending()
	* up to $limit records. The response carries total/retried/remaining counters so
	* the UI can show progress and re-trigger until remaining == 0.
	*
	* Restricted to global admins because the operation writes across all SQL
	* publication targets.
	*
	* @param object $rqo - {
	*   action: "retry_pending_deletions",
	*   options: { count_only?: bool [= false], limit?: int [= 100] }
	* }
	* @return object $response - {
	*   result: false | { pending: int } | { total: int, retried: int, remaining: int },
	*   msg: string, errors: string[]
	* }
	*/
	public static function retry_pending_deletions(object $rqo): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// SEC: restrict to global admins (cross-section operation over diffusion targets)
		if (security::is_global_admin(logged_user_id()) !== true) {
			$response->errors[] = 'insufficient permissions';
			$response->msg = 'Error. Insufficient permissions to retry pending deletions.';
			return $response;
		}

		$count_only	= $rqo->options->count_only ?? false;
		$limit		= (int)($rqo->options->limit ?? 100);

		try {
			if ($count_only===true) {
				$pending_count = diffusion_delete::count_pending();
				$response->result	= (object)['pending' => $pending_count];
				$response->msg		= 'OK. '.$pending_count.' pending deletion(s)';
				return $response;
			}

			$retry_response = diffusion_delete::retry_pending($limit);

			$response->result	= (object)[
				'total'		=> $retry_response->total,
				'retried'	=> $retry_response->retried,
				'remaining'	=> $retry_response->remaining
			];
			$response->msg = $retry_response->msg;

		} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
			$response->msg = 'Error: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}


		return $response;
	}//end retry_pending_deletions



	/**
	* REBUILD_MEDIA_INDEX
	* Full resync of the media publication markers (the filesystem allowlist
	* the web server checks to authorize anonymous media access) from the
	* publication databases. Used for initial migration and drift repair.
	*
	* PHP's role: resolve all SQL publication targets from the diffusion ontology
	* (database_name, table_name, section_tipo) via resolve_media_index_targets()
	* and forward the target list to the Bun engine action 'rebuild_media_index'.
	* Bun owns MariaDB and performs the actual SELECT + filesystem marker write.
	*
	* The response propagates the Bun engine response: markers (count written) and
	* targets (count of SQL tables scanned). Errors from Bun are merged into
	* $response->errors so callers see a unified failure surface.
	*
	* Restricted to global admins (cross-section, cross-database operation).
	*
	* @param object $rqo - { action: "rebuild_media_index", options: {} }
	* @return object $response - {
	*   result: bool, msg: string, errors: string[],
	*   markers: int, targets: int
	* }
	*/
	public static function rebuild_media_index(object $rqo): object {

		$response = new stdClass();
			$response->result	= false;
			$response->msg		= 'Error. Request failed ['.__FUNCTION__.']';
			$response->errors	= [];

		// SEC: restrict to global admins (cross-section operation over diffusion targets)
		if (security::is_global_admin(logged_user_id()) !== true) {
			$response->errors[] = 'insufficient permissions';
			$response->msg = 'Error. Insufficient permissions to rebuild the media index.';
			return $response;
		}

		try {
			$targets = self::resolve_media_index_targets();

			$bun_response = diffusion_api_client::call((object)[
				'action'	=> 'rebuild_media_index',
				'targets'	=> $targets
			]);

			$response->result	= $bun_response->result ?? false;
			$response->msg		= $bun_response->msg ?? 'Error. Empty engine response';
			if (!empty($bun_response->errors)) {
				$response->errors = array_merge($response->errors, (array)$bun_response->errors);
			}
			$response->markers	= $bun_response->markers ?? 0;
			$response->targets	= count($targets);

		} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
			$response->msg = 'Error: ' . $e->getMessage();
			$response->errors[] = $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}


		return $response;
	}//end rebuild_media_index


	/**
	* RESOLVE_MEDIA_INDEX_TARGETS
	* Walks every diffusion_element in the ontology map and collects all SQL/Socrata
	* publication targets as {database_name, table_name, section_tipo} objects for
	* the Bun rebuild_media_index engine action.
	*
	* Only sql and socrata elements carry publication tables; rdf/xml elements are
	* skipped (they write files, not database rows). Elements without a resolvable
	* database_name emit a WARNING and are also skipped. Duplicate targets (same
	* database + table + section triple) are deduplicated via a $seen hash-set.
	*
	* Marked public so it can be called directly in tests or CLI migration scripts
	* without requiring a full $rqo object.
	*
	* @return array $targets - array of { database_name: string, table_name: string, section_tipo: string }
	*/
	public static function resolve_media_index_targets(): array {

		$targets	= [];
		$seen		= []; // "db|table|section" dedupe

		foreach (diffusion_utils::get_ar_diffusion_map_elements() as $map_element) {

			$element_tipo	= $map_element->element_tipo;
			$resolved		= diffusion_utils::resolve_node_with_alias($element_tipo);
			$type			= $resolved->properties->diffusion->type ?? null;
			if ($type!=='sql' && $type!=='socrata') {
				continue; // file-based formats have no publication tables
			}

			$database_name = diffusion_utils::get_database_name_for_element($element_tipo);
			if (empty($database_name)) {
				debug_log(__METHOD__
					. " Ignored media index target without database name" . PHP_EOL
					. ' element_tipo: ' . $element_tipo
					, logger::WARNING
				);
				continue;
			}

			$ar_sections = diffusion_utils::get_diffusion_sections_from_diffusion_element($element_tipo);
			foreach ($ar_sections as $section_tipo) {

				// The section node's label holds the SQL table name as defined in
				// the diffusion ontology (e.g. the database_table child node label).
				$section_node = diffusion_utils::get_section_node_for_element($element_tipo, $section_tipo);
				$table_name = $section_node->label ?? null;
				if (empty($table_name)) {
					continue;
				}

				$key = $database_name .'|'. $table_name .'|'. $section_tipo;
				if (isset($seen[$key])) {
					continue;
				}
				$seen[$key] = true;

				$targets[] = (object)[
					'database_name'	=> $database_name,
					'table_name'	=> $table_name,
					'section_tipo'	=> $section_tipo
				];
			}
		}

		return $targets;
	}//end resolve_media_index_targets


	/**
	* BUILD_LANGS
	* Builds the langs map (language_code => human_name) included in every diffuse()
	* response. The Bun engine uses this to know which columns to write per language.
	*
	* Falls back to [DEDALO_DATA_LANG] when DEDALO_DIFFUSION_LANGS is not defined
	* (single-language installations or tests that skip the diffusion config).
	*
	* @return array<string,string> $langs - keyed by BCP-47/DEDALO lang code, value is the display name
	*/
	private static function build_langs(): array {

		$langs = [];

		// DEDALO_DIFFUSION_LANGS is defined in the site config as an array of language
		// codes to publish. Fall back to the single work-data language when absent.
		$ar_langs = defined('DEDALO_DIFFUSION_LANGS')
			? DEDALO_DIFFUSION_LANGS
			: [DEDALO_DATA_LANG];

		foreach ($ar_langs as $lang_code) {
			$lang_name = lang::get_name_from_code($lang_code);
			$langs[$lang_code] = $lang_name;
		}


		return $langs;
	}//end build_langs


	/**
	* BUILD_MAIN_HIERARCHY
	* Builds the 'main' breadcrumb array for the diffuse() response: an ordered list
	* of ontology nodes from the diffusion_domain root down to $diffusion_tipo.
	*
	* The Bun engine uses 'main' to understand which diffusion scope (domain →
	* element → section-group → field-group) a datum[] batch belongs to, and to
	* render the publish hierarchy in the UI.
	*
	* Each item carries: { diffusion_tipo, term, model, parent? }.
	* diffusion_element and diffusion_element_alias nodes additionally expose
	* { properties } so Bun can read the diffusion type and service_name without
	* a separate ontology call.
	*
	* Returns [] and logs a WARNING if $diffusion_tipo is not found in the
	* virtual tree (e.g. the ontology was modified between request start and here).
	*
	* @param string $diffusion_tipo - the leaf node to start from (walks up to root)
	* @return array $hierarchy - ordered top-down from domain root to $diffusion_tipo
	*/
	private static function build_main_hierarchy(string $diffusion_tipo): array {

		$virtual_tree = diffusion_utils::get_virtual_diffusion_tree();

		$target_vnode = null;
		foreach ($virtual_tree as $vnode) {
			// Find the target node in the fully resolved virtual tree
			if ($vnode->tipo === $diffusion_tipo) {
				$target_vnode = $vnode;
				break;
			}
		}

		if (!$target_vnode) {
			debug_log(__METHOD__ . " Could not find diffusion_tipo {$diffusion_tipo} in virtual tree.", logger::WARNING);
			return [];
		}

		$hierarchy = [];

		// The vnode->parents array contains parents from immediate parent at index 0 up to domain at last index.
		// Assemble full path tipos top-down: domain -> ... -> parent -> target
		$path_tipos = [];
		if (!empty($target_vnode->parents)) {
			foreach (array_reverse($target_vnode->parents) as $p) {
				$path_tipos[] = $p->tipo;
			}
		}
		$path_tipos[] = $diffusion_tipo;

		// Now traverse downwards to build the exact main array objects expected by frontend
		$parent_tipo = null;
		foreach ($path_tipos as $tipo) {

			$resolved = diffusion_utils::resolve_node_with_alias($tipo);

			if ($resolved->is_alias) {
				$model_name = $resolved->model;
				$term       = $resolved->label;
				$properties = $resolved->properties;
			} else {
				$node = ontology_node::get_instance($tipo);
				$model_tipo = $node->get_model_tipo();
				$model_name = ontology_node::get_term_by_tipo($model_tipo, DEDALO_STRUCTURE_LANG);
				$term       = $node->get_term(DEDALO_STRUCTURE_LANG);
				$properties = $node->get_properties();
			}

			$item = (object)[
				'diffusion_tipo' => $tipo,
				'term'           => $term,
				'model'          => $model_name
			];

			if ($parent_tipo) {
				$item->parent = $parent_tipo;
			}

			// Add properties for diffusion_element and diffusion_element_alias
			if (($model_name === 'diffusion_element' || $model_name === 'diffusion_element_alias') && !empty($properties)) {
				$item->properties = $properties;
			}

			$hierarchy[] = $item;
			$parent_tipo = $tipo; // Next node's parent is this node
		}

		return $hierarchy;
	}//end build_main_hierarchy


	/**
	* PROCESS_DATUM
	* Core record-processing loop: for every locator in $iterable_data, resolves the
	* diffusion field values defined by $diffusion_tipo and assembles a diffusion_datum
	* that gets appended to the static self::$datum[] accumulator.
	*
	* Processing steps per locator:
	*  1. Skip if already visited this request (diffusion_chain_processor::is_used).
	*  2. Apply SQO filter: only emit top-level datum entries for records that match
	*     $sqo_filter_by_locators; cross-section relations pass through freely.
	*  3. Determine is_publishable via (a) ontology override, (b) $publishable_overrides,
	*     or (c) the publication component value (diffusion_utils::is_publishable).
	*  4. For each child diffusion node, invoke diffusion_chain_processor::resolve_chain
	*     which descends the ddo_map, calls each component's get_diffusion_data(), and
	*     pushes unresolved cross-section locators into self::$datum_unresolved.
	*  5. Group the flat chain results into field_group objects keyed by tipo+lang+id,
	*     each containing an entries[] array of value objects.
	*  6. Set fields = 'delete' (string sentinel) when the record is not publishable,
	*     so Bun knows to remove the row rather than upsert it.
	*
	* Alias handling: when $diffusion_tipo is an alias node (e.g. diffusion_section_alias),
	* the real node is looked up and its children and properties are merged so that alias
	* and canonical nodes behave identically from the caller's perspective.
	*
	* RDF field delegation: field nodes that carry diffusion->type='rdf' are routed through
	* diffusion_rdf::build_rdf_xml() instead of the standard chain, and their XML string
	* is stored as a single entry value. class.diffusion_rdf.php is included lazily.
	*
	* @param string $diffusion_tipo - ontology node being processed (section-level group node)
	* @param iterable $iterable_data - array of locator objects {section_tipo, section_id}
	* @param int $levels - remaining cross-section resolution depth budget
	* @param object $options - the original rqo->options (include_empty, skip_publication_state_check, …)
	* @return diffusion_datum $datum_object - the built datum (also appended to self::$datum if non-empty)
	* @throws Exception when the ontology node cannot be resolved for $diffusion_tipo
	*/
	private static function process_datum(string $diffusion_tipo, $iterable_data, int $levels, object $options): diffusion_datum {

		$source_node = ontology_node::get_instance($diffusion_tipo);
		if (!$source_node) {
			throw new Exception("Ontology node not found for tipo: $diffusion_tipo");
		}

		$parent = $source_node->get_parent();
		$main_section_tipo = diffusion_utils::get_related_section_tipo($diffusion_tipo);

		$properties = $source_node->get_properties();

		$diffusion_node_model = $source_node->get_model();
		$diffusion_name = $source_node->get_term(DEDALO_STRUCTURE_LANG);

		// Identify all section-level diffusion nodes (children of source_tipo)
		$ar_children = ontology_node::get_ar_children($diffusion_tipo);

		// Alias resolution
		// If this node is an alias (e.g. diffusion_section_alias), find the real
		// (non-alias) node it points to via a 'related' ontology relation and merge
		// the real node's children + properties. Alias-specific children come last
		// so they can override default field mappings from the real node.
		if( str_contains( $diffusion_node_model, '_alias') ){

			$search_model = str_replace('_alias','',$diffusion_node_model);
			$related_tipo = ontology_node::get_ar_tipo_by_model_and_relation($diffusion_tipo, $search_model, 'related', true)[0] ?? null;

			if(!empty($related_tipo)){
				$target_node = ontology_node::get_instance($related_tipo);
				$diffusion_node_model = $target_node->get_model();
				if(empty($properties)){
					$properties = $target_node->get_properties();
				}
				if(empty($main_section_tipo)){
					$main_section_tipo = diffusion_utils::get_related_section_tipo($related_tipo);
				}
				$ar_target_children = ontology_node::get_ar_children($related_tipo);
				$ar_children = [...$ar_target_children, ...$ar_children];
			}
		}

		// Build combined ddo_map from all nodes for this section
		$combined_ddo_map = [];
		$context = [];
		foreach ($ar_children as $node_tipo) {
			$ddo_map = diffusion_utils::get_ddo_map($node_tipo, $main_section_tipo);
			$combined_ddo_map[$node_tipo] = $ddo_map;

			// Build context for each node (field definitions)
			$node_context = self::build_datum_context($node_tipo, $ddo_map);
			$context = [...$context, ...$node_context];
		}

		$datum_object = new diffusion_datum();
			$datum_object->set_diffusion_tipo($diffusion_tipo);
			$datum_object->set_section_tipo($main_section_tipo);
			$datum_object->set_term($diffusion_name);
			$datum_object->set_model($diffusion_node_model);
			$datum_object->set_parent($parent);
			$datum_object->set_context($context);

		// Ontology-level is_publishable override
		// When the diffusion node itself carries is_publishable (e.g. always-publish
		// reference tables), skip the per-record publication component check entirely.
		$publishable = $properties->is_publishable ?? null;

		// Pre-detect field nodes delegating to RDF generation (diffusion.type = "rdf")
		// These nodes embed a nested RDF document into a SQL column rather than
		// resolving through the normal chain. Identified once per call to avoid
		// repeated property reads inside the per-record loop.
		$rdf_field_nodes = [];
		foreach ($combined_ddo_map as $node_tipo => $unused_ddo_map) {
			$node_rdf_props = ontology_node::get_instance($node_tipo)->get_properties();
			if (($node_rdf_props->diffusion->type ?? null) === 'rdf') {
				$rdf_field_nodes[$node_tipo] = $node_rdf_props->diffusion->diffusion_element_tipo ?? null;
			}
		}
		if (!empty($rdf_field_nodes)) {
			// Lazy-load: most requests do not use embedded RDF fields.
			include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_rdf.php';
		}

		$data = [];

		// Pre-build the section_tipos restricted by the SQO filter.
		// Only records matching one of these section_tipos must also match section_id.
		// Records with other section_tipos (cross-section relations at configured levels) pass freely.
		$filter_section_tipos = null;
		if (self::$sqo_filter_by_locators !== null) {
			$filter_section_tipos = [];
			foreach (self::$sqo_filter_by_locators as $fl) {
				$filter_section_tipos[$fl->section_tipo][] = (int)$fl->section_id;
			}
		}

		// Process each record and group by section
		foreach ($iterable_data as $locator) {

			// Check if the locator has already been used
			if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
				continue;
			}

			// set the locator as used
			diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

			// SQO filter: restrict datum entries for the main section_tipo to only
			// records in the filter. Cross-section relations (different section_tipo
			// from the filter) pass through freely at the configured levels.
			if ($filter_section_tipos !== null && isset($filter_section_tipos[$locator->section_tipo])) {
				if (!in_array(intval($locator->section_id), $filter_section_tipos[$locator->section_tipo], true)) {
					continue;
				}
			}

			// Publication state resolution: ontology-level constant wins, then any
			// override set by a parent chain processor, then the per-record component value.
			$override = self::$publishable_overrides["{$locator->section_tipo}_{$locator->section_id}"] ?? null;
			$is_publishable = $publishable ?? $override ?? diffusion_utils::is_publishable($locator);

			// Build fields keyed by diffusion_tipo
			$fields = new stdClass();

			foreach ($combined_ddo_map as $node_tipo => $ddo_map) {

				// RDF field delegation: generate RDF/XML and store as plain text value
				if (isset($rdf_field_nodes[$node_tipo])) {
					$rdf_element_tipo = $rdf_field_nodes[$node_tipo];
					if ($rdf_element_tipo) {
						$rdf_xml = diffusion_rdf::build_rdf_xml($locator->section_tipo, (int)$locator->section_id, $rdf_element_tipo);
						if ($rdf_xml !== null) {
							$first_ddo = reset($ddo_map);
							$component_tipo = $first_ddo ? ($first_ddo->tipo ?? null) : null;
							// Group RDF as a single field_group
							$field_group = (object)[
								'tipo'    => $component_tipo,
								'lang'    => null,
								'entries' => [(object)['value' => $rdf_xml]],
								'id'      => null
							];
							$fields->{$node_tipo} = [$field_group];
						}
					}
					continue;
				}

				$processor = new diffusion_chain_processor();

				// Resolve the chain for this ddo_map
				$resolved_results = $processor->resolve_chain((object)[
					'ddo_map'      		=> $ddo_map,
					'parent'       		=> $locator->section_tipo,
					'section_tipo' 		=> $locator->section_tipo,
					'section_id'   		=> $locator->section_id,
					'level'        		=> $levels,
					'is_publishable' 	=> $is_publishable
				]);

				// Get the value directly from get_diffusion_data() result
				$all_values = [];
				foreach ($resolved_results as $ddo_res) {
					$value = $ddo_res->value ?? [];
					if (!empty($value)) {
						// Merge all child values into one array
						$all_values = [...$all_values, ...$value];
					}
				}
				if (!empty($all_values) || ($options->include_empty ?? false) === true) {
					// Group values by shared metadata (tipo, lang, id, section_id, section_tipo)
					$grouped = [];
					foreach ($all_values as $item) {
						$group_key = ($item->tipo ?? '') . '|' . ($item->lang ?? '') . '|' . ($item->id ?? '') . '|' . ($item->section_id ?? '') . '|' . ($item->section_tipo ?? '');
						if (!isset($grouped[$group_key])) {
							$field_group = (object)[
								'tipo'          => $item->tipo ?? null,
								'lang'          => $item->lang ?? null,
								'entries'       => [],
								'id'            => $item->id ?? null
							];
							if (isset($item->section_id)) {
								$field_group->section_id = $item->section_id;
							}
							if (isset($item->section_tipo)) {
								$field_group->section_tipo = $item->section_tipo;
							}
							$grouped[$group_key] = $field_group;
						}
						// Build entry: value + any extra properties beyond the grouping keys
						$entry = (object)['value' => $item->value ?? null];
						$skip_keys = ['tipo','lang','id','value','section_id','section_tipo'];
						foreach (get_object_vars($item) as $k => $v) {
							if (!in_array($k, $skip_keys)) {
								$entry->{$k} = $v;
							}
						}
						$grouped[$group_key]->entries[] = $entry;
					}
					$fields->{$node_tipo} = array_values($grouped);
				}
			}

			// Record output shape
			// fields = 'delete' (string) signals to Bun that this record was
			// unpublished and must be removed from the SQL table (or RDF/XML file),
			// rather than being upserted. See delete propagation memory note.
			$record_output = (object)[
				'section_id' => $locator->section_id,
				'fields'     => (!$is_publishable) ? 'delete' : $fields
			];

			$data[] = $record_output;
		}

		$datum_object->set_data($data);

		// Only add to static container if data is non-empty
		// (filter check in foreach may have skipped all locators)
		if (!empty($data)) {
			self::$datum[] = $datum_object;
		}

		return $datum_object;
	}//end process_datum


	/**
	* BUILD_DATUM_CONTEXT
	* Builds one context entry (column / field definition) for a single diffusion
	* field-group node. The context array is consumed by the Bun engine to set up
	* the target SQL columns (or XML/RDF fields) before inserting record data.
	*
	* Each context item contains:
	*  - term, tipo, model, parent: identify the diffusion node in the ontology
	*  - parser: class::method strings from properties->process->parser (empty stdClass if absent)
	*  - columns: the leaf DDO entries (intermediate parent nodes stripped) — these
	*    map 1:1 to SQL columns or XML elements in the target schema
	*  - output_format (optional): from ontology process->output_format, or
	*    from the component class's $diffusion_output_format map (currently assumes
	*    'sql' as the diffusion type when falling back — see inline TODO comment)
	*  - varchar, length, index (optional): SQL schema hints from ontology properties
	*
	* The 'columns' list is produced by building a hash-set of all tipo values that
	* appear as a 'parent' in the ddo_map, then keeping only the leaf entries (those
	* not referenced as parents). This strips intermediate chain nodes from the
	* context while preserving the full ddo_map for chain resolution.
	*
	* @param string $diffusion_tipo - the field-group ontology node
	* @param array $ddo_map - flat DDO chain for this node (from diffusion_utils::get_ddo_map)
	* @return array $context - array of context objects (typically one element per call)
	*/
	private static function build_datum_context(string $diffusion_tipo, array $ddo_map): array {

		$context = [];

		// Get the diffusion node info
		$diffusion_node_instance = ontology_node::get_instance($diffusion_tipo);
		if (!$diffusion_node_instance) {
			return $context;
		}

		$properties = $diffusion_node_instance->get_properties();

		// tipo and term come from the diffusion node, not from the component
		$term = $diffusion_node_instance->get_term(DEDALO_STRUCTURE_LANG);

		// Model comes from diffusion ontology node
		$field_model = ontology_node::get_model_by_tipo($diffusion_tipo);

		// Leaf-column extraction
		// Build a hash-set of every tipo that is referenced as a 'parent' by some
		// other ddo entry. Non-parent (leaf) entries are the actual target columns.
		// Clone each leaf before stripping internal-only keys so the original ddo_map
		// is not mutated (it is reused in the per-record field resolution loop).
		$parent_set = array_flip(array_filter(array_column((array)$ddo_map, 'parent')));
		$cleaned_lasts_ddo_chain = [];
		foreach ($ddo_map as $ddo) {
			if (isset($parent_set[$ddo->tipo])) continue;
			$clean = clone $ddo;
			unset($clean->typo, $clean->type, $clean->parent, $clean->section_tipo, $clean->diffusion_tipo);
			$cleaned_lasts_ddo_chain[] = $clean;
		}

		$context[] = (object)[
			'term'   		=> $term,
			'tipo'   		=> $diffusion_tipo,
			'model'  		=> $field_model,
			'parent' 		=> $diffusion_node_instance->get_parent(),
			'parser' 		=> $properties->process->parser ?? new stdClass(),
			'columns' 		=> array_values($cleaned_lasts_ddo_chain)
		];

		// output_format resolution (two-stage)
		// Stage 1: explicit value in the ontology node properties->process->output_format.
		$output_format = $properties->process->output_format ?? null;

		// Stage 2: fall back to the component class's $diffusion_output_format static map.
		// (!) Currently hard-codes diffusion_type='sql'. When RDF/XML field embedding
		// is fully integrated this must be derived from the parent diffusion_element.
		if (!$output_format) {
			$diffusion_type = 'sql'; // Future: get from diffusion_element or rqo

			// Find the main component model from the first ddo map item
			$target_model = null;
			if (!empty($ddo_map)) {
				$first_ddo = $ddo_map[0];
				$target_model = $first_ddo->model ?? ontology_node::get_model_by_tipo($first_ddo->tipo);
			}

			if ($target_model && class_exists($target_model) && property_exists($target_model, 'diffusion_output_format')) {
				$output_formats = $target_model::$diffusion_output_format;
				if (isset($output_formats[$diffusion_type])) {
					$output_format = $output_formats[$diffusion_type];
				}
			}
		}

		// Inject the calculated output format into the context
		if ($output_format) {
			$context[0]->output_format = $output_format;
		}


		if(isset($properties->varchar)){
			$context[0]->varchar = $properties->varchar;
		}

		if(isset($properties->length)){
			$context[0]->length = $properties->length;
		}

		if(isset($properties->index)){
			$context[0]->index = $properties->index;
		}

		return $context;
	}//end build_datum_context


	/**
	* DIFFUSE_RDF
	* Handles diffusion for elements with properties->diffusion->type = 'rdf'.
	*
	* For each record, delegates to diffusion_rdf::update_record() which renders
	* the RDF/XML document and saves it to the filesystem under
	* DEDALO_MEDIA_PATH/rdf/{service_name}/{section_id}.rdf. The response contains
	* both the file_url (for the Bun engine to record in the activity log) and the
	* raw RDF/XML string so callers can inspect it without a second file read.
	*
	* Returned diffusion_datum uses output_format='rdf' in its context so Bun
	* routes it through the RDF handler rather than the SQL upsert path.
	*
	* The de-duplication guard (diffusion_chain_processor::is_used) prevents the
	* same record from being processed twice when the SQO returns overlapping sets.
	*
	* @param string $diffusion_element_tipo - the RDF diffusion_element ontology node
	* @param string $section_tipo - the Dédalo section being published
	* @param iterable $db_result - locator objects from the SQO search
	* @param array $langs - the langs map built by build_langs()
	* @param array $main - the hierarchy array built by build_main_hierarchy()
	* @param object $options - the original rqo->options (skip_publication_state_check, …)
	* @return object $response - full diffuse() response shape with datum=[diffusion_datum]
	*/
	private static function diffuse_rdf(string $diffusion_element_tipo, string $section_tipo, $db_result, array $langs, array $main, object $options): object {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. RDF diffusion failed';
			$response->errors = [];

		try {
			include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_rdf.php';

			$diffusion_data = [];
			$raw_xml_parts  = [];
			$datum_data     = [];
			$parent         = ontology_node::get_instance($diffusion_element_tipo)->get_parent();
			$rdf_term       = ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG);
			$properties     = ontology_node::get_instance($diffusion_element_tipo)->get_properties();
			$service_name   = $properties->diffusion->service_name ?? '';
			$sub_path       = '/rdf/' . $service_name . '/';

			foreach ($db_result as $locator) {

				if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
					continue;
				}
				diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

				$rdf_instance = new diffusion_rdf(null);
				$rdf_response = $rdf_instance->update_record((object)[
					'section_tipo'			 => $locator->section_tipo,
					'section_id'			 => $locator->section_id,
					'diffusion_element_tipo' => $diffusion_element_tipo,
					'save_file'				 => true,
					'skip_publication_check'	 => $options->skip_publication_state_check ?? false
				]);

				if (!empty($rdf_response->diffusion_data)) {
					$diffusion_data = array_merge($diffusion_data, $rdf_response->diffusion_data);
				}
				if (!empty($rdf_response->data)) {
					$raw_xml_parts[] = $rdf_response->data;
				}

				$entries = new stdClass();
				$rdf_value = new stdClass();
					$rdf_value->tipo = $diffusion_element_tipo;
					$rdf_value->lang = null;
					$rdf_value->value = $rdf_response->data ?? null;
				if (!empty($rdf_response->diffusion_data[0]->file_url)) {
					$rdf_value->file_url = $rdf_response->diffusion_data[0]->file_url;
				}
				$entries->{$diffusion_element_tipo} = [$rdf_value];

				$datum_data[] = (object)[
					'section_id' => $locator->section_id,
					'entries' => $entries
				];
			}

			// Build RDF datum using canonical diffusion datum semantics
			$datum = new diffusion_datum();
				$datum->set_diffusion_tipo($diffusion_element_tipo);
				$datum->set_section_tipo($section_tipo);
				$datum->set_term($rdf_term);
				$datum->set_model('diffusion_element');
				$datum->set_parent($parent);
				$datum->set_context([
					(object)[
						'term' => $rdf_term,
						'tipo' => $diffusion_element_tipo,
						'model' => 'diffusion_element',
						'parent' => $parent,
						'parser' => new stdClass(),
						'output_format' => 'rdf',
						'columns' => []
					]
				]);
				$datum->set_data($datum_data);

			$response->result        		= true;
			$response->msg           		= 'OK. RDF diffusion done';
			$response->langs         		= $langs;
			$response->main_lang     		= DEDALO_DATA_LANG_DEFAULT;
			$response->main          		= $main;
			$response->DEDALO_MEDIA_PATH 	= DEDALO_MEDIA_PATH;
			$response->DEDALO_MEDIA_URL  	= DEDALO_MEDIA_URL;
			$response->sub_path        		= $sub_path;
			$response->datum         		= [$datum];

		} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
			$response->msg	= 'Error: ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end diffuse_rdf



	/**
	* DIFFUSE_XML
	* Handles diffusion for elements with properties->diffusion->type = 'xml'.
	* Symmetric to diffuse_rdf() (DIFFU-01) but for XML publication.
	*
	* Unlike diffuse_rdf, a single diffusion_xml instance is reused across all records
	* to amortise parser loading (via diffusion_xml::reset_cache() + constructor).
	* Each record's update_record() call renders + saves one deterministic file under
	* DEDALO_MEDIA_PATH/xml/{service_name}/{section_id}.xml. The same file path is
	* used by delete_record_file when the record is unpublished, ensuring consistent
	* delete propagation.
	*
	* The response datum value carries the file_url (not the raw document body)
	* because XML can be large and the Bun engine only needs the file reference to
	* update the activity log and trigger delivery to downstream consumers.
	*
	* Per-record errors from update_record() are collected into $response->errors
	* but do not abort the loop; all records are attempted regardless.
	*
	* @param string $diffusion_element_tipo - the XML diffusion_element ontology node
	* @param string $section_tipo - the Dédalo section being published
	* @param mixed $db_result - iterable of locator objects from the SQO search
	* @param array $langs - the langs map built by build_langs()
	* @param array $main - the hierarchy array built by build_main_hierarchy()
	* @param object $options - the original rqo->options (skip_publication_state_check, …)
	* @return object $response - full diffuse() response shape with datum=[diffusion_datum]
	*/
	private static function diffuse_xml(string $diffusion_element_tipo, string $section_tipo, $db_result, array $langs, array $main, object $options): object {

		$response = new stdClass();
			$response->result = false;
			$response->msg    = 'Error. XML diffusion failed';
			$response->errors = [];

		try {
			include_once DEDALO_DIFFUSION_PATH . '/class.diffusion_xml.php';

			$diffusion_data = [];
			$datum_data     = [];
			$parent         = ontology_node::get_instance($diffusion_element_tipo)->get_parent();
			$xml_term       = ontology_node::get_term_by_tipo($diffusion_element_tipo, DEDALO_STRUCTURE_LANG);
			$properties     = ontology_node::get_instance($diffusion_element_tipo)->get_properties();
			$service_name   = $properties->diffusion->service_name ?? '';
			$sub_path       = '/xml/' . $service_name . '/';

			// build one instance per element (loads parsers once); the per-record
			// diffusion-object structure is shared via diffusion_xml's static cache.
			diffusion_xml::reset_cache();
			$xml_instance = new diffusion_xml((object)[
				'diffusion_element_tipo' => $diffusion_element_tipo
			]);

			foreach ($db_result as $locator) {

				if (diffusion_chain_processor::is_used($locator->section_tipo, intval($locator->section_id))) {
					continue;
				}
				diffusion_chain_processor::mark_used($locator->section_tipo, intval($locator->section_id));

				$xml_response = $xml_instance->update_record((object)[
					'section_tipo'			 => $locator->section_tipo,
					'section_id'			 => $locator->section_id,
					'diffusion_element_tipo' => $diffusion_element_tipo,
					'save_file'				 => true,
					'skip_publication_check' => $options->skip_publication_state_check ?? false
				]);

				if (!empty($xml_response->diffusion_data)) {
					$diffusion_data = array_merge($diffusion_data, $xml_response->diffusion_data);
				}
				if (!empty($xml_response->errors)) {
					$response->errors = array_merge($response->errors, (array)$xml_response->errors);
				}

				// XML update_record saves to file and returns the file_url (not the
				// raw document body), so the datum value carries the file_url.
				$file_url = $xml_response->diffusion_data[0]->file_url ?? null;

				$entries = new stdClass();
				$xml_value = new stdClass();
					$xml_value->tipo  = $diffusion_element_tipo;
					$xml_value->lang  = null;
					$xml_value->value = $file_url;
				if (!empty($file_url)) {
					$xml_value->file_url = $file_url;
				}
				$entries->{$diffusion_element_tipo} = [$xml_value];

				$datum_data[] = (object)[
					'section_id' => $locator->section_id,
					'entries' => $entries
				];
			}

			// Build XML datum using canonical diffusion datum semantics
			$datum = new diffusion_datum();
				$datum->set_diffusion_tipo($diffusion_element_tipo);
				$datum->set_section_tipo($section_tipo);
				$datum->set_term($xml_term);
				$datum->set_model('diffusion_element');
				$datum->set_parent($parent);
				$datum->set_context([
					(object)[
						'term' => $xml_term,
						'tipo' => $diffusion_element_tipo,
						'model' => 'diffusion_element',
						'parent' => $parent,
						'parser' => new stdClass(),
						'output_format' => 'xml',
						'columns' => []
					]
				]);
				$datum->set_data($datum_data);

			$response->result        		= true;
			$response->msg           		= 'OK. XML diffusion done';
			$response->langs         		= $langs;
			$response->main_lang     		= DEDALO_DATA_LANG_DEFAULT;
			$response->main          		= $main;
			$response->DEDALO_MEDIA_PATH 	= DEDALO_MEDIA_PATH;
			$response->DEDALO_MEDIA_URL  	= DEDALO_MEDIA_URL;
			$response->sub_path        		= $sub_path;
			$response->datum         		= [$datum];

		} catch (\Throwable $e) { // DIFFU-03: catch Throwable — engine faults are Error/TypeError, not Exception
			$response->msg	= 'Error: ' . $e->getMessage();
			$response->errors[]	= $e->getMessage();
			debug_log(__METHOD__ . " Exception: " . $e->getMessage(), logger::ERROR);
		}

		return $response;
	}//end diffuse_xml

	/** Tunables (overridable in tests to avoid real sleeps). */
	public static int $recover_poll_attempts   = 5;
	public static int $recover_poll_interval_us = 500000; // 0.5s

	/**
	* GET_ENGINE_ADVISORY
	* Probe the diffusion engine socket-first; for global-admins auto-recover an
	* unreachable engine via the configured service command; return a role-tailored
	* advisory the tool renders instead of a raw HTTP error.
	* @param object $rqo { options?: { auto_recover?: bool } }
	* @return object advisory (see build_engine_advisory)
	*/
	public static function get_engine_advisory(object $rqo) : object {

		// Lazy-load: diffusion_server_control lives outside the diffusion/ tree so
		// the SPL autoloader cannot find it; include explicitly (same pattern as
		// diffuse_rdf / diffuse_xml in this file).
		require_once DEDALO_CORE_PATH . '/area_maintenance/widgets/diffusion_server_control/class.diffusion_server_control.php';

		$options      = $rqo->options ?? new stdClass();
		$auto_recover = (($options->auto_recover ?? true) !== false);
		$is_admin     = security::is_global_admin(logged_user_id())===true;
		$service_cmd_configured = defined('DEDALO_DIFFUSION_SERVICE_CMD') && DEDALO_DIFFUSION_SERVICE_CMD!=='';

		$probe     = self::probe_engine();
		$recovered = false;

		if ($probe->state==='unreachable' && $is_admin && $auto_recover && $service_cmd_configured) {
			$start = diffusion_server_control::start_server(new stdClass());
			if (!empty($start->result)) {
				for ($i=0; $i < self::$recover_poll_attempts; $i++) {
					usleep(self::$recover_poll_interval_us);
					$probe = self::probe_engine();
					if ($probe->state!=='unreachable') break;
				}
				$recovered = ($probe->state==='ok');
			}
		}

		return self::build_engine_advisory($probe, $is_admin, $recovered, $service_cmd_configured);
	}//end get_engine_advisory

	/**
	* PROBE_ENGINE
	* One socket-first health call. Returns { state, checks, msg }.
	* ok = engine answered result:true; unhealthy = answered result:false with checks;
	* unreachable = no usable answer (connection failure / missing endpoint).
	*/
	public static function probe_engine() : object {

		$res = diffusion_api_client::call((object)['action'=>'get_diffusion_status'], 5);

		$out = new stdClass();
		$out->checks = null;
		$out->msg    = $res->msg ?? '';

		if (!empty($res->result)) {
			$out->state  = 'ok';
			$out->checks = $res->data->checks ?? null;
			return $out;
		}
		if (isset($res->data) && isset($res->data->checks)) {
			$out->state  = 'unhealthy';
			$out->checks = $res->data->checks;
			return $out;
		}
		$out->state = 'unreachable';
		return $out;
	}//end probe_engine

	/**
	* FIRST_FAILING_CHECK
	* @return object|null { name, msg } of the first check whose result!==true.
	*/
	public static function first_failing_check($checks) : ?object {
		if (!is_object($checks)) return null;
		foreach ($checks as $name => $check) {
			if (is_object($check) && ($check->result ?? true)!==true) {
				return (object)['name'=>(string)$name, 'msg'=>(string)($check->msg ?? '')];
			}
		}
		return null;
	}//end first_failing_check

	/**
	* READ_ENGINE_LOG_TAIL
	* Last ~20 lines of the engine log (admin diagnostics). Bounded read; '' when absent.
	*/
	public static function read_engine_log_tail() : string {
		$log = getenv('DEDALO_DIFFUSION_LOG_FILE') ?: '/tmp/dedalo-diffusion.log';
		if (!is_file($log) || !is_readable($log)) return '';
		$lines = @file($log, FILE_IGNORE_NEW_LINES);
		if ($lines===false) return '';
		return implode("\n", array_slice($lines, -20));
	}//end read_engine_log_tail

	/**
	* BUILD_ENGINE_ADVISORY
	* Pure: maps probe state + role + service-cmd availability to the advisory object.
	*/
	public static function build_engine_advisory(object $probe, bool $is_admin, bool $recovered, bool $service_cmd_configured) : object {

		$advisory = new stdClass();
		$advisory->result   = true;
		$advisory->state    = $probe->state;
		$advisory->is_admin = $is_admin;
		$advisory->recovered= $recovered;
		$advisory->checks   = $is_admin ? ($probe->checks ?? null) : null;
		$advisory->service_cmd_configured = $service_cmd_configured;
		$advisory->actions  = ['retry'];
		$advisory->title    = '';
		$advisory->cause    = '';
		$advisory->steps    = [];
		$advisory->log_tail = null;

		if ($probe->state==='ok') {
			$advisory->title = 'Diffusion engine ready';
			return $advisory;
		}

		if (!$is_admin) {
			$advisory->title = 'Diffusion is temporarily unavailable';
			$advisory->steps = ['Please let your administrator know. You can keep working on everything else.'];
			return $advisory;
		}

		if ($probe->state==='unhealthy') {
			$failing = self::first_failing_check($probe->checks);
			$advisory->title = 'Diffusion engine is running, but a dependency is failing';
			$advisory->cause = $failing
				? ($failing->name . ': ' . $failing->msg)
				: ($probe->msg ?: 'A health check failed.');
			$advisory->steps = [
				'If the failing item is the database (sql), check the target database is running and reachable.',
				'Verify the diffusion credentials/configuration in config.php.',
				'Then click Retry.'
			];
			return $advisory;
		}

		// unreachable, admin
		$advisory->title = $recovered ? 'Diffusion engine recovered' : 'Diffusion engine is not running';
		if ($service_cmd_configured) {
			$advisory->cause = 'The diffusion engine (Bun service) is not responding'
				. ($recovered ? '' : ', and an automatic start attempt did not bring it up') . '.';
			$advisory->steps = [
				'Click "Restart engine" below.',
				'If it still fails, open the log (Show log) and send it to your IT team.',
				'As a last resort, on the server run: diffusion/service/service-ctl.sh restart'
			];
			$advisory->actions  = ['retry','restart_engine','show_log'];
			$advisory->log_tail = self::read_engine_log_tail();
		} else {
			$advisory->cause = 'The diffusion engine is not responding, and no service control command is configured to start it automatically.';
			$advisory->steps = [
				'Set DEDALO_DIFFUSION_SERVICE_CMD in config.php (see diffusion/service/README.md).',
				'Or start the engine from Maintenance → Diffusion server control.'
			];
		}
		return $advisory;
	}//end build_engine_advisory
}//end class dd_diffusion_api
