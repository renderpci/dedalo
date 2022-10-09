/**
 * @license Copyright (c) 2003-2022, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

/**
 * @module link/reference_editing
 */

import { Plugin } from 'ckeditor5/src/core';
import { MouseObserver } from 'ckeditor5/src/engine';
import { Input, TwoStepCaretMovement, inlineHighlight, findAttributeRange } from 'ckeditor5/src/typing';
import { ClipboardPipeline } from 'ckeditor5/src/clipboard';
import { keyCodes, env } from 'ckeditor5/src/utils';
import { first } from 'ckeditor5/src/utils';

import reference_command from './reference_command';
import '../theme/link.css';

const HIGHLIGHT_CLASS = 'ck-link_selected';


/**
 * The link engine feature.
 *
 * It introduces the `reference="url"` attribute in the model which renders to the view as a `<a href="url">` element
 * as well as `'link'` and `'unlink'` commands.
 *
 * @extends module:core/plugin~Plugin
 */
export default class reference_editing extends Plugin {
	/**
	 * @inheritDoc
	 */
	static get pluginName() {
		return 'reference_editing';
	}

	/**
	 * @inheritDoc
	 */
	static get requires() {
		// Clipboard is required for handling cut and paste events while typing over the link.
		return [ TwoStepCaretMovement, Input, ClipboardPipeline ];
	}

	/**
	 * @inheritDoc
	 */
	constructor( editor ) {
		super( editor );

		editor.config.define( 'reference', {
			addTargetToExternalLinks: false
		} );
	}

	/**
	 * @inheritDoc
	 */
	init() {
		const editor = this.editor;

		// Allow link attribute on all inline nodes.
		editor.model.schema.extend( '$text', { allowAttributes: 'reference' } );

		// editor.conversion.for( 'dataDowncast' )
		// 	.attributeToElement({
		// 		model: 'reference',
		// 		view: create_refence_element
		// 	});

		// editor.conversion.for( 'editingDowncast' )
		// 	.attributeToElement({
		// 		model: 'reference',
		// 		view: ( modelElement, conversionApi ) => {
		// 			return create_refence_element( modelElement , conversionApi );
		// 		}
		// 	});

		// set the upcast match to convert the dom nodes to model
		editor.conversion.for( 'upcast' )
			.elementToAttribute( {
				view: {
					name: 'reference',
					// attributes: [
					// 	'id'			, //: true,
					// 	'data-type'		, //: true,
					// 	'data-tag_id'	, //: true,
					// 	'data-state'	, //: true,
					// 	'data-label'	, //: true,
					// 	'data-data'		, //: true
					// ]
				},
				model: {
					key: 'reference',
					value: viewElement => {
						// sometimes the data-type is not set (v5)
						const type = viewElement.getAttribute( 'data-type' ) || 'reference'

						const values = {
							id		: viewElement.getAttribute( 'id' ),
							type	: type,
							tag_id	: viewElement.getAttribute( 'data-tag_id' ),
							state	: viewElement.getAttribute( 'data-state' ),
							label	: viewElement.getAttribute( 'data-label' ),
							data	: viewElement.getAttribute( 'data-data' )
						}
						return values
					}
				}
			} );

		// set the downcast model to convert the ckeditor model to dom elements
		editor.conversion.for( 'downcast' )
			.attributeToElement({
				view: ( modelElement, { writer } ) => {
					// if is not defined the modelElement as $text node don't do anything
					if(!modelElement) return
					// else return the reference attributes
					return writer.createAttributeElement(
						'reference'
						, {
							'id': modelElement.id,
							'data-type': modelElement.type,
							'data-tag_id': modelElement.tag_id,
							'data-state': modelElement.state,
							'data-label': modelElement.label,
							'data-data': modelElement.data,
							 class: 'reference'
						},
						{ priority: 5 }
					);
				},
				model: {
					key: 'reference',
					name: '$text'
				},
					converterPriority: 'high'
			})

		// Create linking commands.
		editor.commands.add( 'reference', new reference_command( editor ) );

		// Enable two-step caret movement for `reference` attribute.
		const twoStepCaretMovementPlugin = editor.plugins.get( TwoStepCaretMovement );
		twoStepCaretMovementPlugin.registerAttribute( 'reference' );

		// Setup highlight over selected link.
		// ( editor, attributeName, tagName, className )
		inlineHighlight( editor, 'reference', 'reference', HIGHLIGHT_CLASS );

		// Change the attributes of the selection in certain situations after the link was inserted into the document.
		this._enableInsertContentSelectionAttributesFixer();

		// Handle a click at the beginning/end of a link element.
		this._enableClickingAfterLink();

		// Handle typing over the link.
		this._enableTypingOverLink();

		// Handle removing the content after the link element.
		this._handleDeleteContentAfterLink();
	}


	/**
	 * Starts listening to {@link module:engine/model/model~Model#event:insertContent} and corrects the model
	 * selection attributes if the selection is at the end of a link after inserting the content.
	 *
	 * The purpose of this action is to improve the overall UX because the user is no longer "trapped" by the
	 * `reference` attribute of the selection and they can type a "clean" (`reference`–less) text right away.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/6053.
	 *
	 * @private
	 */
	_enableInsertContentSelectionAttributesFixer() {
		const editor = this.editor;
		const model = editor.model;
		const selection = model.document.selection;

		this.listenTo( model, 'insertContent', () => {
			const nodeBefore = selection.anchor.nodeBefore;
			const nodeAfter = selection.anchor.nodeAfter;

			// NOTE: ↰ and ↱ represent the gravity of the selection.

			// The only truly valid case is:
			//
			//		                                 ↰
			//		...<$text reference="foo">INSERTED[]</$text>
			//
			// If the selection is not "trapped" by the `reference` attribute after inserting, there's nothing
			// to fix there.
			if ( !selection.hasAttribute( 'reference' ) ) {
				return;
			}

			// Filter out the following case where a link with the same href (e.g. <a href="foo">INSERTED</a>) is inserted
			// in the middle of an existing link:
			//
			// Before insertion:
			//		                       ↰
			//		<$text reference="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//		                               ↰
			//		<$text reference="foo">lINSERTED[]ink</$text>
			//
			if ( !nodeBefore ) {
				return;
			}

			// Filter out the following case where the selection has the "reference" attribute because the
			// gravity is overridden and some text with another attribute (e.g. <b>INSERTED</b>) is inserted:
			//
			// Before insertion:
			//
			//		                       ↱
			//		<$text reference="foo">[]link</$text>
			//
			// Expected after insertion:
			//
			//		                                                          ↱
			//		<$text bold="true">INSERTED</$text><$text reference="foo">[]link</$text>
			//
			if ( !nodeBefore.hasAttribute( 'reference' ) ) {
				return;
			}

			// Filter out the following case where a link is a inserted in the middle (or before) another link
			// (different URLs, so they will not merge). In this (let's say weird) case, we can leave the selection
			// attributes as they are because the user will end up writing in one link or another anyway.
			//
			// Before insertion:
			//
			//		                       ↰
			//		<$text reference="foo">l[]ink</$text>
			//
			// Expected after insertion:
			//
			//		                                                             ↰
			//		<$text reference="foo">l</$text><$text reference="bar">INSERTED[]</$text><$text reference="foo">ink</$text>
			//
			if ( nodeAfter && nodeAfter.hasAttribute( 'reference' ) ) {
				return;
			}

			model.change( writer => {
				removeLinkAttributesFromSelection( writer, getLinkAttributesAllowedOnText( model.schema ) );
			} );
		}, { priority: 'low' } );
	}

	/**
	 * Starts listening to {@link module:engine/view/document~Document#event:mousedown} and
	 * {@link module:engine/view/document~Document#event:selectionChange} and puts the selection before/after a link node
	 * if clicked at the beginning/ending of the link.
	 *
	 * The purpose of this action is to allow typing around the link node directly after a click.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/1016.
	 *
	 * @private
	 */
	_enableClickingAfterLink() {
		const editor = this.editor;
		const model = editor.model;

		editor.editing.view.addObserver( MouseObserver );

		let clicked = false;

		// Detect the click.
		this.listenTo( editor.editing.view.document, 'mousedown', () => {
			clicked = true;
		} );

		// When the selection has changed...
		this.listenTo( editor.editing.view.document, 'selectionChange', () => {
			if ( !clicked ) {
				return;
			}

			// ...and it was caused by the click...
			clicked = false;

			const selection = model.document.selection;

			// ...and no text is selected...
			if ( !selection.isCollapsed ) {
				return;
			}

			// ...and clicked text is the link...
			if ( !selection.hasAttribute( 'reference' ) ) {
				return;
			}

			const position = selection.getFirstPosition();
			const linkRange = findAttributeRange( position, 'reference', selection.getAttribute( 'reference' ), model );

			// ...check whether clicked start/end boundary of the link.
			// If so, remove the `reference` attribute.
			if ( position.isTouching( linkRange.start ) || position.isTouching( linkRange.end ) ) {
				model.change( writer => {
					removeLinkAttributesFromSelection( writer, getLinkAttributesAllowedOnText( model.schema ) );
				} );
			}
		} );
	}

	/**
	 * Starts listening to {@link module:engine/model/model~Model#deleteContent} and {@link module:engine/model/model~Model#insertContent}
	 * and checks whether typing over the link. If so, attributes of removed text are preserved and applied to the inserted text.
	 *
	 * The purpose of this action is to allow modifying a text without loosing the `reference` attribute (and other).
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/4762.
	 *
	 * @private
	 */
	_enableTypingOverLink() {
		const editor = this.editor;
		const view = editor.editing.view;

		// Selection attributes when started typing over the link.
		let selectionAttributes;

		// Whether pressed `Backspace` or `Delete`. If so, attributes should not be preserved.
		let deletedContent;

		// Detect pressing `Backspace` / `Delete`.
		this.listenTo( view.document, 'delete', () => {
			deletedContent = true;
		}, { priority: 'high' } );

		// Listening to `model#deleteContent` allows detecting whether selected content was a link.
		// If so, before removing the element, we will copy its attributes.
		this.listenTo( editor.model, 'deleteContent', () => {
			const selection = editor.model.document.selection;

			// Copy attributes only if anything is selected.
			if ( selection.isCollapsed ) {
				return;
			}

			// When the content was deleted, do not preserve attributes.
			if ( deletedContent ) {
				deletedContent = false;

				return;
			}

			// Enabled only when typing.
			if ( !isTyping( editor ) ) {
				return;
			}

			if ( shouldCopyAttributes( editor.model ) ) {
				selectionAttributes = selection.getAttributes();
			}
		}, { priority: 'high' } );

		// Listening to `model#insertContent` allows detecting the content insertion.
		// We want to apply attributes that were removed while typing over the link.
		this.listenTo( editor.model, 'insertContent', ( evt, [ element ] ) => {
			deletedContent = false;

			// Enabled only when typing.
			if ( !isTyping( editor ) ) {
				return;
			}

			if ( !selectionAttributes ) {
				return;
			}

			editor.model.change( writer => {
				for ( const [ attribute, value ] of selectionAttributes ) {
					writer.setAttribute( attribute, value, element );
				}
			} );

			selectionAttributes = null;
		}, { priority: 'high' } );
	}

	/**
	 * Starts listening to {@link module:engine/model/model~Model#deleteContent} and checks whether
	 * removing a content right after the "reference" attribute.
	 *
	 * If so, the selection should not preserve the `reference` attribute. However, if
	 * the {@link module:typing/twostepcaretmovement~TwoStepCaretMovement} plugin is active and
	 * the selection has the "reference" attribute due to overriden gravity (at the end), the `reference` attribute should stay untouched.
	 *
	 * The purpose of this action is to allow removing the link text and keep the selection outside the link.
	 *
	 * See https://github.com/ckeditor/ckeditor5/issues/7521.
	 *
	 * @private
	 */
	_handleDeleteContentAfterLink() {
		const editor = this.editor;
		const model = editor.model;
		const selection = model.document.selection;
		const view = editor.editing.view;

		// A flag whether attributes `reference` attribute should be preserved.
		let shouldPreserveAttributes = false;

		// A flag whether the `Backspace` key was pressed.
		let hasBackspacePressed = false;

		// Detect pressing `Backspace`.
		this.listenTo( view.document, 'delete', ( evt, data ) => {
			hasBackspacePressed = data.domEvent.keyCode === keyCodes.backspace;
		}, { priority: 'high' } );

		// Before removing the content, check whether the selection is inside a link or at the end of link but with 2-SCM enabled.
		// If so, we want to preserve link attributes.
		this.listenTo( model, 'deleteContent', () => {
			// Reset the state.
			shouldPreserveAttributes = false;

			const position = selection.getFirstPosition();
			const reference = selection.getAttribute( 'reference' );

			if ( !reference ) {
				return;
			}

			const linkRange = findAttributeRange( position, 'reference', reference, model );

			// Preserve `reference` attribute if the selection is in the middle of the link or
			// the selection is at the end of the link and 2-SCM is activated.
			shouldPreserveAttributes = linkRange.containsPosition( position ) || linkRange.end.isEqual( position );
		}, { priority: 'high' } );

		// After removing the content, check whether the current selection should preserve the `reference` attribute.
		this.listenTo( model, 'deleteContent', () => {
			// If didn't press `Backspace`.
			if ( !hasBackspacePressed ) {
				return;
			}

			hasBackspacePressed = false;

			// Disable the mechanism if inside a link (`<$text url="foo">F[]oo</$text>` or <$text url="foo">Foo[]</$text>`).
			if ( shouldPreserveAttributes ) {
				return;
			}

			// Use `model.enqueueChange()` in order to execute the callback at the end of the changes process.
			editor.model.enqueueChange( writer => {
				removeLinkAttributesFromSelection( writer, getLinkAttributesAllowedOnText( model.schema ) );
			} );
		}, { priority: 'low' } );
	}
}

// Make the selection free of link-related model attributes.
// All link-related model attributes start with "link". That includes not only "reference"
// but also all decorator attributes (they have dynamic names), or even custom plugins.
//
// @param {module:engine/model/writer~Writer} writer
// @param {Array.<String>} linkAttributes
function removeLinkAttributesFromSelection( writer, linkAttributes ) {
	writer.removeSelectionAttribute( 'reference' );

	for ( const attribute of linkAttributes ) {
		writer.removeSelectionAttribute( attribute );
	}
}

// Checks whether selection's attributes should be copied to the new inserted text.
//
// @param {module:engine/model/model~Model} model
// @returns {Boolean}
function shouldCopyAttributes( model ) {
	const selection = model.document.selection;
	const firstPosition = selection.getFirstPosition();
	const lastPosition = selection.getLastPosition();
	const nodeAtFirstPosition = firstPosition.nodeAfter;

	// The text link node does not exist...
	if ( !nodeAtFirstPosition ) {
		return false;
	}

	// ...or it isn't the text node...
	if ( !nodeAtFirstPosition.is( '$text' ) ) {
		return false;
	}

	// ...or isn't the link.
	if ( !nodeAtFirstPosition.hasAttribute( 'reference' ) ) {
		return false;
	}

	// `textNode` = the position is inside the link element.
	// `nodeBefore` = the position is at the end of the link element.
	const nodeAtLastPosition = lastPosition.textNode || lastPosition.nodeBefore;

	// If both references the same node selection contains a single text node.
	if ( nodeAtFirstPosition === nodeAtLastPosition ) {
		return true;
	}

	// If nodes are not equal, maybe the link nodes has defined additional attributes inside.
	// First, we need to find the entire link range.
	const linkRange = findAttributeRange( firstPosition, 'reference', nodeAtFirstPosition.getAttribute( 'reference' ), model );

	// Then we can check whether selected range is inside the found link range. If so, attributes should be preserved.
	return linkRange.containsRange( model.createRange( firstPosition, lastPosition ), true );
}

// Checks whether provided changes were caused by typing.
//
// @params {module:core/editor/editor~Editor} editor
// @returns {Boolean}
function isTyping( editor ) {
	const currentBatch = editor.model.change( writer => writer.batch );

	return currentBatch.isTyping;
}

// Returns an array containing names of the attributes allowed on `$text` that describes the link item.
//
// @param {module:engine/model/schema~Schema} schema
// @returns {Array.<String>}
function getLinkAttributesAllowedOnText( schema ) {
	const textAttributes = schema.getDefinition( '$text' ).allowAttributes;

	return textAttributes.filter( attribute => attribute.startsWith( 'reference' ) );
}


reference_editing.prototype.findAttributeRange = findAttributeRange
reference_editing.prototype.first = first