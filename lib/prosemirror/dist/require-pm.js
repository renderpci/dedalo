
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
