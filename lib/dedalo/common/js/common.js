
/**
* COMMON
*/
export const common = {

	/**
	* CREATE_DOM_ELEMENT
	* Builds a DOM node baased on received options
	*/
	create_dom_element : function(element_options){

		const element_type			= element_options.element_type
		const parent				= element_options.parent
		const class_name			= element_options.class_name
		const style					= element_options.style
		let data_set				= element_options.data_set
			if (typeof data_set==="undefined" && typeof element_options.dataset!=="undefined") data_set = element_options.dataset

		const custom_function_events= element_options.custom_function_events
		const title_label			= element_options.title_label
		const text_node				= element_options.text_node
		const text_content			= element_options.text_content
		const inner_html			= element_options.inner_html
		const id 					= element_options.id
		const draggable				= element_options.draggable
		const value					= element_options.value
		const src					= element_options.src
		const type					= element_options.type
		const contenteditable		= element_options.contenteditable
		const name					= element_options.name
		
		const element = document.createElement(element_type);
	
		// Add id property to element
		if(id){
			element.id = id;
		}

		// A element. Add href property to element
		if(element_type==='a'){
			element.href = 'javascript:;';
		}
		
		// Class name. Add css classes property to element
		if(class_name){
			element.className = class_name
		}

		// Style. Add css style property to element
		if(style){
			for(let key in style) {
				element.style[key] = style[key]
				//element.setAttribute("style", key +":"+ style[key]+";");
			}		
		}

		// Title . Add title attribute to element
		if(title_label){
			element.title = title_label
		}
	
		// Dataset Add dataset values to element		
		if(data_set){
			for (let key in data_set) {
				element.dataset[key] = data_set[key]
			}
		}

		// Value
		if(value){
			element.value = value
		}

		// Click event attached to element
		if(custom_function_events){
			const len = custom_function_events.length
			for (let i = 0; i < len; i++) {
				let function_name 		= custom_function_events[i].name
				let event_type			= custom_function_events[i].type
				let function_arguments	= custom_function_events[i].function_arguments					

				// Create event caller
				this.create_custom_events(element, event_type, function_name, function_arguments)
			}
			/*
				//element.onclick = function () { eval(click_event) };
				var function_name = click_event;	//'ts_object.test_name2'
				element.addEventListener("click", function(e){
					call_custom_function(function_name,this)
				}, false);
				}*/
		}//end if(custom_function_events){
		
		// Text content 
		if(text_node){
			//element.appendChild(document.createTextNode(TextNode));
			// Parse html text as object
			if (element_type==='span') {
				element.textContent = text_node
			}else{
				let el = document.createElement('span')
					el.innerHTML = " "+text_node // Note that prepend a space to span for avoid Chrome bug on selection
				element.appendChild(el)
			}			
		}else if(text_content) {
			element.textContent = text_content
		}else if(inner_html) {
			element.innerHTML = inner_html
		}


		// Append created element to parent
		if (parent) {
			parent.appendChild(element)
		}

		// Dragable
		if(draggable){
			element.draggable = draggable;
		}

		// Add id property to element
		if(src){
			element.src = src;
		}

		if (type) {
			element.type = type;
		}

		if (contenteditable) {
			element.contentEditable = contenteditable;
		}

		if(name){	
			element.name = name
		}

		return element;
	},//end create_dom_element



	/**
	* CREATE_CUSTOM_EVENTS
	*/
	create_custom_events : function(element, event_type, function_name, function_arguments){

		// If empty arguments, creates empty array
		if (typeof function_arguments==='undefined') {
			function_arguments = []
		}
		// Reserve array keys 0 and 1 to use with object and event later
		function_arguments.unshift(null)
		function_arguments.unshift(null)
					
		return element.addEventListener(event_type, function(event){

			// Override arguments key 0 with actual DOM object
			function_arguments[0] = this

			// Override arguments key 1 with actual event
			function_arguments[1] = event

			call_custom_function(function_name, function_arguments)
		}, false);
	},//end create_custom_events



}//end common class
