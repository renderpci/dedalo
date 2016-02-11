
$( document ).ready(function() {
/*
	//Set the drag JQUERY UI mode
    $(".draggable").draggable({
							//containment: "#"+page,
							scroll: false, 
							snap: true 
							}).resizable();
*/
/*
	tinymce.init({
	    selector: "div.editable_text",
	    cache_suffix: "?v="+page_globals.dedalo_version,
	    inline: true,
	    plugins: [
	        "advlist autolink lists link image charmap print preview anchor",
	        "searchreplace visualblocks code fullscreen",
	        "insertdatetime media table contextmenu paste"
	    ],
	    toolbar: "insertfile undo redo | styleselect | bold italic | alignleft aligncenter alignright alignjustify | bullist numlist outdent indent | link image"
	});
*/
});



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



