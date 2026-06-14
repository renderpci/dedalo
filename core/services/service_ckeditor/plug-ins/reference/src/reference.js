/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module reference/reference
 */

/**
 * REFERENCE PLUGIN
 * Entry-point CKEditor 5 plugin for the Dédalo "reference" feature.
 *
 * This is the top-level "glue" plugin that declares the two sub-plugins required
 * by the CKEditor plugin system:
 *   - reference_editing  — registers the `reference` model attribute, the upcast/downcast
 *                          converters, the `reference` command, two-step caret movement, and
 *                          inline highlight behavior.
 *   - reference_ui       — adds the toolbar button that triggers reference insertion and
 *                          binds it to the `reference` command state.
 *
 * Consumers register only this single class with the editor; CKEditor resolves and
 * initialises the sub-plugins automatically via the `requires` declaration.
 *
 * The "reference" feature allows authors to embed structured Dédalo record references
 * inside CKEditor rich-text fields.  A reference is stored as a custom `<reference>`
 * element in the document HTML with the following data attributes:
 *   - id            — unique identifier of the reference node
 *   - data-type     — the reference kind (defaults to 'reference' for legacy v5 content)
 *   - data-tag_id   — the ontology tag identifier
 *   - data-state    — current state of the referenced term
 *   - data-label    — human-readable label displayed in the editor
 *   - data-data     — serialised payload carried with the reference
 */

import { Plugin } from 'ckeditor5/src/core';
import reference_editing from './reference_editing';
import reference_ui from './reference_ui';


/**
 * REFERENCE
 * Top-level CKEditor 5 plugin that composes the reference editing and UI sub-plugins.
 *
 * Registering this class with the editor is sufficient to activate the full reference
 * feature.  It does not implement any logic itself; all behaviour lives in
 * {@link module:reference/reference_editing~reference_editing} and
 * {@link module:reference/reference_ui~reference_ui}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class reference extends Plugin {
	/**
	 * REQUIRES
	 * Declares the sub-plugins that must be loaded before this plugin is initialised.
	 *
	 * CKEditor resolves this list recursively, so any dependencies of the sub-plugins
	 * are also loaded automatically.
	 *
	 * @returns {Array} Array of plugin constructors required by this plugin.
	 * @inheritDoc
	 */
	static get requires() {
		return [ reference_editing, reference_ui ];
	}

	/**
	 * PLUGINNAME
	 * Returns the canonical name used to retrieve this plugin from the editor's
	 * plugin collection via `editor.plugins.get( 'reference' )`.
	 *
	 * @returns {string} The registered plugin name.
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'reference';
	}
}
