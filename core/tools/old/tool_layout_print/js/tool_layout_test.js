




function get_page_template__DES() {
	
	var ar_pages 	 = $('.page'),
		html_content = ''

	$.each(ar_pages, function(index, val) {
		/* iterate through array or object */
		//val.remove( ".ui-resizable-handle" );
		//console.log(val)
		//console.log( $(val).html() )
		html_content += $(val)[0].outerHTML
	});

	console.log( html_content )

	return html_content;
}



