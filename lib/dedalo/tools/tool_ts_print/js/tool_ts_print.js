/**
* TOOL_TS_PRINT
*
*
*
*/
var tool_ts_print = new function() {

	this.trigger_url = DEDALO_LIB_BASE_URL + '/tools/tool_ts_print/trigger.tool_ts_print.php'
	
	this.ts_data

	this.lang

	this.format


	/**
	* INIT
	* @return 
	*/
	this.init = function(options) {
		
		let self = this
		
		// Fix ts_data
		self.ts_data = options.ts_data

		// Fix lang
		self.lang = options.lang

		// Fix format
		self.format = options.format

		// Render html
		self.parse_html()
		
		return true
	};//end init



	/**
	* PARSE_HTML
	* @return 
	*/
	this.parse_html = function() {
		
		let self = this

		const components_to_parse = {
			"term"		: "hierarchy25" ,
			"scope_note": "hierarchy28" ,
			"descriptor": "hierarchy23" ,
			"children"	: "hierarchy49" ,
			"related"	: "hierarchy35" ,
		}
		const html_page_wrap = document.getElementById('ts_container')

		// Clean div
		var print = document.getElementsByClassName("loading_content");
		if (typeof print[0] !== 'undefined') {
			html_page_wrap.removeChild(print[0])
		}

		const ar_term_root 	= self.ts_data.ar_root;
		const components 	= self.ts_data.components



		let ts_print 	= common.create_dom_element({
													element_type	: 'div',
													parent 			: html_page_wrap,
													class_name 		: 'ts_print'											
													})

		if(self.format === "alphabetical"){

			let html = self.parse_alfa_html_terms(components, components_to_parse, ts_print)
	
		}else{

			let term_ul = common.create_dom_element({
													element_type	: 'ul',
													parent 			: ts_print,
													class_name 		: 'ts_print_ul'
													})
			
				//console.log("self.ts_data:",self.ts_data);
				//console.log("components:",components);

			ar_term_root.forEach( current_root_term =>{
				const ar_terms = components.filter(root_term => root_term.section_id === current_root_term.section_id && root_term.section_tipo === current_root_term.section_tipo)
					//console.log("ar_terms:",ar_terms);
					//console.log("ar_terms:",components.data.section_id[0]);
				let html = self.parse_hierarchy_html_terms(ar_terms, components_to_parse, term_ul, false)
			})
			//console.log("ar_terms:",self.ts_data);			
		}


		return true
	};//end parse_html



	/**
	* PARSE_hierarchy_HTML_TERMS
	* @return 
	*/
	this.parse_hierarchy_html_terms = function(ar_terms, components_to_parse, parent, recursion) {
		
		let self = this
		
		const components 	= self.ts_data.components		
		const data_lang 	= self.lang || page_globals.dedalo_data_lang
			//console.log("data_lang:",data_lang);

		const ar_terms_length = ar_terms.length
		for (let i = 0; i< ar_terms_length ; i++) {
			
			const term_data 		= ar_terms[i].data
			const term_relations 	= ar_terms[i].relations
			const ar_descriptor 	= term_data.filter(descriptor => descriptor.from_component_tipo === components_to_parse.descriptor)
			const descriptor 		= ar_descriptor.shift()
					//console.log("descriptor.value == true:",descriptor.value === true);

			let abreviation_text
			let term_li
			if (typeof descriptor !== 'undefined') {
				if(descriptor.value === true){
					term_li 	= common.create_dom_element({
													element_type			: 'li',
													parent 					: parent,
													class_name 				: 'ts_print_li'												
													})
					if (recursion === true) {
						abreviation_text = get_label.abv_narrowed_term
					}else{
						abreviation_text = get_label.abv_broader_term
					}	

				}else{
						term_li = parent.parentNode
						abreviation_text = get_label.abv_use_for
				}
			}
			

			//term
			const ar_term = term_data.filter(term => term.from_component_tipo === components_to_parse.term && term.lang === data_lang)
			const term = ar_term.shift()
			if (typeof term !== 'undefined') {

				let term_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: term_li,
											class_name 				: 'ts_print_div_term'
											})

				
				let term_abv 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_abv_term',
											text_node				: abreviation_text
											})

				
				let term_span 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_term',																						
											text_node				: term.value
											})

				let term_id 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_term_id',																						
											text_node				: ar_terms[i].section_tipo + "_" +ar_terms[i].section_id
											})
			}
			//related
			const ar_related = term_relations.filter(related => related.from_component_tipo === components_to_parse.related)
			if (ar_related.length>0) {

				let rel_term_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: term_li,
											class_name 				: 'ts_print_div_rel_term'
											})

				let abreviation_text = get_label.abv_related_term

				let rel_term_abv 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: rel_term_div,
											class_name 				: 'ts_print_abv_term',
											text_node				: abreviation_text
											})

				ar_related.forEach( current_related_term =>{
					const ar_rel_terms 	= components.filter(root_term => root_term.section_id === current_related_term.section_id && root_term.section_tipo === current_related_term.section_tipo)
					if (typeof ar_rel_terms[0]!=="undefined") {
						const term_data 	= ar_rel_terms[0].data
						const ar_rel_term 	= term_data.filter(term => term.from_component_tipo === components_to_parse.term && term.lang === data_lang)
						//console.log("term_data:",ar_rel_term);
						const rel_term_span	= common.create_dom_element({
												element_type			: 'span',
												parent 					: rel_term_div,
												class_name 				: 'ts_print_rel_term',
												text_node				: (typeof ar_rel_term[0]!=="undefined") ? ar_rel_term[0].value : " "
												})
					}
				})
			}

			// scope note
			const ar_scope_note = term_data.filter(scope_note => scope_note.from_component_tipo === components_to_parse.scope_note && scope_note.lang === data_lang)
			const scope_note 	= ar_scope_note.shift()

			if (typeof scope_note !== 'undefined') {


				let scope_note_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: term_li,
											class_name 				: 'ts_print_div_scope_note'
											})


				let abreviation_text = get_label.abv_scope_note

				let scope_note_abv 	= common.create_dom_element({
											element_type	: 'span',
											parent 			: scope_note_div,
											class_name 		: 'ts_print_abv_term',
											text_node		: abreviation_text
											})

			
				let scope_note_span = common.create_dom_element({
											element_type	: 'span',
											parent 			: scope_note_div,
											class_name 		: 'ts_print_scope_note',
											inner_html		: scope_note.value
											})
			}

			// Children
			const ar_children = term_relations.filter(children => children.from_component_tipo === components_to_parse.children)
			//const ar_child_terms = this.ts_data.filter(ar_terms => ar_terms.section_id === ar_children.section_id && ar_terms.section_tipo === ar_children.section_tipo)

			if (ar_children.length >0 ) {
						let term_ul 	= common.create_dom_element({
												element_type			: 'ul',
												parent 					: term_li,
												class_name 				: 'ts_print_ul'
												})

				ar_children.forEach( current_child_term =>{
					const ar_terms = components.filter(root_term => root_term.section_id === current_child_term.section_id && root_term.section_tipo === current_child_term.section_tipo)
					//console.log("ar_terms:",components.data.section_id[0]);

					let html = self.parse_hierarchy_html_terms(ar_terms, components_to_parse, term_ul, true)				
				})
			}
		}

		return true
	};//end parse_hierarchy_html_terms



	/**
	* SORT_ALFA_TERMS
	* @return 
	*/
	this.sort_alfa_terms = function(ar_terms, components_to_parse) {

		let self = this

		const components 		= self.ts_data.components
		const data_lang 		= self.lang || page_globals.dedalo_data_lang
		const ar_root_term 		= self.ts_data.ar_root;

		//map the orginal json to one flat term with section_id, section_tipo, and the value for sort
		let ar_map_sort = ar_terms.map(term => {
			const term_data =  term.data

			const ar_term_obj_value = term_data.filter(value_term => value_term.from_component_tipo === components_to_parse.term && value_term.lang === data_lang )
			const term_obj_value = ar_term_obj_value.shift()
			//select the correct terms and only the terms of the section tipo selected.
			if (typeof term_obj_value !== 'undefined' && term.section_tipo === ar_root_term[0].section_tipo) {
				const term_value = term_obj_value.value
				//console.log("term_value:",term_value);

				return { 	section_id 	: term.section_id,
				  			section_tipo: term.section_tipo,
				  			value 		: term_value.toLowerCase()
				  		}
				}
			})

		//ar_map_sort.sort( (a,b) => {return (a.value > b.value) ? 1 : ((b.value > a.value) ? -1 : 0);} );

		//sort the thesaurus
		let collator = new Intl.Collator('el',{ sensitivity: 'base', ignorePunctuation:true});
		ar_map_sort.sort( (a,b) => {return collator.compare(a.value , b.value)});


		return ar_map_sort
	};//end sort_alfa_terms




	/**
	* PARSE_ALFA_HTML_TERMS
	* @return 
	*/
	this.parse_alfa_html_terms = function(ar_terms, components_to_parse, parent) {
			
			let self = this
			
			const components 		= self.ts_data.components
			const ar_root_term 		= self.ts_data.ar_root;
			const sort_alfa_terms 	= self.sort_alfa_terms(ar_terms, components_to_parse)

			//console.log("sort_alfa_terms:",sort_alfa_terms);

			//create the html of the every term
			sort_alfa_terms.forEach( sort_alfa_terms =>{
				if (typeof sort_alfa_terms !== 'undefined') {
					let recursion = true
					const ar_terms = components.filter(current_term => current_term.section_id === sort_alfa_terms.section_id && current_term.section_tipo === sort_alfa_terms.section_tipo)
					//console.log("ar_terms:",components.data.section_id[0]);
					const ar_root_term_len = ar_root_term.length
					for (let i = ar_root_term_len - 1; i >= 0; i--) {
						if (ar_root_term[i].section_id === ar_terms[0].section_id && ar_root_term[i].section_tipo === ar_terms[0].section_tipo){
							recursion = false
							break
						}
					}
					let html = self.build_html_alfa_term(ar_terms, components_to_parse, parent, recursion)

				}			
			})
		
		return true
	};//end parse_alfa_html_terms



	/**
	* BUILD_HTML_ALFA_TERM
	* @return 
	*/
	this.current_letter = null
	this.build_html_alfa_term = function(ar_terms, components_to_parse, parent, recursion) {
			let self = this
			
			const components 		= self.ts_data.components
			const data_lang 		= self.lang || page_globals.dedalo_data_lang
			const term_data 		= ar_terms[0].data
			const term_relations 	= ar_terms[0].relations

			//is descriptor check, if not, return, nothing to do.
				const ar_is_descriptor 	= term_data.filter(descriptor => descriptor.from_component_tipo === components_to_parse.descriptor)
				const is_descriptor 	= ar_is_descriptor.shift()
				//console.log("descriptor.value == true:",descriptor.value === true);
				if(is_descriptor.value === false){
					return null
				}

			//term
			const ar_term 			= term_data.filter(term => term.from_component_tipo === components_to_parse.term && term.lang === data_lang)
			const term 				= ar_term.shift()
			// remove the puntuation
			const term_value 		= term.value.replace(/[¡!¿?=%$#@*+,'"&(){}\[\]\/\s]/g, "")
			//select the first character valid
			const initial_letter 	= term_value.charAt(0).toLowerCase()
			// comparator of characters
			const collator =  new Intl.Collator('el',{ sensitivity: 'base', ignorePunctuation:true });
			//create the capital letter of the first character valid
			if (collator.compare(self.current_letter, initial_letter) != 0 || self.current_letter === null) {
					
				self.current_letter = initial_letter.normalize('NFD').replace(/[\u0300-\u036f]/g, "")
				//console.log("current_letter:",self.current_letter);
				let term_div 	= common.create_dom_element({
												element_type	: 'div',
												parent 			: parent,
												class_name 		: 'ts_print_letter_header',
												text_node		: self.current_letter
												})

			}
			if (typeof term !== 'undefined') {

				let abreviation_text
				if (recursion === true) {
					abreviation_text = get_label.abv_narrowed_term
				}else{
					abreviation_text = get_label.abv_broader_term
				}
				let term_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: parent,
											class_name 				: 'ts_print_div_term'
											})

				
				let term_abv 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_abv_term',
											text_node				: abreviation_text
											})

				
				let term_span 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_term',																						
											text_node				: term.value
											})

				let term_id 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: term_div,
											class_name 				: 'ts_print_term_id',																						
											text_node				: ar_terms[0].section_tipo + "_" +ar_terms[0].section_id
											})
			}

			//related
			const ar_related = term_relations.filter(related => related.from_component_tipo === components_to_parse.related)
			if (ar_related.length>0) {

				let rel_term_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: parent,
											class_name 				: 'ts_print_div_rel_term'
											})

				let abreviation_text = get_label.abv_related_term

				let rel_term_abv 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: rel_term_div,
											class_name 				: 'ts_print_abv_term',
											text_node				: abreviation_text
											})

				ar_related.forEach( current_related_term =>{
					const ar_rel_terms = components.filter(root_term => root_term.section_id === current_related_term.section_id && root_term.section_tipo === current_related_term.section_tipo)
					if (typeof ar_rel_terms[0]!=="undefined") {
						const term_data 	= ar_rel_terms[0].data
						const ar_rel_term 	= term_data.filter(term => term.from_component_tipo === components_to_parse.term && term.lang === data_lang)
						//console.log("term_data:",ar_rel_term);
						const rel_term_span	= common.create_dom_element({
												element_type			: 'span',
												parent 					: rel_term_div,
												class_name 				: 'ts_print_rel_term',
												text_node				: (typeof ar_rel_term[0]!=="undefined") ? ar_rel_term[0].value : " "
												})
					}
				})
			}

			// No descriptors
			const ar_children = term_relations.filter(children => children.from_component_tipo === components_to_parse.children)
			//const ar_child_terms = this.ts_data.filter(ar_terms => ar_terms.section_id === ar_children.section_id && ar_terms.section_tipo === ar_children.section_tipo)

			if ( ar_children.length > 0 ) {
				let i = 0
				let no_descriptor_div
				ar_children.forEach( current_child_term =>{
					const ar_terms = components.filter( root_term => root_term.section_id === current_child_term.section_id && root_term.section_tipo === current_child_term.section_tipo)
					//console.log("ar_terms:",components.data.section_id[0]);
					const ar_term = ar_terms.shift()
					if (typeof ar_term!=="undefined") {
						const ar_descriptor 	= ar_term.data.filter(descriptor => descriptor.from_component_tipo === components_to_parse.descriptor)
						const descriptor 		= ar_descriptor.shift()
						
						//console.log("descriptor.value == true:",descriptor.value === true);
						if (typeof descriptor!=="undefined") {
							if(descriptor.value === false){
									
								if(i === 0){
									const abreviation_text = get_label.abv_use_for
									no_descriptor_div 	= common.create_dom_element({
																element_type			: 'div',
																parent 					: parent,
																class_name 				: 'ts_print_div_descriptor'
																})

							
									const no_descriptor_abv 	= common.create_dom_element({
																element_type			: 'span',
																parent 					: no_descriptor_div,
																class_name 				: 'ts_print_abv_term',
																text_node				: abreviation_text
																})

								}

								const ar_no_descriptor_term = ar_term.data.filter(term => term.from_component_tipo === components_to_parse.term && term.lang === data_lang)
								const no_descriptor_term 	= ar_no_descriptor_term.shift()
								if (typeof no_descriptor_term !== 'undefined') {
									let no_descriptor_span 	= common.create_dom_element({
																	element_type			: 'span',
																	parent 					: no_descriptor_div,
																	class_name 				: 'ts_print_no_descriptor',																						
																	text_node				: no_descriptor_term.value
																	})
									i++
								}
							}
						}
					}
				})
			}


			// scope note
			const ar_scope_note = term_data.filter(scope_note => scope_note.from_component_tipo === components_to_parse.scope_note && scope_note.lang === data_lang)
			const scope_note 	= ar_scope_note.shift()

			if (typeof scope_note !== 'undefined') {


				let scope_note_div 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: parent,
											class_name 				: 'ts_print_div_scope_note'
											})


				let abreviation_text = get_label.abv_scope_note

				let scope_note_abv 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: scope_note_div,
											class_name 				: 'ts_print_abv_term',
											text_node				: abreviation_text
											})

			
				let scope_note_span 	= common.create_dom_element({
											element_type			: 'span',
											parent 					: scope_note_div,
											class_name 				: 'ts_print_scope_note',
											inner_html				: scope_note.value
											})
			}


		return true
	};//end build_html_alfa_term



	/**
	* LOAD_THESAURUS_SECTION
	* @return 
	*/
	this.load_thesaurus_section = function(select_obj) {
		
		let self = this		

		const select_ts_section = document.getElementById('select_ts_section')
		const select_ts_lang 	= document.getElementById('select_ts_lang')
		const select_ts_format 	= document.getElementById('select_ts_format')

		const section_tipo 	= select_ts_section.value 
		const lang 			= select_ts_lang.value
		const format 		= select_ts_format.value
		

		const trigger_url  = this.trigger_url
		const trigger_vars = {
			mode 		 : "load_thesaurus_section",
			section_tipo : section_tipo
		}

		const wrap_obj = document.getElementById('ts_container')
			  //wrap_obj.appendChild = "<div class=\"loading_content blink_me\"></div>"

		const print = document.getElementsByClassName("ts_print");
		if (typeof print[0] !== 'undefined') {
			wrap_obj.removeChild(print[0])
		}

		const loading_content 	= common.create_dom_element({
											element_type			: 'div',
											parent 					: wrap_obj,
											class_name 				: 'loading_content blink_me',
											inner_html				: 'Building full thesaurus..'
											})
		wrap_obj.appendChild(loading_content);

		html_page.loading_content( wrap_obj, 1 );

		let js_promise = common.get_json_data(trigger_url, trigger_vars).then(function(response) {
				if(SHOW_DEBUG===true) {
					//console.log("[tool_ts_print.load_thesaurus_section] response",response);
				}


					
				if (response===null) {
					alert("Error on load_thesaurus_section "+section_tipo+" record (null response). See server log for more details")
				}else{
					
					// Fix ts_data
					self.ts_data = response.result

					// Fix lang
					self.lang 	 = lang

					//fix format
					self.format = format

					// Render html
					self.parse_html()
				}

				html_page.loading_content( wrap_obj, 0 );			
			})

		return js_promise
	};//end load_thesaurus_section



};//end tool_ts_print