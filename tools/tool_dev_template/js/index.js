// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_DEV_TEMPLATE
*
* Barrel entry-point for the tool_dev_template module.
*
* This file re-exports the `tool_dev_template` constructor and every other
* public symbol defined in `tool_dev_template.js`, so that callers can import
* from the stable, version-safe path `tools/tool_dev_template/js/index.js`
* without depending on the internal module layout.
*
* The named export `tool_dev_template` MUST match the model string that the
* instance loader (`instances.js`) uses to resolve and instantiate the tool;
* renaming or aliasing it here would silently break tool instantiation.
*
* tool_dev_template is a production-shaped reference tool: it demonstrates the
* full client-side lifecycle (init → build → render/edit), server round-trips
* via `tool_request`, background execution, generic file upload through
* `service_upload`, and image upload through `tool_upload` + `component_image`.
* Copy and rename this tool (or use the CLI scaffolder) as the starting point
* for new tools.
*
* How to create a new tool:
*   1 - Go to Area Development > Tools > Tools Development
*       (URL like /dedalo/core/page/?tipo=dd1340)
*   2 - Create a new tool record using the 'New' button.
*   3 - Fill in the tool's name, label, scope, custom labels, etc.
*       (see existing tools for examples).
*       The name MUST start with 'tool_' and contain only ASCII alphanumerics
*       and underscores — no spaces, accents, or other non-ASCII characters —
*       to avoid path/cache errors.
*       Convention: 'tool_<org>_<action>', e.g. 'tool_numisdata_import'
*       ('tool_' mandatory prefix, 'numisdata' organisation TLD, 'import'
*       describes the action).
*       The label may be more descriptive, e.g. 'Tool to import Numismatic files'.
*
* Main exports (defined in tool_dev_template.js):
*   - tool_dev_template            — constructor; prototype carries init /
*                                    build / edit (via wire_tool) /
*                                    get_some_data_from_server /
*                                    file_upload_handler /
*                                    run_background_demo /
*                                    load_component_sample
*/



export * from './tool_dev_template.js'



// @license-end
