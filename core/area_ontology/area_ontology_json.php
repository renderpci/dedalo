<?php declare(strict_types=1);
// SEC-026 (§9.3): server-agnostic deny for direct HTTP access. This file is
// included by common::get_json() inside the calling object scope; reaching
// it through a URL means the web server config did not block the path.
// Fail closed regardless of server (Apache / nginx / Caddy / lighttpd / IIS)
// or display_errors mode. The .htaccess <FilesMatch> rule is layer 1.
if (!isset($this)) { http_response_code(404); exit; }
// JSON data controller


/**
 * AREA_ONTOLOGY JSON CONTROLLER
 * JSON data controller for the area_ontology area, which surfaces the full
 * Dédalo ontology hierarchy to the browser client.
 *
 * This controller is a thin delegation layer. area_ontology extends
 * area_thesaurus and shares identical JSON output requirements, so this file
 * simply forwards execution to area_thesaurus_json.php — keeping a single
 * authoritative implementation while allowing common::get_json() to locate the
 * correct controller by class name (it resolves
 * DEDALO_CORE_PATH/area_ontology/area_ontology_json.php automatically).
 *
 * Execution context:
 *   - Included by common::get_json() via include($path), so $this refers to the
 *     area_ontology instance that called get_json().
 *   - $options (get_context, get_data, …) and $request_options are injected by
 *     get_json() before the include.
 *   - The delegated controller detects $this->get_model() === 'area_ontology' and
 *     applies an ontology-specific permission bypass for global administrators,
 *     granting unrestricted access to all search-type hierarchies (dd, rsc, lg,
 *     etc.) regardless of per-section read permissions.
 *
 * Data shape returned by the delegated controller (via common::build_element_json_output):
 *   {
 *     context: [ { tipo, section_tipo, thesaurus_mode, … } ],   // if get_context
 *     data:    [ { tipo, value: hierarchy_sections[], typologies[] } ]  // if get_data
 *   }
 *
 * @see area_thesaurus_json.php  — the shared implementation that does all the work.
 * @see class.area_ontology.php  — extends area_thesaurus; overrides
 *                                 get_hierarchy_section_tipo() and get_main_table()
 *                                 to point at the ontology section/table.
 * @see common::get_json()       — the caller that includes this file inside $this scope.
 *
 * @package Dédalo
 * @subpackage Core
 */


// Delegate to the shared area_thesaurus JSON controller.
// dirname(__FILE__, 2) navigates two levels up from core/area_ontology/ to core/,
// then descends into area_thesaurus/area_thesaurus_json.php.
// The return value is the JSON object produced by common::build_element_json_output()
// inside that controller, which get_json() returns directly to its caller.
return include dirname(__FILE__, 2) .'/area_thesaurus/area_thesaurus_json.php';
