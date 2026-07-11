/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module reference
 *
 * REFERENCE PLUGIN — CKEditor5 barrel entry point
 *
 * Dédalo-custom CKEditor5 plugin that lets authors embed structured cultural-heritage
 * references (terms, thesaurus nodes, section links, …) as inline `<reference>` elements
 * inside rich-text fields.  The plugin is adapted from CKEditor's built-in link plugin but
 * replaces the `<a href>` output with a dedicated `<reference data-type="…" data-tag_id="…"
 * data-label="…" …>` element that Dédalo's viewer and diffusion layer can interpret without
 * ambiguity.
 *
 * This file is the public barrel: importers should always target this module rather than the
 * individual sub-modules so that the three plugin parts (glue, editing, UI) stay together.
 *
 * Exported symbols
 * ─────────────────
 * • {@link module:reference/reference~reference}          — glue plugin; loads editing + UI.
 * • {@link module:reference/reference_editing~reference_editing} — model/conversion/commands.
 * • {@link module:reference/reference_ui~reference_ui}    — toolbar button + interaction.
 *
 * Typical registration in a Dédalo CKEditor5 build:
 *
 *   import { reference } from 'path/to/reference/src/index.js';
 *   ClassicEditor.builtinPlugins = [ ..., reference ];
 *   ClassicEditor.defaultConfig  = { toolbar: { items: [ ..., 'reference' ] } };
 *
 * (!) The `@module link` tag below is intentionally changed to `reference` to match the
 *     actual plugin name; the original CKEditor link-plugin module path has been superseded.
 */

// re-export: glue plugin that requires both editing and UI sub-plugins
export { default as reference } from './reference';

// re-export: editing engine — schema extension, upcast/downcast converters, reference command
export { default as reference_editing } from './reference_editing';

// re-export: UI layer — toolbar button bound to the reference command
export { default as reference_ui } from './reference_ui';

