/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/link
 */

import { Plugin } from 'ckeditor5/src/core';
import reference_editing from './reference_editing';
import reference_ui from './reference_ui';


/**
 * The link plugin.
 *
 * This is a "glue" plugin that loads the {@link module:link/linkediting~LinkEditing link editing feature}
 * and {@link module:link/linkui~LinkUI link UI feature}.
 *
 * @extends module:core/plugin~Plugin
 */
export default class reference extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get requires() {
		return [ reference_editing, reference_ui ];
	}

	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'reference';
	}
}
