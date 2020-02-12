class DDModal extends HTMLElement {
	constructor() {
		super();
		this._modalVisible = false;
		this._modal;
		this.caller_instance;
		this.on_close;
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
				-webkit-animation-name: animatetop;
				-webkit-animation-duration: 0.4s;
				animation-name: animatetop;
				animation-duration: 0.4s;
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
				font-size: 1.5em;
				font-weight: bold;
				position: relative;
    			top: -0.25em;
			}
			.close:hover,
			.close:focus {
				color: #000;
				text-decoration: none;
				cursor: pointer;
			}

			.modal-header {
				padding: 1em;
				background-color: #FF9800;
				color: white;
				font-weight: normal;
				font-size: 1.4em;
			}

			.modal-body {
				padding: 2px 16px;
				margin: 20px 2px;
				max-height: 80vh;
				overflow: auto;
			}

			button {
				display: none;
			}

			.modal_big {
				padding: 0;
				z-index: 9999;
			}
			.modal_big > .modal-content {
				width: 99.9%;
				height: 99.8%;
			}
			.modal_big .modal-body {
				height: 100%;
				/*max-height: 77vh;*/
				/*max-height: 88%;*/
			}
		</style>
		<button>Open Modal</button>
		<div class="modal">
			<div class="modal-content">
				<div class="modal-header">
					<span class="close">&times;</span>
					<slot name="header">Modal box default header</slot>
				</div>
				<div class="modal-body">
					<slot name="body">Modal box default body<slot>
				</div>
			</div>
		</div>
		`
	}
	connectedCallback() {
		this._modal = this.shadowRoot.querySelector(".modal");
		this.shadowRoot.querySelector("button").addEventListener('click', this._showModal.bind(this));
		this.shadowRoot.querySelector(".close").addEventListener('click', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").addEventListener('click', this._hideModal.bind(this));
	}
	disconnectedCallback() {
		this.shadowRoot.querySelector("button").removeEventListener('click', this._showModal);
		this.shadowRoot.querySelector(".close").removeEventListener('click', this._hideModal.bind(this));
		this.shadowRoot.querySelector(".modal").removeEventListener('click', this._hideModal.bind(this));
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
	}
	_hideModal(e) {
		e.stopPropagation();
		// only click over base modal or button close are aceppted
		if (e.target.matches('.modal') || e.target.matches('.close')) {

			// this._modalVisible = false;
			// this._modal.style.display = 'none';

			// // remove caller instance if exists on close
			// if (this.caller_instance) {
			// 	const destroyed = this.caller_instance.destroy(true, true, true)

			// 	// clean header
			// 	const header = this.querySelector("[slot='header']")
			// 	if (header) {
			// 		header.remove()
			// 	}
			// }

			this._closeModal()
		}
	}
	_closeModal() {

		this._modalVisible = false;
		this._modal.style.display = 'none';

		// exec optional on-close
			if (typeof this.on_close==="function") {
				this.on_close()
			}

		// remove caller instance if exists on close
			if (this.caller_instance) {
				// destroy recursivelly
				const destroyed = this.caller_instance.destroy(true, true, true)

				// clean header
				const header = this.querySelector("[slot='header']")
				if (header) {
					header.remove()
				}
			}
	}
}
customElements.define('dd-modal',DDModal);
