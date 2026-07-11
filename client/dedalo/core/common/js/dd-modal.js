// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global Promise, page_globals, SHOW_DEBUG, get_label */
/**
 * DD_MODAL — Custom Element (<dd-modal>)
 *
 * A Web Component that provides a draggable, minimizable modal dialog.
 * Uses Shadow DOM with named slots (header, body, footer) for content projection.
 * Registered as the custom element 'dd-modal' via customElements.define.
 *
 * Sizes (set via the `data-size` attribute or the open() method):
 *   'normal' — centered, 80% width (default)
 *   'big'    — 97vw × 97vh; suitable for full-screen editing views
 *   'small'  — fit-content, max 32vw; suitable for confirmation dialogs
 *
 * Features:
 *   - Drag by header: on first mousedown over .dragger, the modal-content is
 *     pinned from CSS centering to inline position:absolute so drag offsets are
 *     stable. Movement is clamped to the overlay container bounds.
 *   - Minimize to a bottom strip: clicking the '_' button toggles the .mini class
 *     and stacks minimized modals at the bottom-right with computed offsets.
 *   - Close via the '×' button, overlay click, or Escape key (topmost stack entry).
 *   - Unsaved-data guard: _closeModal() awaits check_unsaved_data() before hiding.
 *   - Modal stack: window.modal_stack[] tracks all mounted dd-modal elements;
 *     Escape always targets the topmost (last) entry.
 *   - window.modal getter: always returns the topmost dd-modal or null.
 *
 * Public API:
 *   open(type)          — show modal; type is 'normal'|'big'|'small'
 *   close()             — async; checks unsaved data, then hides; returns {Promise<boolean>}
 *   get_modal_node()    — returns the .modal shadow <div> (the full-screen overlay)
 *   get_modal_content() — returns the .modal-content shadow <div> (the dialog box)
 *   remove_miniModal()  — removes the '_' minimize button from the shadow DOM
 *
 * Properties set externally (typically by attach_to_modal callers):
 *   on_close      {Function|null} — called with (this) after modal visibility is removed;
 *                                   also triggers service_autocomplete.destroy if present
 *   publish_close {Function|null} — called with (this) to fire the 'modal_close' event
 *                                   via event_manager before on_close runs
 *
 * Shadow DOM slots:
 *   slot[name="header"] — header bar content (projected inside .modal-header)
 *   slot[name="body"]   — main dialog content (projected inside .modal-body)
 *   slot[name="footer"] — footer content (projected inside .modal-footer)
 *
 * CSS custom properties consumed (all have defaults):
 *   --modal_overlay_bg, --modal_overlay_bg_weak
 *   --modal_content_bg, --modal_content_shadow, --modal_radius
 *   --modal_header_bg, --modal_header_color, --modal_header_shadow
 *   --modal_btn_color, --modal_btn_hover_color
 *
 * Additional styles are applied from layout.less → dd-modal (light DOM side).
 */


// imports
import {check_unsaved_data} from '../../component_common/js/component_common.js'



// (!) Guard: HTMLElement is undefined in non-browser environments (Node.js, some test runners).
// The entire class definition is skipped there; customElements.define is never called.
if (typeof HTMLElement!=='undefined') {
class DDModal extends HTMLElement {

	/**
	 * OBSERVEDATTRIBUTES
	 * Declares which HTML attributes the browser should observe for changes.
	 * When data-size changes on a mounted element, attributeChangedCallback fires
	 * and routes to the appropriate _showModal* size variant.
	 * @returns {Array} list of observed attribute names
	 */
	static get observedAttributes() {
		return ['data-size'];
	}

	/**
	 * CONSTRUCTOR
	 * Initialises instance state, creates the Shadow DOM from the template string,
	 * and pre-binds all event handler references so they can be added and removed
	 * by name (bound methods are not equal-by-reference, so storing them is required
	 * for removeEventListener to work correctly).
	 *
	 * Instance properties initialised here:
	 *   _modalVisible {boolean} — whether the overlay is currently shown
	 *   mini          {boolean} — whether the modal is in minimized strip mode
	 *   on_close      {Function|null} — caller-supplied callback, run after hide
	 *   publish_close {Function|null} — caller-supplied event publisher, run before on_close
	 *   drag_data     {Object}  — transient drag state (see _onHeaderMousedown)
	 *
	 * Bound handler properties (prefixed _bound*):
	 *   All are method references bound to `this`. Stored so the same function object
	 *   can be passed to both addEventListener and removeEventListener.
	 */
	constructor() {
		super();
		this._modalVisible = false;
		this.mini = false;
		this.on_close = null;
		this.publish_close = null;
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = this._template();

		// Pre-bind event handlers to `this` so removeEventListener can de-register them.
		this._boundHideModal	= this._hideModal.bind(this);
		this._boundMiniModal	= this._miniModal.bind(this);
		this._boundDetectKey	= this.detect_key.bind(this);
		this._boundMousemove	= this.mousemove.bind(this);
		this._boundMouseup		= this.mouseup.bind(this);
		this._boundOverlayClick	= this._hideModal.bind(this);
		this._boundHeaderMousedown	= this._onHeaderMousedown.bind(this);

		// Transient drag state. Reset to null on mouseup. x/y store the cursor-to-element
		// offset computed at drag start so mousemove can move cleanly.
		this.drag_data = {
			target		: null,  // the .modal-content element being dragged
			x			: null,  // cursor clientX minus element left at drag start
			y			: null,  // cursor clientY minus element top at drag start
			margin_left	: null,  // computed margin-left used in boundary clamping
			margin_top	: null   // computed margin-top used in boundary clamping
		};
	}

	/**
	 * _TEMPLATE
	 * Returns the Shadow DOM HTML string, including all scoped styles and the
	 * structural markup. Called once inside the constructor before connectedCallback.
	 *
	 * The template exposes three named slots (header, body, footer) and uses CSS
	 * custom properties so host pages can theme colors without piercing the shadow.
	 * Part attributes (overlay, content, header, body, footer) allow additional
	 * external styling via ::part().
	 *
	 * Size variants are implemented via modifier classes on .modal:
	 *   .modal_big   — applied by _showModalBig(); full-viewport mode
	 *   .modal_small — applied by _showModalSmall(); compact dialog mode
	 *   .mini        — applied by _miniModal(); minimized strip at bottom-right
	 *
	 * @returns {string} the complete Shadow DOM HTML with embedded <style>
	 */
	_template() {
		return `
		<style>
			:host {
				// color-scheme: normal;
			}

			.modal {
				font-size: inherit;
				display: none;
				position: fixed;
				z-index: 4;
				left: 0;
				top: 0;
				width: 100%;
				height: 100%;
				background-color: var(--modal_overlay_bg, rgba(0,0,0,0.4));
				transition: opacity 0.2s ease;
				opacity: 0;
			}
			.remove_overlay {
				background-color: var(--modal_overlay_bg_weak, rgba(0,0,0,0.075));
			}
			.modal_show {
				display: block;
				opacity: 1;
			}

			.modal-content {
				display: grid;
				position: relative;
				background-color: var(--modal_content_bg, #fefefe);
				margin: auto;
				top: 3.5vh;
				padding: 0;
				width: 80%;
				max-width: 100%;
				min-width: 15rem;
				max-height: 93.5vh;
				box-shadow: var(--modal_content_shadow, 0 4px 8px 0 rgba(0,0,0,0.2), 0 6px 20px 0 rgba(0,0,0,0.19));
				font-size: inherit;
				border-radius: var(--modal_radius, 7px);
				overflow: auto;
				resize: auto;
				z-index: 2;
			}
			@media screen and (max-width: 1024px) {
				.modal-content {
					width: 96%;
				}
			}
			.modal-content.center {
				position: absolute;
				left: 50%;
				top: 50%;
				transform: translate(-50%, -50%);
			}
			.dragging {
				cursor: move;
				user-select: none;
				-moz-user-select: none;
				-webkit-user-select: none;
			}

			@-webkit-keyframes animatetop {
				from {top:-300px; opacity:0}
				to {top:0; opacity:1}
			}
			@keyframes animatetop {
				from {top:-300px; opacity:0}
				to {top:0; opacity:1}
			}

			.mini_modal {
				color: var(--modal_btn_color, white);
				font-size: 1.75rem;
				font-weight: bold;
				position: absolute;
				top: 0.1rem;
				right: 2.75rem;
				z-index: 3;
			}
			.mini_modal:hover,
			.mini_modal:focus {
				color: var(--modal_btn_hover_color, #000);
				text-decoration: none;
				cursor: pointer;
			}

			.close_modal {
				color: var(--modal_btn_color, white);
				font-size: 1.75rem;
				font-weight: bold;
				position: absolute;
				top: 0.5rem;
				right: 0.75rem;
				z-index: 3;
			}
			.close_modal:hover,
			.close_modal:focus {
				color: var(--modal_btn_hover_color, #000);
				text-decoration: none;
				cursor: pointer;
			}

			.modal-header {
				position: sticky;
				top: 0;
				z-index: 4;
				background-color: var(--modal_header_bg, var(--color_orange_dedalo));
				color: var(--modal_header_color, var(--color_white));
				box-shadow: var(--modal_header_shadow, 0 2px 3px var(--color_grey_10));
			}

			.modal-body {
			}

			.modal-footer {
				margin-top: 1.5rem;
			}

			.modal_big {
				padding: 0;
				z-index: 9999;
			}
			.modal_big > .modal-content {
				width: 97vw;
				height: 97vh;
				overflow: auto;
			}

			.modal_small {
				padding: 0;
				z-index: 9999;
			}
			.modal_small > .modal-content {
				width: fit-content;
				max-width: 32vw;
				height: auto;
				margin-top: 20vh;
				overflow: auto;
			}
			@media screen and (max-width: 1024px) {
				.modal_small > .modal-content {
					max-width: unset;
				}
			}

			.mini {
				position: fixed;
				z-index: 9999;
				width: 15rem;
				height: 60px;
				overflow: hidden;
				left: unset;
				top: unset;
				right: 5px;
				margin: 0;
				background: none;
			}
			.mini > .modal-content {
				margin: 0;
				box-shadow: none;
				overflow: hidden;
				position: relative;
				width: 15rem;
				height: 60px;
				display: contents;
			}
			.mini > .modal-body, .mini > .modal-footer {
				display: none;
			}
			.mini .mini_modal {
				position: absolute;
				right: 10px;
				top: -8px;
			}
			.mini .close_modal {
				right: 0;
				display: none;
			}

			/* (!) See layout.less -> dd-modal for more styles of current element */
		</style>
		<div class="modal" part="overlay">
			<div class="modal-content draggable" part="content">
				<div class="modal-header dragger" part="header">
					<span class="mini_modal">_</span>
					<span class="close_modal">&times;</span>
					<slot name="header" class="header">Modal box default header</slot>
				</div>
				<div class="modal-body" part="body">
					<slot name="body">Modal box default body</slot>
				</div>
				<div class="modal-footer" part="footer">
					<slot name="footer">Modal box default footer</slot>
				</div>
			</div>
		</div>
		`;
	}

	/**
	 * CONNECTEDCALLBACK
	 * Standard custom-element lifecycle hook, called when the element is inserted
	 * into the document. Caches shadow DOM references, attaches all event listeners,
	 * and registers this instance in the global modal stack.
	 *
	 * Event listeners are attached here (not in the constructor) because the
	 * shadow DOM nodes are available but the element is not yet in a live document
	 * during construction — document-level listeners should not be active then.
	 *
	 * Modal stack registration:
	 *   window.modal_stack is created on first use. The window.modal getter is
	 *   (re-)defined as configurable each time so it always points to the current
	 *   topmost entry. The setter is a no-op to silently absorb legacy assignments.
	 */
	connectedCallback() {
		// Cache shadow DOM references used across multiple methods.
		this._modal			= this.shadowRoot.querySelector(".modal");
		this.modal_content	= this.shadowRoot.querySelector(".modal-content");

		// Attach shadow-internal button and overlay listeners.
		this.shadowRoot.querySelector(".mini_modal").addEventListener('mousedown', this._boundMiniModal);
		this.shadowRoot.querySelector(".close_modal").addEventListener('mousedown', this._boundHideModal);
		this._modal.addEventListener('mousedown', this._boundOverlayClick);

		// Keyboard (Escape) and drag listeners are document-level because they must
		// fire regardless of where focus or the pointer currently is.
		document.addEventListener('keyup', this._boundDetectKey);
		document.addEventListener('mousemove', this._boundMousemove);
		document.addEventListener('mouseup', this._boundMouseup);

		const header = this.shadowRoot.querySelector(".modal-header");
		header.addEventListener('mousedown', this._boundHeaderMousedown);

		// Register in global stack so Escape always targets the topmost modal.
		if (!window.modal_stack) window.modal_stack = [];
		window.modal_stack.push(this);

		// (!) Redefine window.modal as a getter every time a new modal mounts.
		// configurable:true ensures subsequent definitions don't throw.
		Object.defineProperty(window, 'modal', {
			get : () => window.modal_stack?.[window.modal_stack.length - 1] || null,
			set : () => {},
			configurable : true
		});
	}

	/**
	 * DISCONNECTEDCALLBACK
	 * Standard custom-element lifecycle hook, called when the element is removed
	 * from the document. Removes all event listeners (using the same bound
	 * references stored in connectedCallback) and removes this instance from
	 * window.modal_stack.
	 *
	 * Guards are applied to .mini_modal and .modal-header because remove_miniModal()
	 * may have already detached those nodes before disconnection.
	 */
	disconnectedCallback() {
		// .mini_modal may have been removed by remove_miniModal(); guard before de-registering.
		const mini_modal = this.shadowRoot.querySelector(".mini_modal");
		if (mini_modal) {
			mini_modal.removeEventListener('mousedown', this._boundMiniModal);
		}
		this.shadowRoot.querySelector(".close_modal").removeEventListener('mousedown', this._boundHideModal);
		this._modal.removeEventListener('mousedown', this._boundOverlayClick);
		document.removeEventListener('keyup', this._boundDetectKey);
		document.removeEventListener('mousemove', this._boundMousemove);
		document.removeEventListener('mouseup', this._boundMouseup);

		const header = this.shadowRoot.querySelector(".modal-header");
		if (header) {
			header.removeEventListener('mousedown', this._boundHeaderMousedown);
		}

		// Remove from global stack so Escape no longer targets this closed modal.
		if (window.modal_stack) {
			const idx = window.modal_stack.indexOf(this);
			if (idx > -1) window.modal_stack.splice(idx, 1);
		}
	}

	/**
	 * ATTRIBUTECHANGEDCALLBACK
	 * Observed attribute: data-size. Fires when the attribute is set or changed on
	 * the element, even before connectedCallback (in which case this._modal is not
	 * yet set — the guard ensures no-op in that window).
	 * Delegates to the appropriate _showModal* size variant.
	 * @param {string} name - attribute name (always 'data-size' given observedAttributes)
	 * @param {string|null} oldVal - previous attribute value
	 * @param {string|null} newVal - new attribute value ('big'|'small'|anything else → normal)
	 */
	attributeChangedCallback(name, oldVal, newVal) {
		if (name === 'data-size' && this._modal) {
			if (newVal === 'big') {
				this._showModalBig();
			} else if (newVal === 'small') {
				this._showModalSmall();
			} else {
				this._showModal();
			}
		}
	}

	/**
	 * _SHOWMODAL
	 * Shows the modal at normal size (80% width, centered via CSS margin:auto).
	 * Removes any .modal_big class that may have been applied by a previous call to
	 * _showModalBig(), ensuring the size reverts cleanly when switching modes.
	 * Sets _modalVisible to true so callers can query visibility state.
	 */
	_showModal() {
		this._modalVisible = true;
		this._modal.classList.add('modal_show');
		if (this._modal.classList.contains("modal_big")) {
			this._modal.classList.remove("modal_big");
		}
	}

	/**
	 * _SHOWMODALBIG
	 * Shows the modal at full viewport size (97vw × 97vh) by applying .modal_big
	 * to the shadow .modal overlay.
	 *
	 * If a light-DOM child `iframe.fixed` is present (e.g. an embedded diffusion
	 * preview), its top padding is adjusted by the actual rendered height of the
	 * `[slot="header"]` element minus a 22 px correction so the iframe content
	 * sits below the sticky header without overlap. Falls back to 0 if no header.
	 */
	_showModalBig() {
		this._modalVisible = true;
		this._modal.classList.add('modal_show');
		this._modal.classList.add("modal_big");

		const iframe = this.querySelector("iframe.fixed");
		if (iframe) {
			const header			= this.querySelector(".header");
			const padding_top	= header ? header.offsetHeight - 22 : 0;
			iframe.style.paddingTop = padding_top + 'px';
		}
	}

	/**
	 * _SHOWMODALSMALL
	 * Shows the modal at compact size (fit-content width, max 32vw, auto height,
	 * positioned 20vh from the top) by applying .modal_small.
	 * Also removes any .modal_big class so the two size modifiers don't coexist.
	 * On narrow viewports (≤ 1024 px) the max-width constraint is lifted via media
	 * query in the template style so the small modal still fits the screen.
	 */
	_showModalSmall() {
		this._modalVisible = true;
		this._modal.classList.add('modal_show');
		this._modal.classList.add('modal_small');
		if (this._modal.classList.contains('modal_big')) {
			this._modal.classList.remove('modal_big');
		}
	}

	/**
	 * OPEN
	 * Public entry point to display the modal. Routes to the appropriate private
	 * _showModal* variant based on `type`. Callers that set the `data-size` attribute
	 * on the element trigger the same path through attributeChangedCallback; `open()`
	 * is the imperative alternative for code-only callers.
	 * @param {string} type - size variant: 'big' | 'small' | (any other → 'normal')
	 */
	open(type) {
		switch(type) {
			case 'big':		return this._showModalBig();
			case 'small':	return this._showModalSmall();
			default:		return this._showModal();
		}
	}

	/**
	 * _HIDEMODAL
	 * Shared mousedown handler used for both the '×' close button and the
	 * semi-transparent overlay. Stops event propagation to prevent the click
	 * from reaching parent components, then delegates to _closeModal().
	 *
	 * When triggered by .close_modal (the '×' button), the mini flag is cleared
	 * first so the unsaved-data guard in _closeModal is not short-circuited.
	 * When triggered by .modal (the overlay), the modal closes only if the click
	 * hit the overlay directly — clicks on modal-content bubble up to .modal but
	 * e.target will be the content element, not .modal, so they are ignored.
	 * @param {MouseEvent} e - the mousedown event
	 */
	_hideModal(e) {
		if (e.target.matches('.close_modal')) {
			e.stopPropagation();
			this.mini = false;
		}
		if (e.target.matches('.modal') || e.target.matches('.close_modal')) {
			e.stopPropagation();
			this._closeModal();
		}
	}

	/**
	 * _MINIMODAL
	 * Toggles minimized strip mode for this modal. When minimizing, the .mini
	 * class is applied to the shadow .modal and to the light-DOM header slot
	 * element (so slot-projected header styles can also react), and the mini
	 * flag is set to true. When restoring, the class and flag are removed.
	 *
	 * Stack positioning: after minimizing, ALL currently mounted dd-modal elements
	 * are queried from the document and their `style.bottom` is recomputed so that
	 * minimized strips stack vertically at the bottom-right without overlapping.
	 * Each strip is 60 px tall with a 5 px gap; position formula:
	 *   bottom = (60 * i) + (5 * i + 5)
	 * This is applied unconditionally to all modals (not just minimized ones),
	 * which is intentional — fully visible modals are unaffected because .mini
	 * is the only class that makes `position:fixed; bottom:…` take effect.
	 *
	 * (!) A minimized modal returns true from _closeModal without checking unsaved
	 * data, so the user must first restore it before closing.
	 * @param {MouseEvent} e - the mousedown event (expected target: .mini_modal)
	 */
	_miniModal(e) {
		e.stopPropagation();
		if (e.target.matches('.mini_modal')) {

			if (this.mini) {
				this.shadowRoot.querySelector('.modal').classList.remove('mini');
				const header = this.querySelector("[slot='header']");
				if (header) header.classList.remove('mini');
				this.mini = false;

			}else{
				this.shadowRoot.querySelector('.modal').classList.add('mini');
				const header = this.querySelector("[slot='header']");
				if (header) header.classList.add('mini');
				this.mini = true;

				// Restack all open modals at the bottom-right so their minimized
				// strips do not overlap. 60 px height + 5 px gap per slot.
				const items = document.querySelectorAll('dd-modal');
				if (items.length > 0) {
					let offset = 60;
					for (let i = 0; i < items.length; i++) {
						const el = items[i];
						const bottom = parseInt((offset * i)) + (5 * i + 5);
						const modal = el.shadowRoot.querySelector('.modal');
						modal.style.bottom = bottom + "px";
					}
				}
			}
		}
	}

	/**
	 * _CLOSEMODAL
	 * Core async close sequence. Performs the following steps in order:
	 *
	 *   1. Guard: if the modal is minimized (this.mini === true), return true
	 *      immediately — minimized modals cannot be closed without restoring first.
	 *   2. Unsaved-data check: awaits check_unsaved_data(), which shows a
	 *      browser confirm dialog if any component in the page has pending changes.
	 *      Returns false without closing if the user cancels.
	 *   3. Hide: removes .modal_show from the shadow .modal and sets _modalVisible
	 *      to false.
	 *   4. publish_close callback: if set, called with (this) to fire the
	 *      'modal_close' event through event_manager for any subscribers.
	 *   5. on_close callback: if set, called with (this); also destroys the
	 *      autocomplete service (service_autocomplete.destroy) when present to
	 *      prevent stale dropdown overlays after the modal is gone.
	 *
	 * @returns {Promise<boolean>} true when the modal was successfully closed,
	 *   false when the user cancelled the unsaved-data prompt
	 */
	async _closeModal() {

		// A minimized modal is not closed — the user must restore it first.
		if (this.mini) {
			return true;
		}

		// Prompt the user if there are unsaved changes anywhere on the page.
		// check_unsaved_data resolves to false if the user clicks "cancel".
		const result = await check_unsaved_data({
			confirm_msg : 'dd-modal: ' + (get_label.discard_changes || 'Discard unsaved changes?')
		});
		if (!result) {
			return false;
		}

		this._modalVisible = false;
		this._modal.classList.remove('modal_show');

		// publish_close runs before on_close so event subscribers see the close
		// before the caller's own teardown logic fires.
		if (typeof this.publish_close === "function") {
			this.publish_close(this);
		}

		if (typeof this.on_close === 'function') {
			this.on_close(this);
			// Destroy the autocomplete overlay if one is open; leaving it alive
			// after the modal closes would leave a stale dropdown in the page.
			if (window.page_globals?.service_autocomplete) {
				window.page_globals.service_autocomplete.destroy(true, true, true);
			}
		}

		return true;
	}

	/**
	 * CLOSE
	 * Public alias for _closeModal(). Exposed so external callers can close
	 * the modal programmatically with the same unsaved-data guard as UI triggers.
	 * @returns {Promise<boolean>} resolves to true on success, false if cancelled
	 */
	close() {
		return this._closeModal();
	}

	/**
	 * DETECT_KEY
	 * Document-level keyup handler. Closes the topmost modal on Escape (keyCode 27).
	 * Only one modal is closed per keypress — the last entry in window.modal_stack —
	 * so stacked modals are dismissed one at a time, outermost last.
	 * preventDefault() suppresses any browser default behavior tied to Escape
	 * (e.g. cancelling fullscreen or stopping page load).
	 * @param {KeyboardEvent} e - the keyup event from document
	 */
	detect_key(e) {
		if (e.keyCode === 27 && window.modal_stack?.length > 0) {
			e.preventDefault();
			const top_modal = window.modal_stack[window.modal_stack.length - 1];
			// Each modal instance registers its own document keyup listener, so on a
			// single Escape every listener runs. Act only from the top modal's own
			// listener to avoid N concurrent _closeModal() calls on the same modal.
			top_modal._closeModal();
			return;
		}
	}

	/**
	 * GET_MODAL_NODE
	 * Returns the shadow .modal <div>, which is the full-screen overlay container.
	 * Used by callers that need to manipulate the overlay directly (e.g. removing
	 * the semi-transparent background by adding .remove_overlay).
	 * @returns {HTMLElement} the .modal shadow element
	 */
	get_modal_node() {
		return this._modal;
	}

	/**
	 * GET_MODAL_CONTENT
	 * Returns the shadow .modal-content <div>, which is the visible dialog box
	 * (contains header, body, footer). Callers use this to append custom content
	 * outside of the named-slot mechanism, or to inspect dialog dimensions.
	 * @returns {HTMLElement} the .modal-content shadow element
	 */
	get_modal_content() {
		return this.shadowRoot.querySelector(".modal-content");
	}

	/**
	 * _ONHEADERMOUSEDOWN
	 * Initiates drag mode when the user presses down inside .modal-header.
	 *
	 * Position pinning (first drag only):
	 *   CSS centers the dialog via `margin:auto` and `top:3.5vh`. Drag code reads
	 *   `style.left` / `style.top` as pixel offsets, which are empty strings until
	 *   set inline. Without pinning, the first drag jump would be large. The fix:
	 *   read the current rendered rect, convert to parent-relative pixels, set them
	 *   as inline styles, then switch `position` to `absolute` and clear `margin`.
	 *   The `.center` class is also removed so its `transform:translate` does not
	 *   shift the element away from the pinned position.
	 *
	 * Dragger detection uses e.composedPath() to walk the shadow+light DOM event
	 * path. The walk looks for a .dragger ancestor first, then checks whether the
	 * next ancestor is .draggable. This allows nested interactive elements inside
	 * the header to opt out of dragging (clicks on buttons inside the header will
	 * not find a .draggable after the .dragger boundary).
	 *
	 * drag_data is populated when a valid drag target is found:
	 *   target     — the .modal-content element to move
	 *   x / y      — cursor position minus current element offset (used in mousemove)
	 *   margin_left/top — computed margins for boundary clamping in mousemove
	 *
	 * @param {MouseEvent} e - the mousedown event from the .modal-header
	 */
	_onHeaderMousedown(e) {
		// Pin current rendered position to inline styles before drag starts.
		// Without this, the modal jumps because CSS positions it (margin: auto, top: 3.5vh)
		// but the drag offset calc reads empty inline style.left/top as 0.
		if (!this.modal_content.style.left || !this.modal_content.style.top) {
			const rect = this.modal_content.getBoundingClientRect();
			const parentRect = this.modal_content.parentElement.getBoundingClientRect();

			// Pin current position
			this.modal_content.style.left = (rect.left - parentRect.left) + 'px';
			this.modal_content.style.top = (rect.top - parentRect.top) + 'px';

			// Remove margins, centering and set absolute position to prevent jumps
			// and ensure drag offsets are relative to the modal container.
			this.modal_content.style.position = 'absolute';
			this.modal_content.style.margin = '0';
			this.modal_content.classList.remove('center');
		}

		const path = e.composedPath();
		let clickedDragger = false;
		// bound the loop by path.length and skip nodes without classList (document,
		// window, text nodes): relying solely on `path[i] !== document` can run off
		// the end and dereference undefined.classList if document is not in the path.
		for (let i = 0; path[i] !== document; i++) {
			if (path[i].classList.contains('dragger')) {
				clickedDragger = true;
			}
			else if (clickedDragger === true && path[i].classList.contains('draggable')) {
				this.drag_data.target = path[i];
				this.drag_data.target.classList.add('dragging');
				this.drag_data.x = e.clientX - (parseInt(this.drag_data.target.style.left, 10) || 0);
				this.drag_data.y = e.clientY - (parseInt(this.drag_data.target.style.top, 10) || 0);

				const compStyles			= window.getComputedStyle(this.drag_data.target);
				this.drag_data.margin_left	= parseInt(compStyles.getPropertyValue('margin-left')) || 0;
				this.drag_data.margin_top	= parseInt(compStyles.getPropertyValue('margin-top')) || 0;

				return;
			}
		}
	}

	/**
	 * MOUSEMOVE
	 * Document-level mousemove handler. Translates the dragged .modal-content by
	 * updating its inline `style.left` and `style.top` based on the cursor position
	 * and the offset recorded in drag_data at mousedown.
	 *
	 * After each move, the element's bounding rect is compared to the parent's
	 * (the .modal overlay, which is full-screen) and clamped so the dialog cannot
	 * be dragged fully outside the viewport. Margin values from drag_data are
	 * subtracted from the clamped boundaries to account for any residual computed
	 * margins on .modal-content.
	 *
	 * No-ops if drag_data.target is null (no drag in progress).
	 * @param {MouseEvent} e - the mousemove event from document
	 */
	mousemove(e) {
		if (!this.drag_data || !this.drag_data.target) {
			return;
		}

		this.drag_data.target.style.left	= e.clientX - this.drag_data.x + 'px';
		this.drag_data.target.style.top		= e.clientY - this.drag_data.y + 'px';

		const pRect		= this.drag_data.target.parentElement.getBoundingClientRect();
		const tgtRect	= this.drag_data.target.getBoundingClientRect();
		if (tgtRect.left < pRect.left) {
			this.drag_data.target.style.left = (0 - this.drag_data.margin_left) + 'px';
		}
		if (tgtRect.top < pRect.top) {
			this.drag_data.target.style.top = (0 - this.drag_data.margin_top) + 'px';
		}
		if (tgtRect.right > pRect.right) {
			this.drag_data.target.style.left = (pRect.width - tgtRect.width - this.drag_data.margin_left) + 'px';
		}
		if (tgtRect.bottom > pRect.bottom) {
			this.drag_data.target.style.top = (pRect.height - tgtRect.height - this.drag_data.margin_top - 1) + 'px';
		}
	}

	/**
	 * MOUSEUP
	 * Document-level mouseup handler. Ends the current drag session by removing the
	 * .dragging class from the target (which restores the default cursor and
	 * re-enables text selection) and clearing drag_data.target so that subsequent
	 * mousemove events are no-ops.
	 * @param {MouseEvent} e - the mouseup event from document
	 */
	mouseup(e) {
		if (this.drag_data.target) {
			this.drag_data.target.classList.remove('dragging');
		}
		this.drag_data.target = null;
	}

	/**
	 * REMOVE_MINIMODAL
	 * Permanently removes the '_' minimize button from the Shadow DOM. Used when
	 * the caller decides that a particular modal instance should not be minimizable
	 * (e.g. blocking confirmation dialogs). The disconnectedCallback guard ensures
	 * that the removed node does not cause an error when de-registering its listener.
	 * After this call, _miniModal will never fire for this instance.
	 */
	remove_miniModal() {
		const mini_modal = this.shadowRoot.querySelector(".mini_modal");
		if (mini_modal) mini_modal.remove();
	}
}
customElements.define('dd-modal', DDModal);
}//end if (typeof HTMLElement!=='undefined')

// @license-end
