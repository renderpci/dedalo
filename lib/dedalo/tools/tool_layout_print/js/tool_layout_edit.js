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
		if(portal[i] === page_to_drop){
			//console.log(portal);
			//console.log(page_to_drop);
			event.preventDefault();
		}else if(portal[i] === 'free_text' || page_to_drop === 'fixed_element'){
			event.preventDefault();
		}
	};
	
}

/*
* Drop the componet into the page
*/
function Drop(event) {
	event.preventDefault();
	//reset the border of the drag indication
	event.target.style.border = "none";
    
    //get the component data
    var data = event.dataTransfer.getData("text/plain");
   // var data2 = event.dataTransfer.getData("text/html");
   	//console.log(data);
    //if the element drop is a free_text change the appendChild to the dom and change the id of the freetext(unique id)
    //else if the element is a component appendChild directly

    //clone de object
    var orig_component 	= document.getElementById(data);
	var new_object 		= orig_component.cloneNode(true);
    
    if(data === 'free_text'){
       
        //orig_free_text 	= document.getElementById(data)
    	//free_text 		= orig_free_text.cloneNode(true);
    	new_object.id = newId + '-text';
    	newId++;
    	new_object.removeAttribute("class");
    	new_object.setAttribute("class", "component_box");
    	new_object.setAttribute("data-tipo", "free_text");

    	var editor = new_object.querySelector(".editable_text")
		editor.id = new_object.querySelector(".editable_text").id+(newId);
    	//console.log(editor.id);
    	tool_layout_print.init_editable_text(editor.id);

		new_object.querySelector(".drag_text_editor").style.display = "block";
		//free_text.style.display = "block";
		var JQhandle = "div.drag_text_editor";
		var JQalsoResize = "#"+new_object.id;
		var data2 = new_object.id;

		//console.log(JQalsoResize);
    }else{

    	orig_component.style.background = "rgba(227, 179, 147,0.8)";
    	new_object.removeAttribute("style");

		var new_component_id = newId + "-" + data.split("-").pop();
		new_object.id		 = new_component_id;
		newId++;

		var JQhandle = false;
    	var JQalsoResize = false;
    	var data2 = new_object.id;

    }
    
    // get the page id
	var page = event.target.id;

	//add the new_object to the pages_container div
	event.target.appendChild(new_object);
	//console.log(event.target.classList[1]);

   	//remove all the HTML5 standar into the component for change to the drag model of JQUERY
	//$(new_object).removeAttr("draggable ondragstart ondragend style");
	new_object.removeAttribute("draggable")
	new_object.removeAttribute("ondragstart")
	new_object.removeAttribute("ondragend")
	new_object.removeAttribute("style");
	//Get the position of the target page into the DOM, the left and top posiotion of the page
	var parentOffset = $("#"+page).offset(); 
	//Return the component position into the page from the mouse event and the position of the page
	var posX = event.pageX - parentOffset.left;
	var posY = event.pageY - parentOffset.top;

	switch(true){
		//set the Style of the component into the page and his postion relative to the page
		case (event.target.classList.contains('fixed')): 
		case (event.target.classList.contains('header_element')):
		case (event.target.classList.contains('footer_element')): 
			new_object.style.position ="absolute";
			new_object.style.left = posX+"px";
			new_object.style.top = posY+"px";
			break;
		//set the Style of the component into the page only when the page is a fluid page lassList[1] ==='fluid')
		case (event.target.classList.contains('fluid')):
			//console.log(event.target.classList[1]);
			new_object.style.with = "100%";
			//new_object.style.height = "auto";
			new_object.style.position ="absolute";
			new_object.style.left = posX+"px";
			new_object.style.top = posY+"px";
			new_object.className = new_object.className + " component_fluid";
			break;
	}
	
	//Set the drag JQUERY UI mode
	//console.log($("#"+new_object.id));
    $(new_object).draggable({
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

	//var new_id = data2.split("_").pop()

	add_close_button_to_component(new_object, data2);

//Select the close button of the component and set de display to block
// component.querySelector(".close").style.display = "block";

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
* removeLeft_component_Style remove the style of the componet into the left colum - restart the origin style
*/
function removeLeft_component_Style(component_id){
	
	//prevent the components or elements without id
	if(component_id === ''){
		return;
	}
	//select the id of the component
	id_Selector = component_id.split("-").pop();

	if(id_Selector === 'text'){
		return
	}
	component = document.querySelectorAll("[id*='"+id_Selector+"']"), i = 0;
	//console.log(component);
	if(component.length === 1 ){
		var left_id = "left-" + id_Selector;
		left_component = document.getElementById(left_id).removeAttribute("style");
		return

	}
}
/*
* remove_element remove the TEXT from the page
*/
function remove_element(close_button){

	parent = close_button.parentNode;
	//console.log(close_button)
	parent.remove();

	removeLeft_component_Style(parent.id);

}

function show_childrens_to_left(section){
	var section = document.getElementById(section);
	//console.log(section);
	components = section.childNodes;
	for (var i = 0; i < components.length; i++) {
		if(components[i].className === 'warp_components_display'){
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
	
	var pages = document.getElementsByClassName("page");
	
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

	if(element === 'header'){
		direction = "s";
	}else{
		direction = "n";
	}
	$(main_head).droppable();
	$(main_head).droppable("disable").resizable({ containment:"#"+main_page.id, handles: direction})

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

//copy header /footer to the new pages  in DOM
function sync_fixed_element(page){
	
	var header 	= document.getElementById("header")
	var	footer 	= document.getElementById("footer")

	if(header !== null){
		if(header.parentNode == page ) return;
		var sync_header = header.cloneNode(true);
		sync_header.id = newId+"_"+header.id;
		page.insertBefore(sync_header, page.firstChild);
		//page.appendChild(sync_header);
		//$sync_header.resizable();
		//$sync_header.droppable();
		$("#header").resizable( "option", "alsoResize", [$(sync_header),$(".header_element")] );
		newId++;
	}
	if(footer !== null){
		if(footer.parentNode == page ) return;
		var sync_footer = footer.cloneNode(true);
		sync_footer.id = newId+"_"+footer.id;
		page.appendChild(sync_footer);
		$("#footer").resizable( "option", "alsoResize", [$(sync_footer),$(".footer_element")] );
		newId++;
	}

	//add the close button to the new page
	
	
	//add the page to the pages_container div
	//page.insertBefore(main_head, main_page.firstChild);
	// console.log(main_head);
	// console.log(main_page);

	

//	$(main_head).droppable("disable").resizable({ containment:"#"+main_page.id, handles: direction})

}

/*
* loadPages load the pages and the componets from the postgres 
* asing the JQUERY drag to the components into the page and remove from the left column
*/
function loadPages(){

	//select the left column and his clindrens
	//var left		= document.getElementById("left");

	//var components_to_remove = left.childNodes;
	//select the all pages
	var pages = document.getElementsByClassName("page")

	//loop the all pages
	var pages_length = pages.length
	for (var j = 0; j < pages_length; j++) {
		//select the components of the current page and his id
		var components 		= pages[j].getElementsByTagName('div')
		var	current_page_id = pages[j].id
		var	page_type 		= pages[j].dataset.page_type
		var	portal_name 	= pages[j].dataset.label

		// Add attr
		pages[j].setAttribute("ondrop", "Drop(event)");
		pages[j].setAttribute("ondragover", "dragOver(event)");
		pages[j].setAttribute("ondragenter", "dragEnter(event)");
		pages[j].setAttribute("ondragleave", "dragLeave(event)");

		// loop of the components of the current page
		var components_length = components.length
		for (var i = 0; i<components_length; i++) {
				//console.log(components[i].parentNode== pages[j]);
			if (components[i].parentNode != pages[j]) continue;			

			switch(true){
				// HEADER
				case (components[i].id === 'header'):

					remove_page_fixed_element(false,'header','none');
					$(components[i]).draggable().resizable({ containment:"#"+current_page_id, handles: 's'});
					$(components[i]).draggable("disable");

					add_close_button_to_component(components[i], components[i].id)

					var components_loaded 		 = components[i].querySelectorAll(".component_box");
					var components_loaded_length = components_loaded.length
					if(components_loaded_length < 0){
						break;
					}else{
						for (var h=0; h<components_loaded_length; h++) {
							add_component_to_current_element(components_loaded[h].id, components[h].id);
						}
						break;
					}
				// FOOTER
				case (components[i].id === 'footer'):
					remove_page_fixed_element(false,'footer','none');
					$(components[i]).draggable().resizable({ containment:"#"+current_page_id, handles: 'n'});
					$(components[i]).draggable("disable")

					add_close_button_to_component(components[i], components[i].id)

					var components_loaded 		 = components[i].querySelectorAll(".component_box");
					var components_loaded_length = components_loaded.length
					if(components_loaded_length < 0){
						break;
					}else{
						for (var f = 0; f<components_loaded_length;f++) {
							add_component_to_current_element(components_loaded[f].id, components[f].id);
						}
						break;
					}
				// PAGE TITLE
				case (components[i].className === 'page_title'):
					//console.log(components[i]);
					break;
				// PAGE CLOSE BUTTON
				case (components[i].className === 'page_close_button'):						
					break;
				// CLOSE
				case (components[i].id === 'close'):
					//case (components[i].classList.contains=='editable_text'):
					break;
				// DEFAULT
				default:					
					add_component_to_current_element(components[i].id, current_page_id);

			}//end switch true
			
		}//end for (var i = 0; i<components.length; i++) {

		
		//create the page title of the page
		var page_title = document.createElement("span");
			page_title.setAttribute("class", "page_title page_title_"+page_type);
			page_title.innerHTML =portal_name;

		//create the close button of the page
		var page_close_button = document.createElement("div");
			page_close_button.setAttribute("class", "page_close_button");
			page_close_button.setAttribute("onclick", "removePage(this)");

		//add the close button to the page
			pages[j].appendChild(page_close_button).firstChild;

		//add the title to the page
			pages[j].appendChild(page_title).firstChild;

			//add exsistent the hearder and footer
		
			sync_fixed_element(pages[j]);
			
					
	
	}//end for (var j = 0; j<pages.length; j++) { loop pages

}//end loadPages


/*
* ADD COMPONENT TO THE PAGE
*/
function add_component_to_current_element(component_id, element_id){
		
	//prevent the components or elements without id
	if(component_id === ''){
		return;
	}

	// set the id for the component into the left colum (for delete it)
	var left_id = "left-"+component_id.split("-").pop();

	//select of the current components and his id
	var component = document.getElementById(component_id);
	
	//if the node don't have id (button_delete) don't remove
	if(component !== null){
		//console.log(component.dataset.component_tipo == component_id.split("_").pop());
		//remove from the leftcolum the current component in the page
		//if (component.id.indexOf("text") == -1){
			switch(true){

				case(component.dataset.component_tipo === component_id.split("_").pop()):

					var component_id = newId + "-" + component_id.split("-").pop()							

					component.id = component_id
					newId++;

					var left_component = document.getElementById(left_id);
					//console.log(left_component);
					if (left_component)
						left_component.style.background = "rgba(227, 179, 147,0.8)";
					JQhandle = false;
					break;

				case(component.dataset.typology === "free_text"):

					var component_id = newId + "-text"
						component.id = component_id
					
					editor 	  = component.querySelector(".editable_text");
					editor.id = "editor"+newId;

					tool_layout_print.init_editable_text(editor.id);
					newId++;
					JQhandle = "div.drag_text_editor";
					break;

				default:
					
					return
					break;
			}
		//console.log(component_id);
		//var component 	= document.getElementById(component_id);
		
		add_close_button_to_component(component, component_id);
				//console.log(component);

		//assing the JQUERY drag to the current compoment into the page
		$(component).draggable({
						containment: "#"+element_id,
						handle: JQhandle,
						scroll: false, 
						snap: true
						}).resizable({containment: "#"+element_id});

		// enable the JQUERY resizable to the current compoment into the page
		//$(component).resizable("enable");
	}

}//end add_component_to_current_element


/**
* ADD CLOSE BUTTON TO FREE TEXT AND COMPONENTS
*/
function add_close_button_to_component(component, component_id ){

	//create the close button of the load component
	var close_button = document.createElement("div");
	close_button.setAttribute("id", "close");
	close_button.setAttribute("class", "close");
	close_button.setAttribute("style", "display:block");
	//if the id is for free_text set the button diferent
	if(component.dataset.tipo === "fixed_element"){
		close_button.setAttribute("onclick", "remove_page_fixed_element(this.parentNode,'"+component_id+"','inline-block')");
	}else{
		close_button.setAttribute("onclick", "remove_element(this)");
	}
	//close_button.setAttribute("onclick", "remove_element(this)");


	var theFirstChild = component.firstChild;

	//add the close button to the new component
	component.insertBefore(close_button, theFirstChild);

}//end add_close_button_to_component

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
}//end clean_page_to_save

/**
* ADDPAGE new page to the DOM, tipo = fixed or fluid, the tipo make a new page with the class correspondent
*/
function addPage(page_type, portal, portal_name){

	//console.log(portal);
	//Select the pages_contaniner in the DOM
	var container 	= document.getElementById("pages_container");
	//Select all pages in the DOM and make one array
	var pages 		= document.getElementsByClassName("page");
	
	//if the DOM don't have any page set the new_id to 1 fi not select the last page into the DOM and add new number to the serie; page1
	if(pages.length === 0){
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
		new_page.setAttribute("class", "page "+page_type);
		new_page.setAttribute("data-tipo", portal);
		new_page.setAttribute("data-page_type", page_type);
		new_page.setAttribute("data-label", portal_name);
		new_page.setAttribute("ondrop", "Drop(event)");
		new_page.setAttribute("ondragover", "dragOver(event)");
		new_page.setAttribute("ondragenter", "dragEnter(event)");
		new_page.setAttribute("ondragleave", "dragLeave(event)");

	//create the page title of the new page
	var new_page_title = document.createElement("span");
		new_page_title.setAttribute("class", "page_title page_title_"+page_type);
		new_page_title.innerHTML =portal_name;

	//create the close button of the new page
	var new_page_close_button = document.createElement("div");
		new_page_close_button.setAttribute("class", "page_close_button");
		new_page_close_button.setAttribute("onclick", "removePage(this)");

	//add the close button to the new page
	new_page.appendChild(new_page_close_button);
	//add the title to the new page
	new_page.appendChild(new_page_title);
	//add exsistent the hearder and footer
	sync_fixed_element(new_page);
	//add the page to the pages_container div
	container.appendChild(new_page);
	this.show_pages_options('wrap_select_option_pages_'+page_type);

}//end addPage

/**
* SHOW_PAGES_OPTIONS
*/
function show_pages_options(show_pages_options){
	pages_container_fixed = document.getElementsByClassName('wrap_select_option_pages_fixed')[0];
	pages_container_fluid = document.getElementsByClassName('wrap_select_option_pages_fluid')[0];

	if(show_pages_options === "wrap_select_option_pages_fixed"){
		if(pages_container_fixed.style.display === 'block'){
		 pages_container_fixed.style.display = 'none';
		 pages_container_fluid.style.display = 'none';
		}else{
          pages_container_fixed.style.display = 'block';
          pages_container_fluid.style.display = 'none';
		}
	}else{
		if(pages_container_fluid.style.display === 'block'){
		 pages_container_fluid.style.display = 'none';
		 pages_container_fixed.style.display = 'none';
		}else{
          pages_container_fluid.style.display = 'block';
          pages_container_fixed.style.display = 'none';
		}

	}
}//end show_pages_options

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
	//var components_to_remove = delete_node.childNodes; 
	//var components_to_remove = delete_node.getElementsByTagName('div');
	var components_to_remove = delete_node.querySelectorAll('[id]');

		//console.log(components_to_remove);
	for (var i = 0; i<components_to_remove.length; i++) {

		//if the div header is present on the page, show the button ADD_HEADER. but the div is removed here (no into the remove_hedaer_element)
		//because we want delete all, page, header, compents.. = remove_header_element(false);

		switch(true){
			case (components_to_remove[i].id === 'header'):
				remove_page_fixed_element(false,'header','inline-block');
				break;
			case (components_to_remove[i].id === 'footer'):
				remove_page_fixed_element(false,'footer','inline-block');
				break;
			case (components_to_remove[i].classList.contains('page_title')):
				delete_node.removeChild(components_to_remove[i]);
				break;
			case (components_to_remove[i].id.indexOf("text") != -1):
				break;
			case (components_to_remove[i].id === 'close'):
				break;
			default:
				if(components_to_remove[i].dataset.component_tipo){
					components_to_remove[i].parentNode.removeChild(components_to_remove[i]);
					removeLeft_component_Style(components_to_remove[i].id);
				}
			break;
		}

	}

	//remove the page from the DOM
	container.removeChild(delete_node)
}//end removePage


