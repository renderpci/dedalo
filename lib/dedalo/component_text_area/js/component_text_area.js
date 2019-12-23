// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_text_area} from '../../component_text_area/js/render_component_text_area.js'
	//import '../../../prosemirror/dist/prosemirror.js';



export const component_text_area = function(){

	// element properties declare
		this.model
		this.tipo
		this.section_tipo
		this.section_id
		this.mode
		this.lang

		this.section_lang
		this.context
		this.data
		this.parent
		this.node
		this.id

	return true
}//end component_text_area



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_text_area.prototype.init 	 		= component_common.prototype.init
	component_text_area.prototype.build 		= component_common.prototype.build
	component_text_area.prototype.render 		= common.prototype.render
	component_text_area.prototype.refresh 		= common.prototype.refresh
	component_text_area.prototype.destroy 		= common.prototype.destroy

	// change data
	component_text_area.prototype.save 	 			= component_common.prototype.save
	component_text_area.prototype.change_value 		= component_common.prototype.change_value
	component_text_area.prototype.update_data_value	= component_common.prototype.update_data_value
	component_text_area.prototype.update_datum 		= component_common.prototype.update_datum

	// render
	component_text_area.prototype.list 			= render_component_text_area.prototype.list
	component_text_area.prototype.edit 			= render_component_text_area.prototype.edit
	component_text_area.prototype.edit_in_list	= render_component_text_area.prototype.edit
	component_text_area.prototype.search 		= render_component_text_area.prototype.search
	component_text_area.prototype.change_mode 	= component_common.prototype.change_mode



/**
* INIT_editor
* load the libraries and specific css
*/
component_text_area.prototype.init_editor = async function( editor ) {

	const self = this

	// prosemirror editor
		const editor_instance = await get_prosemirror(editor)


	return editor_instance
}//end init_editor



/**
* GET_PROSEMIRROR
*/
const get_prosemirror = async (editor) => {

	// load dependences js/css
		const load_promises = []

		const lib_js_file = DEDALO_ROOT_WEB + '/lib/prosemirror/dist/prosemirror.js'
		load_promises.push( common.prototype.load_script(lib_js_file) )
		//await common.prototype.load_script(lib_js_file)

		//const lib_js_file_require = DEDALO_ROOT_WEB + '/lib/prosemirror/dist/require-pm.js'
		//load_promises.push( common.prototype.load_script(lib_js_file_require) )
		//await load_promises.push( common.prototype.load_script(lib_js_file_require) )

		// const lib_js_file_index = DEDALO_ROOT_WEB + '/lib/prosemirror/dist/index.js'
		// load_promises.push( common.prototype.load_script(lib_js_file_index) )
		// //await common.prototype.load_script(lib_js_file_index)

		const lib_css_file = DEDALO_ROOT_WEB + '/lib/prosemirror/dist/css/editor.css'
		load_promises.push( common.prototype.load_style(lib_css_file) )

		await Promise.all(load_promises).then(async function(response){
			console.log("get_prosemirror load files response:",response);
		})

	// init
		// // source value base content
		// 	const mySchema = new ProseMirror.Schema({
		// 	  nodes: ProseMirror.addListNodes(ProseMirror.basicSchema.spec.nodes, "paragraph block*", "block"),
		// 	  marks: ProseMirror.basicSchema.spec.marks
		// 	})
		// 	const base_content = document.createElement("div")
		//  	base_content.innerHTML = "Patata <b>verde</b> y <i>roja</i>"

		// plugins
			const plugins = ProseMirror.exampleSetup({ schema: ProseMirror.basicSchema });

		// view
			const view = new ProseMirror.EditorView(editor, {
			    state: ProseMirror.EditorState.create({
			        schema: ProseMirror.basicSchema,
			        //doc: ProseMirror.DOMParser.fromSchema(mySchema).parse(base_content),
			        plugins: plugins
			    })
			});

	return view
}//end get_prosemirror


