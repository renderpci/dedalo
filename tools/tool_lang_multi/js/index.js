// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_LANG_MULTI
* Entry-point barrel for the multi-language translation tool.
*
* Translates a text component's content from the active source language into
* every other language configured for the project. Supports:
*   - Server-side engines (e.g. Babel, Google Translate) via the dd_tools_api
*     `automatic_translation` action with bounded-concurrency batching.
*   - Client-side (browser) AI translation via a shared Web Worker / WebGPU
*     model, running translations sequentially to avoid GPU contention.
*
* The named export MUST equal the model string 'tool_lang_multi' so the
* instances.js loader can resolve it via dynamic import of this entry point.
* (See js-module-stale-cache gotcha in MEMORY.md for the stale-module pitfall.)
*
* Main export: {@link tool_lang_multi} constructor + prototype methods.
*/


export * from './tool_lang_multi.js'


// @license-end
