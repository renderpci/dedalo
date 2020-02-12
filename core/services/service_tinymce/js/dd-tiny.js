class DDTiny extends HTMLElement {
	constructor() {
		super();
		this.options
		this.editor
		this.attachShadow({ mode: 'open' })
		this.shadowRoot.innerHTML = `
			<style>
			</style>
			<slot>Editor ${this.id}</slot>
		`;
	}
	connectedCallback() {
		this._init_editor()
	}
	disconnectedCallback() {
		// removes tinymce instance from memory
		this.editor.destroy()
	}
	_init_editor() {
		// console.log("this.options:",this.options);
		const self = this

		// options params
			const value = this.options.value

		// textarea base element
			const textarea = document.createElement('textarea')
				  textarea.innerHTML = value
				  this.appendChild(textarea)

		// tinymce editor init
			tinymce.init({
				// target . node element base for build editor
				target 				   	: textarea,
				// cache_suffix. Force remove chache when version changes
				cache_suffix			: "?"+page_globals.dedalo_version,
				// plugins. Tiny plugins custom array
				plugins 				: this.options.plugins,
				// toolbar. Editor buttons to show in toolbar
				toolbar 				: this.options.toolbar,
				// toolbar_items_size. Set toolbar buttons size
				toolbar_items_size 		: this.options.toolbar_items_size || 'small',
				// menubar. specify which menus should appear and the order that they
				// appear in the menu bar at the top of editor
				menubar 				: this.options.menubar || false,
				// statusbar. allows you to specify whether or not TinyMCE should
				// display the status bar at the bottom of the editor. (true|false)
				// statusbar 				: this.options.statusbar || false,
				// skin_url. enables you to specify the location of the skin file
				skin_url 				: this.options.skin_url
					|| DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/skins/lightgray",
				// theme_url. enables you to specify the location of the theme file
				theme_url 				: this.options.theme_url
					|| DEDALO_ROOT_WEB + "/lib/tinymce/js/tinymce/themes/modern/theme.min.js?" +page_globals.dedalo_version,
				// entity_encoding. Allows you to get XML escaped content out of TinyMCE.
				// By setting this option to xml, posted content will be converted to an XML
				// string escaping characters such as <, >, ", and & to <, >, ", and &.
				entity_encoding 		: 'raw',
				// forced_root_block. Enables you to make sure that any non block elements or text nodes are wrapped in block elements
				// If you set this option to false it will never produce p tags on enter, or,
				// automatically it will instead produce br elements and Shift+Enter will produce a p.
				forced_root_block 		: false,
				// width. Set the width of the editor in pixels
					// width 					: this.options.width || null,
				// height. sets the height of the editable area in pixels.
					// height 					: this.options.height || null,
				// content_css
				content_css 			: this.options.content_css
					|| DEDALO_CORE_URL + '/component_text_area/css/mce_editor_default.css?' + page_globals.dedalo_version,
				// body_class
				body_class 				: this.options.body_class || null,
				// relative_urls. If this option is set to true, all URLs returned from the MCFileManager will be relative from the specified
				// document_base_url. If it's set to false all URLs will be converted to absolute URLs.
				relative_urls 			: false,
				// convert_urls. enables you to control whether TinyMCE is to be smart and restore URLs to their original values.
				convert_urls 			: false,
				// browser_spellcheck. enables TinyMCE to use the browser's native spell checker.
				browser_spellcheck 		: this.options.browser_spellcheck || true,
				// schema. enables you to switch between the HTML4 and HTML5 schema
				schema 					: 'html5-strict',
				// setup. called whens editor setup
				setup 	 				: (editor) => {
					// call to function onsetup_editor to delegate the setup
			  		self.options.onsetup_editor(editor)
			  		// store instance link
					self.editor = editor
				},
				// callback. called when editor is ready
				init_instance_callback 	: (editor) => {
					// update dd-tiny element id with new editor id
			  		self.id = editor.id
				}
			})
	}
}
customElements.define('dd-tiny', DDTiny)

