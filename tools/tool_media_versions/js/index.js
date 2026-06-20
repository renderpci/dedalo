// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0


/**
* TOOL_MEDIA_VERSIONS
*
* Public entry-point barrel for the tool_media_versions tool.
*
* This module re-exports every named binding from tool_media_versions.js so
* that callers can import from the canonical 'index.js' path rather than the
* internal implementation file directly. This keeps the public surface stable
* if the internal module is ever split or renamed.
*
* The tool manages the different quality versions of a media file attached to
* a Dédalo media component (component_av, component_image, etc.). It lets
* authorised users inspect which quality files are present on disk versus in
* the DB, build or delete individual quality versions, rotate images,
* rewrite AV container headers (conform_headers), and force a full
* DB-to-disk synchronisation (sync_files).
*
* Main export:
*   tool_media_versions — constructor; assigned to prototype via tool_common
*/


export * from './tool_media_versions.js'


// @license-end
