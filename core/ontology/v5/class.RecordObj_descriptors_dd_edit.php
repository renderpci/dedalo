<?php
// declare(strict_types=1);
# RecordObj_descriptors_dd_edit
# Extiende RecordObj_matrix, cambiándole la tabla y algunos métodos específicos
# La tabla matrix_descriptors es similar a matrix pero el parent es VARCHAR(8) para soportar tipos like 'dd1'

class RecordObj_descriptors_dd_edit extends RecordObj_matrix {



	# FIELDS EXTERNAL
	protected $matrix_table;
	protected $mainLang;
	protected $unTranslated;



	# TABLE  matrix_table
	public static $descriptors_matrix_table	= 'matrix_descriptors_dd';
	public static $descriptors_mainLang		= 'lg-spa';



	/**
	* CONSTRUCT
	* Normalmente llega: id=NULL, $terminoID, $lang
	*/
	function __construct(string $matrix_table='matrix_descriptors_dd', $id=NULL, $parent=NULL, $lang=NULL, $tipo='termino', $fallback=false) {

		if ($lang==='lg-vlca') {
			$lang='lg-cat';
		}

		// debug
			if(SHOW_DEBUG===true) {
				if(empty($matrix_table) || $matrix_table!='matrix_descriptors_dd') {
					dump($matrix_table,"id:$id - parent:$parent - tipo:$tipo - lang:$lang");
					dump(debug_backtrace(),"Error: Only matrix_descriptors_dd is accepted by now ");
					throw new Exception("Error Processing Request. Matrix wrong name ", 1);
				}
				#if ( !empty($parent) && !(bool)verify_dedalo_prefix_tipos($parent)) {
				#	throw new Exception("Error Processing Request. parent wrong tipo '$parent' ", 1);
				#}
				if ($fallback!==false) {
					#trigger_error("Fallback is true for $parent ");
				}
			}

		// fix vars
			$this->unTranslated	= false;
			$this->matrix_table	= self::$descriptors_matrix_table;
			$this->mainLang		= self::$descriptors_mainLang;

		if ($id>0) {

			#dump($id,"called with: id:$id, parent:$parent, lang:$lang, tipo:$tipo, fallback:$fallback");

			# parent construct formato: ($matrix_table=null, $id=NULL, $parent=NULL, $tipo=NULL, $lang=NULL)
			parent::__construct(self::$descriptors_matrix_table, $id, NULL, NULL, NULL);		#echo " $id, $parent, $tipo, $lang, $this <hr>";

		}else{

			#dump("","matrix_table:self::$descriptors_matrix_table, id:$id, parent:$parent, lang:$lang, tipo:$tipo, fallback:$fallback");
			# SI NO RECIBE ID PERO RECIBE LANG, VERIFICA QUE EXISTE EL REGISTRO Y SI NO LO ENCUENTRA,
			# PASA EL LENGUAJE PRINCIPAL DE LA JERARQUÍA PARA QUE SE USE EL DATO DEL REGISTRO PRINCIPAL EN SU LUGAR.
			# AÑADE EL ESTILO PITUFO (unTranslated=TRUE)
			if($fallback===true && empty($id) && (!empty($lang)) ) {

				$arguments = [
					'parent'	=> $parent,
					'tipo'		=> $tipo,
					'lang'		=> $lang
				];
				// $arguments['sql_limit']	= 1; // remoevd to optimize sql cache
				// string $matrix_table=null, int $id=null, string $parent=null, string $tipo=null, string $lang=null
				$RecordObj_matrix	= new RecordObj_matrix(self::$descriptors_matrix_table);
				$ar_id				= $RecordObj_matrix->search($arguments);

				if(empty($ar_id[0])) {
					$lang	= self::$descriptors_mainLang;
					$this->unTranslated	= true;
				}else{
					$id	= $ar_id[0];	# ya que tenemos el id, lo usamos para agilizar el siguiente paso.
				}
			}

			# LANG . SI NO TENEMOS LANG, USAMOS EL LANG PRINCIPAL DE SU JERARQUIA
			if(empty($lang)) {
				$lang = self::$descriptors_mainLang;
			}

			# CONSTRUCT . parent construct formato: ($id=NULL, $parent=false, $tipo=false, $lang=DEDALO_DATA_LANG, $this='matrix')
			parent::__construct($matrix_table, (int)$id, $parent, $tipo, $lang);		#echo " id:$id, parent:$parent, tipo:$tipo, lang:$lang <hr>";


			/*
			* PARA ASEGURARNOS QUE UN REGISTRO NUEVO VACIO (SIN ID), GUARDA LOS DATOS IMPRESCINDIBLES, SETEAMOS CADA UNO DE ELLOS AL CONSTRUIR
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


			# Forzamos el cálculo del ID si es viable
			if( $id<1 && (!empty($parent) && !empty($lang)) )
			parent::calculate_ID();
		}
	}//end __construct



	/**
	* GET DATO OVERWRITE PARENT JSON GET DATO
	* In mtrix_descriptors, dato is not json
	* If current dato is untranslated, method decorator 'unTranslated' is apply
	* @return $dato String
	*/
	function get_dato(bool $raw=false) : string {

		if ($raw) {
			return $this->dato;
		}

		if($this->blIsLoaded !== true) $this->Load();

		$dato = $this->dato;		#dump($dato);

		# Untranslated case
		if($this->unTranslated	=== true) $dato = component_common::decore_untranslated($dato);

		return (string)$dato;
	}//end __construct



	/**
	* SET DATO OVERWRITE PARENT JSON SET DATO
	* @param $dato String
	*/
	function set_dato($dato, bool $raw=false) {

 		if ($raw===true) {
			$this->dato = $dato;
			$this->arModifiedRelations['dato'] = 1;
			return ;
		}

 		if(is_array($dato)) {
 			parent::set_dato($dato);
 		}else{
 			$this->dato = trim($dato);
 		}
		$this->arModifiedRelations['dato'] = 1;
	}//end set_dato



	/**
	* TRANSLATIONS OF CURRENT
	*/
	public function get_ar_translations_of_current() : array {

		$tipo				= $this->get_tipo();
		$parent				= $this->get_parent();
		$lang 				= $this->get_lang();
		$ar_translations	= array();

		$arguments=array();
		$arguments['parent']	= $parent;
		$arguments['tipo']		= $tipo;
		$ar_id					= (array)$this->search($arguments);

		if(count($ar_id)===0) return false;

		foreach($ar_id as $id) {

			$RecordObj_descriptors_dd_edit	= new RecordObj_descriptors_dd_edit(self::$descriptors_matrix_table, $id);
			$current_lang				= $RecordObj_descriptors_dd_edit->get_lang();

			if($current_lang!==$lang) {
				$ar_translations[$id] = $current_lang;
			}
		}

		return $ar_translations;
	}//end get_ar_translations_of_current



	/**
	* TERMINO EXISTS VERIFY
	*/
	public static function termino_exists($dato, string $tipo) : bool {

		$RecordObj_descriptors_dd_edit = new RecordObj_descriptors_dd_edit(self::$descriptors_matrix_table, $tipo);

		$arguments=array();
		$arguments['dato']	= $dato;
		$arguments['parent']= $tipo;
		$arguments['tipo']	= 'termino';
		$ar_id				= $RecordObj_descriptors_dd_edit->search($arguments);

		if(count($ar_id)===0) return false;

		return true;
	}//end termino_exists



	/**
	* DELETE ALL DESCRIPTORS BY TIPO (PARENT)
	*/
	public static function delete_all_descriptors_by_tipo(string $tipo) : bool {

		$ar_id = self::get_all_descriptors_by_tipo( $tipo );

		# ELIMINAMOS TODOS LOS IDIOMAS
		if(count($ar_id)>0) foreach($ar_id as $id) {

			$RecordObj_descriptors_dd_edit	= new RecordObj_descriptors_dd_edit(self::$descriptors_matrix_table, $id);			#echo " delete_all_descriptors_by_tipo - $id <br>";
			$RecordObj_descriptors_dd_edit->MarkForDeletion();
		}

		return true;
	}//end delete_all_descriptors_by_tipo



	/**
	* GET_ALL_DESCRIPTORS_BY_TIPO
	*/
	public static function get_all_descriptors_by_tipo(string $tipo) : array {

		# Buscamos TODOS los descriptres cuyo parent es este tipo
		# Devuelve un array de id's
		$arguments['parent']		= $tipo;
		$RecordObj_descriptors_dd_edit	= new RecordObj_descriptors_dd_edit(self::$descriptors_matrix_table, NULL);
		$ar_id						= $RecordObj_descriptors_dd_edit->search($arguments);

		return $ar_id;
	}//end get_all_descriptors_by_tipo



	/**
	* GET_ALL_DESCRIPTORS_LANGS_BY_TIPO
	*/
	public static function get_all_descriptors_langs_by_tipo(string $tipo) : array {

		# Buscamos TODOS los descriptres cuyo parent es este tipo
		# Devuelve un array de lang
		$arguments['strPrimaryKeyName']	= 'lang';
		$arguments['parent']			= $tipo;
		$RecordObj_descriptors_dd_edit		= new RecordObj_descriptors_dd_edit(self::$descriptors_matrix_table, NULL);
		$ar_lang						= $RecordObj_descriptors_dd_edit->search($arguments);

		return $ar_lang;
	}//end get_all_descriptors_langs_by_tipo



	/**
	* SAVE
	* Sobreescribe RecordObj_matrix->Save
	* Verifica que los parámetros mínimos están fijados (id,parent,tipo,lang) y si todo es correcto
	* llama a la función principal en su clase padre (RecordObj_matrix)
	* @return int|null $id
	*/
	public function Save() : ?int {

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
	}//end Save



	/**
	* REMOVE INDEX (By rel_locator)
	* Elimina uno de los 'rel_locator' del array de datos de este descriptor (NO LO GUARDA, solo lo quita del array de 'dato')
	* @param $rel_locator
	*/
		// public function remove_index__DEPRECATED($rel_locator) {

		// 	# get current dato in db
		// 	$dato 					= $this->get_dato();
		// 		#dump($dato,"dato 1");

		// 	# Decode json string dato to array
		// 	$dato  					= (array)json_handler::decode($dato);
		// 		#dump($dato,"dato 2");

		// 	# mix array current dato - rel_locator relation string like (1253.0.0)
		// 	$new_ar_dato 			= component_relation::remove_relation_to_dato($rel_locator,$dato);

		// 	# set new array dato and save record in matrix
		// 	$this->set_dato($new_ar_dato);
		// }//end remove_index



}//end class RecordObj_descriptors_dd_edit
