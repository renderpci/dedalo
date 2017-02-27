<?php
/*
* CLASS TOOL_LAYOUT_PRINT
* Manage presets and layout print
*/
require_once( dirname(dirname(dirname(__FILE__))) .'/config/config4.php');
require_once( DEDALO_ROOT .'/lib/htmLawed/htmLawed.php');


# COMPONENT SECTION
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO'	, 'dd67'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO' , 'dd61'); # Privada

# COMPONENT LAYOUT
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO'		, 'dd39'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO'	, 'dd23'); # Privada

# COMPONENT TEXT (LABEL / TEMPLATE NAME) Like 'Template One'
define('DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO'		, 'dd38'); # pública
define('DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO'	, 'dd29'); # Privada



class tool_layout_print extends tool_common {

	
	protected $section_obj;	# received section
	
	public $templates_default;	# Private default templates (matrix_layout_dd)
	public $templates_public;	# Public editable templates (matrix_layout)

	/**
	* __CONSTRUCT
	* @param obj $section_obj section object full
	* @param string $modo like 'page' (default)
	*/
	public function __construct($section_obj, $modo) {
		
		# Verify type section object
		if ( get_class($section_obj) !== 'section') {
			throw new Exception("Error Processing Request. Only sections are accepted in this tool", 1);			
		}

		# Fix current component/section
		$this->section_obj = $section_obj;

		# Fix modo
		$this->modo = $modo;

		$this->setup();	
	}


	public function setup() {		

	}





	/**
	* CREATE_FULL_HTML_PAGE
	* Build a full html page , with all tags and links
	* @return string $full_html_page
	*/
	public static function create_full_html_page( $request_options ) {

		$options = new stdClass();
			$options->page_html 		= '';
			$options->page_title 		= 'Dédalo Tool Layout Page';
			$options->css_classes_html 	= '';
			$options->css_links 		= css::get_css_link_code();
			$options->js_links 			= null;	//js::get_js_link_code();
			$options->js_code 			= null;
			$options->on_load 			= '';
			foreach ($request_options as $key => $value) if (property_exists($options, $key)) { $options->$key = $value; }

		$html  = "<!DOCTYPE html>";
		$html .= "<html xmlns=\"http://www.w3.org/1999/xhtml\">";
		$html .= "\n<head>";
		$html .= "\n<meta http-equiv=\"content-type\" content=\"text/html; charset=utf-8\">";
		//$html .= "\n<title>".$options->page_title."</title>";
		$html .= $options->css_links;
		if (!empty($options->js_code)) {
		$html .= "\n<script>$options->js_code</script>";
		}		
		$html .= "\n</head>";	
		$html .= "\n<body {$options->on_load}>";
		$html .= "\n<div id=\"html_page_wrap\" style=\"display:block\">";
		$html .= "\n<div class=\"content_html\">";
		$html .= $options->page_html;
		$html .= "\n</div>"; //end .content_html
		$html .= "\n</div>"; //end #html_page_wrap
		$html .= "\n</body>";
		$html .= "\n</html>";
		$html .= $options->js_links;

		#return htmLawed($html);
		return trim($html);
		
	}#end create_full_html_page




	/**
	* RENDER_PAGES . Render ALL pages one by one
	* @return string $html
	*/
	public static function render_pages( $request_options ) {		
	
		$options = new stdClass();
			$options->pages 		= array();
			$options->records 		= array();
			$options->render_type 	= 'preview';
			$options->tipo 			= null;	// main section tipo
			foreach ($request_options as $key => $value) if (property_exists($options, $key)) { $options->$key = $value; }

		$precalculated_header_html=false;
		$precalculated_footer_html=false;

		$last_main_section_key=false;

		# RESULT
		$result = new stdClass();
			$result->ar_pages = array();
	
		# Iterate all records
		foreach ($options->records as $rkey => $current_record) {
				#dump($current_record, ' current_record'.to_string());
			
			# Iterate all pages
			$p=1;foreach ((array)$options->pages as $pkey => $current_page) {
					#dump($current_page, ' current_page ++ '.to_string());
					#dump($precalculated_header_html, ' precalculated_header_html ++ $pkey: '.to_string($pkey));

				# Define if header and footer will be rendered.
				# In preview mode, we only need render first page
				if ($options->render_type==='preview' && $p<=1) {
					$header_footer = true;
				}else if ($options->render_type==='preview' && $p>1) {
					$header_footer = false;
				}else{
					$header_footer = true;
				}
				#$header_footer = ($options->render_type=='preview' && $p>1) ? false : true;
					#dump($current_page, ' current_page'.to_string());
				
				$page_tipo = $current_page->data->tipo;
					#dump($page_tipo, ' page_tipo'.to_string());

				$page_key = $p.'_'.$page_tipo.'_'.$current_record['section_id'];

				
					$main_section_key  = null;
					$main_section_tipo = $options->tipo;
					preg_match("/[0-9]+_((.{3,})_[0-9]+)/", $page_key, $output_array);
					# If current pkey is like main section, is assigned. If not main_section_key is maintained
					$current_section 	= $output_array[2];	// Like oh1 from 2_oh1_1
					if ($current_section===$main_section_tipo) {
						$main_section_key = $output_array[1];  // Like oh1_1 from 2_oh1_1
							#dump($main_section_key, " main_section_key ++ main_section_tipo: $main_section_tipo ++ current_section: ".to_string($current_section));
					}
					
					
			
				# 
				# PORTAL CASE
				if (strpos($page_tipo, '_')!==false) { // Portal page
					# Recalculate current record

					$ar_parts 	    = explode('_', $page_tipo); 		#dump($ar_parts, ' ar_parts ++ '.to_string());
					$section_tipo 	= $ar_parts[0];	// Like rsc167 for Audiovisual
					$parent_portal  = $ar_parts[1];	// LIke oh25 for portal Audiovisual in section Oral History
					$parent_portal2 = isset($ar_parts[2]) ? $ar_parts[2] : false;
					$element 		= $current_record;	
						#dump($parent_portal, ' parent_portal ++ '.to_string());
						#dump($parent_portal2, ' parent_portal2 ++ '.to_string());
						#dump($element, ' element ++ '.to_string());
										
					# section parent
					#$section_tipo_general 	= $element['section_tipo'];
						#dump($section_tipo_general, ' section_tipo_general ++ '.to_string());
					#$portal_section 		= component_common::get_section_tipo_from_component_tipo($parent_portal);
						#dump($portal_section, ' section_tipo_general ++ '.to_string($parent_portal));


					if ( !isset($element[$parent_portal]) &&  !isset($element[$parent_portal2]) ) {
						# no data portal exists (in normal when no data is found)
						/*
						trigger_error("Sorry, no portal data exists for parent_portal:$parent_portal");
						if(SHOW_DEBUG) {
							var_dump($element[$parent_portal]);
							dump($element, ' element - parent portal:'.$parent_portal.to_string());
							dump($element[$parent_portal], ' element[parent portal]'.to_string());
							dump($current_record, " current_record page_tipo:$page_tipo - ".to_string("Sorry, no portal data exists for parent_portal:$parent_portal"));
							#throw new Exception("Error Processing Request", 1);							
						}
						*/
							
					}else{					

						# Case level 3 of portal
						if ($parent_portal2) {
							#dump($parent_portal2, ' parent_portal2 ++ '.to_string());
							$portal_data  = json_decode($element[$parent_portal2]);
								#dump($portal_data, ' portal_data ++ '.to_string());

							foreach ((array)$portal_data as $parent_locator) {
								
								$component_portal = component_common::get_instance('component_portal',$parent_portal, $parent_locator->section_id, 'edit', DEDALO_DATA_NOLAN, $parent_locator->section_tipo);
								$dato 			  = $component_portal->get_dato();
									
								foreach ((array)$dato as $current_locator) {								

									# PORTAL SECTION (ONE PAGE BY PORTAL LOCATOR)
									$page_options = new stdClass();
										$page_options->page 	 	= $current_page;
										$page_options->record 	  	= $current_locator;
										$page_options->render_type 	= $options->render_type;
										$page_options->header_footer= $header_footer;

										# Get and inject calculated header / footer	
										# Si ya existe una cabecera precalculada, la usamos
										if($precalculated_header_html) {
											$page_options->page->header->rendered = $precalculated_header_html;
										}																			
									
									$current_page_html = (object)tool_layout_print::render_page( $page_options );										
									
									$result->ar_pages[$page_key.$p] = (string)$current_page_html->html;

									$p++;
									if($options->render_type==='preview') break; // Only one record is needed
								}

							}//end foreach ($portal_data as $current_locator) {


						}else{
							
							# Default
							$portal_data  = json_decode($element[$parent_portal]);
							#dump($portal_data, '$portal_data'.to_string());

							foreach ((array)$portal_data as $current_locator) {
								
								# PORTAL SECTION (ONE PAGE BY PORTAL LOCATOR)
								$page_options = new stdClass();
									$page_options->page 	 	= $current_page;
									$page_options->record 	  	= $current_locator;
									$page_options->render_type 	= $options->render_type;
									$page_options->header_footer= $header_footer;

									# Get and inject calculated header / footer	
									# Si ya existe una cabecera precalculada, la usamos
									if($precalculated_header_html) {
										$page_options->page->header->rendered = $precalculated_header_html;
									}							
								
								$current_page_html = (object)tool_layout_print::render_page( $page_options );									
								
								$result->ar_pages[$page_key.$p] = (string)$current_page_html->html;

								$p++;
								if($options->render_type==='preview') break; // Only one record is needed
							}//end foreach ($portal_data as $current_locator) {

						}//end if ($portal_section != $section_tipo_general) {

					}//end if ( !isset($element[$parent_portal]) &&  !isset($element[$parent_portal2]) ) {
				# 
				# MAIN SECTION CASE
				}else{
					
					# MAIN SECTION (ONLY ONE PAGE BY RECORD)
					$page_options = new stdClass();
						$page_options->page 	 	= $current_page;
						$page_options->record 	  	= $current_record;
						$page_options->render_type 	= $options->render_type;
						$page_options->header_footer= $header_footer;

						# Get and inject calculated header / footer
						# Si la seción es la misma que la anterior y ya se precalculó la cabecera, la usamos																
						if($main_section_key==$last_main_section_key && $precalculated_header_html) {							
							$page_options->page->header->rendered = $precalculated_header_html;													
						}
						
					$current_page_html = (object)tool_layout_print::render_page( $page_options );						

					# Set only one footer / header
					# En cada cambio de registro de sección principal, guardaremos la cabecera calculada
					if ($main_section_key!=$last_main_section_key) {				
						$precalculated_header_html = $current_page_html->header_html;						
					}
					
					$result->ar_pages[$page_key] = (string)$current_page_html->html;

					# Store header / footer html				
					#$result->header_html = $current_page_html->header_html;					

					$p++;
				}//end if (strpos($page_tipo, '_')!==false)
				

				if(SHOW_DEBUG) {
					#dump($precalculated_header_html, "page_key:$page_key - main_section_key:$main_section_key - ".' precalculated_header_html ++ $pkey:'.to_string($pkey));
					//if ($main_section_key!=$last_main_section_key) dump($main_section_key, ' main_section_key ++ last_main_section_key: '.to_string($last_main_section_key));;
				}

				# store last main_section_key
				$last_main_section_key = $main_section_key;
				
			}//end foreach ((array)$options->pages as $pkey => $current_page) {


			if($options->render_type==='preview') break;	// Force break in preview mode
		}//end foreach ($options->records as $key => $current_record) {
		
		
		return (object)$result;
		
	}#end render_pages


	/**
	* RENDER_PAGE
	* @param object $request_options . object|json string $request_options->page 
	* @return string $html
	*/
	/* Data format example :
	{
	    "html_id": "page1",
	    "data": {
	        "section_tipo": "oh1"
	    },
	    "css": {
	        "class": [
	            "page",
	            "fixed"
	        ],
	        "style": {
	            "border": "none"
	        }
	    },
	    "components": [
	        {
	            "html_id": "oh64_1",
	            "data": {
	                "tipo": "oh64",
	                "parent_section": "oh1",
	                "layout_map": {"oh26":["rsc29"]}
	            },
	            "css": {
	                "class": [
	                    "component_boxborder_box",
	                    "dedalo_component"
	                ],
	                "style": {
	                    "position": "absolute",
	                    "left": "25px",
	                    "top": "361px",
	                    "width": "841px",
	                    "height": "133px"
	                }
	            }
	        }
	    ],
	    "header": [
	        {
	            "html_id": "text_1",
	            "content": "Texto dentro de la cabecera"
	        }
	    ]
	}
	*/
	public static function render_page( $request_options  ) {
		$html='';
			//dump($request_options->page, " request_options ".to_string());

		$options = new stdClass();
			$options->page 	 		= false;
			$options->record 		= false;
			$options->render_type 	= 'preview'; // Default preview
			$options->clean_html 	= true;
			$options->header_footer = true;
			foreach ($request_options as $key => $value) if (property_exists($options, $key)) { $options->$key = $value; }			
		
		# Autoconvert string to layout object
		if (is_string($options->page)) {
			$options->page = json_decode($options->page);
		}
		if (!is_object($options->page)) {
			if(SHOW_DEBUG) {
				dump($options->page, " options->page ".to_string());
				trigger_error("Is not object: options->page: ".gettype($options->page) );
			}
			return $html;
		}

		$page 			= $options->page;
		$record 		= $options->record;
		$render_type 	= $options->render_type; 
			#dump($options->header_footer, " options->header_footer ".to_string());

		# PAGE ATTR		
		if ($render_type==='preview') {
			$page_id = $page->html_id;
		}else{
			$page_id = $page->html_id.'_'.	microtime(true);
		}
		$id 		= self::build_attr('id', $page_id);
		$dataset 	= isset($page->data) ? self::build_attr('dataset', $page->data) : '';
		$css_class 	= isset($page->css->class) ? self::build_attr('css_class', $page->css->class) : '';
		$css_style  = isset($page->css->style) ? self::build_attr('css_style', $page->css->style) : '';
		$edit_events= $render_type==='preview' ? self::build_attr('edit_events', null) : '';


		#
		# PAGE OPEN
		# Reference: <div id="page1" class="page fixed" data-section_tipo="oh1" ondrop="Drop(event)" ondragover="dragOver(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)" style="border: none;">
		$html .= "\n<div $id $css_class $css_style $dataset $edit_events >";
			/*
				if ($render_type=='preview99' && isset($page->data->page_type)) {
					# Add page title like: <span class="page_title page_title_fixed">Historia Oral</span>
					$section_tipo = isset($page->data->section_tipo) ? $page->data->section_tipo : "untitled"; 	
					switch ($page->data->page_type) {
						case 'fluid':
							$html .= "\n <span class=\"page_title page_title_fluid\">$section_tipo</span>";
							break;
						
						default:
							$html .= "\n <span class=\"page_title page_title_fixed\">$section_tipo</span>";
							break;
					}				
				}
				*/

			#
			# HEADER
			if( isset($page->header) ) {
				// temporal
				if (is_array($page->header)) { $page->header = reset($page->header); trigger_error("Sorry. page->header must be an object"); }

				if (isset($page->header->rendered) ) {	// && isset($pisuerga_por_valladolid)
					// Calculated before
					$header_html = $page->header->rendered;					
				}else{
					$element_options = new stdClass();
						$element_options->hf_element  = $page->header;					
						$element_options->render_type = $options->render_type;
						$element_options->name 		  = 'header';
						$element_options->record 	  = $record;

					$header_html = self::build_header_footer_html($element_options);
				}
				# Only add to page html when is set to true
				if ($options->header_footer===true) {
				 	$html .= $header_html;
				}				

			}//end header

			#
			# COMPONENTS
			if(isset($page->components)) foreach((array)$page->components as $key => $element) {

				$element_options = new stdClass();
					$element_options->element 	  = $element;
					$element_options->record  	  = $options->record;
					$element_options->render_type = $options->render_type;

				$html .= self::build_component_html($element_options);

			}//end foreach ((array)$page->components as $key => $element) {


			#
			# FREE_TEXT			
			if(isset($page->free_text)) foreach ((array)$page->free_text as $key => $element) {
				
				$element_options = new stdClass();
					$element_options->element 	  = $element;					
					$element_options->render_type = $options->render_type;

				$html .= self::build_free_text_html($element_options);

			}//en if(isset($page->free_text)) foreach ((array)$page->free_text as $key => $element) {

			#
			# FOOTER
			if( isset($page->footer) ) {
				// temporal
				if (is_array($page->footer)) { $page->footer = reset($page->footer); trigger_error("Sorry. page->header must be an object"); }

				if (isset($page->footer->rendered)) {
					// Calculated before
					$footer_html = $page->footer->rendered;	#dump($page->footer->rendered, '$page->footer->rendered ++ '.to_string());
				}else{				
					$element_options = new stdClass();
						$element_options->hf_element  = $page->footer;
						$element_options->render_type = $options->render_type;
						$element_options->name 		  = 'footer';
						$element_options->record 	  = $record;

					$footer_html = self::build_header_footer_html($element_options);					
				}
				# Only add to page html when is set to true
				if ($options->header_footer===true) {
				 	$html .= $footer_html;
				}

			}//end footer


		#
		# PAGE CLOSE
		$html .= "\n</div>";	//<!-- /page $page->html_id -->

		#
		# PAGE BREAK SEPARATOR
		#$html .= "<div class=\"page-break\" style=\"page-break-after: always;\"></div>";

		#
		# CLEAN_HTML
		if ($options->clean_html) {
			$html = htmLawed($html);
		}

		#
		# RETURN OBJECT
		$page_result = new stdClass();
			$page_result->html 		  = (string)$html;
			$page_result->header_html = isset($header_html) ? (string)$header_html : false;
			$page_result->footer_html = isset($footer_html) ? (string)$footer_html : false;


			//dump($page_result, ' page_result'.to_string());

		return (object)$page_result;

	}#end render_page


	/**
	* RENDER_CSS_CLASSES
	* @param object $css_classes
	* @return string $html
	*/
	/* Data format example:
	{
        "page": {
            "position": "absolute",
            "left": "25px",
            "top": "361px",
            "width": "841px",
            "height": "133px"
        },
        "component_box": {
            "position": "absolute",
            "left": "25px",
            "top": "361px",
            "width": "841px",
            "height": "133px"
        }
    }
    */
	public static function render_css_classes($css_classes) {
		$html='';

		# Autoconvert string to layout object
		if (is_string($css_classes)) {
			$css_classes = json_decode($css_classes);
		}
		if (!is_object($css_classes)) {
			return $html;
		}
		#dump($css_classes, " css_classes ".to_string());		

	 	$html .= "\n<style type=\"text/css\">";
	 	foreach ($css_classes as $current_class => $properties) {
	 		if(empty($properties)) continue;

	 		$html .= "\n".$current_class .'{ ';
	 		foreach ($properties as $p_name => $p_value) {
	 			$html .= "\n ".$p_name.':'.$p_value.';';
	 		}
	 		$html .= "\n}";
	 	}
	 	$html .= "\n</style>";

	 	return $html;
		
	}#end render_css_classes



	/**
	* BUILD_COMPONENT_HTML
	* @param object $request_options
	* @return string $component_html
	*/
	public static function build_component_html($request_options) {
		$component_html='';

		$options = new stdClass();
			$options->element 		= false;
			$options->record 	 	= false;
			$options->render_type 	= false;			
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$element 		= $options->element;
		$record 		= (object)$options->record; // Convert array to object for easy select
		$component_tipo = (string)$element->data->component_tipo;
		$section_tipo 	= (string)$element->data->parent_section;	

			#dump($record, ' record'.to_string());	
				
		
		# COMPONENT ATTR
		$id 		= self::build_attr('id', $element->html_id);
		$dataset 	= isset($element->data) ? self::build_attr('dataset', $element->data) : '';
		$css_class 	= isset($element->css->class) ? self::build_attr('css_class', $element->css->class) : '';
		$css_style  = isset($element->css->style) ? self::build_attr('css_style', $element->css->style) : '';
		$edit_events= $options->render_type==='preview' ? self::build_attr('edit_events', null) : '';

		if ($options->record) {	

			# Direct case
			$parent = (int)$record->section_id;

			# From portal case like id=oh26_rsc31
			#if (strpos($element->html_id, '_')!==false) {
				
			#}

			# COMPONENT_HTML			
			$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
			/*
			$component_obj 	= component_common::get_instance(	$modelo_name,
																$component_tipo,
																$parent,
																'print',
																DEDALO_DATA_LANG,
																$section_tipo
																);
			*/
			if( $modelo_name === 'section_group'){
				$component_obj 	= new $modelo_name( $component_tipo,
													$section_tipo,
													'print'
													);

			}else{
				$component_obj 	= new $modelo_name( $component_tipo,
													$parent,
													'print',
													DEDALO_DATA_LANG,
													$section_tipo
													);
			}
			#
			# LAYOUT_MAP : Override (when is received) default component layout_map. For example in portals tha we want show only specific elements
			# dump($element->data->layout_map, '$element->data->layout_map ++ '.to_string());			
			switch (true) {
				case (isset($element->data->layout_map) && is_string($element->data->layout_map)):
					$layout_map = json_decode($element->data->layout_map);
					if ($layout_map) {
						$component_obj->layout_map = (array)$layout_map;
					}
					break;

				case (isset($element->data->layout_map) && is_object($element->data->layout_map)):					
					$component_obj->layout_map = (array)$element->data->layout_map;					
					break;
				
				default:
					$component_obj->layout_map = array();
					break;
			}

			#
			# HTML OPTIONS : Pass options to component to modify html rendered
			# dump($element->data->html_options, '$element->data->html_options ++ '.to_string());
			
			if ( isset($element->data->html_options) ) {
				$html_options=new stdClass();
				if (is_string($element->data->html_options)) {
					$html_options = json_decode($element->data->html_options);
				}else{
					$html_options = clone($element->data->html_options);
				}
				foreach ($html_options as $key => $current_html_options) {					
					if (is_string($current_html_options)) {
						$html_options->$key = json_decode($current_html_options);
					}
				}
				$component_obj->html_options = $html_options;
				if(SHOW_DEBUG) {
					#dump($component_obj->html_options, ' $element->data->html_options ++ '.to_string());
				}
			}

			#
			# PRINT OPTIONS
			# dump($element->data->print_options, '$element->data->print_options ++ '.to_string());
			if ( isset($element->data->print_options) ) {
				$print_options=new stdClass();
				if (is_string($element->data->print_options)) {
					$print_options = json_decode($element->data->print_options);
				}else{
					$print_options = clone($element->data->print_options);
				}
				foreach ($print_options as $key => $current_print_options) {					
					if (is_string($current_print_options)) {
						$print_options->$key = json_decode($current_print_options);
					}
				}
				$component_obj->print_options = $print_options;
				if(SHOW_DEBUG) {
					#dump($component_obj->print_options, ' $element->data->print_options ++ '.to_string());
				}
			}

			

			$component_obj_html = $component_obj->get_html();
			#dump($component_obj->get_valor(), ' component_html'.to_string());
			#dump($component_obj_html, '$component_obj_html'.to_string());
			if(SHOW_DEBUG) {
				// only for view
				/*
				$element->data->parent = $parent;
				$component_obj_html .= " ".to_string($element->data);
				*/
			}

		}else{
			$component_obj_html = "<!-- Component ".$component_tipo." content here -->";			
		}//end if (!$options->record) {

		# Reference: <div id="oh35" class="component_box border_box dedalo_component ui-draggable ui-draggable-handle" data-parent_section="oh1" style="position: absolute; left: 486.5px; top: 295px; width: 380px; height: 293px;">{oh35}</div>
		#$html .= "\n <div $id $css_class $css_style $dataset $edit_events >\n " . $component_html . "\n </div><!-- /component $component->html_id -->";
		$component_html = "<div $id $css_class $css_style $dataset $edit_events >" . trim($component_obj_html) . "</div>";		
	
		return trim($component_html);

	}#end build_component_html


	/**
	* BUILD_FREE_TEXT_HTML
	* @param object $request_options
	* @return string free_text_html
	* Reference: <div id="text1" title="Drag free text box to page" class="editable_text component_box ui-draggable ui-resizable" data-tipo="free_text" style="position: absolute; left: 25px; top: 47px; width: 444px; height: 1046px;">
	* <div class="drag_text_editor ui-draggable-handle" style="display: block;"></div>  
	* <div id="text_editor2" class="editable_text mce-content-body" contenteditable="true" spellcheck="false" style="position: relative;">
	* <p>My content text</p>
	* </div>
	*/
	public static function build_free_text_html( $request_options ) {
		$free_text_html = '';

		$options = new stdClass();
			$options->element 		= false;
			$options->render_type 	= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$element = $options->element;
		if (!$element) return null;

		# ELEMENT ATTR
		$id 		= isset($element->html_id) ? self::build_attr('id', $element->html_id) : '';
		$dataset 	= isset($element->data) ? self::build_attr('dataset', $element->data) : '';
		$css_class 	= isset($element->css->class) ? self::build_attr('css_class', $element->css->class) : '';
		$css_style  = isset($element->css->style) ? self::build_attr('css_style', $element->css->style) : '';
		$edit_events= $options->render_type==='preview' ? self::build_attr('edit_events', null) : '';
		$content 	= isset($element->content) ? $element->content : '';
		$title 		= "title=\"Drag free text box to page\"";

		$free_text_html .= "\n<div $id $css_class $css_style $dataset $edit_events $title >";  // Wrapper in
		$free_text_html .= "\n <div class=\"drag_text_editor ui-draggable-handle\" style=\"display: block;\"></div>"; // Drag selector
		$free_text_html .= "\n <div class=\"editable_text\">";  // Content div in // contenteditable=\"true\" spellcheck=\"false\" style=\"position: relative;\"
		$free_text_html .=  trim($content);
		$free_text_html .= " </div>"; // Content div out
		$free_text_html .= "\n</div>"; // Wrapper out 

		return trim($free_text_html);

	}#end build_free_text_html


	/**
	* BUILD_HEADER_FOOTER_HTML
	* @param object $request_options
	* @return string $header_footer_html
	*/
	public static function build_header_footer_html( $request_options ) {
		$header_footer_html='';

		$options = new stdClass();
			$options->hf_element 	= false;
			$options->render_type 	= false;
			$options->name 			= false;
			$options->record 		= false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		$hf_element = $options->hf_element;		#dump($hf_element, '$hf_element');
		if (!$hf_element) return null;

		if ($options->name==='footer') return '';

		# HF ATTR
		$id 		= isset($hf_element->html_id) ? self::build_attr('id', $hf_element->html_id) : '';
		$dataset 	= isset($hf_element->data) ? self::build_attr('dataset', $hf_element->data) : '';
		$css_class 	= isset($hf_element->css->class) ? self::build_attr('css_class', $hf_element->css->class) : '';
		$css_style  = isset($hf_element->css->style) ? self::build_attr('css_style', $hf_element->css->style) : '';
		$edit_events= $options->render_type==='preview' ? self::build_attr('edit_events', null) : '';
		
		$header_footer_html .= "\n <div $id $css_class $css_style $dataset $edit_events >";

			#
			# COMPONENTS INSIDE HF
			if(isset($hf_element->components)) foreach((array)$hf_element->components as $key => $current_component) {
				$element_options = new stdClass();
					$element_options->element 	  = $current_component;
					$element_options->record  	  = $options->record;
					$element_options->render_type = $options->render_type;

				$header_footer_html .= self::build_component_html($element_options);
			}//end if(isset($hf_element->components)) foreach((array)$hf_element->components as $key => $current_component) {

			#
			# FREE_TEXT			
			if(isset($hf_element->free_text)) foreach ((array)$hf_element->free_text as $key => $element) {
				
				$element_options = new stdClass();
					$element_options->element 	  = $element;					
					$element_options->render_type = $options->render_type;

				$header_footer_html .= self::build_free_text_html($element_options);
			}//en if(isset($hf_element->free_text)) foreach ((array)$hf_element->free_text as $key => $element) {

			if ($options->name==='footer') {
				#$header_footer_html .= "<div class=\"pagination_info\">Page <span class=\"var_pdf_page\">X</span> of <span class=\"var_pdf_topage\">X</span></div>";
			}
			

		$header_footer_html .= "</div><!-- /$options->name -->";

		if ($options->name==='footer') {
			/*
			$header_footer_html .="
			<script>
			<![CDATA[
			  function subst() {
			    var vars={};
			    var x=window.location.search.substring(1).split('&');
			    for (var i in x) {var z=x[i].split('=',2);vars[z[0]] = unescape(z[1]);}
			    var x=['frompage','topage','page','webpage','section','subsection','subsubsection'];
			    for (var i in x) {
			      var y = document.getElementsByClassName('var_pdf_'+x[i]);
			      for (var j=0; j<y.length; ++j) y[j].textContent = vars[x[i]];
			    }
			  }
			  ]]>
			  </script>";
			  */
		}

		return trim($header_footer_html);

	}#end build_header_footer_html


	/**
	* BUILD_ATTR
	* @return string $attr
	*/
	public static function build_attr($type, $data=null) {
		$attr='';

		switch ($type) {
			case 'id':
				$attr = "id=\"".$data."\"";
				break;
			case 'dataset':
				$data_set='';
				if(empty($data)) return $data_set;
				foreach ((array)$data as $key => $value) {
					if (!is_string($value) && !is_int($value)) {
						$value = json_encode( $value );
						//$value = stripslashes($value);
						$data_set .= "data-{$key}='".$value."'";
					}else{
						$data_set .= 'data-'.$key.'="'.stripslashes($value).'"';
					}					
				}
				$attr = trim($data_set);
				break;
			case 'css_class':
				$attr .= 'class="'. implode(' ', $data).'"';
				break;
			case 'css_style':				
				$str_properties = '';
				foreach ($data as $key => $value) {
					$str_properties .= $key.':'.$value.';';
				}
				$attr .= 'style="'.$str_properties.'"';				
				break;
			case 'edit_events':
				#$attr .= 'ondrop="Drop(event)" ondragover="dragOver(event)" ondragenter="dragEnter(event)" ondragleave="dragLeave(event)"';
				$attr .='';
				break;
		}
		return $attr;
	}#end build_attr












	/**
	* GET_TEMPLATES_PUBLIC
	* @param string $type like 'public' / 'private'
	* @return array $ar_layout_obj
	*/
	protected function get_ar_templates($type){

		switch ($type) {
			case 'public':
				$component_section_tipo = DEDALO_LAYOUT_PUBLIC_COMPONENT_SECTION_TIPO; 	
				$component_label_tipo 	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LABEL_TIPO;	//'dd38';
				$component_layout_tipo	= DEDALO_LAYOUT_PUBLIC_COMPONENT_LAYOUT_TIPO;	
				$matrix_table 			= 'matrix_layout';				
				$section_layout_tipo 	= DEDALO_SECTION_LAYOUT_PUBLIC_TIPO;
				break;
			
			case 'private':
				$component_section_tipo = DEDALO_LAYOUT_TEMPLATES_COMPONENT_SECTION_TIPO;
				$component_label_tipo 	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LABEL_TIPO;	//'dd29';
				$component_layout_tipo	= DEDALO_LAYOUT_TEMPLATES_COMPONENT_LAYOUT_TIPO;
				$matrix_table 			= 'matrix_layout_dd';
				$section_layout_tipo 	= DEDALO_SECTION_LAYOUT_TEMPLATES_TIPO;
				break;
			default:
				throw new Exception("Error Processing Request. remplate type invalid", 1);
				
		}
		$section_tipo	= $this->section_obj->get_tipo();
		$layout_records = self::search_layout_records($component_section_tipo, $section_tipo, $matrix_table);

		$ar_layout_obj=array();
		foreach ($layout_records as $section_id) {

			$component_label  = component_common::get_instance('component_input_text', $component_label_tipo, $section_id, 'list', DEDALO_DATA_LANG, $section_layout_tipo); 
			$component_layout = component_common::get_instance('component_layout', $component_layout_tipo, $section_id, 'list', DEDALO_DATA_NOLAN, $section_layout_tipo);
			
			$layout_obj = new stdClass();
				$layout_obj->section_id				= $section_id;
				$layout_obj->type 					= $type;
				$layout_obj->section_layout_tipo 	= $section_layout_tipo;		
				$layout_obj->label 					= $component_label->get_valor(0);				
				$layout_obj->section_layout_dato 	= $component_layout->get_dato();
				$layout_obj->component_layout_tipo  = $component_layout_tipo;				

			$array_key = $section_layout_tipo.'_'.$section_id;

			$ar_layout_obj[$array_key] = $layout_obj;
		}
		return $ar_layout_obj;
	}


	/**
	* SEARCH_LAYOUT_RECORDS
	* @param string $section_tipo like oh1
	* @param string $component_section_tipo like dd67	
	* @return array $ar_section_id array of int id matrix
	*/
	protected static function search_layout_records($component_section_tipo, $section_tipo, $matrix_table) {

		$filter = JSON_RecordObj_matrix::build_pg_filter('gin','datos',$component_section_tipo,DEDALO_DATA_NOLAN,$section_tipo);
		
		$strQuery  = '';
		$strQuery .= ' SELECT section_id ';
		$strQuery .= ' FROM ' . $matrix_table;
		$strQuery .= ' WHERE ' . $filter;
			#dump($strQuery," ");die();
		$result	= JSON_RecordObj_matrix::search_free($strQuery);
		
		$ar_section_id=array();
		while ($rows = pg_fetch_assoc($result)) {
			$ar_section_id[] = $rows['section_id'];
		}#end while
		return $ar_section_id;
	}


	/**
	* GET_AR_COMPONENTS
	* Get array of all components of received section
	* @param string $section_tipo like dd20
	* @param array $ar_id_matrix range of records selected in list view
	* @return array $ar_section_resolved array of components in modo print
	*/
	protected function get_ar_components($section_tipo, $record, $resolve_virtual=false){

		$record = (object)$record;
			#dump($record, ' record');
		if(isset($record->section_id)) {
			$parent = (int)$record->section_id;
		}else{
			$parent = NULL;
		}
		 
		#$record_section_tipo = (string)$record->section_tipo;
		
		$ar_components_tipo = section::get_ar_children_tipo_by_modelo_name_in_section($section_tipo, $modelos_name = array('component_','section_group'), false, $resolve_virtual); #Important cache false
		//dump($ar_components_tipo,"ar_components_tipo");
		
		if(SHOW_DEBUG) {
			//dump($ar_components_tipo,"ar_components_tipo");
		}
		$ar_include_components = array(
			'component_input_text',
			'component_text_area',
			'component_filter',
			'component_email',
			'component_check_box',
			'component_autocomplete',
			'component_autocomplete_ts',
			'component_date',
			'component_radio_button',
			'component_select',
			'component_select_lang',
			'component_portal',
			'component_av',
			'component_image',
			'section_group',
			//'component_pdf',
			);

		$i=1;
		foreach ($ar_components_tipo as $key => $component_tipo) {
			
			if ($i>10) { // TEMPORAL LIMIT FOR SIMPLICITY
				#continue;
			}

			$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo, true);
				#error_log($modelo_name);
			
			if (!in_array($modelo_name, $ar_include_components)) {
				continue;
			}
			/**/
			if($modelo_name === 'section_group'){

				$component = new $modelo_name($component_tipo, $section_tipo, 'print');

				$print_options = new stdClass();
					$print_options->show_label = true;
				$component->print_options = $print_options;
				
				$ar_section_resolved[$section_tipo][$component_tipo] = $component;
				#$ar_components[$value] = RecordObj_dd::get_termino_by_tipo($value);

			}else if($modelo_name === 'component_portal'){
			
				$RecordObj_dd = new RecordObj_dd($component_tipo);
				$ar_relaciones = $RecordObj_dd->get_relaciones();
				//dump($ar_relaciones,"ar_relaciones");
				#$parent    = reset($ar_id_matrix);			
				$component = component_common::get_instance($modelo_name, $component_tipo, $parent, 'print',DEDALO_DATA_NOLAN, $section_tipo);
				$ar_section_resolved[$section_tipo][$component_tipo]['portal'] = $component;
				$ar_component_dato = (array)$component->get_dato();
				$component_dato = reset($ar_component_dato);

				
				/*
				$component_dato = Array();
				
				foreach ($ar_component_dato as $key => $dato) {
					$component_dato[] = $dato->section_id_matrix;
				}
				*/
				//dump($ar_component_dato,"ar_component_dato");
				//$component_dato    = get_object_vars($ar_component_dato);

				//dump($component_dato,"component_dato");
				foreach ($ar_relaciones as $key => $relaciones) {
					foreach ($relaciones as $modelo => $componente_tipo_relationed) {
						$modelo_name = RecordObj_dd::get_termino_by_tipo($modelo, null, true);
						if($modelo_name === 'section'){
							//$section_real_tipo = section::get_section_real_tipo_static($componente_tipo);
							$ar_section_resolved[$section_tipo][$component_tipo]['section'] = $this->get_ar_components($componente_tipo_relationed, $component_dato, $resolve_virtual=true);
							#$ar_section_resolved['all_sections'][]=$componente_tipo_relationed; 
						};			
					}
					//dump($value,"value");
					//$modeloID 	 = key($value);
					//$modelo_name = RecordObj_dd::get_termino_by_tipo($key, null, true);
					//dump($modelo_name,"modelo_name $key");
				}
				

			}else{
				
				#$parent    = reset($ar_id_matrix);			
				#$component = component_common::get_instance($modelo_name, $component_tipo, $parent, 'print',DEDALO_DATA_LANG,$section_tipo);
				$component = new $modelo_name($component_tipo, $parent, 'print',DEDALO_DATA_LANG,$section_tipo);

				$print_options = new stdClass();
					$print_options->show_label = true;
				$component->print_options = $print_options;
				
				$ar_section_resolved[$section_tipo][$component_tipo] = $component;
				#$ar_components[$value] = RecordObj_dd::get_termino_by_tipo($value);
			}

			//$i++;
		}
		#dump($ar_section_resolved,"ar_components");
		#die();
		return $ar_section_resolved;

	}//end get_ar_components



	/**
	* RENDER_RECORDS
	* @return 
	*/
	public static function render_records_DEPRECATED( $request_options ) {

		$options = new stdClass();
			$options->section_target_tipo 	= false;
			$options->section_layout_id 	= false;
			$options->component_layout_tipo = false;
			$options->section_layout_tipo 	= false;
			foreach ($request_options as $key => $value) { if (property_exists($options, $key)) $options->$key = $value; }
			#dump($options, ' options');	die();

		#
		# LAYOUT DATA
		$component_layout = component_common::get_instance('component_layout', $options->component_layout_tipo, $options->section_layout_id, 'edit', DEDALO_DATA_NOLAN, $options->section_layout_tipo);
		$html_template    = (object)$component_layout->get_dato();
			#dump($dato, ' dato '); return;

		$template_data = self::process_template( $html_template->edit ); 
		return;

		#
		# RECORDS DATA
		$search_options_session_key = 'section_'.$options->section_target_tipo;
		if (!isset($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key])) {
			throw new Exception("Error Processing Request: search_options for $search_options_session_key not found", 1);			
		}
		$options_search_from_user   = clone($_SESSION['dedalo4']['config']['search_options'][$search_options_session_key]);

			$options_search_from_user->search_options_session_key 	= 'current_edit';
			$options_search_from_user->modo 						= 'edit';
			$options_search_from_user->offset 						= false;
			$options_search_from_user->limit 						= false;
			$options_search_from_user->layout_map					= array();
				#dump($options_search_from_user," options_search_from_user");die();
		
		$rows_data = search::get_records_data($options_search_from_user);
			#dump($rows_data,"rows_data "); die();

		foreach ($rows_data->result as $key => $ar_value) {
			#dump($ar_value);
			

			# RENDER TEMPLATE . Render with first record of $tool_layout_print_records
			#dump($section_layout_dato->edit,"section_layout_dato->edit");
			$section_layout_rendered = (string)component_layout::render_template_full( $html_template->edit, reset($ar_value) );
			return $section_layout_rendered;
			
			#dump($section_layout_rendered, ' section_layout_rendered '); break;

		}//end foreach ($rows_data->result as $key => $value) {

			/*
			#
				# RENDER TEMPLATE . Render with first record of $tool_layout_print_records
				#dump($section_layout_dato->edit,"section_layout_dato->edit");
				$section_layout_dato->edit = (string)component_layout::render_template_full( (string)$section_layout_dato->edit, reset($tool_layout_print_records) ) ;
			*/

	}#end render_records





	/**
	* PROCESS_TEMPLATE
	* Get html code and create a template with apropiated substitutions
	* @param string $html_string . template page html
	* @return string $html_template
	* @see Documentation: http://simplehtmldom.sourceforge.net/manual.htm
	* @see Used in tool_layout_print
	*/
	public static function process_template__DEPRECATED( $html_string ) {

		include DEDALO_ROOT . '/lib/dom/simple_html_dom.php';
		
		# Load to DOM parser
		$html = str_get_html($html_string);
			#dump($html, ' html'); return;
		
		# Find elements by class (like jquery)
		$ar_pages_box = (array)$html->find('div[class=page]');
			dump($ar_pages_box, ' ar_pages_box');

			return;
		
		foreach ($ar_component_box as $key => $box) {

			# Component_tipo is id attr
			$component_tipo = $box->id;			
				#dump($box->id," ");

			# Replace DOM element content with template var (like Smarty..)
			$box->innertext = '{'.$component_tipo.'}';
		}
		
		# Dumps the internal DOM tree back into string 
		$html_template = trim($html->save());
			#dump( htmlspecialchars($html_template) );

		return (string)$html_template;

	}//end process_template



	/**
	* GET_URLS_GROUP_BY_SECTION
	* Group arra of url's by section to generate indivudual pdf for section
	* @return array $urls_group_by_section
	*/
	public function get_urls_group_by_section( $ar_pages, $section_tipo, $print_files_path, $pages_html_temp ) {
		
		$main_section_tipo 		= $section_tipo;
		$urls_group_by_section 	= array();
		foreach ($ar_pages as $pkey => $current_page) {

			preg_match("/[0-9]+_((.{3,})_[0-9]+)/", $pkey, $output_array);
			# If current pkey is like main section, is assigned. If not main_section_key is maintained
			$current_section 	= $output_array[2];	// Like oh1 from 2_oh1_1
			if ($current_section===$main_section_tipo) {
				$main_section_key = $output_array[1];  // Like oh1_1 from 2_oh1_1
					#dump($main_section_key, ' main_section_key ++ '.to_string());
			}
			
			$request_options = new stdClass();
				$request_options->page_html = $current_page;
				#$request_options->js_links  = js::build_tag( DEDALO_LIB_BASE_URL."/tools/tool_layout_print/js/wkhtmltopdf.js?t=".time() );
			$current_page_complete = tool_layout_print::create_full_html_page( $request_options );

			#dump($current_page, ' current_page'.to_string());
			$html_file_name = $pages_html_temp.'/'.$pkey.'.html';
			file_put_contents($html_file_name, $current_page_complete);

			$url = 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/'. $pkey.'.html';			
			$urls_group_by_section[$main_section_key][] 	= $url;
			
		}//end foreach ($ar_pages as $pkey => $current_page) {

		return $urls_group_by_section;

	}#end get_urls_group_by_section



	/**
	* GET_AR_COMMAND
	* @return array ar_command . Array of objects
	*/
	public function get_ar_command( $urls_group_by_section, $print_files_path, $pages_html_temp, $footer_html_url ) {
		
		$ar_command=array();
		foreach ($urls_group_by_section as $key => $ar_url) {

			$pdf_path 	= $pages_html_temp . '/'.$key.'_print.pdf';
			$pdf_url	= 'http://'.DEDALO_HOST . DEDALO_MEDIA_BASE_URL . $print_files_path .'/'.$key.'_print.pdf';
			$label 		= $key;

			$command  = DEDALO_PDF_RENDERER ." ";	//. " --no-stop-slow-scripts --debug-javascript --javascript-delay $javascript_delay ";
			if(SHOW_DEBUG) {
				#$command .= "-L 10 -R 10 -T 10 -B 20 ";	// -q (quiet)
				$command .= "-L 10 -R 10 -T 10 -B 20 -q ";	
			}else{
				$command .= "-L 10 -R 10 -T 10 -B 20 --load-error-handling ignore --load-media-error-handling ignore -q ";	// -q (quiet)	
			}								
			#$command .= "--header-html '$header_html_url' ";
			# footer custom							
			$command .= "--footer-html '$footer_html_url' ";
			# footer automatic
			#$command .= "--footer-center \"Page [page] of [toPage]\" --footer-font-size 9 ";			
			$command .= implode(" ", $ar_url)." "; //" '$url'";								
			$command .= "'$pdf_path' ";


			$command_obj = new stdClass();
				$command_obj->command 	= rawurlencode($command);
				$command_obj->pdf_path 	= rawurlencode($pdf_path);
				$command_obj->pdf_url 	= rawurlencode($pdf_url);
				$command_obj->label 	= rawurlencode($label);

			$ar_command[] = $command_obj;
		}

		return $ar_command;

	}#end get_ar_command
	
	
};#end tool_layout_print
?>