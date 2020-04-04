class DDModal extends HTMLElement {
	constructor() {
		super();
		this._modalVisible = false;
		this._modal;
		// this.caller_instance;
		this.on_close;
		this.publish_close;
		this.attachShadow({ mode: 'open' });
		this.shadowRoot.innerHTML = `
		<style>
			/* The Modal (background) */
			.modal {
				display: none;
				position: fixed;
				z-index: 2;
				padding-top: 80px;
				left: 0;
				top: 0;
				width: 100%;
				height: 100%;
				overflow: auto;
				background-color: rgba(0,0,0,0.4);
				font-size: inherit;
			}

			/* Modal Content */
			.modal-content {
				position: relative;
				background-color: #fefefe;
				margin: auto;
				padding: 0;
				border: 1px solid #888;
				width: 80%;
				box-shadow: 0 4px 8px 0 rgba(0,0,0,0.2),0 6px 20px 0 rgba(0,0,0,0.19);
				font-size: inherit;
				/*
				-webkit-animation-name: animatetop;
				-webkit-animation-duration: 0.4s;
				animation-name: animatetop;
				animation-duration: 0.4s;
				*/
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

			/* The Close Button */
			.close {
				color: white;
				float: right;
				font-size: 1.75em;
				font-weight: bold;
				position: relative;
    			top: 0.25em;
    			right: 0.5em;
    			z-index: 3;
			}
			.close:hover,
			.close:focus {
				color: #000;
				text-decoration: none;
				cursor: pointer;
			}

			.modal-header {
				/*padding: 1em;
				background-color: #FF9800;
				color: white;
				font-weight: normal;
				font-size: 1.4em;*/
			}
			.modal-body {
				padding: 2px 16px;
				margin: 20px 2px;
				overflow: auto;
			}
			.modal_big {
				padding: 0;
				z-index: 9999;
			}
			.modal_big > .modal-content {
				width: 99.79%;
				min-height: 99.8%;
			}
			.modal_big .modal-body {
				height: 100%;
			}
		</style>
		<div class="modal">
			<div class="modal-content">
				<div class="modal-header">
					<span class="close">&times;</span>
					<slot name="header" class="header">Modal box default header</slot>
				</div>
				<div class="modal-body">
					<slot name="body">Modal box default body<slot>
				</div>
				<div class="modal-footer">
					<slot name="footer"><slot>
				</div>
			</div>
		</div>
		`
	}
	connectedCallback() {
		this._modal = this.shadowRoot.querySelector(".modal");
		// this.shadowRoot.querySelector("button").addEventListener('click', this._showModal.bind(this));
		this.shadowRoot.querySelector(".close").addEventListener('click', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").addEventListener('click', this._hideModal.bind(this));
		document.addEventListener('keyup', this.detect_key)
		window.modal = this // fix modal in window for easy access to close
	}
	disconnectedCallback() {
		// this.shadowRoot.querySelector("button").removeEventListener('click', this._showModal);
		this.shadowRoot.querySelector(".close").removeEventListener('click', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").removeEventListener('click', this._hideModal.bind(this));
		document.removeEventListener('keyup', this.detect_key);
	}
	_showModal() {
		this._modalVisible = true;
		this._modal.style.display = 'block';
		if (this._modal.classList.contains("modal_big")) {
			this._modal.classList.remove("modal_big")
		}
	}
	_showModalBig() {
		this._modalVisible = true;
		this._modal.style.display = 'block';
		this._modal.classList.add("modal_big")

		// iframe. Fix iframe fixed position calculating padding based on header height
			const iframe = this.querySelector("iframe.fixed")
			if (iframe) {
				const header 	  = this.querySelector(".header")
				const padding_top = header.offsetHeight + "px"
				iframe.style.paddingTop = padding_top;
			}
	}
	_hideModal(e) {
		e.stopPropagation();
		// only click over base modal or button close are aceppted
		if (e.target.matches('.modal') || e.target.matches('.close')) {
			this._closeModal()
		}
	}
	async _closeModal() {

		this._modalVisible = false;
		this._modal.style.display = 'none';

		// exec publish_close callback (normally defined in ui)
			if (typeof this.publish_close==="function") {
				this.publish_close(this)
			}

		// exec optional on-close callback (normally defined in component caller)
			if (typeof this.on_close==="function") {
				this.on_close(this)
			}

		// remove caller instance if exists on close
			// if (this.caller_instance) {
			// 	// destroy recursivelly
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
		return this._closeModal()
	}
	/**
	* DETECT_KEY
	* Detect user keyup event and close modal when key is 'ESC'
	*/
	detect_key(e) {
		if (e.keyCode===27) {
			window.modal._closeModal()
			window.modal = null
			return
		}
	}
}
customElements.define('dd-modal',DDModal);
