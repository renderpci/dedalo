<?php
/*
* CLASS COMPONENT TEXT AREA
*/


class component_text_area extends component_common {


	/**
	* SAVE OVERRIDE
	* Overwrite component_common method to set allways lang to config:DEDALO_DATA_NOLAN before save
	*/
	public function Save( $update_all_langs_tags_state=true ) {
		
		# revisamos las etiquetas para actualizar el estado de las mismas en los demás idiomas
		# para evitar un bucle infinito, en la orden 'Save' de las actualizaciones, pasaremos '$update_all_langs_tags_state=false'
		if ($update_all_langs_tags_state===true) {
			$this->update_all_langs_tags_state();
		}


		#dump($this->dato, "before");

		# Dato current assigned
		$dato_current 	= $this->dato;

		# Clean dato 
		$dato_clean 	= TR::limpiezaPOSTtr($dato_current);

		# Set dato again (cleaned)
		$this->dato 	= $dato_clean;

		#dump($this->dato,"after $this->dato");
		#dump($this);
		#die();

		# A partir de aquí, salvamos de forma estándar
		return parent::Save();
	}

	# OVERRIDE COMPONENT_COMMON METHOD
	public function get_ar_tools_obj() {
		# Add tool_indexation
		$this->ar_tools_name[] = 'tool_indexation';
		
		return parent::get_ar_tools_obj();
	}	
	

	/**
	* GET DATO 
	* Overwrite common_function
	*/
	public function get_dato() {

		$dato = parent::get_dato();				#dump($dato,'dato');
		$dato = TR::addTagImgOnTheFly($dato);	#dump($dato,'dato2');
		#$dato = self::decode_dato_html($dato);

		return $dato;
	}

	/**
	* GET DATO DEFAULT 
	* Overwrite common_function
	*/
	public function get_dato_default_lang() {

		$dato = parent::get_dato_default_lang();
		$dato = TR::addTagImgOnTheFly($dato);
		#$dato = self::decode_dato_html($dato);

		return $dato;
	}

	/**
	* GET VALOR
	* Overwrite common_function
	*/
	public function get_valor() {

			
		
		switch ($this->modo) {
			case 'dummy':
			case 'diffusion':
				#$dato = $this->get_dato();
				$dato = parent::get_dato();		
				break;
			
			default:

				$dato = parent::get_dato();	
				#dump($dato,'dato');

				$dato = TR::deleteMarks($dato, $deleteTC=true, $deleteIndex=true, $deleteIndex=true);
				$dato = self::decode_dato_html($dato);
				$dato = addslashes($dato);
					#dump($dato ,'$dato ');

				# Desactivo porque elimina el '<mar>'
				$dato = filter_var($dato, FILTER_UNSAFE_RAW );	# FILTER_SANITIZE_STRING
				break;
		}		

		return $dato;
	}
	

	/*
	* DECODE DATO HTML
	*/
	protected static function decode_dato_html($dato) {
		return htmlspecialchars_decode($dato);
	}



	/**
	* UPDATE ALL LANGS TAGS STATE 
	* Actualiza el estado de las etiquetas:
	* Revisa el texto completo, comparando fragmento a fragmento, y si detecta que algún fragmento ha cambiado
	* cambia sus etiquetas a estado 'r'
	* @return $ar_changed_tags (key by lang)
	*/
	protected function update_all_langs_tags_state() {

		$ar_changed_tags 	= array();
		$ar_changed_records = array();

		if (!$this->id) return $ar_changed_tags;

		# Previous dato
		# re-creamos este objeto para obtener el dato previo a las modificaciones		
		$previous_obj 		= new component_text_area($this->id, $this->tipo);
		$previous_raw_text	= $previous_obj->get_dato_real();
		
		# Current dato
		$current_text 		= $this->dato;
		# Clean current dato 
		$current_raw_text 	= TR::limpiezaPOSTtr($current_text);

		# Search tags
		$matches 		= $this->get_ar_relation_tags();
		$key 	 		= 0;		
			#dump(max($matches[$key]),'max($matches[$key])');		
		if (empty($matches[$key])) {
			return $ar_changed_tags ;
		}

		# Eliminamos duplicados (las etiquetas in/out se devuelven igual, como [index-n-1],[index-n-1])
		$ar_tags = array_unique($matches[$key]); 
			#dump($ar_tags,'ar_tags');

		# iterate all tags comparing fragments
		if(is_array($ar_tags)) foreach ($ar_tags as $tag) {			
			
			# Source fragment
			$source_fragment_text = component_text_area::get_fragment_text_from_tag( $tag, $previous_raw_text )[0];
			# Target fragment
			$target_fragment_text = component_text_area::get_fragment_text_from_tag( $tag, $current_raw_text )[0];

			if ($source_fragment_text != $target_fragment_text) {
				$ar_changed_tags[] = $tag;
			}
					
			#dump($source_fragment_text,'$source_fragment_text');
			#dump($target_fragment_text,'$target_fragment_text');
		}
		#dump($ar_changed_tags,'$ar_changed_tags');
		$ar_final['changed_tags']	= $ar_changed_tags;

		# Ya tenemos calculadas las etiquetas de los fragmentos que han cambiado		
		if (count($ar_changed_tags)==0) {
			# no hay etiquetas a cambiar
			$ar_final['changed_records'] = NULL;
		}else{
			# Recorremos los registros del resto de idiomas actualizando el estado de las etiquetas coincidentes a 'r' (para revisar)
			$arguments=array();
			$arguments['parent']	= $this->get_parent();
			$arguments['tipo']		= $this->get_tipo();			
			$matrix_table 			= common::get_matrix_table_from_tipo($this->get_tipo());		
			$RecordObj_matrix		= new RecordObj_matrix($matrix_table,NULL);
			$ar_result				= $RecordObj_matrix->search($arguments);

			foreach ($ar_result as $id_matrix) {
				
				$component_text_area= new component_text_area($id_matrix, $this->get_tipo() );
				$current_lang 		= $component_text_area->get_lang();
				if ($current_lang != $this->lang) {
					
					$text_raw 			= $component_text_area->get_dato_real();
					$text_raw_updated 	= self::change_tag_state( $ar_changed_tags, $state='r', $text_raw );
					$component_text_area->set_dato($text_raw_updated);	
						#dump($text_raw_updated,'$text_raw_updated',"for id: $id_matrix");
					$component_text_area->Save(false);	# Important: arg 'false' is mandatory for avoid infinite loop
					$ar_changed_records[] = $id_matrix;
				}
			}
			$ar_final['changed_records']= $ar_changed_records;			
		}		
		#dump($ar_final,'ar_final');

		return $ar_final;
	}

	/**
	* CHANGE TAG STATE
	* Cambia el estado de la etiqueta dada dentro del texto.
	* Ejemplo: [index-n-1] -> [index-r-1]
	* @param $ar_tag (formated as tag in, like [index-n-1]. Can be string or array)
	* @param $state (default 'r')
	* @param $text_raw
	* @return $text_raw_updated
	*/
	public static function change_tag_state( $ar_tag, $state='r', $text_raw ) {

		# Force array
		if (is_string($ar_tag)) $ar_tag = array($ar_tag);

		# Default no change text
		$text_raw_updated = $text_raw;		

		if(is_array($ar_tag)) foreach ($ar_tag as $tag) {

			#$pattern 			= TR::get_mark_pattern($mark='index');	# is: "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]"
			$id 				= TR::tag2value($tag);		#dump($tag,'tag');

			# patrón válido tanto para 'in' como para 'out' tags
			$pattern 			= "/(\[\/{0,1}index-)([a-z])(-$id\])/";
			# reemplazamos sólo la letra correspondiente al estado de la etiqueta
			$replacement		= "$1".$state."$3";
			$text_raw_updated 	= preg_replace($pattern, $replacement, $text_raw);
		}		

		return $text_raw_updated ;
	}

	/**
	* DELETE TAG FROM TEXT
	*
	* @param $ar_tag (formated as tag in, like [index-n-1]. Can be string or array)	
	* @param $text_raw
	* @return $text_raw_updated
	*/
	public static function delete_tag_from_text($ar_tag, $text_raw) {

		# Force array
		if (is_string($ar_tag)) $ar_tag = array($ar_tag);

		if(is_array($ar_tag)) foreach ($ar_tag as $tag) {

			#$pattern 			= TR::get_mark_pattern($mark='index');	# is: "\[\/{0,1}(index)-([a-z])-([0-9]{1,6})\]"
			$id 				= TR::tag2value($tag);		#dump($tag,'tag');

			# patrón válido tanto para 'in' como para 'out' tags
			$pattern 			= "/(\[\/{0,1}index-[a-z]-$id\])/";
			# reemplazamos la etiqueta por un string vacío
			$replacement		= "";
			$text_raw_updated 	= preg_replace($pattern, $replacement, $text_raw);
		}		

		return $text_raw_updated ;
	}


	/**
	* GET AR REALATION TAGS
	* Buscamos apariciones del patron de etiqueta indexIn (definido en class TR)
	* @return $matches Array()
	* Devuelve un array con todas las apariciones, del tipo: 'indexIn' formateadas
	* Like:
	*/
	/*
	pattern: /([index-([a-z])-([0-9]{1,6})])/ 
	result :
	[0] => Array
        (
            [0] => [index-n-5]
            [1] => [index-n-4]
            [2] => [index-n-3]
        )
    [1] => Array
        (
            [0] => [index-n-5]
            [1] => [index-n-4]
            [2] => [index-n-3]
        )
    [2] => Array
        (
            [0] => n
            [1] => n
            [2] => n
        )
    [3] => Array
        (
            [0] => 5
            [1] => 4
            [2] => 3
        )
	*/
	public function get_ar_relation_tags() {

		# Cogemos los datos raw de la base de datos
		$dato = $this->get_dato_real();

		if (empty($dato))
			return NULL;

		$matches = NULL;				

		# Buscamos apariciones del patron de etiqueta indexIn (definido en class TR)
		$pattern = TR::get_mark_pattern($mark='indexIn',$standalone=true);

		# Search math patern tags
		preg_match_all($pattern,  $dato,  $matches, PREG_PATTERN_ORDER);
			#dump($matches,'$matches',"matches to patern: $pattern");

		return $matches;
	}

	/**
	* GET LAST TAG REL ID
	* @return Int max tag id value
	*/
	public function get_last_tag_index_id() {

		$matches = $this->get_ar_relation_tags();
		$key 	 = 3;		
			#dump(max($matches[$key]),'max($matches[$key])');
		
		if (empty($matches[$key])) {
			return intval(0);
		}else{
			return intval(max($matches[$key]));	
		}
	}


	/**
	* GET FRAGMENT TEXT FROM TAG
	* @param $tag (String like '[index-n-5]' or '[/index-n-5]' or [index-r-5]...)
	* @return $fragment_text (String like 'texto englobado por las etiquetas xxx a /xxx')
	*/
	public static function get_fragment_text_from_tag( $tag, $raw_text ) {
		
		$id 	= TR::tag2value($tag);		#dump($tag,'tag');
		$type 	= TR::tag2type($tag);		#dump($type);		

		# la etiqueta no está bien formada
		if(empty($id) || empty($type)) {
			$msg = "Warning: tag $tag is not valid!";
			trigger_error($msg);
			return NULL;
		}

		# El estado nos es indiferente
		$state = '[a-z]';

		# Build in and out tags			
		$tag_in  	= '\['.$type.'-'.$state.'-'.$id.'\]';	
		$tag_out 	= '\[\/'.$type.'-'.$state.'-'.$id.'\]';

		# Build in/out regex pattern to search
		$regexp = $tag_in ."(.*)". $tag_out;
			#dump($regexp,'regexp',"regexp for $tag : $regexp");		

		# Search fragment_text
			# Dato raw from matrix db				
			$dato = $raw_text ;	#parent::get_dato();

			#if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER) ) {
			if( preg_match_all("/$regexp/", $dato, $matches, PREG_SET_ORDER|PREG_OFFSET_CAPTURE) ) {
				#dump($matches,'$matches');
			    foreach($matches as $match) {
			        #dump($match,'$match',"regexp: $regexp for id:$id");
			        if (isset($match[1][0])) {

			        	$fragment_text = $match[1][0];	#dump($fragment_text,'$fragment_text',"regexp: $regexp for id:$id");#

			        	# Clean fragment_text
			        	$fragment_text = TR::deleteMarks($fragment_text, $deleteTC=true, $deleteIndex=true);
			        	$fragment_text = self::decode_dato_html($fragment_text);


			        	# tag in position
			        	$tag_in_pos = $match[0][1];

			        	# tag out position
			        	$tag_out_pos = $tag_in_pos + strlen($match[0][0]);

			        	return array( $fragment_text, $tag_in_pos, $tag_out_pos );
			        }
			    }
			}

		return NULL;
	}
	

	/**
	* GET FRAGMENT TEXT FROM REL LOCATOR
	* Despeja el tag a partir de rel_locator y llama a component_text_area::get_fragment_text_from_tag($tag, $raw_text)
	* para devolver el fragmento buscado
	* Ojo : Se puede llamar a un fragmento, tanto desde un locator de relación cómo desde uno de indexación.
	* @param $rel_locator (String like '125.dd114.1')
	* @return $fragment
	* @see static component_text_area::get_fragment_text_from_tag($tag, $raw_text)
	* Usado por section_list/rows/rows.php para mostrar el fragmento en los listados
	*/
	public static function get_fragment_text_from_rel_locator( $rel_locator ) {
		
		#dump($rel_locator,'$rel_locator');
		
		# INDEXATION TAG
		if ( preg_match("/dd.{1,32}\.[0-9]{1,32}\.[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
			$tag_obj = component_common::get_locator_as_obj($rel_locator);		
		}
		# RELATION TAG
		else if ( preg_match("/[0-9]{1,32}\.dd.{1,32}\.[0-9]{1,32}/", $rel_locator) ) {
			$tag_obj = component_common::get_locator_relation_as_obj($rel_locator);
		}		
		# INVALID LOCATOR
		else{
			$msg = "rel_locator $rel_locator is not valid!";
			#trigger_error($msg);
			throw new Exception("Error Processing Request : $msg", 1);			
			return NULL;
		}
		

		# rel_locator format: parent.component_tipo.tag_id => dd12.520.1021.dd404.1
		$section_id_matrix 		= $tag_obj->section_id_matrix;
		$component_tipo			= $tag_obj->component_tipo;
		$tag_id					= $tag_obj->tag_id;

		# state : le pasamos 'n' por defecto, pero es indistinto para encontrar el fragmento
		$state 			= 'n';

		$tag 			= '[index-' . $state . '-' . $tag_id.']';
			#dump($tag,'tag',"from rel_locator: $rel_locator");

		$component_text_area= new component_text_area($id=NULL, $tipo=$component_tipo, $modo=NULL, $parent=$section_id_matrix, DEDALO_DATA_LANG);
		$raw_text 			= $component_text_area->get_dato_real();

		return component_text_area::get_fragment_text_from_tag($tag, $raw_text);
		/*
		$fragment_text 		= component_text_area::get_fragment_text_from_tag($tag, $raw_text)[0];

		return $fragment_text;
		*/
	}


	




	/**
	* DELETE_TAG_FROM_ALL_LANGS
	* Busca los registros del parent actual y lo elimina de todos ellos la etiqueta recibida guardando los datos actualizados
	*
	*/
	public function delete_tag_from_all_langs($tag, $tipo) {

		$ar_records_changed = array();

		$tipo 	= $this->get_tipo();
		$parent = $this->get_parent();

		
		$arguments=array();
		$arguments['parent']	= $parent;
		$arguments['tipo']		= $tipo;		
		$matrix_table 			= common::get_matrix_table_from_tipo($tipo);
		$RecordObj_matrix 		= new RecordObj_matrix($matrix_table,NULL);	
		$ar_id					= $RecordObj_matrix->search($arguments);

		if(is_array($ar_id)) foreach ($ar_id as $id) {
			
			$component_text_area 	= new component_text_area($id, $tipo);
			$text_raw 				= $component_text_area->get_dato_real();
			$text_raw_updated 		= self::delete_tag_from_text($tag, $text_raw);
			$component_text_area->set_dato($text_raw_updated);
			$component_text_area->Save();

			$ar_records_changed[] = $id;
		}
		return $ar_records_changed;
	}


	
	/**
	* GET_DIFFUSION_OBJ
	*/
	public function get_diffusion_obj( $propiedades ) {
		#dump($propiedades,'$propiedades');
		$diffusion_obj = parent::get_diffusion_obj( $propiedades );
		/*
		$diffusion_obj->component_name		= get_class($this);
		$diffusion_obj->parent 				= $this->get_parent();
		$diffusion_obj->tipo 				= $this->get_tipo();
		$diffusion_obj->lang 				= $this->get_lang();
		$diffusion_obj->label 				= $this->get_label();		
		$diffusion_obj->columns['valor']	= $this->get_valor();
		*/

		if(isset($propiedades['rel_locator'])) {

			$rel_locator_obj= $propiedades['rel_locator'];
			$rel_locator 	= component_common::build_locator_from_obj( $rel_locator_obj );
			$fragment_info	= component_text_area::get_fragment_text_from_rel_locator( $rel_locator );
			$texto 			= $this->get_dato_real();

			# FRAGMENT
			$diffusion_obj->columns['fragment']	= $fragment_info[0];

			# RELATED
			$current_related_tipo 	= RecordObj_ts::get_ar_terminoID_by_modelo_name_and_relation($rel_locator_obj->component_tipo, $modelo_name='component_', $relation_type='termino_relacionado');

			# No related term is present
			if(empty($current_related_tipo[0])) return $diffusion_obj;

			$current_related_tipo = $current_related_tipo[0];
			$related_modelo_name  = RecordObj_ts::get_modelo_name_by_tipo($current_related_tipo);

			switch ($related_modelo_name) {

				case 'component_av':

					# TC
					$tag_in_pos  	= $fragment_info[1];
					$tag_out_pos 	= $fragment_info[2];
					$tc_in 		 	= OptimizeTC::optimize_tcIN($texto, $tag_in_pos);
					$tc_out 	 	= OptimizeTC::optimize_tcOUT($texto, $tag_out_pos);
						#dump($tc_in ,'$tc_in ');
					$tcin_secs		= OptimizeTC::TC2seg($tc_in);
			        $tcout_secs		= OptimizeTC::TC2seg($tc_out);
			        $duracion_secs	= $tcout_secs - $tcin_secs;
			        $duracion_tc	= OptimizeTC::seg2tc($duracion_secs);

			        $diffusion_obj->columns['related']		= $related_modelo_name;
			        $diffusion_obj->columns['tc_in']		= $tc_in;
			        $diffusion_obj->columns['tc_out']		= $tc_out;
			        $diffusion_obj->columns['duracion_tc']	= $duracion_tc;
					
					$component_av   = new component_av(NULL, $current_related_tipo, 'edit', $this->get_parent() );
					$video_id 		= $component_av->get_video_id();

					$diffusion_obj->columns['video_id']	= $video_id;
			        #$diffusion_obj->columns['video_url']	= $duracion_tc;

					break;

				case 'component_image':

					break;

				case 'component_geolocation':
					
					break;

				default:
					throw new Exception("Error Processing Request. Current related $related_modelo_name is not valid. Please configure textarea for this media ", 1);					
			}
			#dump($diffusion_obj,'$diffusion_obj');
		}
		
		
		return $diffusion_obj;
	}


	
};
?>