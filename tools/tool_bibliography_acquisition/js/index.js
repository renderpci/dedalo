// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0



// Barrel entry-point for tool_bibliography_acquisition.
// Re-exports every export from tool_bibliography_acquisition.js under the
// stable index.js path. The named export tool_bibliography_acquisition MUST
// match the model string instances.js uses to resolve the tool —
// renaming/aliasing it here would silently break tool instantiation.
export * from './tool_bibliography_acquisition.js'



// @license-end
