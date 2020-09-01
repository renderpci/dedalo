<?php
require_once( DEDALO_CONFIG_PATH .'/config.php');

/*
* CLASE DD BASADA EN TESAURO V3
*/
require_once(DEDALO_CORE_PATH . '/dd/class.dd_elements.php');
#require_once(DEDALO_ROOT.'/jer/class.RecordObj_jer_tipos.php');


class dd extends dd_elements {

	protected $modo ;								# modo
	protected $valid_modes ;						# valid modes

	protected $tabla ;								# Tabla actual
	protected $prefijo ;							# Se fija a la vez que $tabla

	protected $arrayTablas ;						# tablas de jerarquias activas
	protected $jer_nombre  ;						# Se fija a la vez que $tabla
	protected $jer_tipo  ;							# jer_tipo
	protected $jer_tipoText ; 						# jer_tipo text
	protected static $tabla_jerarquia ;				# nombre tabla jerarquia
	protected static $tabla_jerarquia_tipos ;		# nombre tabla jerarquia tipo

	protected $esmodelo ;							# modelo
	protected $noDescripor ;						# noDescripor (termino no descritor hayado al verificar si el termonoId es descriptor o no en terminoID2descriptorID($terminoID))
	protected $terminoIDactual ;					# terminoID actual. Lo fijaremos pra luego comparar en casos como terminoID2descriptorID($terminoID))
	protected $ts_lang ;							# current lang for resolve termino and def
	protected $type ;								# type
	protected static $valid_types ;					# valid types



	# Constructor
	function __construct($modo='tesauro_list', $type='all', $ts_lang=false ) {

		#self::$tabla_jerarquia			= 'jerarquia';
		#self::$tabla_jerarquia_tipos	= 'jerarquia_tipos';

		$this->tabla			= 'jer_dd';
		#$this->prefijo			= 'dd';
		$this->jer_nombre		= false;
		$this->jer_tipo			= false;
		$this->jer_tipoText		= 'Estructura';
		$this->esmodelo			= 'no';
		$this->noDescripor		= false;
		$this->terminoIDactual	= false;

		$this->set_mode($modo);
		$this->set_type($type);
		$this->set_ts_lang($ts_lang);
		#$this->set_arrayTablas();

		/*
		# Si hay modelo definido en sesión, filtramos por el valor "esmodelo"
		#if($_SESSION['esmodelo']=='si' || $_SESSION['esmodelo']=='no') $this->set_esmodelo($_SESSION['esmodelo']);#print "esmodelo: ".$this->esmodelo ;
		if($this->modo=='modelo') $this->esmodelo = 'si';
		*/
	}

	protected function set_mode($modo) {
		$this->valid_modes = array('tesauro_list','tesauro_edit','modelo_edit','tesauro_rel');
		if( !in_array($modo, $this->valid_modes) ) die(__METHOD__." DD Tesauro Error: mode not valid! [<b>$mode</b>] <br> Use a valid mode to access.");

		# set value "esmodelo" for filter when build tree
		if($modo==='modelo_edit') {
			$this->esmodelo = 'si';
		}else{
			$this->esmodelo = 'no';
		}
		$this->modo = $modo ;
	}
	protected function set_type($type) {
		$this->type = $type;
	}
	protected function set_ts_lang($ts_lang) {
		$this->ts_lang = $ts_lang;
	}
	public function get_TablaActual() {
		return $this->tabla ;
	}
	public function get_Prefijo() {
		return $this->prefijo ;
	}
	protected function set_esmodelo($esmodelo) {
		$this->esmodelo = $esmodelo;
	}


	# TABLAS jerarquia ACTIVAS. Creamos el array de las jerarquias activas
	# Devuelve prefijo:$arrayTablas['prefix'] y nombre tabla:$arrayTablas['tabla'];
	#
	public function get_arrayTablas() {

		return array(
				#"prefijo" 	=> array('dd'),
				"tabla" 	=> array('jer_dd'),
				"nombre" 	=> array('Dedalo'),
				"tipo" 		=> array(5),
				"tipoText" 	=> array('Estructura')
				);
		/*
		if(isset($this->arrayTablas)) return $this->arrayTablas;

		$filtro 		= false ;
		$arrayTablas 	= array();
		$filtro 		= "";

		$idString		= RecordObj_jer_tipos::order_by_tipo_sql_string(); # sql string for ordenate later

		# buscamos los datos de cada una
		$arguments['activa']	= 'si';
		$arguments['sql_code']	= '';
		$arguments['sql_code']	.= $filtro;
		#$arguments['sql_code']	.= "ORDER BY field(tipo, $idString), nombre ASC";

		$RecordObj_jer			= new RecordObj_jer(NULL);
		$ar_id					= $RecordObj_jer->search($arguments);
			#dump($ar_id,'$ar_id');

		if(count($ar_id)>0) foreach($ar_id as $id) {

			$RecordObj_jer				= new RecordObj_jer($id);
				#dump($RecordObj_jer,'$RecordObj_jer');

			$alpha2						= strtolower($RecordObj_jer->get_alpha2());
			$nombre						= $RecordObj_jer->get_nombre();
			$tabla						= "jer_{$alpha2}";
			$tipo						= $RecordObj_jer->get_tipo();

			# tipo text . nombre del jer tipo
			$RecordObj_jer_tipos 		= new RecordObj_jer_tipos($tipo);
			$tipoText 					= $RecordObj_jer_tipos->get_nombre();
				#dump($tipoText,"tipo: $tipo");

			$arrayTablas['prefijo'][]	= $alpha2 ;
			$arrayTablas['tabla'][]		= $tabla ;
			$arrayTablas['nombre'][]	= $nombre ;
			$arrayTablas['tipo'][]		= $tipo ;
			$arrayTablas['tipoText'][]	= $tipoText ;
		}

		#$this->arrayTablas = $arrayTablas ;
			#dump($arrayTablas,'arrayTablas'); #die();

		return $arrayTablas ;
		*/
	}








	/**********************************************************************
	*	UTILIDADES. MÉTODOS VARIOS
	***********************************************************************/

	/*
	* Número de indexaciones .
	* Se usa para verificar que no se usa en indexaciones antes de permitir borrar el descriptor
	*/
	public static function get_ar_indexations($terminoID) {

		$ar_indexations = array();

		$arguments=array();
		$arguments['strPrimaryKeyName']	= 'dato';
		$arguments['parent']			= $terminoID;
		$arguments['tipo']				= 'index';
		$matrix_table					= RecordObj_descriptors_dd::$descriptors_matrix_table;
		$RecordObj_descriptors_dd		= new RecordObj_descriptors_dd($matrix_table, NULL);
		$ar_records						= $RecordObj_descriptors_dd->search($arguments);
			#dump($ar_records,'terminoID '.$terminoID);

		if(count($ar_records)===1) {

			$dato = $ar_records[0];

			# Dato es un array en formato JSON. No obstante demomento RecordObj_descriptors_dd no convierte automáticamente
			# desde JSON. Lo haremos aquí de forma específica
			$dato = json_handler::decode($dato);
				#dump($dato,'dato');

			$ar_indexations = $dato;
		}
		return $ar_indexations;
	}

	/*
	* Despeja parent a partir del terminoID actual
	*/
	public static function terminoID2parent($terminoID) {

		if(strlen($terminoID)>2) {
			$RecordObj_dd	= new RecordObj_dd($terminoID);
			return $RecordObj_dd->get_parent();
		}
		return false ;
	}








	# PREFIJO FIX 2 STATIC VERSION
	public static function prefijoFix2($terminoID, $terminoID2) {

		# prefijo válido
		$prefijo	= RecordObj_dd::get_prefix_from_tipo($terminoID);
		$prefijo2	= RecordObj_dd::get_prefix_from_tipo($terminoID2);

		# verificamos si terminoID2 tiene prefijo
		$pattern	= "/[a-z][a-z]/i";
		$subject	= $terminoID2 ;
		$havePrefix = preg_match($pattern, $subject);

		if(!$havePrefix) {

			# si NO tiene prefijo, le añadimos el válido actual
			$terminoID2 = $prefijo . $terminoID2 ;

		}else if($prefijo2 && ($prefijo2 !=  $prefijo)) {

			# si SI tiene prefijo y es distinto al actual, está mal y lo cambiamos
			$terminoID2 = $prefijo . substr($terminoID2,2);
		}
		return $terminoID2 ;
	}




	/*
	* esmodeloHeredado . Verificamos si este término es modelo
	*/
	protected static function esmodeloCurrent($terminoID) {
		$RecordObj_dd	= new RecordObj_dd($terminoID);
		$esmodelo		= $RecordObj_dd->get_esmodelo();
		return $esmodelo ;
	}

	/*
	* esdescriptorCurrent . Verificamos si este término es descriptor
	*/
	protected static function esdescriptorCurrent($terminoID) {
		$RecordObj_dd	= new RecordObj_dd($terminoID);
		$esdescriptor	= $RecordObj_dd->get_esdescriptor();
		return $esdescriptor ;
	}









	/**************************************************************************************************************************************
	*
	* ++++++ BUILDTREE ++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
	*
	* BuildTree : Construye el arbol completo del tesauro a partir del padre (puede ser 0)
	* parentInicial es el terminoID a partir del cual construimos. si estamos en el primer nivel, será 0.
	* nivel de momento no se usa (se ha hecho prescindible pero se mantiene por compatibilidad)
	* terminoIDActual es el terminoID en el que estamos. Se usa para resaltar el término en búsqueda o para hacer recursiones
	* terminoIDresalte se usa para resaltar el término en las búsuqedas (es un listado -pueden ser varios- y se cotejan todos sus ids con el terminoDiactual)
	* header (activa o no la inclusión de la barra superior)
	***************************************************************************************************************************************/
	public function buildTree($parentInicial, $terminoIDActual, $terminoIDresalte, $header='no') {

		$html = '' ;			#print("parentInicial:$parentInicial, terminoIDActual:$terminoIDActual, terminoIDresalte:$terminoIDresalte, header:$header, esmodelo:$esmodelo ");die();

		$RecordObj_dd			= new RecordObj_dd($parentInicial);
		$ar_childrens_of_this	= $RecordObj_dd->get_ar_childrens_of_this($esdecriptor='si', $this->esmodelo, 'norden ASC, id');
			#dump($ar_childrens_of_this,'ar_childrens_of_this');	#die();

		# header listado
		if($header==='si') {
			$html .= $this->headerListJer();
			#dump($this->headerListJer(),'$this->headerListJer()');
		}

		# orden virtual: se reinicia para cada parent
		$nordenV = 0 ;

		if(count($ar_childrens_of_this)>0) foreach($ar_childrens_of_this as $terminoID) {

			#if (!$this->terminoDeTipoCorrecto($terminoID)) {
			#	continue;
			#}

				$RecordObj_dd	= new RecordObj_dd($terminoID);

				$termino 		= RecordObj_dd::get_termino_by_tipo($terminoID,$this->ts_lang);		#echo $termino ;#if($this->ts_lang) $termino	= "[$this->ts_lang] ".$termino;
				$def 			= RecordObj_dd::get_def_by_tipo($terminoID,$this->ts_lang);			#if($this->ts_lang) $def 	= "[$this->ts_lang] ".$def;
				$obs			= RecordObj_dd::get_obs_by_tipo($terminoID,$this->ts_lang);

				$parent			= $RecordObj_dd->get_parent();
				$modelo			= $RecordObj_dd->get_modelo();
				#$usableIndex	= $RecordObj_dd->get_usableIndex();
				$norden			= $RecordObj_dd->get_norden();
				$traducible		= $RecordObj_dd->get_traducible();
				$propiedades	= $RecordObj_dd->get_propiedades();
				$properties		= $RecordObj_dd->get_properties();
				$RecordObj_dd2	= new RecordObj_dd($terminoID);
				#$hijosND		= count($RecordObj_dd2->get_ar_childrens_of_this('no'));
				$hijosND 		= 0;#$this->HNoDescriptores($terminoID);
				$hijosD			= $RecordObj_dd->get_n_hijos_descriptores();
				$children		= $RecordObj_dd->get_n_hijos();
				$ncaptaciones	= 0;#$RecordObj_dd->get_n_captaciones();
				$nIndexaciones	= 0;#count(self::get_ar_indexations($terminoID));


				# orden virtual
				$nordenV ++ ;

				# Resalte
				$resalte = false ;
				$terminoIDresalteArray = explode(',',$terminoIDresalte) ;
				if(is_array($terminoIDresalteArray)) foreach($terminoIDresalteArray as $terminoIDlistActual ) {
					if($terminoIDlistActual===$terminoID) $resalte = 1 ;
				}

				# margen izquierdo
				if($parent === 'dd0'){
					$marginLeft = 0 ;
					$display = "display:block" ;
				}else{
					$marginLeft = 50 ;
					$display = "display:block" ;
				}

				#$html .= "\n\n\n<!-- DIV LINEA TESAURO ICONOS Y TÉRMINO $terminoID ---------------------------------------------------------------- -->";
				$html .= "<div id=\"divCont$terminoID\" class=\"divCont\" style=\"padding-left:$marginLeft" . "px;$display\">";

					# generamos la linea con los iconos, etc..
					$html .= $this->makeTSline($terminoID,$termino,$parent,$children,$def,$obs,$hijosD,$hijosND,$nIndexaciones,$ncaptaciones,$nordenV,$resalte,$modelo,$propiedades,$properties,$traducible,$norden);

					# recursive
					if( $children >0 ) {

						$terminoIDActual = $terminoID ;
						# contenedor ajax para carga los hijos
						#$html .= "\n<!-- CONTENEDOR AJAX TESAURO -->";
						$html .= "<div id=\"div_$terminoID\" style=\"display:none;clear:left;\">";

						$modo = false ;
						if($modo==="buildTreeFull") {
							#$this->buildTree($terminoID, $nivel+1, $terminoIDActual, $terminoIDresalte);
							$this->buildTree($terminoID, $terminoIDActual, $terminoIDresalte, $modo);
						}

						#$html .= "</div><!-- // div_$terminoID --> ";
						$html .= '</div>';
					}

				#$html .= "</div><!-- //divCont$terminoID  -->\n";
				$html .= '</div>';


		} #while ($row_RS = mysql_fetch_assoc($RS)); mysql_free_result($RS);


		return $html ;

	}#fin function buildTree






	/*
	* Crea la cabecera del listado.
	* En modo normal (visualización y edición del tesauro) muestra el botón de añadir tesauro.
	* En modo indexación, muestra un rótulo de selección de término
	*/
	public function headerListJer()	{

		global $terminos_title ;
		global $seleccione_el_descriptor ;
		global $toponimos_title ;
		global $anyadir_title ;
		global $termino_title ;
		global $jerarquia_title ;

		$html = false ;

		if($this->modo==='modelo_edit') {
			$add_class	= 'tsHeader_modelo' ;
		}else{
			$add_class 	= '';
		}

		$html .= "<div class=\"tsHeader  $add_class\">";

	        $html .= "<div class=\"tsHeaderLeft\">";
	        $html .= ucfirst($this->jer_tipoText) ; 	#return("jer_tipoText: ". $this->jer_tipoText );
			#RecordObj_jer::get_nombre_by_id()
			#$html .= ' ['.ucfirst($this->nombre).']' ;

			$parent0 = (string)$this->prefijo.'0';

			if($this->modo==='tesauro_rel')
			{
				# caso indexación
				$html .= " [ $seleccione_el_descriptor ] ";
			} else {
				# caso general
				$html .= dd_elements::renderBtnMas($parent0,null,null);	# renderBtnMas($terminoID, $hijosD, $parent)
				$html .= "<div id=\"divCont{$parent0}\"></div>";
			}
			$html .= "</div>";

			#$html .= "\n<div class=\"divContToponimos\"> </div>";

			#$nToponimos = $this->nTerminosTotalTabla();
        	#$html .= "<span id=\"tsHeaderRight\"> $terminos_title: $nToponimos </span>";
        $html .= "</div><!-- /tsHeader -->";

		return $html ;
	}//end headerListJer



	/**
	* EXISTEESTETERMINO : verifica si existe el término dado
	*/
	function existeEsteTermino($termino,$terminoID)	{

		$exists		= RecordObj_decriptors::termino_exists($termino,$terminoID);
		if($exists) {
			global 	$el_termino_ya_existe_title ;
			$html	= "<div class=\"error\"> $el_termino_ya_existe_title: <b>$termino</b> </div>";
		}else{
			$html 	= false;
		}
		return $html;
	}





	/*****************************************************************************
	* SEARCH FORM . Busca en los descriptores
	* Devuelve un string secuencia de números tipo ts536,ts635,ts895,es965
	*****************************************************************************/
	function searchTSform($terminoID, $termino, $def, $type, $modelo=NULL) {

		if(SHOW_DEBUG===true) $start_time = start_time();

		/*
		$arguments = array();

		$arguments['strPrimaryKeyName'] = 'parent';

		if(!empty($terminoID)) {
			$arguments['parent'] 		= $terminoID;
		}

		if(!empty($termino)) {
			$arguments['tipo'] 			= 'termino';
			$arguments['dato:begins'] 	= $termino;
		}

		if(!empty($def)) {
			$arguments['tipo'] 			= 'def';
			$arguments['dato:begins'] 	= $def;
		}

		if(!empty($this->ts_lang)) {
			$arguments['lang']			= $this->ts_lang;
		}


		#$arguments['group_by']			= 'parent';
		#$arguments['lang']				= DEDALO_DATA_LANG;
		$arguments['sql_limit']			= 150;
		$arguments['order_by_asc']		= 'id';

		# Structure
		$matrix_table 				= 'matrix_descriptors_dd';
		$RecordObj_descriptors_dd	= new RecordObj_descriptors_dd($matrix_table, NULL);
		$ar_result					= (array)$RecordObj_descriptors_dd->search($arguments);
			#dump($arguments," arguments"); dump($ar_result	,'$ar_result - ' .$terminoID);
			#error_log( "searchTSform: ". to_string($arguments) );
		*/
				#
				# DIRECT SQL SEARCH
				$strQuery='';
				if(!empty($terminoID)) {
					$strQuery .= " AND matrix_descriptors_dd.parent = '$terminoID'";
				}

				if(!empty($termino)) {
					$strQuery .= " AND matrix_descriptors_dd.tipo = 'termino'";
					$strQuery .= " AND matrix_descriptors_dd.dato ILIKE '%".$termino."'";
				}

				if(!empty($def)) {
					$strQuery .= " AND matrix_descriptors_dd.tipo = 'def'";
					$strQuery .= " AND matrix_descriptors_dd.dato ILIKE '%".$def."'";
				}

				if(!empty($this->ts_lang)) {
					$strQuery .= " AND matrix_descriptors_dd.lang = '".$this->ts_lang."'";
				}

				if(!empty($modelo)) {
					$strQuery .= " AND jer_dd.modelo = '$modelo'";
				}

				$strQuery = '-- '.__METHOD__ ."
				SELECT matrix_descriptors_dd.parent
				FROM matrix_descriptors_dd
				LEFT JOIN jer_dd ON matrix_descriptors_dd.parent = jer_dd.\"terminoID\"
				WHERE
				matrix_descriptors_dd.id IS NOT NULL
				$strQuery
				ORDER BY matrix_descriptors_dd.id ASC
				LIMIT 300
				";
				#dump($strQuery,'strQuery');#die();
				$result = pg_query(DBi::_getConnection(), $strQuery);	# or die("Cannot (1) execute query: $strQuery <br>\n". pg_last_error());

				if (!$result) {
					trigger_error("Error on DB query");
					if(SHOW_DEBUG===true) {
						throw new Exception("Error Processing Request . ".pg_last_error(), 1);
					}
				}
				$ar_result=array();
				while ($rows = pg_fetch_assoc($result)) {
					$ar_result[] = $rows['parent'];
				}


		$ar_result = array_unique($ar_result);
			#dump($ar_result, ' ar_result'); die();

		$result=array();
		if(count($ar_result)===0) {

			$result['list'] = "" ;

		}else{

			$i		= 0;
			$matriz = false;

			foreach($ar_result as $terminoID) {

				# exclude terms that not are from current type (see config DEDALO_PREFIX_TIPOS)
				$terminoDeTipoCorrecto	= $this->terminoDeTipoCorrecto($terminoID);
					#dump($terminoDeTipoCorrecto, ' terminoDeTipoCorrecto - terminoID:'.$terminoID);

				if($terminoDeTipoCorrecto) {
					/*
					# avoid include modelo and no descriptors in result list
					# filter results ( esmodelo = 'no' AND esdescriptor = 'si' )
					$esmodelo		= $this->esmodeloCurrent($terminoID);
					$esdescriptor	= $this->esdescriptorCurrent($terminoID);

					# dependiendo desde donde busquemos, quermos un tipo u otro
					$emodelo_valido = 'no';
					if(isset($this->modo) && $this->modo!='' ){
						if($this->modo=='tesauro_edit')	$emodelo_valido = 'no';
						if($this->modo=='modelo_edit' )	$emodelo_valido = 'si';
					}
					#print("$terminoID - esmodelo:$esmodelo - modelo_valido:$emodelo_valido <br>" );

					if($esmodelo==$emodelo_valido && $esdescriptor=='si') {
					*/
						# Con objeto de posicionar antes los de nivel mas cercano a 0 , creamos un nivel virtual en función de los hijos que tenga cada uno
						$nivel 					= $this->nivelVirtual($terminoID);

						$matriz['terminoID'][$i]= $terminoID ;		#echo " $terminoID <br>";
						$matriz['nivel'][$i] 	= $nivel ;
						$i++;
					/*}*/
				}
			}


			/*
			echo "<pre>";
			print_r($matriz);
			echo "</pre>";
			die();
			*/
			$counter	= (int)0 ;
			$max 		= (int)250 ;
			$list		= (bool)false;

			if(is_array($matriz['nivel'])) {

				# ordenamos el array en función del nivel (ascendente)
				sort($matriz['nivel']); #print_r($matriz['terminoID']); print_r($matriz['nivel']); die();

				# Desgloasamos el array en una secuencia de números
				$list = (string)'';
				foreach($matriz['nivel'] as $key => $val) {

					$nivel 		= $val ;
					$terminoID 	= $matriz['terminoID'][$key];//die("nivel: $nivel - key: $key - terminoID: $terminoID "  );

					$counter++ ;
					if($counter<=$max)
					{
						$list .= $terminoID . ',' ;
					}
				}
			}

			$result['total']	= $counter ;
			$result['list']		= substr($list,0,-1);
			$result['max']		= $max ;

			#dump($result, ' result');	die();
		}

		#if(SHOW_DEBUG===true) error_log( exec_time($start_time, __METHOD__, $result) );

		return (array)$result ; #(este resultado será: terminoIDlist)

	}# fin searchTSform



	protected function terminoDeTipoCorrecto($terminoID) {
		return (bool)verify_dedalo_prefix_tipos($terminoID);

		/*
		$DEDALO_PREFIX_TIPOS = unserialize(DEDALO_PREFIX_TIPOS);

		if (empty($terminoID) || strlen($terminoID)<2) {
			return false;
		}
		foreach ($DEDALO_PREFIX_TIPOS as $current_prefix) {
			if ( strpos($terminoID, $current_prefix)===0 ) {
				return true;
			}
		}
		return false;*/
	}


	#
	# Secuencia de resultados para la cookie
	# Crea un string con el path hasta el hijo que toca, tipo ts8,ts25,ts86..
	#
	function listaDeResultados2cookie($terminoIDlist) {

		$resultStringList = false ;

		# Recogemos el string terminoIDlist devuelto por la búsqueda y lo convertimos en un array
		$listArray = explode(",", $terminoIDlist);

		# lo recorremos generando el listado de padres (ordenado adecuadamente) para después abrir los divs correspondientes en el resultado
		if(is_array($listArray)) {

			foreach($listArray as $key => $terminoIDActual) {

				#echo "$terminoIDActual <br>";

				if($terminoIDActual) {
					# Para cada término hallado en la búsqueda, crearemos el path completo de padres hasta llegar a el
					# array de padres ordenados hacia arriba
					#$matriz = $this->padresArray($terminoIDActual);

					$RecordObj_dd	= new RecordObj_dd($terminoIDActual);
					$matriz 		= $RecordObj_dd->get_ar_parents_of_this();		#print_r($matriz); die();

					if(is_array($matriz) && count($matriz)>0)
					{
						# ordenamos a la inversa los padres
						#krsort($matriz);

						# creamos el string
						foreach( $matriz as $nOrden => $terminoID) {
							$resultStringList .= "$terminoID,";
						}
					}#if(is_array($matriz))

					/*
					# Para cada término hallado en la búsqueda, crearemos el path completo de padres hasta llegar a el
					$list .= $this->searchTSlist($terminoIDActual);
					$list .= ",";
					*/
				}
			}# enf foreach


			# eliminamos la última coma y devolvemos la lista en string tipo: 345,543,34,784,432
			$resultStringList = substr($resultStringList,0,-1); #print("terminoIDlist: $terminoIDlist - resultList: ".$resultList);
			$resultStringList = self::optimize_listaDeResultados2cookie($resultStringList);
		}

		return $resultStringList ;

	}# fin listaDeResultados2cookie


	#
	# Optimiza la lista de paths eliminando los redundantes de 2º,3º... aparición
	#
	protected static function optimize_listaDeResultados2cookie($resultStringList) {

		$result 	= false ;
		$list		= false ;

		# convertimos en array el string
		$listArray = explode(",", $resultStringList);

		if(is_array($listArray)) {

			# eliminamos los dupliicados del array
			$listArray = array_unique($listArray);

			# lo recorremos regenerando el string
			foreach($listArray as $key => $terminoID) {
				$list .= "$terminoID,";
			}

			$result = substr($list,0,-1); #print("OPT: $list <hr>");die();

		}else{ die(__METHOD__."Error: optimize_listaDeResultados2cookie "); };

		return $result ;
	}



	#
	# nivelVirtual. Creamos un nivel virtual en función de cuantos padres tiene este termino
	#
	private function nivelVirtual($terminoID) {

		$nivel = 0 ;

		$parent 		= dd::terminoID2parent($terminoID);
		$parent_zero	= RecordObj_dd::get_prefix_from_tipo($terminoID).'0';
		$prefijo		= RecordObj_dd::get_prefix_from_tipo($terminoID);

		if( $parent===$parent_zero || $parent===$prefijo || $parent==='') {

			$nivel = 1 ;

		}else{

			$RecordObj_dd		= new RecordObj_dd($terminoID);
			$ar_parents_of_this	= $RecordObj_dd->get_ar_parents_of_this();

			if(is_array($ar_parents_of_this))	$nivel = count($ar_parents_of_this);
		}
		return $nivel ;

	}# fin nivelVirtual










	/*
	* Despeja tabla en función del prefijo del terminoID
	* Despejamos la tabla actual y fijamos en la variable privada $tabla y el prefijo validado en la variable privada $prefijo
	* Devuelve la tabla validada
	*/
	public function terminoID2tablaFix__DEPRECATED($terminoID=false) {
		return 'jer_dd';
	}

	/*
	* Verifica que el prefijo está bién formado y es correcto (Evita errores de ts25 por tp25...)
	* Si no se pasa prefijo o no corresponde con el actual fijado, lo cambia por el actual fijado en $this-prefijo
	*/
	public function prefijoFix__DEPRECATED($terminoID) {

		$result = false ;

		$prefijo = self::get_prefix_from_tipo($terminoID); #die("prefijo: $prefijo");

		if($prefijo===$this->prefijo) {
			# ok
			$result = $terminoID ;

		}else{
			# repair

			$havePrefix = true;
			preg_match("/\D+/", $terminoID, $output_array);
			if (empty($output_array[0])) {
				$havePrefix = false;
			}


			if(!$havePrefix)
			{
				# si NO tiene prefijo, le añadimos el de la tabla actual
				$terminoIDfix = $this->prefijo . $terminoID ;

			}else{

				# si SI tiene prefijo distinto al actual, está mal y lo cambiamos
				$leng_current_prefix = strlen($output_array[0]);
				$terminoIDfix = $this->prefijo . substr($terminoID, $leng_current_prefix);
			}

			$result = $terminoIDfix ;
		}

		return $result;
	}

	# TERMINOID 2 PREFIX
	public static function terminoID2prefix__DEPRECATED($terminoID) {
		if( is_array($terminoID) || !is_string($terminoID) ) throw new Exception("Error Processing Request.  Error: terminoID is not string: terminoID:$terminoID ", 1);
		return 'dd';
	}

	# PREFIJO COMPARE
	public static function prefijo_compare__DEPRECATED($terminoID, $terminoID2) {

		$prefijo	= RecordObj_dd::get_prefix_from_tipo($terminoID);
		$prefijo2	= RecordObj_dd::get_prefix_from_tipo($terminoID2);

		if (!empty($prefijo) && $prefijo===$prefijo2) {
			return true;
		}

		return false;
	}


};// class
?>
