<?php
/*
* CLASS DIFFUSION_rdf
* Se encarga de gestionar el trasvase de datos desde Dédalo 4 hacia ficheros RDF
*/



/**
* DIFFUSION_RDF
* @param int $section_id
* @param array $rdf_wrapper
*/
class diffusion_rdf extends diffusion {


	public $section_id;
	public $rdf_wrapper;	// Array of rdf wrapper lines to inject body content at element $rdf_wrapper[rdf_value]


	/**
	* BUILD_RDF_OBJECT
	* Read structure elements recursively and create a stdClass object with all elements hierchically
	* @param string $rdf_tipo Like 'dd1287'
	* @return object
	*/
	public function build_rdf_object( $rdf_tipo ) {
		
		$RecordObj_dd 	 = new RecordObj_dd($rdf_tipo);
		$name 		 	 = RecordObj_dd::get_termino_by_tipo($rdf_tipo);
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($rdf_tipo,true);
		$ar_elements 	 = $RecordObj_dd->get_ar_childrens_of_this();

		$rdf_object 			 = new stdClass();
		$rdf_object->name 		 = $name;
		$rdf_object->modelo_name = $modelo_name;
		$rdf_object->tipo 		 = $rdf_tipo;
		$rdf_object->propiedades = $RecordObj_dd->get_propiedades(true);
		$rdf_object->ar_related	 = $RecordObj_dd::get_ar_terminos_relacionados($rdf_tipo, $cache=true, $simple=true);
		$rdf_object->data = array();		

		#
		# RDF ELEMENTS		
		foreach ((array)$ar_elements as $current_element_tipo) {

			$rdf_object->data[] = $this->build_rdf_object( $current_element_tipo );
			
		}//end foreach ($ar_elements as $curent_children_tipo) { 

		return $rdf_object;
		
	}#end build_rdf_object






	/**
	* PARSE_RDF_OBJECT
	* @return string $parsed_obj
	*/
	public function parse_rdf_object( $rdf_object, $section_tipo, $section_id, $reset=true ) {
			
		static $parse;

		if ($reset) {
			$parse = '';
		}
		
		#$parse .= self::resolve_rdf_object( $rdf_object );	
		$resolved = (object)self::resolve_rdf_object( $rdf_object, $section_tipo, $section_id );
			#dump($rdf_object->propiedades->is_header, ' rdf_object ++ '.to_string());		
		
		#
		# IN TAG
		$parse .= isset($resolved->in_tag) ? $resolved->in_tag : '';

			#
			# DATA INSIDE
			$data = $rdf_object->data;			
			if (empty($data)) {

				#
				# VALUE TAG
				$parse .= isset($resolved->value_tag) ? $resolved->value_tag : '';

				#
				# OUT TAG
				$parse .= isset($resolved->out_tag) ? $resolved->out_tag : '';				

			}else{
				
				$n_childrens=count($data);
				
				$i=1; foreach ($data as $data_obj) {
					
					
					if ( $rdf_object->modelo_name=='rdf:subject' &&
						 $data_obj->modelo_name=='rdf:subject' &&
						 !isset($added_close) )
					{ //!empty($data_obj->data)

						$parse .= ">";//">XXX[$data_obj->tipo]XXX";
						$added_close=true;
					}

					#
					# RECURSION
					$this->parse_rdf_object( $data_obj, $section_tipo, $section_id, false );


					if ($i==$n_childrens && !isset($added_close) && !empty($rdf_object->ar_related)) {	//rdf:predicate
						$parse .= ">"; //$parse .="YYY[$data_obj->tipo]YYY";
						$added_close=true;
					}					
					
				$i++;}//end foreach ($data as $data_obj) {
				

				#
				# VALUE TAG
				$parse .= isset($resolved->value_tag) ? $resolved->value_tag : '';

				#
				# OUT TAG
				if ($n_childrens==1 && $data_obj->modelo_name=='rdf:predicate' && empty($rdf_object->ar_related)) {	//&& $rdf_object->modelo_name=='rdf:predicate'	&& empty($rdf_object->ar_related)					
					$parse .= '/>';					
				}else{
					$parse .= isset($resolved->out_tag) ? $resolved->out_tag : '';
				}				
				
			}//end if (!empty($data)) {
		

		return $parse;		
		
	}#end parse_rdf_object





	/**
	* RESOLVE_RSF_OBJECT
	* @return object $resolved
	*/
	public static function resolve_rdf_object( $received_rdf_object, $section_tipo, $section_id ) {

		$resolved = new stdClass();
		
		# Clean cloned object
		$rdf_object = clone($received_rdf_object);
		#unset($rdf_object->data);
		$rdf_object->data = count($rdf_object->data);
	
			#dump($rdf_object, 'rdf_object ++ '.to_string());

		$name 		 = $rdf_object->name;
		$modelo_name = $rdf_object->modelo_name;
		$tipo 		 = $rdf_object->tipo;
		$ar_related  = $rdf_object->ar_related;
		$propiedades = isset($rdf_object->propiedades) ? $rdf_object->propiedades : false;
		$type 		 = isset($rdf_object->propiedades->type) ? $rdf_object->propiedades->type : 'default';
		

		#
		# RESOLVE BY TYPE
		$value=''; switch ($type) {

			case 'fixed_value':
				// Eg. rdf:datatype="xsd:decimal"
				$fixed_value = isset($propiedades->value) ? $propiedades->value : null;
				$value = " $name=\"$fixed_value\"";
				break;
			
			case 'fixed_uri':
				// Eg. xmlns:dcterms="http://purl.org/dc/terms/"
				$base_uri = isset($propiedades->base_uri) ? $propiedades->base_uri : null;
				$value = " $name=\"$base_uri\"";
				break;

			case 'image_uri':
				//
				$base_uri  = isset($propiedades->base_uri)  ? $propiedades->base_uri : null;
				$media_uri = isset($propiedades->media_uri) ? $propiedades->media_uri : new stdClass();

					$quality 	 	= $media_uri->quality;
					$portal_tipo 	= $media_uri->portal_tipo;
					$component_tipo = $media_uri->component_tipo;

					# Resolve image
					# Portal
					$portal_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($portal_tipo,true); if($portal_modelo_name!='component_portal') throw new Exception("Error Processing Request. Only component_portal is aceppted", 1);
					$component_portal 	= component_common::get_instance(	$portal_modelo_name,
																			$portal_tipo,
																			$section_id,
																			'list',
																			DEDALO_DATA_NOLAN,
																			$section_tipo);
					$portal_dato = (array)$component_portal->get_dato();
					# Component image
					if (reset($portal_dato)) {
						$locator = reset($portal_dato);

						$img_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true); if($img_modelo_name!='component_image') throw new Exception("Error Processing Request. Only component_image is aceppted", 1);
						$component_obj 	 = component_common::get_instance(	$img_modelo_name,
																			$component_tipo,
																			$locator->section_id,
																			'list',
																			DEDALO_DATA_NOLAN,
																			$locator->section_tipo);
						$aditional_path = $component_obj->get_aditional_path();
						$image_id = $component_obj->get_target_filename();							
					
						$media_uri_string = $quality . $aditional_path . '/' . $image_id ;							

					}else{

						$media_uri_string = $quality .'/undefined' ;
					}
					#dump($media_uri_string, ' media_uri_string ++ '.to_string( $component_tipo ));
				
				$value = " $name=\"{$base_uri}{$media_uri_string}\"";	
				break;

			case 'add_uri':
				// Eg. xmlns:dcterms="http://purl.org/dc/terms/" + []
				$base_uri = isset($propiedades->base_uri) ? $propiedades->base_uri : null;
				$add_uri  = isset($propiedades->add_uri) ? $propiedades->add_uri : array();
				
				$add_uri_string='';foreach((array)$add_uri as $component_tipo) {
					
					# Resolve value
					$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
					if ($ct_modelo_name=='component_section_id') {
						$value = $section_id;
					}else{
						$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						$component_obj 	 = component_common::get_instance(	$ct_modelo_name,
																			$component_tipo,
																			$section_id,
																			'list',
																			DEDALO_DATA_LANG,
																			$section_tipo);
						$dato = $component_obj->get_valor();
							#dump($dato, ' dato ++ '.to_string( $related_tipo ));
						$value = $dato;	
					}
					$add_uri_string .= $value;
					$add_uri_string .= $component_tipo!=end($add_uri) ? '/' : '';
				}
				$value = " $name=\"{$base_uri}{$add_uri_string}\"";			
				break;	

			case 'var_uri';
				// Eg. http://domain.com/catalog/ + '?id=14527'
				$base_uri = isset($propiedades->base_uri) ? $propiedades->base_uri : null;
				$var_uri  = isset($propiedades->var_uri)  ? $propiedades->var_uri : array();
				
				$var_uri_string=''; foreach((array)$var_uri as $key => $component_tipo) {
					
					if ($key=='#') {

						$value = $component_tipo;
						if (substr($var_uri_string, -1)=='&' ) {
							$var_uri_string = substr($var_uri_string, 0, -1);
						}
						$var_uri_string .= $value;
					
					}else{

						# Resolve value
						$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
						if ($ct_modelo_name=='component_section_id') {
							$value = $section_id;
						}else{						
							$ct_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($component_tipo,true);
							$component_obj 	 = component_common::get_instance(	$ct_modelo_name,
																				$component_tipo,
																				$section_id,
																				'list',
																				DEDALO_DATA_LANG,
																				$section_tipo);
							$dato = $component_obj->get_valor();
								#dump($dato, ' dato ++ '.to_string( $ct_modelo_name ));
							$value = $dato;
						}
						$var_uri_string .= "$key=$value";
					}
					
					$var_uri_string .= ($component_tipo!=end($var_uri)) ? '&' : '';
					
				}
				$value = " $name=\"{$base_uri}?{$var_uri_string}\"";
				break;
		
			default:
				// Without type 
				foreach ((array)$ar_related as $related_tipo) {
					# Resolve value
					$rel_modelo_name = RecordObj_dd::get_modelo_name_by_tipo($related_tipo,true);
					$component_obj 	 = component_common::get_instance(	$rel_modelo_name,
																		$related_tipo,
																		$section_id,
																		'list',
																		DEDALO_DATA_LANG,
																		$section_tipo);
					$dato = $component_obj->get_valor();
						#dump($dato, ' dato ++ '.to_string( $related_tipo ));
					$value = $dato;	
				}

				#if(!isset($value)) $value = "\n>> Default value for ".$name." - $modelo_name - $tipo - $type" ;
				break;
		}

		/*
		<nmo:hasDiameter 300 x 200
		  rdf:datatype="xsd:decimal"
		</nmo:hasDiameter>
		*/
		# BUILD TAGS BY MODELO_NAME
		switch ($modelo_name) {
			case 'rdf:subject':
				# IN
				$resolved->in_tag  = '';
				$resolved->in_tag .= "\n<$name";
				if($rdf_object->data==0) $resolved->in_tag .= ">";	// Without childrens				

				# VALUE
				$resolved->value_tag = trim($value);			
				
				# OUT
				$resolved->out_tag = '';
				if($rdf_object->data>0) {
					$resolved->out_tag .= "";
				}else{
					$resolved->out_tag .= "";
				}
				if (empty($ar_related)) {
					$resolved->out_tag .= "\n";
				}else{

				}
				$resolved->out_tag .= "</$name>";
				break;
			
			case 'rdf:predicate':
				$resolved->in_tag  	 = '';
				$resolved->value_tag = $value;
				
				$resolved->out_tag 	 = '';				
				break;
		}


		return (object)$resolved;
		

	}#end resolve_rdf_object



	/**
	* BUILD_RDF_WRAPPER
	* Array of rdf wrapper lines to inject body content at element $rdf_wrapper[rdf_value]
	* @return 
	*/
	public function build_rdf_wrapper( $rdf_tipo ) {

		$ar_lines = array();	

		$RecordObj_dd 	 = new RecordObj_dd($rdf_tipo);
		$name 		 	 = RecordObj_dd::get_termino_by_tipo($rdf_tipo);
		$modelo_name 	 = RecordObj_dd::get_modelo_name_by_tipo($rdf_tipo,true);
		$ar_elements 	 = $RecordObj_dd->get_ar_childrens_of_this();

		$rdf_object 			 = new stdClass();
		$rdf_object->name 		 = $name;
		$rdf_object->modelo_name = $modelo_name;
		$rdf_object->tipo 		 = $rdf_tipo;
		$rdf_object->propiedades = (object)$RecordObj_dd->get_propiedades(true);
		$rdf_object->ar_related	 = $RecordObj_dd::get_ar_terminos_relacionados($rdf_tipo, $cache=true, $simple=true);
		$rdf_object->data = array();	

		# XML LINE
		$ar_lines['xml'] = $rdf_object->propiedades->value;	// Like '<?xml version="1.0" encoding="utf-8" ..'


		# RDF
		$rdf_element 	= new RecordObj_dd($ar_elements[0]);
		$name 		  	= RecordObj_dd::get_termino_by_tipo($ar_elements[0]);
		$modelo_name 	= RecordObj_dd::get_modelo_name_by_tipo($ar_elements[0],true);
		$ar_elements 	= $rdf_element->get_ar_childrens_of_this();
			#dump($ar_elements, ' ar_elements ++ '.to_string());

			# RDF PREDICATES
			$rdf_predicates = '';
			foreach ($ar_elements as $children_tipo) {
				$modelo_name = RecordObj_dd::get_modelo_name_by_tipo($children_tipo,true);
				if ($modelo_name=='head') {
					
					$rdf_head 	 	  = new RecordObj_dd($children_tipo);				
					$ar_head_elements = $rdf_head->get_ar_childrens_of_this();
					foreach ($ar_head_elements as $head_element_tipo) {
						#dump($head_element_tipo, ' head_element_tipo ++ '.to_string());
						$head_name 			= RecordObj_dd::get_termino_by_tipo($head_element_tipo);
						$head_element		= new RecordObj_dd($head_element_tipo);
						$head_propiedades 	= (object)$head_element->get_propiedades(true);
						// Eg. xmlns:dcterms="http://purl.org/dc/terms/"
						$base_uri = isset($head_propiedades->base_uri) ? $head_propiedades->base_uri : null;
						$value = " $head_name=\"$base_uri\"";

						$rdf_predicates .= $value;
					}
					break;
				}
			}//end foreach ($ar_elements as $children_tipo) {		


		# RDF LINE
		$ar_lines['rdf_in'] 	= "<".$name.$rdf_predicates.">";
		$ar_lines['rdf_value'] 	= ""; // To fill later
		$ar_lines['rdf_out'] 	= "</$name>";			

		#dump($ar_lines, '$ar_lines ++ '.to_string()); exit();
		$this->rdf_wrapper = $ar_lines;

		return $ar_lines;

	}#end build_rdf_wrapper



	/**
	* BUILD_XML_FILE
	* @param object $request_options
	* @return object $response
	*/
	public function build_xml_file( $request_options ) {

		# Maximum execution time seconds
		set_time_limit(600);

		$start_time=microtime(1);

		$response = new stdClass();
			$response->result 	= false;
			$response->msg 		= '';
		
		$options = new stdClass();
			$options->xml_tipo 			= null;
			$options->xml_validate 		= true;
			$options->xml_format_output = true;
			$options->section_tipo 		= null;
			$options->ar_section_id		= array();
			$options->save_to_file_path = false;
			foreach ($request_options as $key => $value) {if (property_exists($options, $key)) $options->$key = $value;}

		#
		# WRAPPER
		$xml_tipo 	 = $options->xml_tipo;	// Like mupreva2190 for 'Numisma RDF'
		$rdf_wrapper = $this->build_rdf_wrapper( $xml_tipo );

		#
		# BODY
		$body_tipo = RecordObj_dd::get_ar_terminoID_by_modelo_name_and_relation($xml_tipo, 'body', 'children_recursive', $search_exact=true)[0];
			#dump($body_tipo, ' $body_tipo ++ '.to_string());

		# RDF_OBJECT
		$rdf_object = $this->build_rdf_object($body_tipo);
			#dump($rdf_object, ' $rdf_object ++ '.to_string());

		# PARSE RDF_OBJECT
		$ar_element=array();
		foreach ($options->ar_section_id as $section_id) {
			$element = $this->parse_rdf_object($rdf_object, $options->section_tipo, $section_id);
				#dump(diffusion_rdf::$parse, ' diffusion_rdf::$parse ++ '.to_string());
			$ar_element[] = $element;
		}

		# INJECT VALUE ON WRAPPER
		$rdf_wrapper['rdf_value'] = implode("\n", $ar_element);

		# Create final string
		$rdf_wrapper_string 	  = implode("\n", $rdf_wrapper);

		#
		# XML. Verify xml format is valid and format output	
		$xml_string = self::xml_object($rdf_wrapper_string, $options->xml_validate, $options->xml_format_output);

			$response->msg[]  = "xml_string created successfully";	// .": \n".htmlspecialchars($xml_string);
			$response->result = true;	//$xml_string;			

		#
		# SAVE FILE
			if ($options->save_to_file_path) {
				if( file_put_contents($options->save_to_file_path, trim($xml_string)) ){
					$response->msg[]  = "File is saved successfully to: $options->save_to_file_path";
				}
			}
			
		$total_time=round(microtime(1)-$start_time,3);
		$response->debug[] = "Generated [".count($options->ar_section_id)." elements] in $total_time secs";

		return $response;

	}#end build_xml_file



	/**
	* XML_OBJECT
	* Verify xml format is valid and format output
	* @return string $xml_string
	*/
	public static function xml_object( $string, $xml_validate=true, $xml_format_output=true ) {
		
		#
		# TIDY MODE
		/* 
			$config = array(
			            'indent'       => true,
			            'output-xml'   => true,
			            'input-xml'    => true,
			            'wrap'         => '1000');
			$tidy = new tidy();
			$tidy->parseString($string, $config, 'utf8');
			$tidy->cleanRepair();
			echo $final = tidy_get_output($tidy);
			*/

		#
		# XML MODE /**/
			$xml = new DOMDocument('1.0','utf-8');
			$xml->preserveWhiteSpace 	= false;
			$xml->validateOnParse 		= $xml_validate;	// Default: true
			$xml->loadXML( $string );
			$xml->formatOutput 			= $xml_format_output; // Default: true
				#dump($xml, ' xml ++ '.to_string());

			$xml_string = $xml->saveXml();


		return $xml_string;

	}#end xml_object



}//end class
?>