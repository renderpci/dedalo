<?php
require_once(DEDALO_LIB_BASE_PATH . '/db/class.RecordObj_matrix.php');
require_once(DEDALO_ROOT . '/jer/class.Jerarquia.php');


# RecordObj_descriptors 
# Extiende RecordObj_matrix, cambiándole la tabla y algunos métodos específicos
# La tabla matrix_descriptors es similar a matrix pero el parent es VARCHAR(8) para soportar tipos like 'dd1' 

class RecordObj_descriptors extends RecordObj_matrix {

	# FIELDS EXTERNAL
	protected $mainLang;
	protected $unTranslated;

	public static $descriptors_matrix_table ; #= 'matrix_descriptors';

	# TABLE  matrix_table
	protected $matrix_table ;

	# CONSTRUCT
	# Normalmente llega: id=NULL, $terminoID, $lang
	function __construct($matrix_table=null, $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false) { 
		
		if(empty($matrix_table)) {
			if(SHOW_DEBUG)	dump($matrix_table,"id:$id - parent:$parent - tipo:$tipo - lang:$lang");
			throw new Exception("Error Processing Request. Matrix wrong name ", 1);			
		}

		if(SHOW_DEBUG) {
			if (!empty($parent) && strpos($parent, 'dd')===0) {
				throw new Exception("Error Processing Request. parent wrong tipo '$parent' use 'RecordObj_descriptors_dd' to manage this term", 1);
			}
		}

		# TABLE SET ALWAYS BEFORE CONSTRUCT RECORDATABOUNDOBJECT
		$this->matrix_table = $matrix_table;
				
		#dump($id,'$id',"id:$id, parent:$parent, lang:$lang, tipo:$tipo, fallback:$fallback");
		$this->unTranslated	= false;
		


		if ($id>0) {

			#dump($id,"called with: id:$id, parent:$parent, lang:$lang, tipo:$tipo, fallback:$fallback");

			# parent construct formato: ($matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)
			parent::__construct($matrix_table, $id, NULL, NULL, NULL);		#echo " $id, $parent, $tipo, $lang, $this <hr>";

		}else{
			#dump("","matrix_table:$matrix_table, id:$id, parent:$parent, lang:$lang, tipo:$tipo, fallback:$fallback");
			# SI NO RECIBE ID PERO RECIBE LANG, VERIFICA QUE EXISTE EL REGISTRO Y SI NO LO ENCUENTRA, 
			# PASA EL LENGUAJE PRINCIPAL DE LA JERARQUÍA PARA QUE SE USE EL DATO DEL REGISTRO PRINCIPAL EN SU LUGAR. 
			# AÑADE EL ESTILO PITUFO (unTranslated=TRUE)
			if($fallback===true && empty($id) && (!empty($lang)) ) {
				
				$arguments=array();
				$arguments['parent']	= $parent;								
				$arguments['tipo']		= $tipo;
				$arguments['lang']		= $lang;
				$arguments['sql_limit']	= 1;
				$matrix_table 			= $matrix_table;
				$RecordObj_matrix 		= new RecordObj_matrix($matrix_table);	#($id, $parent, $tipo, $lang)
				$ar_id					= $RecordObj_matrix->search($arguments);
					#dump($ar_id," AR_ID - arguments:".print_r($arguments,true));				
				
				if(empty($ar_id[0])) {
					$lang	= Jerarquia::get_mainLang($parent);
					$this->unTranslated	= true;	
				}else{
					$id 	= $ar_id[0];	# ya que tenemos el id, lo usamos para agilizar el siguiente paso.
				}					
			}


			# LANG . SI NO TENEMOS LANG, USAMOS EL LANG PRINCIPAL DE SU JERARQUIA
			if(empty($lang) && !empty($parent)) {
				$lang	= Jerarquia::get_mainLang($parent);
				if (empty($lang)) {
					$msg = "lang is unavaliable. Descriptor needs lang to show";
					if(SHOW_DEBUG===true) {
						$msg .= "<hr> Called ".__METHOD__." . Impossible calculate lang with 'Jerarquia::get_mainLang' from data received:";
						$msg .= "<br> 
						vars: <br>
						id: $id <br> 
						parent: $parent <br> 
						lang: $lang <br> 
						tipo: $tipo <br> 
						fallback: ".print_r($fallback,true);
						dump($this, __CLASS__);
					}
					throw new Exception("$msg", 1);
				}
			}
			$this->set_mainLang($lang);
			
			
			# CONSTRUCT . parent construct formato: ($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $this='matrix')
			parent::__construct($matrix_table, $id, $parent, $tipo, $lang);		#echo " id:$id, parent:$parent, tipo:$tipo, lang:$lang <hr>";
			
			
			/*
			* PARA ASEGURARNOS QUE UN REGISTRO NUEVO VACIO (SIN ID), GUARDA LOS DATOS IMPRESCINDIBLES, FIJAMOS CADA UNO DE ELLOS AL CONSTRUIR
				*/
				# PARENT . Si recibimos parent, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
				if (!empty($this->parent)) {
					$this->set_parent($this->parent);
				}
				# LANG . Si recibimos lang, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
				if (!empty($this->lang)) {
					$this->set_lang($this->lang);
				}
				# TIPO . Si recibimos lang, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
				if (!empty($this->tipo)) {
					$this->set_tipo($this->tipo);
				}

			
			# Forzamos el calculo del ID si es viable
			if( $id<1 && (!empty($parent) && !empty($lang)) ) {					
				$result = parent::calculate_ID();
				if(SHOW_DEBUG) {
					#dump($this," this");
					#dump($result," result from calculate id");
				}					
			}
			
		}		
		
	}


	public function get_mainLang() {
		return Jerarquia::get_mainLang($this->get_parent());
	}
	
	/**
	* GET_MATRIX_TABLE_FROM_TIPO : Static
	*/
	public static function get_matrix_table_from_tipo($tipo) {
		$prefix = substr($tipo, 0,2);		
		if($prefix=='dd') {
			return 'matrix_descriptors_dd';
		}else{
			if (!preg_match('/[a-z][a-z]/', $prefix)) {
				if(SHOW_DEBUG){
					#dump($tipo,'get_matrix_table_from_tipo tipo '."Prefix $prefix from tipo:$tipo is invalid");
				}
				throw new Exception("Error Processing Request. Prefix $prefix from tipo:$tipo is invalid", 1);			
			}
		}
		return 'matrix_descriptors';
	}
	
	/**
	* GET DATO OVERWRITE PARENT JSON GET DATO
	* In mtrix_descriptors, dato is not json
	* If current dato is untranslated, method decorator 'unTranslated' is applycated 
	* @return $dato String
	*/
	function get_dato($raw=false) {
		
		if ($raw) {
			return $this->dato;
		}

		if($this->blIsLoaded != true) $this->Load();
				
		$dato = $this->dato;		#dump($dato);

		# Untranslated case
		if($this->unTranslated	=== true) $dato = component_common::decore_untranslated($dato);

		return $dato;		
	}
	/**
	* SET DATO OVERWRITE PARENT JSON SET DATO
	* @param $dato String
	*/
	function set_dato($dato, $raw=false) {
 		
 		if ($raw) {
			$this->dato = $dato;
			$this->arModifiedRelations['dato'] = "1";
			return ;
		}

 		if(is_array($dato)) {
 			parent::set_dato($dato);
 		}else{
 			$this->dato = trim($dato);
 		}				
		$this->arModifiedRelations['dato'] = 1;
	}
	
	
	# TRANSLATIONS OF CURRENT
	public function get_ar_translations_of_current() {
		
		$tipo				= $this->get_tipo();
		$parent				= $this->get_parent();
		$lang 				= $this->get_lang();
		$ar_translations	= array();
		
		$arguments=array();		
		$arguments['parent']		= $parent;
		$arguments['tipo']			= $tipo;
		#$arguments['lang:not_like']	= $lang;		
		$ar_id				= $this->search($arguments);
			#dump($parent,'parent ',$this->matrix_table);
		
		if(count($ar_id)==0) return false;
		
		foreach($ar_id as $id) {
			
			$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($parent);	
			$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $id);			
			$current_lang			= $RecordObj_descriptors->get_lang();
				#dump($RecordObj_descriptors,'$current_lang '.$matrix_table);
			
			if($current_lang != $lang) {				
				$ar_translations[$id]	= $current_lang;
			}				
		}
		#dump($ar_translations,'$ar_translations '.$lang );
		#return array();

		return $ar_translations;	
	}

	# TERMINO EXISTS VERIFY
	public static function termino_exists($dato,$tipo) {
		
		$arguments=array();
		$arguments['dato']	= $dato;
		$arguments['parent']= $tipo;
		$arguments['tipo']	= 'termino';		
		$ar_id				= $this->search($arguments);
		
		if(count($ar_id)==0) return false;
		
		return true;	
	}

	# DELETE ALL DESCRIPTORS BY TIPO (PARENT)
	public static function delete_all_descriptors_by_tipo($tipo) {		
		
		$ar_id = self::get_all_descriptors_by_tipo( $tipo );

		$matrix_table	= RecordObj_descriptors::get_matrix_table_from_tipo($tipo);	

		# ELIMINAMOS TODOS LOS IDIOMAS
		if(count($ar_id)>0) foreach($ar_id as $id) {
			
			$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, $id);			#echo " delete_all_descriptors_by_tipo - $id <br>";
			$RecordObj_descriptors->MarkForDeletion();									
		}
						
		return true;
	}

	# GET_ALL_DESCRIPTORS_BY_TIPO
	public static function get_all_descriptors_by_tipo($tipo) {

		# Buscamos TODOS los descriptres cuyo parent es este tipo
		# Devuelve un array de id's
		$arguments['parent']	= $tipo;
		$matrix_table			= RecordObj_descriptors::get_matrix_table_from_tipo($tipo);	
		$RecordObj_descriptors	= new RecordObj_descriptors($matrix_table, NULL);
		$ar_id					= $RecordObj_descriptors->search($arguments);

		return $ar_id;
	}

	# GET_ALL_DESCRIPTORS_LANGS_BY_TIPO
	public static function get_all_descriptors_langs_by_tipo($tipo) {

		# Buscamos TODOS los descriptres cuyo parent es este tipo
		# Devuelve un array de lang
		$arguments['strPrimaryKeyName']	= 'lang';
		$arguments['parent']			= $tipo;
		$matrix_table					= RecordObj_descriptors::get_matrix_table_from_tipo($tipo);
		$RecordObj_descriptors			= new RecordObj_descriptors($matrix_table, NULL);
		$ar_lang						= $RecordObj_descriptors->search($arguments);

		return $ar_lang;
	}

	

	/**
	* SAVE
	* Sobreescribe RecordObj_matrix->Save
	* Verifica que los parámetros mínimos están fijados (id,parent,tipo,lang) y si todo es correcto
	* llama a la función principal en su clase padre (RecordObj_matrix)
	*/
	public function Save() {

		if (!$this->ID) {

			# PARENT . Si tenemos parent, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
			if (strlen($this->parent)) {
				$this->set_parent($this->parent);
			}
			# LANG . Si tenemos lang, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
			if (!empty($this->lang)) {
				$this->set_lang($this->lang);
			}
			# TIPO . Si tenemos tipo, lo asignamos para asegurarnos que queda reflejado en 'arModifiedRelations:protected' y se guardará
			if (!empty($this->tipo)) {
				$this->set_tipo($this->tipo);
			}			
		}

		if (!strlen($this->parent) || empty($this->lang) || empty($this->tipo)) {
			throw new Exception("Error Processing Request: An incomplete descriptor can not be saved", 1);				
		}		

		return parent::Save();
	}


	



	/**
	* DELETE_REL_LOCATOR_FROM_ALL_INDEXES
	* Busca las indexaciones en los descriptes que usan este 'rel_locator' y lo elimina de todos ellos guardando los datos actualizados
	* @param object $rel_locator
	* @param string $tipo like 'dd45'
	* @return array $ar_id (array of id matrix afected by this method)
	* @see trigger.tool_indexation mode 'delete_tag'
	*/
	public static function delete_rel_locator_from_all_indexes($rel_locator) {

		if (!is_object($rel_locator) || empty($rel_locator->component_tipo)) {
			if(SHOW_DEBUG) {
				dump($rel_locator, 'REL_LOCATOR');;
			}
			throw new Exception("Error Processing Request. Wrong rel_locator", 1);			
		}

		$arguments=array();		
		$arguments['dato:json_element']	= (string)json_handler::encode($rel_locator);
		$arguments['tipo']				= (string)'index';	
		$matrix_table					= (string)RecordObj_descriptors::get_matrix_table_from_tipo($rel_locator->component_tipo);
		$RecordObj_descriptors 			= new RecordObj_descriptors($matrix_table, NULL);		
		$ar_id							= (array)$RecordObj_descriptors->search($arguments);
			#dump($ar_id, ' ar_id '.print_r($arguments, true));	return;

		foreach ($ar_id as $id) {
			
			$RecordObj_descriptors  = new RecordObj_descriptors($matrix_table, $id);			
			$removed_index			= $RecordObj_descriptors->remove_index( (object)$rel_locator );
			if (!$removed_index) {
				trigger_error("Error en remove index ($id)");
				continue;
			}		
			if (!$RecordObj_descriptors->Save()) {				
			 	throw new Exception("Error Processing Request. Error saving RecordObj_descriptors ($matrix_table, $id)", 1);
			}			
		}

		return (array)$ar_id;

	}#end delete_rel_locator_from_all_indexes



	/**
	* REMOVE INDEX (By rel_locator)
	* Elimina uno de los 'rel_locator' del array de datos de este descriptor (NO LO GUARDA, sólo lo quita del array de 'dato')
	* y actualiza el dato (set_dato(updated))
	* @param object $rel_locator
	* @return bool 
	*/
	public function remove_index($rel_locator) {

		# get current dato in db
		$dato	= (string)$this->get_dato();
			#dump($dato,"dato 1");die();

		# Decode json string dato to array of objects
		$dato	= (array)json_handler::decode($dato);
			#dump($dato,"dato 2");die();

		$dato2 = array();

		foreach ($dato as $key => $value) {
			if ($value != $rel_locator){
			$dato2[] = $value;
			}
		}

		#dump($dato2, 'dato2');
		# Set updated dato as string again
		$this->set_dato( (string)json_handler::encode($dato2) );

		return true;

	}#end remove_index




}
?>