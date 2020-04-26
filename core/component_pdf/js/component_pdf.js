/*global get_label, page_globals, SHOW_DEBUG, DEDALO_CORE_URL*/
/*eslint no-undef: "error"*/



// imports
	import {common} from '../../common/js/common.js'
	import {component_common} from '../../component_common/js/component_common.js'
	import {render_component_pdf} from '../../component_pdf/js/render_component_pdf.js'



export const component_pdf = function(){

	this.id

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

	this.tools

	this.file_name
	this.file_dir

	return true
}//end component_pdf



/**
* COMMON FUNCTIONS
* extend component functions from component common
*/
// prototypes assign
	// lifecycle
	component_pdf.prototype.init 	 			= component_common.prototype.init
	//component_pdf.prototype.build 	 		= component_common.prototype.build
	component_pdf.prototype.render 				= common.prototype.render
	component_pdf.prototype.refresh 			= common.prototype.refresh
	component_pdf.prototype.destroy 	 		= common.prototype.destroy

	// change data
	component_pdf.prototype.save 	 			= component_common.prototype.save
	component_pdf.prototype.update_data_value	= component_common.prototype.update_data_value
	component_pdf.prototype.update_datum 		= component_common.prototype.update_datum
	component_pdf.prototype.change_value 		= component_common.prototype.change_value

	// render
	component_pdf.prototype.list 				= render_component_pdf.prototype.list
	component_pdf.prototype.edit 				= render_component_pdf.prototype.edit



/**
* BUILD
*/
component_pdf.prototype.build = async function(autoload=false) {

	const self = this

	// call generic component commom build
		const common_build = component_common.prototype.build.call(this, autoload);

	// fix the pfd.js viewer
		self.pdf_viewer 			= null
	// fix useful vars
		self.allowed_extensions 	= self.context.allowed_extensions
		self.default_target_quality = self.context.default_target_quality


	return common_build
}//end build_custom




/**
* GO_TO_PAGE
* called by the click into the tag (in component_text_area)
* the tag will send the ar_layer_id that it's pointing to
*/
component_pdf.prototype.go_to_page = async function(options) {

	const self = this
	// convert the tag dataset to 'real' object for manage it
	const page = JSON.parse(options.tag.dataset.data)
	// for every layer_id in the tag load the data from the DDBB
	self.pdf_viewer.page = page[0]

}//end go_to_page



/**
* GET_DATA_TAG
* Send the data_tag to the text_area when it need create a new tag
*/
component_pdf.prototype.get_data_tag = function(){

	const self = this
	const offset 		= self.data.value[0].offset
	const total_pages 	= self.pdf_viewer.pagesCount

	const data_tag = {
		type 			: 'page',
		tag_id 			: null,
		state 			: 'n',
		label 			: '',
		data 			: '',
		offset			: offset,
		total_pages 	: total_pages
	}

	return data_tag
}// end get_data_tag


///// don't used
function get_text(){

	const ar_text = self.pdf_viewer.pdfViewer.getPageView(8).textLayer.textContentItemsStr

	console.log("ar_text", ar_text);
	console.log("textDivs", self.pdf_viewer.pdfViewer.getPageView(8).textLayer.textDivs);
	console.log("textLayer", self.pdf_viewer.pdfViewer.getPageView(8).textLayer.textLayerDiv);
	console.log("outerText", self.pdf_viewer.pdfViewer.getPageView(8).textLayer.textLayerDiv.outerText);
	console.log("outerText", self.pdf_viewer.pdfViewer.getPageView(3).textLayer.textLayerDiv.outerText);
	const ar_divs = self.pdf_viewer.pdfViewer.getPageView(8).textLayer.textDivs

	let page_text 			= ''
	let previous_offsetTop 	= null
	const final_puntuation 	= ['.','!','?',':']
	const accents 			= ['\'','`','´','"','¨','’']
	let distance			= 0
	for (let i = 0; i < ar_divs.length; i++) {
		const currrent_div = ar_divs[i]
		if(previous_offsetTop === currrent_div.offsetTop){
			if(accents.includes(ar_text[i].slice(0,1))){
				page_text = page_text+ar_text[i]
			}else{
				page_text = page_text+' '+ar_text[i]
			}
		}else{
			if (final_puntuation.includes(page_text.slice(-1)) ||  final_puntuation.includes(page_text.slice(-2,-1)) ) {
				page_text = page_text +'\n'+ ar_text[i]
			}else{
				page_text = page_text + ' ' + ar_text[i]
			}
			previous_offsetTop = currrent_div.offsetTop
		}

		console.log("currrent_div.offsetTop:", currrent_div.offsetTop);
	}

	console.log("page_text", page_text);


	// const viewport = self.pdf_viewer.pdfViewer.getPageView(3).viewport
	//
	// const page2 = self.pdf_viewer.pdfViewer.getPageView(3).pdfPage
	// const text = page2.getTextContent({ normalizeWhitespace: true }).then(function (textContent) {
	// 	console.log("textContent", textContent);
	// 	textContent.items.forEach(function (textItem) {
	// 		console.log("textItem", textItem);
	//
	//
	// 		// const tx = self.pdf_js.Util.transform(
	// 		//   self.pdf_js.Util.transform(viewport.transform, textItem.transform),
	// 		//   [1, 0, 0, -1, 0, 0]
	// 		// );
	// 		//
	// 		// const style = textContent.styles[textItem.fontName];
	// 		//
	// 		// // adjust for font ascent/descent
	// 		// const fontSize = Math.sqrt((tx[2] * tx[2]) + (tx[3] * tx[3]));
	// 		//
	// 		// if (style.ascent) {
	// 		//   tx[5] -= fontSize * style.ascent;
	// 		// } else if (style.descent) {
	// 		//   tx[5] -= fontSize * (1 + style.descent);
	// 		// } else {
	// 		//   tx[5] -= fontSize / 2;
	// 		// }
	//
	// 			// adjust for rendered width
	// 			// if (textItem.width > 0) {
	// 			//   ctx.font = tx[0] + 'px ' + style.fontFamily;
	// 			//
	// 			//   const width = ctx.measureText(textItem.str).width;
	// 			//
	// 			//   if (width > 0) {
	// 			// 	//tx[0] *= (textItem.width * viewport.scale) / width;
	// 			// 	tx[0] = (textItem.width * viewport.scale) / width;
	// 			//   }
	// 			// }
	//
	// 		// const item = document.createElement('span');
	// 		// item.textContent = textItem.str;
	// 		// item.style.fontFamily = style.fontFamily;
	// 		// //item.style.transform = 'matrix(' + tx.join(',') + ')';
	// 		// item.style.fontSize = fontSize + 'px';
	// 		// item.style.transform = 'scaleX(' + tx[0] + ')';
	// 		// item.style.left = tx[4] + 'px';
	// 		// item.style.top = tx[5] + 'px';
	//
	// 	})
	// })

	// console.log("2222_extractText",self.pdf_viewer.pdfViewer.getPageView(3))

}


function getHightlightCoords() {
	const pageIndex = self.pdf_viewer.pdfViewer.currentPageNumber - 1;
	const page = self.pdf_viewer.pdfViewer.getPageView(pageIndex);
	const pageRect = page.canvas.getClientRects()[0];
	const selectionRects = window.getSelection().getRangeAt(0).getClientRects();
	const selection_text = window.getSelection().toString()
	const viewport = page.viewport;
	const selected = selectionRects.map(function (r) {
	  return viewport.convertToPdfPoint(r.left - pageRect.x, r.top - pageRect.y).concat(
	     viewport.convertToPdfPoint(r.right - pageRect.x, r.bottom - pageRect.y));
	});
	return {page: pageIndex, coords: selected};
}


function showHighlight(selected) {
	const pageIndex = selected.page;
	const page = self.pdf_viewer.pdfViewer.getPageView(pageIndex);
	const pageElement = page.canvas.parentElement;
	const viewport = page.viewport;
	selected.coords.forEach(function (rect) {
	  const bounds = viewport.convertToViewportRectangle(rect);
	  const el = document.createElement('div');
	  el.setAttribute('style', 'position: absolute; background-color: pink;' +
	    'left:' + Math.min(bounds[0], bounds[2]) + 'px; top:' + Math.min(bounds[1], bounds[3]) + 'px;' +
	    'width:' + Math.abs(bounds[0] - bounds[2]) + 'px; height:' + Math.abs(bounds[1] - bounds[3]) + 'px;');
	  pageElement.appendChild(el);
	});
}
