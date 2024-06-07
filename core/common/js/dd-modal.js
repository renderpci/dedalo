// @license magnet:?xt=urn:btih:0b31508aeb0634b347b8270c7bee4d411b5d4109&dn=agpl-3.0.txt AGPL-3.0
/*global Promise, page_globals, SHOW_DEBUG, get_label */



// imports
	import {check_unsaved_data} from '../../component_common/js/component_common.js'


if (typeof HTMLElement!=='undefined') {
class DDModal extends HTMLElement {
	constructor() {
		super();
		this._modalVisible = false;
		this.mini = false;
		this._modal;
		this.drag_data;
		// this.caller_instance;
		this.on_close;
		this.publish_close;
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
		<style>
			/* The Modal (background overlay)  */
				.modal {
					font-size: inherit;
					display: none;
					position: fixed;
					z-index: 4;
					/* padding-top: 80px; */
					left: 0;
					top: 0;
					width: 100%;
					height: 100%;
					background-color: rgba(0,0,0,0.4);
				}
				.remove_overlay {
					/* background-color: transparent !important; */
					background-color: rgba(0,0,0,0.075);
				}
				.modal_show {
					display: block;
				}

			/* Modal Content */
				.modal-content {
					display: grid;
					position: relative;
					background-color: #fefefe;
					margin: auto;
					top: 3.5vh;
					padding: 0;
					padding-bottom: 1.5rem;
					width: 80%;
					/*min-width: 390px;*/
					min-width: 15rem;
					max-height: 93.5vh;
					box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2),0 6px 20px 0 rgba(0,0,0,0.19);
					font-size: inherit;
					/* border: 1px solid #888; */
					border-radius: 7px;
					overflow: auto;
					resize: auto;
					z-index: 2;
					/*
					-webkit-animation-name: animatetop;
					-webkit-animation-duration: 0.4s;
					animation-name: animatetop;
					animation-duration: 0.4s;
					*/
					/*grid-template-rows: minmax(4rem, 4rem) auto minmax(4rem, 4rem);*/
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

			/* Add Animation */
				@-webkit-keyframes animatetop {
					from {top:-300px; opacity:0}
					to {top:0; opacity:1}
				}
				@keyframes animatetop {
					from {top:-300px; opacity:0}
					to {top:0; opacity:1}
				}

			/* Mini Button */
				.mini_modal {
					color: white;
					font-size: 1.75rem;
					font-weight: bold;
					position: absolute;
					top: 0.1rem;
					right: 2.75rem;
					z-index: 3;
				}
				.mini_modal:hover,
				.mini_modal:focus {
					color: #000;
					text-decoration: none;
					cursor: pointer;
				}

			/* Close Button */
				.close_modal {
					color: white;
					font-size: 1.75rem;
					font-weight: bold;
					position: absolute;
					top: 0.5rem;
					right: 0.75rem;
					z-index: 3;
				}
				.close_modal:hover,
				.close_modal:focus {
					color: #000;
					text-decoration: none;
					cursor: pointer;
				}

			/* modal header */
				.modal-header {
					position: sticky;
					top: 0;
					z-index: 2;
				}

			/* modal body */
				.modal-body {
					/*
					padding: 2px 16px;
					margin: 20px 2px;
					overflow: auto;
					*/
				}

			/* modal footer */
				.modal-footer {

				}

			/* modal_big version */
				.modal_big {
					padding: 0;
					z-index: 9999;
				}
				.modal_big > .modal-content {
					width: 97vw;
					height: 97vh;
					overflow: auto;
				}
				.modal_big .modal-body {
					/*
					height: 100%;
					min-height: 90vh;
					width: calc(100vw - 32px);
					min-height: 100vh;
					*/
				}

			/* modal_small version */
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
				.modal_small .modal-body {

				}

			/* modal mini version */
				.mini {
					position: fixed;
					z-index: 9999;
					width: 15rem;
					height: 60px;
					overflow: hidden;
					left: unset;
					top: unset;
					/* bottom: 5px; */
					right: 5px;
					margin: 0;
					background: none;
					/*position: relative;
					right: 0;*/
				}
				.mini > .modal-content {
					margin: 0;
					box-shadow: none;
					overflow: hidden;
					position: relative;
					width: 100%;
					right: 5px;
					bottom: 5px;
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
				.mini .header {

				}

			/* (!) See layout.less -> dd-modal fore more styles of current element */
		</style>
		<div class="modal">
			<div class="modal-content draggable">
				<div class="modal-header dragger" part="header">
					<span class="mini_modal">_</span>
					<span class="close_modal">&times;</span>
					<slot name="header" class="header">Modal box default header</slot>
				</div>
				<div class="modal-body" part="body">
					<slot name="body">Modal box default body<slot>
				</div>
				<div class="modal-footer" part="footer">
					<slot name="footer"><slot>
				</div>
			</div>
		</div>
		`
	}
	connectedCallback() {
		this._modal = this.shadowRoot.querySelector(".modal");
		// this.shadowRoot.querySelector("button").addEventListener('click', this._showModal.bind(this));
		this.shadowRoot.querySelector(".mini_modal").addEventListener('mousedown', this._miniModal.bind(this));
		this.shadowRoot.querySelector(".close_modal").addEventListener('mousedown', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").addEventListener('mousedown', this._hideModal.bind(this));
		document.addEventListener('keyup', this.detect_key)
		window.modal = this // fix modal in window for easy access to close

		this.modal_content = this.shadowRoot.querySelector(".modal-content")

		// draggable modal feature
			const self = this

			self.drag_data = {
				target		: null,
				x			: null,
				y			: null,
				margin_left	: null,
				margin_top	: null
			}

			// header is the drag area
			const header = this.shadowRoot.querySelector(".modal-header")
			header.addEventListener('mousedown', (e) => {

				// re-calculate the top style based on current position (centered case)
					if (this.modal_content.classList.contains('center')) {
						const modal_content_dimensions = this.modal_content.getBoundingClientRect()
						this.modal_content.style.top = modal_content_dimensions.top + 'px'
						this.modal_content.classList.remove('center')
					}

				const path = e.composedPath();

				let clickedDragger = false;
				for(let i = 0; path[i] !== document; i++) {

					if (path[i].classList.contains('dragger')) {
						// dragger is clicked (header)
						clickedDragger = true;
					}
					else if (clickedDragger===true && path[i].classList.contains('draggable')) {

						// draggable is set (all modal-content)
						self.drag_data.target = path[i];
						self.drag_data.target.classList.add('dragging');
						self.drag_data.x = e.clientX - self.drag_data.target.style.left.slice(0, -2);
						self.drag_data.y = e.clientY - self.drag_data.target.style.top.slice(0, -2);

						// this is calculated once, every time that user clicks on header
						// to get the whole container margin and use it as position offset
						const compStyles			= window.getComputedStyle(self.drag_data.target);
						self.drag_data.margin_left	= parseInt(compStyles.getPropertyValue('margin-left'))
						self.drag_data.margin_top	= parseInt(compStyles.getPropertyValue('margin-top'))

						return;
					}
				}
			});

			// mouseup
			document.addEventListener('mouseup', this.mouseup)

			// mousemove
			document.addEventListener('mousemove', this.mousemove)
	}
	disconnectedCallback() {
		// this.shadowRoot.querySelector("button").removeEventListener('click', this._showModal);

		// mini_modal. Note that mini_modal may have been removed
			const mini_modal = this.shadowRoot.querySelector(".mini_modal")
			if (mini_modal) {
				mini_modal.removeEventListener('mousedown', this._miniModal.bind(this));
			}
		this.shadowRoot.querySelector(".close_modal").removeEventListener('mousedown', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").removeEventListener('mousedown', this._hideModal.bind(this));
		document.removeEventListener('keyup', this.detect_key);
		document.removeEventListener('mouseup', this.mouseup);
		document.removeEventListener('mousemove', this.mousemove);
	}
	_showModal() {
		this._modalVisible = true;
		// this._modal.style.display = 'block';
		this._modal.classList.add('modal_show')
		if (this._modal.classList.contains("modal_big")) {
			this._modal.classList.remove("modal_big")
		}
	}
	_showModalBig() {
		this._modalVisible = true;
		// this._modal.style.display = 'block';
		this._modal.classList.add('modal_show')
		this._modal.classList.add("modal_big")

		// iframe. Fix iframe fixed position calculating padding based on header height
			const iframe = this.querySelector("iframe.fixed")
			if (iframe) {
				const header 	  = this.querySelector(".header")
				const padding_top = header.offsetHeight - 22
				iframe.style.paddingTop = padding_top + 'px';
			}
	}
	_showModalSmall() {
		this._modalVisible = true;
		// this._modal.style.display = 'block';
		this._modal.classList.add('modal_show')
		this._modal.classList.add('modal_small')
		if (this._modal.classList.contains('modal_big')) {
			this._modal.classList.remove('modal_big')
		}
	}
	_hideModal(e) {

		// force close always
		if (e.target.matches('.close_modal')) {
			e.stopPropagation();
			this.mini = false
		}
		// only click over base modal or button close are accepted
		if (e.target.matches('.modal') || e.target.matches('.close_modal')) {
			e.stopPropagation();
			this._closeModal()
		}
	}
	_miniModal(e) {
		e.stopPropagation();
		if (e.target.matches('.mini_modal')) {

			if (this.mini) {

				// already minified. un-minimize

				this.shadowRoot.querySelector('.modal').classList.remove('mini')
				// this.shadowRoot.querySelector(".header").classList.add('mini')
				const header = this.querySelector("[slot='header']")
				header.classList.remove('mini')
				this.mini = false

				// setTimeout(()=>{
				// 	const wrapper_page = document.querySelector('.wrapper.page')
				// 	wrapper_page.appendChild(this)
				// }, 2000)

			}else{

				// minimize

				this.shadowRoot.querySelector('.modal').classList.add('mini')
				// this.shadowRoot.querySelector(".header").classList.add('mini')
				const header = this.querySelector("[slot='header']")
				header.classList.add('mini')
				this.mini = true

				const items = document.querySelectorAll('dd-modal')
				if (items.length>0) {
					let offset = 60
					for (let i = 0; i < items.length; i++) {
						const el = items[i]
						// console.log("el:",el);

						// const elemRect = el.getBoundingClientRect()
						const bottom = parseInt((offset*i)) + (5*i+5)
						// console.log("bottom:",bottom);

						const modal = el.shadowRoot.querySelector('.modal')
						// console.log("modal:",modal);
						modal.style.bottom = bottom + "px";
					}
				}

				// const inspector_content_data = document.querySelector('.inspector_content_data')
				// inspector_content_data.appendChild(this)
			}
		}
	}
	async _closeModal() {

		if (this.mini) {
			return true
		}

		// unsaved_data check
			/* OLD WAY
				if (window.unsaved_data===true) {

					// check if the modified components is inside the modal
						let unsaved_component_data = false
						const components = this.querySelectorAll('.wrapper_component')
						if (components) {
							const components_length = components.length
							for (let i = 0; i < components_length; i++) {
								const item = components[i]
								if (item.classList.contains('modified')) {
									unsaved_component_data = true
									break
								}
							}
						}

					// if true, confirm exit by user
						if (unsaved_component_data===true) {
							if (!confirm(get_label.discard_changes || 'Discard unsaved changes?')) {
								return false
							}else{
								window.unsaved_data===false
							}
						}
				}
				*/
			// check_unsaved_data
				const result = await check_unsaved_data({
					confirm_msg : 'dd-modal: ' + (get_label.discard_changes || 'Discard unsaved changes?')
				})
				if (!result) {
					// user selects 'cancel' in dialog confirm. Stop navigation
					return false
				}


		this._modalVisible = false;
		this._modal.style.display = 'none';

		// exec publish_close callback (normally defined in ui)
			if (typeof this.publish_close==="function") {
				this.publish_close(this)
			}

		// exec optional on-close callback (normally defined in component caller)
			if (typeof this.on_close==='function') {
				this.on_close(this)
				// remove aux items
					if (window.page_globals.service_autocomplete) {
						window.page_globals.service_autocomplete.destroy(true, true, true)
					}
			}

		// remove caller instance if exists on close
			// if (this.caller_instance) {
			// 	// destroy recursively
			// 	this.caller_instance.destroy(true, true, true)

		// clean header
			const header = this.querySelector("[slot='header']")
			if (header) {
				header.remove()
			}

		// clean body
			const body = this.querySelector("[slot='body']")
			if (body) {
				body.remove()
			}

		// clean header
			const footer = this.querySelector("[slot='footer']")
			if (footer) {
				footer.remove()
			}


		return true
	}
	close() {
		// alias of _closeModal
		return this._closeModal()
	}
	/**
	* DETECT_KEY
	* Detect user keyup event and close modal when key is 'ESC'
	*/
	detect_key(e) {
		if (e.keyCode===27 && window.modal) {
			e.preventDefault()
			window.modal._closeModal()
			window.modal = null
			return
		}
	}
	get_modal_node() {
		return this._modal
	}
	get_modal_content() {
		return this.shadowRoot.querySelector(".modal-content")
	}
	mousemove(e) {

		const self = window.modal

		// no target case (mouse position changes but target is null or undefined)
			if (!self.drag_data || !self.drag_data.target) {
				return;
			}

		// re-position element based on mouse position
			self.drag_data.target.style.left	= e.clientX - self.drag_data.x + 'px';
			self.drag_data.target.style.top		= e.clientY - self.drag_data.y + 'px';

		// limit boundaries. take care of initial margin offset
			const pRect		= self.drag_data.target.parentElement.getBoundingClientRect();
			const tgtRect	= self.drag_data.target.getBoundingClientRect();
			if (tgtRect.left < pRect.left) {
				self.drag_data.target.style.left = (0 - self.drag_data.margin_left) + 'px';
			}
			if (tgtRect.top < pRect.top) {
				self.drag_data.target.style.top = (0 - self.drag_data.margin_top) + 'px';
			}
			if (tgtRect.right > (pRect.right)) {
				self.drag_data.target.style.left = (pRect.width - tgtRect.width - self.drag_data.margin_left) + 'px';
			}
			if (tgtRect.bottom > (pRect.bottom)) {
				self.drag_data.target.style.top = (pRect.height - tgtRect.height - self.drag_data.margin_top - 1) + 'px';
			}
	}
	mouseup(e) {
		const self = window.modal

		if (self.drag_data.target) {
			self.drag_data.target.classList.remove('dragging');
		}
		self.drag_data.target = null;
	}
	remove_miniModal() {
		this.shadowRoot.querySelector(".mini_modal").remove()
	}
}
customElements.define('dd-modal',DDModal);
}


// @license-end
