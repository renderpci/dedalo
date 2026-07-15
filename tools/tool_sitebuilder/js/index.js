// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



/**
 * TOOL_SITEBUILDER — barrel entry point.
 *
 * Re-exports the `tool_sitebuilder` constructor from the stable, version-safe path
 * `tools/tool_sitebuilder/js/index.js`, so the instance loader can resolve it without
 * depending on the internal module layout. The named export MUST match the model string
 * the loader uses to instantiate the tool.
 */

export { tool_sitebuilder } from './tool_sitebuilder.js'
