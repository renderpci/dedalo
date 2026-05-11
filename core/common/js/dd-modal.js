// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global Promise, page_globals, SHOW_DEBUG, get_label */



// imports
	import {check_unsaved_data} from '../../component_common/js/component_common.js'



if (typeof HTMLElement!=='undefined') {
class DDModal extends HTMLElement {

	static get observedAttributes() {
		return ['data-size'];
	}

	constructor() {
		super();
		this._modalVisible = false;
		this.mini = false;
		this.on_close = null;
		this.publish_close = null;
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = this._template();

		this._boundHideModal	= this._hideModal.bind(this);
		this._boundMiniModal	= this._miniModal.bind(this);
		this._boundDetectKey	= this.detect_key.bind(this);
		this._boundMousemove	= this.mousemove.bind(this);
		this._boundMouseup		= this.mouseup.bind(this);
		this._boundOverlayClick	= this._hideModal.bind(this);
		this._boundHeaderMousedown	= this._onHeaderMousedown.bind(this);

		this.drag_data = {
			target		: null,
			x			: null,
			y			: null,
			margin_left	: null,
			margin_top	: null
		};
	}

	_template() {
		return `
		<style>
			:host {
				color-scheme: light dark;
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

	connectedCallback() {
		this._modal			= this.shadowRoot.querySelector(".modal");
		this.modal_content	= this.shadowRoot.querySelector(".modal-content");

		this.shadowRoot.querySelector(".mini_modal").addEventListener('mousedown', this._boundMiniModal);
		this.shadowRoot.querySelector(".close_modal").addEventListener('mousedown', this._boundHideModal);
		this._modal.addEventListener('mousedown', this._boundOverlayClick);
		document.addEventListener('keyup', this._boundDetectKey);
		document.addEventListener('mousemove', this._boundMousemove);
		document.addEventListener('mouseup', this._boundMouseup);

		const header = this.shadowRoot.querySelector(".modal-header");
		header.addEventListener('mousedown', this._boundHeaderMousedown);

		if (!window.modal_stack) window.modal_stack = [];
		window.modal_stack.push(this);

		Object.defineProperty(window, 'modal', {
			get : () => window.modal_stack?.[window.modal_stack.length - 1] || null,
			set : () => {},
			configurable : true
		});
	}

	disconnectedCallback() {
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

		if (window.modal_stack) {
			const idx = window.modal_stack.indexOf(this);
			if (idx > -1) window.modal_stack.splice(idx, 1);
		}
	}

	attributeChangedCallback(name, oldVal, newVal) {
		if (name === 'data-size' && this._modal) {
			this._modal.classList.remove('modal_big', 'modal_small');
			if (newVal === 'big') this._modal.classList.add('modal_big');
			if (newVal === 'small') this._modal.classList.add('modal_small');
		}
	}

	_showModal() {
		this._modalVisible = true;
		this._modal.classList.add('modal_show');
		if (this._modal.classList.contains("modal_big")) {
			this._modal.classList.remove("modal_big");
		}
	}

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

	_showModalSmall() {
		this._modalVisible = true;
		this._modal.classList.add('modal_show');
		this._modal.classList.add('modal_small');
		if (this._modal.classList.contains('modal_big')) {
			this._modal.classList.remove('modal_big');
		}
	}

	open(type) {
		switch(type) {
			case 'big':		return this._showModalBig();
			case 'small':	return this._showModalSmall();
			default:		return this._showModal();
		}
	}

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

	async _closeModal() {

		if (this.mini) {
			return true;
		}

		const result = await check_unsaved_data({
			confirm_msg : 'dd-modal: ' + (get_label.discard_changes || 'Discard unsaved changes?')
		});
		if (!result) {
			return false;
		}

		this._modalVisible = false;
		this._modal.classList.remove('modal_show');

		if (typeof this.publish_close === "function") {
			this.publish_close(this);
		}

		if (typeof this.on_close === 'function') {
			this.on_close(this);
			if (window.page_globals?.service_autocomplete) {
				window.page_globals.service_autocomplete.destroy(true, true, true);
			}
		}

		const header = this.querySelector("[slot='header']");
		if (header) header.remove();

		const body = this.querySelector("[slot='body']");
		if (body) body.remove();

		const footer = this.querySelector("[slot='footer']");
		if (footer) footer.remove();

		return true;
	}

	close() {
		return this._closeModal();
	}

	detect_key(e) {
		if (e.keyCode === 27 && window.modal_stack?.length > 0) {
			e.preventDefault();
			const top_modal = window.modal_stack[window.modal_stack.length - 1];
			top_modal._closeModal();
			return;
		}
	}

	get_modal_node() {
		return this._modal;
	}

	get_modal_content() {
		return this.shadowRoot.querySelector(".modal-content");
	}

	_onHeaderMousedown(e) {
		if (this.modal_content.classList.contains('center')) {
			const modal_content_dimensions = this.modal_content.getBoundingClientRect();
			this.modal_content.style.top = modal_content_dimensions.top + 'px';
			this.modal_content.classList.remove('center');
		}

		const path = e.composedPath();
		let clickedDragger = false;
		for (let i = 0; path[i] !== document; i++) {
			if (path[i].classList.contains('dragger')) {
				clickedDragger = true;
			}
			else if (clickedDragger === true && path[i].classList.contains('draggable')) {
				this.drag_data.target = path[i];
				this.drag_data.target.classList.add('dragging');
				this.drag_data.x = e.clientX - this.drag_data.target.style.left.slice(0, -2);
				this.drag_data.y = e.clientY - this.drag_data.target.style.top.slice(0, -2);

				const compStyles		= window.getComputedStyle(this.drag_data.target);
				this.drag_data.margin_left	= parseInt(compStyles.getPropertyValue('margin-left'));
				this.drag_data.margin_top	= parseInt(compStyles.getPropertyValue('margin-top'));

				return;
			}
		}
	}

	mousemove(e) {
		const self = window.modal_stack?.[window.modal_stack.length - 1];
		if (!self || !self.drag_data || !self.drag_data.target) {
			return;
		}

		self.drag_data.target.style.left	= e.clientX - self.drag_data.x + 'px';
		self.drag_data.target.style.top		= e.clientY - self.drag_data.y + 'px';

		const pRect		= self.drag_data.target.parentElement.getBoundingClientRect();
		const tgtRect	= self.drag_data.target.getBoundingClientRect();
		if (tgtRect.left < pRect.left) {
			self.drag_data.target.style.left = (0 - self.drag_data.margin_left) + 'px';
		}
		if (tgtRect.top < pRect.top) {
			self.drag_data.target.style.top = (0 - self.drag_data.margin_top) + 'px';
		}
		if (tgtRect.right > pRect.right) {
			self.drag_data.target.style.left = (pRect.width - tgtRect.width - self.drag_data.margin_left) + 'px';
		}
		if (tgtRect.bottom > pRect.bottom) {
			self.drag_data.target.style.top = (pRect.height - tgtRect.height - self.drag_data.margin_top - 1) + 'px';
		}
	}

	mouseup(e) {
		const self = window.modal_stack?.[window.modal_stack.length - 1];
		if (!self) return;

		if (self.drag_data.target) {
			self.drag_data.target.classList.remove('dragging');
		}
		self.drag_data.target = null;
	}

	remove_miniModal() {
		const mini_modal = this.shadowRoot.querySelector(".mini_modal");
		if (mini_modal) mini_modal.remove();
	}
}
customElements.define('dd-modal', DDModal);
}

// @license-end
