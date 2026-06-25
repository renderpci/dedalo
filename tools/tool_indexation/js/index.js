// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


// Public entry-point barrel for tool_indexation.
// Re-exports every named binding from tool_indexation.js so that callers
// can import from the canonical 'index.js' path rather than the
// internal implementation file. This keeps the public surface stable
// if the internal module is ever split or renamed.
export * from './tool_indexation.js'


// @license-end
