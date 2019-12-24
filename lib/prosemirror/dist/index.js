import "prosemirror.js"

/*
// Kludge to make requiring prosemirror core libraries possible. The
// PM global is defined by http://prosemirror.net/examples/prosemirror.js,
// which bundles all the core libraries.
function require(name) {
  let id = /^prosemirror-(.*)/.exec(name), mod = id && PM[id[1].replace(/-/g, "_")]
  	//console.log("id:",id);
  	//console.log("mod:",mod);
  if (!mod) throw new Error(`Library basic isn't loaded`)
  return mod
}

const {EditorState} = require("prosemirror-state")
const {EditorView} = require("prosemirror-view")
const {Schema, DOMParser} = require("prosemirror-model")
const {schema} = require("prosemirror-schema-basic")
const {addListNodes} = require("prosemirror-schema-list")
const {exampleSetup} = require("prosemirror-example-setup")
*/




// Mix the nodes from prosemirror-schema-list into the basic schema to
// create a schema with list support.
const mySchema = new Schema({
  nodes: addListNodes(schema.spec.nodes, "paragraph block*", "block"),
  marks: schema.spec.marks
})

const base_content = document.createElement("div")
	  base_content.innerHTML = "Patata <b>verde</b> y <i>roja</i>"

//const editor = typeof editor!=="undefined" ? editor
	console.log("editor:", editor);
	//	console.log("current_editor:",current_editor);

//window.view = new EditorView(document.querySelector("#editor"), {
window.view = new EditorView(editor, {
  state: EditorState.create({
    //doc: DOMParser.fromSchema(mySchema).parse(document.querySelector("#content")),
    doc: DOMParser.fromSchema(mySchema).parse(base_content),
    plugins: exampleSetup({schema: mySchema})
  })
})


