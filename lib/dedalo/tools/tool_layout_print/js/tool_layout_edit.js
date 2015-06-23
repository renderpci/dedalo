// EDIT MODE

/**
* DRAGGABLE dommready
* this JS use the HTML5 Drag and drop standar for select the coponets and drop to the pages,
* but use the JQUERY drag to move and resize, snap the components when it is into the page
*/

var newId = 1;
	
/*
* Drag Begin from the left column, only for components
*/
function dragStart(event, portal) {
    event.dataTransfer.setData("text/plain", event.target.id);
    event.dataTransfer.setData(String(portal), '');
    //event.dataTransfer.setData("section", "oh1");
    event.target.style.border = "2px dotted #6a7a60";
}

/*
* Drag End into the page
*/
function dragEnd(event) {
	//reset the border of the drag indication
    event.target.style.border = "none";
}

/*
* Drag overthe page
*/
function dragOver(event) {
	//console.log(event.dataTransfer.types);
	//Get the dataTransfer of the draged component
	var portal = event.dataTransfer.types;
	//Get the dataset tipo data-tipo of the target page
	var page_to_drop = event.target.dataset.tipo;
	//console.log(page_to_drop);

	for (var i = 0; i < portal.length; i++) {
		if(portal[i] == page_to_drop){
			//console.log(portal);
			//console.log(page_to_drop);
			event.preventDefault();
		}else if(portal[i]=='free_text' || page_to_drop == 'fixed_element'){
			event.preventDefault();
		}
	};
	
}

/*
* Drop the componet into the page
*/
function Drop(event) {

	//reset the border of the drag indication
	event.target.style.border = "none";
    event.preventDefault();
    //get the component data
    var data = event.dataTransfer.getData("text/plain");
    var data2 = event.dataTransfer.getData("text/html");
   // console.log(data2);
    //if the element drop is a free_text change the appendChild to the dom and change the id of the freetext(unique id)
    //else if the element is a component appendChild directly
    if(data == 'free_text'){
       
        orig_free_text 	= document.getElementById(data)
    	free_text 		= orig_free_text.cloneNode(true);
    	free_text.id 	= 'text'+(newId++);
    	free_text.removeAttribute("class");
    	free_text.setAttribute("class", "component_box");

    	//add the text to the pages_container div
		event.target.appendChild(free_text);
		free_text 	= document.getElementById(free_text.id)
		//console.log(free_text);

    	editor = free_text.querySelector(".editable_text")
		editor.id = free_text.querySelector(".editable_text").id+(newId);

    	//console.log(editor.id);

    	//text_editor.setAttribute("class", "editable_text");
    	tool_layout_print.init_editable_text(editor.id);

		free_text.querySelector(".drag_text_editor").style.display = "block";
		JQhandle = "div.drag_text_editor";
		JQalsoResize = "#"+editor.id;
		data = free_text.id;

		//console.log(JQalsoResize);
		

    }else{
    	event.target.appendChild(document.getElementById(data));
    	JQhandle = false;
    	JQalsoResize = false;
    }
    
    // get the page id
	var page = event.target.id;

	//console.log(event.target.classList[1]);
   //remove all the HTML5 standar into the component for change to the drag model of JQUERY
	$("#"+data).removeAttr("draggable ondragstart ondragend style");

	//Get the position of the target page into the DOM, the left and top posiotion of the page
	var parentOffset = $("#"+page).offset(); 
	//Return the component position into the page from the mouse event and the position of the page
	var posX = event.pageX - parentOffset.left;
	var posY = event.pageY - parentOffset.top;

	// litle correction into the pos Y of the mouse DON'T NECESARY
	//posY = posY- 50;

	var component = document.getElementById(data);

	switch(true){
		//set the Style of the component into the page and his postion relative to the page
		case (event.target.classList.contains('fixed')): 
			component.style.position ="absolute";
			component.style.left = posX+"px";
			component.style.top = posY+"px";
			break;
		//set the Style of the component into the page only when the page is a fluid page lassList[1] ==='fluid')
		case (event.target.classList.contains('fluid')):
			console.log(event.target.classList[1]);
			component.style.with = "100%";
			component.style.height = "auto";
			component.style.position ="absolute";
			component.style.left = posX+"px";
			component.style.top = posY+"px";
			component.className = component.className + " component_fluid";
			break;
	}
	
	//Set the drag JQUERY UI mode
    $("#"+data).draggable({
							containment: "#"+page,
							//revert: "invalid",
							handle: JQhandle,
							scroll: false, 
							snap: true 
							}).resizable(
							{containment:"#"+page}
							//{alsoResize: JQalsoResize}
							);
	/*	if(JQalsoResize){
		console.log(JQalsoResize);
		$(JQalsoResize).resizable();
	}*/

    //Select the close button of the component and set de display to block
    component.querySelector(".close").style.display = "block";

}
/*
* DragEnter the mouse with the compoente into the page
*/
function dragEnter(event) {
	//change to show the drop zone
    event.target.style.border = "6px dotted #a3a3a3";
}
/*
* DragLeave the mouse with the compoente out the page
*/
function dragLeave(event) {
	//reset the border of the drag indication
    event.target.style.border = "none";
}
/*
* returnLeft remove the componet from the page a send to the left column
*/
function returnLeft(component){
	//console.log(component);
	//select the id of the component
	var id = component.id;
	var parent = component.dataset.parent_section;

	//Remove the JQUERY UI drag mode to set HTML5 drag
	$("#"+id).draggable("destroy").resizable("destroy");
	$("#"+id).removeAttr("style");
	//Select the left div
	$left	= $( "#"+parent ).children( ".warp_components_display" );
	//console.log($left);
	//add the component to the left div
	$("#"+id).appendTo( $left )
	//add the standar HTML5 drag attributes to the component
	$("#"+id).attr({
		draggable:"true",
		ondragstart:"dragStart(event,'"+parent+"')",
		ondragend:"dragEnd(event)"
		});
	//Select the close button of the component and set de display to none
	console.log(component);
    component.querySelector(".close").style.display = "none";
}

function remove_free_text(close_text_box){
	//var pages 		= document.getElementsByClassName("page");

	page_id = close_text_box.parentNode.parentNode.id;
	page = document.getElementById(page_id);
	//Select the page id to remove
	var id = close_text_box.parentNode.id;
	

	//Select the page div to remove
	var delete_node 	= document.getElementById(id);

	//remove the close button from the DOM
	page.removeChild(delete_node);

}

function show_childrens_to_left(section){
	var section = document.getElementById(section);
	//console.log(section);
	components = section.childNodes;
	for (var i = 0; i < components.length; i++) {
		if(components[i].className == 'warp_components_display'){
			if(components[i].style.display == 'block'){
			 	components[i].style.display = 'none';
			}else{
	          	components[i].style.display = 'block';
			}
		}

	};
}

/*
* HEADER AND FOOTER
*/

//add header /footer to the DOM
function add_page_fixed_element(button,element){
	
	var pages 		= document.getElementsByClassName("page");
	
	if (pages.length<1) {
		return;
	};

	// put the button ADD_HEADER / ADD_FOOTER in desactive mode
	button.style.display = "none";

	var main_page = pages[0];

	var main_head = document.createElement("div");
	//set the attributes of the new page
	main_head.setAttribute("id", element);
	main_head.setAttribute("class", element + "_element");
	main_head.setAttribute("data-tipo", "fixed_element");
	/*
	main_head.setAttribute("ondrop", "Drop(event)");
	main_head.setAttribute("ondragover", "dragOver(event)");
	main_head.setAttribute("ondragenter", "dragEnter(event)");
	main_head.setAttribute("ondragleave", "dragLeave(event)");
	*/

	//create the close button of the new page
	var head_close_button = document.createElement("div");
	head_close_button.setAttribute("class", "close");
	head_close_button.setAttribute("onclick", "remove_page_fixed_element(this.parentNode,'"+element+"','inline-block')");

	//add the close button to the new page
	main_head.appendChild(head_close_button);
	//add the page to the pages_container div
	main_page.insertBefore(main_head, main_page.firstChild);
	// console.log(main_head);
	// console.log(main_page);

	if(element =='header'){
		direction = "s";
	}else{
		direction = "n";
	}
	$("#"+main_head.id).droppable();
	$("#"+main_head.id).droppable("disable").resizable({ containment:"#"+main_page.id, handles: direction})

}

//remove hearder / footer of the DOM

function remove_page_fixed_element(element_obj,element_name,show){
	//get the icon header/footer (the ADD_ICON into the top area)
	//console.log(element_name);
	icon_element = document.getElementsByClassName("warp_icon_"+element_name+"_button")[0]
	// put the button ADD_HEADER / ADD_FOOTER in desactive mode
	icon_element.style.display = show;
	//if the header is empty (the page with header is closed) return 
	if(!element_obj){
		return;
	}
	page_node = element_obj.parentNode;
	page_node.removeChild(element_obj);

}

/*
* loadPage load the pages and the componets from the postgres 
* asing the JQUERY drag to the components into the page and remove from the left column
*/
function loadPage(){
	//select the left column and his clindrens
	var left		= document.getElementById("left");
	//var components_to_remove = left.childNodes;
	//select the all pages
	var pages 		= document.getElementsByClassName("page");
	//loop the all pages
	for (var j = 0; j<pages.length; j++) {
		//select the components of the current page and his id
		var components 			= pages[j].childNodes;

		var current_page_id 	= pages[j].id;

		//loop of the components of the current page
		for (var i = 0; i<components.length; i++) {

			switch(true){
				case (components[i].id=='header'): 
					remove_page_fixed_element(false,'header','none');
					$("#"+components[i].id).draggable().resizable({ containment:"#"+current_page_id, handles: 's'});
					$("#"+components[i].id).draggable("disable");

					var components_loaded 	= components[i].querySelectorAll(".component_box");
					if(components_loaded.length < 0){
						break;
					}else{
						for (var h = 0; h<components_loaded.length;h++) {
							add_component_to_current_element(components_loaded[h].id, components[h].id);
						};
						break;
					}
				case (components[i].id=='footer'): 
					remove_page_fixed_element(false,'footer','none');
					$("#"+components[i].id).draggable().resizable({ containment:"#"+current_page_id, handles: 'n'});
					$("#"+components[i].id).draggable("disable")

					var components_loaded 	= components[i].querySelectorAll(".component_box");

					if(components_loaded.length < 0){
						break;
					}else{
						for (var f = 0; f<components_loaded.length;f++) {
							add_component_to_current_element(components_loaded[f].id, components[f].id);

						};
						break;
					}
				case (components[i].className=='page_title'):
					//console.log(components[i]);
					break;

				//case (components[i].classList.contains=='editable_text'):

				default:
				add_component_to_current_element(components[i].id, current_page_id)
				
			}
		};
	
	};

}

/*
* ADD COMPONENT TO THE PAGE
*/

function add_component_to_current_element(component_id, element_id){
	
	//prevent the components or elements without id
	if(component_id == ''){
		return;
	}
	//select of the current components and his id
	var component 	= document.getElementById(component_id);
	//Select the section parent of the component
	var parent		= component.dataset.parent_section;
	//select the left column and his clindrens
	left	= $( "#"+parent ).children( ".warp_components_display" )[0];
	
	//if the node don't have id (button_delete) don't remove
	if(component !=null){
		//remove from the leftcolum the current component in the page
		if (component.id.indexOf("text") < 0){
			left.removeChild(component);
			JQhandle = false;

		}else{
			newId++;
			//text_editor.setAttribute("class", "editable_text");
			editor = component.querySelector(".editable_text");
			tool_layout_print.init_editable_text(editor.id);
			JQhandle = "div.drag_text_editor";
		}
		
		//create the close button of the load component
		var close_button = document.createElement("div");
		close_button.setAttribute("id", "close");
		close_button.setAttribute("class", "close");
		close_button.setAttribute("onclick", "returnLeft('"+component_id+"')");

		//add the close button to the new component
		component.appendChild(close_button).firstChild;

		//assing the JQUERY drag to the current compoment into the page
		$("#"+component_id).draggable({
						containment: "#"+element_id,
						handle: JQhandle,
						scroll: false, 
						snap: true 
						}).resizable({containment: "#"+element_id});/**/
		//enable the JQUERY resizable to the current compoment into the page
		$("#"+component_id).resizable("enable");
	}

}

/**
* CLEAN_PAGE_TO_SAVE 
* clean the component into the pages for save to the postgres 
* remove the JQUERY drag to the components into the page
* @param object page_clonned_obj
*		jquery clone object received from get_page_template
* @return string clean_page
*		html with auxiliar elements and classes removed
*/
function clean_page_to_save(page_clonned_obj){

	//console.log(page_clonned_obj)
	/*
		Reference model

		<div id="oh29" class="draggable component_box border_box dedalo_component ui-draggable ui-draggable-handle ui-resizable" data-parent_section="oh1" style="position: absolute; left: 25px; top: 70px;">
		  <div id="close" class="close" onclick="javascript:returnLeft(oh29)"></div>
		  <div class="print_label component_date_print_label">Fecha alta</div>
		  <div class="print_content component_date_print_content">17-11-2014</div>
		  <div class="ui-resizable-handle ui-resizable-e" style="z-index: 90;"></div>
		  <div class="ui-resizable-handle ui-resizable-s" style="z-index: 90;"></div>
		  <div class="ui-resizable-handle ui-resizable-se ui-icon ui-icon-gripsmall-diagonal-se" style="z-index: 90;"></div>
		</div>
	*/

	// DRAGGABLE : Remove draggable classes of every draggable element
	$.each($(page_clonned_obj).find('.draggable'), function(index, current_element) {
		$(current_element)
			.removeClass('draggable ui-draggable ui-draggable-handle')
	})
	// RESIZABLE : Remove resizable classes of every resizable element
	$.each($(page_clonned_obj).find('.ui-resizable'), function(index, current_element) {
		$(current_element)
			.removeClass('ui-resizable')
	})
	// RESIZABLE HANDLERS : Remove all resizable auxiliar elements 
	$.each($(page_clonned_obj).find('.ui-resizable-handle'), function(index, current_element) {
		$(current_element).remove()
	})	
	// CLOSE BUTTON : Remove close button
	$.each($(page_clonned_obj).find('.close'), function(index, current_element) {
		$(current_element).remove()
	})

	// Select html string cleaned
	var clean_page = page_clonned_obj[0]
	//console.log(clean_page)

	return clean_page;


	/* OLD WORLD
	//select the components of the current page
	//console.log(page);
	//console.log($(page).find('#oh29'));
	//var $page= $( $(page).clone() );
	//console.log(page);
	var components = page[0].childNodes;

	//loop the components
	for (var i =0; i< components.length; i++) {
		var id = components[i].id;
		if(id.length > 0){
			switch(true){
					case (id=='header'):
						var components_header = components[i].childNodes;
						if(components_header.length < 0){
							break;
						}else{
							for (var h = 0; h<components_header.length; h++) {
								page.find("#"+components_header[h].id).draggable("destroy").resizable("destroy");						
							};
							break;
						}
					case (id=='footer'):
						var components_footer = components[i].childNodes;
						if(components_footer.length < 0){
							break;
						}else{
							for (var f = 0; f<components_footer.length; f++) {
								page.find("#"+components_footer[f].id).draggable("destroy").resizable("destroy");						
							};
							break;
						}
					default:
					//remove the JQUERY drag and resize
					//console.log(id);
					//var id_jquery = '#'+id;
					//console.log(id_jquery);

					//console.log($(page).find(id_jquery));
					page.find("#"+id).draggable("destroy").resizable("destroy");
					
				}		
		};
	}
	//console.log($page);
	
	return page;
	*/	
}

/*
* addPage new page to the DOM, tipo = fixed or fluid, the tipo make a new page with the class correspondent
*/
function addPage(tipo, portal, portal_name){

	//console.log(portal);
	//Select the pages_contaniner in the DOM
	var container 	= document.getElementById("pages_container");
	//Select all pages in the DOM and make one array
	var pages 		= document.getElementsByClassName("page");
	
	//if the DOM don't have any page set the new_id to 1 fi not select the last page into the DOM and add new number to the serie; page1
	if(pages.length == 0){
		new_id = 1;
	}else{
		//select the last page of the array of pages
		var last_page = pages[pages.length-1].id;
		//select the number of the last page
		var serial = last_page.match(/\d+/);
		//add 1 to the number of the last page
		var new_id = parseInt(serial[0])+1;
	}
	//create the new page
	var new_page = document.createElement("div");
	//set the attributes of the new page
	new_page.setAttribute("id", "page"+new_id);
	new_page.setAttribute("class", "page "+tipo);
	new_page.setAttribute("data-tipo", portal);
	new_page.setAttribute("ondrop", "Drop(event)");
	new_page.setAttribute("ondragover", "dragOver(event)");
	new_page.setAttribute("ondragenter", "dragEnter(event)");
	new_page.setAttribute("ondragleave", "dragLeave(event)");

	//create the page title of the new page
	var new_page_title = document.createElement("span");
	new_page_title.setAttribute("class", "page_title page_title_"+tipo);
	new_page_title.innerHTML =portal_name;

	//create the close button of the new page
	var new_page_close_button = document.createElement("div");
	new_page_close_button.setAttribute("class", "page_close_button");
	new_page_close_button.setAttribute("onclick", "removePage(this)");

	//add the close button to the new page
	new_page.appendChild(new_page_close_button);
	//add the title to the new page
	new_page.appendChild(new_page_title);
	//add the page to the pages_container div
	container.appendChild(new_page);
	this.show_pages_options('wrap_select_option_pages_'+tipo);
}

function show_pages_options(show_pages_options){
	pages_container_fixed = document.getElementsByClassName('wrap_select_option_pages_fixed')[0];
	pages_container_fluid = document.getElementsByClassName('wrap_select_option_pages_fluid')[0];

	if(show_pages_options == "wrap_select_option_pages_fixed"){
		if(pages_container_fixed.style.display == 'block'){
		 pages_container_fixed.style.display = 'none';
		 pages_container_fluid.style.display = 'none';
		}else{
          pages_container_fixed.style.display = 'block';
          pages_container_fluid.style.display = 'none';
		}
	}else{
		if(pages_container_fluid.style.display == 'block'){
		 pages_container_fluid.style.display = 'none';
		 pages_container_fixed.style.display = 'none';
		}else{
          pages_container_fluid.style.display = 'block';
          pages_container_fixed.style.display = 'none';
		}

	}
}
/*
* removePage when is pressed the close button
*/
function removePage(close_button_page){
	//Select the pages_container div
	var container 	= document.getElementById("pages_container");
	//Select the page id to remove
	var id = close_button_page.parentNode.id;
	//Select the page div to remove
	var delete_node 	= document.getElementById(id);

	//remove the close button from the DOM
	delete_node.removeChild(close_button_page);

	//Select the componets for send to the left column
	var components_to_remove = delete_node.childNodes;
	for (var i = 0; i<components_to_remove.length; i++) {

		//if the div header is present on the page, show the button ADD_HEADER. but the div is removed here (no into the remove_hedaer_element)
		//because we want delete all, page, header, compents.. = remove_header_element(false);
		if(components_to_remove[i].id == 'header'){
			remove_page_fixed_element(false,'header','inline-block');
			//console.log(components_to_remove[i].className);
			}else if(components_to_remove[i].id == 'footer'){
				remove_page_fixed_element(false,'footer','inline-block');

			}else if(components_to_remove[i].classList.contains('page_title')){
				delete_node.removeChild(components_to_remove[i]);

			}else
			{
			returnLeft(components_to_remove[i]);
		}
		
	};

	//remove the page from the DOM
	container.removeChild(delete_node);
	

}