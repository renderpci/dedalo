<?php declare(strict_types=1);
/**
* CLASS TOOL_PRINT
* Visual print-layout / report designer for section records.
*
* Opens a visual editor (js/) where the user drags a section's components onto
* a paginated document, arranges them into a flow-based grid of rows and cells,
* and saves reusable layout templates per section_tipo. The browser then prints
* the resulting document via window.print().
*
* Architecture:
* - This class is the PHP registration stub. The heavy lifting is entirely
*   client-side (js/flow_engine.js, js/canvas_tool_print.js,
*   js/render_tool_print.js, js/render_box_tool_print.js).
* - Layout templates are stored as ordinary section records in dd25 via a
*   component_json (dd625). Persistence uses the generic core data API
*   (create/save/search/delete), so this class has NO write API actions for
*   the browser-print MVP. See js/print_layout_presets.js for the CRUD layer.
* - The tool is registered in the Dédalo ontology under dd1340 (the Tools
*   development / authoring section); see register.json for the full ontology
*   mapping. The imported record also appears in dd1324 (Registered Tools).
*
* Layout model (schema_version 2 — document-flow grid):
* - layout.flow.rows[] — a row is a horizontal grid of cells (fractional
*   `width`); a cell holds one block (type: component | static_text | empty).
* - A spacer row is a fixed-height whitespace row with no cells.
* - Rows stack top-to-bottom and paginate automatically — pages are
*   content-driven, not stored. Full-width tables and long text blocks split
*   across page boundaries and everything after them reflows.
* - Page dimensions are stored in millimetres; the flow engine converts to px
*   via make_editor_ctx (zoom-relative) / make_print_ctx (mm-to-px).
*
* Phase-2 (inactive): a server-side generate_pdf action is sketched as dead
* code below. When implemented it will read the same layout blob and produce
* a PDF using TCPDF/mPDF. See the commented block for the implementation plan.
*
* Tool framework contract (see tool_dev_template for the canonical reference):
* - Extends tool_common, named exactly like its directory.
* - Every remotely callable method must be public static, accept a single
*   object $options, and return an object {result, msg, errors}.
* - Every remotely callable method MUST be listed in API_ACTIONS (SEC-024)
*   with the permission gate the framework enforces before dispatch.
*
* @see tools/tool_print/js/print_layout_presets.js  (client persistence layer)
* @see tools/tool_print/js/flow_engine.js            (shared layout engine)
* @see tools/tool_print/js/canvas_tool_print.js      (editor model + mutations)
* @see tools/tool_print/js/render_tool_print.js      (toolbar, inspector, print path)
* @see tools/tool_dev_template/class.tool_dev_template.php  (canonical tool template)
*
* @package Dédalo
* @subpackage Tools
*/
class tool_print extends tool_common {



	/**
	* API_ACTIONS
	* SEC-024 allowlist of methods callable via dd_tools_api::tool_request.
	*
	* Empty in the browser-print MVP because all persistence (saving, loading,
	* listing, and deleting layout templates) is performed client-side through
	* the generic core data actions (create/save/search/delete), which are
	* already permission- and scope-checked by the core API independently.
	*
	* (!) dd_tools_api refuses any tool_request call whose method is absent from
	* this map. Omitting a method from API_ACTIONS is the primary access-control
	* fence — the tool_security layer enforces it before dispatch.
	*
	* When phase-2 server PDF generation is implemented, add:
	*   'generate_pdf' => ['permission' => 'record', 'min_level' => 1]
	*
	* Shape: array<string, array{permission: string, min_level: int}>
	* @var array<string, array<string, mixed>>
	*/
	public const API_ACTIONS = [];

	/**
	* BACKGROUND_RUNNABLE
	* Allowlist of method names the CLI background runner (process_runner.php)
	* may dispatch when a tool_request arrives with `background: true`.
	*
	* Empty for the browser-print MVP. When phase-2 PDF generation is active,
	* 'generate_pdf' will be added here so long PDF jobs can run detached from
	* the HTTP request (returning a task handle to the caller immediately).
	*
	* Shape: string[] — bare method names that must also appear in API_ACTIONS.
	* @var array<int, string>
	*/
	public const BACKGROUND_RUNNABLE = [];



	// ---------------------------------------------------------------------
	// PHASE 2 (server-side PDF) — implementation sketch, kept commented until
	// the PDF engine dependency is chosen and wired.
	//
	// GENERATE_PDF
	// Reads the saved layout blob and the live record data server-side, then
	// renders a PDF whose boxes are positioned by the layout's mm geometry.
	//
	// Implementation checklist when activating:
	// 1. Add 'generate_pdf' => ['permission' => 'record', 'min_level' => 1]
	//    to API_ACTIONS and 'generate_pdf' to BACKGROUND_RUNNABLE (long jobs
	//    should run detached and return a task handle to the browser).
	// 2. Read component values through component_common::get_export_value() /
	//    get_value() — the same atoms export contract the browser uses — so
	//    PDF and screen output remain consistent.
	// 3. Do NOT open a direct MariaDB connection; Bun owns MariaDB (all data
	//    reads go through the Bun API actions or the PHP record layer).
	// 4. No bespoke tables: state lives in dd25/dd625 (the layout blob) and
	//    ordinary section/component records for the record data.
	// 5. The security::assert_record_in_user_scope() call below is required
	//    even when called from the CLI background runner, because that path
	//    bypasses dd_tools_api's HTTP permission check.
	//
	// public static function generate_pdf(object $options) : object {
	//
	//     $response = new stdClass();
	//         $response->result = false;
	//         $response->msg    = 'Error. Request failed ['.__FUNCTION__.']';
	//         $response->errors = [];
	//
	//     $section_tipo        = $options->section_tipo ?? null;
	//     $section_id          = $options->section_id ?? null;
	//     $template_section_id = $options->template_section_id ?? null;
	//
	//     // defense in depth (the CLI background path skips dd_tools_api)
	//     if (isset($section_id)) {
	//         security::assert_record_in_user_scope(
	//             $section_tipo, (int)$section_id, __METHOD__
	//         );
	//     }
	//
	//     // 1. read the layout blob from the print-layouts section (component_json)
	//     // 2. validate $layout->target_section_tipo === $section_tipo
	//     // 3. per box: component_common::get_instance(...)->get_value()
	//     // 4. position by box mm geometry into a PDF engine (TCPDF/mPDF), one
	//     //    PDF page per layout page; repeat per record id in scope.
	//
	//     return $response;
	// }//end generate_pdf



}//end class tool_print
